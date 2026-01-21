// miniprogram/pages/scan/scan.js
Page({
  data: {

  },
  onLoad: function (options) {

  },
  scanCode: function () {
    const app = getApp();
    wx.scanCode({
      success: (res) => {
        console.log("Scan result:", res);
        // Assuming the QR code content contains a gameSessionId
        // For now, we'll use a mocked session ID
        const gameSessionId = res.result || 'mocked_game_session_123';
        app.globalData.gameSessionId = gameSessionId;

        wx.showToast({
          title: '扫码成功',
          icon: 'success',
          duration: 1500,
          complete: () => {
            wx.navigateTo({
              url: '/pages/success/success?gameSessionId=' + gameSessionId,
            });
          }
        });
      },
      fail: (err) => {
        console.error("Scan failed:", err);
        wx.showToast({
          title: '扫码失败',
          icon: 'none',
          duration: 2000
        });
      }
    });
  }
})