(() => {
  'use strict';

  const base = GrowthCatalog.get('pool', 'stronghold-java@1.17.1');
  const corridors = base.templates.filter((piece) => piece.id !== 'library' && piece.id !== 'portal')
    .map((piece) => ({ ...piece, category: 'corridor', tags: ['corridor'] }));

  // Width and depth include the shell. Odd widths keep centred 3 m openings on the block grid.
  function room(id, name, w, h, d, exitSide) {
    const connectors = [{ id: 'entry', label: '入口', side: 'n', x: w / 2, y: 1, z: 0, chance: 1 }];
    if (exitSide === 's') {
      connectors.push({ id: 'forward', label: '前方出口', side: 's', x: w / 2, y: 1, z: d, chance: 1 });
    } else if (exitSide === 'e') {
      connectors.push({ id: 'right', label: '右侧门', side: 'e', x: w, y: 1, z: d / 2, chance: 1 });
    }
    return { id, name, w, h, d, connectors, category: 'room', tags: id === 'portal' ? ['room', 'portal'] : ['room'],
      interior: 'empty' };
  }

  const chambers = [
    room('hall', '大厅', 15, base.pieces.crossing.h, 19, 's'),
    room('chamber', '方厅', 17, base.pieces.crossing.h, 17, 'e'),
    room('sideRoom', '侧室', 11, base.pieces.chest.h, 13),
    room('library', '图书馆', 19, base.pieces.library.h, 19),
    room('portal', '末地传送门房', 25, 40, 25),
  ];
  const templates = [...corridors, ...chambers];
  const pieces = Object.fromEntries(templates.map((piece) => [piece.id, piece]));

  function measure(id, options = {}) {
    const piece = pieces[id];
    if (piece.category === 'corridor') return base.measure(id, options);
    const h = id === 'library' && options.short ? base.measure(id, options).h : piece.h;
    return { w: piece.w, h, d: piece.d };
  }

  function instantiate(id, random, options = {}) {
    const piece = pieces[id];
    if (piece.category === 'corridor') {
      const data = base.instantiate(id, random, options);
      // The Java five-way crossing sometimes grows through an uncarved wall.
      // In this pool each active branch has a corresponding physical opening.
      if (id === 'fiveCrossing') {
        for (const port of data.connectors) port.hasOpening = port.active;
      }
      return { ...data, category: piece.category };
    }
    const { w, h, d } = measure(id, options);
    return { templateId: id, template: piece.name, localW: w, localH: h, localD: d,
      facing: options.facing || 's', doorType: 'open',
      connectors: piece.connectors.map((port) => ({ ...port, active: true, hasOpening: true })),
      category: piece.category, interior: piece.interior, variant: 0, variantName: '空房间' };
  }

  GrowthCatalog.register('pool', {
    id: 'stronghold-large-rooms', version: '1.0.0', name: '要塞 · 大房间',
    description: '普通房间宽深 10–20 米，设一至两扇门，内部留空。末地传送门房平面 25 × 25 米，高 40 米。',
    viewKind: 'stronghold', templates, measure, instantiate,
    worldPoint: base.worldPoint, worldSide: base.worldSide, localSize: base.localSize, doorHeights: base.doorHeights,
  });
})();
