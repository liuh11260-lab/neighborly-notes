const cloudService = require("../../utils/cloudService");

Component({
  properties: {
    show: {
      type: Boolean,
      value: false,
    },
    darkMode: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    avatarUrl: "",
    nickName: "",
    agreed: false
  },

  methods: {
    onMaskTap() {
      this.triggerEvent("close");
    },

    stopPropagation() {
      // 阻止事件冒泡
    },

    // 选择头像
    onChooseAvatar(e) {
      const { avatarUrl } = e.detail;
      this.setData({ avatarUrl });
    },

    // 输入昵称
    onNicknameInput(e) {
      this.setData({ nickName: e.detail.value });
    },

    onNicknameBlur(e) {
      this.setData({ nickName: e.detail.value });
    },



    onAgreementChange(e) {
      this.setData({ agreed: e.detail.value.length > 0 });
    },

    // 确认登录
    async onConfirmTap() {
      const { avatarUrl, nickName, agreed } = this.data;

      if (!agreed) {
        wx.showToast({
          title: "请先阅读并同意用户协议及隐私政策",
          icon: "none",
        });
        return;
      }

      if (!avatarUrl && !nickName) {
        wx.showToast({
          title: "请设置头像或昵称",
          icon: "none",
        });
        return;
      }

      const userInfo = {
        avatarUrl: avatarUrl || "../../images/icons/default_avatar.svg",
        nickName: nickName || "友邻用户",
      };

      wx.showLoading({ title: '登录中...' });

      // 保存到本地
      try {
        wx.setStorageSync("userInfo", userInfo);
      } catch (e) {
        console.log("保存用户信息失败", e);
      }

      // 同步到全局
      const app = getApp();
      app.globalData.userInfo = userInfo;

      // 尝试保存到云端
      let finalAvatarUrl = userInfo.avatarUrl;
      try {
        const loginRes = await wx.cloud.callFunction({ name: "login" });
        if (loginRes.result && loginRes.result.openid) {
          const openid = loginRes.result.openid;
          wx.setStorageSync("openid", openid);

          // 1. Upload Avatar if local
          if (avatarUrl && !avatarUrl.startsWith('cloud://')) {
            const cloudPath = `avatars/${openid}-${Date.now()}.png`;
            const uploadRes = await wx.cloud.uploadFile({
              cloudPath: cloudPath,
              filePath: avatarUrl
            });
            finalAvatarUrl = uploadRes.fileID;
            userInfo.avatarUrl = finalAvatarUrl;
            wx.setStorageSync("userInfo", userInfo);
            app.globalData.userInfo = userInfo;
          }

          await cloudService.getOrCreateUser(openid, userInfo);
        }
      } catch (e) {
        console.log("云端保存用户信息失败，使用本地存储", e);
      }

      wx.hideLoading();

      // 通知父组件登录成功
      this.triggerEvent("success", { userInfo });

      wx.showToast({
        title: "登录成功",
        icon: "success",
      });

      // 延迟关闭弹窗
      setTimeout(() => {
        this.triggerEvent("close");
      }, 500);
    },

    viewTerms() {
      wx.navigateTo({
        url: '/pages/legal/terms/terms'
      });
    },

    viewPrivacy() {
      wx.navigateTo({
        url: '/pages/legal/privacy/privacy'
      });
    },

    onLaterTap() {
      this.triggerEvent("close");
    },
  },
});
