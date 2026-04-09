const app = getApp();
const locationService = require('../../utils/locationService');
const cloudService = require('../../utils/cloudService');
const auth = require('../../utils/auth');

Page({
  data: {
    ready: false,
    latitude: 31.2297,
    longitude: 121.4473,
    mapScale: 15,
    markers: [],
    circles: [],
    groundOverlays: [],
    nearbySignalsCount: 0,
    nearbyUserCount: 0,
    showSignalTip: false,
    statusBarHeight: 20,
    showLoginPopup: false,
    hasUserInfo: false,
    isNewSuccess: false,
    showSuccessOverlay: false,
    targetOpenid: '', 
    viewMode: 'explore',
    presenceText: '',
    spatialLevel: 'poi', // Current cognitive level
    scaleStep: 15, // Scale threshold
    currentRadiusKey: 'nearby', // internal state key
    mainActionText: '留下刻痕',
    scopedMyCount: 0, // Track count for correct navigation
    LEVEL_MAP: {
      nearby: 'spot',
      block: 'place',
      district: 'area',
      global: 'area'
    }
  },

  RANGE_MAP: {
    nearby: 1500,
    block: 3000,
    district: 15000,
    global: Infinity
  },

  async onLoad(options) {
    this.mapCtx = wx.createMapContext('mainMap');
    const statusBarHeight = (app.globalData && app.globalData.statusBarHeight) || 20;
    const capsule = wx.getMenuButtonBoundingClientRect();
    
    const userInfo = wx.getStorageSync('userInfo');
    const hasUserInfo = !!userInfo;

    this.setData({ 
      statusBarHeight,
      headerTop: capsule.top,
      headerHeight: capsule.height,
      signalTipTop: capsule.bottom + 20,
      targetOpenid: options.openid || '',
      viewMode: options.openid ? 'identity' : 'explore',
      isNewSuccess: !!options.imprintSuccess,
      hasUserInfo
    });

    try {
      const loc = await locationService.getCurrentLocationWithAddress();
      this.setData({
        latitude: loc.latitude,
        longitude: loc.longitude,
        ready: true
      });
      await this.refreshPageData(this.data.hasUserInfo);
      
      if (this.data.isNewSuccess) {
        this.runSuccessAnimation();
      }
    } catch (e) {
      console.error('Initial location failed', e);
      this.setData({ ready: true });
      await this.refreshPageData(this.data.hasUserInfo);
    }
  },

  onShow: function () {
    const app = getApp();
    if (app.globalData.triggerLogin) {
      this.setData({ showLoginPopup: true });
      app.globalData.triggerLogin = false;
    }

    const userInfo = wx.getStorageSync('userInfo');
    const hasUserInfo = !!userInfo;
    this.setData({ hasUserInfo });

    if (this.data.latitude && this.data.longitude) {
      this.refreshPageData(hasUserInfo);
    }
  },

  onRegionChange(e) {
    if (e.type === 'end' && (e.causedBy === 'scale' || e.causedBy === 'drag')) {
      this.mapCtx.getScale({
        success: (res) => {
          const oldRadiusKey = this.data.currentRadiusKey;
          let newRadiusKey = 'nearby';
          
          if (res.scale >= 14.5) newRadiusKey = 'nearby';
          else if (res.scale >= 12.5) newRadiusKey = 'block';
          else if (res.scale >= 9) newRadiusKey = 'district';
          else newRadiusKey = 'global';
          
          if (newRadiusKey !== oldRadiusKey) {
            this.setData({ 
              currentRadiusKey: newRadiusKey,
              spatialLevel: this.data.LEVEL_MAP[newRadiusKey],
              mapScale: res.scale 
            });
            this.refreshPageData();
          }
        }
      });
    }
  },

  runSuccessAnimation() {
    this.setData({ showSuccessOverlay: true });
    setTimeout(() => {
      this.setData({ isNewSuccess: false, showSuccessOverlay: false });
      wx.showToast({ title: '已记录你的立场', icon: 'none', duration: 2000 });
    }, 1500);
  },

  async refreshPageData(passedHasUserInfo) {
    const { latitude, longitude, currentRadiusKey, targetOpenid, viewMode } = this.data;
    const hasUserInfo = passedHasUserInfo !== undefined ? passedHasUserInfo : this.data.hasUserInfo;
    const radiusMeters = this.RANGE_MAP[currentRadiusKey] || 1000;

    try {
      let myMarkers = [];

      // --- L3: Identity Map Mode (Share State) ---
      if (viewMode === 'identity' && targetOpenid) {
        const imprints = await cloudService.getImprintsByUserId(targetOpenid);
        myMarkers = this.formatImprintMarkers(imprints);
        this.setData({ markers: myMarkers, circles: [], nearbySignalsCount: 0 });
        return;
      }

      // --- L1: My Active Stance (Global Footprint) ---
      let myStanceMarkers = [];
      let myAnchorSet = new Set();
      let myImprintLocs = []; // Declare here to broaden scope
      const openid = wx.getStorageSync('openid');
      
      if (hasUserInfo && openid) {
        // Fetch all my active locations globally (Unfiltered by distance)
        myImprintLocs = await cloudService.getMyImprintLocations();
        myStanceMarkers = this.formatLocationMarkers(myImprintLocs, true);
        
        // Also keep IDs for fast lookup
        myAnchorSet = new Set(myImprintLocs.map(l => l.anchorId));
      }

      const queryLevel = this.data.LEVEL_MAP[currentRadiusKey] || 'spot';

      const aggregates = await cloudService.getSpatialAggregates(latitude, longitude, radiusMeters, queryLevel);
      
      let exploreMarkers = [];
      if (queryLevel === 'area') {
        exploreMarkers = this.generateCityMarkers(aggregates);
      } else {
        // spot & place use standard markers
        exploreMarkers = this.generateExploringMarkers(aggregates, myAnchorSet, queryLevel);
      }

      // Combine: My Stance markers always take precedence and are shown globally
      // Exploring markers show the "World Consensus" nearby
      const finalMarkers = [...myStanceMarkers, ...exploreMarkers];

      // Calculate Presence Text
      let presenceText = '';
      if (!hasUserInfo) {
        presenceText = '登录后确立你的这张地图';
        this.setData({ 
          mainActionText: '留下刻痕',
          scopedMyCount: 0
        });
      } else {
        // Filter imprints within current radius for the presence count
        const currentImprintsInScope = myImprintLocs.filter(loc => {
          const coords = cloudService._extractCoords(loc);
          if (!coords || radiusMeters === Infinity) return true;
          const dist = this.getDistance(latitude, longitude, coords[1], coords[0]);
          return dist <= radiusMeters;
        });

        const myCount = currentImprintsInScope.length;
        const LABEL_MAP = { nearby: '附近', block: '街区', district: '城区', global: '地图' };
        const scopeName = LABEL_MAP[currentRadiusKey] || '附近';
        
        presenceText = myCount === 0 
          ? `先去走走，在【${scopeName}】留下你的判断` 
          : `你在【${scopeName}】留下了 ${myCount} 个判断`;
        
        this.setData({ 
          mainActionText: '留下刻痕',
          scopedMyCount: myCount
        });
      }

      // Calculate Unique User Count for Signal Tip
      const uniqueUsers = new Set();
      aggregates.forEach(agg => {
        (agg.imprints || []).forEach(imp => uniqueUsers.add(imp.openid));
      });
      const nearbyUserCount = uniqueUsers.size;

      this.setData({
        markers: finalMarkers,
        circles: this.generateRadiusCircle(latitude, longitude, radiusMeters),
        nearbySignalsCount: aggregates.length,
        nearbyUserCount: nearbyUserCount,
        showSignalTip: nearbyUserCount > 0, 
        presenceText
      });

    } catch (e) {
      console.error('Refresh page data failed', e);
    }
  },

  switchRadius(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.currentRadiusKey) return;
    this.setData({ 
      currentRadiusKey: key,
      spatialLevel: this.data.LEVEL_MAP[key]
    }, () => {
      this.refreshPageData();
      this.adjustMapView();
    });
  },

  getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  },

  // v2.1: Unified Marker Generation with Stance/Consensus branching
  generateExploringMarkers(aggregates, myAnchorSet, level) {
    const judgmentService = require('../../utils/judgmentService'); // Lazy require to avoid circular if any

    return aggregates.map((agg, idx) => {
      const coords = cloudService._extractCoords(agg.geo);
      if (!coords) return null;
      
      const isMine = myAnchorSet.has(agg._id || agg.anchorId);
      const isSpot = level === 'spot';
      const isPlace = level === 'place';
      const isArea = level === 'area';

      // v2.4 Consensus Logic for Markers
      const consensus = judgmentService.calculateConsensusFromImprints(agg.imprints || []);

      // Visual Rules (v2.4.5 3-Tier Iconography)
      let iconPath = '';
      if (isSpot) iconPath = isMine ? '../../images/icons/marker_spot_vibrant.svg' : '../../images/icons/marker_spot_grey.svg';
      else if (isPlace) iconPath = isMine ? '../../images/icons/marker_place_vibrant.svg' : '../../images/icons/marker_place_grey.svg';
      else iconPath = isMine ? '../../images/icons/marker_area_vibrant.svg' : '../../images/icons/marker_area_grey.svg';
      
      const size = isMine ? 48 : (isSpot ? 32 : (isPlace ? 40 : 48));

      return {
        id: (isMine ? 20000 : 10000) + idx,
        latitude: coords[1],
        longitude: coords[0],
        iconPath: iconPath,
        width: size,
        height: size,
        anchor: { x: 0.5, y: isSpot || isArea ? 0.5 : 1 }, // Spots and Areas are centered
        anchorId: agg._id,
        isMine, // Add tag for onMarkerTap
        zIndex: isMine ? 1000 : 500,
        label: consensus.isUnsteady ? {
          content: '!',
          color: '#FFFFFF',
          fontSize: 10,
          fontWeight: 'bold',
          bgColor: '#FAAD14',
          padding: 3,
          borderRadius: 10,
          anchorX: 10,
          anchorY: isSpot || isArea ? -size/2 : -size
        } : (consensus.stats.total > 1 ? {
          content: consensus.stats.total.toString(),
          color: '#333333',
          fontSize: 10,
          bgColor: '#FFFFFFCC',
          padding: 4,
          borderRadius: 4,
          anchorX: 10,
          anchorY: isSpot || isArea ? -size/2 : -size
        } : null)
      };
    }).filter(m => m !== null);
  },

  generateCityMarkers(aggregates) {
    const judgmentService = require('../../utils/judgmentService');

    return aggregates.map((agg, idx) => {
      const coords = cloudService._extractCoords(agg.geo);
      if (!coords) return null;
      
      const consensus = judgmentService.calculateConsensusFromImprints(agg.imprints || []);

      return {
        id: 30000 + idx,
        latitude: coords[1],
        longitude: coords[0],
        iconPath: '../../images/icons/map_color.svg', // Unified icon
        width: 32,
        height: 32,
        anchor: { x: 0.5, y: 0.5 },
        label: {
          content: `${agg.name}\n${consensus.consensusText}`,
          color: '#333333',
          fontSize: 11,
          fontWeight: 'bold',
          bgColor: '#FFFFFFEE',
          padding: 8,
          borderRadius: 8,
          textAlign: 'center',
          anchorY: -50
        }
      };
    }).filter(m => m !== null);
  },

  formatLocationMarkers(locs, isMine) {
    return locs.map((loc, index) => {
      const coords = cloudService._extractCoords(loc.geo);
      if (!coords) return null;
      
      const type = loc.anchor_type || 'spot';
      let iconPath = '';
      if (type === 'spot') iconPath = isMine ? '../../images/icons/marker_spot_vibrant.svg' : '../../images/icons/marker_spot_grey.svg';
      else if (type === 'place') iconPath = isMine ? '../../images/icons/marker_place_vibrant.svg' : '../../images/icons/marker_place_grey.svg';
      else iconPath = isMine ? '../../images/icons/marker_area_vibrant.svg' : '../../images/icons/marker_area_grey.svg';
      
      const size = 48;

      return {
        id: isMine ? index : 20000 + index,
        latitude: coords[1],
        longitude: coords[0],
        iconPath: iconPath,
        width: size,
        height: size,
        anchor: { x: 0.5, y: type === 'spot' || type === 'area' ? 0.5 : 1 },
        anchorId: loc.anchorId,
        isMine,
        zIndex: 1000,
        label: isMine && loc.imprints?.length > 1 ? {
          content: loc.imprints.length.toString(),
          color: '#FFFFFF',
          fontSize: 10,
          bgColor: '#FF2D55',
          anchorX: 12,
          anchorY: type === 'spot' || type === 'area' ? -20 : -35
        } : null
      };
    }).filter(m => m !== null);
  },

  formatImprintMarkers(imprints) {
    const map = new Map();
    imprints.forEach(imp => {
      if (!map.has(imp.anchorId)) map.set(imp.anchorId, []);
      map.get(imp.anchorId).push(imp);
    });
    
    return Array.from(map.values()).map((imps, index) => {
      const first = imps[0];
      const coords = cloudService._extractCoords(first.location?.geo || first.geo);
      if (!coords) return null;

      const type = first.anchor_type || 'spot';
      let iconPath = '';
      if (type === 'spot') iconPath = '../../images/icons/marker_spot_vibrant.svg';
      else if (type === 'place') iconPath = '../../images/icons/marker_place_vibrant.svg';
      else iconPath = '../../images/icons/marker_area_vibrant.svg';

      return {
        id: index,
        latitude: coords[1],
        longitude: coords[0],
        iconPath: iconPath,
        width: 48,
        height: 48,
        anchor: { x: 0.5, y: type === 'spot' || type === 'area' ? 0.5 : 1 },
        anchorId: first.anchorId,
        isMine: true,
        zIndex: 1000
      };
    }).filter(m => m !== null);
  },


  adjustMapView() {
    const scaleMap = { nearby: 15, block: 14, district: 12.5, global: 10 };
    const radiusMeters = this.RANGE_MAP[this.data.currentRadiusKey] || 1000;
    
    const scale = scaleMap[this.data.currentRadiusKey] || 14;
    const circles = radiusMeters === Infinity ? [] : this.generateRadiusCircle(this.data.latitude, this.data.longitude, radiusMeters);

    this.setData({ 
      mapScale: scale,
      circles: circles
    });
  },

  generateRadiusCircle(lat, lng, radius) {
    if (!lat || !lng) return [];
    return [{
      latitude: lat,
      longitude: lng,
      radius: radius,
      fillColor: '#07BA6210',
      color: '#07BA6230',
      strokeWidth: 1
    }];
  },

  moveToLocation() {
    this.mapCtx.moveToLocation();
    // V2.3: Reset to 'nearby' for focus
    if (this.data.currentRadiusKey !== 'nearby') {
      this.setData({ currentRadiusKey: 'nearby' }, () => {
        this.refreshPageData();
        this.adjustMapView();
      });
    }
  },

  onMarkerTap(e) {
    if (!auth.ensureLogin(this)) return;
    const markerId = Number(e.detail.markerId);
    const marker = this.data.markers.find(m => Number(m.id) === markerId);
    if (!marker) return;

    if (marker.isMine) {
      // Branch A: Personal Stance -> Quick Update
      wx.navigateTo({
        url: `/pages/imprint-panel/imprint-panel?mode=update&anchorId=${marker.anchorId}`
      });
    } else {
      // Branch B: World Consensus -> Read-only Review
      wx.navigateTo({
        url: `/pages/place-detail/place-detail?id=${marker.anchorId}`
      });
    }
  },

  goToImprintPanel() {
    if (!auth.ensureLogin(this)) return;
    const { latitude, longitude } = this.data;
    wx.navigateTo({ 
      url: `/pages/imprint-panel/imprint-panel?lat=${latitude}&lng=${longitude}` 
    });
  },

  viewMyImprints() {
    if (!auth.ensureLogin(this)) return;
    const { latitude, longitude, currentRadiusKey } = this.data;
    const radius = this.RANGE_MAP[currentRadiusKey];
    wx.navigateTo({ 
      url: `/pages/my-reviews/my-reviews?radius=${radius}&lat=${latitude}&lng=${longitude}` 
    });
  },

  goToNearbyJudgments() {
    if (!auth.ensureLogin(this)) return;
    const { latitude, longitude, currentRadiusKey } = this.data;
    const radiusMeters = this.RANGE_MAP[currentRadiusKey] || 1000;
    wx.navigateTo({
      url: `/pages/nearby-judgments/index?lat=${latitude}&lng=${longitude}&radius=${radiusMeters === Infinity ? 10000 : radiusMeters}`
    });
  },


  exitIdentityMode() {
    this.setData({ viewMode: 'explore', targetOpenid: '' }, () => {
      this.refreshPageData();
    });
  },

  onCloseLoginPopup() {
    this.setData({ showLoginPopup: false });
  },

  onLoginSuccess(e) {
    const { userInfo } = e.detail;
    wx.setStorageSync('userInfo', userInfo);
    this.setData({ showLoginPopup: false, hasUserInfo: true }, () => {
      this.refreshPageData(true);
    });
  }
});
