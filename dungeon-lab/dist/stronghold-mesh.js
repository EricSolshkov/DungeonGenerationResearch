(() => {
  'use strict';

  const colors = {
    stone: '#84918d', floor: '#73827c', moss: '#6b8071', mortar: '#4e5f5b',
    slab: '#a7b3a8', wood: '#78563d', plank: '#b18858', iron: '#91a6a7', metal: '#47565b',
    brass: '#dbb569', fire: '#ffc46a', lava: '#ec843d', water: '#56a9c7',
    frame: '#477d73', ivory: '#b6b38a', socket: '#293f42', ember: '#d5a269',
    folio: '#9a6262', teal: '#66948b', ochre: '#b59b68', spine: '#787f9a',
  };
  for (const [name, hex] of Object.entries(colors)) {
    colors[name] = [...[1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255), 1];
  }
  const { stone, floor, moss, mortar, slab, wood, plank, iron, metal, brass, fire } = colors;
  const sides = ['n', 'e', 's', 'w'];

  // The mesh and the generation graph share the same continuous block boundaries.
  function localBrush(mesh, room, { worldPoint, worldSide }) {
    const point = (x, y, z) => worldPoint(room, [x, y, z]);
    const box = (x0, y0, z0, x1, y1, z1, color = stone) => {
      const a = point(x0, y0, z0);
      const b = point(x1, y1, z1);
      mesh.box(Math.min(a[0], b[0]), a[1], Math.min(a[2], b[2]),
        Math.max(a[0], b[0]), b[1], Math.max(a[2], b[2]), color);
    };
    const line = (x0, y0, z0, x1, y1, z1, color = mortar) => mesh.line(point(x0, y0, z0), point(x1, y1, z1), color);
    // Material patches share the block surface. Give the mesher their outward
    // direction explicitly because some Java orientations mirror the template.
    const face = (points, color, side) => {
      const facing = side === 'up' ? side : worldSide(room.facing, side);
      const sign = facing === 'up' || facing === 'e' || facing === 's' ? 1 : -1;
      mesh.face(points.map((p) => point(...p)), color, sign);
    };
    return { box, line, face };
  }

  function wallBrush({ box, line }, room, side) {
    const alongX = side === 'n' || side === 's';
    const coord = (u, y, inset) => {
      if (side === 'n') return [u, y, inset];
      if (side === 's') return [u, y, room.localD - inset];
      if (side === 'w') return [inset, y, u];
      return [room.localW - inset, y, u];
    };
    return {
      length: alongX ? room.localW : room.localD,
      box: (lo, bottom, near, hi, top, far, color) => box(...coord(lo, bottom, near), ...coord(hi, top, far), color),
      line: (lo, bottom, near, hi, top, far, color) => line(...coord(lo, bottom, near), ...coord(hi, top, far), color),
    };
  }

  // Iron bars leave the centre of a grated entrance open. Wooden and iron doors
  // occupy the centre block and have a full brick surround.
  function bars(brush, left, bottom, right, top, depth) {
    for (let u = left + .15; u < right; u += .35) brush.box(u, bottom, depth, u + .07, top, depth + .08, iron);
    for (let y = bottom + .2; y < top; y += .8) brush.box(left, y, depth, right, y + .075, depth + .08, metal);
  }

  function door(brush, center, sill, type) {
    if (type === 'open') return;
    const l = center - 1.5;
    if (type === 'grates') {
      bars(brush, l, sill, l + 1, sill + 2, .47);
      bars(brush, l + 2, sill, l + 3, sill + 2, .47);
      bars(brush, l, sill + 2, l + 3, sill + 3, .47);
      return;
    }
    brush.box(l, sill, 0, l + 1, sill + 3, 1, stone);
    brush.box(l + 2, sill, 0, l + 3, sill + 3, 1, stone);
    brush.box(l + 1, sill + 2, 0, l + 2, sill + 3, 1, slab);
    const leaf = type === 'iron' ? iron : wood;
    brush.box(l + 1, sill, .56, l + 2, sill + 1.1, .71, leaf);
    brush.box(l + 1, sill + 1.1, .56, l + 1.17, sill + 2, .71, leaf);
    brush.box(l + 1.83, sill + 1.1, .56, l + 2, sill + 2, .71, leaf);
    brush.box(l + 1.17, sill + 1.77, .56, l + 1.83, sill + 2, .71, leaf);
    brush.box(l + 1.47, sill + 1.1, .58, l + 1.54, sill + 1.77, .69, leaf);
    brush.box(l + 1.72, sill + .82, .51, l + 1.87, sill + .92, .76, brass);
    if (type === 'iron') brush.box(l + 2.38, sill + 1.32, .96, l + 2.65, sill + 1.5, 1.08, metal);
  }

  function solidWall(brush, left, right, bottom, top) {
    if (right <= left || top <= bottom) return;
    brush.box(left, bottom, 0, right, top, 1, stone);
    // Thin interior joints retain the block scale without meshing every brick.
    for (let y = Math.ceil(bottom); y < top; y++) {
      if (y > bottom) brush.line(left, y, 1, right, y, 1, mortar);
      const start = Math.floor((left - y % 2) / 2) * 2 + y % 2;
      for (let x = start + 2; x < right; x += 2) {
        brush.line(x, y, 1, x, Math.min(y + 1, top), 1, mortar);
      }
    }
  }

  function shell(brush, room, cutaway, worldSide) {
    const { localW: w, localH: h, localD: d } = room;
    brush.box(0, 0, 0, w, 1, d, floor);
    // A few contrasting slabs make stone courses visible in the orbit overview.
    for (let z = 1; z < d - 1; z += 2) {
      for (let x = 1; x < w - 1; x += 2) {
        const grain = (x * 19 + z * 7 + room.id * 13) % 17;
        if (grain > 4) continue;
        const x1 = Math.min(w - 1, x + 1.92);
        const z1 = Math.min(d - 1, z + .92);
        if (x1 > x && z1 > z) brush.face([[x, 1, z], [x1, 1, z],
          [x1, 1, z1], [x, 1, z1]], grain < 2 ? moss : stone, 'up');
      }
    }
    for (let x = 2; x < w - 1; x += 2) brush.line(x, 1, 1, x, 1, d - 1);
    for (let z = 2; z < d - 1; z += 2) brush.line(1, 1, z, w - 1, 1, z);
    if (!cutaway) brush.box(0, h - 1, 0, w, h, d, mortar);
    for (const side of sides) {
      const wall = wallBrush(brush, room, side);
      const cut = cutaway?.has(worldSide(room.facing, side));
      const top = cut ? 1.38 : h;
      const acrossX = side === 'n' || side === 's';
      const doors = room.connectors.filter((p) => p.hasOpening && p.side === side).map((p) => ({
        u: acrossX ? p.x : p.z, y: p.y, width: 3, height: 3, doorType: p.id === 'entry' ? room.doorType : 'open',
      }));
      if (room.templateId === 'filler' && side === 's' && !doors.length) {
        doors.push({ u: w / 2, y: 1, width: 3, height: 3, doorType: 'open' });
      }
      if (room.templateId === 'portal' && room.interior !== 'empty' && side !== 'n') {
        const start = acrossX ? 2 : 3;
        for (let u = start; u < wall.length - 2; u += 2) doors.push({ u: u + .5, y: 3, width: 1, height: 2, window: true });
      }
      doors.sort((a, b) => a.u - b.u);
      let previous = 0;
      for (const opening of doors) {
        const { u, y, width, height } = opening;
        const low = u - width / 2;
        const high = u + width / 2;
        solidWall(wall, previous, low, 1, top);
        solidWall(wall, low, high, 1, Math.min(y, top));
        solidWall(wall, low, high, y + height, top);
        if (opening.window) {
          if (!cut) bars(wall, low, y, high, y + height, .45);
        } else {
          // The thin sill preserves a high doorway's elevation in a cutaway.
          wall.box(low, y - .12, .02, high, y, .98, slab);
          door(wall, u, y, opening.doorType);
        }
        previous = high;
      }
      solidWall(wall, previous, wall.length, 1, top);
    }
  }

  function chest(box, x, y, z) {
    box(x + .07, y, z + .07, x + .93, y + .57, z + .93, wood);
    box(x + .06, y + .57, z + .06, x + .94, y + .83, z + .94, plank);
    box(x + .43, y + .39, z + .04, x + .57, y + .65, z + .09, brass);
  }

  function torch(box, x, y, z) {
    box(x - .07, y, z - .07, x + .07, y + .44, z + .07, wood);
    box(x - .11, y + .42, z - .11, x + .11, y + .64, z + .11, fire);
  }

  function spiral({ box }) {
    // One and a half turns through the 3 × 3 well; the same piece is used at the start.
    const path = [[2, 1], [1, 1], [1, 2], [1, 3], [2, 3], [3, 3], [3, 2], [3, 1], [2, 1], [1, 1], [1, 2], [1, 3]];
    path.forEach(([x, z], index) => {
      const top = 7 - index / 2;
      const bottom = Math.max(1, Math.floor(top) - 1);
      box(x, bottom, z, x + 1, top, z + 1, index % 2 ? slab : stone);
    });
  }

  function straightStairs({ box }) {
    for (let z = 1; z <= 6; z++) {
      const top = 8 - z;
      box(1, Math.max(1, top - 2), z, 4, top - .5, z + 1, stone);
      box(1, top - .5, z, 4, top, z + .5, slab);
    }
  }

  // The two entry choices use the same physical staircase: north is its high end.
  function tallStraightStairs({ box }, room) {
    const high = room.connectors.find((p) => p.side === 'n').y;
    const low = room.connectors.find((p) => p.side === 's').y;
    const steps = (high - low) * 2;
    const tread = (room.localD - 4) / steps;
    box(1, low, 1, room.localW - 1, high, 2, stone);
    for (let i = 1; i < steps; i++) {
      const z = 2 + (i - 1) * tread;
      box(1, low, z, room.localW - 1, high - i / 2, z + tread, i % 2 ? slab : stone);
    }
    // The floor forms the final tread and the landing at the low door.
  }

  function tallSpiralStairs({ box }, room) {
    const high = room.connectors.find((p) => p.side === 'n').y;
    const low = room.connectors.find((p) => p.side === 's').y;
    let y = high;
    const rise = (high - low) / 48;
    const landing = (x, z, width = 2) =>
      box(x - width / 2, y - .5, z - 1, x + width / 2, y, z + 1, stone);

    // Each run spans the gap between two level landings around the central well.
    function flight(x0, z0, x1, z1, steps) {
      const dx = (x1 - x0) / steps;
      const dz = (z1 - z0) / steps;
      for (let i = 0; i < steps; i++) {
        y -= rise;
        if (y <= low) continue; // The low landing is part of the shell floor.
        const x = x0 + i * dx, z = z0 + i * dz;
        const nextX = x0 + (i + 1) * dx, nextZ = z0 + (i + 1) * dz;
        const acrossX = dx === 0 ? 1 : 0, acrossZ = dz === 0 ? 1 : 0;
        box(Math.min(x, nextX) - acrossX, Math.max(low, y - .5), Math.min(z, nextZ) - acrossZ,
          Math.max(x, nextX) + acrossX, y, Math.max(z, nextZ) + acrossZ, i % 2 ? slab : stone);
      }
    }

    landing(5.5, 2, 3);
    flight(7, 2, 8, 2, 2);
    landing(9, 2);
    flight(9, 3, 9, 8, 9);
    landing(9, 9);
    flight(8, 9, 3, 9, 9);
    landing(2, 9);
    flight(2, 8, 2, 3, 8);
    landing(2, 2);
    flight(3, 2, 8, 2, 9);
    landing(9, 2);
    flight(9, 3, 9, 8, 9);
    landing(9, 9);
    flight(8, 9, 7, 9, 2);
  }

  function fiveCrossing({ box }) {
    // The high bridge runs over the three-block-wide descending stair.
    box(1, 2, 1, 9, 3, 7, stone);
    for (const x of [4, 8]) {
      box(x, 1, 5, x + 1, 5, 10, moss);
      box(x, 5, 7, x + 1, 5.5, 10, slab);
    }
    box(1, 4, 7, 4, 5, 10, stone);
    box(1, 3, 5, 4, 4, 7, stone);
    box(1, 3, 4, 4, 3.5, 5, slab);
    box(1, 4, 6, 4, 4.5, 7, slab);
    box(5, 1, 7, 8, 2, 9, stone);
    box(5, 1, 9, 8, 1.5, 10, slab);
    box(5, 2, 7, 8, 2.5, 8, slab);
    box(5, 5, 7, 8, 6, 10, slab);
    torch(box, 6.5, 5.1, 6.85);
  }

  function ladder(box, x, z, low, high, alongX = true) {
    const piece = (u0, y0, u1, y1) => alongX
      ? box(x + u0, y0, z, x + u1, y1, z + .12, plank)
      : box(x, y0, z + u0, x + .12, y1, z + u1, plank);
    for (const u of [.08, .81]) piece(u, low, u + .1, high);
    for (let y = low + .18; y < high - .1; y += .46) piece(.08, y, .91, y + .09);
  }

  function crossing({ box }, room) {
    if (room.variant === 0) {
      box(4, 1, 4, 7, 1.5, 7, slab);
      box(5, 1, 5, 6, 4, 6, stone);
      for (const [x, z] of [[4.85, 5.5], [6.15, 5.5], [5.5, 4.85], [5.5, 6.15]]) torch(box, x, 3, z);
    } else if (room.variant === 1) {
      for (const x of [3, 7]) box(x, 1, 3, x + 1, 2, 8, stone);
      for (const z of [3, 7]) box(4, 1, z, 7, 2, z + 1, stone);
      box(4, 1, 4, 7, 1.8, 7, colors.water);
      box(4.95, 1.8, 4.95, 6.05, 4.35, 6.05, colors.water);
    } else if (room.variant === 2) {
      for (const x of [1, 9]) box(x, 3, 1, x + 1, 4, 10, stone);
      for (const z of [1, 9]) box(2, 3, z, 9, 4, z + 1, stone);
      for (const x of [2, 7]) box(x, 3, 2, x + 2, 4, 9, plank);
      for (const z of [2, 7]) box(4, 3, z, 7, 4, z + 2, plank);
      for (const x of [4, 6]) {
        for (const z of [4, 6]) box(x, 1, z, x + 1, 4, z + 1, stone);
      }
      ladder(box, 9.84, 3, 1, 4.2, false);
      chest(box, 3, 4, 8);
    }
  }

  function prison(brush) {
    const { box } = brush;
    for (const z of [1, 3, 7, 9]) box(4, 1, z, 5, 4, z + 1, stone);
    const alongZ = { box: (z0, y0, x0, z1, y1, x1, c) => box(4 + x0, y0, z0, 4 + x1, y1, z1, c) };
    const alongX = { box: (x0, y0, z0, x1, y1, z1, c) => box(x0, y0, 5 + z0, x1, y1, 5 + z1, c) };
    bars(alongZ, 4, 1, 7, 4, .45);
    bars(alongX, 4.5, 1, 8, 4, .45);
    for (const z of [2, 8]) {
      alongZ.box(z, 1, .45, z + 1, 2.25, .6, iron);
      for (const edge of [z, z + .82]) alongZ.box(edge, 2.25, .45, edge + .18, 3, .6, iron);
      alongZ.box(z, 2.79, .45, z + 1, 3, .6, iron);
      bars(alongZ, z, 3, z + 1, 4, .45);
    }
  }

  function chestCorridor({ box }) {
    box(3, 1, 2, 4, 2, 5, stone);
    box(2, 1, 2, 3, 1.5, 5, slab);
    for (const z of [1, 5]) box(3, 1, z, 4, 1.5, z + 1, slab);
    for (const z of [2, 4]) box(3, 2, z, 4, 2.5, z + 1, slab);
    chest(box, 3, 2, 3);
  }

  function shelving(brush, x, y, z, width, height, depth) {
    const { box, face } = brush;
    const fronts = [colors.teal, colors.folio, colors.ochre, colors.spine];
    box(x, y, z, x + width, y + height, z + depth, wood);
    const alongX = width > depth;
    const run = alongX ? width : depth;
    for (let tier = 0; tier < height; tier++) {
      const low = y + tier + .12;
      for (let i = 0; i < run * 2; i++) {
        const u = i / 2 + .025;
        const high = low + .62 + (i % 3) * .075;
        const color = fronts[(tier + i + z) % fronts.length];
        if (alongX) {
          for (const [plane, side] of [[z, 'n'], [z + depth, 's']]) {
            face([[x + u, low, plane], [x + u + .43, low, plane], [x + u + .43, high, plane], [x + u, high, plane]], color, side);
          }
        } else {
          for (const [plane, side] of [[x, 'w'], [x + width, 'e']]) {
            face([[plane, low, z + u], [plane, low, z + u + .43], [plane, high, z + u + .43], [plane, high, z + u]], color, side);
          }
        }
      }
    }
  }

  function library(brush, room) {
    const { box } = brush;
    const tall = room.localH > 6;
    for (const x of [1, 12]) {
      for (const y of tall ? [1, 6] : [1]) {
        for (const z of [1, 5, 9, 13]) {
          const upperChest = x === 12 && y === 6 && z === 1;
          box(x, y, z, x + 1, upperChest ? 8 : y + 4, z + 1, plank);
        }
        for (const z of [2, 6, 10]) shelving(brush, x, y, z, 1, 4, 3);
      }
    }
    for (let z = 3; z <= 11; z += 2) {
      for (const x of [3, 6, 9]) {
        // One shelf is replaced by the lower library chest.
        if (x === 3 && z === 5) {
          shelving(brush, x, 1, z, 2, 2, 1);
          box(x + 1, 3, z, x + 2, 4, z + 1, wood);
        } else shelving(brush, x, 1, z, 2, 3, 1);
      }
    }
    chest(box, 3, 3, 5);
    if (!tall) return;
    box(1, 5, 1, 4, 6, 14, plank);
    box(10, 5, 1, 13, 6, 13, plank);
    box(11, 5, 13, 13, 6, 14, plank);
    box(4, 5, 1, 10, 6, 3, plank);
    box(4, 5, 12, 10, 6, 14, plank);
    box(8, 5, 11, 10, 6, 12, plank);
    box(9, 5, 10, 10, 6, 11, plank);
    for (const y of [6.35, 6.79]) {
      box(3.42, y, 2.45, 3.57, y + .12, 12.55, wood);
      box(10.42, y, 2.45, 10.57, y + .12, 10.55, wood);
      box(3.5, y, 2.43, 10.5, y + .12, 2.58, wood);
      box(3.5, y, 12.43, 8.5, y + .12, 12.58, wood);
      for (let step = 0; step < 2; step++) {
        box(8.5 + step, y, 11.45 - step, 8.64 + step, y + .12, 12.55 - step, wood);
        box(8.5 + step, y, 11.45 - step, 9.5 + step, y + .12, 11.58 - step, wood);
      }
    }
    for (const [x, z] of [[3.5, 2.5], [3.5, 7.5], [3.5, 12.5], [7, 2.5], [10.5, 2.5], [10.5, 7.5], [10.5, 10.5], [8.5, 12.5]]) {
      box(x - .1, 6, z - .1, x + .1, 7, z + .1, plank);
    }
    ladder(box, 10, 13.81, 1, 8);
    box(6.76, 7.45, 7.28, 7.24, 10, 7.72, wood);
    box(5.35, 7.48, 7.33, 8.65, 7.76, 7.67, plank);
    box(6.3, 7.48, 6.4, 7.7, 7.76, 8.6, plank);
    for (const [x, z] of [[5.5, 7.5], [8.5, 7.5], [6.5, 6.5], [7.5, 8.5]]) torch(box, x, 7.76, z);
    chest(box, 12, 8, 1);
  }

  function portal({ box }) {
    for (const x of [2, 8]) box(x, 1, 1, x + 1, 2, 5, stone);
    for (const x of [1, 9]) {
      box(x, 1, 4, x + 1, 2, 5, stone);
      box(x, 1, 1, x + 1, 1.88, 4, colors.lava);
    }
    for (const x of [3, 7]) box(x, 1, 8, x + 1, 2, 13, stone);
    for (const z of [8, 12]) box(4, 1, z, 7, 2, z + 1, stone);
    box(4, 1, 9, 7, 1.88, 12, colors.lava);
    for (let z = 4; z <= 7; z++) {
      const top = Math.min(4, z - 2);
      box(4, 1, z, 7, z === 6 ? 3 : top - .5, z + 1, stone);
      const front = z + (z === 7 ? 0 : .5);
      if (z === 6) {
        // The spawner replaces the central stair block.
        box(4, 3, z, 5, 3.5, z + 1, stone);
        box(6, 3, z, 7, 3.5, z + 1, stone);
        box(4, top - .5, front, 5, top, z + 1, slab);
        box(6, top - .5, front, 7, top, z + 1, slab);
      } else box(4, top - .5, front, 7, top, z + 1, slab);
    }
    const frame = (x, z) => {
      box(x, 3, z, x + 1, 3.62, z + 1, colors.ivory);
      box(x + .045, 3.62, z + .045, x + .955, 3.81, z + .955, colors.frame);
      box(x + .29, 3.81, z + .29, x + .71, 3.84, z + .71, colors.socket);
    };
    for (let i = 0; i < 3; i++) {
      frame(4 + i, 8);
      frame(4 + i, 12);
      frame(3, 9 + i);
      frame(7, 9 + i);
    }
    // Silverfish spawner, open on all sides.
    for (const y of [3, 3.87]) box(5.04, y, 6.04, 5.96, y + .09, 6.96, metal);
    for (const x of [5.07, 5.48, 5.87]) {
      for (const z of [6.07, 6.87]) box(x, 3, z, x + .06, 4, z + .06, iron);
    }
    box(5.31, 3.31, 6.33, 5.72, 3.57, 6.65, colors.ember);
  }

  const interiors = { start: spiral, spiralStairs: spiral, straightStairs, fiveCrossing,
    crossing, prison, chest: chestCorridor, library, portal };
  const tallStairs = { straight: tallStraightStairs, spiral: tallSpiralStairs };
  function addRoom(mesh, room, cutaway, geometry = globalThis.StrongholdTemplates) {
    const brush = localBrush(mesh, room, geometry);
    shell(brush, room, cutaway, geometry.worldSide);
    const interior = tallStairs[room.stairKind] ?? interiors[room.templateId];
    if (room.interior !== 'empty') interior?.(brush, room);
  }
  globalThis.DungeonStrongholdMesh = { addRoom };
})();
