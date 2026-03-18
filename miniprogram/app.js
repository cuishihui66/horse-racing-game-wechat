const DEFAULT_CONFIG = {
  apiBaseUrl: 'http://127.0.0.1:3001',
  devAuthMode: true,
};

App({
  onLaunch() {
    const logs = wx.getStorageSync('logs') || [];
    logs.unshift(Date.now());
    wx.setStorageSync('logs', logs);

    this.globalData.config = DEFAULT_CONFIG;
    this.globalData.devNickname = wx.getStorageSync('devNickname') || '';

    if (this.globalData.config.devAuthMode) {
      this.ensureDevUser().catch((error) => {
        console.error('Dev login failed:', error);
      });
    }
  },

  globalData: {
    userInfo: null,
    gameSessionId: null,
    authToken: null,
    currentUser: null,
    config: DEFAULT_CONFIG,
    devNickname: '',
  },

  getApiBaseUrl() {
    return this.globalData.config.apiBaseUrl;
  },

  request({ url, method = 'GET', data, header = {} }) {
    return new Promise((resolve, reject) => {
      wx.request({
        url,
        method,
        data,
        header,
        success: (response) => {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(response);
            return;
          }

          const payload = response.data || {};
          const message = payload.message || payload.error || `请求失败 (${response.statusCode})`;
          reject(new Error(Array.isArray(message) ? message.join(', ') : message));
        },
        fail: (error) => reject(error),
      });
    });
  },

  uploadFile({ url, filePath, name, header = {} }) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url,
        filePath,
        name,
        header,
        success: (response) => {
          let payload = {};
          try {
            payload = JSON.parse(response.data);
          } catch (error) {
            reject(new Error('上传响应不是有效 JSON'));
            return;
          }

          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(payload);
            return;
          }

          const message = payload.message || payload.error || `上传失败 (${response.statusCode})`;
          reject(new Error(Array.isArray(message) ? message.join(', ') : message));
        },
        fail: (error) => reject(error),
      });
    });
  },

  async ensureDevUser(nickname) {
    if (!this.globalData.config.devAuthMode) {
      return null;
    }

    if (this.globalData.authToken) {
      return this.globalData.authToken;
    }

    const finalNickname =
      nickname ||
      this.globalData.devNickname ||
      `测试用户${Date.now().toString().slice(-4)}`;

    const response = await this.request({
      url: `${this.getApiBaseUrl()}/auth/dev-user-login`,
      method: 'POST',
      data: { nickname: finalNickname },
      header: {
        'Content-Type': 'application/json',
      },
    });

    this.globalData.authToken = response.data.accessToken;
    this.globalData.currentUser = response.data.user;
    this.globalData.devNickname = response.data.user.nickname || finalNickname;
    wx.setStorageSync('devNickname', this.globalData.devNickname);

    return this.globalData.authToken;
  },

  getAuthHeader(extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (this.globalData.authToken) {
      headers.Authorization = `Bearer ${this.globalData.authToken}`;
    }
    return headers;
  },

  parseSessionId(rawValue) {
    if (!rawValue) {
      return '';
    }

    const value = `${rawValue}`.trim();
    const match = value.match(/[?&]sessionId=([^&]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }

    return value;
  },
});
