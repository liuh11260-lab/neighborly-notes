const auth = require('../../utils/auth');

Page({
  data: {
    places: [],
    filteredPlaces: [],
    searchText: ''
  },

  onLoad: function() {
    if (!auth.guardPage()) return;
    this.fetchPlaces();
  },

  onShow: function() {
    if (!auth.guardPage()) return;
  },

  onPullDownRefresh: function() {
    this.fetchPlaces(true);
  },

  async fetchPlaces(isRefresh = false) {
    if (!isRefresh) wx.showLoading({ title: '加载中' });
    
    try {
      const cloudService = require('../../utils/cloudService');
      const allImprints = await cloudService.getMyReviews();
      const anchorIds = Array.from(new Set(allImprints.map(r => r.anchorId || r.locationId)));
      const anchorAggregates = await cloudService.getAnchorAggregates(anchorIds);
      
      const countMap = {};
      allImprints.forEach(r => {
        const aid = r.anchorId || r.locationId;
        if (aid) {
          countMap[aid] = (countMap[aid] || 0) + 1;
        }
      });

      const placesList = anchorAggregates.map(loc => ({
        placeId: loc.anchorId,
        name: loc.name,
        count: countMap[loc.anchorId] || 0,
        typeIcon: this.getTypeIcon(loc.category)
      })).sort((a, b) => b.count - a.count);

      this.allPlaces = placesList;

      this.setData({ 
        places: placesList,
        filteredPlaces: placesList
      });
      
      this.applyFilter();
    } catch (err) {
      console.error('[visited-places] 获取地点失败', err);
      wx.showToast({ title: '获取失败', icon: 'none' });
    } finally {
      if (!isRefresh) wx.hideLoading();
      else wx.stopPullDownRefresh();
    }
  },

  applyFilter() {
    const query = this.data.searchText.trim().toLowerCase();
    let filteredPlaces = this.allPlaces || [];

    if (query) {
      filteredPlaces = filteredPlaces.filter(p => 
        p.name.toLowerCase().includes(query)
      );
    }

    this.setData({ filteredPlaces });
  },

  onSearchInput(e) {
    const val = e.detail.value;
    this.setData({ searchText: val }, () => {
      this.applyFilter();
    });
  },

  clearSearch() {
    this.setData({ searchText: '' }, () => {
      this.applyFilter();
    });
  },

  goToPlaceDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/place-detail/place-detail?id=${id}`
    });
  },

  getTypeIcon(categoryValue) {
    const map = {
      'Food': '🍜',
      'Drink': '☕',
      'Shopping': '🛍️',
      'Life': '💆',
      'Leisure': '🎢'
    };
    return map[categoryValue] || '📍';
  }
});
