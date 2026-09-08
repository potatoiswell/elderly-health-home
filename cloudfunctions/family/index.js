// 云函数 family —— 子女辅助模式
// action:
//   bind    : 子女输入 6 位绑定码，把本人 openid 写入老人 users.familyOpenid
//   summary : 返回老人档案 + 各模块最近数据（只读汇总，供子女端查看）
//   unbind  : 解除绑定
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function ensureUser(openid) {
  const res = await db.collection('users').where({ openid }).limit(1).get()
  if (res.data[0]) return res.data[0]
  const data = {
    openid,
    name: '',
    age: null,
    history: '',
    allergy: '',
    emergencyName: '',
    emergencyPhone: '',
    familyBindCode: String(Math.floor(100000 + Math.random() * 900000)),
    familyOpenid: '',
    createTime: db.serverDate(),
    updateTime: db.serverDate()
  }
  const add = await db.collection('users').add({ data })
  return Object.assign({ _id: add._id }, data)
}

async function findParentByChild(childOpenid) {
  const res = await db.collection('users').where({ familyOpenid: childOpenid }).limit(1).get()
  return res.data[0] || null
}

// 按 createTime 降序排序（时间字段可能为服务端 Date）
function sortByTime(list) {
  return (list || []).sort((a, b) => {
    const ta = a.createTime ? new Date(a.createTime).getTime() : 0
    const tb = b.createTime ? new Date(b.createTime).getTime() : 0
    return tb - ta
  })
}

async function fetchRecent(name, extra, limit) {
  try {
    const r = await db.collection(name)
      .where(Object.assign({ openid: extra.openid }, extra.filter || {}))
      .limit(100)
      .get()
    return sortByTime(r.data || []).slice(0, limit || 5)
  } catch (e) {
    return []
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { success: false, message: '未获取到用户身份' }
  const action = event.action || ''

  try {
    // 确保子女（当前使用者）也有自己的 users 档案
    const child = await ensureUser(OPENID)

    if (action === 'bind') {
      const code = String(event.code || '').trim()
      if (!/^\d{6}$/.test(code)) {
        return { success: false, message: '请输入 6 位数字绑定码' }
      }
      const found = await db.collection('users').where({ familyBindCode: code }).limit(5).get()
      // 找到“未绑定且不是自己”的老人
      const isDemo = !!event.demo
      const parent = (found.data || []).find((u) => u.openid !== OPENID && !u.familyOpenid) ||
        (isDemo ? (found.data || []).find((u) => u.openid === OPENID) : null)
      if (!parent) {
        return { success: false, message: '绑定码不正确，或该老人已绑定其他子女' }
      }

      await db.collection('users').doc(parent._id).update({
        data: { familyOpenid: OPENID, updateTime: db.serverDate() }
      })
      await db.collection('users').doc(child._id).update({
        data: { familyParentOpenid: parent.openid, updateTime: db.serverDate() }
      })
      return { success: true, message: '绑定成功', parentName: parent.name || '' }
    }

    if (action === 'summary') {
      const parent = await findParentByChild(OPENID)
      if (!parent) {
        return { success: false, code: 'NOT_BOUND', message: '尚未绑定老人，请先输入老人的 6 位绑定码' }
      }

      const nowIso = new Date(Date.now() + 8 * 3600 * 1000).toISOString()
      const today = nowIso.slice(0, 10)
      const todayHM = nowIso.slice(11, 16)

      // 今日用药与服药状态
      const [meds, logs] = await Promise.all([
        db.collection('medicines').where({ openid: parent.openid }).limit(100).get(),
        db.collection('medicine_logs').where({ openid: parent.openid, date: today }).limit(200).get()
      ])
      const medList = sortByTime(meds.data || []).sort((a, b) =>
        String(a.time || '').localeCompare(String(b.time || ''))
      )
      const logMap = {}
      ;(logs.data || []).forEach((l) => { if (!logMap[l.medicineId]) logMap[l.medicineId] = l })
      const medicineSummary = medList.map((m) => {
        const log = logMap[m._id]
        let status = 'pending'
        if (log && log.status === 'taken') status = 'taken'
        else if (log && log.status === 'reminded') status = 'missed'
        else if (String(m.time || '').localeCompare(todayHM) <= 0) status = 'missed'
        return {
          name: m.name,
          time: m.time,
          dosage: m.dosage,
          status,
          takenTime: log ? log.takenTime || '' : ''
        }
      })

      const [bpList, sugarList, meals, visits, emergencyList] = await Promise.all([
        fetchRecent('bp_records', { openid: parent.openid, filter: { type: 'bp' } }, 5),
        fetchRecent('bp_records', { openid: parent.openid, filter: { type: 'sugar' } }, 5),
        fetchRecent('meals', { openid: parent.openid, filter: {} }, 5),
        fetchRecent('medical_visits', { openid: parent.openid, filter: {} }, 5),
        fetchRecent('emergency_logs', { openid: parent.openid, filter: {} }, 3)
      ])

      return {
        success: true,
        parent: {
          name: parent.name || '',
          age: parent.age,
          history: parent.history || '',
          allergy: parent.allergy || '',
          emergencyName: parent.emergencyName || '',
          emergencyPhone: parent.emergencyPhone || ''
        },
        medicineSummary,
        bpList,
        sugarList,
        meals,
        visits,
        emergencyList
      }
    }

    if (action === 'unbind') {
      const parent = await findParentByChild(OPENID)
      if (parent) {
        await db.collection('users').doc(parent._id).update({
          data: { familyOpenid: '', updateTime: db.serverDate() }
        })
      }
      await db.collection('users').doc(child._id).update({
        data: { familyParentOpenid: '', updateTime: db.serverDate() }
      })
      return { success: true, message: '已解除绑定' }
    }

    return { success: false, message: '未知操作' }
  } catch (e) {
    console.error('family 云函数执行失败', e)
    return { success: false, message: '云函数执行失败：' + (e.message || e) }
  }
}
