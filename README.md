# 友邻笔记 (Neighborly Notes) - 身份刻痕版

[友邻笔记](file:///Users/leogreen/WeChatProjects/neighborly-notes-(友邻笔记)/README.md) 不再只是一个邻里社区，而是一个基于地理位置的**身份刻痕系统 (Identity Imprint System)**。它让用户在现实世界中留下可被传播的「身份痕迹」。

> **核心理念**：单用户即闭环。我是谁，在这里，留下了什么判断。

---

## 📑 快速导航
- [🎨 产品设计文档 (Paradigm Shift)](file:///Users/leogreen/WeChatProjects/neighborly-notes-(友邻笔记)/docs/PRODUCT_DESIGN.md)：了解从“邻里共识”到“身份刻痕”的范式切换。
- [📖 使用教程](file:///Users/leogreen/WeChatProjects/neighborly-notes-(友邻笔记)/docs/USER_GUIDE.md)：涵盖普通用户与管理员的完整操作指南。
- [🛡 审核规避指南](file:///Users/leogreen/WeChatProjects/neighborly-notes-(友邻笔记)/docs/submission-rules-20260115.md)：记录了小程序提交审核的避坑经验。

---

## 🌟 核心能力

### 1. 身份刻痕 (Identity Imprint) [NEW]
- **原子单位**：刻痕 = 用户 × 地点 × 判断。
- **5秒闭环**：点击 → 自动定位 → 三选一判断（🔴推荐/🟢避雷/⚪️记录） → 发布。
- **即时反馈**：系统会告诉你“这是你在这个城市留下的第 N 个判断”。

### 2. 我的刻痕地图 (My Map)
- **私域优先**：首页默认展示“我的地图”，而非杂乱的附近信息。
- **L1/L2/L3 层级**：以中性图标（L1）避免地图噪音，支持点击展开聚合信息（L2）和查看单人足迹（L3）。

### 3. 内容安全保障 (Safety & Compliance)
- **实时拦截**：全量接入微信内容安全 API (v2)，智能拦截违规 UGC 内容。
- **违规审计**：自动记录违规内容到后台日志，支持管理员人工复审。

### 4. AI 助写 (AI Assistant)
- **Gemini 驱动**：集成 Google Gemini 1.5 Pro 模型，将零碎想法瞬间转化为高质量笔记。

---

## 🛠️ 技术栈

- **前端**: 微信小程序原生框架 (WXML, WXSS, JavaScript)
- **后端**: 微信云开发 (Cloud Database, Cloud Functions, Cloud Storage)
- **AI 能力**: Google Gemini Pro 1.5 API
- **地图能力**: 腾讯地图 SDK

---

## 🚀 快速上手

1. **导入项目**：使用微信开发者工具导入本项目。
2. **环境配置**：
   - 在 `utils/cloudService.js` 的 `ADMIN_LIST` 中配置管理员 OpenID。
   - 部署 `cloudfunctions` 下的所有云函数（选择“云端安装依赖”）。
3. **数据库创建**：在云开发控制台中创建 `locations`, `reviews`, `themes`, `users`, `content_violations`, ** `imprints` (New) ** 集合。

---

## 🛡️ 开源协议

本项目仅供学习与社区互助目的使用。请共同维护真实、友好的邻里网络环境。
