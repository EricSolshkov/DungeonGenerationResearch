(() => {
  'use strict';

  const headings = ['n', 'e', 's', 'w'];
  const opposite = { n: 's', e: 'w', s: 'n', w: 'e' };
  const localPoint = ({ x, y, z }) => [x, y, z];
  const bounds = ({ x, y, z, w, h, d }) => [x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2];
  const overlaps = (a, b) => [0, 1, 2].every((i) => a[i] < b[i + 3] - .03 && a[i + 3] > b[i] + .03);
  const roomLabel = (room) => 'R' + String((room.sourceId ?? room.id) + 1).padStart(2, '0');

  // A trial owns its geometry, frontier and replay. Policies see spatial queries,
  // never mutate an accepted room, and choose a proposal before any instance RNG.
  function grow(ruleset, pool, random, attempt, limit, options) {
    const rooms = [], edges = [], ports = [], frames = [];
    const volumes = [], portIndices = [], pending = [];
    const state = ruleset.begin({ ...options, pool });
    const stamp = { ruleset: ruleset.key || ruleset.id + '@' + ruleset.version, pool: pool.key || pool.id + '@' + pool.version };
    function record(phase, message, focus, candidate, focusPort, decision) {
      frames.push({ phase, message, focus, candidate, focusPort,
        rooms: rooms.slice(), edges: edges.slice(), ports: ports.slice(), decision: { ...stamp, ...decision } });
    }

    const templateFor = (id) => {
      const template = pool.pieces[id];
      if (!template) throw new Error('模板池中找不到片段 ' + id);
      return template;
    };
    const dimensions = (id, options) => pool.measure ? pool.measure(id, options) : templateFor(id);
    const entrance = (template) => template.connectors.find((port) => port.id === 'entry');
    function size(id, facing, options) {
      const { w, h, d } = dimensions(id, options);
      const localForward = pool.worldSide(facing, 's');
      const turned = localForward === 'e' || localForward === 'w';
      return { facing, w: turned ? d : w, d: turned ? w : d, h, localW: w, localH: h, localD: d };
    }

    function register(room) {
      rooms.push(room);
      volumes.push(bounds(room));
      portIndices.push(room.connectors.map((connector) => {
        const entry = connector.id === 'entry';
        const state = entry ? (room.parent === undefined ? 'entrance' : 'matched')
          : !connector.active ? 'inactive' : connector.terminal ? 'terminal' : 'waiting';
        const local = localPoint(connector);
        return ports.push({ room: room.id, id: connector.id, label: connector.label,
          side: pool.worldSide(room.facing, connector.side), local, point: pool.worldPoint(room, local),
          state, hasOpening: connector.hasOpening }) - 1;
      }));
    }

    const initial = ruleset.start({ pool, random, attempt, state });
    const [x, y, z] = initial.position;
    const initialData = pool.instantiate(initial.id, random, { facing: initial.facing });
    const start = { id: 0, x, y, z, role: initial.role, shell: true, ...initialData,
      ...size(initial.id, initial.facing, {}), depth: 0, level: 0, entryY: y + entrance(initialData).y };
    register(start);
    record(0, initial.message, 0, null, null, { kind: 'start', templateId: initial.id, attempt });

    function expand(parent, index) {
      const exit = ports[index];
      const phase = parent === start ? 0 : 1;
      const depth = parent.depth + 1;
      let reported = false;
      function probe(id, options = {}) {
        const entry = entrance(templateFor(id));
        const facing = headings.find((heading) => pool.worldSide(heading, entry.side) === opposite[exit.side]);
        if (!facing) throw new Error('片段 ' + id + ' 的入口无法与出口方向 ' + exit.side + ' 对接');
        const candidate = { x: 0, y: 0, z: 0, ...size(id, facing, options) };
        const anchor = pool.worldPoint(candidate, localPoint(entry));
        [candidate.x, candidate.y, candidate.z] = exit.point.map((v, i) => v - anchor[i]);
        candidate.level = ruleset.level(start.entryY, exit.point[1]);
        const box = bounds(candidate);
        const occupied = volumes.findIndex((v) => overlaps(box, v));
        return { id, options, candidate, occupied, intersectsRoom: (id) => overlaps(box, volumes[id]) };
      }
      // Keep the first failed draw visible even if a later draw on this port wins.
      function reject(reason, templateId, candidate, code) {
        if (reported) return;
        reported = true;
        const prefix = templateId ? '试放「' + templateFor(templateId).name + '」' : '';
        record(phase, roomLabel(parent) + ' · ' + exit.label + '（Y=' + exit.point[1] + '）' + prefix + reason + '。',
          parent.id, candidate ?? null, exit, { kind: 'reject', reason: code, templateId, connectorId: exit.id });
      }
      const ctx = { start, parent, exit, depth, state, pool, random, attempt, rooms, ports, roomLabel, probe, reject };
      const choice = rooms.length < limit ? ruleset.select(ctx) : { stop: '达到本次运行的片段上限' };
      if (!choice.proposal) {
        const capped = { ...exit, state: 'capped' };
        ports[index] = capped;
        record(phase, roomLabel(parent) + ' · ' + exit.label + '结束扩建。' + choice.stop + '。', parent.id,
          null, capped, { kind: 'cap', reason: choice.stop, connectorId: exit.id });
        return;
      }
      const { id, candidate, options } = choice.proposal;
      const data = pool.instantiate(id, random, { ...options, facing: candidate.facing });
      const room = { id: rooms.length, ...candidate, ...data, role: choice.role, parent: parent.id,
        depth, shell: true, entryY: exit.point[1], ...(choice.contactRoom === undefined ? {} : { contactRoom: choice.contactRoom }) };
      const entry = entrance(room);
      edges.push({ a: parent.id, b: room.id, aSide: exit.side, bSide: opposite[exit.side],
        aConnectorId: exit.id, bConnectorId: entry.id, aPoint: exit.point, bPoint: pool.worldPoint(room, localPoint(entry)),
        doorType: room.doorType, obstructed: exit.hasOpening === false, open: true });
      const matched = { ...exit, state: 'matched' };
      ports[index] = matched;
      register(room);
      pending.push(room);
      const message = ruleset.placed(ctx, room, choice);
      record(phase, message, room.id, null, matched, { kind: 'place', connectorId: exit.id, templateId: id,
        selection: choice.selection, attempt, ...choice.explanation });
    }
    function expandRoom(room) {
      for (const index of portIndices[room.id]) {
        if (ports[index].state === 'waiting') expand(room, index);
      }
    }
    expandRoom(start);
    while (pending.length) {
      const index = ruleset.next(pending, random);
      const [room] = pending.splice(index, 1);
      expandRoom(room);
    }
    const completed = ruleset.finish({ rooms, edges, ports, attempt, record, roomLabel, state });
    return { rooms, edges, ports, frames, completed, attempt };
  }

  function run({ ruleset, pool, random, ...options }) {
    const { maxAttempts = 64, maxPieces = 2048 } = ruleset;
    if (![maxAttempts, maxPieces].every((n) => Number.isSafeInteger(n) && n > 0)) throw new Error('生成预算必须为正整数');
    let result;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      result = grow(ruleset, pool, random, attempt, maxPieces, options);
      if (result.completed) return result;
    }
    // Keep the last attempted layout and report the outcome at its own stage.
    const frame = result.frames.at(-1);
    const message = '经过 ' + maxAttempts + ' 次尝试，仍未满足规则集的完成条件。';
    result.frames.push({ ...frame, message, candidate: null, focusPort: null,
      decision: { ruleset: frame.decision.ruleset, pool: frame.decision.pool, kind: 'exhausted', attempt: maxAttempts } });
    return result;
  }

  globalThis.ConnectorGrowth = { run };
})();
