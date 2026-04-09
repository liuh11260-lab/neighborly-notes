const cloudService = require('../../../utils/cloudService');
const auth = require('../../../utils/auth');

Page({
  data: {
    themes: []
  },

  onLoad: function() {
    if (!auth.guardPage()) return;
    this.fetchThemes();
  },

  onShow: function() {
    if (!auth.guardPage()) return;
    this.fetchThemes();
  },

  onPullDownRefresh: function() {
    this.fetchThemes(true);
  },

  async fetchThemes(isRefresh = false) {
    if (!isRefresh) wx.showLoading({ title: '加载中' });
    try {
      const themes = await cloudService.getThemes();
      const formatted = themes.map(t => ({
        ...t,
        timeLabel: this.formatDate(t.updatedAt || t.createdAt)
      }));
      this.setData({ themes: formatted });
    } catch (err) {
      console.error(err);
      wx.showToast({ title: '获取失败', icon: 'none' });
    } finally {
      if (!isRefresh) wx.hideLoading();
      else wx.stopPullDownRefresh();
    }
  },

  formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
  },

  goToCreate() {
    wx.navigateTo({
      url: '/pages/themes/create/create'
    });
  },

  goToShare(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/themes/share/share?id=${id}`
    });
  },

  onDeleteTheme(e) {
    const { id, title } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: `确定要删除 "${title}" 吗？`,
      confirmColor: '#ff4d4f',
      success: async (res) => {
        if (res.confirm) {
          try {
            await cloudService.deleteTheme(id);
            wx.showToast({ title: '已删除' });
            this.fetchThemes();
          } catch (err) {
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  onShareTheme(e) {
    const theme = e.currentTarget.dataset.theme;
    wx.navigateTo({
      url: `/pages/themes/share/share?id=${theme._id}`
    });
  }
});
