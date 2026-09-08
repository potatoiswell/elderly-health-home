// pages/medical/medical.js —— 就医记录（第二版）
// 记录：就诊时间、医院、科室、诊断结果、用药建议，形成时间线。
const app = getApp()
const util = require('../../utils/util.js')

Page({
  data: {
    today: '',
    form: {
      date: '',
      hospital: '',
      department: '',
      diagnosis: '',
      advice: ''
    },
    visits: [],
    saving: false,
    loadError: ''
  },

  onLoad() {
    const today = util.dateStr()
    this.setData({ today, 'form.date': today })
  },

  onShow() {
    this.loadVisits()
  },

  onPullDownRefresh() {
    this.loadVisits().finally(() => wx.stopPullDownRefresh())
  },

  onDateChange(e) {
    this.setData({ 'form.date': e.detail.value })
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ ['form.' + field]: e.detail.value })
  },

  async loadVisits() {
    try {
      const login = await app.ensureLogin()
      const res = await wx.cloud.database().collection('medical_visits')
        .where({ openid: login.openid })
        .limit(200)
        .get()
      const list = (res.data || []).sort((a, b) =>
        String(b.date || '').localeCompare(String(a.date || ''))
      )
      const visits = list.map((v) => ({
        _id: v._id,
        date: String(v.date || ''),
        dateText: util.cnDate(v.date),
        hospital: v.hospital || '',
        department: v.department || '',
        diagnosis: v.diagnosis || '',
        advice: v.advice || ''
      }))
      this.setData({ visits, loadError: '' })
    } catch (e) {
      console.error('读取就医记录失败', e)
      this.setData({ loadError: '读取失败：请确认已创建 medical_visits 集合并配置安全规则' })
    }
  },

  async onSave() {
    const f = this.data.form
    const hospital = (f.hospital || '').trim()
    const department = (f.department || '').trim()
    const diagnosis = (f.diagnosis || '').trim()
    if (!hospital || !diagnosis) {
      wx.showToast({ title: '请至少填写医院和诊断结果', icon: 'none' })
      return
    }
    if (this.data.saving) return
    this.setData({ saving: true })
    wx.showLoading({ title: '保存中…', mask: true })
    try {
      const login = await app.ensureLogin()
      await wx.cloud.database().collection('medical_visits').add({
        data: {
          openid: login.openid,
          date: f.date || this.data.today,
          hospital,
          department,
          diagnosis,
          advice: (f.advice || '').trim(),
          createTime: new Date()
        }
      })
      wx.hideLoading()
      wx.showToast({ title: '已保存', icon: 'success' })
      this.setData({
        form: { date: f.date, hospital: '', department: '', diagnosis: '', advice: '' }
      })
      this.loadVisits()
    } catch (e) {
      console.error(e)
      wx.hideLoading()
      wx.showToast({ title: '保存失败，请检查 medical_visits 集合权限', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除这条就医记录？',
      content: '删除后无法恢复。',
      confirmText: '删除',
      confirmColor: '#C62828',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await wx.cloud.database().collection('medical_visits').where({ _id: id, openid: app.globalData.openid }).remove()
          wx.showToast({ title: '已删除', icon: 'success' })
          this.loadVisits()
        } catch (err) {
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  }
})
