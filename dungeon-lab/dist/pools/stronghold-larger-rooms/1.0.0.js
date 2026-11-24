(() => {
  'use strict';

  const base = GrowthCatalog.get('pool', 'stronghold-large-rooms@1.0.0');
  const sizes = {
    hall: { w: 25, d: 29 },
    chamber: { w: 27, d: 27 },
    sideRoom: { w: 21, d: 23 },
    library: { w: 29, d: 29 },
    portal: { w: 35, d: 35, h: 30 },
  };

  // All doors stay at the same position along their wall and retain their sill height.
  function resizeDoors(id, doors) {
    const previous = base.pieces[id];
    const { w, d } = sizes[id];
    return doors.map((door) => ({
      ...door, x: door.x / previous.w * w, z: door.z / previous.d * d,
    }));
  }

  const templates = base.templates.map((piece) => sizes[piece.id]
    ? { ...piece, ...sizes[piece.id], connectors: resizeDoors(piece.id, piece.connectors) }
    : piece);

  function measure(id, options) {
    const dimensions = base.measure(id, options);
    return sizes[id] ? { ...dimensions, ...sizes[id] } : dimensions;
  }

  function instantiate(id, random, options) {
    const instance = base.instantiate(id, random, options);
    if (!sizes[id]) return instance;
    const { w, d, h = instance.localH } = sizes[id];
    return { ...instance, localW: w, localH: h, localD: d, connectors: resizeDoors(id, instance.connectors) };
  }

  GrowthCatalog.register('pool', {
    id: 'stronghold-larger-rooms', version: '1.0.0', name: '要塞 · 超大房间',
    description: '普通房间宽深 20–30 米，设一至两扇门，内部留空。末地传送门房平面 35 × 35 米，高 30 米。',
    viewKind: base.viewKind, templates, measure, instantiate,
    worldPoint: base.worldPoint, worldSide: base.worldSide, localSize: base.localSize, doorHeights: base.doorHeights,
  });
})();
