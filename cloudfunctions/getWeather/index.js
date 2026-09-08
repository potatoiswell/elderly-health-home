// 云函数 getWeather
// 用途：按经纬度（或默认城市）调用和风天气 now + 3d 接口，生成出行建议，
// 并把结果缓存到 weather_cache（30 分钟有效）。
// 新版和风天气要求：
//   1. 使用控制台分配的专属 API Host（如下 QWEATHER_HOST）
//   2. 通过请求头 X-QW-Api-Key 传 Key
//   3. 响应默认 gzip，代码内已做解压
const https = require('https')
const zlib = require('zlib')
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const BUILTIN_QWEATHER_KEY = ''
const BUILTIN_HOST = ''
// 环境变量可覆盖（可选）：QWEATHER_HOST / QWEATHER_KEY
const QWEATHER_KEY = process.env.QWEATHER_KEY || BUILTIN_QWEATHER_KEY
const HOST = process.env.QWEATHER_HOST || BUILTIN_HOST

const DEFAULT_LOC = { lat: 39.9042, lon: 116.4074, name: '北京（默认）' }

function qLocation(loc) {
  return loc.lon + ',' + loc.lat
}

function httpGetJson(path) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: HOST,
        path,
        headers: {
          'X-QW-Api-Key': QWEATHER_KEY,
          'User-Agent': 'elderly-health-miniprogram/1.0'
        }
      },
      (res) => {
        const chunks = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => {
          const buffer = Buffer.concat(chunks)
          const finish = (text) => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(text) })
            } catch (e) {
              reject(new Error('天气接口返回非JSON：' + String(text).slice(0, 160)))
            }
          }
          // 和风天气无论是否声明 Accept-Encoding 都会返回 gzip，必须解压
          const encoding = String(res.headers['content-encoding'] || '').toLowerCase()
          if (encoding.indexOf('gzip') >= 0) {
            zlib.gunzip(buffer, (err, out) => {
              if (err) return reject(new Error('gzip 解压失败'))
              finish(out.toString('utf8'))
            })
          } else {
            finish(buffer.toString('utf8'))
          }
        })
      }
    )
    req.setTimeout(8000, () => req.destroy(new Error('天气接口请求超时')))
    req.on('error', reject)
  })
}

async function fetchWeather(loc) {
  const base = '/v7/weather/'
  const locStr = qLocation(loc)
  const [nowResp, dailyResp] = await Promise.all([
    httpGetJson(base + 'now?location=' + locStr),
    httpGetJson(base + '3d?location=' + locStr)
  ])

  if (nowResp.body && nowResp.body.code !== '200') {
    const code = nowResp.body.code
    if (code === '401' || code === '403') throw new Error('和风天气 Key/Host 无效，请检查配置')
    throw new Error('和风天气实时接口错误 code=' + code)
  }
  if (dailyResp.body && dailyResp.body.code !== '200') {
    throw new Error('和风天气预报接口错误 code=' + dailyResp.body.code)
  }

  const now = nowResp.body.now
  const dailyList = dailyResp.body.daily || []
  const today = dailyList[0] || {}

  return { now, today, todayList: dailyList.slice(0, 3) }
}

function makeAdvice(now, today) {
  const temp = Number(now.temp)
  const maxT = Number(today.tempMax || now.temp)
  const minT = Number(today.tempMin || now.temp)
  const pop = Number(today.pop || 0)
  const textDay = String(today.textDay || '')
  const windScale = Number(now.windScale || 0)

  if (textDay.indexOf('雷') >= 0) return '今天有雷雨，请尽量待在室内，注意安全'
  if (textDay.indexOf('雪') >= 0 || textDay.indexOf('冰') >= 0) return '今天有雨雪，路面湿滑，尽量不出门，注意保暖'
  if (temp <= 5 || minT <= 0) return '天气寒冷，注意保暖，出门多穿衣物、戴好帽子'
  if (temp >= 33 || maxT >= 35) return '天气炎热，注意防暑，建议早晚外出并多喝水'
  if (pop >= 30 || textDay.indexOf('雨') >= 0) return '今天可能下雨，外出记得带伞，路滑慢行'
  if (windScale >= 5) return '今天风较大，出门注意防风，远离广告牌'
  if (temp >= 16 && temp <= 26) return '天气舒适，适合外出散步，注意补水'
  return '天气一般，外出请根据体感适当增减衣物'
}

function todayDateKey() {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  return d.toISOString().slice(0, 10)
}

exports.main = async (event) => {
  let loc = DEFAULT_LOC
  if (event.latitude && event.longitude) {
    loc = {
      lat: Math.round(Number(event.latitude) * 100) / 100,
      lon: Math.round(Number(event.longitude) * 100) / 100,
      name: '当前位置'
    }
  }

  if (!QWEATHER_KEY || !HOST) {
    return { success: false, message: '未配置和风天气 Key/Host' }
  }

  const dateKey = todayDateKey()
  const cacheKey = loc.lat + '_' + loc.lon + '_' + dateKey
  const force = !!event.force

  try {
    if (!force) {
      const cached = await db.collection('weather_cache').where({ cacheKey }).limit(1).get()
      const doc = cached.data[0]
      if (doc && doc.weather) {
        const age = doc.createTime ? Date.now() - new Date(doc.createTime).getTime() : Infinity
        if (age < 30 * 60 * 1000) {
          return Object.assign({ source: 'cache' }, doc.weather)
        }
      }
    }

    const data = await fetchWeather(loc)
    const advice = makeAdvice(data.now, data.today)
    const payload = {
      success: true,
      source: 'live',
      locationName: loc.name,
      advice,
      weather: {
        temp: data.now.temp,
        text: data.now.text,
        code: data.now.icon,
        tempMax: data.today.tempMax || '',
        tempMin: data.today.tempMin || ''
      }
    }

    const cached = await db.collection('weather_cache').where({ cacheKey }).limit(1).get()
    if (cached.data[0]) {
      await db.collection('weather_cache').doc(cached.data[0]._id).update({
        data: { weather: payload, advice, createTime: db.serverDate() }
      })
    } else {
      await db.collection('weather_cache').add({
        data: {
          cacheKey,
          locationName: loc.name,
          weather: payload,
          date: dateKey,
          createTime: db.serverDate()
        }
      })
    }
    return payload
  } catch (e) {
    console.error('获取天气失败', e)
    return { success: false, message: '天气获取失败：' + (e.message || e) }
  }
}
