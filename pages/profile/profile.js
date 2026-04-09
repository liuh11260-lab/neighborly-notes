const auth = require('../../utils/auth');

Page({
  data: {
    userInfo: {},
    logged: false,
    showLoginPopup: false,
    stats: {
      notes: 0,
      places: 0
    },
    systemId: '-',
    recentReviews: []
  },

  onLoad: function() {
    const userInfo = wx.getStorageSync('userInfo');
    const openid = wx.getStorageSync('openid');
    if (userInfo) {
      this.setData({
        userInfo: userInfo,
        logged: true,
        systemId: openid ? this.generateNumericId(openid) : '-'
      });
    }
  },

  onShow: function() {
    if (!auth.guardPage()) return;

    // Update user info from storage in case it was edited
    const userInfo = wx.getStorageSync('userInfo');
    const openid = wx.getStorageSync('openid');
    if (userInfo) {
      this.setData({
        userInfo,
        logged: true,
        systemId: openid ? this.generateNumericId(openid) : '-'
      });
    }
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 2
      });
    }

    const isLoggedIn = !!(userInfo && userInfo.nickName);
    this.setData({ isLoggedIn, userInfo });

    if (isLoggedIn) {
      this.syncCloudProfile();
    }
    this.refreshReviews();
  },

  async syncCloudProfile() {
    const openid = wx.getStorageSync('openid');
    if (!openid) return;
    try {
      const { data } = await wx.cloud.database().collection('users').where({ _openid: openid }).get();
      if (data.length > 0) {
        const cloudInfo = data[0];
        const updatedInfo = {
          nickName: cloudInfo.nickName || this.data.userInfo.nickName,
          avatarUrl: cloudInfo.avatarUrl || this.data.userInfo.avatarUrl
        };
        this.setData({ userInfo: updatedInfo });
        wx.setStorageSync('userInfo', updatedInfo);
      }
    } catch (e) {
      console.error('Sync cloud profile failed', e);
    }
  },

  editProfile: function() {
    if (this.data.logged) {
      wx.navigateTo({
        url: '/pages/profile-edit/profile-edit'
      });
    } else {
      this.setData({ showLoginPopup: true });
    }
  },

  refreshReviews: async function() {
    try {
      const cloudService = require('../../utils/cloudService');
      const myReviews = await cloudService.getMyImprints();
      const anchorIds = Array.from(new Set(myReviews.map(r => r.anchorId || r.locationId).filter(Boolean)));
      
      // Batch fetch anchor aggregates
      const anchorAggregates = await cloudService.getAnchorAggregates(anchorIds);
      const anchorMap = {};
      anchorAggregates.forEach(loc => {
        anchorMap[loc.anchorId] = loc;
      });

      const reviewsWithLocations = myReviews
        .filter(r => r.anchorId || r.locationId)
        .map(r => {
          const aid = r.anchorId || r.locationId;
          const loc = anchorMap[aid];
          return {
            id: r._id,
            placeId: aid,
            // Fallback chain: Anchor Name -> Legacy Imprint Name -> '未知地点'
            locationName: (loc && loc.name) ? loc.name : (r.location?.name || '未知地点'),
            timeLabel: this.formatDate(r.createTime),
            categoryLabel: r.categoryLabel || r.category,
            spatialIcon: this.getSpatialIcon(r.spatialLevel || 'spot'),
            comment: r.comment || '',
            judgment: r.judgment,
            is_active: r.is_active !== false
          };
        });

      // Calculate stats for display
      const notesCount = reviewsWithLocations.length;
      
      // Calculate unique places (total footprint)
      const uniquePlaces = new Set(reviewsWithLocations.map(r => r.locationName));
      const placesCount = uniquePlaces.size;

      const stats = {
        notes: notesCount,
        places: placesCount,
        themes: 0
      };

      // Fetch Themes count
      try {
        const themes = await cloudService.getThemes();
        stats.themes = themes.length;
      } catch (e) {
        console.error('[profile] Fetch themes failed', e);
      }

      // Only show top 3 recent reviews on summary
      this.setData({ 
        recentReviews: reviewsWithLocations.slice(0, 3),
        stats: stats
      });
    } catch (err) {
      console.error('[profile] 获取评价失败', err);
    }
  },

  goToThemes() {
    if (!auth.ensureLogin(this)) return;
    wx.navigateTo({
      url: '/pages/themes/index/index'
    });
  },

  goToMyReviews() {
    if (!auth.ensureLogin(this)) return;
    wx.navigateTo({
      url: '/pages/my-reviews/my-reviews'
    });
  },

  goToVisitedPlaces() {
    if (!auth.ensureLogin(this)) return;
    wx.navigateTo({
      url: '/pages/visited-places/visited-places'
    });
  },



  generateNumericId(openid) {
    if (!openid) return '-';
    let hash = 0;
    for (let i = 0; i < openid.length; i++) {
        hash = ((hash << 5) - hash) + openid.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash % 1000000).toString().padStart(6, '0');
  },

  formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    if (diff < 3600000) return '刚刚';
    if (diff < 86400000) return `${Math.floor(diff/3600000)}小时前`;
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  },

  getSpatialIcon(level) {
    if (level === 'place') return '../../images/icons/marker_place_vibrant.svg';
    if (level === 'area') return '../../images/icons/marker_area_vibrant.svg';
    return '../../images/icons/marker_spot_vibrant.svg';
  },

  login: function() {
    this.setData({ showLoginPopup: true });
  },

  // Removed duplicate editProfile

  onCloseLoginPopup: function() {
    this.setData({ showLoginPopup: false });
  },

  onLoginSuccess: function(e) {
    const { userInfo } = e.detail;
    this.setData({
      userInfo: userInfo,
      logged: true,
      showLoginPopup: false
    });
  },

  // Removed duplicate goToMyReviews

  goToPlaceDetail: function(e) {
    if (!auth.ensureLogin(this)) return;
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/place-detail/place-detail?id=${id}`
    });
  },


  onShareAppMessage: function() {
    return {
      title: '发现周边的邻里好店与避雷建议 - 友邻笔记',
      path: '/pages/discover/discover',
      imageUrl: '../../images/icons/location_pin.svg'
    };
  },

  onShareTimeline: function() {
    return {
      title: '发现周边的邻里好店与避雷建议 - 友邻笔记'
    };
  },

  contactSupport: function() {
    wx.showModal({
      title: '帮助与反馈',
      content: '如有问题或建议，请通过微信联系我们',
      showCancel: false,
      confirmText: '我知道了'
    });
  },

  viewAbout: function() {
    wx.showModal({
      title: '关于应用',
      content: '友邻笔记 v3.0.0 \n基于真实邻里评价的地点决策助手',
      showCancel: false,
      confirmText: '我知道了'
    });
  },

  goToSettings: function() {
    if (!auth.ensureLogin(this)) return;
    wx.navigateTo({
      url: '/pages/settings/settings'
    });
  },

  goToPlaces: function() {
    wx.switchTab({
      url: '/pages/discover/discover'
    });
  }
});
