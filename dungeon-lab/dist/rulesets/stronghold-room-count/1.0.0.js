(() => {
  'use strict';

  const base = GrowthCatalog.get('ruleset', 'stronghold-java@1.17.1');
  const defaultTarget = 8;
  const maxRoomTarget = 32;
  const maxAttempts = 8;

  function begin({ pool, roomTarget = defaultTarget }) {
    if (!Number.isInteger(roomTarget) || roomTarget < 1 || roomTarget > maxRoomTarget) {
      throw new Error(`目标房间数必须是 1 至 ${maxRoomTarget} 的整数。`);
    }
    const roomTemplates = pool.templates.filter((t) => t.tags?.includes('room'));
    const roomIds = new Set(roomTemplates.map((t) => t.id));
    const ordinary = roomTemplates.filter((t) => t.id !== 'portal');
    const corridors = pool.templates.filter((t) => t.tags?.includes('corridor') && t.id !== 'start' && t.id !== 'filler');
    const throughRooms = ordinary.filter((t) => t.connectors.length > 1);
    const junctions = corridors.filter((t) => t.connectors.length > 2);
    return { roomTarget, roomCount: 0, roomIds, ordinary, corridors, throughRooms, junctions };
  }

  function start(ctx) {
    const initial = base.start({ ...ctx, attempt: 1 });
    const retry = ctx.attempt > 1 ? `第 ${ctx.attempt} 次布局。` : '';
    return { ...initial, message: `${retry}${initial.message} 本轮目标 ${ctx.state.roomTarget} 间房，含 1 间末地传送门房。` };
  }

  function tryPiece(ctx, id) {
    let proposal = ctx.probe(id);
    if (id === 'library' && proposal.occupied >= 0) proposal = ctx.probe(id, { short: true });
    if (proposal.occupied >= 0) {
      ctx.reject('与 ' + ctx.roomLabel(ctx.rooms[proposal.occupied]) + ' 重叠', id, proposal.candidate, 'collision');
      return null;
    }
    const counted = ctx.state.roomIds.has(id);
    return { proposal, selection: id === 'portal' ? 'reserved' : 'growth',
      role: id === 'portal' ? 'portal' : id === 'library' ? 'library' : 'normal',
      explanation: { roomCount: ctx.state.roomCount + Number(counted), roomTarget: ctx.state.roomTarget } };
  }

  // Each template in the group gets one chance, in seeded random order.
  function tryGroup(ctx, templates) {
    const remaining = templates.slice();
    while (remaining.length) {
      const index = Math.floor(ctx.random() * remaining.length);
      const [template] = remaining.splice(index, 1);
      const choice = tryPiece(ctx, template.id);
      if (choice) return choice;
    }
    return null;
  }

  function select(ctx) {
    const { roomCount, roomTarget, ordinary, corridors } = ctx.state;
    const slots = roomTarget - roomCount;
    if (!slots) return { stop: `已达到 ${roomTarget} 间房的目标` };
    if (ctx.exit.hasOpening === false) return { stop: '墙面没有可通行的开口' };

    // A straight hall has an aligned, always-open forward exit. On the final
    // trial these halls form a collision-free chain ending in the unique portal.
    if (ctx.attempt === maxAttempts) {
      return tryPiece(ctx, slots === 1 ? 'portal' : 'hall') || { stop: '直通房间所需空间已被占用' };
    }
    const blocked = { stop: '此门位没有足够空间放置候选片段' };
    if (slots === 1) return tryPiece(ctx, 'portal') || tryGroup(ctx, corridors) || blocked;
    if (ctx.parent === ctx.start) return tryPiece(ctx, 'crossing') || blocked;
    const preferRoom = !ctx.state.roomIds.has(ctx.parent.templateId) && ctx.random() < .7;
    const open = ctx.ports.filter((port) => port.state === 'waiting' && port.hasOpening !== false).length;
    // Keep growing paths available before placing single-door rooms on branches.
    const rooms = open < 3 ? ctx.state.throughRooms : ordinary;
    if (preferRoom) {
      const room = tryGroup(ctx, rooms);
      if (room) return room;
    }
    if (open < 3) {
      const junction = tryGroup(ctx, ctx.state.junctions);
      if (junction) return junction;
    }
    return tryGroup(ctx, corridors) || (!preferRoom && tryGroup(ctx, rooms)) || blocked;
  }

  function placed(ctx, room, choice) {
    const { roomCount, roomTarget } = choice.explanation;
    ctx.state.roomCount = roomCount;
    return `${ctx.roomLabel(ctx.parent)} 的${ctx.exit.label}接入 ${ctx.roomLabel(room)}「${room.template}」。房间 ${roomCount}/${roomTarget}。`;
  }

  function finish(ctx) {
    const { rooms, state, record } = ctx;
    const roomCount = rooms.filter((room) => state.roomIds.has(room.templateId)).length;
    const portals = rooms.filter((room) => room.templateId === 'portal');
    if (roomCount !== state.roomTarget || portals.length !== 1) return false;
    const portal = portals[0];
    const obstructed = base.tracePortal(ctx, portal);
    record(3, `已达到 ${roomCount} 间房，其中 1 间为末地传送门房。另有 ${rooms.length - roomCount} 个通道片段。入口到传送门经过 ${portal.depth} 次连接。`,
      portal.id, null, null, { kind: 'complete', roomTarget: state.roomTarget, roomCount, portalCount: portals.length,
        routeDepth: portal.depth, obstructed });
    return true;
  }

  GrowthCatalog.register('ruleset', {
    id: 'stronghold-room-count', version: '1.0.0', name: '按房间数生成',
    description: '按目标房间数扩建，最后一间留给唯一的末地传送门房。通道、楼梯和交叉口均不占房间名额。',
    roomTarget: defaultTarget, maxRoomTarget, maxAttempts, maxPieces: 256, seedDomain: 'stronghold',
    requiredTemplates: ['start', 'crossing', 'hall', 'portal'], requiredConnectors: { start: ['forward'], hall: ['forward'] },
    requiredTags: ['room', 'corridor'], begin, start, level: base.level, next: base.next, select, placed, finish,
  });
})();
