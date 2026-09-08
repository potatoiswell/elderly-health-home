// custom-tab-bar/index.js —— 自定义底部导航（适老化：大图标 + 文字标签）
Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '首页', icon: '🏠' },
      { pagePath: '/pages/records/records', text: '健康记录', icon: '❤️' },
      { pagePath: '/pages/medicines/medicines', text: '用药', icon: '💊' },
      { pagePath: '/pages/profile/profile', text: '我的', icon: '👤' }
    ]
  },
  methods: {
    // 点击底部导航切换页面
    onTabTap(e) {
      const index = Number(e.currentTarget.dataset.index)
      const item = this.data.list[index]
      if (index === this.data.selected) return
      wx.switchTab({ url: item.pagePath })
    }
  }
})
