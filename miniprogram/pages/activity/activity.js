// pages/activity/activity.js —— 每日活动记录（第二版）
// 支持：从微信运动读取今日步数（cloudID + 云调用），或手动填写步数/散步时长。
const app = getApp()
const util = require('../../utils/util.js')

Page({
  data: {
    today: '',
    dateText: '',
    todaySteps: 0,
    weekTotal: 0,
    activities: [],       // 历史记录（日期倒序）
    form: { steps: '', duration: '', note: '' },
    reading: false,
    saving: false,
    loadError: ''
  },

  onLoad() {
    this.setData({
      today: util.dateStr(),
      dateText: util.cnDate(),
      'form.date': util.dateStr()
    })
  },

  onShow() {
    this.loadActivities()
  },

  onPullDownRefresh() {
    this.loadActivities().finally(() => wx.stopPullDownRefresh())
  },

  // 读取活动历史，汇总今日步数与近 7 日总步数
  async loadActivities() {
    try {
      const login = await app.ensureLogin()
      const res = await wx.cloud.database().collection('activities')
        .where({ openid: login.openid })
        .limit(200)
        .get()
      const list = (res.data || []).sort((a, b) =>
        String(b.date || '').localeCompare(String(a.date || ''))
      )

      // 近 7 天步数合计（按日期去重，重复记录取最后一次）
      const byDate = {}
      list.forEach((a) => { byDate[a.date] = a })
      const dates = Object.keys(byDate).sort().reverse().slice(0, 7)
      let weekTotal = 0
      dates.forEach((d) => {
        const s = Number(byDate[d].steps || 0)
        if (s > 0) weekTotal += s
      })

      const todayItem = byDate[this.data.today] || null
      const activities = list.map((a) => ({
        _id: a._id,
        dateText: util.cnDate(a.date),
        steps: a.steps || 0,
        duration: a.durationMin ? a.durationMin + ' 分钟' : '',
        sourceText: a.source === 'wechat' ? '微信运动' : '手动记录',
        note: a.note || ''
      }))

      this.setData({
        activities,
        todaySteps: todayItem ? Number(todayItem.steps || 0) : 0,
        weekTotal,
        loadError: ''
      })
    } catch (e) {
      console.error('读取活动失败', e)
      this.setData({ loadError: '读取失败：请确认 activities 集合并配置安全规则' })
    }
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ ['form.' + field]: e.detail.value })
  },

  // 从微信运动读取今日步数（scope.werun + wx.getWeRunData + 云函数 wxRun）
  onReadWeRun() {
    if (this.data.reading) return
    this.setData({ reading: true })

    // 1) 授权微信运动
    wx.authorize({
      scope: 'scope.werun',
      success: () => this.doReadWeRun(),
      fail: () => {
        this.setData({ reading: false })
        wx.showModal({
          title: '需要微信运动授权',
          content: '请在设置中允许“微信运动步数”后重试，或改用下方手动记录。',
          confirmText: '去设置',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting({ complete: () => this.setData({ reading: false }) })
            }
          }
        })
      }
    })
  },

  doReadWeRun() {
    // 2) wx.login（微信要求先登录） + 获取微信运动加密数据（含 cloudID）
    wx.login({
      success: () => {
        wx.getWeRunData({
          success: async (res) => {
            if (!res.cloudID) {
              this.setData({ reading: false })
              wx.showToast({ title: '当前环境不支持 cloudID，请用正式版', icon: 'none' })
              return
            }
            try {
              const fn = await wx.cloud.callFunction({
                name: 'wxRun',
                data: { cloudID: res.cloudID }
              })
              const r = fn.result || {}
              if (!r.success) {
                this.setData({ reading: false })
                wx.showToast({ title: r.message || '步数读取失败', icon: 'none' })
                return
              }
              await this.saveSteps(Number(r.steps || 0), 'wechat')
              this.setData({ reading: false, 'form.steps': '' })
            } catch (e) {
              console.error(e)
              this.setData({ reading: false })
              wx.showToast({ title: '请确认 wxRun 云函数已部署', icon: 'none' })
            }
          },
          fail: (err) => {
            console.error('getWeRunData 失败', err)
            this.setData({ reading: false })
            wx.showToast({ title: '微信运动读取失败，请手动填写', icon: 'none' })
          }
        })
      },
      fail: () => {
        this.setData({ reading: false })
        wx.showToast({ title: '微信登录失败，请稍后重试', icon: 'none' })
      }
    })
  },

  // 保存某一天的活动数据（今天已有记录则覆盖步数）
  async saveSteps(steps, source) {
    try {
      const login = await app.ensureLogin()
      const db = wx.cloud.database()
      const date = this.data.today
      const exist = await db.collection('activities').where({ openid: login.openid, date }).limit(1).get()
      const patch = { steps, source: source || 'manual', updateTime: new Date() }
      if (exist.data[0]) {
        await db.collection('activities').where({ _id: exist.data[0]._id, openid: login.openid }).update({ data: patch })
      } else {
        await db.collection('activities').add({
          data: Object.assign({
            openid: login.openid,
            date,
            durationMin: 0,
            note: '',
            createTime: new Date()
          }, patch)
        })
      }
      wx.showToast({ title: '已记录今日步数', icon: 'success' })
      this.loadActivities()
    } catch (e) {
      console.error(e)
      wx.showToast({ title: '保存失败', icon: 'none' })
      throw e
    }
  },

  // 手动保存活动（步数 + 散步时长 + 备注）
  async onSaveManual() {
    const form = this.data.form
    const steps = form.steps ? Math.round(Number(form.steps)) : 0
    const duration = form.duration ? Math.round(Number(form.duration)) : 0
    if (steps < 0 || duration < 0) {
      wx.showToast({ title: '请输入正确的数字', icon: 'none' })
      return
    }
    if (!steps && !duration && !(form.note || '').trim()) {
      wx.showToast({ title: '请至少填写一项内容', icon: 'none' })
      return
    }
    if (this.data.saving) return
    this.setData({ saving: true })
    try {
      const login = await app.ensureLogin()
      const db = wx.cloud.database()
      const date = this.data.today
      const exist = await db.collection('activities').where({ openid: login.openid, date }).limit(1).get()
      const data = {
        steps,
        durationMin: duration,
        source: 'manual',
        note: (form.note || '').trim(),
        updateTime: new Date()
      }
      if (exist.data[0]) {
        await db.collection('activities').where({ _id: exist.data[0]._id, openid: login.openid }).update({ data })
      } else {
        await db.collection('activities').add({
          data: Object.assign({ openid: login.openid, date, createTime: new Date() }, data)
        })
      }
      wx.showToast({ title: '已保存', icon: 'success' })
      this.setData({ form: { steps: '', duration: '', note: '' } })
      this.loadActivities()
    } catch (e) {
      console.error(e)
      wx.showToast({ title: '保存失败，请检查 activities 集合权限', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  }
})
