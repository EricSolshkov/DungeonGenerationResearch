(() => {
  'use strict';

  const baseline = GrowthCatalog.get('ruleset', 'stronghold-java@1.17.1');
  GrowthCatalog.register('ruleset', baseline.createRules({
    id: 'stronghold-experiment', version: '1.0.0', name: '五向交叉厅加权',
    description: '五向交叉厅的抽取权重为 10，对照组为 5。起始强制交叉厅与数量上限沿用对照组。',
    weights: { fiveCrossing: 10 },
  }));
})();
