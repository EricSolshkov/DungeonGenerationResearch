(() => {
  'use strict';

  const previous = GrowthCatalog.get('ruleset', 'stronghold-room-count@1.0.0');

  function start({ pool, random, attempt, state }) {
    const id = random() < .5 ? 'start' : 'spiralStairsUp';
    const stairs = pool.pieces[id];
    const facing = ['n', 'e', 's', 'w'][Math.floor(random() * 4)];
    const entry = stairs.connectors.find((port) => port.id === 'entry');
    const exit = stairs.connectors.find((port) => port.id === 'forward');
    const retry = attempt > 1 ? `第 ${attempt} 次布局。` : '';
    return {
      id, role: 'start', position: [stairs.w / 2, 0, stairs.d / 2], facing,
      message: `${retry}进入起始螺旋楼梯，从 Y=${entry.y} ${exit.y > entry.y ? '上升' : '下降'}到 Y=${exit.y}。本轮目标 ${state.roomTarget} 间房，含 1 间末地传送门房。`,
    };
  }

  GrowthCatalog.register('ruleset', {
    ...previous, key: undefined, version: '1.1.0', name: '按房间数生成 · 双向起始楼梯',
    description: '从起始螺旋楼梯的高端或低端开始扩建，达到目标房间数时以唯一的传送门房收尾。',
    requiredConnectors: { ...previous.requiredConnectors, spiralStairsUp: ['forward'] }, start,
  });
})();
