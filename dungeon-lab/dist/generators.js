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
      projection: 'space', view: '原生三维',
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
      summary: '用自制片段和缩小的规模模拟 Java 版要塞内部的生成。由起始楼梯扩张，按权重选取房间，找不到传送门房时重新生成。',
      phases: [
        ['安置起始楼梯', '抽取起始朝向，用下行楼梯接入交叉厅。'],
        ['拓展走廊与楼层', '随机选取待扩展片段，从门位按权重试放新片段，排除空间重叠。'],
        ['追踪传送门路线', '从末地传送门房沿已记录的连接回溯到起点。'],
        ['开通门洞与楼梯', '逐个打开门位，让横向走廊和跨层楼梯形成可漫游的路线。'],
      ],
      sources: [['Mojang · 要塞（Stronghold）', 'https://www.minecraft.net/en-us/article/stronghold']],
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
  const label = (room) => `R${String(room.id + 1).padStart(2, '0')}`;

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

  const strongholdFloorHeight = 5.6;
  const strongholdPieces = [
    { name: '直走廊', weight: 40, w: 3.9, d: 6.1, h: 2.65, exits: [0] },
    { name: '左转走廊', weight: 20, w: 4.1, d: 4.2, h: 2.65, exits: [3] },
    { name: '右转走廊', weight: 20, w: 4.1, d: 4.2, h: 2.65, exits: [1] },
    { name: '分岔厅', weight: 10, limit: 6, w: 7.1, d: 6.4, h: 3.15, exits: [0, 3, 1] },
    { name: '监牢', weight: 5, limit: 5, w: 6.5, d: 5.9, h: 3.05, exits: [0] },
    { name: '下行楼梯', weight: 7, limit: 5, drop: 1, w: 4.6, d: 3.8, h: 2.8, exits: [0] },
    { name: '下层交叉厅', weight: 5, limit: 4, drop: 1, w: 6.8, d: 6.7, h: 3.5, exits: [0, 1, 3] },
    { name: '储藏室', weight: 5, limit: 4, w: 4.9, d: 6, h: 2.9, exits: [0] },
    { name: '图书馆', role: 'library', weight: 10, limit: 2, minDepth: 5, w: 8.4, d: 9.6, h: 4, exits: [] },
    { name: '末地传送门房', role: 'portal', weight: 20, limit: 1, minDepth: 6, w: 8.1, d: 9.3, h: 3.9, exits: [] },
  ];

  function growStronghold(layout, random, attempt, retryReason) {
    const initialSide = pick(directions, random);
    const start = layout.add(0, 0, 0, 'start', { w: 4.6, d: 4.6, h: 3.15, level: 0, depth: 0, shell: true, template: '起始楼梯', facing: initialSide });
    const volumes = [box(start)];
    const pending = [];
    const placed = new Map();
    const budget = 24 + Math.floor(random() * 6);
    let previousPiece = null;

    layout.record(0, attempt === 1 ? '安置起始楼梯，选择一个下行方向。' : `第 ${attempt} 次布局。上一轮${retryReason}，重新从起始楼梯扩展。`, start.id);

    function attach(parent, side, piece, phase, showRejection) {
      const [dx, dz] = offsets[side];
      const w = dx ? piece.d : piece.w;
      const d = dx ? piece.w : piece.d;
      const level = parent.level + (piece.drop ?? 0);
      const gap = piece.drop ? 7.6 : 1.35;
      const candidate = {
        x: parent.x + dx * ((parent.w + w) / 2 + gap),
        z: parent.z + dz * ((parent.d + d) / 2 + gap),
        y: -level * strongholdFloorHeight, w, d, h: piece.h, level,
      };
      if (Math.max(Math.abs(candidate.x), Math.abs(candidate.z)) > 62) return null;
      const end = { aSide: side, bSide: opposite[side] };
      const roomVolume = box(candidate);
      const passage = connectorVolume(parent, candidate, end);
      if (volumes.some((occupied) => intersects(roomVolume, occupied) || intersects(passage, occupied))) {
        if (showRejection) layout.record(phase, `「${piece.name}」与已放置的片段或通道相交，改试其他片段。`, parent.id, candidate);
        return null;
      }
      const room = layout.add(candidate.x, candidate.y, candidate.z, piece.role, {
        ...candidate, facing: side, shell: true, parent: parent.id, depth: parent.depth + 1, template: piece.name,
      });
      layout.join(parent, room, end);
      volumes.push(roomVolume, passage);
      placed.set(piece, (placed.get(piece) ?? 0) + 1);
      previousPiece = piece;
      if (piece.exits.length) pending.push({ room, exits: piece.exits });
      const destination = `${label(room)}「${piece.name}」`;
      const message = piece.drop ? `${label(parent)} 经下行楼梯接入第 ${level + 1} 层的 ${destination}。` : `${label(parent)} 接入 ${destination}。`;
      layout.record(phase, message, room.id);
      return room;
    }

    attach(start, initialSide, { name: '起始交叉厅', w: 7.8, d: 7.2, h: 3.45, drop: 1, exits: [0, 1, 3] }, 0, false);

    while (pending.length && layout.rooms.length < budget) {
      const [{ room, exits }] = pending.splice(Math.floor(random() * pending.length), 1);
      if (room.depth >= 13) continue;
      for (const turn of shuffled(exits, random)) {
        if (layout.rooms.length >= budget) break;
        const pieces = strongholdPieces.filter((piece) => piece !== previousPiece &&
          room.depth + 1 >= (piece.minDepth ?? 0) && (placed.get(piece) ?? 0) < (piece.limit ?? Infinity) &&
          room.level + (piece.drop ?? 0) < 3);
        const side = rotate(room.facing, turn);
        const options = weightedOrder(pieces, random);
        for (const [index, piece] of options.entries()) {
          if (attach(room, side, piece, 1, index === 0)) break;
        }
      }
    }
  }

  function buildStronghold(layout, random) {
    let retryReason = '';
    for (let attempt = 1; ; attempt += 1) {
      const trial = new Layout(layout.id);
      growStronghold(trial, random, attempt, retryReason);
      const portal = trial.rooms.find((room) => room.role === 'portal');
      if (!portal || trial.rooms.length < 18 || !trial.rooms.some((room) => room.level === 2)) {
        if (!portal) retryReason = '未找到传送门房';
        else if (trial.rooms.length < 18) retryReason = '片段数量低于演示规模';
        else retryReason = '未扩张到第三层';
        continue;
      }
      Object.assign(layout, trial);
      layout.record(2, `找到第 ${portal.level + 1} 层的末地传送门房 ${label(portal)}，沿连接回溯。`, portal.id);
      for (let next = portal; next.parent !== undefined; next = layout.rooms[next.parent]) {
        const path = layout.edges.find((edge) => edge.b === next.id);
        path.toPortal = true;
        const parent = layout.rooms[next.parent];
        layout.record(2, `路线经过 ${label(parent)} 与 ${label(next)} 之间的${parent.level === next.level ? '通道' : '楼梯'}。`, parent.id);
      }
      layout.open(3, `要塞连通，末地传送门位于第 ${portal.level + 1} 层，距入口 ${portal.depth} 段连接。`);
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

  function generate(id, seed) {
    const layout = new Layout(id);
    builders[id](layout, randomFor(`${seed}/${id}`));
    const framesByPhase = algorithms[id].phases.map((_, phase) => layout.frames.filter((frame) => frame.phase === phase));
    return { id, seed, projection: layout.projection, framesByPhase, final: layout.frames.at(-1) };
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
    return { rooms: frame.rooms.length, doors: frame.edges.length, branches: adjacent.filter((edges) => edges.length >= 3).length, loops: frame.edges.length - frame.rooms.length + components };
  }

  globalThis.DungeonGenerators = { algorithms, roles, portalRoute, label, generate, stats, port, connectionPath };
})();
