// pages/medicines/medicines.js —— 用药提醒页（Tab3）
// 说明：medicines 保存用药计划；medicine_logs 按“药+日期”记录已服/漏服状态。
// 到点未服药会由云函数定时推送订阅消息，并写入 status=reminded 的日志。
const app = getApp()
const util = require('../../utils/util.js')
const config = require('../../config.js')

Page({
  data: {
    today: '',
    dateText: '',
    now: '',
    medForm: { name: '', dosage: '', time: '08:00', note: '' },
    showForm: false,
    items: [],            // 用药列表（含当日状态）
    total: 0,
    taken: 0,
    missed: 0,
    summaryText: '正在统计…',
    allDone: false,
    loading: false,
    loadError: ''
  },

  onLoad() {
    this.setData({
      today: util.dateStr(),
      dateText: util.cnDate(),
      now: util.timeHM(),
      'medForm.time': '08:00'
    })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    this.setData({ now: util.timeHM() })
    this.loadMedicines()
  },

  onPullDownRefresh() {
    this.loadMedicines().finally(() => wx.stopPullDownRefresh())
  },

  // 拉取今日用药计划 + 日志，逐条计算状态（已服/未服/漏服）
  async loadMedicines() {
    if (this.data.loading) return
    this.setData({ loading: true, loadError: '' })
    try {
      const login = await app.ensureLogin()
      const db = wx.cloud.database()
      const now = util.timeHM()

      const [medRes, logRes] = await Promise.all([
        db.collection('medicines').where({ openid: login.openid }).limit(100).get(),
        db.collection('medicine_logs').where({ openid: login.openid, date: this.data.today }).limit(200).get()
      ])

      // 按服药时间升序排列
      const meds = (medRes.data || []).sort((a, b) =>
        String(a.time || '').localeCompare(String(b.time || ''))
      )
      const logs = logRes.data || []
      const logByMed = {}
      logs.forEach((log) => {
        if (!logByMed[log.medicineId]) logByMed[log.medicineId] = log
      })

      let taken = 0
      let missed = 0
      const items = meds.map((m) => {
        const log = logByMed[m._id]
        let status = 'pending'
        if (log && log.status === 'taken') {
          status = 'taken'
        } else if (log && log.status === 'reminded') {
          status = 'missed' // 定时提醒已推送但仍未服
        } else if (String(m.time || '').localeCompare(now) <= 0) {
          status = 'missed' // 已过服药时间且未标记
        }

        if (status === 'taken') taken++
        if (status === 'missed') missed++

        const statusMap = {
          taken: { text: '已服', icon: '✓' },
          pending: { text: '未服', icon: '○' },
          missed: { text: '漏服', icon: '⚠' }
        }
        const st = statusMap[status]

        return {
          _id: m._id,
          name: m.name,
          dosage: m.dosage,
          time: m.time,
          note: m.note,
          status,
          statusText: st.text,
          statusIcon: st.icon,
          logId: log && log._id ? log._id : ''
        }
      })

      const total = items.length
      const allDone = total > 0 && taken >= total
      let summaryText
      if (total === 0) {
        summaryText = '还没有用药计划，请先添加'
      } else if (allDone) {
        summaryText = '今天的药都吃完了，真棒！'
      } else {
        summaryText = '已服 ' + taken + '/' + total + ' 次，还有 ' + (total - taken) + ' 次待服'
      }

      this.setData({ items, total, taken, missed, summaryText, allDone, now })
    } catch (e) {
      console.error('读取用药失败', e)
      this.setData({ loadError: '读取失败：请确认云函数已部署、数据库安全规则已配置（见 README）' })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 展开/收起添加用药表单
  toggleForm() {
    this.setData({ showForm: !this.data.showForm })
  },

  onFormInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ ['medForm.' + field]: e.detail.value })
  },

  onTimeChange(e) {
    this.setData({ 'medForm.time': e.detail.value })
  },

  // 保存用药计划
  onAddMedicine() {
    const form = this.data.medForm
    const name = (form.name || '').trim()
    const dosage = (form.dosage || '').trim()
    const time = form.time || ''
    if (!name) {
      wx.showToast({ title: '请填写药名', icon: 'none' })
      return
    }
    if (!time) {
      wx.showToast({ title: '请选择服药时间', icon: 'none' })
      return
    }

    // 订阅消息授权必须在用户点击手势内同步发起，否则会被微信拦截
    if (config.MEDICINE_TEMPLATE_ID && wx.requestSubscribeMessage) {
      wx.requestSubscribeMessage({
        tmplIds: [config.MEDICINE_TEMPLATE_ID],
        success: () => {},
        fail: () => console.warn('用户未授权服药提醒订阅消息（不影响本地记录）')
      })
    }

    this.doAddMedicine(name, dosage, time, (form.note || '').trim())
  },

  async doAddMedicine(name, dosage, time, note) {
    try {
      const login = await app.ensureLogin()
      wx.showLoading({ title: '添加中…', mask: true })
      await wx.cloud.database().collection('medicines').add({
        data: {
          openid: login.openid,
          name,
          dosage,
          time,
          note,
          createTime: new Date()
        }
      })
      wx.hideLoading()
      wx.showToast({ title: '添加成功，到点会提醒您', icon: 'success' })
      this.setData({
        showForm: false,
        medForm: { name: '', dosage: '', time: '08:00', note: '' }
      })
      this.loadMedicines()
    } catch (e) {
      console.error(e)
      wx.hideLoading()
      wx.showToast({ title: '添加失败', icon: 'none' })
    }
  },

  // 切换服药状态：已服 -> 改未服；未服/漏服 -> 记为已服
  onToggleStatus(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.items.find((it) => it._id === id)
    if (!item) return

    if (item.status === 'taken') {
      // 误点已服：撤销今天的服药记录
      wx.showModal({
        title: '取消“已服”？',
        content: item.name + ' 将改回未服药状态。',
        confirmText: '取消服药',
        confirmColor: '#C62828',
        success: async (res) => {
          if (!res.confirm) return
          try {
            const db = wx.cloud.database()
            if (item.logId) {
              await db.collection('medicine_logs').where({ _id: item.logId, openid: app.globalData.openid }).remove()
            }
            wx.showToast({ title: '已改回未服', icon: 'none' })
            this.loadMedicines()
          } catch (err) {
            console.error(err)
            wx.showToast({ title: '操作失败', icon: 'none' })
          }
        }
      })
      return
    }

    // 记录为已服，写入当前时间
    const nowStr = util.timeHM()
    wx.showModal({
      title: item.name,
      content: '确认现在（' + nowStr + '）已服用吗？',
      confirmText: '确认已服',
      success: async (res) => {
        if (!res.confirm) return
        try {
          const login = await app.ensureLogin()
          const db = wx.cloud.database()
          if (item.logId) {
            // 定时提醒生成的漏服日志 -> 更新为已服
            await db.collection('medicine_logs').where({ _id: item.logId, openid: login.openid }).update({
              data: { status: 'taken', takenTime: nowStr, updateTime: new Date() }
            })
          } else {
            await db.collection('medicine_logs').add({
              data: {
                openid: login.openid,
                medicineId: item._id,
                date: this.data.today,
                status: 'taken',
                takenTime: nowStr,
                createTime: new Date()
              }
            })
          }
          wx.showToast({ title: '已记录 ✓', icon: 'success' })
          this.loadMedicines()
        } catch (err) {
          console.error(err)
          wx.showToast({ title: '记录失败', icon: 'none' })
        }
      }
    })
  },

  // 删除用药计划（连同今天的日志一起删除）
  onDeleteMedicine(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.items.find((it) => it._id === id)
    if (!item) return
    wx.showModal({
      title: '删除该用药？',
      content: item.name + '（每天 ' + item.time + '）删除后不再提醒。',
      confirmText: '删除',
      confirmColor: '#C62828',
      success: async (res) => {
        if (!res.confirm) return
        try {
          const login = await app.ensureLogin()
          const db = wx.cloud.database()
          const logs = await db.collection('medicine_logs')
            .where({ medicineId: id, openid: login.openid })
            .limit(200)
            .get()
          await Promise.all((logs.data || []).map((l) => db.collection('medicine_logs').where({ _id: l._id, openid: login.openid }).remove()))
          await db.collection('medicines').where({ _id: id, openid: login.openid }).remove()
          wx.showToast({ title: '已删除', icon: 'success' })
          this.loadMedicines()
        } catch (err) {
          console.error(err)
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  }
})
