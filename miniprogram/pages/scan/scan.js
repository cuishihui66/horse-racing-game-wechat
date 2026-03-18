const app = getApp();

Page({
  data: {
    manualSessionId: '',
    isJoining: false,
  },

  onLoad() {
    app.ensureDevUser().catch((error) => {
      console.error('Dev user bootstrap failed:', error);
    });
  },

  bindManualSessionInput(event) {
    this.setData({
      manualSessionId: event.detail.value,
    });
  },

  async joinSession(sessionId) {
    if (!sessionId) {
      wx.showToast({
        title: '请输入有效会话 ID',
        icon: 'none',
      });
      return;
    }

    this.setData({ isJoining: true });
    wx.showLoading({ title: '加入中...' });

    try {
      await app.ensureDevUser();
      await app.request({
        url: `${app.getApiBaseUrl()}/game/${sessionId}/join`,
        method: 'POST',
        data: {
          wechatNickname: app.globalData.currentUser?.nickname || app.globalData.devNickname || '测试用户',
          avatarUrl: app.globalData.currentUser?.avatarUrl || '',
        },
        header: app.getAuthHeader({ 'Content-Type': 'application/json' }),
      });

      app.globalData.gameSessionId = sessionId;
      wx.navigateTo({
        url: `/pages/success/success?gameSessionId=${encodeURIComponent(sessionId)}`,
      });
    } catch (error) {
      wx.showToast({
        title: error.message || '加入失败',
        icon: 'none',
        duration: 2000,
      });
    } finally {
      wx.hideLoading();
      this.setData({ isJoining: false });
    }
  },

  scanCode() {
    wx.scanCode({
      success: async (result) => {
        const sessionId = app.parseSessionId(result.result);
        await this.joinSession(sessionId);
      },
      fail: (error) => {
        console.error('Scan failed:', error);
        wx.showToast({
          title: '扫码失败',
          icon: 'none',
          duration: 2000,
        });
      },
    });
  },

  async submitManualSession() {
    await this.joinSession(app.parseSessionId(this.data.manualSessionId));
  },
});
