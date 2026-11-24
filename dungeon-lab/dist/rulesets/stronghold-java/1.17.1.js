(() => {
  'use strict';

  // A collision can fall through to the next entry in this exact Java pool order.
  const distribution = [
    ['straight', 40, Infinity], ['prison', 5, 5], ['leftTurn', 20, Infinity],
    ['rightTurn', 20, Infinity], ['crossing', 10, 6], ['straightStairs', 5, 5],
    ['spiralStairs', 5, 5], ['fiveCrossing', 5, 4], ['chest', 5, 4],
    ['library', 10, 2, 5], ['portal', 20, 1, 6],
  ];
  const facingNames = { n: '北', e: '东', s: '南', w: '西' };

  function start({ pool, random, attempt }) {
    const facing = ['n', 'e', 's', 'w'][Math.floor(random() * 4)];
    const stairs = pool.pieces.start;
    const upper = stairs.connectors.find((p) => p.id === 'entry').y;
    const lower = stairs.connectors.find((p) => p.id === 'forward').y;
    const retry = attempt > 1 ? `前 ${attempt - 1} 次布局没有传送门房，重新生成。` : '';
    return { id: 'start', role: 'start', position: [stairs.w / 2, 0, stairs.d / 2], facing,
      message: `${retry}起始螺旋楼梯朝${facingNames[facing]}，从 Y=${upper} 的上门降至 Y=${lower} 的前门。` };
  }

  function regular(ctx, id, selection, explanation) {
    let proposal = ctx.probe(id);
    if (proposal.candidate.y + 64 <= 10) {
      ctx.reject('低于片段生成高度', id, proposal.candidate, 'height');
      return null;
    }
    if (id === 'library' && proposal.occupied >= 0) proposal = ctx.probe(id, { short: true });
    if (proposal.occupied >= 0) {
      ctx.reject('与 ' + ctx.roomLabel(ctx.rooms[proposal.occupied]) + ' 重叠，继续筛选', id, proposal.candidate, 'collision');
      return null;
    }
    const role = id === 'portal' ? 'portal' : id === 'library' ? 'library' : 'normal';
    return { proposal, selection, role, explanation };
  }

  function filler(ctx) {
    const { candidate, occupied } = ctx.probe('filler', { length: 4 });
    if (occupied < 0 || ctx.rooms[occupied].y !== candidate.y || candidate.y + 64 <= 1) return null;
    for (const length of [3, 2]) {
      if (!ctx.probe('filler', { length: length - 1 }).intersectsRoom(occupied)) {
        return { proposal: ctx.probe('filler', { length }), selection: 'fallback', contactRoom: occupied, role: 'normal' };
      }
    }
    return null;
  }

  function choose(entries, ctx) {
    const { parent, exit, depth, state, random } = ctx;
    const [x, , z] = exit.point;
    const footX = exit.side === 'e' ? x : exit.side === 'w' ? x - 1 : x - 1.5;
    const footZ = exit.side === 's' ? z : exit.side === 'n' ? z - 1 : z - 1.5;
    if (parent.depth > 50) return { stop: '父片段已超过第 50 代' };
    if (Math.abs(footX - (ctx.start.x - ctx.start.w / 2)) > 112 || Math.abs(footZ - (ctx.start.z - ctx.start.d / 2)) > 112) {
      return { stop: '门位超出起点水平 112 格的范围' };
    }
    const available = entries.filter((e) => (state.counts.get(e.id) ?? 0) < e.maxCount);
    if (!available.some((e) => Number.isFinite(e.maxCount))) return { stop: '有次数上限的片段均已用尽' };
    if (parent === ctx.start) {
      const first = regular(ctx, 'fiveCrossing', 'forced');
      if (first) return first;
    }
    const total = available.reduce((sum, e) => sum + e.weight, 0);
    for (let draw = 1; draw <= 5; draw++) {
      let ticket = Math.floor(random() * total);
      for (const entry of available) {
        ticket -= entry.weight;
        if (ticket >= 0) continue;
        if (entry.id === state.previous) {
          ctx.reject('与上一个加权选中的类型相同，重新抽取', entry.id, null, 'repeat');
          break;
        }
        if (depth < entry.minDepth) {
          ctx.reject(`需要第 ${entry.minDepth} 代才能出现，当前为第 ${depth} 代`, entry.id, null, 'min-depth');
          break;
        }
        const result = regular(ctx, entry.id, 'weighted', { draw, weight: entry.weight, totalWeight: total });
        if (result) return result;
      }
    }
    return filler(ctx) || { stop: '五次加权抽取均未放置片段，附近也没有合适的填充短廊位置' };
  }

  function placed(ctx, room, choice) {
    if (choice.selection === 'weighted') {
      const id = room.templateId;
      ctx.state.counts.set(id, (ctx.state.counts.get(id) || 0) + 1);
      ctx.state.previous = id;
    }
    const { roomLabel, parent, exit } = ctx;
    const prefix = parent === ctx.start ? '优先试放五向交叉厅。' : '';
    let annotation = '';
    if (room.templateId === 'filler') {
      annotation = ` 五次抽取后回退，短廊长 ${room.localD} 格，尽头接近 ${roomLabel(ctx.rooms[choice.contactRoom])} 的墙面。`;
    } else if (choice.proposal.options.short) annotation = ' 双层高度受阻，改放单层图书馆。';
    else if (room.templateId === 'straight' || room.templateId === 'fiveCrossing') {
      const exits = room.connectors.filter((c) => c.id !== 'entry');
      annotation = ` 本次启用 ${exits.filter((c) => c.active).length}/${exits.length} 个出口。`;
    }
    return `${prefix}${roomLabel(parent)} 的${exit.label}（${exit.local.join(', ')}）接入朝${facingNames[room.facing]}的 ${roomLabel(room)}「${room.template}」，门槛 Y=${room.entryY}。${annotation}`;
  }

  function finish({ rooms, edges, ports, record, roomLabel }) {
    const portal = rooms.find((room) => room.role === 'portal');
    if (!portal) return false;
    record(2, `找到 ${roomLabel(portal)}「${portal.template}」，门槛位于 Y=${portal.entryY}，沿父片段回溯。`,
      portal.id, null, null, { kind: 'objective', templateId: portal.templateId });
    let obstructed = 0;
    for (let room = portal; room.parent !== undefined; room = rooms[room.parent]) {
      const index = room.id - 1;
      const edge = edges[index];
      edges[index] = { ...edge, toPortal: true };
      const parent = rooms[edge.a];
      const port = parent.connectors.find((c) => c.id === edge.aConnectorId);
      if (edge.obstructed) obstructed++;
      const wall = edge.obstructed ? ' 此处有子片段，但五向交叉厅的墙面没有对应开口。' : '';
      record(2, `从 ${roomLabel(room)} 的入口回到 ${roomLabel(parent)} 的${port.label}（Y=${edge.aPoint[1]}）。${wall}`,
        parent.id, null, null, { kind: 'route', connectorId: port.id, obstructed: edge.obstructed });
    }
    const capped = ports.filter((p) => p.state === 'capped').length;
    const barrier = obstructed ? `，其中 ${obstructed} 处被墙面阻隔` : '';
    record(3, `要塞共 ${rooms.length} 个片段，${edges.length} 对门位相接，${capped} 个启用的出口终止扩建。入口到传送门的生成树路线经过 ${portal.depth} 次连接${barrier}。`,
      portal.id, null, null, { kind: 'complete', routeDepth: portal.depth, obstructed });
    return true;
  }

  function createRules({ id = 'stronghold-java', version = '1.17.1', name = 'Java 1.17.1 要塞规则',
    description = '按 Java 要塞的顺序抽取片段，验证空间、数量和深度，直到生成传送门房。', weights = {} } = {}) {
    for (const [key, value] of Object.entries(weights)) {
      if (!distribution.some(([id]) => id === key) || !Number.isSafeInteger(value) || value <= 0) {
        throw new Error('无效的片段权重：' + key);
      }
    }
    const entries = Object.freeze(distribution.map(([id, weight, maxCount, minDepth = 0]) =>
      Object.freeze({ id, weight: weights[id] ?? weight, maxCount, minDepth })));
    return { id, version, name, description, seedDomain: 'stronghold', entries, requiredTemplates: ['start', 'filler'],
      requiredConnectors: { start: ['forward'] },
      createRules, begin: () => ({ counts: new Map(), previous: null }), start,
      level: (startY, y) => Math.floor((startY - y) / 6), next: (pending, random) => Math.floor(random() * pending.length),
      select: (ctx) => choose(entries, ctx), placed, finish };
  }

  GrowthCatalog.register('ruleset', createRules());
})();
