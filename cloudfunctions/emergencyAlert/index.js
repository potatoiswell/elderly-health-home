// 云函数 emergencyAlert
// 用途：首页“我摔倒了”触发后，把求救记录写入 emergency_logs，
// 并给已绑定子女（users.familyOpenid）发送紧急提醒。
// 模板字段（已按你实际模板配置）：
//   求助类型 thing8 / 时间 time4 / 地址 thing3 /
//   联系人电话 phone_number6 / 姓名 thing1
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const BUILTIN_TEMPLATE_ID = 'C65L-f-s8U6NZC4lzFDbqj2bFa5jFkjrCUA6N2YnS-4'
const TEMPLATE_ID = process.env.EMERGENCY_TEMPLATE_ID || BUILTIN_TEMPLATE_ID
const MSG_STATE = process.env.MSG_STATE || 'formal'

function clip(s, len) {
  return String(s || '').slice(0, len)
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { success: false, message: '未获取到用户身份' }

  const latitude = Number(event.latitude) || 0
  const longitude = Number(event.longitude) || 0
  const locText = latitude && longitude
    ? '经度' + longitude.toFixed(4) + '，纬度' + latitude.toFixed(4)
    : '位置获取失败，请尽快电话联系'
  const dateKey = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)

  try {
    const userRes = await db.collection('users').where({ openid: OPENID }).limit(1).get()
    const user = userRes.data[0] || null
    const familyOpenid = user && user.familyOpenid ? user.familyOpenid : ''
    const name = user && user.name ? user.name : '家中老人'
    const phone = user && user.emergencyPhone ? String(user.emergencyPhone).trim() : ''

    let sendSuccess = false
    let sendError = ''
    const canSend = familyOpenid && TEMPLATE_ID && phone
    if (canSend) {
      try {
        await cloud.openapi.subscribeMessage.send({
          touser: familyOpenid,
          templateId: TEMPLATE_ID,
          page: 'pages/family/family',
          miniprogramState: MSG_STATE,
          data: {
            thing8: { value: '跌倒紧急呼救' },
            time4: { value: new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(11, 16) },
            thing3: { value: clip(locText, 20) },
            phone_number6: { value: phone.slice(0, 20) },
            thing1: { value: clip(name, 20) }
          }
        })
        sendSuccess = true
      } catch (e) {
        sendError = String(e.errMsg || e.message || e)
        console.warn('紧急提醒发送失败', sendError)
      }
    } else if (!phone) {
      sendError = '未填写紧急联系人电话，无法发送紧急模板'
    } else if (!familyOpenid) {
      sendError = '未绑定子女'
    }

    const doc = {
      openid: OPENID,
      date: dateKey,
      latitude,
      longitude,
      locationText: locText,
      source: 'manual_fall',
      familyOpenid,
      sendSuccess,
      sendError: sendError.slice(0, 300),
      status: familyOpenid ? (sendSuccess ? 'notified' : 'notify_failed') : 'no_family',
      createTime: db.serverDate()
    }
    const addRes = await db.collection('emergency_logs').add({ data: doc })

    return {
      success: true,
      logId: addRes._id,
      familyBound: !!familyOpenid,
      sendSuccess,
      status: doc.status,
      message: sendSuccess
        ? '已通知子女并保存求救记录'
        : (familyOpenid ? '已保存求救记录，但通知未送达，请立即电话联系家人' : '未绑定子女，已保存求救记录，请立即电话联系家人')
    }
  } catch (e) {
    console.error('紧急呼救云函数失败', e)
    return { success: false, message: '求救记录保存失败：' + (e.message || e) }
  }
}
