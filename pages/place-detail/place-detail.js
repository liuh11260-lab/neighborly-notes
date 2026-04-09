const cloudService = require('../../utils/cloudService');
const app = getApp();

Page({
  data: {
    place: null,
    layer: '',
    hasJudged: false,
    startTime: 0
  },

  async onLoad(options) {
    const { id, title, address, lat, lng, layer, distance, displayName } = options;
    
    // Seed POI Construction
    const seedPoi = {
      id, 
      title: decodeURIComponent(title || ''),
      displayName: decodeURIComponent(displayName || title || ''), // 🔥 Fix: Handle normalized name
      address: decodeURIComponent(address || ''),
      latitude: Number(lat),
      longitude: Number(lng),
      distance: distance || '',
      layer: layer || 'Life'
    };

    let candidateList = [];
    let initialIndex = 0;

    // Mode Decision: Search vs Browse
    if (layer === 'search_poi') {
       // Search Mode: Isolated Single Item
       candidateList = [seedPoi];
       initialIndex = 0;
    } else {
       // Browse Mode (Shelf): Use Global Stream
       candidateList = app.globalData.browsingCandidates || [];
       if (candidateList.length === 0) {
          candidateList = [seedPoi];
       }
       
       // Sync Cursor
       initialIndex = candidateList.findIndex(p => p.id === id);
       if (initialIndex === -1) {
         initialIndex = 0;
         candidateList = [seedPoi, ...candidateList];
       }
    }

    this.setData({
      poiList: candidateList,
      currentIndex: initialIndex
    });

    await this._loadPoiAtIndex(initialIndex);
  },

  async _loadPoiAtIndex(index) {
    const poi = this.data.poiList[index];
    if (!poi) return;

    // Icon Logic (Layer -> Emoji)
    const outputIcon = ((l) => {
      if (l === 'Food') return '🍜';
      if (l === 'Leisure') return '🎢';
      if (l === 'Social') return '🥂';
      if (l === 'Solitude') return '🌳';
      if (l === 'Work') return '💻';
      if (l === 'Transit') return '🚇';
      if (l === 'Activity') return '🏸';
      if (l === 'search_poi') return '📍';
      return '🏠';
    })(poi.layer);

    // 1. Reset State for new POI
    this.setData({
      place: poi,
      layer: poi.layer || 'Life',
      layerIcon: outputIcon,
      startTime: Date.now(),
      currentJudgment: null,
      hasJudged: false, // Reset explicit lock
      canPrev: index > 0,
      canNext: index < this.data.poiList.length - 1
    });

    // 2. Fetch/Calc Anchor Identity
    const anchorId = await cloudService.getOrCreateAnchor({
      latitude: Number(poi.latitude),
      longitude: Number(poi.longitude),
      spatialLevel: 'poi'
    });
    this.setData({ anchorId });

    // JIT Anchor Creation for Search Results (Active Explore)
    // Ensures Anchor exists with 'search_poi' layer before judgment
    if (poi.layer === 'search_poi') {
       wx.cloud.callFunction({
         name: 'locationService',
         data: {
           action: 'addAnchorIfNotExist',
           anchorId: anchorId,
           location: {
             name: poi.title,
             longitude: Number(poi.longitude),
             latitude: Number(poi.latitude),
             address: poi.address,
             category: 'search_poi'
           },
           spatialLevel: 'poi'
         }
       }).catch(e => console.error('JIT Anchor Create Failed', e));
    }

    // 3. Check Perception State (Is it already judged?)
    // Note: In "Undecided Stream" this should ideally be null.
    // But we check just in case user comes back to a processed item in history.
    const openid = wx.getStorageSync('openid');
    if (openid) {
      const imprint = await cloudService.getActiveImprint(anchorId, openid);
      if (imprint && imprint.judgment) {
        let uiState = null;
        if (imprint.judgment.stance === 'recommend') uiState = 'suitable';
        if (imprint.judgment.stance === 'dismiss' || imprint.judgment.stance === 'avoid') uiState = 'unsuitable';
        this.setData({ currentJudgment: uiState });
      }
    }
  },

  // --- Browsing Navigation ---
  
  handlePrev() {
    if (this.data.canPrev) {
      this._loadPoiAtIndex(this.data.currentIndex - 1);
      this.setData({ currentIndex: this.data.currentIndex - 1 });
    }
  },

  handleNext() {
    if (this.data.canNext) {
      this._loadPoiAtIndex(this.data.currentIndex + 1);
      this.setData({ currentIndex: this.data.currentIndex + 1 });
    }
  },

  async _autoAdvance() {
    // Behavior: Judgment made -> Remove from stream -> Next
    const { currentIndex, poiList } = this.data;
    
    // Option A: Just go next (History preserved)
    // Option B: Splice out (Hard focus). User said: "从 undecidedList 中移除... 自动切到下一个"
    
    const newList = [...poiList];
    newList.splice(currentIndex, 1); // Remove processed POI
    
    if (newList.length === 0) {
      // List exhausted
      wx.showToast({ title: '已全部看完', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }

    // Determine new index (stays at current, which is now the next item, or clamps to end)
    let newIndex = currentIndex;
    if (newIndex >= newList.length) {
      newIndex = newList.length - 1;
    }
    
    // Update List & Render
    app.globalData.browsingCandidates = newList; // Sync Global
    this.setData({ poiList: newList, currentIndex: newIndex });
    
    // Slight delay to allow Toast to be seen
    setTimeout(() => {
        this._loadPoiAtIndex(newIndex);
    }, 500);
  },

  // State Management
  handleModify() {
    this.setData({ isEditing: true });
  },

  // 3-Button Semantic Definitions
  async handleSuitable() {
    await this._submitJudgment('recommend', 'suitable', '适合你');
  },

  async handleUnsuitable() {
    await this._submitJudgment('dismiss', 'unsuitable', '不适合你');
  },
  
  async handleSkip() {
    await this._submitJudgment('skip', 'neutral', '暂不判断');
  },

  // Core Submission Logic
  async _submitJudgment(stance, action, label) {
     wx.showLoading({ title: '记录中', mask: true });
     
     try {
         // Call Cloud
         await cloudService.addImprint({
            location: {
              name: this.data.place.title,
              address: this.data.place.address,
              latitude: Number(this.data.place.latitude),
              longitude: Number(this.data.place.longitude),
              category: this.data.layer, 
              spatialLevel: 'poi'
            },
            judgment: stance, 
            comment: '', 
            bookTitle: this.data.place.title,
            coreLayer: this.data.layer,
            action: action,
            stayTime: Date.now() - this.data.startTime
         });

         wx.hideLoading();
         
         const isStream = this.data.poiList && this.data.poiList.length > 1;
         
         if (isStream) {
             // Flow: Auto Advance
             wx.showToast({ title: '已记录', icon: 'success', duration: 500 });
             setTimeout(() => {
                this._autoAdvance();
             }, 500);
         } else {
             // Static: Show Result (State Update)
             this.setData({
                 hasJudged: true,
                 isEditing: false,
                 judgmentLabel: label,
                 currentJudgment: action === 'suitable' ? 'suitable' : (action === 'unsuitable' ? 'unsuitable' : null)
             });
         }
     } catch(e) {
         wx.hideLoading();
         console.error('[Book] Judgment Failed', e);
         wx.showToast({ title: '网络异常', icon: 'none' });
     }
  },

  openNav() {
    const { place } = this.data;
    wx.openLocation({
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
      name: place.title,
      address: place.address
    });
  },

  // --- Swipe Gesture Support ---

  onTouchStart(e) {
    if (e.changedTouches.length !== 1) return;
    this.touchStartX = e.changedTouches[0].clientX;
    this.touchStartY = e.changedTouches[0].clientY;
  },

  onTouchEnd(e) {
    if (e.changedTouches.length !== 1) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    
    const diffX = endX - this.touchStartX;
    const diffY = endY - this.touchStartY;

    // Threshold: 50px, Dominant Axis: X
    if (Math.abs(diffX) > 50 && Math.abs(diffY) < 60) {
       if (diffX < 0) {
         // Swipe Left -> Go Next (Content from Right)
         if (this.data.canNext) this.handleNext();
       } else {
         // Swipe Right -> Go Prev (Content from Left)
         if (this.data.canPrev) this.handlePrev();
       }
    }
  },

  onUnload() {
    // Iron Rule: No implicit judgment.
    // Explicit 'Skip' is just leaving without traces.
  }
});
