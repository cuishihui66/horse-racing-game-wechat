// miniprogram/pages/wall/wall.js
const app = getApp();

Page({
  data: {
    wallSessionId: null,
    messageContent: '',
    selectedImage: '', // Stores local path of selected image for preview
    isSending: false,
  },

  onLoad: function (options) {
    if (options.wallSessionId) {
      this.setData({
        wallSessionId: options.wallSessionId
      });
      console.log('Wall session ID from options:', options.wallSessionId);
    } else {
      console.log('No wallSessionId in options, waiting for scan.');
    }
  },

  // Function to handle scanning a QR code for a wall message session
  scanWallCode: function () {
    wx.scanCode({
      success: (res) => {
        console.log("Scan result:", res);
        // Assuming the QR code content contains a wallSessionId, e.g., in the path
        // For now, extract a mock ID or from res.result
        const scannedId = res.result.split('sessionId=')[1] || 'mock_wall_session_123';
        if (scannedId) {
          this.setData({
            wallSessionId: scannedId
          });
          wx.showToast({
            title: '加入留言成功',
            icon: 'success',
            duration: 1500
          });
        } else {
          wx.showToast({
            title: '无效的二维码',
            icon: 'none',
            duration: 2000
          });
        }
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
  },

  // Update message content
  bindInput: function (e) {
    this.setData({
      messageContent: e.detail.value
    });
  },

  // Choose image from album or camera
  chooseImage: function () {
    const self = this;
    wx.chooseImage({
      count: 1, // Only one image for now
      sizeType: ['compressed'], // Compressed image
      sourceType: ['album', 'camera'], // From album or camera
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        self.setData({
          selectedImage: tempFilePath
        });
        wx.showToast({
          title: '图片已选择',
          icon: 'success',
          duration: 1000
        });
      },
      fail: (err) => {
        console.error("Choose image failed:", err);
        wx.showToast({
          title: '选择图片失败',
          icon: 'none',
          duration: 1500
        });
      }
    });
  },

  // Remove selected image
  removeImage: function () {
    this.setData({
      selectedImage: ''
    });
    wx.showToast({
      title: '图片已移除',
      icon: 'none',
      duration: 1000
    });
  },

  // Send message and/or image
  sendMessage: function () {
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

    // Mock Backend API URL (replace with your actual backend endpoint)
    const backendBaseUrl = 'http://localhost:3000'; // Assume backend runs on port 3000
    const submitEndpoint = `${backendBaseUrl}/wall/${wallSessionId}/submit`;
    const uploadEndpoint = `${backendBaseUrl}/upload`; // Placeholder for image upload

    const sendData = async (imageUrl = null) => {
      try {
        const requestBody = {
          type: selectedImage ? (messageContent ? 'text_image' : 'image') : 'text',
          content: messageContent,
          imageUrl: imageUrl
        };

        // In a real app, you would pass an auth token here
        const res = await wx.request({
          url: submitEndpoint,
          method: 'POST',
          data: requestBody,
          header: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${app.globalData.authToken || 'mock-miniprogram-token'}` // Placeholder token
          }
        });

        if (res.statusCode === 201 || res.statusCode === 200) {
          wx.showToast({ title: '发送成功，等待审核', icon: 'success' });
          this.setData({ messageContent: '', selectedImage: '', isSending: false });
        } else {
          throw new Error(res.data.message || '发送失败');
        }
      } catch (error) {
        console.error("Send message failed:", error);
        wx.showToast({ title: error.message || '发送失败', icon: 'none' });
        this.setData({ isSending: false });
      } finally {
        wx.hideLoading();
      }
    };

    if (selectedImage) {
      // First, upload image if selected
      wx.uploadFile({
        url: uploadEndpoint, // Backend endpoint for file upload
        filePath: selectedImage,
        name: 'file', // The name of the form-data field for the file
        header: {
            'Authorization': `Bearer ${app.globalData.authToken || 'mock-miniprogram-token'}` // Placeholder token
        },
        success: (res) => {
          const data = JSON.parse(res.data);
          if (res.statusCode === 201 || res.statusCode === 200) {
            sendData(data.imageUrl); // Send message with uploaded image URL
          } else {
            throw new Error(data.message || '图片上传失败');
          }
        },
        fail: (err) => {
          console.error("Upload image failed:", err);
          wx.showToast({ title: '图片上传失败', icon: 'none' });
          this.setData({ isSending: false });
        },
        complete: () => {
          wx.hideLoading();
        }
      });
    } else {
      sendData(); // Send text-only message
    }
  },

  onShareAppMessage: function () {
    // Optional: Allow users to share the mini-program page
  }
});