const app = getApp();
const locationService = require('../../utils/locationService');
const cloudService = require('../../utils/cloudService');

Page({
  data: {
    // 定位状态
    locating: true,
    locationError: false,
    
    // 地点信息
    location: {
      name: '',
      address: '',
      latitude: 0,
      longitude: 0
    },
    
    // 判断选择
    judgment: '', // 'recommend' | 'avoid' | 'neutral'
    
    // 评语
    comment: '',
    
    // 提交状态
    spatialLevel: 'place', // spot | place | area
    submitting: false,
    
    // 登录弹窗
    showLoginPopup: false,
    
    // 模式
    mode: 'create' // 'create' | 'update'
  },

  async onLoad(options) {
    const mode = options.mode || 'create';
    this.setData({ mode });

    // 检查登录状态
    const userInfo = wx.getStorageSync('userInfo');
    if (!userInfo) {
      this.setData({ showLoginPopup: true, locating: false });
      return;
    }
    
    // 如果是更新模式
    if (mode === 'update' && options.anchorId) {
      wx.showLoading({ title: '收回历史记忆...' });
      const openid = wx.getStorageSync('openid');
      const activeImprint = await cloudService.getActiveImprint(options.anchorId, openid);
      
      if (activeImprint) {
        const coords = cloudService._extractCoords(activeImprint.geo);
        this.setData({
          locating: false,
          location: {
            name: activeImprint.location?.name || '未知地点',
            address: activeImprint.location?.address || '',
            latitude: coords ? coords[1] : 0,
            longitude: coords ? coords[0] : 0
          },
          judgment: activeImprint.judgment?.stance || activeImprint.judgment,
          comment: activeImprint.comment,
          spatialLevel: activeImprint.spatialLevel || 'place'
        });
        wx.hideLoading();
        return;
      }
      wx.hideLoading();
    }

    // 如果从其他页面传入了位置，直接使用
    if (options.lat && options.lng && options.name) {
      this.setData({
        locating: false,
        location: {
          name: decodeURIComponent(options.name),
          address: decodeURIComponent(options.address || ''),
          latitude: parseFloat(options.lat),
          longitude: parseFloat(options.lng)
        }
      });
      return;
    }
    
    // 自动定位
    this.autoLocate();
  },

  async autoLocate() {
    this.setData({ locating: true, locationError: false });
    try {
      const { latitude, longitude, address } = await locationService.getCurrentLocationWithAddress();
      this.setData({
        locating: false,
        location: {
          name: address || '当前位置',
          address: address || '',
          latitude,
          longitude
        }
      });
    } catch (err) {
      console.error('[imprint-panel] 定位失败', err);
      this.setData({ locating: false, locationError: true });
    }
  },

  // 手动选择地点 (保留拖动选中功能)
  chooseLocation() {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          locationError: false,
          location: {
            name: res.name || res.address || '选中位置',
            address: res.address || '',
            latitude: res.latitude,
            longitude: res.longitude
          }
        });
      },
      fail: (err) => {
        console.warn('[imprint-panel] 选择位置取消', err);
      }
    });
  },

  // 选择判断
  selectJudgment(e) {
    const judgment = e.currentTarget.dataset.type;
    this.setData({ judgment });
  },

  // 选择空间层级
  selectLevel(e) {
    const level = e.currentTarget.dataset.level;
    this.setData({ spatialLevel: level });
  },

  onCommentInput(e) {
    this.setData({ comment: e.detail.value });
  },

  // 提交刻痕
  async submitImprint() {
    const { location, judgment, comment, spatialLevel } = this.data;
    
    if (!location.name || !location.latitude) {
      wx.showToast({ title: '请先选择位置', icon: 'none' });
      return;
    }
    
    if (!judgment) {
      wx.showToast({ title: '请选择一个判断', icon: 'none' });
      return;
    }
    
    this.setData({ submitting: true });
    
    try {
      // 1. 获取或创建空间锚点
      const anchorId = await cloudService.getOrCreateAnchor({
        name: location.name,
        longitude: location.longitude,
        latitude: location.latitude,
        spatialLevel: spatialLevel
      });

      // 2. 检查用户是否已在该锚点留下刻痕
      const openid = wx.getStorageSync('openid');
      const activeImprint = await cloudService.getActiveImprint(anchorId, openid);

      if (activeImprint) {
        this.setData({ submitting: false });
        const res = await new Promise((resolve) => {
          wx.showModal({
            title: '更新判断',
            content: '你曾在这里留下过判断，是否要更新它？',
            confirmText: '更新判断',
            cancelText: '取消',
            confirmColor: '#07C160',
            success: (modalRes) => resolve(modalRes)
          });
        });

        if (!res.confirm) return;
        this.setData({ submitting: true });
      }

      // 3. Submit new imprint (supersede logic is internal to cloudService)
      const result = await cloudService.addImprint({
        location: {
          name: location.name,
          address: location.address,
          longitude: location.longitude,
          latitude: location.latitude,
          spatialLevel: this.data.spatialLevel
        },
        judgment: {
          stance: judgment,
        },
        comment: comment
      });
      
      // 成功反馈
      wx.showToast({
        title: '你已在这里留下判断',
        icon: 'none',
        duration: 2000
      });
      
      // 返回首页，带上成功标志以触发动画
      setTimeout(() => {
        wx.reLaunch({
          url: '/pages/discover/discover?imprintSuccess=1'
        });
      }, 1500);
      
    } catch (err) {
      console.error('[imprint-panel] 提交失败', err);
      
      if (err.message === 'CONTENT_VIOLATION') {
        wx.showToast({ title: '内容含敏感信息，请修改', icon: 'none' });
      } else if (err.message === 'USER_FROZEN') {
        wx.showToast({ title: '账号已被冻结', icon: 'none' });
      } else {
        wx.showToast({ title: '发布失败，请重试', icon: 'none' });
      }
    } finally {
      this.setData({ submitting: false });
    }
  },

  // 登录成功回调
  onLoginSuccess(e) {
    this.setData({ showLoginPopup: false });
    this.autoLocate();
  },

  onCloseLoginPopup() {
    this.setData({ showLoginPopup: false });
    wx.navigateBack();
  }
});
