const cloudService = require("../../../utils/cloudService");
const judgmentService = require("../../../utils/judgmentService");

Page({
  data: {
    theme: {},
    stats: {},
    locations: [],
    viewMode: "list",
    mapCenter: { latitude: 39.9, longitude: 116.4 },
    markers: [],
  },

  onReady() {
    this.mapCtx = wx.createMapContext("themeMap");
  },

  getJudgmentType(summary) {
    if (!summary) return 'neutral';
    if (summary.includes('推荐')) return 'recommend';
    if (summary.includes('避雷') || summary.includes('不推荐')) return 'avoid';
    return 'neutral';
  },

  async onLoad(options) {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });

    const themeId = options.id;
    if (!themeId) {
      wx.showToast({ title: "缺少主题ID", icon: "none" });
      return;
    }

    await this.loadThemeDetail(themeId);
  },

  onPullDownRefresh() {
    const themeId = this.data.theme._id;
    if (themeId) {
      this.loadThemeDetail(themeId, true);
    }
  },

  async loadThemeDetail(themeId, isRefresh = false) {
    if (!isRefresh) wx.showLoading({ title: "加载中" });

    try {
      const theme = await cloudService.getThemeById(themeId);
      if (!theme) {
        wx.showToast({ title: "主题不存在", icon: "none" });
        return;
      }

      const aggregate = await cloudService.getThemeAggregateById(themeId);
      const locationDetails = aggregate.locations || [];
      const totalRecords = aggregate.stats?.recordCount || 0;
      const latestUpdate = aggregate.stats?.lastUpdatedAt || 0;

      this.setData({
        theme: {
          _id: theme._id,
          title: theme.title,
          description: "一个被整理过的邻里判断视图",
        },
        stats: {
          locationCount: locationDetails.length,
          recordCount: totalRecords,
          lastUpdatedAtText: this.formatTime(latestUpdate),
        },
        locations: locationDetails.map(loc => ({
          ...loc,
          judgmentType: this.getJudgmentType(loc.judgmentSummary)
        })),
      });

      // Generate markers for map view
      this.generateMarkers(locationDetails);
    } catch (err) {
      console.error("[theme share] loadThemeDetail 失败", err);
      wx.showToast({ title: "加载失败", icon: "none" });
    } finally {
      if (!isRefresh) wx.hideLoading();
      else wx.stopPullDownRefresh();
    }
  },

  generateJudgmentSummary(reviews) {
    if (!reviews || reviews.length === 0) return "暂无记录";

    // Extract high-frequency tags
    const tagFreq = {};
    reviews.forEach((r) => {
      (r.tags || []).forEach((tag) => {
        tagFreq[tag] = (tagFreq[tag] || 0) + 1;
      });
    });

    const sortedTags = Object.entries(tagFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([tag]) => tag);

    if (sortedTags.length > 0) {
      return `在 ${reviews.length} 条记录中，多次提到「${sortedTags.join(
        "」「"
      )}」`;
    }

    return `已有 ${reviews.length} 条邻里记录`;
  },

  formatTime(timestamp) {
    if (!timestamp) return "未知";

    const now = Date.now();
    const diff = now - timestamp;
    const day = 24 * 60 * 60 * 1000;

    if (diff < day) return "今天";
    if (diff < 2 * day) return "昨天";
    if (diff < 7 * day) return `${Math.floor(diff / day)}天前`;

    const date = new Date(timestamp);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  onLocationTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/place-detail/place-detail?id=${id}`,
    });
  },

  async generateMarkers(locs) {
    if (!locs || locs.length === 0) return;

    // Using cloudService._extractCoords to get coordinates
    const markers = locs
      .map((loc, index) => {
        const coords = cloudService._extractCoords(loc);
        if (!coords) return null;

        return {
          id: index,
          latitude: coords[1],
          longitude: coords[0],
          anchorId: loc.anchorId,
          title: loc.name,
          iconPath: "../../../images/icons/location_pin.svg",
          width: 32,
          height: 32,
          callout: {
            content: loc.name,
            display: "BYCLICK",
            padding: 8,
            borderRadius: 4,
            fontSize: 14,
          },
        };
      })
      .filter((m) => m !== null);

    if (markers.length > 0) {
      this.setData({
        markers,
        mapCenter: {
          latitude: markers[0].latitude,
          longitude: markers[0].longitude,
        },
      }, () => {
        // 延迟包含视野，确保在地图切到 map 视图时生效
        if (this.data.viewMode === 'map' && this.mapCtx) {
          this.mapCtx.includePoints({
            points: markers.map(m => ({ latitude: m.latitude, longitude: m.longitude })),
            padding: [60, 60, 60, 60]
          });
        }
      });
    }
  },
  onMarkerTap(e) {
    const markerId = e.detail.markerId;
    const marker = this.data.markers.find((m) => m.id === markerId);
    if (marker) {
      const anchorId = marker.anchorId;
      wx.navigateTo({
        url: `/pages/place-detail/place-detail?id=${anchorId}`,
      });
    }
  },

  onLocateMe() {
    if (this.mapCtx) {
      this.mapCtx.moveToLocation();
    }
  },

  switchViewMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ viewMode: mode }, () => {
      if (mode === 'map' && this.data.markers.length > 0) {
        // Refresh context as map component is re-rendered
        this.mapCtx = wx.createMapContext('themeMap', this);
        this.mapCtx.includePoints({
          points: this.data.markers.map(m => ({ latitude: m.latitude, longitude: m.longitude })),
          padding: [60, 60, 60, 60]
        });
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '分享我的判断视图',
      path: `/pages/themes/share/share?id=${this.data.theme._id}`,
    };
  },

  onShareTimeline() {
    return {
      title: '分享我的判断视图',
      query: `id=${this.data.theme._id}`,
    };
  }
});
