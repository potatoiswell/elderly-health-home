// 云函数 wxRun
// 用途：通过 wx.getWeRunData 返回的 cloudID，用云调用直接换取微信运动开放数据，
// 无需配置 AppSecret，也不用手写 AES 解密。
// 调用前置条件：客户端先 wx.authorize({scope:'scope.werun'})，再 wx.getWeRunData。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event) => {
  const cloudID = String(event.cloudID || '')
  if (!cloudID) {
    return { success: false, message: '未获取到 cloudID，请确认已授权微信运动' }
  }

  try {
    // 换取开放数据，返回结构与客户端传入的 cloudID 一一对应
    const openData = await cloud.getOpenData({ list: [cloudID] })
    const arr = openData && openData.list ? openData.list : openData
    const first = Array.isArray(arr) && arr.length ? arr[0] : null
    if (!first) {
      return { success: false, message: '微信运动数据为空，请稍后重试' }
    }

    // 不同 SDK 版本返回结构略有差异，这里兼容解析
    const body = first.data || first
    const stepInfoList = body.stepInfoList || first.stepInfoList || []
    if (!stepInfoList.length) {
      return { success: false, message: '微信运动暂无可读取的步数（需先在微信运动开启记录）' }
    }

    // stepInfoList 最后一项通常距离今天最近
    let steps = 0
    const latest = stepInfoList[stepInfoList.length - 1]
    if (latest && typeof latest.step === 'number') {
      steps = latest.step
    }
    return { success: true, steps, stepInfoCount: stepInfoList.length }
  } catch (e) {
    console.error('wxRun 云调用失败', e)
    return { success: false, message: '步数读取失败：' + (e.errMsg || e.message || e) }
  }
}
