// 云函数 medicineReminder（定时触发器，每分钟检查一次）
// 模板字段（已按你实际模板配置）：
//   用药时间 time2 / 药品名称 thing3 / 备注 thing5 / 剂量 character_string4
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const BUILTIN_TEMPLATE_ID = 'i5pKkMWOhCW4nyB_1CLJIVANscl1izgnfeb1FYZPPQQ'
const TEMPLATE_ID = process.env.MEDICINE_TEMPLATE_ID || BUILTIN_TEMPLATE_ID
const MSG_STATE = process.env.MSG_STATE || 'formal'

function clip(s, len) {
  return String(s || '').slice(0, len)
}

function beijingParts() {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  const iso = d.toISOString()
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 16)
  }
}

exports.main = async () => {
  const { date, time } = beijingParts()
  const result = { success: true, date, time, total: 0, sent: 0, failed: 0, skipped: 0 }

  const medRes = await db.collection('medicines').where({ time }).limit(100).get()
  const meds = medRes.data || []
  result.total = meds.length

  for (const med of meds) {
    try {
      const logRes = await db.collection('medicine_logs')
        .where({ medicineId: med._id, date })
        .limit(1)
        .get()
      if (logRes.data.length > 0) {
        result.skipped++
        continue
      }

      let remindSent = false
      let sendError = ''
      if (TEMPLATE_ID && med.openid) {
        try {
          await cloud.openapi.subscribeMessage.send({
            touser: med.openid,
            templateId: TEMPLATE_ID,
            page: 'pages/medicines/medicines',
            miniprogramState: MSG_STATE,
            data: {
              time2: { value: String(med.time || '') },
              thing3: { value: clip(med.name, 20) },
              thing5: { value: clip(med.note || '请按时服药', 20) },
              character_string4: { value: clip(med.dosage || '遵医嘱', 32) }
            }
          })
          remindSent = true
          result.sent++
        } catch (e) {
          sendError = String(e.errMsg || e.message || e)
          console.warn('订阅消息发送失败', med.name, sendError)
          result.failed++
        }
      } else {
        result.failed++
      }

      await db.collection('medicine_logs').add({
        data: {
          openid: med.openid,
          medicineId: med._id,
          date,
          status: 'reminded',
          takenTime: '',
          remindSent,
          sendError: sendError.slice(0, 200),
          createTime: db.serverDate()
        }
      })
    } catch (e) {
      console.error('处理药品提醒出错', med._id, e)
      result.failed++
    }
  }

  console.log('medicineReminder 执行完成', JSON.stringify(result))
  return result
}
