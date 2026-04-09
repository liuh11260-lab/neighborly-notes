const cloudService = require('../../utils/cloudService');
const locationService = require('../../utils/locationService');
const auth = require('../../utils/auth');

Page({
  data: {
    items: [],
    markers: [],
    loading: true,
    latitude: 31.2297,
    longitude: 121.4473,
    viewMode: 'list', // 'map' | 'list'
    radius: 2000
  },

  async onLoad(options) {
    if (!auth.guardPage()) return;
    
    const { lat, lng, radius = 2000 } = options;
    const latitude = lat ? parseFloat(lat) : this.data.latitude;
    const longitude = lng ? parseFloat(lng) : this.data.longitude;

    this.setData({ 
      latitude, 
      longitude, 
      radius: parseFloat(radius) 
    });

    await this.refreshData();
  },

  async refreshData() {
    const { latitude, longitude, radius } = this.data;
    this.setData({ loading: true });
    
    try {
      const imprints = await cloudService.getNearbyImprints(latitude, longitude, radius);
      
      const items = imprints.map(imp => {
        const coords = cloudService._extractCoords(imp.location?.geo || imp.geo);
        let distance = '未知';
        if (coords) {
          const d = this.calculateDistance(latitude, longitude, coords[1], coords[0]);
          distance = d < 1 ? Math.round(d * 1000) + 'm' : d.toFixed(1) + 'km';
        }

        return {
          ...imp,
          id: imp._id,
          timeText: this.formatRelativeTime(imp.createTime),
          distance
        };
      });

      // Generate markers for map
      const markers = items.map((item, index) => {
        const coords = cloudService._extractCoords(item.location?.geo || item.geo);
        if (!coords) return null;
        
        let iconPath = '../../images/icons/location_pin_grey.svg';
        if (item.judgment === 'recommend') iconPath = '../../images/icons/imprint_vibrant.svg';
        else if (item.judgment === 'avoid') iconPath = '../../images/icons/fog_red_radial.svg'; // Simplified for now

        return {
          id: index,
          latitude: coords[1],
          longitude: coords[0],
          iconPath: iconPath,
          width: 32,
          height: 32,
          anchor: { x: 0.5, y: 0.5 },
          anchorId: item.anchorId || item.locationId,
          title: item.location?.name
        };
      }).filter(m => m !== null);

      this.setData({ items, markers, loading: false });
    } catch (e) {
      console.error('Failed to fetch nearby imprints', e);
      this.setData({ loading: false });
    }
  },

  switchViewMode() {
    this.setData({
      viewMode: this.data.viewMode === 'list' ? 'map' : 'list'
    }, () => {
      if (this.data.viewMode === 'map') {
        this.adjustMapView();
      }
    });
  },

  adjustMapView() {
    const mapCtx = wx.createMapContext('nearbyMap');
    const points = this.data.markers.map(m => ({
      latitude: m.latitude,
      longitude: m.longitude
    }));
    
    // Always include user center
    points.push({
      latitude: this.data.latitude,
      longitude: this.data.longitude
    });

    if (points.length > 0) {
      mapCtx.includePoints({
        points: points,
        padding: [80, 80, 80, 80]
      });
    }
  },

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  },

  formatRelativeTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  },

  onMarkerTap(e) {
    const markerId = e.detail.markerId;
    const marker = this.data.markers[markerId];
    if (marker && marker.anchorId) {
      this.viewDetailById(marker.anchorId);
    }
  },

  viewDetail(e) {
    const id = e.currentTarget.dataset.id;
    this.viewDetailById(id);
  },

  viewDetailById(id) {
    wx.navigateTo({
      url: `/pages/place-detail/place-detail?id=${id}`
    });
  },

  goBack() {
    wx.navigateBack();
  }
});
