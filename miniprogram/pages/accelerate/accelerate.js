// miniprogram/pages/accelerate/accelerate.js
Page({
  data: {
    tapCount: 0,
    gameSessionId: '',
    isTapping: false,
    gameStatus: '准备冲刺',
    tapHistory: []
  },

  onLoad: function (options) {
    const app = getApp();
    this.setData({
      gameSessionId: app.globalData.gameSessionId || '未知游戏编号'
    });
    console.log('Accelerate page loaded for session:', this.data.gameSessionId);
    
    // Start tap rate monitoring
    this.startTapRateMonitoring();
  },

  onShow: function() {
    // 页面显示时的处理
    this.updateGameStatus();
  },

  accelerateTap: function () {
    // Only increment if game is active (mocked for now)
    if (this.data.gameSessionId && this.data.gameSessionId !== '未知游戏编号') {
      let newTapCount = this.data.tapCount + 1;
      const tapTime = Date.now();
      
      this.setData({
        tapCount: newTapCount,
        isTapping: true, // For visual feedback if needed, e.g., to quickly change button state
        tapHistory: [...this.data.tapHistory.slice(-9), tapTime] // Keep last 10 taps for rate calculation
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
      
      // Update game status based on tap rate
      this.updateGameStatus();
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

  // Start monitoring tap rate for game status updates
  startTapRateMonitoring: function() {
    // Update status periodically
    this.tapRateInterval = setInterval(() => {
      this.updateGameStatus();
    }, 1000);
  },

  // Calculate tap rate and update game status
  updateGameStatus: function() {
    const now = Date.now();
    const recentTaps = this.data.tapHistory.filter(time => now - time < 1000); // Taps in last second
    const tapRate = recentTaps.length;
    
    let status = '准备冲刺';
    if (tapRate > 0) status = '蓄势待发';
    if (tapRate > 3) status = '快速加速';
    if (tapRate > 6) status = '全力冲刺';
    if (tapRate > 10) status = '极限加速！';
    
    this.setData({
      gameStatus: status
    });
  },

  onUnload: function() {
    // 清理定时器
    if (this.tapRateInterval) {
      clearInterval(this.tapRateInterval);
    }
  },

  onShareAppMessage: function () {
    // Optional: Allow users to share the mini-program
    return {
      title: '快来参加赛马摇一摇游戏！',
      path: '/pages/accelerate/accelerate'
    };
  }
})