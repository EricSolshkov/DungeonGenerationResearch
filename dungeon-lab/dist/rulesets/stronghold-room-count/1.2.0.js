(() => {
  'use strict';

  const previous = GrowthCatalog.get('ruleset', 'stronghold-room-count@1.1.0');

  function pruneCorridorBranches({ rooms, edges, ports, state, record }) {
    // Parents precede their children. A single backward pass marks the union
    // of the paths from the entrance to every counted room.
    const keep = rooms.map((room) => state.roomIds.has(room.templateId));
    for (let i = rooms.length - 1; i > 0; i--) {
      if (keep[i]) keep[rooms[i].parent] = true;
    }
    const survivors = rooms.filter((room) => keep[room.id]);
    const removedPieces = rooms.length - survivors.length;
    if (!removedPieces) {
      record(2, '所有通道分支都通往房间。', null, null, null,
        { kind: 'prune', removedPieces: 0, removedBranches: 0 });
      return;
    }

    const newId = new Map(survivors.map((room, index) => [room.id, index]));
    const sealed = new Map();
    let removedBranches = 0;
    for (const edge of edges) {
      if (keep[edge.a] && !keep[edge.b]) {
        if (!sealed.has(edge.a)) sealed.set(edge.a, new Set());
        sealed.get(edge.a).add(edge.aConnectorId);
        removedBranches++;
      }
    }

    // The viewer addresses each piece by its index. Keep its original ID for
    // replay labels, and replace records so earlier frames retain their topology.
    const keptRooms = survivors.map((room, id) => {
      const kept = { ...room, id, sourceId: room.id };
      if (room.parent !== undefined) kept.parent = newId.get(room.parent);
      if (room.contactRoom !== undefined) {
        if (newId.has(room.contactRoom)) kept.contactRoom = newId.get(room.contactRoom);
        else delete kept.contactRoom;
      }
      const closedDoors = sealed.get(room.id);
      if (closedDoors) {
        kept.connectors = room.connectors.map((door) => closedDoors.has(door.id)
          ? { ...door, active: false, hasOpening: false } : door);
      }
      return kept;
    });
    const keptEdges = edges.filter((edge) => keep[edge.b]).map((edge) =>
      ({ ...edge, a: newId.get(edge.a), b: newId.get(edge.b) }));
    const keptPorts = ports.filter((port) => keep[port.room]).map((port) => {
      const kept = { ...port, room: newId.get(port.room) };
      if (sealed.get(port.room)?.has(port.id)) {
        kept.state = 'capped';
        kept.hasOpening = false;
      }
      return kept;
    });
    rooms.splice(0, rooms.length, ...keptRooms);
    edges.splice(0, edges.length, ...keptEdges);
    ports.splice(0, ports.length, ...keptPorts);
    record(2, `移除 ${removedBranches} 条只含通道的支路，共 ${removedPieces} 个片段，并封闭相应门洞。`,
      null, null, null, { kind: 'prune', removedPieces, removedBranches });
  }

  function finish(ctx) {
    if (ctx.state.roomCount !== ctx.state.roomTarget) return false;
    pruneCorridorBranches(ctx);
    return previous.finish(ctx);
  }

  GrowthCatalog.register('ruleset', {
    ...previous, key: undefined, version: '1.2.0', name: '按房间数生成 · 裁剪通道支路',
    description: '扩建结束后，保留起点到每间房的完整路径，裁掉仅含通道的子树并封闭断开的门洞。',
    finish,
  });
})();
