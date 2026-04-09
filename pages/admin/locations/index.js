const cloudService = require('../../../utils/cloudService');

Page({
  data: {
    searchText: '',
    currentCategory: '全部',
    currentStatusFilter: '全部',
    dateFilter: '全部',
    categories: ['全部', '餐饮', '咖啡', '购物', '生活', '休闲']
  },

  onLoad() {
    this.checkPermission();
    this.loadLocations();
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

  async loadLocations() {
    wx.showLoading({ title: '加载中' });
    try {
      const locations = await cloudService.adminGetLocations();
      const formattedLocations = (locations || []).map(l => ({
        ...l,
        createTimeText: this.formatDate(l.createdAt || l.createTime || l._createTime),
        spatialIcon: this.getSpatialIcon(l.spatialLevel || 'spot')
      }));
      this.allLocations = formattedLocations;
      this.setData({ 
        locations: formattedLocations,
        filteredLocations: formattedLocations
      });
      this.applyFilter();
    } catch (err) {
      console.error('Load locations failed', err);
    } finally {
      wx.hideLoading();
    }
  },

  onSearchInput(e) {
    this.setData({ searchText: e.detail.value }, () => {
      this.applyFilter();
    });
  },

  onCategoryChange(e) {
    this.setData({ currentCategory: e.currentTarget.dataset.val }, () => {
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
    const category = this.data.currentCategory;
    const statusFilter = this.data.currentStatusFilter;
    const dateFilter = this.data.dateFilter;
    
    let filtered = this.allLocations || [];
    
    if (query) {
      filtered = filtered.filter(l => 
        (l.name && l.name.toLowerCase().includes(query)) ||
        (l.address && l.address.toLowerCase().includes(query)) ||
        (l._id && l._id.toLowerCase().includes(query))
      );
    }

    if (category !== '全部') {
      const CAT_MAP = {
        '餐饮': 'Food', '咖啡': 'Drink', '购物': 'Shopping', '生活': 'Life', '休闲': 'Leisure'
      };
      filtered = filtered.filter(l => l.category === category || l.category === CAT_MAP[category]);
    }

    if (statusFilter !== '全部') {
      const statusMap = { '正常': 'active', '已冻结': 'frozen' };
      filtered = filtered.filter(l => l.status === statusMap[statusFilter]);
    }

    if (dateFilter !== '全部') {
      filtered = filtered.filter(l => {
        const t = l.createdAt || l.createTime || l._createTime;
        if (!t) return false;
        const d = new Date(t);
        const dateStr = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
        return dateStr === dateFilter;
      });
    }

    this.setData({ filteredLocations: filtered });
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

  getSpatialIcon(level) {
    if (level === 'place') return '../../../images/icons/marker_place_vibrant.svg';
    if (level === 'area') return '../../../images/icons/marker_area_vibrant.svg';
    return '../../../images/icons/marker_spot_vibrant.svg';
  },

  async onStatusToggle(e) {
    const { id, status } = e.currentTarget.dataset;
    const newStatus = status === 'frozen' ? 'active' : 'frozen';

    wx.showLoading({ title: '设置中' });
    try {
      await cloudService.adminUpdateLocationStatus(id, newStatus);
      await this.loadLocations();
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  recalculate(e) {
    const id = e.currentTarget.dataset.id;
    wx.showLoading({ title: '重算中' });
    setTimeout(() => {
      wx.hideLoading();
      wx.showToast({ title: '摘要已更新', icon: 'success' });
    }, 1000);
  },

  jumpToFrontend(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/place-detail/place-detail?id=${id}`
    });
  }
});
