const cloudService = require('./cloudService');

const judgmentService = {
  /**
   * v2.4: Unified World Judgment Heuristics
   * weight = base(stance) * confidence * freshness
   */
  async getConsensus(anchorId) {
    try {
      const imprints = await cloudService.getImprintsByAnchor(anchorId);
      return this.calculateConsensusFromImprints(imprints);
    } catch (err) {
      console.error('[judgmentService] Consensus calculation failed', err);
      return { consensusText: '判断加载失败', isUnsteady: false, stats: { total: 0 } };
    }
  },

  /**
   * Synchronous logic for batch processing (when imprints are already loaded)
   */
  calculateConsensusFromImprints(imprints) {
    const activeImprints = imprints.filter(i => i.is_active || i.is_active === undefined);

    if (activeImprints.length === 0) {
      return {
        consensusText: '等待邻居在这里留下第一个判断',
        isUnsteady: false,
        stats: { total: 0 }
      };
    }

    let totalWeight = 0;
    let recommendSignal = false;
    let avoidSignal = false;

    activeImprints.forEach(imp => {
      const stance = imp.judgment?.stance || imp.judgment;
      const confidence = 1; // v2.5 Simplified: all judgments are equal weight
      
      let factor = 0;
      if (stance === 'recommend') {
        factor = 1;
        recommendSignal = true;
      } else if (stance === 'avoid') {
        factor = -1;
        avoidSignal = true;
      }
      totalWeight += (factor * confidence);
    });

    const threshold = 0.5; // Lower threshold since weights are 1
    const isSplit = recommendSignal && avoidSignal;

    let consensusText = '判断分歧较大';
    let tendency = 'split';

    if (totalWeight > threshold) {
      consensusText = '邻里更倾向于推荐';
      tendency = 'recommend';
    } else if (totalWeight < -threshold) {
      consensusText = '邻里建议避开';
      tendency = 'avoid';
    } else if (!isSplit) {
      consensusText = '判断正在形成中...';
    }

    return {
      consensusText,
      tendency,
      isUnsteady: isSplit || (Math.abs(totalWeight) <= threshold && activeImprints.length > 1),
      stats: {
        total: activeImprints.length,
        weight: totalWeight
      }
    };
  }
};

module.exports = judgmentService;
