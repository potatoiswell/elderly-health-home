// pages/family/family.js —— 子女端（绑定老人 + 只读汇总）
// 使用场景：老人把 6 位绑定码发给子女；子女打开本页输入/扫码进入。
const app = getApp()

const MEAL_MAP = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' }
const SOS_MAP = {
  notified: '已通知子女',
  notify_failed: '已记录（通知发送失败）',
  no_family: '已记录（未绑定子女）'
}

Page({
  data: {
    bindCode: '',
    preCode: '',
    demo: false,
    bound: false,
    loading: false,
    errMsg: '',
    parent: {},
    medicineSummary: [],
    bpList: [],
    sugarList: [],
    meals: [],
    visits: [],
    emergencyList: []
  },

  onLoad(options) {
    // 老人分享的路径携带 ?code=xxxxxx
    if (options && options.code) {
      this.setData({
        bindCode: String(options.code).slice(0, 6),
        preCode: String(options.code).slice(0, 6),
        demo: String(options.demo) === '1' || String(options.demo) === 'true'
      })
    }
  },

  onShow() {
    this.refreshSummary()
  },

  onPullDownRefresh() {
    this.refreshSummary().finally(() => wx.stopPullDownRefresh())
  },

  onCodeInput(e) {
    this.setData({ bindCode: e.detail.value.replace(/\D/g, '').slice(0, 6) })
  },

  // 绑定老人：以子女 openid 写入老人 users.familyOpenid
  async onBind() {
    const code = (this.data.bindCode || '').trim()
    if (!/^\d{6}$/.test(code)) {
      wx.showToast({ title: '请输入 6 位数字绑定码', icon: 'none' })
      return
    }
    this.setData({ loading: true, errMsg: '' })
    wx.showLoading({ title: '绑定中…', mask: true })
    try {
      await app.ensureLogin()
      const res = await wx.cloud.callFunction({ name: 'family', data: { action: 'bind', code, demo: this.data.demo } })
      const r = res.result || {}
      if (!r.success) {
        this.setData({ errMsg: r.message || '绑定失败', loading: false })
        wx.hideLoading()
        return
      }
      wx.hideLoading()
      wx.showToast({ title: '绑定成功', icon: 'success' })
      this.setData({ bound: true, errMsg: '' })
      this.refreshSummary()
    } catch (e) {
      console.error(e)
      wx.hideLoading()
      this.setData({ errMsg: '绑定失败：请确认 family 云函数已部署', loading: false })
    }
  },

  // 拉取老人健康汇总（只读）
  async refreshSummary() {
    if (!this.data.bound && !this.data.preCode) {
      // 未绑定过：尝试查一次，若云端已有绑定关系则自动进入汇总
    }
    try {
      await app.ensureLogin()
      const res = await wx.cloud.callFunction({ name: 'family', data: { action: 'summary' } })
      const r = res.result || {}
      if (!r.success) {
        if (r.code === 'NOT_BOUND') {
          this.setData({ bound: false, parent: {}, medicineSummary: [], bpList: [], sugarList: [], meals: [], visits: [], emergencyList: [], errMsg: '' })
        } else {
          this.setData({ errMsg: r.message || '读取失败', bound: false })
        }
        return
      }

      const bpList = (r.bpList || []).map((x) => ({
        _id: x._id,
        date: String(x.date || ''),
        display: (x.sbp || 0) + '/' + (x.dbp || 0) + ' mmHg'
      }))
      const sugarList = (r.sugarList || []).map((x) => ({
        _id: x._id,
        date: String(x.date || ''),
        display: (x.sugar || 0) + ' mmol/L'
      }))
      const meals = (r.meals || []).map((x) => ({
        _id: x._id,
        date: String(x.date || ''),
        typeText: MEAL_MAP[x.mealType] || x.mealType || '',
        note: x.note || '',
        imageFileID: x.imageFileID || ''
      }))
      const visits = (r.visits || []).map((x) => ({
        _id: x._id,
        date: String(x.date || ''),
        hospital: x.hospital || '',
        department: x.department || '',
        diagnosis: x.diagnosis || ''
      }))
      const emergencyList = (r.emergencyList || []).map((x) => ({
        _id: x._id,
        date: String(x.date || ''),
        statusText: SOS_MAP[x.status] || x.status || '已记录'
      }))
      const medMap = { taken: '已服', pending: '未服', missed: '漏服' }
      const medicineSummary = (r.medicineSummary || []).map((m) => ({
        name: m.name,
        time: m.time,
        dosage: m.dosage,
        status: m.status,
        statusText: medMap[m.status] || '未服'
      }))

      this.setData({
        bound: true,
        parent: r.parent || {},
        bpList,
        sugarList,
        meals,
        visits,
        emergencyList,
        medicineSummary,
        errMsg: ''
      })
    } catch (e) {
      console.error('读取汇总失败', e)
      this.setData({ errMsg: '读取失败：请确认 family 云函数已部署', bound: false })
    }
  },

  onUnbind() {
    wx.showModal({
      title: '解除绑定？',
      content: '解除后将无法继续查看老人的健康数据。',
      confirmText: '解除绑定',
      confirmColor: '#C62828',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await wx.cloud.callFunction({ name: 'family', data: { action: 'unbind' } })
          wx.showToast({ title: '已解除绑定', icon: 'success' })
          this.setData({
            bound: false,
            preCode: '',
    demo: false,
            bindCode: '',
            parent: {},
            medicineSummary: [],
            bpList: [],
            sugarList: [],
            meals: [],
            visits: [],
            emergencyList: []
          })
        } catch (e) {
          console.error(e)
          wx.showToast({ title: '操作失败', icon: 'none' })
        }
      }
    })
  }
})
