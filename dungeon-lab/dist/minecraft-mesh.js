(() => {
  'use strict';

  const { roles, portalRoute, port } = globalThis.DungeonGenerators;
  const rgb = (hex) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const rgba = (color, brightness = 1) => [...color.map((value) => Math.min(1, value * brightness)), 1];
  const sides = ['n', 'e', 's', 'w'];
  const materials = {
    minecraft: {
      stone: '#78837d', floor: '#838e85', mortar: '#46524f', foundation: '#465257',
      aged: '#718d7d', trim: '#a66f50', patina: '#5c9e90', metal: '#53636a', light: '#e9bf82',
    },
  };
  for (const material of Object.values(materials)) {
    for (const key of Object.keys(material)) material[key] = rgb(material[key]);
  }
  const gold = rgb(portalRoute.color);
  const wood = rgb('#78583e');
  const board = rgb('#a57b55');

  function variation(x, y, z) {
    const hash = Math.imul(Math.round(x * 16), 73856093) ^ Math.imul(Math.round(y * 16), 19349663) ^ Math.imul(Math.round(z * 16), 83492791);
    return (hash >>> 0) % 31 / 30;
  }

  function surface(mesh, left, right, y, back, front, color) {
    mesh.face([[left, y, back], [right, y, back], [right, y, front], [left, y, front]], color);
  }

  function layFloor(mesh, room, material) {
    const { x, y, z, w, d } = room;
    const left = x - w / 2;
    const back = z - d / 2;
    const columns = Math.ceil(w / 1.04);
    const rows = Math.ceil(d / 1.04);
    const tileW = w / columns;
    const tileD = d / rows;
    mesh.box(left, y - .34, back, left + w, y, back + d, rgba(material.foundation));
    for (let column = 0; column < columns; column += 1) {
      for (let row = 0; row < rows; row += 1) {
        const px = left + column * tileW;
        const pz = back + row * tileD;
        const grain = variation(px, y, pz);
        const stone = grain < .15 ? material.aged : material.floor;
        surface(mesh, px + .022, px + tileW - .022, y + .007, pz + .022, pz + tileD - .022, rgba(stone, .88 + grain * .18));
      }
    }
  }

  function wallAt(room, side) {
    const alongX = side === 'n' || side === 's';
    const outward = side === 'n' || side === 'w' ? -1 : 1;
    const center = alongX ? room.x : room.z;
    const span = alongX ? room.w : room.d;
    const edge = (alongX ? room.z : room.x) + outward * (alongX ? room.d : room.w) / 2;
    const point = (u, y, inset) => {
      const across = edge - outward * inset;
      return alongX ? [u, y, across] : [across, y, u];
    };
    const box = (mesh, lo, hi, y0, y1, depth, material) => {
      const [ax, , az] = point(lo, y0, 0);
      const [bx, , bz] = point(hi, y1, depth);
      mesh.box(Math.min(ax, bx), y0, Math.min(az, bz), Math.max(ax, bx), y1, Math.max(az, bz), material);
    };
    return { center, span, point, box, light: alongX ? .94 : .82 };
  }

  const thickness = .34;
  const halfDoor = 1.07;
  const openingTop = 2.04;

  function stackBricks(mesh, wall, lo, hi, bottom, top, material) {
    if (hi - lo < .08 || top - bottom < .08) return;
    wall.box(mesh, lo, hi, bottom, top, thickness, rgba(material.mortar));
    const courses = Math.max(1, Math.round((top - bottom) / .55));
    const cellHeight = (top - bottom) / courses;
    const cellWidth = 1.03;
    const { point } = wall;
    for (let row = 0; row < courses; row += 1) {
      const y = bottom + row * cellHeight;
      const base = lo - (row % 2) * cellWidth / 2;
      for (let cursor = base; cursor < hi - .04; cursor += cellWidth) {
        const left = Math.max(cursor, lo) + .017;
        const right = Math.min(cursor + cellWidth, hi) - .017;
        if (right <= left) continue;
        const high = y + cellHeight - .017;
        const offset = point(left, y, 0);
        const grain = variation(...offset);
        const color = grain < .12 ? material.aged : material.stone;
        for (const face of [-.009, thickness + .009]) {
          mesh.face([point(left, y + .017, face), point(right, y + .017, face), point(right, high, face), point(left, high, face)],
            rgba(color, wall.light * (.86 + grain * .22)));
        }
        if (row === courses - 1) {
          mesh.face([point(left, top + .008, 0), point(right, top + .008, 0),
            point(right, top + .008, thickness), point(left, top + .008, thickness)], rgba(color, 1.08));
        }
      }
    }
  }

  function doorway(mesh, wall, floor, material) {
    const { center, box } = wall;
    const left = center - halfDoor;
    const right = center + halfDoor;
    for (const [lo, hi] of [[left - .15, left + .08], [right - .08, right + .15]]) {
      for (let course = 0; course < 4; course += 1) {
        const low = floor + course * .51;
        box(mesh, lo, hi, low + .013, low + .494, .4, rgba(course === 2 ? material.trim : material.stone));
      }
    }
    box(mesh, left - .17, right + .17, floor + openingTop, floor + 2.28, .4, rgba(material.trim));
    box(mesh, left - .17, right + .17, floor + 2.28, floor + 2.37, .38, rgba(material.stone));
    box(mesh, left, right, floor, floor + .045, .39, rgba(material.patina));
  }

  function buildWalls(mesh, room, doors, material, cutaway) {
    for (const side of sides) {
      const wall = wallAt(room, side);
      const left = wall.center - wall.span / 2;
      const right = wall.center + wall.span / 2;
      const top = room.y + (cutaway?.has(side) ? 1.04 : room.h);
      if (!doors.has(side)) {
        stackBricks(mesh, wall, left, right, room.y, top, material);
        continue;
      }
      stackBricks(mesh, wall, left, wall.center - halfDoor, room.y, top, material);
      stackBricks(mesh, wall, wall.center + halfDoor, right, room.y, top, material);
      stackBricks(mesh, wall, wall.center - halfDoor, wall.center + halfDoor, room.y + 2.37, top, material);
      doorway(mesh, wall, room.y, material);
    }
    if (cutaway === null) {
      const { x, y, z, w, d, h } = room;
      mesh.box(x - w / 2, y + h - .16, z - d / 2, x + w / 2, y + h, z + d / 2, rgba(material.mortar));
    }
  }

  function roomFixture(mesh, room) {
    const { x, y, z, w, d } = room;
    const facing = room.facing ?? ['e', 's', 'w', 'n'][room.variant ?? 0];
    const alongX = facing === 'e' || facing === 'w';
    const direction = facing === 'n' || facing === 'w' ? -1 : 1;
    const box = (across, forward, width, length, low, high, color) => {
      const px = x + (alongX ? forward * direction : across);
      const pz = z + (alongX ? across : forward * direction);
      const xx = (alongX ? length : width) / 2;
      const zz = (alongX ? width : length) / 2;
      mesh.box(px - xx, y + low, pz - zz, px + xx, y + high, pz + zz, rgba(color));
    };
    return { box, wide: alongX ? d : w, long: alongX ? w : d };
  }

  function crate(box, across, forward, material) {
    box(across, forward, .79, .74, 0, .52, wood);
    box(across, forward, .81, .76, .52, .66, board);
    for (const band of [-.27, .27]) box(across + band, forward, .07, .77, .514, .675, material.metal);
  }

  function trialDecorations(room, fixture, material) {
    const { box, wide, long } = fixture;
    const hall = ['入口中庭', '三向大厅', '铜柱试炼厅'].includes(room.template);
    const levels = hall ? [-1, 1] : [1];
    for (const across of [-1, 1]) {
      for (const forward of levels) {
        const x = across * (wide / 2 - .84);
        const z = forward * (long / 2 - .82);
        const height = hall ? room.h - .53 : 1.84;
        box(x, z, .67, .64, 0, .24, material.stone);
        box(x, z, .43, .43, .24, height, material.patina);
        for (const band of [.37, height - .27]) box(x, z, .51, .51, band, band + .102, material.trim);
        box(x, z, .53, .53, height, height + .17, material.stone);
        if (hall) box(x, z, .29, .29, height + .17, height + .25, material.light);
      }
    }
    if (room.template === '铜柱试炼厅' || room.template === '三向大厅') {
      for (const side of [-1, 1]) {
        box(side * (wide / 2 - .77), 0, .45, 2.1, 0, .47, material.stone);
        box(side * (wide / 2 - .77), 0, .44, 2.07, .47, .57, material.trim);
      }
    } else if (room.template === '阶梯密室') {
      for (let step = 0; step < 3; step += 1) {
        box(-wide * .32, -.76 + step * .46, .8, .47, 0, (step + 1) * .21, material.stone);
      }
    } else if (room.template === '窄储藏间') crate(box, -wide * .24, long * .16, material);
  }


  function floorInlay(mesh, room, doors, material) {
    const color = rgba(room.role === 'normal' ? material.patina : rgb(roles[room.role].color), .81);
    for (const side of doors) {
      const [x, y, z] = port(room, side);
      const alongX = x !== room.x;
      const padX = alongX ? .02 : .29;
      const padZ = alongX ? .29 : .02;
      surface(mesh, Math.min(room.x, x) - padX, Math.max(room.x, x) + padX, y + .022,
        Math.min(room.z, z) - padZ, Math.max(room.z, z) + padZ, color);
    }
    if (room.role === 'start' || room.role === 'reward') {
      const { x, y, z } = room;
      mesh.stroke([[x - .69, y + .035, z], [x, y + .035, z - .69], [x + .69, y + .035, z], [x, y + .035, z + .69]], color);
    }
  }

  function addRoom(mesh, room, doors, id, cutaway) {
    if (id === 'stronghold') {
      globalThis.DungeonStrongholdMesh.addRoom(mesh, room, cutaway);
      return;
    }
    const material = materials[id];
    layFloor(mesh, room, material);
    buildWalls(mesh, room, doors, material, cutaway);
    floorInlay(mesh, room, doors, material);
    const fixture = roomFixture(mesh, room);
    trialDecorations(room, fixture, material);
  }

  function addPassage(mesh, [start, end], id, cutaway, highlighted) {
    // Stronghold pieces meet at their boundary; both sides already include the threshold.
    if (id === 'stronghold') return;
    const material = materials[id];
    const alongX = start[0] !== end[0];
    const axis = alongX ? 0 : 2;
    const across = start[alongX ? 2 : 0];
    const edgeSides = alongX ? ['n', 's'] : ['w', 'e'];
    const rise = end[1] - start[1];
    const length = Math.abs(start[axis] - end[axis]);
    const sections = rise ? Math.ceil(Math.abs(rise) / .42) : Math.max(1, Math.ceil(length / 1.03));
    const box = (lo, hi, left, right, bottom, top, color) => {
      if (alongX) mesh.box(lo, bottom, across + left, hi, top, across + right, color);
      else mesh.box(across + left, bottom, lo, across + right, top, hi, color);
    };
    for (let index = 0; index < sections; index += 1) {
      const a = index / sections;
      const b = (index + 1) / sections;
      const from = start[axis] + (end[axis] - start[axis]) * a;
      const to = start[axis] + (end[axis] - start[axis]) * b;
      const lo = Math.min(from, to);
      const hi = Math.max(from, to);
      const low = Math.min(start[1] + rise * a, start[1] + rise * b);
      const high = Math.max(start[1] + rise * a, start[1] + rise * b);
      box(lo, hi, -1.14, 1.14, low - Math.max(.27, high - low + .055), low, rgba(material.foundation));
      box(lo + .021, hi - .021, -.91, .91, low - .055, low + .009, rgba(material.floor, index % 2 ? .91 : 1.01));
      if (highlighted) box(lo + .022, hi - .022, -.12, .12, low + .008, low + .025, rgba(gold, .76));
      for (const [slot, side] of edgeSides.entries()) {
        const left = slot === 0 ? -1.14 : .91;
        const top = cutaway === null ? high + 2.19 : low + (cutaway.has(side) ? .32 : .78);
        const cap = highlighted && cutaway !== null ? rgba(gold, .73) : rgba(rise ? material.trim : material.stone);
        box(lo, hi, left, left + .23, low, top - .09, rgba(material.mortar));
        box(lo + .012, hi - .012, left, left + .23, top - .09, top, cap);
      }
      if (cutaway === null) box(lo, hi, -1.14, 1.14, high + 2.15, high + 2.28, rgba(material.foundation));
    }
  }

  globalThis.DungeonMinecraftMesh = { addRoom, addPassage };
})();
