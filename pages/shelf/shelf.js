const app = getApp();
const cloudService = require('../../utils/cloudService');
const { CORE_LAYER_LABELS } = require('../../utils/constants');

/**
 * Unifying the Babel Tower of Data Structures
 * Shelf Item Norm: { id, displayName, ... }
 */
/**
 * Unifying the Babel Tower of Data Structures
 * Shelf Item Norm: { id, displayName, ... }
 */
// normalizeItem moved to cloudService.js to share logic

Page({
  data: {
    userInfo: null,
    showLogin: false,

    // --- HOME_STATE v2.2 ---
    homeState: 'LOCATING', // Initial state
    anchor: null,
    shelfGroups: { food: [], leisure: [] },
    feedId: null,
    
    // UI State
    currentSwiperIndex: 0,
    showAddModal: false,
    
    // Constants
    layerLabels: CORE_LAYER_LABELS
  },

  async onLoad(options) {
    const userInfo = app.globalData.userInfo || null;
    this.setData({ userInfo });
    
    if (!userInfo) {
       this.setData({ showLogin: true });
    }

    await this.initLocation();
  },

  onShow() {
    if (app.globalData.userInfo) {
       this.setData({ userInfo: app.globalData.userInfo });
    }
  },

  async onPullDownRefresh() {
    await this.initLocation({ forceRefresh: true });
    wx.stopPullDownRefresh();
  },

  async initLocation(params = {}) {
    // Front-end redline: Do NOT mock states, just request.
    // However, for UX we start with LOCATING per spec.
    this.setData({ homeState: 'LOCATING' });
    
    try {
      const { latitude, longitude } = await new Promise((resolve, reject) => {
        wx.getLocation({
          type: 'gcj02',
          isHighAccuracy: true,
          success: res => resolve(res),
          fail: err => reject(err)
        });
      }).catch(err => {
        console.warn('Location failed', err);
        return { latitude: null, longitude: null };
      });

      if (!latitude) {
        // If no coordinates, we cannot move past Step 1
        this.setData({ homeState: 'ERROR' });
        wx.showToast({ title: '需要位置权限', icon: 'none' });
        return;
      }

      // We call the server to get the definitive state
      // Note: We don't call getOrCreateAnchor separately to keep state flow unified in getHomeFeed
      const res = await cloudService.getHomeFeed({
        latitude,
        longitude,
        ...params
      });

      if (res && res.homeState) {
        console.log('--- CONSTITUTIONAL AUDIT 2.2 ---');
        console.log('State:', res.homeState);

        this.setData({
          homeState: res.homeState,
          anchor: res.anchor,
          feedId: res.feedId,
          'shelfGroups.food': res.shelfGroups?.food || [],
          'shelfGroups.leisure': res.shelfGroups?.leisure || []
        });
      } else {
        // Engineering redline: Never leave UI in "no state"
        this.setData({ homeState: 'ERROR' });
      }

    } catch (err) {
      console.error('[Shelf] HomeFeed Flow Failed:', err);
      this.setData({ homeState: 'ERROR' });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // Interactions
  onBookTap(e) {
    if (!this.data.userInfo) {
       this.setData({ showLogin: true });
       return;
    }

    const { id } = e.currentTarget.dataset;
    const allVisibleBooks = [
      ...(this.data.shelfGroups?.food || []),
      ...(this.data.shelfGroups?.leisure || [])
    ];

    const book = allVisibleBooks.find(b => b.id === id);
    if (!book) return;

    const candidates = allVisibleBooks.map(b => ({
      id: b.poiId || b.id,
      title: b.displayName,
      address: b.address,
      latitude: b.geo?.lat || 0,
      longitude: b.geo?.lng || 0,
      distance: b.distance || '',
      layer: b.layer || 'Life'
    }));
    app.globalData.browsingCandidates = candidates;

    const targetId = book.poiId || book.id;
    wx.navigateTo({
      url: `/pages/place-detail/place-detail?id=${targetId}&title=${encodeURIComponent(book.title || '')}&displayName=${encodeURIComponent(book.displayName || '')}&layer=${book.layer}&distance=${book.distance || ''}&lat=${book.geo.lat}&lng=${book.geo.lng}&address=${encodeURIComponent(book.address || '')}`
    });
  },

  onAddBtnTap() {
    wx.navigateTo({ url: '/pages/record/record' });
  },

  closeLogin() {
    this.setData({ showLogin: false });
  },

  onLoginSuccess(e) {
    const { userInfo } = e.detail;
    this.setData({ 
      userInfo,
      showLogin: false
    });
    if (!this || !this.setData) return;
    this.initLocation();
  },

  async onRotateCategory(e) {
     if (!this || !this.setData) return;
     const { type } = e.currentTarget.dataset; // 'food' or 'leisure'
     const { feedId } = this.data;

     if (!feedId) return;

     wx.showLoading({ title: '正在寻找...' });

     try {
        const nextBatch = await cloudService.rotateHomeFeed({
           feedId,
           category: type
        });

        if (nextBatch && nextBatch.tier2) {
           // HomeFeed 2.2: Tier 1 remains static, Tier 2 rotates
           // We need to recover Tier 1 from data for a smooth update
           const tier1 = (type === 'food') 
              ? this.data.shelfGroups.food.filter(b => b._tier === 1)
              : this.data.shelfGroups.leisure.filter(b => b._tier === 1);

           this.setData({
              [`shelfGroups.${type}`]: [...tier1, ...nextBatch.tier2]
           });
        }
     } catch (err) {
        console.error('Rotate failed', err);
     } finally {
        wx.hideLoading();
     }
  }
});
