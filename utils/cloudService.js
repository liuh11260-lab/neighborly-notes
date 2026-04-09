const db = wx.cloud.database();
const _ = db.command;

// ⚠️ 注意：本文件所有 aggregate 均运行在小程序端
// 禁止使用 Mongo pipeline 写法 (即 .aggregate([{...}]) 或 .pipeline([...]))
// 必须使用链式聚合 API (即 .aggregate().match().group().end())

/**
 * 安全查询：处理集合不存在等错误，返回默认值
 * 让系统在0数据时也能正常运行
 */
async function safeQuery(fn, fallback = []) {
  try {
    return await fn();
  } catch (err) {
    // -502005: 集合不存在
    if (err.errCode === -502005) {
      console.warn('[safeQuery] Collection not found, returning fallback:', fallback);
      return fallback;
    }
    throw err;
  }
}

const ADMIN_LIST = ['oU2Gu7djmetX3C0ebW12tttmOwPw']; // 管理员白名单

/**
 * Unifying the Babel Tower of Data Structures
 * Global utility for shelf and assets
 */
function normalizeItem(item) {
  if (!item) return { displayName: '未知' };
  if (item.location && item.location.name) return { ...item, displayName: item.location.name };
  if (item.title) return { ...item, displayName: item.title };
  if (item.name) return { ...item, displayName: item.name };
  return { ...item, displayName: '未知地点' };
}

