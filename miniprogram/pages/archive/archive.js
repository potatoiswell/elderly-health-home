// pages/archive/archive.js —— 健康档案编辑页（二级页面，可从首页/我的进入）
// 字段存于 users 集合：姓名、年龄、病史、过敏药物、紧急联系人/电话、头像等
const app = getApp()

Page({
  data: {
    saving: false,
    uploadingAvatar: false,
    form: {
      avatarFileID: '',
      name: '',
      age: '',
      history: '',
      allergy: '',
      emergencyName: '',
      emergencyPhone: ''
    }
  },

  onLoad() {
    this.loadProfile()
  },

  // 读取当前用户档案并回填表单
  async loadProfile() {
    try {
      const login = await app.ensureLogin()
      const u = login.user || {}
      this.setData({
        form: {
          avatarFileID: u.avatarFileID || '',
          name: u.name || '',
          age: u.age != null ? String(u.age) : '',
          history: u.history || '',
          allergy: u.allergy || '',
          emergencyName: u.emergencyName || '',
          emergencyPhone: u.emergencyPhone || ''
        }
      })
    } catch (e) {
      console.error(e)
      wx.showToast({ title: '档案读取失败，请检查云函数与数据库权限', icon: 'none' })
    }
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ ['form.' + field]: e.detail.value })
  },

  // 微信头像选择：上传到云存储，fileID 存到档案
  onChooseAvatar(e) {
    const tempPath = e.detail.avatarUrl
    if (!tempPath || this.data.uploadingAvatar) return
    this.setData({ uploadingAvatar: true })
    wx.showLoading({ title: '头像上传中…', mask: true })

    app.ensureLogin()
      .then((login) => {
        const ext = (tempPath.split('.').pop() || 'png').split('?')[0]
        const cloudPath = 'avatars/' + login.openid + '_' + Date.now() + '.' + ext
        // 云存储 uploadFile 使用回调风格包一层 Promise
        return new Promise((resolve, reject) => {
          wx.cloud.uploadFile({
            cloudPath,
            filePath: tempPath,
            success: resolve,
            fail: reject
          })
        })
      })
      .then((res) => {
        this.setData({ 'form.avatarFileID': res.fileID, uploadingAvatar: false })
        wx.hideLoading()
        wx.showToast({ title: '头像已更新（保存后生效）', icon: 'none' })
      })
      .catch((err) => {
        console.error('头像上传失败', err)
        wx.hideLoading()
        this.setData({ uploadingAvatar: false })
        wx.showToast({ title: '头像上传失败', icon: 'none' })
      })
  },

  // 保存档案
  async onSave() {
    if (this.data.saving) return
    const f = this.data.form
    const name = (f.name || '').trim()
    const ageStr = (f.age || '').trim()
    const age = ageStr === '' ? null : Number(ageStr)
    const phone = (f.emergencyPhone || '').trim()

    if (!name) {
      wx.showToast({ title: '请填写姓名', icon: 'none' })
      return
    }
    if (age !== null && (!Number.isFinite(age) || age < 1 || age > 150)) {
      wx.showToast({ title: '年龄需在 1-150 之间', icon: 'none' })
      return
    }
    if (phone && !/^[0-9+\-\s]{5,20}$/.test(phone)) {
      wx.showToast({ title: '紧急联系电话格式不正确', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中…', mask: true })
    try {
      const login = await app.ensureLogin()
      const db = wx.cloud.database()
      await db.collection('users').where({ _id: login.user._id, openid: login.openid }).update({
        data: {
          avatarFileID: f.avatarFileID || '',
          name,
          age,
          history: (f.history || '').trim(),
          allergy: (f.allergy || '').trim(),
          emergencyName: (f.emergencyName || '').trim(),
          emergencyPhone: phone,
          updateTime: new Date()
        }
      })

      // 同步全局缓存并标记“我的”页需要刷新
      const updated = Object.assign({}, login.user, {
        avatarFileID: f.avatarFileID,
        name,
        age,
        history: (f.history || '').trim(),
        allergy: (f.allergy || '').trim(),
        emergencyName: (f.emergencyName || '').trim(),
        emergencyPhone: phone
      })
      app.globalData.userDoc = updated
      app.globalData.userDirty = true

      wx.hideLoading()
      wx.showToast({ title: '保存成功 ✓', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 800)
    } catch (e) {
      console.error('保存档案失败', e)
      wx.hideLoading()
      wx.showToast({ title: '保存失败：请确认数据库安全规则（见 README）', icon: 'none', duration: 3000 })
    } finally {
      this.setData({ saving: false })
    }
  }
})
