// pages/meals/meals.js —— 饮食记录（第二版）
// 支持：早/午/晚/加餐 + 拍照或相册选图上传云存储 + 备注，子女端可远程查看。
const app = getApp()
const util = require('../../utils/util.js')

const TYPES = [
  { key: 'breakfast', text: '早餐', icon: '🌅' },
  { key: 'lunch', text: '午餐', icon: '☀️' },
  { key: 'dinner', text: '晚餐', icon: '🌙' },
  { key: 'snack', text: '加餐', icon: '🍎' }
]

Page({
  data: {
    types: TYPES,
    mealType: 'breakfast',
    date: '',
    note: '',
    tempImagePath: '',
    imageFileID: '',
    uploading: false,
    meals: [],
    loadError: ''
  },

  onLoad() {
    this.setData({ date: util.dateStr() })
  },

  onShow() {
    this.loadMeals()
  },

  onPullDownRefresh() {
    this.loadMeals().finally(() => wx.stopPullDownRefresh())
  },

  onTypeTap(e) {
    this.setData({ mealType: e.currentTarget.dataset.type })
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value })
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value })
  },

  // 拍照或从相册选择图片（暂存本地，保存时再上传）
  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        if (res.tempFiles && res.tempFiles[0]) {
          this.setData({ tempImagePath: res.tempFiles[0].tempFilePath, imageFileID: '' })
        }
      }
    })
  },

  removeTempImage() {
    this.setData({ tempImagePath: '', imageFileID: '' })
  },

  async loadMeals() {
    try {
      const login = await app.ensureLogin()
      const res = await wx.cloud.database().collection('meals')
        .where({ openid: login.openid })
        .limit(200)
        .get()
      const list = (res.data || []).sort((a, b) =>
        String(b.date || '').localeCompare(String(a.date || ''))
      )
      const meals = list.map((m) => {
        const t = TYPES.find((x) => x.key === m.mealType)
        return {
          _id: m._id,
          date: String(m.date || ''),
          dateText: util.cnDate(m.date),
          typeText: t ? t.text : m.mealType,
          typeIcon: t ? t.icon : '🍽️',
          note: m.note || '',
          imageFileID: m.imageFileID || ''
        }
      })
      this.setData({ meals, loadError: '' })
    } catch (e) {
      console.error('读取饮食失败', e)
      this.setData({ loadError: '读取失败：请确认已创建 meals 集合并配置安全规则' })
    }
  },

  // 保存饮食：先上传图片，再写入 meals
  async onSave() {
    if (this.data.uploading) return
    const note = (this.data.note || '').trim()
    if (!this.data.tempImagePath && !note && !this.data.imageFileID) {
      wx.showToast({ title: '请拍照或填写内容', icon: 'none' })
      return
    }
    this.setData({ uploading: true })
    wx.showLoading({ title: '保存中…', mask: true })
    try {
      const login = await app.ensureLogin()
      let fileID = this.data.imageFileID

      // 有本地新图则先传云存储
      if (this.data.tempImagePath) {
        const ext = (this.data.tempImagePath.split('.').pop() || 'jpg').split('?')[0]
        const cloudPath = 'meals/' + login.openid + '/' + this.data.date + '_' +
          this.data.mealType + '_' + Date.now() + '.' + ext
        const up = await new Promise((resolve, reject) => {
          wx.cloud.uploadFile({
            cloudPath,
            filePath: this.data.tempImagePath,
            success: resolve,
            fail: reject
          })
        })
        fileID = up.fileID
      }

      await wx.cloud.database().collection('meals').add({
        data: {
          openid: login.openid,
          date: this.data.date || util.dateStr(),
          mealType: this.data.mealType,
          note,
          imageFileID: fileID || '',
          createTime: new Date()
        }
      })
      wx.hideLoading()
      wx.showToast({ title: '已保存', icon: 'success' })
      this.setData({ note: '', tempImagePath: '', imageFileID: '' })
      this.loadMeals()
    } catch (e) {
      console.error('保存失败', e)
      wx.hideLoading()
      wx.showToast({ title: '保存失败，请确认 meals 集合与云存储可用', icon: 'none' })
    } finally {
      this.setData({ uploading: false })
    }
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除这条记录？',
      content: '删除后无法恢复。',
      confirmText: '删除',
      confirmColor: '#C62828',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await wx.cloud.database().collection('meals').where({ _id: id, openid: app.globalData.openid }).remove()
          wx.showToast({ title: '已删除', icon: 'success' })
          this.loadMeals()
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  },

  // 点击图片大图预览（cloud fileID 先换临时链接）
  onPreview(e) {
    const fileID = e.currentTarget.dataset.file
    if (!fileID) return
    wx.cloud.getTempFileURL({
      fileList: [fileID],
      success: (res) => {
        const item = res.fileList && res.fileList[0]
        if (item && item.tempFileURL) {
          wx.previewImage({ urls: [item.tempFileURL] })
        }
      }
    })
  }
})
