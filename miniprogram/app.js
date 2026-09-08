// app.js —— 全局入口：初始化云开发、登录（获取 openid）、缓存用户档案
const { envId } = require('./envList.js')

App({
  globalData: {
    openid: '',          // 当前微信用户的 openid（云开发身份标识）
    userDoc: null,       // 当前用户档案（users 集合）
    pendingRecordType: '',   // 首页“记录血压”跳转健康记录页时传递的类型
    pendingShowFamily: false, // 首页“子女帮设置”跳转“我的”时自动展开
    userDirty: false,    // 档案被修改后置为 true，“我的”页据此重新读取
    _loginPromise: null
  },

  onLaunch() {
    this.initCloud()
    // 打开小程序即尝试登录，后续页面可直接复用用户档案
    this.ensureLogin().catch((err) => {
      console.error('初始化登录失败', err)
    })
  },

  // 初始化云开发环境（envId 在 envList.js 中填写）
  initCloud() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上基础库以使用云能力')
      return
    }
    const options = { traceUser: true }
    if (envId) {
      options.env = envId
    }
    wx.cloud.init(options)
  },

  // 登录：调用云函数 login，获取 openid 并确保 users 档案存在（单例 Promise）
  ensureLogin() {
    if (this.globalData._loginPromise) {
      return this.globalData._loginPromise
    }
    if (!wx.cloud) {
      return Promise.reject(new Error('云开发不可用'))
    }
    this.globalData._loginPromise = wx.cloud.callFunction({ name: 'login' })
      .then((res) => {
        const result = res.result || {}
        if (!result.success) {
          throw new Error(result.message || '登录失败')
        }
        this.globalData.openid = result.openid
        this.globalData.userDoc = result.user
        // 统一返回全局最新档案（档案页保存后可能已更新 userDoc）
        return { openid: this.globalData.openid, user: this.globalData.userDoc }
      })
      .catch((err) => {
        // 登录失败时清除缓存，允许页面重试
        this.globalData._loginPromise = null
        throw err
      })
    return this.globalData._loginPromise
  },

  // 档案被修改后，强制重新获取最新档案
  refreshUser() {
    this.globalData._loginPromise = null
    this.globalData.userDoc = null
    return this.ensureLogin()
  }
})
