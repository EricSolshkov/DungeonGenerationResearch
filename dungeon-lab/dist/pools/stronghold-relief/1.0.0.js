(() => {
  'use strict';

  const base = GrowthCatalog.get('pool', 'stronghold-larger-rooms@1.0.0');
  const compact = GrowthCatalog.get('pool', 'stronghold-large-rooms@1.0.0');
  const hall = base.pieces.hall;
  const hallJunction = {
    ...hall, id: 'hallJunction', name: '三出口主厅',
    connectors: [
      ...hall.connectors,
      { id: 'left', label: '左侧出口', side: 'w', x: 0, y: 1, z: hall.d / 2, chance: 1 },
      { id: 'right', label: '右侧出口', side: 'e', x: hall.w, y: 1, z: hall.d / 2, chance: 1 },
    ],
  };

  // Both versions use the same physical staircase. Only the end offered as entry changes.
  function stair(id, name, stairKind, w, d, ascending = false) {
    const high = { side: 'n', x: w / 2, y: 13, z: 0, chance: 1 };
    const low = { side: 's', x: w / 2, y: 1, z: d, chance: 1 };
    return {
      id, name, w, h: high.y + 4, d, stairKind, category: 'corridor', tags: ['corridor'],
      connectors: [
        { ...(ascending ? low : high), id: 'entry', label: ascending ? '低处入口' : '高处入口' },
        { ...(ascending ? high : low), id: 'forward', label: ascending ? '高处出口' : '低处出口' },
      ],
    };
  }

  const revisions = [
    hallJunction,
    stair('start', '起始螺旋楼梯', 'spiral', 11, 11),
    stair('spiralStairs', '螺旋楼梯', 'spiral', 11, 11),
    stair('spiralStairsUp', '螺旋楼梯', 'spiral', 11, 11, true),
    stair('straightStairs', '直行楼梯', 'straight', 5, 16),
    stair('straightStairsUp', '直行楼梯', 'straight', 5, 16, true),
  ];
  const revised = Object.fromEntries(revisions.map((piece) => [piece.id, piece]));
  const sourceFor = (id) => id === 'sideRoom' ? compact : base;
  const templates = base.templates.map(({ id }) => revised[id] ?? sourceFor(id).pieces[id])
    .concat(revisions.filter((piece) => !base.pieces[piece.id]));

  function measure(id, options) {
    if (!revised[id]) return sourceFor(id).measure(id, options);
    const { w, h, d } = revised[id];
    return { w, h, d };
  }

  function instantiate(id, random, options = {}) {
    const piece = revised[id];
    if (!piece) return sourceFor(id).instantiate(id, random, options);
    const [entry, exit] = piece.connectors;
    const details = piece.stairKind
      ? { stairKind: piece.stairKind, variantName: exit.y > entry.y ? '上行 12 米' : '下行 12 米' }
      : { interior: piece.interior, variantName: '空房间' };
    return {
      templateId: id, template: piece.name, localW: piece.w, localH: piece.h, localD: piece.d,
      facing: options.facing || 's', doorType: 'open', category: piece.category, variant: 0, ...details,
      connectors: piece.connectors.map((port) => ({ ...port, active: true, hasOpening: true })),
    };
  }

  GrowthCatalog.register('pool', {
    id: 'stronghold-relief', version: '1.0.0', name: '要塞 · 双向楼梯',
    description: '侧室平面 11 × 13 米。主厅可选三出口变种，直梯和螺旋梯的两端相差 12 米，均可从高端或低端接入。',
    viewKind: base.viewKind, templates, measure, instantiate,
    worldPoint: base.worldPoint, worldSide: base.worldSide, localSize: base.localSize, doorHeights: base.doorHeights,
  });
})();
