const REVIEW_SCHEMA = {
  categories: [
    { label: '🍜 餐饮 / 美食', value: 'Food' },
    { label: '☕ 咖啡 / 茶饮', value: 'Drink' },
    { label: '🛍️ 购物 / 商场', value: 'Shopping' },
    { label: '💆 生活 / 服务', value: 'Life' },
    { label: '🎢 休闲 / 玩乐', value: 'Leisure' }
  ],
  tags: {
    'Food': {
      praise: ['味道惊艳', '食材新鲜', '分量足', '性价比高', '老板热情', '上菜快'],
      complaint: ['排队太久', '又贵又难吃', '卫生堪忧', '分量太少', '服务态度差'],
      scenario: ['适合聚餐', '一人食友好', '需预约']
    },
    'Drink': {
      praise: ['豆子香 / 奶味浓', '环境安静', '插座多', '超出片', 'BGM有品味'],
      complaint: ['太吵了', '位置挤', '出品慢', '太甜/太淡', '没厕所'],
      scenario: ['适合办公', '适合发呆', '宠物友好']
    },
    'Shopping': {
      praise: ['品牌全', '好停车', '折扣多', '遛娃方便', '厕所干净'],
      complaint: ['迷宫设计', '停车费贵', '人挤人', '冷气太足', '柜姐高冷'],
      scenario: ['高端好逛', '亲民超市']
    },
    'Life': {
      praise: ['手艺好/专业', '全程无推销', '价格透明', '环境隐私', '服务细致'],
      complaint: ['疯狂推销办卡', '有隐形消费', '很难约', '效果一般', '店员脸臭'],
      scenario: ['需提前约', '24小时营业']
    },
    'Leisure': {
      praise: ['很好玩/刺激', '超出片', '设施新', '寓教于乐', '值回票价'],
      complaint: ['人太多', '太坑/智商税', '设施老旧', '有异味', '交通不便'],
      scenario: ['适合遛娃', '适合情侣', '适合团建']
    }
  }
};

const CORE_LAYERS = {
  SOLITUDE: 'Solitude',
  COUPLE: 'Couple',
  SOCIAL: 'Social',
  FAMILY: 'Family',
  FOOD: 'Food',
  ACTIVITY: 'Activity',
  WORK: 'Work',
  TRANSIT: 'Transit',
  LEISURE: 'Leisure'
};

const CORE_LAYER_LABELS = {
  [CORE_LAYERS.SOLITUDE]: '独处',
  [CORE_LAYERS.COUPLE]: '情侣 / 亲密',
  [CORE_LAYERS.SOCIAL]: '朋友 / 社交',
  [CORE_LAYERS.FAMILY]: '家庭',
  [CORE_LAYERS.FOOD]: '吃饭',
  [CORE_LAYERS.ACTIVITY]: '运动 / 活动',
  [CORE_LAYERS.WORK]: '工作 / 学习',
  [CORE_LAYERS.TRANSIT]: '路过 / 中转',
  [CORE_LAYERS.LEISURE]: '休闲 / 玩乐'
};

module.exports = {
  REVIEW_SCHEMA,
  CORE_LAYERS,
  CORE_LAYER_LABELS
};
