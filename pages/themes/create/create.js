const cloudService = require('../../../utils/cloudService');
const auth = require('../../../utils/auth');

Page({
  data: {
    title: '',
    desc: '',
    availableLocations: [],
    selectedCount: 0,
    canSubmit: false,
    submitting: false
  },

  onLoad: function() {
    if (!auth.guardPage()) return;
    this.fetchVisitedLocations();
  },

  onShow: function() {
    if (!auth.guardPage()) return;
  },

  async fetchVisitedLocations() {
    wx.showLoading({ title: '加载已访地点' });
    try {
      const myReviews = await cloudService.getMyReviews();
      
      // Get unique anchorIds
      const anchorIdSet = new Set();
      myReviews.forEach(r => {
        const aid = r.anchorId || r.locationId;
        if (aid) anchorIdSet.add(aid);
      });
      
      // Map anchorId back to an example imprint for fallback data
      const aidToImprint = {};
      myReviews.forEach(r => {
        const aid = r.anchorId || r.locationId;
        if (aid && !aidToImprint[aid]) aidToImprint[aid] = r;
      });

      // Fetch full anchor details with Fallback
      const locationPromises = Array.from(anchorIdSet).map(async aid => {
        try {
          let anchor = await cloudService.getLocationById(aid); // Handles anchor/location
          
          // Fallback: If anchor missing, construct from legacy imprint
          if (!anchor) {
            const fallbackImp = aidToImprint[aid];
            if (fallbackImp && fallbackImp.location) {
              console.warn('[ThemeCreate] Using legacy fallback for', aid);
              anchor = {
                _id: aid,
                name: fallbackImp.location.name || '未知地点',
                address: fallbackImp.location.address || '',
                anchor_type: fallbackImp.spatialLevel || 'spot'
              };
            }
          }

          if (!anchor) return null;
          
          const imprints = await cloudService.getImprintsByAnchor(aid);
          const latestImprint = imprints[0];
          
          const spatialLevel = anchor.anchor_type || 'spot';
          return {
            id: anchor._id,
            name: anchor.name,
            address: anchor.address || '',
            spatialIcon: this.getSpatialIcon(spatialLevel),
            comment: latestImprint ? latestImprint.comment : '',
            judgment: latestImprint ? latestImprint.judgment : 'neutral',
            selected: false
          };
        } catch (e) {
          console.error('[theme create] Failed to fetch location:', aid, e);
          return null;
        }
      });
      
      const locations = (await Promise.all(locationPromises)).filter(l => l !== null);
      
      this.setData({
        availableLocations: locations
      });
    } catch (err) {
      console.error('[theme create] fetchVisitedLocations 失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  getSpatialIcon(level) {
    if (level === 'place') return '../../../images/icons/marker_place_vibrant.svg';
    if (level === 'area') return '../../../images/icons/marker_area_vibrant.svg';
    return '../../../images/icons/marker_spot_vibrant.svg';
  },

  onTitleInput(e) {
    const val = e.detail.value.trim();
    this.setData({ title: val }, this.checkCanSubmit);
  },

  onDescInput(e) {
    const val = e.detail.value.trim();
    this.setData({ desc: val }, this.checkCanSubmit);
  },

  toggleLocation(e) {
    const id = e.currentTarget.dataset.id;
    const locs = this.data.availableLocations.map(l => {
      if (l.id === id) {
        return { ...l, selected: !l.selected };
      }
      return l;
    });
    const selectedCount = locs.filter(l => l.selected).length;
    this.setData({ 
      availableLocations: locs,
      selectedCount
    }, this.checkCanSubmit);
  },

  checkCanSubmit() {
    const { title, selectedCount } = this.data;
    this.setData({
      canSubmit: title.length > 0 && selectedCount >= 1
    });
  },

  async submitTheme() {
    if (!this.data.canSubmit || this.data.submitting) return;

    const { title, desc, availableLocations } = this.data;
    const selectedAnchorIds = this.data.availableLocations
      .filter(l => l.selected)
      .map(l => l.id);

    if (selectedAnchorIds.length === 0) {
      wx.showToast({ title: '请至少选择一个地点', icon: 'none' });
      this.setData({ submitting: false });
      return;
    }

    // 内容安全检测 - 检查标题和描述
    const contentToCheck = `${title} ${desc}`.trim();
    wx.showLoading({ title: '检测中...' });
    try {
      const checkResult = await wx.cloud.callFunction({
        name: 'contentCheck',
        data: { content: contentToCheck, scene: 2, source: 'theme-create' }
      });
      
      if (!checkResult.result?.safe) {
        wx.hideLoading();
        wx.showToast({ 
          title: '内容含违规信息，请修改后重试', 
          icon: 'none',
          duration: 3000
        });
        return;
      }
    } catch (err) {
      console.error('[submitTheme] 内容检测失败:', err);
      // 检测失败时继续发布，不阻塞用户
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '创建中...' });

    try {
      const themeData = {
        title,
        description: desc,
        anchorIds: selectedAnchorIds
      };

      await cloudService.addTheme(themeData);
      
      wx.hideLoading();
      wx.showToast({ title: '创建成功' });
      
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    } catch (err) {
      console.error('[theme create] submitTheme 失败', err);
      wx.hideLoading();
      wx.showToast({ title: '创建失败', icon: 'none' });
      this.setData({ submitting: false });
    }
  },
  
  goToDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/place-detail/place-detail?id=${id}`
    });
  }
});
