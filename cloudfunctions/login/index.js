// 云函数 login
// 用途：
//   1. 首次运行时自动补齐所有数据集合（重复调用不报错，只创建缺失的）；
//   2. 获取当前用户 openid，若 users 集合中还没有档案则自动创建并生成 6 位绑定码。
// 说明：云函数内写入的文档不会自动带 _openid，因此客户端需配合“自定义安全规则
// doc.openid == auth.openid”才能读取（详见项目 README）。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 项目需要的全部集合，首次登录自动补齐
const NEEDED_COLLECTIONS = [
  'users',
  'bp_records',
  'medicines',
  'medicine_logs',
  'activities',
  'meals',
  'emergency_logs',
  'weather_cache',
  'medical_visits'
]

async function ensureCollections() {
  for (const name of NEEDED_COLLECTIONS) {
    try {
      await db.createCollection(name)
      console.log('自动创建集合：' + name)
    } catch (e) {
      // 集合已存在时 SDK 会抛错，忽略即可
    }
  }
}

function makeBindCode() {
  return String(Math.floor(100000 + Math.random() * 900000))
}

exports.main = async () => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) {
    return { success: false, message: '未获取到用户身份' }
  }

  try {
    // 首次登录自动建集合（幂等）
    await ensureCollections()

    const users = db.collection('users')
    const found = await users.where({ openid: OPENID }).limit(1).get()
    let user = found.data[0] || null

    if (!user) {
      const data = {
        openid: OPENID,
        avatarFileID: '',
        name: '',
        age: null,
        history: '',
        allergy: '',
        emergencyName: '',
        emergencyPhone: '',
        familyBindCode: makeBindCode(),
        familyOpenid: '',
        familyParentOpenid: '',
        createTime: db.serverDate(),
        updateTime: db.serverDate()
      }
      const addRes = await users.add({ data })
      user = Object.assign({ _id: addRes._id }, data)
    }

    return { success: true, openid: OPENID, user }
  } catch (e) {
    console.error('login 云函数执行失败', e)
    return { success: false, message: '登录云函数执行失败：' + (e.message || e) }
  }
}
