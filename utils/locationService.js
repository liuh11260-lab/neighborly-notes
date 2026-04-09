const CACHE_KEY = 'LAST_LOCATION';

const locationService = {
  /**
   * Get current location and address with cache and fallback support
   */
  async getCurrentLocationWithAddress() {
    try {
      // 1. Try to get real-time location
      const location = await this.getLocation();
      
      // 2. Try to get address via cloud function (with server-side caching)
      const address = await this.reverseGeocode(
        location.latitude,
        location.longitude
      );

      const result = {
        latitude: location.latitude,
        longitude: location.longitude,
        address
      };

      // Update local storage cache
      wx.setStorageSync(CACHE_KEY, result);
      return result;
    } catch (e) {
      console.error('[locationService] Failed to get real-time location/address', e);
      
      // 3. Fallback to local cache
      const cache = wx.getStorageSync(CACHE_KEY);
      if (cache) {
        console.log('[locationService] Using local cache fallback');
        return cache;
      }

      // 4. Ultimate fallback/Manual selection required
      throw e;
    }
  },

  /**
   * Promisified wx.getLocation
   */
  getLocation() {
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: resolve,
        fail: (err) => {
          console.error('[locationService] wx.getLocation failed', err);
          reject(err);
        }
      });
    });
  },

  /**
   * Call cloud function for reverse geocoding
   */
  async reverseGeocode(lat, lng) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'locationService',
        data: { latitude: lat, longitude: lng }
      });

      if (res.result && res.result.ok) {
        return res.result.address;
      }
      throw new Error('Cloud function returned error');
    } catch (err) {
      console.warn('[locationService] Cloud reverseGeocode failed', err);
      // Strictly no client-side API fallback per architecture rules.
      throw err;
    }
  }


};

module.exports = locationService;
