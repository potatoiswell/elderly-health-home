// pages/profile/profile.js —— 我的（Tab4）
// 功能：用户信息、健康档案入口、紧急联系人、子女帮设置（6位绑定码）、数据导出
const app = getApp()
const util = require('../../utils/util.js')

Page({
  data: {
    user: {},
    hasProfile: false,
    bindCode: '',
    showFamily: false,   // 子女帮设置卡片是否展开
    familyTip: '',
    exporting: false
  },

  onLoad() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
    // 首页点“子女帮设置”跳过来时自动展开
    if (app.globalData.pendingShowFamily) {
      app.globalData.pendingShowFamily = false
      this.setData({ showFamily: true })
    }
    this.refreshProfile()
  },

  async refreshProfile() {
    try {
      const login = await app.ensureLogin()
      const user = login.user || {}
      this.setData({
        user,
        hasProfile: !!(user.name || user.age || user.history || user.emergencyName || user.emergencyPhone),
        bindCode: user.familyBindCode || '',
        familyTip: user.familyOpenid ? '已绑定子女账号' : '把 6 位绑定码发给子女即可绑定'
      })
    } catch (e) {
      console.error('档案加载失败', e)
      wx.showToast({ title: '档案加载失败，请检查云函数部署', icon: 'none' })
    }
  },

  goArchive() {
    wx.navigateTo({ url: '/pages/archive/archive' })
  },

  callEmergency() {
    const phone = String(this.data.user.emergencyPhone || '').trim()
    if (!phone) {
      wx.showModal({
        title: '还没有紧急联系人',
        content: '请先编辑健康档案，填写紧急联系人电话。',
        confirmText: '去填写',
        success: (res) => { if (res.confirm) this.goArchive() }
      })
      return
    }
    wx.makePhoneCall({ phoneNumber: phone })
  },

  toggleFamily() {
    this.setData({ showFamily: !this.data.showFamily })
  },

  // 生成/刷新 6 位绑定码（重新生成后旧码失效）
  genBindCode() {
    const action = () => {
      const code = String(Math.floor(100000 + Math.random() * 900000))
      this.saveBindCode(code)
    }
    if (this.data.bindCode) {
      wx.showModal({
        title: '重新生成绑定码？',
        content: '旧绑定码将失效，需将新码重新发给子女。',
        confirmText: '重新生成',
        success: (res) => { if (res.confirm) action() }
      })
    } else {
      action()
    }
  },

  async saveBindCode(code) {
    try {
      const user = this.data.user
      const db = wx.cloud.database()
      await db.collection('users').where({ _id: user._id, openid: user.openid }).update({
        data: { familyBindCode: code, updateTime: new Date() }
      })
      const updated = Object.assign({}, user, { familyBindCode: code })
      app.globalData.userDoc = updated
      this.setData({ user: updated, bindCode: code })
      wx.showToast({ title: '绑定码已生成', icon: 'success' })
    } catch (e) {
      console.error(e)
      wx.showToast({ title: '生成失败，请检查云数据库权限', icon: 'none' })
    }
  },

  copyBindCode() {
    if (!this.data.bindCode) return
    wx.setClipboardData({
      data: this.data.bindCode,
      success: () => wx.showToast({ title: '已复制', icon: 'success' })
    })
  },

  // 分享给子女：路径带 code，子女点开直接进入绑定/查看页
  onShareAppMessage() {
    const u = this.data.user
    const name = u.name || '家中老人'
    const code = this.data.bindCode || ''
    return {
      title: '我是' + name + '，请帮我在微信里设置健康档案（绑定码：' + code + '）',
      path: '/pages/family/family' + (code ? '?code=' + code : '')
    }
  },

  // 一键导出全部健康数据为 JSON 文件（可通过聊天分享）
  async exportData() {
    if (this.data.exporting) return
    this.setData({ exporting: true })
    wx.showLoading({ title: '正在整理数据…', mask: true })
    try {
      const login = await app.ensureLogin()
      const db = wx.cloud.database()
      const q = { openid: login.openid }

      const fetchSafe = async (name) => {
        try {
          const r = await db.collection(name).where(q).limit(1000).get()
          return r.data || []
        } catch (e) {
          return []
        }
      }

      const [users, bps, meds, medLogs, activities, meals, emergencyLogs, visits] = await Promise.all([
        fetchSafe('users'),
        fetchSafe('bp_records'),
        fetchSafe('medicines'),
        fetchSafe('medicine_logs'),
        fetchSafe('activities'),
        fetchSafe('meals'),
        fetchSafe('emergency_logs'),
        fetchSafe('medical_visits')
      ])

      const data = {
        app: '老年人健康居家管理',
        exportedAt: util.nowString(),
        user: users[0] || {},
        bpRecords: bps,
        medicines: meds,
        medicineLogs: medLogs,
        activities,
        meals,
        emergencyLogs,
        medicalVisits: visits
      }
      const json = JSON.stringify(data, null, 2)
      const fileName = '健康数据_' + util.dateStr().replace(/-/g, '') + '.json'
      const filePath = wx.env.USER_DATA_PATH + '/' + fileName

      await new Promise((resolve, reject) => {
        wx.getFileSystemManager().writeFile({
          filePath,
          data: json,
          encoding: 'utf8',
          success: resolve,
          fail: reject
        })
      })
      wx.hideLoading()

      wx.shareFileMessage({
        filePath,
        fileName,
        success: () => {},
        fail: () => {
          wx.setClipboardData({
            data: json,
            success: () => wx.showToast({ title: '已复制到剪贴板（数据量大可能不完整）', icon: 'none' })
          })
        }
      })
    } catch (e) {
      console.error('导出失败', e)
      wx.hideLoading()
      wx.showToast({ title: '导出失败', icon: 'none' })
    } finally {
      this.setData({ exporting: false })
    }
  }
})
