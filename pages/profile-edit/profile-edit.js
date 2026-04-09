const app = getApp();
const cloudService = require('../../utils/cloudService');

Page({
  data: {
    avatarUrl: '',
    nickName: '',
    canSave: false
  },

  onLoad() {
    this.fetchUserProfile();
  },

  async fetchUserProfile() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    this.setData({
      avatarUrl: userInfo.avatarUrl || '',
      nickName: userInfo.nickName || ''
    });

    const openid = wx.getStorageSync('openid');
    if (openid) {
      try {
        const { data } = await wx.cloud.database().collection('users').where({ _openid: openid }).get();
        if (data.length > 0) {
          const cloudInfo = data[0];
          this.setData({
            avatarUrl: cloudInfo.avatarUrl || this.data.avatarUrl,
            nickName: cloudInfo.nickName || this.data.nickName
          });
          wx.setStorageSync('userInfo', {
            avatarUrl: this.data.avatarUrl,
            nickName: this.data.nickName
          });
        }
      } catch (e) {
        console.error('Fetch cloud profile failed', e);
      }
    }
    this.checkSaveStatus();
  },

  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    this.setData({ avatarUrl });
    this.checkSaveStatus();
  },

  onNicknameInput(e) {
    this.setData({ nickName: e.detail.value });
    this.checkSaveStatus();
  },

  checkSaveStatus() {
    const { avatarUrl, nickName } = this.data;
    this.setData({
      canSave: !!(avatarUrl && nickName)
    });
  },

  async onSave() {
    if (!this.data.canSave) return;
    
    wx.showLoading({ title: '保存中' });
    const { avatarUrl, nickName } = this.data;
    const openid = wx.getStorageSync('openid') || (app.globalData && app.globalData.openid);

    try {
      let finalAvatarUrl = avatarUrl;

      // 1. Upload Avatar if it's a temporary local path
      if (avatarUrl && !avatarUrl.startsWith('cloud://')) {
        const cloudPath = `avatars/${openid || Date.now()}-${Math.floor(Math.random() * 1000)}.png`;
        const uploadRes = await wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: avatarUrl
        });
        finalAvatarUrl = uploadRes.fileID;
      }

      const userInfo = { avatarUrl: finalAvatarUrl, nickName };

      // 2. Update Storage
      wx.setStorageSync('userInfo', userInfo);
      
      // 3. Update Global Data
      app.globalData.userInfo = userInfo;

      // 4. Update Cloud (if user exists)
      if (openid) {
         await cloudService.getOrCreateUser(openid, userInfo);
      } else {
         const loginRes = await wx.cloud.callFunction({ name: 'login' });
         if (loginRes.result && loginRes.result.openid) {
            await cloudService.getOrCreateUser(loginRes.result.openid, userInfo);
         }
      }

      wx.hideLoading();
      wx.showToast({ title: '保存成功' });
      
      setTimeout(() => {
        wx.navigateBack();
      }, 1000);

    } catch (err) {
      console.error('Save profile failed', err);
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  }
});
