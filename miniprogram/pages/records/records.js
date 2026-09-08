// pages/records/records.js —— 健康记录页（Tab2）
// 功能：血压/血糖切换、记录保存（云函数）、历史列表、删除、近7天 Canvas 趋势图
const app = getApp()
const util = require('../../utils/util.js')

Page({
  data: {
    type: 'bp',                 // 当前标签：bp=血压 sugar=血糖
    today: '',
    dateStart: '2015-01-01',
    dateEnd: '',
    focusSbp: false,            // 从首页跳转时自动聚焦收缩压输入框
    form: {
      date: '',
      sbp: '',
      dbp: '',
      sugar: '',
      heartRate: '',
      note: ''
    },
    records: [],                // 展示用历史列表
    chartData: [],              // 趋势图原始数据
    historyLoading: false,
    historyError: '',
    saving: false
  },

  onLoad() {
    const today = util.dateStr()
    this.setData({
      today,
      dateEnd: today,
      'form.date': today
    })
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }

    // 支持首页“记录血压”跳转：切换标签、聚焦并滚动到表单
    const pending = app.globalData.pendingRecordType
    if (pending === 'bp' || pending === 'sugar') {
      app.globalData.pendingRecordType = ''
      this.setData({
        type: pending,
        focusSbp: pending === 'bp'
      })
      setTimeout(() => {
        wx.pageScrollTo({ selector: '#recordFormCard', duration: 300 })
      }, 250)
      // 聚焦约 3 秒后收起键盘状态
      setTimeout(() => {
        this.setData({ focusSbp: false })
      }, 3000)
    }

    this.loadRecords()
  },

  onPullDownRefresh() {
    this.loadRecords().finally(() => wx.stopPullDownRefresh())
  },

  // 切换 血压/血糖 标签
  onSwitchType(e) {
    const type = e.currentTarget.dataset.type
    if (type === this.data.type) return
    this.setData({ type, focusSbp: false })
    this.loadRecords()
  },

  // 读取历史记录并整理展示数据 + 趋势数据（查询后在前端排序，降低对索引的依赖）
  async loadRecords() {
    if (this.data.historyLoading) return
    this.setData({ historyLoading: true, historyError: '' })
    try {
      const login = await app.ensureLogin()
      const db = wx.cloud.database()
      const res = await db.collection('bp_records')
        .where({ openid: login.openid, type: this.data.type })
        .limit(100)
        .get()

      const list = (res.data || []).sort((a, b) => {
        const byDate = String(b.date || '').localeCompare(String(a.date || ''))
        if (byDate !== 0) return byDate
        const ta = a.createTime ? new Date(a.createTime).getTime() : 0
        const tb = b.createTime ? new Date(b.createTime).getTime() : 0
        return tb - ta
      })

      const records = list.map((item) => {
        const display = this.data.type === 'bp'
          ? (item.sbp || 0) + '/' + (item.dbp || 0) + ' mmHg'
          : (item.sugar || 0) + ' mmol/L'
        return {
          _id: item._id,
          dateText: util.cnDate(item.date),
          display,
          sbp: item.sbp,
          dbp: item.dbp,
          sugar: item.sugar,
          heartRate: item.heartRate,
          note: item.note
        }
      })

      // 趋势数据：按时间正序取最近 7 条
      const asc = list.slice().reverse().slice(-7)
      const chartData = asc.map((item) => ({
        dateLabel: util.shortDate(item.date),
        sbp: item.sbp != null ? Number(item.sbp) : null,
        dbp: item.dbp != null ? Number(item.dbp) : null,
        sugar: item.sugar != null ? Number(item.sugar) : null
      }))

      this.setData({ records, chartData })
      wx.nextTick(() => this.drawTrend())
    } catch (e) {
      console.error('读取健康记录失败', e)
      this.setData({ records: [], historyError: '读取失败：请确认已部署云函数并配置数据库安全规则（见 README）' })
    } finally {
      this.setData({ historyLoading: false })
    }
  },

  // 表单通用输入：data-field 指定字段
  onFormInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ ['form.' + field]: e.detail.value })
  },

  onDateChange(e) {
    this.setData({ 'form.date': e.detail.value })
  },

  // 保存记录：交给云函数校验并写入（含 openid）
  async onSave() {
    const form = this.data.form
    if (this.data.saving) return

    if (this.data.type === 'bp') {
      const sbp = util.toNum(form.sbp)
      const dbp = util.toNum(form.dbp)
      if (!sbp || sbp < 60 || sbp > 260) {
        wx.showToast({ title: '请正确填写收缩压（60-260）', icon: 'none' })
        return
      }
      if (!dbp || dbp < 40 || dbp > 200) {
        wx.showToast({ title: '请正确填写舒张压（40-200）', icon: 'none' })
        return
      }
      if (sbp <= dbp) {
        wx.showToast({ title: '收缩压应高于舒张压', icon: 'none' })
        return
      }
    } else {
      const sugar = util.toNum(form.sugar)
      if (!sugar || sugar < 1 || sugar > 40) {
        wx.showToast({ title: '请正确填写血糖值（1-40）', icon: 'none' })
        return
      }
    }

    const heartRate = form.heartRate ? util.toNum(form.heartRate) : ''
    if (heartRate !== '' && (heartRate < 30 || heartRate > 220)) {
      wx.showToast({ title: '心率范围应为 30-220', icon: 'none' })
      return
    }

    const payload = {
      type: this.data.type,
      date: form.date || this.data.today,
      sbp: this.data.type === 'bp' ? util.toNum(form.sbp) : null,
      dbp: this.data.type === 'bp' ? util.toNum(form.dbp) : null,
      sugar: this.data.type === 'sugar' ? util.toNum(form.sugar) : null,
      heartRate: heartRate === '' ? null : heartRate,
      note: (form.note || '').trim()
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中…', mask: true })
    try {
      const res = await wx.cloud.callFunction({ name: 'saveBpRecord', data: payload })
      const result = res.result || {}
      if (!result.success) {
        throw new Error(result.message || '保存失败')
      }
      wx.hideLoading()
      wx.showToast({ title: '保存成功 ✓', icon: 'success' })

      // 清空本次数值，保留日期方便连续记录
      const clear = { 'form.sbp': '', 'form.dbp': '', 'form.sugar': '', 'form.heartRate': '', 'form.note': '' }
      this.setData(clear)
      this.loadRecords()
    } catch (e) {
      console.error('保存失败', e)
      wx.hideLoading()
      wx.showToast({ title: e && e.message ? e.message : '保存失败，请检查云函数部署', icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  // 删除一条记录（二次确认）
  onDeleteRecord(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.records.find((r) => r._id === id)
    if (!item) return
    wx.showModal({
      title: '删除这条记录？',
      content: item.dateText + ' 的记录删除后无法恢复。',
      confirmText: '删除',
      confirmColor: '#C62828',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await wx.cloud.database().collection('bp_records').where({ _id: id, openid: app.globalData.openid }).remove()
          wx.showToast({ title: '已删除', icon: 'success' })
          this.loadRecords()
        } catch (e) {
          console.error(e)
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  },

  // ---------- Canvas 2D 折线趋势图 ----------
  drawTrend() {
    const chartData = this.data.chartData || []
    const isBp = this.data.type === 'bp'
    const points = chartData.filter((p) => isBp ? (p.sbp != null && p.dbp != null) : (p.sugar != null))

    wx.createSelectorQuery()
      .select('#trendCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 2
        const w = res[0].width || 700
        const h = res[0].height || 300
        canvas.width = w * dpr
        canvas.height = h * dpr
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, w, h)

        if (points.length < 2) {
          ctx.font = '14px sans-serif'
          ctx.fillStyle = '#A89B88'
          ctx.textAlign = 'center'
          ctx.fillText('数据不足 2 条，暂无法绘制趋势图', w / 2, h / 2)
          return
        }

        // 绘图边距
        const padL = 58
        const padR = 26
        const padT = 48
        const padB = 58
        const plotW = w - padL - padR
        const plotH = h - padT - padB

        // 确定 Y 轴范围
        const all = []
        if (isBp) {
          points.forEach((p) => { all.push(p.sbp, p.dbp) })
        } else {
          points.forEach((p) => all.push(p.sugar))
        }
        let min = Math.min.apply(null, all)
        let max = Math.max.apply(null, all)
        const span = max - min || 1
        min = Math.max(0, min - span * 0.25)
        max = max + span * 0.25
        if (max - min < 2) {
          min = min - 2
          max = max + 2
        }

        const y = (v) => padT + (1 - (v - min) / (max - min)) * plotH
        const x = (i) => padL + (points.length === 1 ? plotW / 2 : (i * plotW) / (points.length - 1))

        // 网格 + Y 轴刻度
        ctx.lineWidth = 1
        ctx.textAlign = 'right'
        ctx.font = '12px sans-serif'
        for (let g = 0; g <= 4; g++) {
          const gy = padT + (plotH * g) / 4
          const val = max - ((max - min) * g) / 4
          ctx.strokeStyle = '#F0E7D8'
          ctx.beginPath()
          ctx.moveTo(padL, gy)
          ctx.lineTo(w - padR, gy)
          ctx.stroke()
          ctx.fillStyle = '#A89B88'
          ctx.fillText(String(Math.round(val)), padL - 10, gy + 4)
        }

        // X 轴日期
        ctx.textAlign = 'center'
        points.forEach((p, i) => {
          ctx.fillStyle = '#A89B88'
          ctx.fillText(p.dateLabel, x(i), h - padB + 28)
        })

        // 折线数据：血压双线，血糖单线
        const series = isBp
          ? [
              { key: 'sbp', color: '#2C5F8A' },
              { key: 'dbp', color: '#F5A623' }
            ]
          : [{ key: 'sugar', color: '#2C5F8A' }]

        series.forEach((s) => {
          ctx.strokeStyle = s.color
          ctx.fillStyle = s.color
          ctx.lineWidth = 3
          ctx.lineJoin = 'round'
          ctx.beginPath()
          points.forEach((p, i) => {
            if (p[s.key] == null) return
            const px = x(i)
            const py = y(p[s.key])
            if (i === 0) ctx.moveTo(px, py)
            else ctx.lineTo(px, py)
          })
          ctx.stroke()

          // 数据点与数值标注
          points.forEach((p, i) => {
            if (p[s.key] == null) return
            const px = x(i)
            const py = y(p[s.key])
            ctx.beginPath()
            ctx.arc(px, py, 4.5, 0, Math.PI * 2)
            ctx.fillStyle = '#FFFFFF'
            ctx.fill()
            ctx.strokeStyle = s.color
            ctx.lineWidth = 3
            ctx.stroke()

            ctx.fillStyle = s.color
            ctx.font = 'bold 12px sans-serif'
            ctx.textAlign = 'center'
            const labelY = py - 14 < padT ? py + 24 : py - 14
            ctx.fillText(String(Math.round(p[s.key])), px, labelY)
          })
        })
      })
  }
})
