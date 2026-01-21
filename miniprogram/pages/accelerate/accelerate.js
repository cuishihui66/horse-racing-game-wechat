// miniprogram/pages/accelerate/accelerate.js
Page({
  data: {
    tapCount: 0,
    gameSessionId: '',
    isTapping: false
  },
  onLoad: function (options) {
    const app = getApp();
    this.setData({
      gameSessionId: app.globalData.gameSessionId || '未知游戏编号'
    });
    console.log('Accelerate page loaded for session:', this.data.gameSessionId);
  },

  accelerateTap: function () {
    // Only increment if game is active (mocked for now)
    if (this.data.gameSessionId && this.data.gameSessionId !== '未知游戏编号') {
      let newTapCount = this.data.tapCount + 1;
      this.setData({
        tapCount: newTapCount,
        isTapping: true // For visual feedback if needed, e.g., to quickly change button state
      });

      // Simulate sending acceleration event to backend
      console.log(`Sending acceleration for session ${this.data.gameSessionId}, tap count: ${newTapCount}`);
      // In a real scenario, this would send a WebSocket message or API call
      // e.g., app.sendAcceleration(this.data.gameSessionId, newTapCount);

      // Reset tapping state after a short delay for animation/feedback
      setTimeout(() => {
        this.setData({
          isTapping: false
        });
      }, 100);
    } else {
      wx.showToast({
        title: '请先扫码加入游戏',
        icon: 'none',
        duration: 2000
      });
      // Optionally navigate back to scan page
      // wx.redirectTo({
      //   url: '/pages/scan/scan',
      // });
    }
  },

  onShareAppMessage: function () {
    // Optional: Allow users to share the mini-program
  }
})