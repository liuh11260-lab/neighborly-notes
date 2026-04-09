const auth = require('../../utils/auth');

Page({
  data: {
    cacheSize: '0KB'
  },

  onLoad: function() {
    // Original call to calculateCacheSize is moved to onShow
  },

  onShow: function() {
    if (!auth.guardPage()) return;
    this.calculateCacheSize();
  },

  calculateCacheSize: function() {
    try {
      const res = wx.getStorageInfoSync();
      const sizeKB = res.currentSize;
      let displaySize = '';
      
      if (sizeKB >= 1024) {
        displaySize = (sizeKB / 1024).toFixed(2) + ' MB';
      } else {
        displaySize = sizeKB.toFixed(1) + ' KB';
      }
      
      this.setData({
        cacheSize: displaySize
      });
    } catch (e) {
      console.error('获取缓存大小失败', e);
      this.setData({ cacheSize: '0.0 KB' });
    }
  },

  clearCache: function() {
    wx.showModal({
      title: '提示',
      content: '清除缓存将清空所有本地存储（包括登录信息和定位记录），确定要清除吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorage({
            success: () => {
              wx.showToast({ title: '清理成功' });
              this.calculateCacheSize();
              // Return to profile to refresh state
              setTimeout(() => {
                wx.reLaunch({
                  url: '/pages/profile/profile'
                });
              }, 1000);
            }
          });
        }
      }
    });
  },

  onLogout: function() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('userInfo');
          wx.showToast({ title: '已退出' });
          setTimeout(() => {
            wx.reLaunch({
              url: '/pages/profile/profile'
            });
          }, 1000);
        }
      }
    });
  },

  viewTerms: function() {
    wx.navigateTo({
      url: '/pages/legal/terms/terms'
    });
  },

  viewPrivacy: function() {
    wx.navigateTo({
      url: '/pages/legal/privacy/privacy'
    });
  },

  onAdminGate: function() {
    // Secret entry for admin dashboard
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo) {
      console.log('Admin gate access blocked: User not logged in');
      return;
    }

    const cloudService = require('../../utils/cloudService');
    wx.showLoading({ title: '系统验证' });
    
    setTimeout(async () => {
      try {
        const { isAdmin } = await cloudService.isAdmin();
        wx.hideLoading();
        if (isAdmin) {
          wx.navigateTo({ url: '/pages/admin/dashboard/index' });
        } else {
          // Silent fail for non-admins to keep it secret
          console.log('Admin gate access denied');
        }
      } catch (err) {
        wx.hideLoading();
      }
    }, 500);
  }
});
