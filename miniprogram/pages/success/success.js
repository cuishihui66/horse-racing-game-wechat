// miniprogram/pages/success/success.js
Page({
  data: {
    gameSessionId: ''
  },
  onLoad: function (options) {
    this.setData({
      gameSessionId: options.gameSessionId || getApp().globalData.gameSessionId || '未知游戏编号'
    });
  },
  goToGame: function () {
    wx.redirectTo({
      url: '/pages/accelerate/accelerate',
    });
  }
})