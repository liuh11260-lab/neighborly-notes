const cloudService = require('../../../utils/cloudService');

Page({
  data: {
    violations: [],
    filteredViolations: [],
    statusFilter: '全部', // 全部, 未处理, 已处理
    sourceFilter: '全部', // 全部, review-form, theme-create
    dateFilter: '全部',
    totalCount: 0,
    riskyCount: 0,
    reviewCount: 0
  },

  onLoad() {
    this.checkPermission();
    this.loadViolations();
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

  async loadViolations() {
    wx.showLoading({ title: '加载中' });
    try {
      const data = await cloudService.adminGetViolations();

      const riskyCount = data.filter(v => v.suggest === 'risky').length;
      const reviewCount = data.filter(v => v.suggest === 'review').length;

      const formatted = data.map(v => ({
        ...v,
        createTimeText: this.formatDate(v.createTime),
        sourceText: this.getSourceText(v.source),
        suggestText: v.suggest === 'risky' ? '违规' : '待审',
        suggestClass: v.suggest === 'risky' ? 'risky' : 'review'
      }));

      this.allViolations = formatted;
      this.setData({ 
        violations: formatted,
        totalCount: data.length,
        riskyCount,
        reviewCount
      });
      this.applyFilter();
    } catch (err) {
      console.error('[violations] 加载失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  getSourceText(source) {
    const map = {
      'review-form': '发布评价',
      'theme-create': '创建主题',
      'unknown': '未知'
    };
    return map[source] || source;
  },

  onStatusFilterChange(e) {
    this.setData({ statusFilter: e.currentTarget.dataset.val }, () => {
      this.applyFilter();
    });
  },

  onSourceFilterChange(e) {
    this.setData({ sourceFilter: e.currentTarget.dataset.val }, () => {
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
    const { statusFilter, sourceFilter, dateFilter } = this.data;
    let filtered = this.allViolations || [];

    if (statusFilter === '未处理') {
      filtered = filtered.filter(v => !v.handled);
    } else if (statusFilter === '已处理') {
      filtered = filtered.filter(v => v.handled);
    }

    if (sourceFilter !== '全部') {
      filtered = filtered.filter(v => v.source === sourceFilter);
    }

    if (dateFilter !== '全部') {
      filtered = filtered.filter(v => {
        if (!v.createTime) return false;
        const d = new Date(v.createTime);
        const dateStr = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
        return dateStr === dateFilter;
      });
    }

    this.setData({ filteredViolations: filtered });
  },

  async markAsHandled(e) {
    const { id, handled } = e.currentTarget.dataset;
    const newHandled = !handled;

    wx.showLoading({ title: '处理中' });
    try {
      await cloudService.adminUpdateViolationStatus(id, newHandled);
      wx.showToast({ title: newHandled ? '已标记为已处理' : '已标记为未处理' });
      this.loadViolations();
    } catch (err) {
      console.error('[violations] 标记失败', err);
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
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

  copyContent(e) {
    const content = e.currentTarget.dataset.content;
    wx.setClipboardData({
      data: content,
      success: () => {
        wx.showToast({ title: '已复制' });
      }
    });
  }
});
