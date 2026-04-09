const cloudService = require('../../../utils/cloudService');

Page({
  data: {
    searchText: '',
    onlineOnly: false
  },

  onLoad() {
    this.checkPermission();
    this.loadUsers();
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

  async loadUsers() {
    wx.showLoading({ title: '加载中' });
    try {
      const users = await cloudService.adminGetUsers();
      const now = Date.now();
      const formatted = users.map(u => {
        const lastActive = u.lastLoginTime ? new Date(u.lastLoginTime).getTime() : 0;
        return {
          ...u,
          isOnline: (now - lastActive) < (5 * 60 * 1000), // 5 minutes
          lastLoginTimeText: this.formatDate(u.lastLoginTime)
        };
      });
      this.allUsers = formatted;
      this.setData({ 
        users: formatted
      });
      this.applyFilter();
    } catch (err) {
      console.error('Load users failed', err);
    } finally {
      wx.hideLoading();
    }
  },

  onSearchInput(e) {
    this.setData({ searchText: e.detail.value }, () => {
      this.applyFilter();
    });
  },

  toggleOnlineFilter() {
    this.setData({ onlineOnly: !this.data.onlineOnly }, () => {
      this.applyFilter();
    });
  },

  applyFilter() {
    const query = this.data.searchText.trim().toLowerCase();
    const onlineOnly = this.data.onlineOnly;
    let filtered = this.allUsers || [];
    
    if (query) {
      filtered = filtered.filter(u => 
        (u.nickName && u.nickName.toLowerCase().includes(query)) ||
        (u._id && u._id.toLowerCase().includes(query))
      );
    }

    if (onlineOnly) {
      filtered = filtered.filter(u => u.isOnline);
    }

    this.setData({ filteredUsers: filtered });
  },

  async toggleFreeze(e) {
    const { id, status } = e.currentTarget.dataset;
    const newStatus = status === 'frozen' ? 'active' : 'frozen';
    
    wx.showLoading({ title: '处理中' });
    try {
      await cloudService.adminUpdateUserStatus(id, newStatus);
      wx.showToast({ title: newStatus === 'frozen' ? '已冻结' : '已恢复' });
      this.loadUsers();
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  formatDate(date) {
    if (!date) return '未知';
    const d = new Date(date);
    return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
  }
});
