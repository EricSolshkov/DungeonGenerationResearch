(() => {
  'use strict';

  if (typeof module === 'object' && module.exports && !globalThis.StrongholdTemplates) {
    require('../../stronghold-templates.js');
  }
  const { worldPoint, worldSide, localSize, doorHeights } = globalThis.StrongholdTemplates;
  // Java Edition 1.17.1, StrongholdPieces. Dimensions include the shell.
  // Local coordinates use block boundaries, +Z forward, +Y up. Door positions
  // are the sill centers on the outer faces of the adjoining 3 × 3 openings.
  function connector(id, label, side, x, y, z, chance = 1) {
    return { id, label, side, x, y, z, chance };
  }
  const entry = (x, y) => connector('entry', '入口', 'n', x, y, 0);
  const forward = (x, y, d) => connector('forward', '前方出口', 's', x, y, d);
  const narrowEntry = entry(2.5, 1);
  const stairEntry = entry(2.5, 7);
  const wideEntry = entry(5.5, 1);

  function piece(id, name, w, h, d, connectors) {
    return { id, name, w, h, d, connectors };
  }

  // Geometry is independent of selection weights and generation quotas.
  const templates = [
    piece('straight', '直走廊', 5, 5, 7, [
      narrowEntry, forward(2.5, 1, 7),
      connector('left', '左侧门', 'w', 0, 1, 3.5, .5),
      connector('right', '右侧门', 'e', 5, 1, 3.5, .5),
    ]),
    piece('prison', '监牢走廊', 9, 5, 11, [narrowEntry, forward(2.5, 1, 11)]),
    piece('leftTurn', '左转走廊', 5, 5, 5, [narrowEntry, connector('turn', '左转出口', 'e', 5, 1, 2.5)]),
    piece('rightTurn', '右转走廊', 5, 5, 5, [narrowEntry, connector('turn', '右转出口', 'w', 0, 1, 2.5)]),
    piece('crossing', '十字厅', 11, 7, 11, [
      wideEntry, forward(5.5, 1, 11),
      connector('left', '左侧门', 'w', 0, 1, 5.5), connector('right', '右侧门', 'e', 11, 1, 5.5),
    ]),
    piece('straightStairs', '直行楼梯', 5, 11, 8, [stairEntry, forward(2.5, 1, 8)]),
    piece('spiralStairs', '螺旋楼梯', 5, 11, 5, [stairEntry, forward(2.5, 1, 5)]),
    piece('fiveCrossing', '五向交叉厅', 10, 9, 11, [
      entry(5.5, 3), forward(6.5, 1, 11),
      connector('leftLow', '左侧低门', 'w', 0, 3, 2.5, .5),
      connector('leftHigh', '左侧高门', 'w', 0, 5, 8.5, .5),
      connector('rightLow', '右侧低门', 'e', 10, 3, 2.5, .5),
      connector('rightHigh', '右侧高门', 'e', 10, 5, 8.5, 2 / 3),
    ]),
    piece('chest', '宝箱走廊', 5, 5, 7, [narrowEntry, forward(2.5, 1, 7)]),
    piece('library', '图书馆', 14, 11, 15, [wideEntry]),
    piece('portal', '末地传送门房', 11, 8, 16, [wideEntry]),
  ];
  const pieces = Object.fromEntries(templates.map((item) => [item.id, item]));
  pieces.start = piece('start', '起始螺旋楼梯', 5, 11, 5, [stairEntry, forward(2.5, 1, 5)]);
  pieces.filler = piece('filler', '填充短廊', 5, 5, 4, [narrowEntry]);

  const doors = ['open', 'open', 'wood', 'grates', 'iron'];
  const crossingVariants = ['火把石柱', '石制喷泉', '双层储藏间', '空厅', '空厅'];

  function instantiate(id, random, options = {}) {
    const template = pieces[id];
    const bounds = measure(id, options);
    const facing = options.facing || 's';
    const doorType = id === 'portal' ? 'grates'
      : id === 'start' || id === 'filler' ? 'open' : doors[Math.floor(random() * doors.length)];
    let variant = 0;
    let variantName = '';
    let connectors = template.connectors.map((port) => {
      let active = true;
      if (port.chance < 1) {
        if (id === 'straight') active = Math.floor(random() * 2) === 0;
        else if (port.id === 'rightHigh') active = Math.floor(random() * 3) > 0;
        else active = random() >= .5;
      }
      return { ...port, active, hasOpening: active };
    });

    if ((id === 'leftTurn' || id === 'rightTurn') && (facing === 'n' || facing === 'e')) {
      const turn = connectors[1];
      turn.side = turn.side === 'e' ? 'w' : 'e';
      turn.x = template.w - turn.x;
    }
    if (id === 'fiveCrossing' && (facing === 'n' || facing === 'w')) {
      // addChildren swaps the two anchors per side here. postProcess still carves
      // the opening associated with the original flag. Keep both independent,
      // and retain vanilla's order of child-generation attempts.
      const [entrance, front, leftLow, leftHigh, rightLow, rightHigh] = connectors;
      connectors = [entrance, front, { ...leftHigh, active: leftLow.active, chance: leftLow.chance },
        { ...leftLow, active: leftHigh.active, chance: leftHigh.chance },
        { ...rightHigh, active: rightLow.active, chance: rightLow.chance },
        { ...rightLow, active: rightHigh.active, chance: rightHigh.chance }];
    }
    if (id === 'crossing') {
      variant = Math.floor(random() * crossingVariants.length);
      variantName = crossingVariants[variant];
    } else if (id === 'library') {
      variantName = options.short ? '单层书库' : '双层书库';
    }
    return {
      templateId: id, template: template.name, localW: template.w,
      localH: bounds.h,
      localD: bounds.d,
      facing, doorType, connectors, variant, variantName,
    };
  }

  function measure(id, options = {}) {
    const template = pieces[id];
    return {
      w: template.w,
      h: id === 'library' && options.short ? 6 : template.h,
      d: id === 'filler' ? options.length ?? template.d : template.d,
    };
  }

  GrowthCatalog.register('pool', {
    id: 'stronghold-java', version: '1.17.1', name: 'Java 1.17.1 要塞片段',
    description: '13 类要塞片段的尺寸、局部门位、朝向变换与内部结构变体。',
    viewKind: 'stronghold', templates: Object.values(pieces),
    measure, instantiate, worldPoint, worldSide, localSize, doorHeights,
  });
})();
