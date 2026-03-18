const app = getApp();

function formatStatusText(status, countdownEndsAt) {
  switch (status) {
    case 'qr_scanning':
      return { title: '报名已完成', hint: '主持人准备赛道中，先发一条弹幕热热场。', canTap: false };
    case 'ready_to_start':
      return { title: '准备就绪', hint: '小马已经站上起跑线，等待主持人按下开始。', canTap: false };
    case 'countdown': {
      const seconds = Math.max(1, Math.ceil((Number(countdownEndsAt || 0) - Date.now()) / 1000));
      return { title: `倒计时 ${seconds}`, hint: '马上开始，手指准备好。', canTap: false };
    }
    case 'playing':
      return { title: '全速冲刺', hint: '点一次前进一格，越快越有机会进前五。', canTap: true };
    case 'finished':
      return { title: '比赛结束', hint: '等待大屏公布最终榜单。', canTap: false };
    default:
      return { title: '等待主持人创建游戏', hint: '请先扫码加入一场比赛。', canTap: false };
  }
}

Page({
  data: {
    gameSessionId: '',
    sessionTitle: '赛马摇一摇',
    statusTitle: '等待主持人准备',
    phaseHint: '加入成功后，主持人会先让大家扫码入场。',
    canTap: false,
    isTapping: false,
    tapCount: 0,
    progressPercent: 0,
    currentRank: '--',
    messageContent: '',
    isSending: false,
  },

  async onLoad(options) {
    const gameSessionId = options.gameSessionId || app.globalData.gameSessionId || '';
    this.setData({ gameSessionId });
    await app.ensureDevUser();
    this.refreshSessionState();
    this.pollTimer = setInterval(() => {
      this.refreshSessionState();
    }, 1000);
  },

  onUnload() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
  },

  bindMessageInput(event) {
    this.setData({ messageContent: event.detail.value });
  },

  async refreshSessionState() {
    if (!this.data.gameSessionId) {
      return;
    }

    try {
      const response = await app.request({
        url: `${app.getApiBaseUrl()}/game/${this.data.gameSessionId}/state`,
        method: 'GET',
        header: app.getAuthHeader({ 'Content-Type': 'application/json' }),
      });

      const session = response.data || {};
      const currentUserId = app.globalData.currentUser?.id;
      const participants = session.participants || [];
      const currentParticipant = participants.find((item) => item.userId === currentUserId) || {};
      const currentRankEntry =
        (session.currentRankings || []).find((item) => item.userId === currentUserId) ||
        (session.finalRankings || []).find((item) => item.userId === currentUserId);
      const statusInfo = formatStatusText(session.status, session.countdownEndsAt);

      this.setData({
        sessionTitle: session.title || '赛马摇一摇',
        statusTitle: statusInfo.title,
        phaseHint: statusInfo.hint,
        canTap: statusInfo.canTap,
        tapCount: currentParticipant.tapCount || 0,
        progressPercent: currentParticipant.progressPercent || 0,
        currentRank: currentRankEntry ? currentRankEntry.rank : '--',
      });
    } catch (error) {
      console.error('Failed to refresh session state:', error);
    }
  },

  async accelerateTap() {
    if (!this.data.gameSessionId) {
      wx.showToast({ title: '请先加入比赛', icon: 'none' });
      return;
    }

    if (!this.data.canTap) {
      wx.showToast({ title: this.data.statusTitle, icon: 'none' });
      return;
    }

    this.setData({ isTapping: true });
    setTimeout(() => {
      this.setData({ isTapping: false });
    }, 120);

    try {
      const response = await app.request({
        url: `${app.getApiBaseUrl()}/game/${this.data.gameSessionId}/accelerate`,
        method: 'POST',
        header: app.getAuthHeader({ 'Content-Type': 'application/json' }),
      });

      const payload = response.data || {};
      if (payload.accepted === false) {
        wx.showToast({ title: '当前还不能加速', icon: 'none' });
      }

      this.refreshSessionState();
    } catch (error) {
      console.error('Accelerate failed:', error);
    }
  },

  async sendMessage() {
    if (!this.data.gameSessionId) {
      wx.showToast({ title: '请先加入比赛', icon: 'none' });
      return;
    }

    if (!this.data.messageContent.trim()) {
      wx.showToast({ title: '先写点内容再发送', icon: 'none' });
      return;
    }

    this.setData({ isSending: true });
    wx.showLoading({ title: '发送中...' });

    try {
      await app.request({
        url: `${app.getApiBaseUrl()}/wall/${this.data.gameSessionId}/submit`,
        method: 'POST',
        data: {
          type: 'text',
          content: this.data.messageContent.trim(),
        },
        header: app.getAuthHeader({ 'Content-Type': 'application/json' }),
      });

      wx.showToast({ title: '已提交，等待审核', icon: 'success' });
      this.setData({ messageContent: '' });
    } catch (error) {
      console.error('Send message failed:', error);
      wx.showToast({ title: error.message || '发送失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ isSending: false });
    }
  },
});
