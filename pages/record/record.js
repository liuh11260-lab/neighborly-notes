const app = getApp();
const auth = require('../../utils/auth');

Page({
  data: {
    selectedLocation: null
  },

  onLoad: function(options) {
    
  },

  onShow: function() {
    // Force Login Check on Entry
    auth.ensureLogin(this);

    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1 // Index of Record tab
      });
    }
  },

  chooseLocation: function() {
    if (!auth.ensureLogin(this)) return;

    wx.chooseLocation({
      success: (res) => {
        if (res.name) {
          // Direct navigation to Place Detail (Universal Judgment Interface)
          // Defaulting layer to 'Life' since native map doesn't provide category
          wx.navigateTo({
            url: `/pages/place-detail/place-detail?title=${encodeURIComponent(res.name)}&address=${encodeURIComponent(res.address)}&lat=${res.latitude}&lng=${res.longitude}&layer=search_poi`
          });
        }
      },
      fail: (err) => {
        if (err.errMsg && err.errMsg.indexOf('auth deny') > -1) {
          wx.showModal({
            title: '需要定位权限',
            content: '请在设置中开启定位权限以选择地点',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.openSetting();
              }
            }
          });
        }
      }
    });
  },

  goToMyThemes: function() {
    if (!auth.ensureLogin(this)) return;
    wx.navigateTo({
      url: '/pages/themes/index/index'
    });
  },

  onCloseLoginPopup: function() {
    this.setData({ showLoginPopup: false });
  },

  onLoginSuccess: function(e) {
    const { userInfo } = e.detail;
    wx.setStorageSync('userInfo', userInfo);
    this.setData({
      showLoginPopup: false
    });
    // Optional: auto-trigger the action that was blocked
  }
});
