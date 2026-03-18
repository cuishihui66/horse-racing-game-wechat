const app = getApp();

Page({
  data: {
    gameSessionId: '',
  },

  onLoad(options) {
    const gameSessionId = options.gameSessionId || app.globalData.gameSessionId || '';
    this.setData({ gameSessionId });
  },

  goToGame() {
    wx.redirectTo({
      url: `/pages/accelerate/accelerate?gameSessionId=${encodeURIComponent(this.data.gameSessionId)}`,
    });
  },
});
