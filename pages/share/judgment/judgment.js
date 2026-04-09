const cloudService = require('../../../utils/cloudService');
const judgmentService = require('../../../utils/judgmentService');

Page({
  data: {
    place: {},
    judgment: {},
    reviews: [],
    markers: [],
    distance: ''
  },

  onLoad: async function (options) {
    const anchorId = options.id || options.placeId;
    
    if (!anchorId) {
      wx.showToast({ title: '缺少空间信息', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    
    await this.loadData(anchorId);
  },

  async loadData(anchorId) {
    wx.showLoading({ title: '解读中...' });
    try {
      const anchor = await cloudService.getLocationById(anchorId);
      
      if (!anchor) {
        wx.showToast({ title: '空间锚点不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }

      const coords = cloudService._extractCoords(anchor);
      if (!coords) {
        wx.showToast({ title: '坐标无效', icon: 'none' });
        return;
      }

      const place = {
        id: anchor._id,
        latitude: coords[1],
        longitude: coords[0],
        name: anchor.name,
        address: anchor.address || '',
        category: anchor.category || '地点'
      };

      this.setData({ place });
      
      // Fetch all reviews for this location
      await this.loadReviews(location._id);

    } catch (err) {
      console.error('[judgment] loadData 失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async loadReviews(anchorId) {
    try {
       const reviews = await cloudService.getImprintsByAnchor(anchorId);
       const anchor = await cloudService.getLocationById(anchorId);
       
       // Generate Judgment
       const judgment = judgmentService.generateJudgment(anchor, reviews);
       
       const formattedReviews = reviews.map(r => ({
           ...r,
           timeFormatted: judgmentService.formatTime(new Date(r.createTime || r.time).getTime())
       }));

       const coords = cloudService._extractCoords(place);
       const markers = coords ? [{
           id: 1,
           latitude: coords[1],
           longitude: coords[0],
           iconPath: '/images/icons/location_pin.svg', 
           width: 32,
           height: 32
       }] : [];

       this.setData({
           reviews: formattedReviews,
           judgment,
           markers
       });
    } catch (err) {
        console.error('[judgment] loadReviews 失败', err);
    }
  },

  viewInMap() {
    // Navigate to Place Detail for full experience
    // Use replace/relaunch if we want to reset stack, but navigateTo is standard for "Level 2" depth
    wx.navigateTo({
        url: `/pages/place-detail/place-detail?id=${this.data.place.id}`
    });
  },

  onShareAppMessage() {
      // Use Short Title if needed? Or just pass logic
      const j = this.data.judgment;
      const title = (j.title && j.title.length < 20) ? j.title : (j.shortTitle || j.title);

      return {
          title: title,
          path: `/pages/share/judgment/judgment?id=${this.data.place.id}`
      };
  }
});
