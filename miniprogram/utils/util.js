// utils/util.js —— 通用日期/字符串小工具（所有页面共用）

function pad2(n) {
  return n < 10 ? '0' + n : '' + n
}

// 返回 YYYY-MM-DD，offsetDays 支持取昨天/明天
function dateStr(offsetDays) {
  const d = new Date()
  if (offsetDays) {
    d.setDate(d.getDate() + offsetDays)
  }
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
}

// 返回 HH:mm（当前时间，用于判断用药是否到点/漏服）
function timeHM() {
  const d = new Date()
  return pad2(d.getHours()) + ':' + pad2(d.getMinutes())
}

// 返回 YYYY-MM-DD HH:mm:ss
function nowString() {
  const d = new Date()
  return dateStr() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes()) + ':' + pad2(d.getSeconds())
}

// 将 YYYY-MM-DD 显示为 2026年9月7日
function cnDate(dateStrValue) {
  if (!dateStrValue) return ''
  const arr = String(dateStrValue).split('-')
  if (arr.length !== 3) return dateStrValue
  return Number(arr[0]) + '年' + Number(arr[1]) + '月' + Number(arr[2]) + '日'
}

// 今天的中文星期
function weekText() {
  const weeks = ['日', '一', '二', '三', '四', '五', '六']
  return '星期' + weeks[new Date().getDay()]
}

// 将月份数字补零，供图表 x 轴使用
function shortDate(dateStrValue) {
  if (!dateStrValue) return ''
  const arr = String(dateStrValue).split('-')
  if (arr.length !== 3) return dateStrValue
  return arr[1] + '/' + arr[2]
}

// 安全取值：把字符串输入转成数字，无法解析时返回空
function toNum(v) {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

module.exports = {
  pad2,
  dateStr,
  timeHM,
  nowString,
  cnDate,
  weekText,
  shortDate,
  toNum
}