const cloudService = {
  normalizeItem, // Export globally

  /**
   * 内部辅助：严格从 geo 对象中提取坐标 [lon, lat]
   * 只支持标准 GeoJSON 格式
   */
  _extractCoords(obj) {
    if (!obj) return null;
    
    // 1. 标准 geo 字段 (首选)
    if (obj.geo) return this._extractCoords(obj.geo);
    
    // 2. 直属 coordinates 数组 (db.Geo.Point)
    if (Array.isArray(obj.coordinates) && obj.coordinates.length >= 2) {
      return [obj.coordinates[0], obj.coordinates[1]];
    }
    
    // 3. toJSON 后的结构
    if (typeof obj.toJSON === 'function') {
      const json = obj.toJSON();
      if (json && Array.isArray(json.coordinates)) {
        return [json.coordinates[0], json.coordinates[1]];
      }
    }
    
    return null;
  },

  /**
   * 获取或创建用户记录
   */
  async getOrCreateUser(openid, userInfo) {
    try {
      const { data } = await db.collection('users').where({
        _openid: openid
      }).get();

      if (data.length > 0) {
        await db.collection('users').doc(data[0]._id).update({
          data: {
            ...userInfo,
            lastLoginTime: db.serverDate()
          }
        });
        return data[0];
      } else {
        const res = await db.collection('users').add({
          data: {
            ...userInfo,
            registrationTime: db.serverDate(),
            lastLoginTime: db.serverDate()
          }
        });
        return { _id: res._id, ...userInfo };
      }
    } catch (err) {
      console.error('getOrCreateUser 失败', err);
      throw err;
    }
  },








  /**
   * 获取附近地点的聚合信息，供发现页使用 (从 imprints 聚合)
   */
  /**
   * 空间等级聚合查询 (核心：缩放感知加载)
   * V1 支持: spot, poi, city
   * 现在直接从 imprints 集合进行聚合
   */
  async getSpatialAggregates(lat, lng, radius, targetType = 'spot') {
    try {
      // v2.6 Lockdown: Delegating to Cloud Function to bypass client-side 
      // Permission Denied and restricted aggregate syntax.
      const { result } = await wx.cloud.callFunction({
        name: 'locationService',
        data: {
          action: 'getSpatialAggregates',
          lat,
          lng,
          radius,
          targetType,
        },
      });

      return Array.isArray(result?.list) ? result.list : [];
    } catch (err) {
      console.error('[cloudService] getSpatialAggregates failed', err);
      return [];
    }
  },

  _formatSpatialAggregates(anchors, imprints, level) {
    const anchorMap = {};
    anchors.forEach(a => {
      anchorMap[a._id] = {
        ...a,
        imprints: []
      };
    });

    imprints.forEach(imp => {
      if (anchorMap[imp.anchorId]) {
        anchorMap[imp.anchorId].imprints.push(imp);
      }
    });

    return Object.values(anchorMap).map(a => {
      const imps = a.imprints;
      const count = imps.length;
      const recCount = imps.filter(i => i.judgment === 'recommend').length;
      const avoidCount = imps.filter(i => i.judgment === 'avoid').length;
      
      let rating = 0;
      if (recCount > avoidCount) rating = 1;
      else if (avoidCount > recCount) rating = -1;

      if (level === 'city') {
        return {
          id: a._id,
          name: a.name,
          spatialLevel: a.spatialLevel,
          geo: a.geo,
          judgmentStats: {
            recommend: recCount,
            avoid: avoidCount
          }
        };
      }

      return {
        anchorId: a._id,
        name: a.name,
        address: imps[0]?.location?.address || '',
        geo: a.geo,
        category: imps[0]?.location?.category || 'Life',
        spatialLevel: a.spatialLevel,
        rating, // 暂时保留 rating 作为倾向性语义标识
        recordCount: count,
        recRatio: count > 0 ? Math.round((recCount / count) * 100) : 0,
        latestImprint: imps[0] || null
      };
    });
  },

  async getNearbyAggregates(lat, lng, maxDistance = 2000) {
    return this.getSpatialAggregates(lat, lng, maxDistance, 'poi');
  },

    /**
   * 获取锚点的邻里刻痕 (已全面迁移至 anchorId)
   */
  async getImprintsByAnchor(anchorId) {
    return this.getImprintsByAnchorId(anchorId);
  },

  /**
   * [LEGACY] 删除评价 (静默停用)
   */
  async deleteReview(reviewId) {
    console.warn('[cloudService] deleteReview is legacy and frozen');
    return { ok: true, message: 'Review system is frozen' };
  },

  /**
   * 获取我的刻痕 (等同于 getMyImprints)
   */
  async getMyReviews() {
    return this.getMyImprints();
  },

  /**
   * 分页获取我的刻痕 (替代 getMyReviewsPaginated)
   */
  async getMyReviewsPaginated(page = 0, pageSize = 20, spatialFilter = null) {
    return this.getMyImprintsPaginated(page, pageSize, spatialFilter);
  },

  /**
   * 根据 ID 获取评价 (重定向到 imprints)
   */
  async getReviewById(id) {
    // 尝试从 imprints 获取
    const { data } = await db.collection('imprints').doc(id).get();
    if (data) return data;
    // 兜底从 reviews 获取
    const res = await db.collection('reviews').doc(id).get();
    return res.data || null;
  },

  /**
   * 检查是否为参与记录 (LEGACY)
   */
  async checkIfParticipation(name, address) {
    return false; // 通用逻辑已废弃
  },

  /**
   * Theme 相关方法
   */
  async getThemes() {
    const openid = wx.getStorageSync('openid');
    if (!openid) return [];

    return safeQuery(
      () => db.collection('themes')
        .where({ _openid: openid })
        .orderBy('updatedAt', 'desc')
        .get()
        .then(r => r.data || []),
      []
    );
  },

  /**
   * 获取用户的历史评价 (已迁移至从 imprints 获取)
   */
  async getReviewsByUserId(userId) {
    return this.getImprintsByUserId(userId);
  },

  async addTheme(themeData) {
    try {
      const openid = wx.getStorageSync('openid');
      const res = await db.collection('themes').add({
        data: {
          title: themeData.title,
          description: themeData.description,
          anchorIds: themeData.anchorIds || [],
          createdAt: db.serverDate(),
          updatedAt: db.serverDate()
        }
      });
      return res;
    } catch (err) {
      console.error('[cloudService] addTheme 失败', err);
      throw err;
    }
  },

  async getThemeById(id) {
    try {
      const { data } = await db.collection('themes').doc(id).get();
      const ids = data.anchorIds || [];
      if (ids.length > 0) {
        const locations = await Promise.all(
          ids.map(id => this.getAnchorById(id))
        );
        data.locations = locations.filter(l => l !== null);
      } else {
        data.locations = [];
      }
      return data;
    } catch (err) {
      console.error('getThemeById 失败', err);
      throw err;
    }
  },

  async getThemeAggregateById(themeId) {
    try {
      const theme = await this.getThemeById(themeId);
      if (!theme) return null;

      const anchorIds = theme.anchorIds || [];
      const aggregatedLocations = await this.getAnchorAggregates(anchorIds);

      return {
        theme: {
          _id: theme._id,
          title: theme.title,
          description: theme.description
        },
        stats: {
          locationCount: aggregatedLocations.length,
          recordCount: aggregatedLocations.reduce((sum, l) => sum + l.recordCount, 0),
          lastUpdatedAt: aggregatedLocations.reduce((max, l) => Math.max(max, l.lastRecordAt), 0)
        },
        locations: aggregatedLocations
      };
    } catch (err) {
      console.error('getThemeAggregateById 失败', err);
      throw err;
    }
  },

  /**
   * 批量获取地点的聚合信息（包含摘要、记录数、最后更新）
   * 从 imprints 集合聚合，不再依赖 locations 集合
   */
  async getAnchorAggregates(anchorIds) {
    if (!anchorIds || anchorIds.length === 0) return [];

    try {
      // v2.6 Lockdown: Delegate to cloud function
      let list = [];
      try {
        const { result } = await wx.cloud.callFunction({
          name: 'locationService',
          data: {
            action: 'getAnchorAggregates',
            anchorIds
          }
        });
        list = Array.isArray(result?.list) ? result.list : [];
      } catch (e) {
        console.warn('CF getAnchorAggregates failed', e);
      }

      // Fallback: If list is incomplete, try to fill from client-side imprints
      const foundIds = new Set(list.map(i => i.anchorId));
      const missingIds = anchorIds.filter(id => !foundIds.has(id));

      if (missingIds.length > 0) {
        console.warn('[cloudService] Reconstructing aggregates for missing anchors:', missingIds.length);
        const missingAggs = await this._reconstructAggregatesFromImprints(missingIds);
        list = [...list, ...missingAggs];
      }
      
      return list;
    } catch (err) {
      console.error('getAnchorAggregates 失败', err);
      return [];
    }
  },

  /**
   * Fallback: Reconstruct aggregates from client-side imprint queries
   */
  async _reconstructAggregatesFromImprints(anchorIds) {
    try {
      const _ = db.command;
      const imprints = await safeQuery(
        () => db.collection('imprints')
          .where({
            anchorId: _.in(anchorIds),
            is_active: true
          })
          .orderBy('createTime', 'desc')
          .get()
          .then(r => r.data || []),
        []
      );

      const map = {};
      imprints.forEach(imp => {
        const aid = imp.anchorId;
        if (!map[aid]) {
          const loc = imp.location || {};
          const lng = Number(loc.longitude);
          const lat = Number(loc.latitude);
          const hasGeo = !isNaN(lng) && !isNaN(lat);

          map[aid] = {
            _id: aid,
            anchorId: aid,
            name: loc.name || '未知地点',
            address: loc.address || '',
            category: loc.category || 'Life',
            geo: hasGeo ? { type: 'Point', coordinates: [lng, lat] } : null,
            spatialLevel: imp.spatialLevel || 'spot',
            count: 0,
            recCount: 0,
            lastRecordAt: 0
          };
        }
        map[aid].count++;
        if (imp.judgment?.stance === 'recommend' || imp.judgment === 'recommend') map[aid].recCount++;
        map[aid].lastRecordAt = Math.max(map[aid].lastRecordAt, new Date(imp.createTime).getTime());
      });

      return Object.values(map).map(item => ({
        ...item,
        recordCount: item.count,
        rating: item.recCount >= (item.count - item.recCount) ? 1 : -1
      }));
    } catch (e) {
      console.error('Fallback reconstruction failed', e);
      return [];
    }
  },

  _generateBriefSummary(reviews) {
    if (!reviews || reviews.length === 0) return '暂无记录';
    const tagFreq = {};
    reviews.forEach(r => {
      (r.tags || []).forEach(tag => {
        tagFreq[tag] = (tagFreq[tag] || 0) + 1;
      });
    });
    const sortedTags = Object.entries(tagFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([tag]) => tag);

    if (sortedTags.length > 0) {
      return `在 ${reviews.length} 条记录中，多次提到「${sortedTags.join('」「')}」`;
    }
    return `已有 ${reviews.length} 条邻里记录`;
  },

  _getTopTags(reviews, limit = 3) {
    if (!reviews || reviews.length === 0) return [];
    
    // Flatten all tags
    const allTags = reviews.reduce((acc, r) => {
        return acc.concat(r.tags || []);
    }, []);

    if (allTags.length === 0) return [];

    // Count frequency
    const freq = {};
    allTags.forEach(t => {
        freq[t] = (freq[t] || 0) + 1;
    });

    // Sort by frequency desc
    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(entry => entry[0]);
  },

  _formatRelativeTime(timestamp) {
    if (!timestamp) return '未知';
    const now = Date.now();
    const diff = now - timestamp;
    const day = 24 * 60 * 60 * 1000;
    if (diff < day) return '今天';
    if (diff < 2 * day) return '昨天';
    if (diff < 7 * day) return `${Math.floor(diff / day)}天前`;
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  async deleteTheme(id) {
    try {
      return await db.collection('themes').doc(id).remove();
    } catch (err) {
      console.error('deleteTheme 失败', err);
      throw err;
    }
  },

  /**
   * 根据 ID 获取锚点详情 (从 imprints 获取)
   */
  async getAnchorById(id) {
    if (!id) return null;
    try {
      // v2.6 Lockdown: Delegate to cloud function
      const { result } = await wx.cloud.callFunction({
        name: 'locationService',
        data: {
          action: 'getAnchorById',
          id
        }
      });

      if (result && result.ok && result.anchor) {
        return result.anchor;
      }
      return null;
    } catch (err) {
      console.error('getAnchorById 失败', err);
      return null;
    }
  },

  /**
   * PRD v0.1: 获取位置书架 (Shelf)
   */
  async getShelf(anchorId, context = null) {
    if (!anchorId) return null;
    // v2.9.2: Propagation of Fatal Errors
    const { result } = await wx.cloud.callFunction({
      name: 'locationService',
      data: { action: 'getShelf', anchorId, ...context }
    });
    
    // If not ok, throw the error explicitly
    throw new Error(result?.error || 'CLOUD_FUNCTION_GENERIC_FAIL');
  },

  /**
   * HomeFeed 2.2: 获取会话驱动的 Feed
   */
  async getHomeFeed(params) {
    const { result } = await wx.cloud.callFunction({
      name: 'locationService',
      data: { action: 'getHomeFeed', ...params }
    });
    if (result && result.ok) return result.data;
    throw new Error(result?.error || 'GET_HOME_FEED_FAILED');
  },

  /**
   * HomeFeed 2.2: 换一批 (后端游标移动)
   */
  async rotateHomeFeed(params) {
    const { result } = await wx.cloud.callFunction({
      name: 'locationService',
      data: { action: 'rotateHomeFeed', ...params }
    });
    if (result && result.ok) return result.data;
    throw new Error(result?.error || 'ROTATE_HOME_FEED_FAILED');
  },

  /**



  async searchReviews(query) {
    return safeQuery(
      () => db.collection('imprints').where(_.or([
        { 'location.name': db.RegExp({ regexp: query, options: 'i' }) },
        { comment: db.RegExp({ regexp: query, options: 'i' }) },
        { userName: db.RegExp({ regexp: query, options: 'i' }) }
      ])).get().then(r => r.data || []),
      []
    );
  },



  /**
   * Admin: 获取全局统计数据
   */
  async adminGetStats() {
    try {
      const imprintCount = await db.collection('imprints').count();
      const themeCount = await db.collection('themes').count();
      const userCount = await db.collection('users').count();

      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
      const onlineCountRes = await db.collection('users').where({
        lastLoginTime: _.gt(fiveMinsAgo)
      }).count();

      // Calculate unique locations (Anchors)
      const locAggregation = await db.collection('imprints').aggregate()
        .match({ is_active: true })
        .group({ _id: '$anchorId' })
        .count('total')
        .end();
      const uniqueLocCount = locAggregation.list.length > 0 ? locAggregation.list[0].total : 0;

      return {
        locations: uniqueLocCount,
        reviews: imprintCount.total,
        themes: themeCount.total,
        users: userCount.total,
        onlineUsers: onlineCountRes.total,
        lastUpdated: new Date().getTime()
      };
    } catch (err) {
      console.error('adminGetStats 失败', err);
      throw err;
    }
  },

  /**
   * Admin: 获取所有主题列表
   */
  async adminGetThemes() {
    try {
      const { data } = await db.collection('themes')
        .orderBy('updatedAt', 'desc')
        .get();
      return data;
    } catch (err) {
      console.error('adminGetThemes 失败', err);
      throw err;
    }
  },

  /**
   * Admin: 获取所有地点 (从 imprints 聚合)
   */
  async adminGetLocations() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'adminService',
        data: { action: 'getLocations' }
      });
      
      if (!result.success) throw new Error(result.error);
      
      return (result.data || []).map(a => ({
        _id: a._id,
        name: a.name,
        spatialLevel: a.spatialLevel || 'spot',
        geo: a.geo,
        status: a.status || 'active',
        createTime: a.createTime,
        category: 'Life' // Default since category might be in imprints
      }));
    } catch (err) {
      console.error('adminGetLocations 失败', err);
      throw err;
    }
  },

  /**
   * Admin: 获取所有用户列表
   */
  async adminGetUsers() {
    try {
      const { data } = await db.collection('users')
        .orderBy('lastLoginTime', 'desc')
        .get();
      return data;
    } catch (err) {
      console.error('adminGetUsers 失败', err);
      throw err;
    }
  },

  /**
   * Admin: 获取所有刻痕 (替代 adminGetReviews)
   */
  async adminGetReviews() {
    try {
      const { data } = await db.collection('imprints')
        .orderBy('createTime', 'desc')
        .limit(100)
        .get();
      return data.map(imp => ({
        ...imp,
        name: imp.location?.name,
        rating: imp.judgment === 'recommend' ? 1 : -1
      }));
    } catch (err) {
      console.error('adminGetReviews 失败', err);
      return [];
    }
  },

  /**
   * Admin: 更新地点状态
   */
  async adminUpdateLocationStatus(id, status) {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'adminService',
        data: { action: 'updateLocationStatus', id, status }
      });
      if (!result.success) throw new Error(result.error);
      return result;
    } catch (err) {
      console.error('adminUpdateLocationStatus failed', err);
      throw err;
    }
  },

  /**
   * Admin: 冻结/解冻某条具体评价 (刻痕)
   */
  async adminUpdateReviewStatus(id, status) {
    try {
      return await db.collection('imprints').doc(id).update({
        data: {
          status,
          updateTime: db.serverDate()
        }
      });
    } catch (err) {
      console.error('adminUpdateReviewStatus 失败', err);
      throw err;
    }
  },

  /**
   * Admin: 冻结/解冻用户
   */
  async adminUpdateUserStatus(id, status) {
    try {
      return await db.collection('users').doc(id).update({
        data: {
          status,
          lastUpdated: db.serverDate()
        }
      });
    } catch (err) {
      console.error('adminUpdateUserStatus 失败', err);
      throw err;
    }
  },

  /**
   * Admin: 获取违规记录列表
   */
  async adminGetViolations() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'adminService',
        data: { action: 'getViolations' }
      });
      
      if (res.result?.success) {
        return res.result.data;
      } else {
        throw new Error(res.result?.error || '获取失败');
      }
    } catch (err) {
      console.error('adminGetViolations 失败', err);
      return []; // 返回空数组而不是抛出错误
    }
  },

  /**
   * Admin: 更新违规记录处理状态
   */
  async adminUpdateViolationStatus(id, handled) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'adminService',
        data: { 
          action: 'updateViolationStatus',
          id: id,
          handled: handled
        }
      });
      
      if (!res.result?.success) {
        throw new Error(res.result?.error || '更新失败');
      }
      return res.result;
    } catch (err) {
      console.error('adminUpdateViolationStatus 失败', err);
      throw err;
    }
  },

  // ========== 身份刻痕系统 (Identity Imprint System) ==========

  /**
   * 发布/更新刻痕 (核心方法)
   * 遵循同一用户同一地点唯一生效刻痕原则
   */
  async addImprint(imprintData) {
    const { location, judgment, comment, coreLayer, subLayer, bookTitle, action, stayTime } = imprintData;
    if (!judgment || !location) throw new Error('MISSING_PARAMS');

    try {
      // 1. 获取或计算空间锚点 (Lightweight & Deterministic)
      const anchorId = await this.getOrCreateAnchor({
        name: location.name,
        longitude: location.longitude,
        latitude: location.latitude,
        spatialLevel: location.spatialLevel || 'poi'
      });

      // 2. 核心写入流程：移交至云函数 (Security & Sovereignty)
      // 解决客户端 Permission Denied 错误，确保操作原子性
      wx.showLoading({ title: '正在确立立场...' });
      
      const cfResult = await wx.cloud.callFunction({
        name: 'addImprint',
        data: {
          anchorId: anchorId,
          location: {
            name: location.name,
            address: location.address || '',
            latitude: location.latitude,
            longitude: location.longitude,
            category: location.category || 'Life'
          },
          judgment: judgment,
          comment: comment || '',
          coreLayer, // [NEW]
          subLayer,  // [NEW]
          bookTitle, // [NEW]
          action,    // [NEW] Interaction Intent
          stayTime,  // [NEW] Analytics
          spatialLevel: location.spatialLevel || 'poi',
          spatialShape: location.spatialShape || 'point'
        }
      });

      wx.hideLoading();

      if (!cfResult.result || !cfResult.result.ok) {
        throw new Error(cfResult.result?.error || 'CLOUD_FUNCTION_ERROR');
      }

      return { 
        _id: cfResult.result.id, 
        anchorId: cfResult.result.anchorId 
      };

    } catch (err) {
      wx.hideLoading();
      console.error('[cloudService] addImprint 失败', err);
      throw err;
    }
  },

  /**
   * 获取或计算空间锚点 ID
   * 不再依赖 spatial_anchors 集合
   */
  /**
   * 纯前端计算锚点 ID (Spatial Sovereignty)
   * V1 架构修正：不再尝试在前端创建 Anchor，避免权限错误。
   * Anchor Creation 唯一合法入口是云函数 addImprint (JIT)。
   */
  async getOrCreateAnchor(anchorData) {
    const { longitude, latitude, spatialLevel = 'poi' } = anchorData;
    
    // v2.6 Lockdown: Strict parameters
    if (typeof longitude !== 'number' || typeof latitude !== 'number') {
      throw new Error('ANCHOR_CENTER_REQUIRED');
    }

    // 生成稳定的锚点 ID
    const slng = longitude.toFixed(6);
    const slat = latitude.toFixed(6);
    const anchorId = `a_${spatialLevel}_${slng}_${slat}`; 

    return anchorId; // 纯计算返回，不落库
  },

  /**
   * 获取用户在特定地点的生效刻痕
   */
  async getActiveImprint(anchorId, openid) {
    if (!anchorId || !openid) return null;
    try {
      const { data } = await db.collection('imprints').where({
        anchorId, // 改为 anchorId
        _openid: openid,
        is_active: true
      }).get();
      return data[0] || null;
    } catch (err) {
      return null;
    }
  },

  /**
   * 获取当前用户的所有活跃锚点 ID (用于首页 isMine 判定)
   * 结果确定且轻量
   */
  async getMyActiveAnchorIds(openid) {
    if (!openid) return new Set();
    try {
      const { data } = await db.collection('imprints')
        .where({
          _openid: openid,
          is_active: true
        })
        .field({
          anchorId: true
        })
        .get();
      
      const ids = data.map(imp => imp.anchorId);
      return new Set(ids);
    } catch (err) {
      console.warn('[cloudService] getMyActiveAnchorIds failed', err);
      return new Set();
    }
  },

  /**
   * 获取当前用户的所有刻痕
   */
  async getMyImprints() {
    const openid = wx.getStorageSync('openid');
    if (!openid) return [];

    return safeQuery(
      () => db.collection('imprints')
        .where({ 
          _openid: openid,
          is_active: true
        })
        .orderBy('createTime', 'desc')
        .get()
        .then(r => r.data || []),
      []
    );
  },

  /**
   * 获取当前用户的刻痕总数
   */
  /**
   * 获取当前用户的刻痕总数
   */
  async isAdmin() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'adminService',
        data: {
          action: 'checkAdmin'
        }
      });
      return { isAdmin: result?.isAdmin || false };
    } catch (err) {
      console.error('isAdmin check failed', err);
      return { isAdmin: false };
    }
  },

  /**
   * 获取当前用户的刻痕总数
   */
  async getMyImprintCount() {
    const openid = wx.getStorageSync('openid');
    if (!openid) return 0;

    try {
      const { total } = await db.collection('imprints')
        .where({ _openid: openid })
        .count();
      return total || 0;
    } catch (err) {
      console.warn('[cloudService] getMyImprintCount 失败，集合可能不存在', err);
      return 0;
    }
  },

  /**
   * 分页获取我的刻痕 (历史流)
   */
  async getMyImprintsPaginated(page = 0, pageSize = 20) {
    const openid = wx.getStorageSync('openid');
    if (!openid) return [];
    
    return safeQuery(
      () => db.collection('imprints')
        .where({ 
          _openid: openid,
          is_active: true
        })
        .orderBy('createTime', 'desc')
        .skip(page * pageSize)
        .limit(pageSize)
        .get()
        .then(r => r.data || []),
      []
    );
  },

  /**
   * 分页获取我的刻痕 (历史流)
   */
  async getMyReviewsPaginated(page = 0, pageSize = 20) {
    const openid = wx.getStorageSync('openid');
    try {
      const { data } = await db.collection('imprints')
        .where({ 
          _openid: openid,
          is_active: true 
        })
        .orderBy('createTime', 'desc')
        .skip(page * pageSize)
        .limit(pageSize)
        .get();
      return data;
    } catch (err) {
      console.error('getMyImprintsPaginated 失败', err);
      throw err;
    }
  },

  /**
   * 获取指定地点的所有刻痕 (L2 聚合展开)
   */
  async getImprintsByAnchorId(id) {
    if (!id) return [];

    return safeQuery(
      () => db.collection('imprints')
        .where(_.or([
          { anchorId: id },
          { locationId: id } // 兜底历史数据
        ]))
        .where({ is_active: true })
        .orderBy('createTime', 'desc')
        .get()
        .then(r => r.data || []),
      []
    );
  },

  async getImprintTimeline(id) {
    if (!id) return [];

    return safeQuery(
      () => db.collection('imprints')
        .where(_.or([
          { anchorId: id },
          { locationId: id }
        ]))
        .orderBy('createTime', 'desc')
        .get()
        .then(r => r.data || []),
      []
    );
  },

  /**
   * 获取指定用户的所有刻痕 (L3 身份层 / 分享态)
   */
  async getImprintsByUserId(targetOpenid) {
    if (!targetOpenid) return [];

    return safeQuery(
      () => db.collection('imprints')
        .where({ 
          _openid: targetOpenid,
          is_active: true
        })
        .orderBy('createTime', 'desc')
        .get()
        .then(r => r.data || []),
      []
    );
  },

  /**
   * 获取我的刻痕地点 (用于首页地图渲染)
   * 返回去重后的地点列表，附带该用户在每个地点的刻痕信息
   */
  async getMyImprintLocations() {
    const imprints = await this.getMyImprints();
    if (!imprints || imprints.length === 0) return [];

    // 按地点聚合 (兼容 anchorId 和 locationId)
    const locationMap = new Map();
    imprints.forEach(imp => {
      const aid = imp.anchorId || imp.locationId;
      if (!aid) return;
      
      if (!locationMap.has(aid)) {
        locationMap.set(aid, {
          anchorId: aid,
          name: imp.location?.name || '未知地点',
          address: imp.location?.address || '',
          geo: imp.location?.geo || imp.geo,
          imprints: []
        });
      }
      locationMap.get(aid).imprints.push({
        _id: imp._id,
        judgment: imp.judgment,
        comment: imp.comment,
        imprintIndex: imp.imprintIndex,
        createTime: imp.createTime
      });
    });

    locationMap.forEach((val, anchorId) => {
      locationMap.set(anchorId, {
        ...val,
        latestImprint: val.imprints[0]
      });
    });

    return Array.from(locationMap.values());
  },

  /**
   * Judgment Asset Layer: Fetch user judgments within a BROAD radius (e.g. 10km)
   * This breaks the Local Plateau by bringing in "Proof of Value" from previous sessions.
   */
  async getNearbyJudgmentAssets(lat, lng, radiusKm = 10) {
    const imprints = await this.getMyImprints();
    if (!imprints || imprints.length === 0) return { Food: [], Leisure: [] };

    const degPerKm = 1 / 111;
    const delta = radiusKm * degPerKm;

    const assets = { Food: [], Leisure: [] };
    const seenIds = new Set();

    imprints.forEach(imp => {
      const stance = imp.judgment?.stance || imp.judgment;
      if (stance !== 'recommend') return;

      const loc = imp.location || {};
      const iLat = loc.latitude || (imp.geo?.coordinates?.[1]);
      const iLng = loc.longitude || (imp.geo?.coordinates?.[0]);
      if (!iLat || !iLng) return;

      const dLat = Math.abs(iLat - lat);
      const dLng = Math.abs(iLng - lng);
      
      if (dLat < delta && dLng < delta) {
        const norm = normalizeItem(imp);
        const targetId = String(imp.anchorId || imp.poiId || norm.id);
        
        if (!seenIds.has(targetId)) {
          seenIds.add(targetId);
          
          // Layer Mapping: Be generous with user assets
          let layer = (norm.layer === 'Leisure' || norm.layer === 'Activity') ? 'Leisure' : 'Food';
          
          assets[layer].push({
            ...norm,
            isRecommended: true,
            subtitle: '✅ 你觉得适合',
            poiId: targetId,
            _tier: 'PINNED_ASSET',
            _distance_approx: Math.max(dLat, dLng) * 111000 // In meters
          });
        }
      }
    });

    return assets;
  },

  /**
   * 获取附近的刻痕 (Active Imprints)
   */
  async getNearbyImprints(lat, lng, maxDistance = 5000) {
    try {
      // 优先从 spatial_anchors 找锚点，再找相关的活跃刻痕 (逻辑已整合在 getSpatialAggregates)
      return this.getSpatialAggregates(lat, lng, maxDistance, 'poi');
    } catch (err) {
      console.error('[cloudService] getNearbyImprints 失败', err);
      return [];
    }
  },


};

module.exports = cloudService;
