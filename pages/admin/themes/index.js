const cloudService = require('../../../utils/cloudService');

Page({
  data: {
    themes: [],
    filteredThemes: [],
    searchText: '',
    currentStatusFilter: '全部',
    dateFilter: '全部'
  },

  async onLoad() {
    await this.checkPermission();
    await this.loadThemes();
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

  async loadThemes() {
    wx.showLoading({ title: '获取中' });
    try {
      const themes = await cloudService.adminGetThemes();
      const formattedThemes = (themes || []).map(t => ({
        ...t,
        locationCount: (t.anchorIds || t.locationIds || []).length,
        createTimeText: this.formatDate(t.createdAt || t.createTime || t._createTime)
      }));
      this.allThemes = formattedThemes;
      this.setData({ 
        themes: formattedThemes,
        filteredThemes: formattedThemes
      });
      this.applyFilter();
    } catch (err) {
      console.error('Load admin themes failed', err);
    } finally {
      wx.hideLoading();
    }
  },

  onSearchInput(e) {
    this.setData({ searchText: e.detail.value }, () => {
      this.applyFilter();
    });
  },

  onStatusFilterChange(e) {
    this.setData({ currentStatusFilter: e.currentTarget.dataset.val }, () => {
      this.applyFilter();
    });
  },

  onDateChange(e) {
    this.setData({ dateFilter: e.detail.value }, () => {
      this.applyFilter();
    });
  },

  clearDateFilter() {
    this.setData({ dateFilter: '全部' }, () => {
      this.applyFilter();
    });
  },

  applyFilter() {
    const query = this.data.searchText.trim().toLowerCase();
    const statusFilter = this.data.currentStatusFilter;
    const dateFilter = this.data.dateFilter;
    let filtered = this.allThemes || [];
    
    if (query) {
      filtered = filtered.filter(t => 
        (t.title && t.title.toLowerCase().includes(query)) ||
        (t._id && t._id.toLowerCase().includes(query))
      );
    }

    if (statusFilter !== '全部') {
      const statusMap = { '正常': 'active', '已冻结': 'frozen' };
      filtered = filtered.filter(t => {
        const status = t.status || 'active';
        return status === statusMap[statusFilter];
      });
    }

    if (dateFilter !== '全部') {
      filtered = filtered.filter(t => {
        const timestamp = t.createdAt || t.createTime || t._createTime;
        if (!timestamp) return false;
        const d = new Date(timestamp);
        const dateStr = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
        return dateStr === dateFilter;
      });
    }

    this.setData({ filteredThemes: filtered });
  },

  formatDate(date) {
    if (!date) return '未知';
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return '未知';
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      const h = d.getHours().toString().padStart(2, '0');
      const min = d.getMinutes().toString().padStart(2, '0');
      return `${y}-${m}-${day} ${h}:${min}`;
    } catch (e) {
      return '未知';
    }
  },

  async toggleFreeze(e) {
    const { id, status } = e.currentTarget.dataset;
    const newStatus = status === 'frozen' ? 'active' : 'frozen';
    
    wx.showLoading({ title: '更新中' });
    try {
      await wx.cloud.database().collection('themes').doc(id).update({
        data: { status: newStatus, updatedAt: wx.cloud.database().serverDate() }
      });
      wx.showToast({ title: newStatus === 'frozen' ? '已冻结' : '已恢复' });
      await this.loadThemes();
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  viewLocations(e) {
    // Just a placeholder or navigate to a specialized view
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '主题详情',
      content: `主题 ID: ${id}\n功能完善中...`,
      showCancel: false
    });
  },

  jumpToFrontend(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/themes/share/share?id=${id}`
    });
  }
});
