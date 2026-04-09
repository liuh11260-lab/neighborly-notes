const cloudService = require('../../utils/cloudService');
const app = getApp();

Page({
  data: {
    notes: [], 
    stats: {
      count: 0
    },
    page: 0,
    pageSize: 20,
    hasMore: true,
    isLoading: false
  },

  onShow() {
    this.refresh();
  },

  onPullDownRefresh() {
    this.refresh();
  },

  onReachBottom() {
    this.fetchMore();
  },

  async refresh() {
    this.setData({ page: 0, hasMore: true, isLoading: false });
    await this.fetchNotes(true);
    wx.stopPullDownRefresh();
  },

  async fetchMore() {
    if (!this.data.hasMore || this.data.isLoading) return;
    await this.fetchNotes(false);
  },

  async fetchNotes(reset = false) {
    if (this.data.isLoading) return;
    this.setData({ isLoading: true });

    try {
      const { page, pageSize } = this.data;
      const res = await cloudService.getMyImprintsPaginated(page, pageSize);
      
      const newNotes = res.map(r => {
         // Data Compatibility
         let j = (r.judgment && r.judgment.stance) ? r.judgment.stance : r.judgment; 
         if (!j && r.action) j = r.action; // Fallback to action if judgment missing? No, judgment is primary.

         let label = '未知';
         let icon = '';
         let styleClass = '';
         
         if (j === 'recommend') { label = '适合我'; icon = '✔'; styleClass = 'positive'; }
         else if (j === 'dismiss' || j === 'avoid') { label = '不适合我'; icon = '✖'; styleClass = 'negative'; }
         else if (j === 'skip' || j === 'neutral') { label = '跳过'; icon = '⏸'; styleClass = 'neutral'; }

         return {
           _id: r._id,
           anchorId: r.anchorId || r.locationId, // Support legacy locationId if needed
           title: r.location?.name || r.bookTitle || '未知地点',
           address: r.location?.address || '',
           judgmentLabel: label,
           judgmentIcon: icon,
           styleClass: styleClass,
           timeLabel: this.formatTime(r.createTime)
         };
      });

      if (newNotes.length < pageSize) {
        this.setData({ hasMore: false });
      }

      // Sync Total Count
      const totalCount = await cloudService.getMyImprintCount();

      this.setData({
        notes: reset ? newNotes : [...this.data.notes, ...newNotes],
        page: page + 1,
        'stats.count': totalCount
      });

    } catch (e) {
      console.error(e);
      // Silent fail on pull refresh
    } finally {
      this.setData({ isLoading: false });
    }
  },

  goToDetail(e) {
    const { id, title } = e.currentTarget.dataset;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/place-detail/place-detail?id=${id}&title=${encodeURIComponent(title || '')}`
    });
  },

  formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    // Simple Relative
    const diff = now - d;
    if (diff < 86400000) return '今天'; // < 24h
    if (diff < 86400000 * 2) return '昨天';
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
});
