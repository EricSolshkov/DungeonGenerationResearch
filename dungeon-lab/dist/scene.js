(() => {
  'use strict';

  const { roles, portalRoute, label, port, connectionPath } = globalThis.DungeonGenerators;
  const { addRoom: minecraftRoom, addPassage: minecraftPassage } = globalThis.DungeonMinecraftMesh;
  const legacyGeometry = globalThis.StrongholdTemplates;
  const geometryOf = (layout) => layout.config ? globalThis.GrowthCatalog.get('pool', layout.config.pool) : legacyGeometry;
  const viewKindOf = (layout) => layout?.viewKind ?? layout?.id;
  const roleStyle = (role) => roles[role] ?? roles.normal;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const add = (a, b) => a.map((number, index) => number + b[index]);
  const subtract = (a, b) => a.map((number, index) => number - b[index]);
  const scale = (a, amount) => a.map((number) => number * amount);
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = (a) => scale(a, 1 / (Math.hypot(...a) || 1));
  const mix = (a, b, ratio) => a.map((number, index) => number * (1 - ratio) + b[index] * ratio);
  const rgb = (hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const tint = (color, alpha = 1) => [...color, alpha];
  const cssColor = ([r, g, b, a]) => `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
  const near = 0.08;
  const insideRoomPickPenalty = 3200;
  const lineDepthOffset = .005;
  const focal = 1 / Math.tan(Math.PI / 9.6);
  const heading = (yaw, pitch) => [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];

  function limits(rooms) {
    const lower = [Infinity, Infinity, Infinity];
    const upper = [-Infinity, -Infinity, -Infinity];
    for (const room of rooms) {
      const min = [room.x - room.w / 2, room.y, room.z - room.d / 2];
      const max = [room.x + room.w / 2, room.y + room.h, room.z + room.d / 2];
      for (let axis = 0; axis < 3; axis += 1) {
        lower[axis] = Math.min(lower[axis], min[axis]);
        upper[axis] = Math.max(upper[axis], max[axis]);
      }
    }
    return { lower, upper, center: scale(add(lower, upper), 0.5) };
  }

  function clipRange(bounds, eye, forward) {
    let closest = 0;
    let furthest = 0;
    for (let axis = 0; axis < 3; axis++) {
      const a = (bounds.lower[axis] - eye[axis]) * forward[axis];
      const b = (bounds.upper[axis] - eye[axis]) * forward[axis];
      closest += Math.min(a, b);
      furthest += Math.max(a, b);
    }
    // Leave room for floors, outlines and door markers outside the room boxes.
    const front = Math.max(near, closest - 2);
    return { near: front, far: Math.max(front + 1, furthest + 2) };
  }

  function cornersOf(rooms) {
    const corners = [];
    for (const { x, y, z, w, h, d } of rooms) {
      for (const horizontal of [-.5, .5]) {
        for (const depth of [-.5, .5]) {
          corners.push([x + w * horizontal, y - .34, z + d * depth], [x + w * horizontal, y + h, z + d * depth]);
        }
      }
    }
    return corners;
  }

  function minecraftYaw(rooms) {
    const center = scale(rooms.reduce((sum, room) => add(sum, [room.x, 0, room.z]), [0, 0, 0]), 1 / rooms.length);
    let xx = 0;
    let xz = 0;
    let zz = 0;
    for (const room of rooms) {
      const x = room.x - center[0];
      const z = room.z - center[2];
      xx += x * x;
      xz += x * z;
      zz += z * z;
    }
    const yaw = -.5 * Math.atan2(2 * xz, xx - zz) - .1;
    const landmark = rooms.find((room) => room.role === 'portal' || room.role === 'reward') || rooms[0];
    const bearing = subtract([landmark.x, 0, landmark.z], center);
    return dot(heading(yaw, 0), bearing) >= 0 ? yaw : yaw + Math.PI;
  }

  function centerInView(basisCenter, corners, { yaw, pitch }) {
    const forward = scale(heading(yaw, pitch), -1);
    const right = unit(cross(forward, [0, 1, 0]));
    const up = cross(right, forward);
    const midpoint = (axis) => {
      const values = corners.map((corner) => dot(subtract(corner, basisCenter), axis));
      return (Math.min(...values) + Math.max(...values)) / 2;
    };
    return add(basisCenter, add(scale(right, midpoint(right)), scale(up, midpoint(up))));
  }

  class Mesh {
    constructor() {
      this.faces = [];
      this.lines = [];
    }

    line(a, b, color) { this.lines.push({ points: [a, b], color }); }
    face(points, color, sign) { this.faces.push({ points, color, sign }); }

    stroke(points, color) {
      points.forEach((point, index) => this.line(point, points[(index + 1) % points.length], color));
    }

    box(x0, y0, z0, x1, y1, z1, color, edge) {
      if (x1 - x0 < 0.006 || y1 - y0 < 0.006 || z1 - z0 < 0.006) return;
      const corners = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
        [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
      const sides = [[0, 3, 2, 1, .69], [4, 5, 6, 7, .94], [0, 4, 7, 3, .87],
        [1, 2, 6, 5, .73], [3, 7, 6, 2, 1.1], [0, 1, 5, 4, .58]];
      for (const [a, b, c, d, light] of sides) {
        this.face([corners[a], corners[b], corners[c], corners[d]], color.map((value, index) => index < 3 ? Math.min(1, value * light) : value));
      }
      if (edge) {
        this.stroke(corners.slice(0, 4), edge);
        this.stroke(corners.slice(4), edge);
        for (let index = 0; index < 4; index += 1) this.line(corners[index], corners[index + 4], edge);
      }
    }
  }

  const baseBlue = rgb('#142239');
  const neutral = rgb('#7893c9');

  function colors(role) {
    const accent = rgb(roleStyle(role).color);
    return {
      accent,
      floor: tint(mix(baseBlue, accent, 0.42)),
      wall: tint(mix(baseBlue, accent, 0.31)),
      trim: tint(mix(baseBlue, accent, 0.58)),
      edge: tint(mix(baseBlue, accent, 0.78), .76),
      grid: tint(mix(baseBlue, accent, 0.71), .45),
      panel: tint(mix(baseBlue, accent, 0.21)),
    };
  }

  function floorRectangle(x, y, z, w, d) {
    return [[x - w / 2, y, z - d / 2], [x + w / 2, y, z - d / 2], [x + w / 2, y, z + d / 2], [x - w / 2, y, z + d / 2]];
  }

  function floorTiles(mesh, room, tone) {
    const { x, y, z, w, d } = room;
    const gap = .29;
    const left = x - w / 2 + gap;
    const right = x + w / 2 - gap;
    const back = z - d / 2 + gap;
    const front = z + d / 2 - gap;
    for (let column = 1; column < 7; column += 1) {
      const rowX = left + (right - left) * column / 7;
      mesh.line([rowX, y + .013, back], [rowX, y + .013, front], tone.grid);
    }
    for (let row = 1; row < 5; row += 1) {
      const rowZ = back + (front - back) * row / 5;
      mesh.line([left, y + .013, rowZ], [right, y + .013, rowZ], tone.grid);
    }
  }

  function aroundOpening(start, end, center, half, addSpan) {
    if (half > 0) {
      addSpan(start, center - half);
      addSpan(center + half, end);
    } else addSpan(start, end);
  }

  function symbol(mesh, center, size, role, side) {
    const [x, y, z] = center;
    const position = (a, b) => side ? [x + a, y + b, z] : [x + a, y, z + b];
    const color = tint(rgb(roleStyle(role).color), .95);
    mesh.stroke([position(0, -size), position(size, 0), position(0, size), position(-size, 0)], color);
    if (role !== 'normal') {
      mesh.stroke([position(0, -size * .46), position(size * .46, 0), position(0, size * .46), position(-size * .46, 0)], color);
    }
  }

  function sideRoom(mesh, room, doors, tone) {
    const { x, y, z, w, h, d } = room;
    const left = x - w / 2;
    const right = x + w / 2;
    const back = z - d / 2;
    const front = z + d / 2;
    const roof = y + h;
    const wall = .24;
    mesh.box(left, y, back, right, roof, back + wall, tone.wall, tone.edge);
    aroundOpening(left, right, x, doors.has('down') ? .9 : 0, (from, to) => {
      mesh.box(from, y - .34, back, to, y, front, tone.floor, tone.edge);
      mesh.box(from + .11, y - .32, front, to - .11, y - .24, front + .08, tone.trim);
    });
    aroundOpening(left, right, x, doors.has('up') ? .9 : 0, (from, to) => {
      mesh.box(from, roof - wall, back, to, roof, front - .14, tone.floor, tone.edge);
    });
    for (const [side, edgeX] of [['w', left], ['e', right - wall]]) {
      const hasDoor = doors.has(side);
      const cutoff = hasDoor ? y + 2.2 : y;
      mesh.box(edgeX, cutoff, back, edgeX + wall, roof - wall, front, tone.wall, tone.edge);
      if (hasDoor) mesh.line([edgeX + wall * .5, cutoff, back + wall], [edgeX + wall * .5, cutoff, front], tint(tone.accent));
    }
    const muralZ = back + wall + .015;
    for (let panel = 1; panel < 5; panel += 1) {
      const divider = left + w * panel / 5;
      mesh.line([divider, y + .32, muralZ], [divider, roof - .38, muralZ], tone.grid);
    }
    for (const band of [.23, .73]) {
      mesh.line([left + .32, y + h * band, muralZ], [right - .32, y + h * band, muralZ], tone.grid);
    }
    if (!doors.has('down')) floorTiles(mesh, room, tone);
    if (room.role === 'normal') {
      const shelfSide = room.variant === 1 ? 1 : -1;
      const shelfStart = x + w * shelfSide * .27;
      const shelfY = y + h * (room.variant === 2 ? .54 : .39);
      mesh.box(shelfStart - w * .14, shelfY - .14, back + .3, shelfStart + w * .14, shelfY, z + .78, tone.floor, tone.grid);
      if (room.template === '平台厅') {
        mesh.box(x - shelfSide * w * .23 - .66, y + h * .64 - .14, back + .32, x - shelfSide * w * .23 + .66, y + h * .64, z + .48, tone.floor, tone.grid);
      }
    } else {
      symbol(mesh, [x, y + h * .52, muralZ], .77, room.role, true);
      if (room.role === 'reward') mesh.box(x - .52, y, z - .48, x + .52, y + .57, z + .48, tone.trim, tone.edge);
    }
  }

  function planRoom(mesh, room, doors, tone) {
    const { x, y, z, w, h, d } = room;
    const left = x - w / 2;
    const right = x + w / 2;
    const back = z - d / 2;
    const front = z + d / 2;
    const wall = .24;
    mesh.box(left, y - .34, back, right, y, front, tone.floor, tone.edge);
    floorTiles(mesh, room, tone);
    for (const side of ['n', 'e', 's', 'w']) {
      const acrossX = side === 'n' || side === 's';
      const center = acrossX ? x : z;
      const boundary = side === 'n' ? back : side === 's' ? front - wall : side === 'w' ? left : right - wall;
      const extent = (acrossX ? w : d) / 2;
      const opening = doors.has(side) ? 1.07 : 0;
      const span = (from, to, bottom, top, wallTone = tone.wall, edge = tone.edge) => {
        if (acrossX) mesh.box(from, bottom, boundary, to, top, boundary + wall, wallTone, edge);
        else mesh.box(boundary, bottom, from, boundary + wall, top, to, wallTone, edge);
      };
      aroundOpening(center - extent, center + extent, center, opening, (from, to) => {
        span(from, to, y, y + h - .12);
        span(from, to, y + h - .12, y + h, tone.trim);
      });
      if (opening) span(center - opening, center + opening, y + 2.01, y + h, tone.trim, tone.grid);
    }
    if (room.template === '四柱厅') {
      for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const px = x + dx * (w / 2 - .61);
        const pz = z + dz * (d / 2 - .61);
        mesh.box(px - .16, y, pz - .16, px + .16, y + h * .80, pz + .16, tone.trim, tone.grid);
      }
    }
    if (room.role !== 'normal') {
      const podium = room.role !== 'start';
      if (podium) mesh.box(x - .74, y, z - .65, x + .74, y + .24, z + .65, tone.trim, tone.edge);
      symbol(mesh, [x, y + (podium ? .255 : .025), z], .62, room.role, false);
    }
  }

  function sidePassage(mesh, path, color) {
    const deck = tint(mix(baseBlue, color, .34));
    const trim = tint(color, .82);
    for (let index = 1; index < path.length; index += 1) {
      const [x0, y0, z] = path[index - 1];
      const [x1, y1] = path[index];
      const left = Math.min(x0, x1);
      const right = Math.max(x0, x1);
      if (y0 === y1) {
        mesh.box(left, y0 - .18, z - 1.22, right, y0, z + 1.26, deck, trim);
        mesh.box(left, y0, z - 1.26, right, y0 + 1.9, z - 1.13, deck, trim);
      } else {
        const bottom = Math.min(y0, y1);
        const top = Math.max(y0, y1);
        mesh.box(x0 - .64, bottom, z - 1.15, x0 + .64, top, z - .97, deck, trim);
        for (const dx of [-.48, .48]) mesh.line([x0 + dx, bottom, z - .9], [x0 + dx, top, z - .9], trim);
        for (let height = bottom + .26; height < top; height += .47) mesh.line([x0 - .48, height, z - .89], [x0 + .48, height, z - .89], trim);
      }
    }
  }

  function planPassage(mesh, [start, end], color) {
    const alongX = start[0] !== end[0];
    const width = 1.07;
    const rise = end[1] - start[1];
    const steps = rise ? Math.ceil(Math.abs(rise) / .47) : 1;
    const floor = tint(mix(baseBlue, color, .41));
    const trim = tint(color, .75);
    const at = (t) => mix(start, end, t);
    for (let step = 0; step < steps; step += 1) {
      const a = at(step / steps);
      const b = at((step + 1) / steps);
      const top = Math.min(a[1], b[1]);
      const bottom = top - Math.max(.2, Math.abs(rise / steps) + .06);
      if (alongX) mesh.box(Math.min(a[0], b[0]), bottom, a[2] - width, Math.max(a[0], b[0]), top, a[2] + width, floor, trim);
      else mesh.box(a[0] - width, bottom, Math.min(a[2], b[2]), a[0] + width, top, Math.max(a[2], b[2]), floor, trim);
    }
    for (const offset of [-width, width]) {
      const rail = alongX ? [0, .45, offset] : [offset, .45, 0];
      mesh.line(add(start, rail), add(end, rail), trim);
    }
  }

  function dashed(mesh, a, b, color) {
    const count = Math.max(1, Math.ceil(Math.hypot(...subtract(a, b)) * 1.35));
    for (let index = 0; index < count; index += 1) {
      mesh.line(mix(a, b, index / count), mix(a, b, (index + .59) / count), color);
    }
  }

  function candidateBox(mesh, room, color, rejected = false) {
    const w = rejected ? room.w : room.w * .78;
    const d = rejected ? room.d : room.d * .73;
    const h = rejected ? room.h : room.h * .67;
    mesh.box(room.x - w / 2, room.y, room.z - d / 2, room.x + w / 2, room.y + h, room.z + d / 2, tint(color, .105), tint(color, .72));
  }

  function portMark(mesh, room, entry, cutaway, highlighted = false) {
    if (entry.point) {
      if (!highlighted && entry.state !== 'waiting') return;
      const [x, y, z] = entry.point;
      const acrossX = entry.side === 'n' || entry.side === 's';
      const at = (delta, up) => [x + (acrossX ? delta : 0), y + up, z + (acrossX ? 0 : delta)];
      const color = tint(rgb(entry.hasOpening === false ? '#fa8392' : entry.state === 'waiting' ? '#76e5be' : '#f7c979'));
      mesh.stroke([at(-1.5, .04), at(1.5, .04), at(1.5, 3), at(-1.5, 3)], color);
      if (!entry.hasOpening) mesh.line(at(-1.5, .04), at(1.5, 3), color);
      return;
    }
    if (entry.state === 'matched') return;
    const [x, y, z] = port(room, entry.side);
    const normal = { n: [0, 0, -.02], s: [0, 0, .02], w: [-.02, 0, 0], e: [.02, 0, 0] }[entry.side];
    const alongX = entry.side === 'n' || entry.side === 's';
    const color = entry.state === 'capped' ? tint(rgb('#8495b8'), .49) : tint(rgb('#80e2b6'));
    const point = (across, up) => add([x + (alongX ? across : 0), y + up, z + (alongX ? 0 : across)], normal);
    const top = entry.state === 'capped' && cutaway?.has(entry.side) ? .8 : 1.71;
    mesh.stroke([point(-.66, .32), point(.66, .32), point(.66, top), point(-.66, top)], color);
    if (entry.state === 'waiting') mesh.line(point(-.26, 1.03), point(.26, 1.03), color);
  }

  function makeGrid(bounds) {
    const grid = new Mesh();
    const y = bounds.lower[1] - .45;
    const step = 2.5;
    const x0 = Math.round(bounds.center[0] / step) * step;
    const z0 = Math.round(bounds.center[2] / step) * step;
    const extent = 32;
    for (let n = -extent; n <= extent; n += 1) {
      const strength = (1 - Math.abs(n / (extent + 2))) * (n % 4 === 0 ? .44 : .26);
      const color = tint(rgb('#49618f'), strength);
      grid.line([x0 + n * step, y, z0 - extent * step], [x0 + n * step, y, z0 + extent * step], color);
      grid.line([x0 - extent * step, y, z0 + n * step], [x0 + extent * step, y, z0 + n * step], color);
    }
    return grid;
  }

  const onLevel = (room, level, geometry) => level === null || (geometry.doorHeights ?? legacyGeometry.doorHeights)(room).includes(level);

  function visiblePassage(points, from, to) {
    if (from && to) return points;
    const middle = mix(points[0], points.at(-1), .5);
    return from ? [points[0], middle] : [middle, points.at(-1)];
  }

  function buildMesh(frame, layout, selected, showFocus, level, cutaway, isolated) {
    const { projection } = layout;
    const viewKind = viewKindOf(layout);
    const geometry = geometryOf(layout);
    const model = new Mesh();
    const previews = new Mesh();
    const doors = frame.rooms.map(() => new Set());
    const visible = (room) => onLevel(room, level, geometry) && (!isolated || room.id === selected);
    const routeRooms = new Set();
    for (const edge of frame.edges) {
      const a = frame.rooms[edge.a];
      const b = frame.rooms[edge.b];
      const from = visible(a);
      const to = visible(b);
      if (!from && !to) continue;
      if (viewKind === 'stronghold') {
        if (edge.toPortal) {
          routeRooms.add(a.id);
          routeRooms.add(b.id);
        }
        continue;
      }
      const color = edge.toPortal ? rgb(portalRoute.color) : edge.hidden ? rgb(roles.secret.color) : edge.rewardLoop ? rgb('#c69a60') : neutral;
      if (edge.open) {
        doors[edge.a].add(edge.aSide);
        doors[edge.b].add(edge.bSide);
        const path = visiblePassage(connectionPath(a, b, edge, projection), from, to);
        if (projection === 'side') sidePassage(model, path, color);
        else if (viewKind === 'minecraft') minecraftPassage(model, path, viewKind, cutaway, edge.toPortal);
        else planPassage(model, path, color);
      } else {
        const centers = [a, b].map((room) => [room.x, room.y + (projection === 'side' ? room.h / 2 : .13), room.z]);
        const [start, end] = visiblePassage(centers, from, to);
        dashed(previews, start, end, tint(color, .78));
      }
    }
    for (const room of frame.rooms) {
      if (!visible(room)) continue;
      const tone = colors(room.role);
      if (!room.shell) candidateBox(previews, room, tone.accent);
      else if (projection === 'side') sideRoom(model, room, doors[room.id], tone);
      else if (viewKind === 'stronghold') globalThis.DungeonStrongholdMesh.addRoom(model, room, cutaway, geometry);
      else if (viewKind === 'minecraft') minecraftRoom(model, room, doors[room.id], viewKind, cutaway);
      else planRoom(model, room, doors[room.id], tone);
      if (room.id === selected || (showFocus && selected === null && room.id === frame.focus)) {
        const top = room.y + (room.shell ? room.h : room.h * .68) + .04;
        model.stroke(floorRectangle(room.x, top, room.z, room.w + .18, room.d + .18), tint(tone.accent, .94));
      }
      if (routeRooms.has(room.id)) {
        model.stroke(floorRectangle(room.x, room.y + room.h + .02, room.z, room.w - .1, room.d - .1), tint(rgb(portalRoute.color)));
      }
    }
    for (const entry of frame.ports) {
      const room = frame.rooms[entry.room];
      if (!visible(room)) continue;
      const inspecting = room.id === selected || (showFocus && frame.focusPort?.room === room.id && frame.focusPort.id === entry.id);
      if (viewKind === 'stronghold' && entry.state === 'inactive' && !inspecting) continue;
      portMark(model, room, entry, cutaway, inspecting);
    }
    if (frame.candidate && !isolated && (level === null || frame.focusPort?.point[1] === level)) {
      const candidate = frame.candidate;
      const color = rgb('#ff7b9b');
      if (viewKind === 'stronghold') {
        // The rejected volume can coincide with an existing wall or floor.
        const bottom = floorRectangle(candidate.x, candidate.y, candidate.z, candidate.w, candidate.d);
        const top = bottom.map(([x, y, z]) => [x, y + candidate.h, z]);
        const edge = tint(color, .9);
        previews.stroke(bottom, edge);
        previews.stroke(top, edge);
        bottom.forEach((point, index) => previews.line(point, top[index], edge));
      } else candidateBox(previews, candidate, color, true);
    }
    if (viewKind === 'stronghold') model.faces = globalThis.StrongholdSurfaces.resolve(model.faces);
    return { model, previews };
  }

  const vertexSource = `
    attribute vec3 a_position;
    attribute vec4 a_color;
    uniform vec3 u_eye, u_right, u_up, u_forward;
    uniform vec2 u_scale, u_depth;
    uniform float u_bias;
    varying mediump vec4 v_color;
    varying mediump float v_distance;
    void main() {
      vec3 point = a_position - u_eye;
      float d = dot(point, u_forward);
      // Move line depth toward the eye by a small world-space distance, keeping XY
      // unchanged. A fixed NDC offset can show rear edges through entire rooms.
      float depth = d * u_depth.x + u_depth.y * (1.0 + u_bias / max(d - u_bias, 0.08));
      gl_Position = vec4(dot(point, u_right) * u_scale.x, dot(point, u_up) * u_scale.y, depth, d);
      v_color = a_color;
      v_distance = d;
    }`;
  const fragmentSource = `
    precision mediump float;
    varying mediump vec4 v_color;
    varying mediump float v_distance;
    uniform float u_grid;
    void main() {
      float fog = smoothstep(48.0, 170.0, v_distance);
      vec3 color = mix(v_color.rgb, vec3(0.062, 0.088, 0.144), fog * 0.33);
      gl_FragColor = vec4(color, v_color.a * (1.0 - u_grid * fog * 0.85));
    }`;

  function shader(gl, type, source) {
    const compiled = gl.createShader(type);
    gl.shaderSource(compiled, source);
    gl.compileShader(compiled);
    if (!gl.getShaderParameter(compiled, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(compiled));
    return compiled;
  }

  function vertices(primitives, triangles) {
    const size = primitives.reduce((count, { points }) => count + (triangles ? (points.length - 2) * 3 : points.length), 0);
    const result = new Float32Array(size * 7);
    let offset = 0;
    const write = (point, color) => {
      result.set(point, offset);
      result.set(color, offset + 3);
      offset += 7;
    };
    for (const { points, color } of primitives) {
      if (!triangles) {
        for (const point of points) write(point, color);
        continue;
      }
      for (let index = 1; index < points.length - 1; index += 1) {
        write(points[0], color);
        write(points[index], color);
        write(points[index + 1], color);
      }
    }
    return result;
  }

  class WebGLDrawing {
    constructor(gl) {
      this.gl = gl;
      const program = gl.createProgram();
      const vertex = shader(gl, gl.VERTEX_SHADER, vertexSource);
      const fragment = shader(gl, gl.FRAGMENT_SHADER, fragmentSource);
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      gl.useProgram(program);
      this.position = gl.getAttribLocation(program, 'a_position');
      this.color = gl.getAttribLocation(program, 'a_color');
      this.uniform = Object.fromEntries(['eye', 'right', 'up', 'forward', 'scale', 'depth', 'bias', 'grid'].map((name) => [name, gl.getUniformLocation(program, `u_${name}`)]));
      this.batches = Array.from({ length: 5 }, () => ({ buffer: gl.createBuffer(), count: 0 }));
      gl.enableVertexAttribArray(this.position);
      gl.enableVertexAttribArray(this.color);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.clearColor(0, 0, 0, 0);
    }

    upload(index, primitives, triangles = false) {
      const gl = this.gl;
      const batch = this.batches[index];
      const data = vertices(primitives, triangles);
      batch.count = data.length / 7;
      gl.bindBuffer(gl.ARRAY_BUFFER, batch.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    }

    setGrid(grid) { this.upload(0, grid.lines); }

    setMeshes({ model, previews }) {
      this.upload(1, model.faces, true);
      this.upload(2, previews.faces, true);
      this.upload(3, model.lines);
      this.upload(4, previews.lines);
    }

    batch(index, mode, bias = 0) {
      const gl = this.gl;
      const { buffer, count } = this.batches[index];
      if (!count) return;
      gl.uniform1f(this.uniform.bias, bias);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.vertexAttribPointer(this.position, 3, gl.FLOAT, false, 28, 0);
      gl.vertexAttribPointer(this.color, 4, gl.FLOAT, false, 28, 12);
      gl.drawArrays(mode, 0, count);
    }

    draw(camera, width, height) {
      const gl = this.gl;
      gl.viewport(0, 0, width, height);
      gl.depthMask(true);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      for (const key of ['eye', 'right', 'up', 'forward']) gl.uniform3fv(this.uniform[key], camera[key]);
      gl.uniform2f(this.uniform.scale, focal / camera.aspect, focal);
      gl.depthMask(false);
      gl.uniform1f(this.uniform.grid, 1);
      // Grid lines may extend beyond the model. They never write model depth.
      gl.uniform2f(this.uniform.depth, 1, -2 * near);
      this.batch(0, gl.LINES);
      gl.uniform1f(this.uniform.grid, 0);
      const { near: front, far: back } = camera.clip;
      gl.uniform2f(this.uniform.depth, (back + front) / (back - front), -2 * back * front / (back - front));
      gl.depthMask(true);
      this.batch(1, gl.TRIANGLES);
      gl.depthMask(false);
      this.batch(2, gl.TRIANGLES);
      this.batch(3, gl.LINES, lineDepthOffset);
      this.batch(4, gl.LINES, lineDepthOffset);
    }
  }

  function toView(point, camera) {
    const relative = subtract(point, camera.eye);
    return [dot(relative, camera.right), dot(relative, camera.up), dot(relative, camera.forward)];
  }

  function toScreen([x, y, depth], width, height) {
    return [width / 2 + x / depth * focal * height / 2, height / 2 - y / depth * focal * height / 2];
  }

  function clipNear(points) {
    if (points.every((point) => point[2] >= near)) return points;
    const clipped = [];
    for (const [index, current] of points.entries()) {
      const previous = points[(index + points.length - 1) % points.length];
      if ((previous[2] >= near) !== (current[2] >= near)) {
        if (points.length > 2 || index === 1) clipped.push(mix(previous, current, (near - previous[2]) / (current[2] - previous[2])));
      }
      if (current[2] >= near) clipped.push(current);
    }
    return clipped;
  }

  class CanvasDrawing {
    constructor(context) { this.context = context; }
    setGrid(grid) { this.grid = grid; }
    setMeshes({ model, previews }) { this.primitives = [...model.faces, ...model.lines, ...previews.faces, ...previews.lines]; }

    draw(camera, width, height, density) {
      const context = this.context;
      context.clearRect(0, 0, width, height);
      context.lineWidth = density * .83;
      const paint = ({ points, color }) => {
        const projected = points.map((point) => toScreen(point, width, height));
        context.beginPath();
        context.moveTo(...projected[0]);
        for (const point of projected.slice(1)) context.lineTo(...point);
        if (points.length === 2) {
          context.strokeStyle = cssColor(color);
          context.stroke();
        } else {
          context.fillStyle = cssColor(color);
          context.fill();
        }
      };
      const project = (primitive) => {
        const points = clipNear(primitive.points.map((point) => toView(point, camera)));
        const depth = points.reduce((sum, point) => sum + point[2], 0) / points.length;
        return { ...primitive, points, depth: depth - (primitive.points.length === 2 ? lineDepthOffset : 0) };
      };
      this.grid.lines.map(project).filter(({ points }) => points.length === 2).forEach(paint);
      this.primitives.map(project).filter(({ points }) => points.length > 1).sort((a, b) => b.depth - a.depth).forEach(paint);
    }
  }

  function drawingFor(input) {
    let canvas = input;
    try {
      const gl = canvas.getContext('webgl', { alpha: true, antialias: true });
      if (gl) return { canvas, drawing: new WebGLDrawing(gl) };
    } catch {
      canvas = input.cloneNode();
      input.replaceWith(canvas);
    }
    return { canvas, drawing: new CanvasDrawing(canvas.getContext('2d')) };
  }

  function resizeCanvas(canvas) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const density = Math.min(globalThis.devicePixelRatio || 1, 2);
    const pixelsW = Math.round(width * density);
    const pixelsH = Math.round(height * density);
    if (canvas.width !== pixelsW || canvas.height !== pixelsH) {
      canvas.width = pixelsW;
      canvas.height = pixelsH;
    }
    return { width, height, density };
  }

  function roomHit(eye, ray, room) {
    const lower = [room.x - room.w / 2, room.y - .34, room.z - room.d / 2];
    const upper = [room.x + room.w / 2, room.y + room.h, room.z + room.d / 2];
    let start = -Infinity;
    let end = Infinity;
    for (let axis = 0; axis < 3; axis += 1) {
      if (Math.abs(ray[axis]) < 0.000001) {
        if (eye[axis] < lower[axis] || eye[axis] > upper[axis]) return Infinity;
        continue;
      }
      const a = (lower[axis] - eye[axis]) / ray[axis];
      const b = (upper[axis] - eye[axis]) / ray[axis];
      start = Math.max(start, Math.min(a, b));
      end = Math.min(end, Math.max(a, b));
    }
    return end >= Math.max(start, near) ? (start > near ? start : end + insideRoomPickPenalty) : Infinity;
  }

  class Scene {
    constructor(pane, onActivate, onSelect) {
      this.pane = pane;
      const result = drawingFor(pane.querySelector('.scene'));
      this.canvas = result.canvas;
      this.drawing = result.drawing;
      this.map = pane.querySelector('.minimap canvas');
      this.tag = pane.querySelector('.scene-tag');
      this.axes = [...pane.querySelectorAll('.axes path')].map((path, index) => ({
        path, text: pane.querySelectorAll('.axes text')[index], direction: [[0, 1, 0], [1, 0, 0], [0, 0, 1]][index],
      }));
      this.flyOverlay = pane.querySelector('.fly-overlay');
      this.onActivate = onActivate;
      this.onSelect = onSelect;
      this.mode = 'orbit';
      this.selected = null;
      this.keys = new Set();
      this.touches = new Set();
      this.pointers = new Map();
      this.raf = null;
      this.lastTime = 0;
      this.bindEvents();
      new ResizeObserver(() => this.requestDraw()).observe(this.canvas);
    }

    setLayout(layout, frame, selected, showFocus, level = null, isolated = false) {
      const inspectId = isolated ? selected : null;
      const openingView = viewKindOf(layout) === 'stronghold' && !isolated && showFocus && frame.phase === 0 && level === null;
      const changed = this.layout !== layout || this.level !== level || this.inspectId !== inspectId || this.openingView !== openingView;
      if (!changed && this.frame === frame && this.selected === selected && this.showFocus === showFocus) return;
      this.layout = layout;
      this.frame = frame;
      this.selected = selected;
      this.showFocus = showFocus;
      this.level = level;
      this.inspectId = inspectId;
      this.openingView = openingView;
      const solids = frame.rooms.filter((room) => this.roomVisible(room));
      if (frame.candidate && !isolated) solids.push(frame.candidate);
      this.depthBounds = limits(solids);
      if (changed) {
        const population = openingView ? layout.final.rooms.slice(0, 2) : layout.final.rooms;
        const viewedBounds = population.filter((room) => this.roomVisible(room));
        this.bounds = limits(viewedBounds);
        this.corners = cornersOf(viewedBounds);
        if (layout.projection === 'space') {
          this.minecraftYaw = minecraftYaw(viewedBounds);
          this.fitCenter = centerInView(this.bounds.center, this.corners, this.defaultOrbit());
        } else this.fitCenter = this.bounds.center;
        this.fitAspect = null;
        this.drawing.setGrid(makeGrid(this.bounds));
        this.reset();
      }
      this.updateMesh();
      this.requestDraw();
    }

    roomVisible(room) {
      return onLevel(room, this.level, geometryOf(this.layout)) && (this.inspectId === null || room.id === this.inspectId);
    }

    cutSides() {
      if (this.layout.projection !== 'space' || this.mode !== 'orbit') return '';
      const yaw = viewKindOf(this.layout) === 'stronghold' ? this.orbit.yaw : this.defaultOrbit().yaw;
      return (Math.sin(yaw) < 0 ? 'w' : 'e') + (Math.cos(yaw) < 0 ? 'n' : 's');
    }

    updateMesh() {
      this.cutKey = this.cutSides();
      const cutaway = this.cutKey ? new Set(this.cutKey) : null;
      this.drawing.setMeshes(buildMesh(this.frame, this.layout, this.selected, this.showFocus, this.level, cutaway, this.inspectId !== null));
    }

    defaultOrbit() {
      if (viewKindOf(this.layout) === 'stronghold') return { yaw: this.inspectId === null ? this.minecraftYaw : -.62, pitch: this.inspectId !== null ? .68 : this.level === null ? .72 : .89 };
      if (viewKindOf(this.layout) === 'minecraft') return { yaw: this.minecraftYaw, pitch: .68 };
      return this.layout.projection === 'side' ? { yaw: .31, pitch: .37 } : { yaw: .61, pitch: .78 };
    }

    reset() {
      if (!this.layout) return;
      const orbit = this.defaultOrbit();
      this.orbit = { ...orbit, target: [...this.fitCenter], zoom: 1 };
      const entrance = this.frame.rooms.find((room) => this.roomVisible(room));
      const firstEdge = this.layout.final.edges.find((edge) => edge.a === entrance.id || edge.b === entrance.id);
      const neighbor = firstEdge && this.layout.final.rooms[firstEdge.a === entrance.id ? firstEdge.b : firstEdge.a];
      const toward = neighbor ? [neighbor.x - entrance.x, neighbor.z - entrance.z] : [1, 0];
      const pitch = this.layout.projection === 'space' && neighbor
        ? clamp(Math.atan2(neighbor.y - entrance.y, Math.hypot(...toward)) * .65 - .07, -.34, -.07)
        : .01;
      this.fly = { eye: [entrance.x, entrance.y + 1.52, entrance.z], yaw: Math.atan2(...toward), pitch };
      if (viewKindOf(this.layout) === 'stronghold') this.enterRoom(entrance);
      this.requestDraw();
    }

    enterRoom(room) {
      const entry = room.connectors.find((p) => p.id === 'entry');
      const { worldPoint } = geometryOf(this.layout);
      const [dx, dz] = { n: [0, 1], e: [-1, 0], s: [0, -1], w: [1, 0] }[entry.side];
      const inward = Math.min(1.35, (dx ? room.localW : room.localD) / 2);
      const threshold = worldPoint(room, [entry.x, entry.y + 1.55, entry.z]);
      const eye = worldPoint(room, [entry.x + dx * inward, entry.y + 1.55, entry.z + dz * inward]);
      this.fly = { eye, yaw: Math.atan2(eye[0] - threshold[0], eye[2] - threshold[2]), pitch: -.08 };
    }

    focusRoom(room) {
      if (this.mode === 'orbit') {
        this.orbit.target = [room.x, room.y + room.h / 2, room.z];
        const aspect = Math.max(.1, this.canvas.clientWidth / (this.canvas.clientHeight || 1));
        this.orbit.zoom = room.templateId && this.inspectId === null
          ? clamp(Math.max(room.w, room.h, room.d) * 3.3 / Math.min(1, aspect) / this.fit(aspect), .025, 1)
          : this.inspectId === null ? .48 : 1;
      } else if (viewKindOf(this.layout) === 'stronghold') this.enterRoom(room);
      else this.fly.eye = [room.x, room.y + 1.52, room.z];
      this.requestDraw();
    }

    setMode(mode) {
      const changed = this.mode !== mode;
      this.mode = mode;
      if (changed && mode === 'fly' && viewKindOf(this.layout) === 'stronghold' && this.selected !== null) {
        this.enterRoom(this.frame.rooms[this.selected]);
      }
      this.clearMove();
      this.flyOverlay.hidden = mode !== 'fly';
      this.pane.classList.toggle('is-flying', mode === 'fly');
      if (changed && this.layout?.projection === 'space') this.updateMesh();
      this.requestDraw();
    }

    fit(aspect) {
      if (this.fitAspect === aspect) return this.fitDistance;
      const { yaw, pitch } = this.defaultOrbit();
      const forward = scale(heading(yaw, pitch), -1);
      const right = unit(cross(forward, [0, 1, 0]));
      const up = cross(right, forward);
      let distance = 9;
      for (const corner of this.corners) {
        const point = subtract(corner, this.fitCenter);
        const horizontal = Math.abs(dot(point, right)) * focal / aspect / .88;
        const vertical = Math.abs(dot(point, up)) * focal / .81;
        distance = Math.max(distance, Math.max(horizontal, vertical) - dot(point, forward));
      }
      this.fitAspect = aspect;
      this.fitDistance = distance + 1.5;
      return this.fitDistance;
    }

    cameraFor(aspect) {
      const isOrbit = this.mode === 'orbit';
      const view = isOrbit ? this.orbit : this.fly;
      const direction = heading(view.yaw, view.pitch);
      const forward = isOrbit ? scale(direction, -1) : direction;
      const eye = isOrbit ? add(view.target, scale(direction, this.fit(aspect) * view.zoom)) : view.eye;
      const right = unit(cross(forward, [0, 1, 0]));
      const up = cross(right, forward);
      return { eye, forward, right, up, aspect, clip: clipRange(this.depthBounds, eye, forward) };
    }

    requestDraw() {
      if (this.raf === null && this.layout) this.raf = requestAnimationFrame((time) => this.draw(time));
    }

    draw(time) {
      this.raf = null;
      const { width, height, density } = resizeCanvas(this.canvas);
      if (!width || !height) { this.lastTime = 0; return; }
      const moving = this.mode === 'fly' && this.keys.size + this.touches.size > 0;
      if (this.cutSides() !== this.cutKey) this.updateMesh();
      const aspect = width / height;
      let camera = this.cameraFor(aspect);
      if (moving) {
        const delta = this.lastTime ? Math.min((time - this.lastTime) / 1000, .06) : .016;
        this.move(delta, camera);
        camera = this.cameraFor(aspect);
      }
      this.lastTime = moving ? time : 0;
      this.camera = camera;
      this.drawing.draw(camera, this.canvas.width, this.canvas.height, density);
      this.drawAxes(camera);
      this.drawTag(width, height, camera);
      this.drawMap();
      if (moving) this.requestDraw();
    }

    drawAxes(camera) {
      for (const { path, text, direction } of this.axes) {
        const dx = dot(direction, camera.right);
        const dy = -dot(direction, camera.up);
        path.setAttribute('d', `M22 31 L${22 + 18 * dx} ${31 + 18 * dy}`);
        text.setAttribute('x', 20 + 23 * dx);
        text.setAttribute('y', 33 + 23 * dy);
      }
    }

    drawTag(width, height, camera) {
      const orbitMarker = this.showFocus ? this.frame.focus : this.frame.rooms.find((room) => room.role === 'portal')?.id;
      const id = this.selected ?? (this.mode === 'orbit' ? orbitMarker : null);
      const room = this.frame.rooms.find((entry) => entry.id === id && this.roomVisible(entry));
      if (!room) { this.tag.hidden = true; return; }
      const view = toView([room.x, room.y + room.h + .56, room.z], camera);
      const [x, y] = toScreen(view, width, height);
      this.tag.hidden = view[2] < near || x < 0 || y < 32 || x > width || y > height - 9;
      if (this.tag.hidden) return;
      const text = `${label(room)} · ${room.templateId ? room.template : roleStyle(room.role).name}`;
      if (this.tag.textContent !== text) this.tag.textContent = text;
      const margin = this.tag.offsetWidth / 2 + 6;
      this.tag.style.left = `${clamp(x, margin, width - margin)}px`;
      this.tag.style.top = `${y}px`;
      this.tag.style.setProperty('--tag-color', roleStyle(room.role).color);
    }

    drawMap() {
      const { width, height, density } = resizeCanvas(this.map);
      if (!width || !height) return;
      const context = this.map.getContext('2d');
      context.setTransform(density, 0, 0, density, 0, 0);
      context.clearRect(0, 0, width, height);
      const { center, lower, upper } = this.bounds;
      const side = this.layout.projection === 'side';
      const axis = side ? 1 : 2;
      const sign = side ? -1 : 1;
      const ratio = Math.min((width - 16) / (upper[0] - lower[0]), (height - 12) / (upper[axis] - lower[axis]));
      const position = (x, row) => [width / 2 + (x - center[0]) * ratio, height / 2 + sign * (row - center[axis]) * ratio];
      const flatten = (room) => position(room.x, side ? room.y + room.h / 2 : room.z);
      context.lineWidth = .75;
      for (const edge of this.frame.edges) {
        const a = this.frame.rooms[edge.a];
        const b = this.frame.rooms[edge.b];
        const from = this.roomVisible(a);
        const to = this.roomVisible(b);
        if (!from && !to) continue;
        const path = edge.aPoint ? [from && flatten(a), position(edge.aPoint[0], edge.aPoint[2]), to && flatten(b)].filter(Boolean)
          : visiblePassage([flatten(a), flatten(b)], from, to);
        context.beginPath();
        context.strokeStyle = edge.toPortal ? portalRoute.color : edge.hidden ? '#ba85eeb6' : '#8099d3b0';
        context.setLineDash(edge.open && !edge.hidden ? [] : [2, 2]);
        context.moveTo(...path[0]);
        for (const point of path.slice(1)) context.lineTo(...point);
        context.stroke();
      }
      context.setLineDash([]);
      this.mapRooms = [];
      const rooms = this.frame.rooms.filter((room) => this.roomVisible(room)).sort((a, b) => a.y - b.y);
      for (const room of rooms) {
        const [x, y] = flatten(room);
        const w = Math.max(4, room.w * ratio);
        const h = Math.max(4, (side ? room.h : room.d) * ratio);
        const color = roleStyle(room.role).color;
        context.fillStyle = `${color}${room.shell ? '56' : '24'}`;
        context.strokeStyle = room.id === this.selected ? '#ffffff' : color;
        context.fillRect(x - w / 2, y - h / 2, w, h);
        context.strokeRect(x - w / 2, y - h / 2, w, h);
        this.mapRooms.push({ id: room.id, left: x - w / 2, top: y - h / 2, w, h });
      }
      if (this.mode === 'fly') {
        const [x, y] = position(this.fly.eye[0], this.fly.eye[axis]);
        const direction = heading(this.fly.yaw, this.fly.pitch);
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + direction[0] * 7, y + direction[axis] * 7 * sign);
        context.strokeStyle = '#f5efff';
        context.stroke();
        context.beginPath();
        context.arc(x, y, 2.2, 0, Math.PI * 2);
        context.fillStyle = '#f5efff';
        context.fill();
      }
    }

    zoom(factor) {
      this.orbit.zoom = clamp(this.orbit.zoom * factor, viewKindOf(this.layout) === 'stronghold' ? .025 : .17, 4.8);
      this.requestDraw();
    }

    move(delta, camera) {
      const keys = new Set([...this.keys, ...this.touches]);
      const forward = Number(keys.has('w')) - Number(keys.has('s'));
      const sidestep = Number(keys.has('d')) - Number(keys.has('a'));
      const vertical = Number(keys.has('e')) - Number(keys.has('q'));
      const direction = add(add(scale(camera.forward, forward), scale(camera.right, sidestep)), [0, vertical, 0]);
      const destination = add(this.fly.eye, scale(unit(direction), 8.5 * delta));
      this.fly.eye = destination.map((value, axis) => clamp(value, this.bounds.lower[axis] - 42, this.bounds.upper[axis] + 42));
    }

    moveKey(key, pressed, touch = false) {
      const keys = touch ? this.touches : this.keys;
      if (pressed) keys.add(key);
      else keys.delete(key);
      this.requestDraw();
    }

    clearMove() { this.keys.clear(); this.touches.clear(); }

    selectAt(x, y) {
      const width = this.canvas.clientWidth;
      const height = this.canvas.clientHeight;
      const camera = this.cameraFor(width / height);
      const horizontal = (2 * x - width) / (focal * height);
      const vertical = (height - 2 * y) / (focal * height);
      const ray = unit(add(add(camera.forward, scale(camera.right, horizontal)), scale(camera.up, vertical)));
      let best = Infinity;
      let id = null;
      for (const room of this.frame.rooms) {
        if (!this.roomVisible(room)) continue;
        const distance = roomHit(camera.eye, ray, room);
        if (distance < best) { best = distance; id = room.id; }
      }
      this.onSelect(id);
    }

    bindEvents() {
      this.canvas.addEventListener('wheel', (event) => {
        if (this.mode !== 'orbit' || !this.layout || event.ctrlKey) return;
        event.preventDefault();
        this.onActivate();
        this.zoom(Math.exp(event.deltaY * (event.deltaMode === 1 ? .032 : .00125)));
      }, { passive: false });
      this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());
      this.canvas.addEventListener('focus', this.onActivate);
      this.canvas.addEventListener('pointerdown', (event) => {
        if (!this.layout) return;
        this.canvas.focus({ preventScroll: true });
        this.onActivate();
        this.canvas.setPointerCapture(event.pointerId);
        this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, motion: 0, pan: event.button === 2 || event.shiftKey });
      });
      this.canvas.addEventListener('pointermove', (event) => {
        const pointer = this.pointers.get(event.pointerId);
        if (!pointer) return;
        const dx = event.clientX - pointer.x;
        const dy = event.clientY - pointer.y;
        const other = [...this.pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
        if (other && this.mode === 'orbit') {
          const before = Math.hypot(other.x - pointer.x, other.y - pointer.y);
          const after = Math.hypot(other.x - event.clientX, other.y - event.clientY);
          if (before > 3 && after > 3) this.zoom(before / after);
          other.motion += 4;
        } else if (this.mode === 'fly') {
          this.fly.yaw -= dx * .005;
          this.fly.pitch = clamp(this.fly.pitch - dy * .005, -1.47, 1.47);
        } else if (pointer.pan && this.camera) {
          const ratio = Math.hypot(...subtract(this.camera.eye, this.orbit.target)) / (focal * this.canvas.clientHeight / 2);
          this.orbit.target = add(this.orbit.target, add(scale(this.camera.right, -dx * ratio), scale(this.camera.up, dy * ratio)));
        } else {
          this.orbit.yaw -= dx * .007;
          this.orbit.pitch = clamp(this.orbit.pitch + dy * .006, -1.45, 1.46);
        }
        Object.assign(pointer, { x: event.clientX, y: event.clientY, motion: pointer.motion + Math.hypot(dx, dy) });
        this.requestDraw();
      });
      this.canvas.addEventListener('pointerup', (event) => {
        const pointer = this.pointers.get(event.pointerId);
        this.pointers.delete(event.pointerId);
        if (pointer && pointer.motion < 4 && event.button === 0) {
          const bounds = this.canvas.getBoundingClientRect();
          this.selectAt(event.clientX - bounds.left, event.clientY - bounds.top);
        }
      });
      for (const eventName of ['pointercancel', 'lostpointercapture']) {
        this.canvas.addEventListener(eventName, (event) => this.pointers.delete(event.pointerId));
      }
      this.map.addEventListener('click', (event) => {
        this.onActivate();
        const hit = this.mapRooms?.findLast(({ left, top, w, h }) => event.offsetX >= left - 2 && event.offsetX <= left + w + 2 && event.offsetY >= top - 2 && event.offsetY <= top + h + 2);
        if (!hit) return;
        const room = this.frame.rooms[hit.id];
        this.onSelect(hit.id);
        this.focusRoom(room);
      });
      for (const button of this.flyOverlay.querySelectorAll('[data-move]')) {
        button.addEventListener('pointerdown', (event) => {
          event.preventDefault();
          this.onActivate();
          button.setPointerCapture(event.pointerId);
          this.moveKey(button.dataset.move, true, true);
        });
        for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
          button.addEventListener(eventName, () => this.moveKey(button.dataset.move, false, true));
        }
      }
    }
  }

  globalThis.DungeonScene = Scene;
})();
