const cloudService = require('../../../utils/cloudService');

Page({
  data: {
    searchText: '',
    recommendFilter: '全部', // 全部, 推荐, 避雷
    dateFilter: '全部', // yyyy-mm-dd
    recommendCount: 0,
    avoidCount: 0,
    recommendRatio: 0
  },

  onLoad() {
    this.checkPermission();
    this.loadReviews();
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

  async loadReviews() {
    wx.showLoading({ title: '加载中' });
    try {
      const reviews = await cloudService.adminGetReviews();
      const recommendCount = reviews.filter(r => r.judgment === 'recommend').length;
      const avoidCount = reviews.filter(r => r.judgment === 'avoid').length;
      const recommendRatio = reviews.length > 0 ? Math.round((recommendCount / reviews.length) * 100) : 0;

      const formattedReviews = reviews.map(r => ({
        ...r,
        createTimeText: this.formatDate(r.createTime || r.createdAt),
        spatialIcon: this.getSpatialIcon(r.spatialLevel || 'spot')
      }));
      this.allReviews = formattedReviews;
      this.setData({ 
        reviews: formattedReviews,
        recommendCount,
        avoidCount,
        recommendRatio
      });
      this.applyFilter();
    } catch (err) {
      console.error('Load reviews failed', err);
    } finally {
      wx.hideLoading();
    }
  },

  onSearchInput(e) {
    this.setData({ searchText: e.detail.value }, () => {
      this.applyFilter();
    });
  },

  onRecommendFilterChange(e) {
    this.setData({ recommendFilter: e.currentTarget.dataset.val }, () => {
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
    const filter = this.data.recommendFilter;
    const dateFilter = this.data.dateFilter;
    let filtered = this.allReviews || [];
    
    if (query) {
      filtered = filtered.filter(r => 
        (r.name && r.name.toLowerCase().includes(query)) ||
        (r.comment && r.comment.toLowerCase().includes(query)) ||
        (r.userName && r.userName.toLowerCase().includes(query))
      );
    }

    if (filter === '推荐') {
      filtered = filtered.filter(r => r.rating === 1 || r.rating > 0);
    } else if (filter === '避雷') {
      filtered = filtered.filter(r => r.rating === -1 || r.rating <= 0);
    }

    if (dateFilter !== '全部') {
      filtered = filtered.filter(r => {
        const t = r.createTime || r.createdAt;
        if (!t) return false;
        const d = new Date(t);
        const dateStr = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
        return dateStr === dateFilter;
      });
    }

    this.setData({ filteredReviews: filtered });
  },

  async toggleFreeze(e) {
    const { id, status } = e.currentTarget.dataset;
    const newStatus = status === 'frozen' ? 'active' : 'frozen';
    
    wx.showLoading({ title: '处理中' });
    try {
      await cloudService.adminUpdateReviewStatus(id, newStatus);
      wx.showToast({ title: newStatus === 'frozen' ? '已冻结' : '已恢复' });
      this.loadReviews();
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  getSpatialIcon(level) {
    if (level === 'place') return '../../../images/icons/marker_place_vibrant.svg';
    if (level === 'area') return '../../../images/icons/marker_area_vibrant.svg';
    return '../../../images/icons/marker_spot_vibrant.svg';
  },

  formatDate(date) {
    if (!date) return '未知';
    const d = new Date(date);
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    const h = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${y}-${m}-${day} ${h}:${min}`;
  },

  jumpToFrontend(e) {
    const anchorId = e.currentTarget.dataset.id;
    if (anchorId) {
      wx.navigateTo({
        url: `/pages/place-detail/place-detail?id=${anchorId}`
      });
    }
  }
});
