// pages/index/index.js —— 首页（今日概览）
// 功能：日期/天气/出行建议、2x2 大图标入口、紧急呼救、跌倒呼救、
//      今日服药/测血压状态，以及活动/饮食/就医快捷入口。
const app = getApp()
const util = require('../../utils/util.js')

Page({
  data: {
    today: '',
    dateText: '',
    weekText: '',
    profile: {},
    greeting: '您好',
    weather: null,           // {temp, text, icon, tempMax, tempMin}
    weatherLoading: false,
    advice: '正在获取天气…',
    locationTip: '',
    medTaken: 0,
    medTotal: 0,
    bpDone: false,
    features: [
      { key: 'bp', icon: '❤️', title: '记录血压', desc: '今天测一测' },
      { key: 'med', icon: '💊', title: '用药提醒', desc: '按时来服药' },
      { key: 'sos', icon: '📞', title: '紧急呼救', desc: '一键打电话' },
      { key: 'archive', icon: '📋', title: '健康档案', desc: '病史与联系' }
    ],
    moreTools: [
      { key: 'activity', icon: '🚶', title: '每日活动', desc: '步数与散步时长', url: '/pages/activity/activity' },
      { key: 'meals', icon: '🍚', title: '饮食记录', desc: '拍照记录三餐', url: '/pages/meals/meals' },
      { key: 'medical', icon: '🏥', title: '就医记录', desc: '医院就诊时间线', url: '/pages/medical/medical' },
      { key: 'family', icon: '👨‍👩‍👧', title: '子女帮设置', desc: '生成绑定码给子女', url: '' }
    ],
    sosSending: false,
    _weatherAt: 0 // 上次天气获取时间戳（30分钟内不重复请求）
  },

  onLoad() {
    // 底部自定义导航高亮首页
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
  },

  onShow() {
    this.setData({ today: util.dateStr(), dateText: util.cnDate(), weekText: util.weekText() })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    this.refreshAll()
  },

  onPullDownRefresh() {
    this.refreshAll(true).finally(() => wx.stopPullDownRefresh())
  },

  // 统一刷新：登录档案 + 今日状态 + 天气（可强制刷新）
  async refreshAll(forceWeather) {
    try {
      const login = await app.ensureLogin()
      const profile = login.user || {}
      this.setData({
        profile,
        greeting: profile.name ? '您好，' + profile.name : '您好'
      })
    } catch (e) {
      console.warn('登录失败，部分数据不可用', e)
    }
    this.loadTodayStatus()
    this.loadWeather(!!forceWeather)
  },

  // 读取今日用药情况 + 是否已测血压
  async loadTodayStatus() {
    try {
      const login = await app.ensureLogin()
      const openid = login.openid
      const today = util.dateStr()
      const db = wx.cloud.database()

      const [medRes, logRes, bpRes] = await Promise.all([
        db.collection('medicines').where({ openid }).get(),
        db.collection('medicine_logs').where({ openid, date: today }).get(),
        db.collection('bp_records').where({ openid, type: 'bp', date: today }).count()
      ])

      const meds = medRes.data || []
      const logs = logRes.data || []
      const takenMedIds = new Set()
      logs.forEach((log) => {
        if (log.status === 'taken' && log.medicineId) takenMedIds.add(log.medicineId)
      })

      this.setData({
        medTotal: meds.length,
        medTaken: takenMedIds.size,
        bpDone: (bpRes.total || 0) > 0
      })
    } catch (e) {
      console.warn('读取今日状态失败', e)
      wx.showToast({ title: '读取今日状态失败，请检查云数据库权限', icon: 'none' })
    }
  },

  // 获取天气：先尝试定位，定位被拒绝时使用云函数默认城市
  async loadWeather(force) {
    if (!force && this.data.weather && Date.now() - this.data._weatherAt < 30 * 60 * 1000) {
      return
    }
    this.setData({ weatherLoading: true, advice: '正在获取天气…' })

    let latitude = null
    let longitude = null
    try {
      const setting = await wx.getSetting()
      if (setting.authSetting['scope.userLocation']) {
        const loc = await this.getLocation()
        latitude = loc.latitude
        longitude = loc.longitude
      }
    } catch (e) {
      console.warn('定位不可用，使用默认城市天气', e)
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'getWeather',
        data: { latitude, longitude, force: !!force }
      })
      const r = res.result || {}
      if (r.success && r.weather) {
        const w = r.weather
        this.setData({
          weather: {
            temp: w.temp,
            text: w.text,
            tempMax: w.tempMax,
            tempMin: w.tempMin,
            icon: this.weatherIcon(w.code, w.text)
          },
          advice: r.advice || '天气数据已获取',
          locationTip: r.locationName ? '定位：' + r.locationName : '',
          _weatherAt: Date.now()
        })
      } else {
        this.setData({ weather: null, advice: r.message || '天气获取失败，请检查 API Key 配置' })
      }
    } catch (e) {
      console.error('天气获取异常', e)
      this.setData({ weather: null, advice: '天气暂时不可用，请下拉或点击重试' })
    } finally {
      this.setData({ weatherLoading: false })
    }
  },

  getLocation() {
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: resolve,
        fail: reject
      })
    })
  },

  onRefreshWeather() {
    wx.showModal({
      title: '刷新天气',
      content: '将使用您当前所在位置获取天气。是否允许定位？',
      confirmText: '允许',
      success: (res) => {
        if (res.confirm) {
          this.requestLocationThenWeather(true)
        }
      }
    })
  },

  requestLocationThenWeather(force) {
    wx.authorize({
      scope: 'scope.userLocation',
      success: () => {
        this.getLocation()
          .then((loc) => this.doFetchWeather(loc.latitude, loc.longitude, force))
          .catch(() => this.loadWeather(force))
      },
      fail: () => {
        this.loadWeather(force)
      }
    })
  },

  async doFetchWeather(latitude, longitude, force) {
    this.setData({ weatherLoading: true })
    try {
      const res = await wx.cloud.callFunction({
        name: 'getWeather',
        data: { latitude, longitude, force: !!force }
      })
      const r = res.result || {}
      if (r.success && r.weather) {
        const w = r.weather
        this.setData({
          weather: {
            temp: w.temp,
            text: w.text,
            tempMax: w.tempMax,
            tempMin: w.tempMin,
            icon: this.weatherIcon(w.code, w.text)
          },
          advice: r.advice || '天气数据已获取',
          locationTip: r.locationName ? '定位：' + r.locationName : '',
          _weatherAt: Date.now()
        })
      } else {
        this.setData({ advice: r.message || '天气获取失败' })
      }
    } catch (e) {
      console.error(e)
    } finally {
      this.setData({ weatherLoading: false })
    }
  },

  weatherIcon(code, text) {
    const c = Number(code)
    const t = String(text || '')
    if (c === 100 || c === 150) return '☀️'
    if (t.indexOf('云') >= 0 || t.indexOf('阴') >= 0) return '⛅'
    if (t.indexOf('雪') >= 0 || t.indexOf('冰') >= 0) return '❄️'
    if (t.indexOf('雷') >= 0) return '⛈️'
    if (t.indexOf('雨') >= 0) return '🌧️'
    if (t.indexOf('雾') >= 0 || t.indexOf('霾') >= 0) return '🌫️'
    if (c >= 300 && c < 600) return '🌧️'
    return '🌤️'
  },

  // 2x2 大图标入口点击分发
  onCoreTap(e) {
    const key = e.currentTarget.dataset.key
    if (key === 'bp') {
      app.globalData.pendingRecordType = 'bp'
      wx.switchTab({ url: '/pages/records/records' })
    } else if (key === 'med') {
      wx.switchTab({ url: '/pages/medicines/medicines' })
    } else if (key === 'sos') {
      this.confirmSos()
    } else if (key === 'archive') {
      wx.navigateTo({ url: '/pages/archive/archive' })
    }
  },

  // “更多服务”跳转
  onMoreTap(e) {
    const key = e.currentTarget.dataset.key
    if (key === 'family') {
      app.globalData.pendingShowFamily = true
      wx.switchTab({ url: '/pages/profile/profile' })
      return
    }
    const item = this.data.moreTools.find((t) => t.key === key)
    if (item && item.url) {
      wx.navigateTo({ url: item.url })
    }
  },

  // 紧急呼救：二次确认后拨打预设紧急联系人电话（两步内完成）
  confirmSos() {
    const p = this.data.profile || {}
    const phone = String(p.emergencyPhone || '').trim()
    if (!phone) {
      wx.showModal({
        title: '还没有紧急联系人',
        content: '请先在“健康档案”中填写紧急联系人电话，才能一键呼救。',
        confirmText: '去填写',
        success: (res) => {
          if (res.confirm) wx.navigateTo({ url: '/pages/archive/archive' })
        }
      })
      return
    }
    const who = p.emergencyName ? p.emergencyName : '紧急联系人'
    wx.showModal({
      title: '⚠️ 紧急呼救',
      content: '确认立即拨打 ' + who + '（' + phone + '）吗？',
      confirmText: '立即拨打',
      cancelText: '再想想',
      confirmColor: '#C62828',
      success: (res) => {
        if (res.confirm) {
          wx.makePhoneCall({ phoneNumber: phone })
        }
      }
    })
  },

  // 第二版：我摔倒了 —— 二次确认后发送位置 + 通知子女，并提示拨打电话
  onFallDetect() {
    if (this.data.sosSending) return
    wx.showModal({
      title: '🚨 我摔倒了',
      content: '确认摔倒了吗？将记录当前位置并通知家人。',
      confirmText: '确认呼救',
      cancelText: '我按错了',
      confirmColor: '#C62828',
      success: (res) => {
        if (res.confirm) this.sendFallAlert()
      }
    })
  },

  async sendFallAlert() {
    this.setData({ sosSending: true })
    wx.showLoading({ title: '正在通知家人…', mask: true })
    let latitude = 0
    let longitude = 0
    try {
      const setting = await wx.getSetting()
      if (setting.authSetting['scope.userLocation']) {
        const loc = await this.getLocation()
        latitude = loc.latitude
        longitude = loc.longitude
      }
    } catch (e) {
      console.warn('跌倒呼救定位失败', e)
    }

    try {
      const res = await wx.cloud.callFunction({
        name: 'emergencyAlert',
        data: { latitude, longitude }
      })
      const r = res.result || {}
      wx.hideLoading()
      this.setData({ sosSending: false })
      if (!r.success) {
        wx.showToast({ title: r.message || '呼救发送失败', icon: 'none' })
        return
      }
      this.afterFallAlert(r)
    } catch (e) {
      console.error(e)
      wx.hideLoading()
      this.setData({ sosSending: false })
      wx.showToast({ title: '呼救失败：请确认 emergencyAlert 云函数已部署', icon: 'none' })
    }
  },

  afterFallAlert(r) {
    const p = this.data.profile || {}
    const phone = String(p.emergencyPhone || '').trim()
    const content = phone
      ? '呼救记录已发送。是否需要立即拨打紧急联系人' +
        (p.emergencyName ? '（' + p.emergencyName + '）' : '') + '？'
      : '呼救记录已发送。'
    wx.showModal({
      title: r.message || '已呼救',
      content,
      showCancel: !!phone,
      confirmText: phone ? '立即拨打' : '知道了',
      cancelText: '暂不拨打',
      confirmColor: '#C62828',
      success: (res) => {
        if (res.confirm && phone) wx.makePhoneCall({ phoneNumber: phone })
      }
    })
  },

  // 状态区点击
  onStatusTap(e) {
    const type = e.currentTarget.dataset.type
    if (type === 'med') {
      wx.switchTab({ url: '/pages/medicines/medicines' })
    } else if (type === 'bp') {
      app.globalData.pendingRecordType = 'bp'
      wx.switchTab({ url: '/pages/records/records' })
    }
  },

  // 语音播报预留
  readWeather() {
    const w = this.data.weather
    const text = w
      ? '当前气温' + w.temp + '度，' + w.text + '，' + this.data.advice
      : this.data.advice
    wx.showModal({
      title: '语音播报',
      content: text + '\n（语音朗读将在后续版本接入）',
      showCancel: false,
      confirmText: '知道了'
    })
  },

  onShareAppMessage() {
    const p = this.data.profile || {}
    return {
      title: p.name ? p.name + ' 的健康管理小程序，请帮 TA 关注' : '老年人健康居家管理小程序',
      path: '/pages/index/index'
    }
  }
})
