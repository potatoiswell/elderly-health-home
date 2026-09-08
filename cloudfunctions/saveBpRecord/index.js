// 云函数 saveBpRecord
// 用途：健康记录页保存“血压/血糖”，在服务端校验并写入 bp_records 集合。
// bp_records 字段：openid, type(bp/sugar), date, sbp, dbp, sugar, heartRate, note, createTime
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { success: false, message: '未获取到用户身份' }

  const type = event.type === 'sugar' ? 'sugar' : 'bp'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(event.date || '')) ? String(event.date) : null
  if (!date) return { success: false, message: '日期格式不正确' }

  const heartRate = event.heartRate ? Number(event.heartRate) : null
  if (heartRate !== null && (heartRate < 30 || heartRate > 220)) {
    return { success: false, message: '心率范围应为 30-220' }
  }

  // 按类型校验核心数值
  if (type === 'bp') {
    const sbp = Number(event.sbp)
    const dbp = Number(event.dbp)
    if (!sbp || sbp < 60 || sbp > 260 || !dbp || dbp < 40 || dbp > 200) {
      return { success: false, message: '血压数值超出合理范围' }
    }
    if (sbp <= dbp) return { success: false, message: '收缩压应高于舒张压' }
  } else {
    const sugar = Number(event.sugar)
    if (!sugar || sugar < 1 || sugar > 40) {
      return { success: false, message: '血糖数值超出合理范围' }
    }
  }

  try {
    const doc = {
      openid: OPENID,
      type,
      date,
      sbp: type === 'bp' ? Number(event.sbp) : null,
      dbp: type === 'bp' ? Number(event.dbp) : null,
      sugar: type === 'sugar' ? Number(event.sugar) : null,
      heartRate,
      note: String(event.note || '').slice(0, 200),
      createTime: db.serverDate()
    }
    const addRes = await db.collection('bp_records').add({ data: doc })
    return { success: true, recordId: addRes._id, message: '保存成功' }
  } catch (e) {
    console.error('保存记录失败', e)
    return { success: false, message: '保存失败：请确认已创建 bp_records 集合' }
  }
}
