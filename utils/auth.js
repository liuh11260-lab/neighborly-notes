/**
 * Authentication Utility
 * Handles login checks and unified login popup triggering
 */
module.exports = {
  /**
   * Check if user is currently logged in
   */
  isLoggedIn() {
    const userInfo = wx.getStorageSync('userInfo');
    const openid = wx.getStorageSync('openid');
    return !!(userInfo && userInfo.nickName && openid);
  },

  /**
   * Ensure user is logged in before proceeding
   * @param {Page} page - The current page instance to trigger the popup on
   * @returns {boolean} - True if logged in, false if popup triggered
   */
  ensureLogin(page) {
    if (this.isLoggedIn()) {
      return true;
    }

    if (page && typeof page.setData === 'function') {
      page.setData({ showLoginPopup: true });
    } else {
      // Fallback for cases where page context isn't available
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
    }
    return false;
  },

  /**
   * Guard for second-level pages (Level 2+ Protection)
   * Redirects to Discover and flags for login popup
   */
  guardPage() {
    if (this.isLoggedIn()) {
      return true;
    }

    const appInstance = getApp();
    if (appInstance) {
      appInstance.globalData.triggerLogin = true;
    }
    
    wx.switchTab({
      url: '/pages/shelf/shelf'
    });
    return false;
  }
};
