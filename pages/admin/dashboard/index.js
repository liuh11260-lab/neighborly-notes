const cloudService = require('../../../utils/cloudService');

Page({
  data: {
    stats: {
      locations: 0,
      reviews: 0,
      themes: 0,
      users: 0,
      lastUpdatedText: '从未'
    }
  },

  async onLoad() {
    await this.checkPermission();
    await this.loadStats();
  },

  async checkPermission() {
    wx.showLoading({ title: '鉴权中' });
    try {
      const { isAdmin } = await cloudService.isAdmin();
      if (!isAdmin) {
        wx.hideLoading();
        wx.showToast({ title: '无权限访问', icon: 'none' });
        setTimeout(() => {
          wx.reLaunch({ url: '/pages/discover/discover' });
        }, 1500);
      }
    } catch (err) {
      wx.hideLoading();
      wx.reLaunch({ url: '/pages/discover/discover' });
    } finally {
      wx.hideLoading();
    }
  },

  async loadStats() {
    try {
      const stats = await cloudService.adminGetStats();
      this.setData({
        stats: {
          ...stats,
          lastUpdatedText: this.formatTime(stats.lastUpdated)
        }
      });
    } catch (err) {
      console.error('Load stats failed', err);
    }
  },

  formatTime(timestamp) {
    if (!timestamp) return '从未';
    const date = new Date(timestamp);
    return `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()}`;
  },

  goToThemes() {
    wx.navigateTo({ url: '/pages/admin/themes/index' });
  },

  goToLocations() {
    wx.navigateTo({ url: '/pages/admin/locations/index' });
  },

  goToUsers() {
    wx.navigateTo({ url: '/pages/admin/users/index' });
  },

  goToReviews() {
    wx.navigateTo({ url: '/pages/admin/reviews/index' });
  },

  goToViolations() {
    wx.navigateTo({ url: '/pages/admin/violations/index' });
  },

  onLogout() {
    wx.reLaunch({ url: '/pages/discover/discover' });
  }
});
