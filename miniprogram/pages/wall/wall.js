const app = getApp();

Page({
  data: {
    wallSessionId: null,
    messageContent: '',
    selectedImage: '',
    isSending: false,
  },

  onLoad(options) {
    if (options.wallSessionId) {
      this.setData({
        wallSessionId: app.parseSessionId(options.wallSessionId),
      });
    }

    app.ensureDevUser().catch((error) => {
      console.error('Dev user bootstrap failed:', error);
    });
  },

  scanWallCode() {
    wx.scanCode({
      success: (result) => {
        const wallSessionId = app.parseSessionId(result.result);
        if (!wallSessionId) {
          wx.showToast({ title: '无效的二维码', icon: 'none' });
          return;
        }

        this.setData({ wallSessionId });
        wx.showToast({ title: '加入留言成功', icon: 'success' });
      },
      fail: (error) => {
        console.error('Scan failed:', error);
        wx.showToast({ title: '扫码失败', icon: 'none' });
      },
    });
  },

  bindInput(event) {
    this.setData({
      messageContent: event.detail.value,
    });
  },

  chooseImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (result) => {
        this.setData({
          selectedImage: result.tempFilePaths[0],
        });
      },
      fail: (error) => {
        console.error('Choose image failed:', error);
        wx.showToast({ title: '选择图片失败', icon: 'none' });
      },
    });
  },

  removeImage() {
    this.setData({
      selectedImage: '',
    });
  },

  async sendMessage() {
    const { wallSessionId, messageContent, selectedImage } = this.data;
    if (!wallSessionId) {
      wx.showToast({ title: '请先扫码加入留言会话', icon: 'none' });
      return;
    }

    if (!messageContent && !selectedImage) {
      wx.showToast({ title: '内容不能为空', icon: 'none' });
      return;
    }

    this.setData({ isSending: true });
    wx.showLoading({ title: '发送中...' });

    try {
      await app.ensureDevUser();
      let imageUrl = '';

      if (selectedImage) {
        const uploadResult = await app.uploadFile({
          url: `${app.getApiBaseUrl()}/wall/upload`,
          filePath: selectedImage,
          name: 'file',
          header: app.getAuthHeader(),
        });
        imageUrl = uploadResult.imageUrl || '';
      }

      await app.request({
        url: `${app.getApiBaseUrl()}/wall/${wallSessionId}/submit`,
        method: 'POST',
        data: {
          type: selectedImage ? (messageContent ? 'text_image' : 'image') : 'text',
          content: messageContent,
          imageUrl,
        },
        header: app.getAuthHeader({ 'Content-Type': 'application/json' }),
      });

      wx.showToast({ title: '发送成功，等待审核', icon: 'success' });
      this.setData({
        messageContent: '',
        selectedImage: '',
      });
    } catch (error) {
      console.error('Send message failed:', error);
      wx.showToast({ title: error.message || '发送失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ isSending: false });
    }
  },
});
