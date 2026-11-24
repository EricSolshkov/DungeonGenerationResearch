(() => {
  'use strict';

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

  function piece(id, name, w, h, d, weight, maxCount, connectors, minDepth = 0) {
    return { id, name, w, h, d, weight, maxCount, minDepth, connectors };
  }

  // Pool order also determines which later entries may be tried after a collision.
  const pool = [
    piece('straight', '直走廊', 5, 5, 7, 40, Infinity, [
      narrowEntry, forward(2.5, 1, 7),
      connector('left', '左侧门', 'w', 0, 1, 3.5, .5),
      connector('right', '右侧门', 'e', 5, 1, 3.5, .5),
    ]),
    piece('prison', '监牢走廊', 9, 5, 11, 5, 5, [narrowEntry, forward(2.5, 1, 11)]),
    piece('leftTurn', '左转走廊', 5, 5, 5, 20, Infinity, [narrowEntry, connector('turn', '左转出口', 'e', 5, 1, 2.5)]),
    piece('rightTurn', '右转走廊', 5, 5, 5, 20, Infinity, [narrowEntry, connector('turn', '右转出口', 'w', 0, 1, 2.5)]),
    piece('crossing', '十字厅', 11, 7, 11, 10, 6, [
      wideEntry, forward(5.5, 1, 11),
      connector('left', '左侧门', 'w', 0, 1, 5.5), connector('right', '右侧门', 'e', 11, 1, 5.5),
    ]),
    piece('straightStairs', '直行楼梯', 5, 11, 8, 5, 5, [stairEntry, forward(2.5, 1, 8)]),
    piece('spiralStairs', '螺旋楼梯', 5, 11, 5, 5, 5, [stairEntry, forward(2.5, 1, 5)]),
    piece('fiveCrossing', '五向交叉厅', 10, 9, 11, 5, 4, [
      entry(5.5, 3), forward(6.5, 1, 11),
      connector('leftLow', '左侧低门', 'w', 0, 3, 2.5, .5),
      connector('leftHigh', '左侧高门', 'w', 0, 5, 8.5, .5),
      connector('rightLow', '右侧低门', 'e', 10, 3, 2.5, .5),
      connector('rightHigh', '右侧高门', 'e', 10, 5, 8.5, 2 / 3),
    ]),
    piece('chest', '宝箱走廊', 5, 5, 7, 5, 4, [narrowEntry, forward(2.5, 1, 7)]),
    piece('library', '图书馆', 14, 11, 15, 10, 2, [wideEntry], 5),
    piece('portal', '末地传送门房', 11, 8, 16, 20, 1, [wideEntry], 6),
  ];
  const pieces = Object.fromEntries(pool.map((item) => [item.id, item]));
  pieces.start = piece('start', '起始螺旋楼梯', 5, 11, 5, 0, 1, [stairEntry, forward(2.5, 1, 5)]);
  pieces.filler = piece('filler', '填充短廊', 5, 5, 4, 0, Infinity, [narrowEntry]);

  const doors = ['open', 'open', 'wood', 'grates', 'iron'];
  const crossingVariants = ['火把石柱', '石制喷泉', '双层储藏间', '空厅', '空厅'];

  function instantiate(id, random, options = {}) {
    const template = pieces[id];
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
      localH: id === 'library' && options.short ? 6 : template.h,
      localD: id === 'filler' ? (options.length ?? template.d) : template.d,
      facing, doorType, connectors, variant, variantName,
    };
  }

  // StructurePiece.getWorldX/Z mirror some directions. A yaw rotation alone
  // would put off-center entrances and asymmetrical rooms on the wrong side.
  const transforms = {
    s: { xx: 1, xz: 0, zx: 0, zz: 1, sides: { n: 'n', e: 'e', s: 's', w: 'w' } },
    n: { xx: 1, xz: 0, zx: 0, zz: -1, sides: { n: 's', e: 'e', s: 'n', w: 'w' } },
    w: { xx: 0, xz: -1, zx: 1, zz: 0, sides: { n: 'e', e: 's', s: 'w', w: 'n' } },
    e: { xx: 0, xz: 1, zx: 1, zz: 0, sides: { n: 'w', e: 's', s: 'e', w: 'n' } },
  };
  function worldPoint(room, [x, y, z]) {
    const transform = transforms[room.facing];
    const dx = x - room.localW / 2;
    const dz = z - room.localD / 2;
    return [room.x + dx * transform.xx + dz * transform.xz, room.y + y,
      room.z + dx * transform.zx + dz * transform.zz];
  }
  function worldSide(roomOrFacing, side) {
    return transforms[roomOrFacing.facing || roomOrFacing].sides[side];
  }
  function localSize(room) {
    return [room.localW, room.localH, room.localD];
  }
  function doorHeights(room) {
    return [...new Set(room.connectors.filter((port) => port.id === 'entry' || port.active || port.hasOpening)
      .map((port) => room.y + port.y))].sort((a, b) => a - b);
  }

  globalThis.StrongholdTemplates = { pieces, pool, instantiate, worldPoint, worldSide, localSize, doorHeights };
})();
