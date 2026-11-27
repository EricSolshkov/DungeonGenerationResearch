(() => {
  'use strict';

  const algorithms = {
    dead: {
      title: '死亡细胞', short: '约束图与模板', accent: '#f094a4', icon: 'layers',
      projection: 'side', view: '侧视剖面',
      summary: '先规定主路、支路和房间职责，再为每个节点挑选符合门位的预制片段。',
      phases: [
        ['规划主路径', '在侧视平面安置入口、出口和高低交错的主路。'],
        ['添加探索支路', '为宝藏和隐藏区域预留可选路线。'],
        ['匹配房间模板', '按房间用途和所需门位筛选模板，再用种子选择。'],
        ['开通门洞', '沿侧视轮廓挤出房间，通过通道和竖井连接。'],
      ],
      sources: [['Sébastien Bénard · Dead Cells 的关卡设计', 'https://deepnight.net/tutorial/the-level-design-of-dead-cells-a-hybrid-approach/']],
    },
    minecraft: {
      title: 'Minecraft', variant: '试炼密室', short: '试炼密室 / 要塞', accent: '#80d5a4', icon: 'blocks',
      projection: 'space', view: '方块剖面',
      summary: '从入口的连接器出发，按权重挑选、旋转并贴合三维模块，避开已占空间。',
      phases: [
        ['初始化连接器', '入口模板暴露连接器，并指定各门位的模板池。'],
        ['旋转与试放', '从队列取出连接器，旋转候选模板并检测碰撞。'],
        ['封闭剩余接口', '处理无匹配项和达到生长限制的门位。'],
        ['连通结构', '将已配对的门位连成通廊，跨层连接按台阶呈现。'],
      ],
      sources: [
        ['Microsoft Learn · Jigsaw 结构入门', 'https://learn.microsoft.com/en-us/minecraft/creator/documents/structures/introductiontojigsawstructures?view=minecraft-bedrock-stable'],
        ['Mojang · 试炼密室开发日志', 'https://www.minecraft.net/en-us/article/chamber-secrets'],
      ],
    },
    stronghold: {
      title: 'Minecraft', variant: '要塞', group: 'minecraft', accent: '#aac3ec',
      projection: 'space', view: '多层剖面',
      summary: '按 Java 版 1.17.1 的片段尺寸、门位和抽取规则，从螺旋楼梯扩建要塞。输入的是实验室布局种子，坐标以起始楼梯底面为高度零点。',
      phases: [
        ['安置起始楼梯', '随机选择朝向，从楼梯底部优先接入五向交叉厅。'],
        ['逐门扩建', '随机取出待扩建片段，从启用的门位试放。常规候选失败时，检查能否放置填充短廊。'],
        ['追踪传送门路线', '沿父子片段回溯到入口，检查生成树上是否有被墙挡住的门位。'],
        ['检查对接结果', '汇总已配对的门位、终止扩建的出口与入口至传送门的距离。'],
      ],
      sources: [
        ['Mojang · Java 版 1.17.1', 'https://www.minecraft.net/en-us/article/minecraft-java-edition-1-17-1'],
        ['Fabric Yarn · Java 1.17.1 要塞片段', 'https://maven.fabricmc.net/docs/yarn-1.17.1+build.64/net/minecraft/structure/StrongholdGenerator.html'],
        ['FeatureUtils · 要塞片段选择与回退', 'https://github.com/KaptainWutax/FeatureUtils/blob/master/src/main/java/kaptainwutax/featureutils/structure/generator/structure/StrongholdGenerator.java'],
      ],
    },
    'connector-growth': {
      title: '连接器生长', short: '规则集与模板池', accent: '#78d6cc', icon: 'route',
      projection: 'space', view: '三维剖面',
      summary: '从起始片段的出口扩建，用同一种子对照不同规则集和模板池的生成过程。',
      phases: [
        ['安置起点', '确定起始片段的位置、朝向和首批连接。'],
        ['逐门扩建', '按规则取出待扩建片段，将候选入口对齐出口并检查占用。'],
        ['验证目标', '由规则集检查生成条件，回放对目标的验证。'],
        ['汇总结果', '查看规则集给出的布局结果。'],
      ],
      sources: [],
    },
    isaac: {
      title: '以撒的结合', short: '网格队列生长', accent: '#b6a0ff', icon: 'grid',
      projection: 'plan', view: '平面挤出',
      summary: '从中心向四邻格扩张。普通房间只接触一个已占格，特殊房间则从末端选择。',
      phases: [
        ['设置起始格', '从网格中心建立队列，并抽取这一层的房间预算。'],
        ['向四邻格生长', '逐格检查邻接，只接纳恰好接触一个已占格的候选。'],
        ['分配末端房间', '优先把首领放在距入口最远的末端，其余末端用于宝藏和商店。'],
        ['揭示隐藏房', '从接触多个房间的空格挑选隐藏房，再生成墙面与门洞。'],
      ],
      sources: [
        ['Florian Himsl · 原版以撒房间生成讲解', 'https://www.youtube.com/watch?v=1-HIA6-LBJc'],
        ['BorisTheBrave · 结合开发者访谈的算法考证', 'https://www.boristhebrave.com/2020/09/12/dungeon-generation-in-binding-of-isaac/'],
      ],
    },
    gungeon: {
      title: '挺进地牢', short: '流程图与环路', accent: '#f4c378', icon: 'route',
      projection: 'plan', view: '平面挤出',
      summary: '先定义关卡行进顺序，安插一条能回到主路的奖励支路，再选用带兼容门位的房间。',
      phases: [
        ['建立关卡流程', '布置主路线、交汇点与首领房。'],
        ['编织奖励环路', '从主路分岔，经过宝藏后接回交汇点。'],
        ['填入房间模板', '根据节点用途与门位，从不同尺寸的模板中抽取。'],
        ['打通回路', '打开连接通道，保留奖励路线的回程。'],
      ],
      sources: [
        ['Dodge Roll · 手工房间与程序化楼层', 'https://blog.playstation.com/2014/12/06/enter-the-gungeon-coming-to-ps4-in-2015/'],
        ['Brent Sodman · 奖励环路访谈', 'https://videogamesuncovered.com/features/vgu-interviews-enter-the-gungeon/'],
      ],
    },
  };

  const roles = {
    start: { name: '入口', color: '#59e5b7' },
    normal: { name: '普通房', color: '#7d9fff' },
    reward: { name: '宝藏', color: '#ffc571' },
    boss: { name: '首领', color: '#f888a0' },
    exit: { name: '出口', color: '#bb9cff' },
    shop: { name: '商店', color: '#62d9ed' },
    secret: { name: '隐藏房', color: '#cb8af5' },
    library: { name: '图书馆', color: '#d4b08c' },
    portal: { name: '末地传送门房', color: '#b89cff' },
  };
  const portalRoute = { name: '传送门路线', color: '#ffc878' };

  const directions = ['n', 'e', 's', 'w'];
  const offsets = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
  const opposite = { n: 's', e: 'w', s: 'n', w: 'e', up: 'down', down: 'up' };
  const sourceId = (room) => room.sourceId ?? room.id;
  const label = (room) => `R${String(sourceId(room) + 1).padStart(2, '0')}`;

  function roomInFrame(room, frame) {
    const originalId = sourceId(room);
    return frame.rooms.find((candidate) => sourceId(candidate) === originalId);
  }

  function randomFor(seed) {
    let state = 2166136261;
    for (const character of seed) {
      state = Math.imul(state ^ character.codePointAt(0), 16777619);
    }
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let value = Math.imul(state ^ (state >>> 15), state | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  const pick = (items, random) => items[Math.floor(random() * items.length)];
  const chance = (random, probability) => random() < probability;

  function shuffled(items, random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
  }

  function sideBetween(a, b, projection) {
    if (a.x !== b.x) return a.x < b.x ? 'e' : 'w';
    if (projection === 'side') return a.y < b.y ? 'up' : 'down';
    return a.z < b.z ? 's' : 'n';
  }

  function port(room, side) {
    const point = [room.x, room.y, room.z];
    if (side === 'up') point[1] += room.h;
    if (offsets[side]) {
      point[0] += offsets[side][0] * room.w / 2;
      point[2] += offsets[side][1] * room.d / 2;
    }
    return point;
  }

  function connectionPath(a, b, edge, projection) {
    if (edge.aPoint && edge.bPoint) return [edge.aPoint, edge.bPoint];
    const start = port(a, edge.aSide);
    const end = port(b, edge.bSide);
    if (projection === 'side' && start[0] !== end[0] && start[1] !== end[1]) {
      const middle = (start[0] + end[0]) / 2;
      return [start, [middle, start[1], start[2]], [middle, end[1], end[2]], end];
    }
    return [start, end];
  }

  class Layout {
    constructor(id) {
      this.id = id;
      this.projection = algorithms[id].projection;
      this.rooms = [];
      this.edges = [];
      this.frames = [];
      this.ports = [];
    }

    add(x, y, z, role = 'normal', details = {}) {
      const room = { id: this.rooms.length, x, y, z, role, w: 6.6, h: 3.2, d: 5.5, shell: false, template: '', ...details };
      this.rooms.push(room);
      return room;
    }

    join(a, b, extra = {}) {
      const aSide = sideBetween(a, b, this.projection);
      const edge = { a: a.id, b: b.id, aSide, bSide: opposite[aSide], open: false, ...extra };
      this.edges.push(edge);
      return edge;
    }

    roomSides(room) {
      return this.edges.flatMap((edge) => {
        if (edge.a === room.id) return [edge.aSide];
        if (edge.b === room.id) return [edge.bSide];
        return [];
      });
    }

    record(phase, message, focus = null, candidate = null) {
      this.frames.push({
        phase, message, focus, candidate,
        rooms: this.rooms.map((room) => ({ ...room })),
        edges: this.edges.map((edge) => ({ ...edge })),
        ports: this.ports.map((entry) => ({ ...entry })),
      });
    }

    open(phase, endMessage) {
      for (const [index, edge] of this.edges.entries()) {
        edge.open = true;
        const a = this.rooms[edge.a];
        const b = this.rooms[edge.b];
        const change = edge.hidden ? '隐藏门洞' : a.y !== b.y ? '跨层通道' : '门洞';
        this.record(phase, index === this.edges.length - 1 ? endMessage : `${label(a)} 与 ${label(b)} 的${change}已连通。`, b.id);
      }
    }
  }

  const deadTemplates = [
    { name: '拱廊', w: 7.55, h: 4.55, d: 5.15, doors: ['w', 'e'], roles: ['start', 'normal', 'exit'] },
    { name: '平台厅', w: 8.65, h: 5.15, d: 5.8, doors: ['w', 'e', 'up'], roles: ['normal', 'start'] },
    { name: '回廊', w: 7.9, h: 4.2, d: 5.35, doors: ['w', 'e', 'down'], roles: ['normal', 'exit'] },
    { name: '竖井厅', w: 6.85, h: 5, d: 5.15, doors: ['w', 'e', 'down', 'up'], roles: ['normal'] },
    { name: '储藏阁', w: 6.55, h: 4.5, d: 5, doors: ['w', 'e', 'down'], roles: ['normal', 'reward'] },
    { name: '藏室', w: 6.5, h: 3.85, d: 4.7, doors: ['w', 'e', 'up'], roles: ['secret', 'reward'] },
  ];

  const gungeonTemplates = [
    { name: '前厅', w: 6.8, d: 6.8, h: 2.45, doors: ['n', 'e', 's', 'w'], roles: ['start', 'normal'] },
    { name: '四柱厅', w: 8.25, d: 7.7, h: 2.65, doors: ['n', 'e', 's', 'w'], roles: ['normal'] },
    { name: '长廊厅', w: 8.5, d: 5.15, h: 2.4, doors: ['n', 'e', 'w'], roles: ['normal'] },
    { name: '侧室', w: 5.7, d: 7.8, h: 2.8, doors: ['n', 's', 'w'], roles: ['normal'] },
    { name: '宝库', w: 6.7, d: 7, h: 2.9, doors: ['n', 'e', 'w'], roles: ['reward'] },
    { name: '补给间', w: 6.15, d: 6.2, h: 2.5, doors: ['s'], roles: ['shop'] },
    { name: '试炼厅', w: 9.3, d: 8.8, h: 3.3, doors: ['w'], roles: ['boss'] },
  ];

  function rotate(side, turns) {
    return directions[(directions.indexOf(side) + turns) % directions.length];
  }

  function matchRooms(layout, templates, random, phase, turnable = false) {
    for (const room of layout.rooms) {
      const sides = layout.roomSides(room);
      const compatible = [];
      for (const template of templates) {
        if (!template.roles.includes(room.role)) continue;
        const rotations = turnable ? [0, 1, 2, 3] : [0];
        for (const turns of rotations) {
          const doors = turnable ? template.doors.map((side) => rotate(side, turns)) : template.doors;
          if (sides.every((side) => doors.includes(side))) compatible.push({ template, turns });
        }
      }
      const { template, turns } = pick(compatible, random);
      const swap = turns % 2 === 1;
      Object.assign(room, { w: swap ? template.d : template.w, d: swap ? template.w : template.d, h: template.h, template: template.name, shell: true, variant: Math.floor(random() * 3) });
      layout.record(phase, `${label(room)} 匹配「${template.name}」，保留 ${sides.length} 个所需门位。`, room.id);
    }
  }

  function buildDead(layout, random) {
    const profile = pick([
      [0, 0, 1, 1, 0, 0, 1],
      [0, 1, 1, 0, 0, 1, 1],
      [0, 0, -1, -1, 0, 1, 1],
      [0, -1, -1, 0, 1, 1, 0],
    ], random);
    const track = [];
    const addSlot = (column, level, role) => layout.add(column * 10.3, level * 7.4, 0, role, { h: 4.5 });
    for (const [column, level] of profile.entries()) {
      const role = column === 0 ? 'start' : column === profile.length - 1 ? 'exit' : 'normal';
      const room = addSlot(column, level, role);
      if (track.length) layout.join(track.at(-1), room);
      track.push(room);
      layout.record(0, column === 0 ? '锚定侧视关卡的入口。' : `主路径加入 ${label(room)} · ${roles[role].name}。`, room.id);
    }

    const elevation = Math.max(...profile) + 1;
    const top = pick([2, 3], random);
    let parent = track[top];
    for (let level = profile[top] + 1; level <= elevation; level += 1) {
      const room = addSlot(top, level, 'normal');
      layout.join(parent, room);
      layout.record(1, `从主路向上留出 ${label(room)} 的竖井连接。`, room.id);
      parent = room;
    }
    const reward = addSlot(top + 1, elevation, 'reward');
    layout.join(parent, reward);
    layout.record(1, `在上层支路末端预留宝藏 ${label(reward)}。`, reward.id);

    const lower = pick([4, 5], random);
    const underground = Math.min(profile[lower], profile[lower - 1]) - 1;
    parent = track[lower];
    for (let level = profile[lower] - 1; level >= underground; level -= 1) {
      const room = addSlot(lower, level, 'normal');
      layout.join(parent, room);
      layout.record(1, `向下延伸到 ${label(room)}，形成低处支路。`, room.id);
      parent = room;
    }
    const secret = addSlot(lower - 1, underground, 'secret');
    layout.join(parent, secret, { hidden: true });
    layout.record(1, `为下层末端 ${label(secret)} 标记隐藏房用途。`, secret.id);
    matchRooms(layout, deadTemplates, random, 2);
    layout.open(3, '所有主路与支路已连通。侧视轮廓已沿深度方向挤出。');
  }

  const jigsawTemplates = [
    { name: '直线通廊', pool: 'hall', weight: 5, w: 7.5, d: 4.5, h: 3.1, exits: [['e', 'hall'], ['n', 'wing']] },
    { name: '折角通廊', pool: 'hall', weight: 4, w: 5.8, d: 6.2, h: 3.35, exits: [['s', 'hall'], ['e', 'wing']] },
    { name: '上层接驳厅', pool: 'hall', weight: 4, w: 6.2, d: 5.1, h: 3.5, exits: [['e', 'hall', 4.6], ['s', 'wing']] },
    { name: '下层接驳厅', pool: 'hall', weight: 3, w: 5.7, d: 5.1, h: 3.4, exits: [['e', 'hall', -4.6], ['n', 'wing']] },
    { name: '三向大厅', pool: 'hall', weight: 5, w: 8.7, d: 7.5, h: 4.1, exits: [['e', 'hall'], ['n', 'wing'], ['s', 'wing']] },
    { name: '铜柱试炼厅', pool: 'wing', weight: 5, w: 8.1, d: 7.9, h: 4.4, exits: [['e', 'hall']] },
    { name: '阶梯密室', pool: 'wing', weight: 3, w: 7.1, d: 6.6, h: 4.2, exits: [['n', 'hall', 4.6]] },
    { name: '窄储藏间', pool: 'wing', weight: 3, w: 5, d: 4.5, h: 3.05, exits: [] },
  ];

  function weightedOrder(candidates, random) {
    return candidates.map((item) => ({ item, score: -Math.log(1 - random()) / item.weight }))
      .sort((a, b) => a.score - b.score).map(({ item }) => item);
  }

  const box = (room) => [room.x - room.w / 2, room.y - .34, room.z - room.d / 2, room.x + room.w / 2, room.y + room.h, room.z + room.d / 2];
  const intersects = (a, b) => [0, 1, 2].every((axis) => a[axis] < b[axis + 3] - 0.03 && a[axis + 3] > b[axis] + 0.03);

  function connectorVolume(a, b, edge) {
    const start = port(a, edge.aSide);
    const end = port(b, edge.bSide);
    const padX = start[0] === end[0] ? 1.15 : 0;
    const padZ = start[2] === end[2] ? 1.15 : 0;
    return [Math.min(start[0], end[0]) - padX, Math.min(start[1], end[1]) - .5, Math.min(start[2], end[2]) - padZ,
      Math.max(start[0], end[0]) + padX, Math.max(start[1], end[1]) + 2.35, Math.max(start[2], end[2]) + padZ];
  }

  function buildMinecraft(layout, random) {
    const root = layout.add(0, 0, 0, 'start', { w: 8.4, d: 7.4, h: 3.75, template: '入口中庭', shell: true, depth: 0 });
    const heading = Math.floor(random() * 4);
    const queue = [[rotate('e', heading), 'hall', 4.6], [rotate('n', heading), 'hall', 0], [rotate('s', heading), 'wing', 0]]
      .map(([side, pool, rise]) => ({ room: root.id, side, pool, rise, state: 'waiting' }));
    const volumes = [box(root)];
    layout.ports = [...queue];
    layout.record(0, '入口中庭准备就绪，已暴露 3 个待拼接接口。', root.id);

    const limit = 15 + Math.floor(random() * 3);
    const deferred = [];
    for (let cursor = 0; cursor < queue.length && layout.rooms.length < limit; cursor += 1) {
      const entry = queue[cursor];
      const parent = layout.rooms[entry.room];
      if (parent.depth >= 4) { deferred.push(entry); continue; }
      const [dx, dz] = offsets[entry.side];
      const options = weightedOrder(jigsawTemplates.filter((item) => item.pool === entry.pool), random);
      const turn = (directions.indexOf(opposite[entry.side]) - directions.indexOf('w') + 4) % 4;
      const gap = entry.rise ? 5.6 : 2.05;
      let attached = false;
      let showedCollision = false;
      for (const template of options) {
        const w = turn % 2 ? template.d : template.w;
        const d = turn % 2 ? template.w : template.d;
        const candidate = {
          x: parent.x + dx * ((parent.w + w) / 2 + gap), y: parent.y + entry.rise,
          z: parent.z + dz * ((parent.d + d) / 2 + gap), w, d, h: template.h,
        };
        const edge = { aSide: entry.side, bSide: opposite[entry.side] };
        const corridor = connectorVolume(parent, candidate, edge);
        if (Math.abs(candidate.y) > 9.3 || volumes.some((bounds) => intersects(box(candidate), bounds) || intersects(corridor, bounds))) {
          if (!showedCollision) layout.record(1, `试放「${template.name}」触及占用空间或高度限制，继续抽取。`, parent.id, candidate);
          showedCollision = true;
          continue;
        }
        const room = layout.add(candidate.x, candidate.y, candidate.z, 'normal', {
          ...candidate, depth: parent.depth + 1, shell: true, template: template.name, variant: turn,
        });
        layout.join(parent, room, edge);
        volumes.push(box(room), corridor);
        entry.state = 'matched';
        for (const [side, pool, rise = 0] of template.exits) {
          const next = { room: room.id, side: rotate(side, turn), pool, rise, state: 'waiting' };
          layout.ports.push(next);
          queue.push(next);
        }
        layout.record(1, `接入 ${label(room)}「${template.name}」，旋转 ${turn * 90}° 后匹配。`, room.id);
        attached = true;
        break;
      }
      if (!attached) deferred.push(entry);
    }

    const remaining = [...new Set([...deferred, ...queue.filter((entry) => entry.state === 'waiting')])];
    while (remaining.length) {
      const entries = remaining.splice(0, 3);
      for (const entry of entries) entry.state = 'capped';
      layout.record(2, `封闭 ${entries.length} 个未配对的连接器。`, entries[0].room);
    }
    if (layout.frames.at(-1).phase !== 2) layout.record(2, '连接器检查完成，所有待拼接门位均已处理。');
    const reward = [...layout.rooms].sort((a, b) => b.depth - a.depth || b.w * b.d - a.w * a.d)[0];
    if (reward !== root) reward.role = 'reward';
    layout.open(3, `拼装完成，共放置 ${layout.rooms.length} 个三维模块。`);
  }

  const cellKey = (x, z) => `${x},${z}`;
  const neighbors = ({ x, z }) => directions.map((side) => ({ x: x + offsets[side][0], z: z + offsets[side][1], side }));
  const onGrid = ({ x, z }) => x >= -4 && x <= 4 && z >= -4 && z <= 4;

  // Stronghold pieces and connector records are immutable after insertion. Copy the
  // arrays per frame and replace the few records whose state changes during replay.
  class StrongholdLayout extends Layout {
    record(phase, message, focus = null, candidate = null, focusPort = null) {
      this.frames.push({
        phase, message, focus, candidate, focusPort,
        rooms: this.rooms.slice(), edges: this.edges.slice(), ports: this.ports.slice(),
      });
    }
  }

  const strongholdBox = (r) => [r.x - r.w / 2, r.y, r.z - r.d / 2, r.x + r.w / 2, r.y + r.h, r.z + r.d / 2];
  const localPort = (c) => [c.x, c.y, c.z];
  const sideNames = { n: '北', e: '东', s: '南', w: '西' };

  function growStronghold(layout, random, attempt) {
    const { pieces, pool, instantiate, worldPoint, worldSide } = globalThis.StrongholdTemplates;
    const facing = pick(directions, random);
    const start = layout.add(2.5, 0, 2.5, 'start', {
      ...instantiate('start', random, { facing }), facing, w: 5, h: 11, d: 5,
      entryY: 7, level: 0, depth: 0, shell: true,
    });
    const volumes = [strongholdBox(start)];
    const counts = new Map();
    const pending = [];
    const portIndices = new Map();
    let previous = null;

    function collisionIndex(room) {
      const bounds = strongholdBox(room);
      return volumes.findIndex((volume) => intersects(bounds, volume));
    }

    function registerPorts(room) {
      const indices = [];
      for (const c of room.connectors) {
        const state = c.id === 'entry' ? (room.parent === undefined ? 'entrance' : 'matched')
          : !c.active ? 'inactive' : room.templateId === 'filler' ? 'terminal' : 'waiting';
        const entry = {
          room: room.id, id: c.id, label: c.label, side: worldSide(room.facing, c.side),
          local: localPort(c), point: worldPoint(room, localPort(c)), state, hasOpening: c.hasOpening,
        };
        indices.push(layout.ports.length);
        layout.ports.push(entry);
      }
      portIndices.set(room.id, indices);
    }

    registerPorts(start);
    layout.record(0, (attempt > 1 ? `前 ${attempt - 1} 次布局没有传送门房，重新生成。` : '') +
      `起始螺旋楼梯朝${sideNames[facing]}，从 Y=7 的上门降至 Y=1 的前门。`, start.id);

    // Work with continuous block faces, so neighbouring voxel boxes touch exactly.
    // Only accepted pieces draw random numbers for their doors, variants and exits.
    function align(piece, exit, options) {
      const lateral = exit.side === 'e' || exit.side === 'w';
      const d = options.length ?? piece.d;
      const h = options.short ? 6 : piece.h;
      const candidate = {
        x: 0, y: 0, z: 0, facing: exit.side, w: lateral ? d : piece.w, d: lateral ? piece.w : d, h,
        localW: piece.w, localH: h, localD: d,
      };
      const entry = piece.connectors.find((c) => c.id === 'entry');
      const point = worldPoint(candidate, localPort(entry));
      [candidate.x, candidate.y, candidate.z] = exit.point.map((v, i) => v - point[i]);
      candidate.level = Math.floor((start.entryY - exit.point[1]) / 6);
      return candidate;
    }

    function extend(parent, index) {
      const exit = layout.ports[index];
      const phase = parent === start ? 0 : 1;
      const depth = parent.depth + 1;
      const [x, y, z] = exit.point;
      let reported = false;

      function skip(reason, piece, candidate) {
        if (reported) return;
        reported = true;
        const prefix = piece ? `试放「${piece.name}」` : '';
        layout.record(phase, `${label(parent)} · ${exit.label}（Y=${y}）${prefix}${reason}。`, parent.id, candidate, exit);
      }

      function place(piece, candidate, options = {}, contactRoom) {
        const data = instantiate(piece.id, random, { ...options, facing: exit.side });
        const role = piece.id === 'portal' ? 'portal' : piece.id === 'library' ? 'library' : 'normal';
        const room = layout.add(candidate.x, candidate.y, candidate.z, role, {
          ...candidate, ...data, depth, parent: parent.id, shell: true, entryY: y,
          ...(contactRoom === undefined ? {} : { contactRoom }),
        });
        const entry = room.connectors.find((c) => c.id === 'entry');
        layout.join(parent, room, {
          aSide: exit.side, bSide: opposite[exit.side], aConnectorId: exit.id, bConnectorId: entry.id,
          aPoint: exit.point, bPoint: worldPoint(room, localPort(entry)), doorType: room.doorType,
          obstructed: exit.hasOpening === false, open: true,
        });
        const matched = { ...exit, state: 'matched' };
        layout.ports[index] = matched;
        registerPorts(room);
        volumes.push(strongholdBox(room));
        pending.push(room);
        const prefix = parent === start ? '优先试放五向交叉厅。' : '';
        let annotation = '';
        if (room.templateId === 'filler') annotation = ` 五次抽取后回退，短廊长 ${room.localD} 格，尽头接近 ${label(layout.rooms[contactRoom])} 的墙面。`;
        else if (options.short) annotation = ' 双层高度受阻，改放单层图书馆。';
        else if (room.templateId === 'straight' || room.templateId === 'fiveCrossing') {
          const exits = room.connectors.filter((c) => c.id !== 'entry');
          annotation = ` 本次启用 ${exits.filter((c) => c.active).length}/${exits.length} 个出口。`;
        }
        layout.record(phase, `${prefix}${label(parent)} 的${exit.label}（${exit.local.join(', ')}）接入朝${sideNames[room.facing]}的 ${label(room)}「${room.template}」，门槛 Y=${y}。${annotation}`, room.id, null, matched);
      }

      function tryPiece(piece) {
        const options = {};
        let candidate = align(piece, exit, options);
        // The unshifted source stair starts at game Y=64 in Java 1.17.1.
        if (candidate.y + 64 <= 10) {
          skip('低于片段生成高度', piece, candidate);
          return false;
        }
        let occupied = collisionIndex(candidate);
        if (occupied >= 0 && piece.id === 'library') {
          options.short = true;
          candidate = align(piece, exit, options);
          occupied = collisionIndex(candidate);
        }
        if (occupied >= 0) {
          skip(`与 ${label(layout.rooms[occupied])} 重叠，继续筛选`, piece, candidate);
          return false;
        }
        place(piece, candidate, options);
        return true;
      }

      function tryFiller() {
        const piece = pieces.filler;
        const probe = align(piece, exit, { length: 4 });
        const contact = collisionIndex(probe);
        if (contact < 0 || volumes[contact][1] !== probe.y || probe.y + 64 <= 1) return false;
        for (let length = 3; length >= 2; length -= 1) {
          const prefix = align(piece, exit, { length: length - 1 });
          if (intersects(strongholdBox(prefix), volumes[contact])) continue;
          // Vanilla permits the last slice to reach the target wall. Wall contact
          // alone does not prove that the two interiors are traversable.
          place(piece, align(piece, exit, { length }), { length }, contact);
          return true;
        }
        return false;
      }

      // Vanilla tests the next piece's doorway anchor (the first block in its
      // three-wide opening) against the source stair's minimum X/Z.
      const footX = exit.side === 'e' ? x : exit.side === 'w' ? x - 1 : x - 1.5;
      const footZ = exit.side === 's' ? z : exit.side === 'n' ? z - 1 : z - 1.5;
      let stop;
      if (parent.depth > 50) stop = '父片段已超过第 50 代';
      else if (Math.abs(footX - volumes[0][0]) > 112 || Math.abs(footZ - volumes[0][2]) > 112) stop = '门位超出起点水平 112 格的范围';
      else {
        const available = pool.filter((p) => (counts.get(p.id) ?? 0) < p.maxCount);
        if (!available.some((p) => Number.isFinite(p.maxCount))) stop = '有次数上限的片段均已用尽';
        else {
          // The imposed first crossing does not consume a weighted pool slot.
          if (parent === start && tryPiece(pieces.fiveCrossing)) return;
          const total = available.reduce((sum, p) => sum + p.weight, 0);
          for (let draw = 0; draw < 5; draw += 1) {
            let ticket = Math.floor(random() * total);
            for (const p of available) {
              ticket -= p.weight;
              if (ticket >= 0) continue;
              if (p === previous || depth < p.minDepth) {
                const reason = p === previous ? '与上一个加权选中的类型相同，重新抽取'
                  : `需要第 ${p.minDepth} 代才能出现，当前为第 ${depth} 代`;
                skip(reason, p);
                break;
              }
              if (tryPiece(p)) {
                counts.set(p.id, (counts.get(p.id) ?? 0) + 1);
                previous = p;
                return;
              }
              // A colliding candidate falls through to the next pool entry.
            }
          }
          if (tryFiller()) return;
          stop = '五次加权抽取均未放置片段，附近也没有合适的填充短廊位置';
        }
      }
      const capped = { ...exit, state: 'capped' };
      layout.ports[index] = capped;
      layout.record(phase, `${label(parent)} · ${exit.label}结束扩建。${stop}。`, parent.id, null, capped);
    }

    function extendRoom(room) {
      for (const index of portIndices.get(room.id)) {
        if (layout.ports[index].state === 'waiting') extend(room, index);
      }
    }
    extendRoom(start);
    while (pending.length) {
      const [room] = pending.splice(Math.floor(random() * pending.length), 1);
      extendRoom(room);
    }
  }

  function buildStronghold(layout, random) {
    for (let attempt = 1; ; attempt += 1) {
      const trial = new StrongholdLayout(layout.id);
      growStronghold(trial, random, attempt);
      const portal = trial.rooms.find((room) => room.role === 'portal');
      if (!portal) continue;
      trial.record(2, `找到 ${label(portal)}「${portal.template}」，门槛位于 Y=${portal.entryY}，沿父片段回溯。`, portal.id);
      let obstructed = 0;
      for (let next = portal; next.parent !== undefined; next = trial.rooms[next.parent]) {
        const edgeIndex = next.id - 1; // Every accepted child appends exactly one edge.
        const edge = trial.edges[edgeIndex];
        trial.edges[edgeIndex] = { ...edge, toPortal: true };
        const parent = trial.rooms[next.parent];
        const door = parent.connectors.find((c) => c.id === edge.aConnectorId);
        if (edge.obstructed) obstructed += 1;
        const barrier = edge.obstructed ? ' 此处有子片段，但五向交叉厅的墙面没有对应开口。' : '';
        trial.record(2, `从 ${label(next)} 的入口回到 ${label(parent)} 的${door.label}（Y=${edge.aPoint[1]}）。${barrier}`, parent.id);
      }
      const capped = trial.ports.filter((p) => p.state === 'capped').length;
      const barrier = obstructed ? `，其中 ${obstructed} 处被墙面阻隔` : '';
      trial.record(3, `要塞共 ${trial.rooms.length} 个片段，${trial.edges.length} 对门位相接，${capped} 个启用的出口终止扩建。入口到传送门的生成树路线经过 ${portal.depth} 次连接${barrier}。`, portal.id);
      Object.assign(layout, trial);
      return;
    }
  }

  function isaacPlan(target, random) {
    for (let attempt = 0; ; attempt += 1) {
      const start = { x: 0, z: 0, depth: 0, children: 0, parent: -1 };
      const cells = [start];
      const used = new Map([[cellKey(0, 0), start]]);
      for (let index = 0; index < cells.length && cells.length < target; index += 1) {
        const parent = cells[index];
        for (const next of shuffled(neighbors(parent), random)) {
          const key = cellKey(next.x, next.z);
          if (!onGrid(next) || used.has(key)) continue;
          if (neighbors(next).filter(({ x, z }) => used.has(cellKey(x, z))).length !== 1) continue;
          if (!chance(random, index === 0 ? 0.72 : 0.63) && attempt < 80) continue;
          const cell = { ...next, depth: parent.depth + 1, children: 0, parent: index };
          used.set(key, cell);
          cells.push(cell);
          parent.children += 1;
          if (cells.length === target) break;
        }
      }
      const leaves = cells.filter((cell) => cell.parent >= 0 && !cell.children).sort((a, b) => b.depth - a.depth);
      if (cells.length !== target || leaves.length < 3) continue;
      const secretCandidates = [];
      for (let x = -4; x <= 4; x += 1) {
        for (let z = -4; z <= 4; z += 1) {
          if (used.has(cellKey(x, z))) continue;
          const adjacent = neighbors({ x, z }).map((cell) => used.get(cellKey(cell.x, cell.z))).filter(Boolean);
          if (adjacent.length >= 2 && !adjacent.includes(leaves[0])) secretCandidates.push({ x, z, adjacent });
        }
      }
      if (!secretCandidates.length) continue;
      const secret = shuffled(secretCandidates, random).sort((a, b) => b.adjacent.length - a.adjacent.length)[0];
      return { cells, leaves, secret };
    }
  }

  function buildIsaac(layout, random) {
    const target = 13 + Math.floor(random() * 5);
    const { cells, leaves, secret } = isaacPlan(target, random);
    const place = ({ x, z }, role) => layout.add(x * 9.2, 0, z * 7.8, role, { w: 7.7, d: 6.3, h: 2.65, shell: true, template: '单格房间', variant: Math.floor(random() * 3) });
    for (const [index, cell] of cells.entries()) {
      const room = place(cell, index === 0 ? 'start' : 'normal');
      if (index === 0) {
        layout.record(0, `中心格入队。本轮目标为 ${target} 个常规格。`, room.id);
        continue;
      }
      const parent = layout.rooms[cell.parent];
      layout.join(parent, room).open = true;
      layout.record(1, `从 ${label(parent)} 接纳 ${label(room)}，候选格恰好只有一个已占邻居。`, room.id);
    }
    const destinations = [leaves[0], ...shuffled(leaves.slice(1), random).slice(0, 2)];
    const specialRoles = ['boss', 'reward', 'shop'];
    for (const [index, role] of specialRoles.entries()) {
      const cell = destinations[index];
      const room = layout.rooms[cells.indexOf(cell)];
      room.role = role;
      layout.record(2, `${label(room)} 分配为${roles[role].name}，距离入口 ${cell.depth} 次连接。`, room.id);
    }
    const room = place(secret, 'secret');
    layout.record(3, `${label(room)} 接触 ${secret.adjacent.length} 个常规房间，选为隐藏房。`, room.id);
    for (const cell of secret.adjacent) {
      const neighbor = layout.rooms[cells.indexOf(cell)];
      layout.join(room, neighbor, { hidden: true, open: true });
      layout.record(3, `揭示 ${label(room)} 与 ${label(neighbor)} 之间的隐藏连接。`, room.id);
    }
  }

  function buildGungeon(layout, random) {
    const ringWidth = pick([2, 3, 4], random);
    const ringHeight = pick([1, 2], random);
    const flip = chance(random, 0.5) ? 1 : -1;
    const turn = chance(random, 0.32);
    const addSlot = (column, row, role) => {
      const x = column * 10.8;
      const z = row * 10.8 * flip;
      return layout.add(turn ? -z : x, 0, turn ? x : z, role, { h: 2.65 });
    };
    const track = [];
    const last = ringWidth + 3;
    for (let column = 0; column <= last; column += 1) {
      const role = column === 0 ? 'start' : column === last ? 'boss' : 'normal';
      const room = addSlot(column, 0, role);
      if (track.length) layout.join(track.at(-1), room);
      track.push(room);
      layout.record(0, column === 0 ? '在流程图上锚定入口。' : `主路线接入 ${label(room)} · ${roles[role].name}。`, room.id);
    }

    const loop = [];
    for (let row = 1; row <= ringHeight; row += 1) loop.push([1, row, 'normal']);
    for (let column = 2; column <= ringWidth + 1; column += 1) {
      loop.push([column, ringHeight, column === ringWidth + 1 ? 'reward' : 'normal']);
    }
    for (let row = ringHeight - 1; row > 0; row -= 1) loop.push([ringWidth + 1, row, 'normal']);
    let parent = track[1];
    for (const [column, row, role] of loop) {
      const room = addSlot(column, row, role);
      layout.join(parent, room, { rewardLoop: true });
      layout.record(1, `奖励支路接入 ${label(room)} · ${roles[role].name}。`, room.id);
      parent = room;
    }
    layout.join(parent, track[ringWidth + 1], { rewardLoop: true });
    layout.record(1, `奖励路线返回 ${label(track[ringWidth + 1])}，形成环路。`, parent.id);
    const shopColumn = pick([2, ringWidth + 2], random);
    const shop = addSlot(shopColumn, -1, 'shop');
    layout.join(track[shopColumn], shop);
    layout.record(1, `主路旁新增补给支线 ${label(shop)}。`, shop.id);
    matchRooms(layout, gungeonTemplates, random, 2, true);
    layout.open(3, '已完成房间和门洞，宝藏支路可以绕回主路线。');
  }

  const builders = { dead: buildDead, minecraft: buildMinecraft, stronghold: buildStronghold, isaac: buildIsaac, gungeon: buildGungeon };

  function generate(id, seed, selection) {
    let layout;
    let metadata = {};
    if (id === 'connector-growth') {
      if (typeof module === 'object' && module.exports) {
        require('./generation/catalog.js');
        require('./generation/driver.js');
      }
      const { ruleset, pool } = globalThis.GrowthCatalog.resolve(selection);
      const random = randomFor(`${seed}/${ruleset.seedDomain ?? id}`);
      layout = globalThis.ConnectorGrowth.run({ ruleset, pool, random, roomTarget: selection?.roomTarget });
      metadata = { viewKind: pool.viewKind || 'space', config: { ruleset: ruleset.key, pool: pool.key },
        completed: layout.completed, attempt: layout.attempt };
      if (ruleset.roomTarget !== undefined) metadata.config.roomTarget = selection?.roomTarget ?? ruleset.roomTarget;
    } else {
      layout = new Layout(id);
      builders[id](layout, randomFor(`${seed}/${id}`));
      if (id === 'stronghold') metadata.viewKind = 'stronghold';
    }
    const final = layout.frames.at(-1);
    if (final.rooms[0]?.sourceId !== undefined) {
      metadata.beforePrune = layout.frames.findLast((frame) => frame.rooms[0]?.sourceId === undefined);
    }
    const framesByPhase = algorithms[id].phases.map((_, phase) => layout.frames.filter((frame) => frame.phase === phase));
    return { id, seed, projection: algorithms[id].projection, framesByPhase, final, ...metadata };
  }

  function stats(frame) {
    const adjacent = frame.rooms.map(() => []);
    for (const { a, b } of frame.edges) {
      adjacent[a].push(b);
      adjacent[b].push(a);
    }
    const reached = new Set();
    let components = 0;
    for (const room of frame.rooms) {
      if (reached.has(room.id)) continue;
      components += 1;
      const frontier = [room.id];
      reached.add(room.id);
      for (const next of frontier) {
        for (const neighbor of adjacent[next]) {
          if (reached.has(neighbor)) continue;
          reached.add(neighbor);
          frontier.push(neighbor);
        }
      }
    }
    const counts = {
      rooms: frame.rooms.length, doors: frame.edges.length,
      branches: adjacent.filter((edges) => edges.length >= 3).length,
      loops: frame.edges.length - frame.rooms.length + components,
    };
    if (frame.rooms.length && frame.rooms.every((room) => room.category === 'corridor' || room.category === 'room')) {
      counts.corridors = frame.rooms.filter((room) => room.category === 'corridor').length;
      counts.rooms -= counts.corridors;
      counts.portals = frame.rooms.filter((room) => room.templateId === 'portal').length;
    }
    return counts;
  }

  globalThis.DungeonGenerators = { algorithms, roles, portalRoute, sourceId, roomInFrame, label, generate, stats, port, connectionPath };
})();
