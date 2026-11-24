(() => {
  'use strict';

  const { algorithms, roles, portalRoute, generate, label, stats } = globalThis.DungeonGenerators;
  const ids = Object.keys(algorithms);
  const growthId = 'connector-growth';
  const catalog = globalThis.GrowthCatalog;
  const games = ids.filter((id) => !algorithms[id].group);
  const minecraftVariants = ['minecraft', 'stronghold'];
  const gameOf = (id) => algorithms[id].group || id;
  const nameOf = (id) => {
    const { title, variant } = algorithms[id];
    return variant ? `${title} · ${variant}` : title;
  };
  const byId = (id) => document.getElementById(id);
  const pad = (number) => String(number).padStart(2, '0');
  const html = (value) => String(value ?? '').replace(/[&<>"']/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const metrics = [['rooms', '房间数'], ['doors', '连接数'], ['branches', '分岔点'], ['loops', '环路数']];
  const roomMetrics = [metrics[0], ['corridors', '通道数'], ['portals', '传送门房'], metrics[1]];
  const strongholdMetrics = [['heights', '门槛标高数'], ['stairPieces', '楼梯片段']];
  const moveKeys = new Set(['w', 'a', 's', 'd', 'q', 'e']);
  const roleOf = (room) => Object.hasOwn(roles, room.role) ? roles[room.role] : roles.normal;
  const compass = { n: '北', e: '东', s: '南', w: '西' };
  const portStates = { entrance: '起始入口', matched: '已连接', waiting: '待扩展', capped: '扩展结束', inactive: '未启用', terminal: '短廊末端' };
  const onHeight = (room, pane) => pane.level === null || pane.doorHeights(room).includes(pane.level);
  const heightsOf = (rooms, reader) => [...new Set(rooms.flatMap(reader))].sort((a, b) => b - a);

  function heightReader(layout) {
    if (!layout.config) return globalThis.StrongholdTemplates.doorHeights;
    const pool = catalog.get('pool', layout.config.pool);
    return pool.doorHeights || ((room) => room.connectors
      .filter((p) => p.id === 'entry' || p.active || p.hasOpening)
      .map((p) => pool.worldPoint(room, [p.x, p.y, p.z])[1]));
  }
  const sceneLabel = (algorithm, mode) => algorithm.projection === 'space' && mode === 'fly' ? '室内漫游' : algorithm.view;
  const view = {
    lab: byId('lab'), workbench: byId('workbench'), panes: byId('panes'),
    stats: byId('stats'), algorithms: byId('algorithms'), inspector: byId('inspector'),
    phases: byId('phases'), phaseCount: byId('phase-count'), event: byId('event-message'), eventLabel: byId('event-label'),
    seed: byId('seed'), progress: byId('progress'), count: byId('step-count'), rate: byId('rate'),
    first: byId('first-step'), prev: byId('prev-step'), next: byId('next-step'), play: byId('play'),
    compare: byId('compare-button'), orbit: byId('orbit-button'), fly: byId('fly-button'), full: byId('fullscreen'),
    legend: byId('legend'), hint: byId('view-hint'), guide: byId('guide'),
    pieceTools: byId('piece-tools'), pieceSelect: byId('piece-select'), pieceFocus: byId('piece-focus'),
    status: byId('generation-status'),
  };

  const state = { seed: view.seed.value, algorithms: ['dead', 'minecraft'], growth: [null, null], minecraft: 'minecraft', comparing: false, active: 0, cursor: 0, speed: 1, timer: null };
  let timeline = [];
  let cache = new Map();
  let renderedPhases = '';
  const panes = [makePane(0), makePane(1)];

  function makePane(index) {
    const root = byId('pane-template').content.firstElementChild.cloneNode(true);
    const select = root.querySelector('.compare-select');
    const levelSelect = root.querySelector('.level-select');
    const letter = index === 0 ? 'A' : 'B';
    root.querySelector('.pane-letter').textContent = letter;
    select.setAttribute('aria-label', `${letter} 窗算法`);
    const packControls = root.querySelector('.growth-controls');
    const packFields = packControls.querySelector('.growth-fields');
    const expand = packControls.querySelector('.growth-expand');
    packFields.id = `growth-fields-${index}`;
    expand.setAttribute('aria-controls', packFields.id);
    expand.addEventListener('click', () => setPackFields(index, packFields.hidden));
    const packSelects = {};
    for (const [key, name] of [['preset', '预设'], ['ruleset', '生成规则'], ['pool', '模板池']]) {
      const field = packControls.querySelector(`.growth-${key}`);
      field.setAttribute('aria-label', `${letter} 窗${name}`);
      field.addEventListener('change', () => switchPacks(index, key, field.value));
      packSelects[key] = field;
    }
    const roomTarget = packControls.querySelector('.growth-room-target');
    roomTarget.setAttribute('aria-label', `${letter} 窗目标房间数（含传送门房）`);
    roomTarget.addEventListener('change', () => switchPacks(index, 'roomTarget', Number(roomTarget.value)));
    const pane = {
      root, select, levelSelect, packControls, packSelects, packFields, roomTarget, expand, packError: root.querySelector('.growth-error'),
      packSummary: root.querySelector('.growth-summary'),
      selected: null, frame: null, layout: null, level: null, isolated: false,
      compareTitle: root.querySelector('.compare-title'), phase: root.querySelector('.pane-phase'),
      event: root.querySelector('.compare-event'), badge: root.querySelector('.stage-badge span'),
      mapTitle: root.querySelector('.minimap-title span'),
    };
    select.innerHTML = ids.map((id) => `<option value="${id}">${nameOf(id)}</option>`).join('');
    select.addEventListener('change', () => switchAlgorithm(index, select.value));
    levelSelect.addEventListener('change', () => {
      activate(index);
      pane.level = levelSelect.value === '' ? null : Number(levelSelect.value);
      pane.isolated = false;
      updateScene(index);
      renderInspector();
    });
    pane.compareTitle.addEventListener('pointerdown', () => activate(index));
    packControls.addEventListener('focusin', () => activate(index));
    view.panes.append(root);
    root.hidden = index > 0;
    pane.scene = new globalThis.DungeonScene(root, () => activate(index), (id) => {
      pane.selected = id;
      if (id === null) pane.isolated = false;
      updateScene(index);
      renderInspector();
    });
    return pane;
  }

  function populatePacks() {
    const presets = catalog.list('preset');
    const rulesets = catalog.list('ruleset');
    const pools = catalog.list('pool');
    for (const [index, pane] of panes.entries()) {
      const custom = new Option('自定义组合', '');
      custom.disabled = true;
      pane.packSelects.preset.add(custom);
      for (const [key, entries] of [['preset', presets], ['ruleset', rulesets], ['pool', pools]]) {
        for (const item of entries) {
          const option = new Option(`${item.name} · ${item.version}`, item.key);
          if (item.description) option.title = item.description;
          pane.packSelects[key].add(option);
        }
      }
      const preferred = index === 0 ? catalog.defaultPresets.control : catalog.defaultPresets.experiment;
      for (const preset of [...presets].sort((a, b) => Number(b.key === preferred) - Number(a.key === preferred))) {
        try {
          catalog.resolve(preset);
          state.growth[index] = { preset: preset.key, ruleset: preset.ruleset, pool: preset.pool };
          break;
        } catch { /* A preset can refer to a pack that failed to load. */ }
      }
      if (!state.growth[index]) {
        for (const rules of rulesets) {
          for (const pool of pools) {
            const config = { preset: '', ruleset: rules.key, pool: pool.key };
            try { catalog.resolve(config); } catch { continue; }
            state.growth[index] = config;
            break;
          }
          if (state.growth[index]) break;
        }
      }
    }
  }

  function renderAlgorithmList() {
    const variants = `<div id="minecraft-variants" class="variant-list" role="group" aria-label="Minecraft 结构" hidden>${minecraftVariants.map((id) =>
      `<button type="button" data-variant="${id}" aria-pressed="false">${algorithms[id].variant}</button>`).join('')}</div>`;
    view.algorithms.innerHTML = games.map((id) => {
      const algorithm = algorithms[id];
      const minecraft = id === 'minecraft';
      return `<button class="algorithm" type="button" data-algorithm="${id}" aria-pressed="false" style="--game-color:${algorithm.accent}"${minecraft ? ' aria-controls="minecraft-variants" aria-expanded="false"' : ''}>
        <span class="algorithm-icon">${icon(algorithm.icon)}</span>
        <span><span class="algorithm-name">${algorithm.title}</span><span class="algorithm-detail">${algorithm.short}</span></span>
        <span class="algorithm-state" aria-hidden="true"></span>
      </button>${minecraft ? variants : ''}`;
    }).join('');
    view.algorithms.addEventListener('click', (event) => {
      const button = event.target.closest('[data-algorithm], [data-variant]');
      if (!button) return;
      const { algorithm, variant } = button.dataset;
      switchAlgorithm(0, variant || (algorithm === 'minecraft' ? state.minecraft : algorithm));
    });
  }

  function growthKey({ ruleset, pool, roomTarget }) {
    return JSON.stringify([growthId, ruleset, pool, roomTarget ?? catalog.get('ruleset', ruleset).roomTarget]);
  }

  function layoutFor(id, index, selection = state.growth[index]) {
    const options = id === growthId ? selection : undefined;
    const key = options ? growthKey(options) : id;
    if (!cache.has(key)) {
      const layout = generate(id, state.seed, options);
      if (!layout.framesByPhase.some((frames) => frames.length)) throw new Error('生成结果中没有可回放的步骤。');
      cache.set(key, layout);
    }
    return cache.get(key);
  }

  function cursorPosition() {
    const current = timeline[state.cursor];
    return current && { phase: current.phase, progress: current.progress, end: state.cursor === timeline.length - 1 };
  }

  function rebuildTimeline(position) {
    const layouts = state.algorithms.slice(0, state.comparing ? 2 : 1).map((id, index) => layoutFor(id, index));
    const held = layouts.map((layout) => layout.framesByPhase.find((frames) => frames.length)?.[0]);
    const phaseCount = Math.max(...layouts.map((layout) => layout.framesByPhase.length));
    timeline = Array.from({ length: phaseCount }, (_, phase) => {
      const phases = layouts.map((layout) => layout.framesByPhase[phase] || []);
      const length = Math.max(...phases.map((frames) => frames.length));
      const steps = Array.from({ length }, (_, index) => {
        const progress = length > 1 ? index / (length - 1) : 0;
        return { phase, progress, frames: phases.map((frames, side) =>
          frames.length ? frames[Math.round(progress * (frames.length - 1))] : held[side]) };
      });
      phases.forEach((frames, side) => { if (frames.length) held[side] = frames.at(-1); });
      return steps;
    }).flat();
    if (position?.end) state.cursor = timeline.length - 1;
    else if (position) {
      const candidates = timeline.map((step, index) => ({ step, index })).filter(({ step }) => step.phase === position.phase);
      if (candidates.length) {
        state.cursor = candidates.reduce((best, next) => Math.abs(next.step.progress - position.progress) < Math.abs(best.step.progress - position.progress) ? next : best).index;
      } else {
        const later = timeline.findIndex((step) => step.phase > position.phase);
        state.cursor = later >= 0 ? later : timeline.length - 1;
      }
    } else state.cursor = 0;
    view.progress.max = timeline.length - 1;
  }

  function updateScene(index) {
    const pane = panes[index];
    const id = state.algorithms[index];
    const template = algorithms[id];
    const layout = layoutFor(id, index);
    const detailed = layout.viewKind === 'stronghold';
    const frame = timeline[state.cursor].frames[index];
    if (!frame) return;
    if (pane.layout !== layout) {
      pane.layout = layout;
      pane.level = null;
      pane.isolated = false;
      pane.root.classList.toggle('stronghold-pane', detailed);
      pane.levelSelect.parentElement.hidden = !detailed;
      if (detailed) {
        pane.doorHeights = heightReader(layout);
        const heights = heightsOf(layout.final.rooms, pane.doorHeights);
        pane.levelSelect.innerHTML = '<option value="">全部标高</option>' + heights.map((height) =>
          `<option value="${height}">门槛 Y = ${height}</option>`).join('');
      }
    }
    if (detailed) {
      const present = new Set(heightsOf(frame.rooms, pane.doorHeights));
      if (!present.has(pane.level)) pane.level = null;
      for (const option of pane.levelSelect.options) option.disabled = option.value !== '' && !present.has(Number(option.value));
      pane.levelSelect.value = pane.level ?? '';
    }
    if (!frame.rooms.some((room) => room.id === pane.selected && onHeight(room, pane))) {
      pane.selected = null;
      pane.isolated = false;
    }
    pane.frame = frame;
    pane.badge.textContent = viewLabel(pane, template);
    pane.mapTitle.textContent = template.projection === 'side' ? '侧视小地图' : '俯视小地图';
    pane.scene.setLayout(layout, frame, pane.selected, state.cursor < timeline.length - 1, pane.level, pane.isolated);
    pane.phase.textContent = template.phases[frame.phase][0];
    pane.event.textContent = frame.message;
  }

  function viewLabel(pane, algorithm) {
    const mode = pane.isolated && pane.scene.mode === 'orbit' ? '片段剖面' : sceneLabel(algorithm, pane.scene.mode);
    return pane.layout.id === 'stronghold' ? `Java 1.17.1 · ${mode}` : mode;
  }

  function renderWorkspace() {
    const { comparing } = state;
    view.lab.classList.toggle('is-comparing', comparing);
    view.compare.setAttribute('aria-pressed', String(comparing));
    view.compare.querySelector('span').textContent = comparing ? '退出对比' : '并排对比';
    panes[1].root.hidden = !comparing;
    for (const [index, pane] of panes.entries()) {
      pane.compareTitle.hidden = !comparing;
      pane.event.hidden = !comparing;
      pane.select.value = state.algorithms[index];
      pane.packControls.hidden = state.algorithms[index] !== growthId;
      if (!pane.packControls.hidden) showPackSelection(index);
    }
    const primaryGame = gameOf(state.algorithms[0]);
    for (const button of view.algorithms.querySelectorAll('[data-algorithm]')) {
      button.setAttribute('aria-pressed', String(button.dataset.algorithm === primaryGame));
    }
    view.algorithms.querySelector('[data-algorithm="minecraft"]').setAttribute('aria-expanded', String(primaryGame === 'minecraft'));
    byId('minecraft-variants').hidden = primaryGame !== 'minecraft';
    for (const button of view.algorithms.querySelectorAll('[data-variant]')) {
      button.setAttribute('aria-pressed', String(button.dataset.variant === state.algorithms[0]));
    }
    const visible = state.algorithms.slice(0, comparing ? 2 : 1);
    const layouts = visible.map((id, index) => layoutFor(id, index));
    const usedRoles = new Set(layouts.flatMap((layout) => layout.final.rooms.map(roleOf)));
    const items = Object.values(roles).filter((role) => usedRoles.has(role));
    if (layouts.some((layout) => layout.final.edges.some((edge) => edge.toPortal))) items.push(portalRoute);
    view.legend.innerHTML = items.map(({ name, color }) => `<span class="legend-item" style="--role-color:${color}">${name}</span>`).join('');
    renderActive();
  }

  function renderActive() {
    for (const [index, pane] of panes.entries()) pane.root.classList.toggle('is-active', index === state.active);
    const flying = panes[state.active].scene.mode === 'fly';
    view.orbit.setAttribute('aria-pressed', String(!flying));
    view.fly.setAttribute('aria-pressed', String(flying));
    view.hint.textContent = flying ? '拖动转向 · WASD 移动 · Q/E 升降' : '拖动旋转 · 滚轮缩放';
  }

  function activate(index) {
    if (state.active === index || (index === 1 && !state.comparing)) return;
    panes[state.active].scene.clearMove();
    state.active = index;
    renderActive();
    renderPhases();
    renderInspector();
  }

  function frameStats({ frame, layout, doorHeights }) {
    const counts = stats(frame);
    if (layout.viewKind === 'stronghold') {
      const stairPieces = frame.rooms.filter((room) => ['start', 'straightStairs', 'spiralStairs'].includes(room.templateId)).length;
      return { ...counts, pieces: frame.rooms.length, heights: heightsOf(frame.rooms, doorHeights).length, stairPieces };
    }
    return counts;
  }

  function renderStats() {
    const left = frameStats(panes[0]);
    if (!state.comparing) {
      const shown = left.corridors !== undefined ? roomMetrics
        : panes[0].layout.viewKind === 'stronghold' ? [['pieces', '结构片段'], metrics[1], ...strongholdMetrics] : metrics;
      view.stats.innerHTML = `<div class="stats-grid">${shown.map(([key, name]) => `<div class="stat"><strong>${pad(left[key])}</strong><span>${name}</span></div>`).join('')}</div>`;
      return;
    }
    const right = frameStats(panes[1]);
    const titles = state.algorithms.map(nameOf);
    const classified = left.corridors !== undefined || right.corridors !== undefined;
    const shown = classified ? [...roomMetrics, ['pieces', '结构片段'], ...strongholdMetrics]
      : panes.some((pane) => pane.layout.viewKind === 'stronghold') ? [...metrics, ...strongholdMetrics] : metrics;
    function number(counts, key) {
      // Older stronghold pools only identify structural pieces.
      if (classified && key === 'rooms' && counts.pieces !== undefined && counts.corridors === undefined) return '—';
      return counts[key] === undefined ? '—' : pad(counts[key]);
    }
    view.stats.innerHTML = `<table class="compare-stats" aria-label="两种算法的布局统计"><thead><tr><th scope="col">指标</th><th scope="col" title="${titles[0]}" aria-label="${titles[0]}">左侧</th><th scope="col" title="${titles[1]}" aria-label="${titles[1]}">右侧</th></tr></thead>
      <tbody>${shown.map(([key, name]) => `<tr><th scope="row">${name}</th><td>${number(left, key)}</td><td>${number(right, key)}</td></tr>`).join('')}</tbody></table>`;
  }

  function renderPhases() {
    const id = state.algorithms[state.active];
    const algorithm = algorithms[id];
    const { phase, message } = timeline[state.cursor].frames[state.active];
    if (renderedPhases !== id) {
      view.phases.innerHTML = algorithm.phases.map(([title, description], index) => `<li><button type="button" class="phase-button" data-phase="${index}">
        <span class="phase-number mono">${pad(index + 1)}</span>
        <span><span class="phase-name">${title}</span><span class="phase-detail">${description}</span></span>
      </button></li>`).join('');
      renderedPhases = id;
    }
    for (const [index, button] of [...view.phases.querySelectorAll('button')].entries()) {
      button.disabled = !panes[state.active].layout.framesByPhase[index]?.length;
      if (index === phase) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
      button.classList.toggle('done', index < phase);
    }
    view.phaseCount.textContent = `${pad(phase + 1)} / ${pad(algorithm.phases.length)}`;
    view.eventLabel.textContent = state.comparing ? `${state.active === 0 ? '左侧' : '右侧'}当前操作` : '当前操作';
    view.event.textContent = message;
  }

  function renderInspector() {
    const pane = panes[state.active];
    const room = pane.frame?.rooms.find((entry) => entry.id === pane.selected);
    const stronghold = pane.layout?.viewKind === 'stronghold';
    view.pieceTools.hidden = !stronghold;
    if (stronghold) {
      const groups = new Map();
      for (const item of pane.frame.rooms.filter((item) => onHeight(item, pane))) {
        if (!groups.has(item.template)) groups.set(item.template, []);
        groups.get(item.template).push(`<option value="${item.id}">${label(item)} · ${html(item.variantName || item.template)}</option>`);
      }
      const options = '<option value="">选择要塞片段…</option>' + [...groups].map(([name, items]) =>
        `<optgroup label="${html(name)}">${items.join('')}</optgroup>`).join('');
      if (view.pieceSelect.innerHTML !== options) view.pieceSelect.innerHTML = options;
      view.pieceSelect.value = room?.id ?? '';
      view.pieceFocus.disabled = !room;
      view.pieceFocus.setAttribute('aria-pressed', String(pane.isolated));
      view.pieceFocus.textContent = pane.isolated ? '返回布局' : '单独查看';
    }
    if (!room) {
      view.inspector.innerHTML = stronghold
        ? '<p class="empty-inspector">点选地图上的片段，或从上方选择，查看门位与相邻片段。</p>'
        : '<p class="empty-inspector">点击房间或小地图，查看尺寸与连接。</p>';
      return;
    }
    const links = pane.frame.edges.filter((edge) => edge.a === room.id || edge.b === room.id);
    if (stronghold) {
      const doorTypes = { open: '敞口', iron: '铁门', wood: '木门', grates: '铁栏开口' };
      const ports = pane.frame.ports.filter((p) => p.room === room.id);
      const rows = ports.map((p) => {
        const edge = links.find((e) => (e.a === room.id ? e.aConnectorId : e.bConnectorId) === p.id);
        const to = edge && pane.frame.rooms[edge.a === room.id ? edge.b : edge.a];
        const wall = edge?.obstructed ? ' · 墙体阻断' : p.state === 'inactive' && p.hasOpening ? ' · 墙上有开口' : '';
        const stateText = `${portStates[p.state]}${wall}`;
        const action = to ? `<button type="button" data-neighbor="${to.id}" title="查看${html(to.template)}">${label(to)}</button>` : '';
        return `<div class="port-row"><span>${html(p.label)} · ${compass[p.side]}</span>${action}
          <small>局部 (${p.local.join(', ')}) · Y=${p.point[1]}<br>${stateText}</small></div>`;
      }).join('');
      const role = roleOf(room);
      view.inspector.innerHTML = `<div class="inspector-room" style="--role-color:${role.color}"><strong>${label(room)}</strong><span>${html(room.template)}</span></div>
        <dl class="room-detail"><dt>宽 × 高 × 深</dt><dd>${room.localW} × ${room.localH} × ${room.localD} ${room.category ? '米' : '格'}</dd>
        ${room.category ? `<dt>片段分类</dt><dd>${room.category === 'room' ? '房间' : '通道'}</dd>` : ''}
        <dt>朝向 / 深度</dt><dd>${compass[room.facing]} / 第 ${room.depth} 代</dd>
        <dt>入口样式</dt><dd>${doorTypes[room.doorType] || '—'}</dd>
        ${room.variantName ? `<dt>内部结构</dt><dd>${html(room.variantName)}</dd>` : ''}
        ${room.contactRoom !== undefined ? `<dt>末端接触</dt><dd>${label(pane.frame.rooms[room.contactRoom])} 的墙面</dd>` : ''}</dl>
        <div class="port-list"><h3>门位与连接</h3>${rows}</div>`;
      return;
    }
    const neighbors = links.map((edge) => label(pane.frame.rooms[edge.a === room.id ? edge.b : edge.a]));
    const role = roleOf(room);
    const levelDetail = room.level === undefined ? '' : `<dt>所在楼层</dt><dd>第 ${room.level + 1} 层</dd><dt>距入口</dt><dd>${room.depth} 段连接</dd>`;
    const roomTitle = room.template === role.name ? label(room) : `${label(room)} · ${role.name}`;
    const display = `<div class="inspector-room" style="--role-color:${role.color}"><strong>${roomTitle}</strong><span>${html(room.template || '规划节点')}</span></div>
      <dl class="room-detail"><dt>宽 × 高 × 深</dt><dd class="mono">${room.w.toFixed(1)} × ${room.h.toFixed(1)} × ${room.d.toFixed(1)}</dd>
      <dt>地面标高</dt><dd class="mono">${room.y.toFixed(1)}</dd>${levelDetail}<dt>已通 / 规划</dt><dd class="mono">${links.filter((edge) => edge.open).length} / ${links.length}</dd>
      <dt>邻接房间</dt><dd class="mono">${neighbors.join(' · ') || '—'}</dd></dl>`;
    if (view.inspector.innerHTML !== display) view.inspector.innerHTML = display;
  }

  function renderTransport() {
    const last = timeline.length - 1;
    const playing = state.timer !== null;
    view.progress.value = state.cursor;
    view.progress.style.setProperty('--progress', `${state.cursor / Math.max(1, last) * 100}%`);
    view.count.textContent = `${pad(state.cursor + 1)} / ${pad(timeline.length)}`;
    view.progress.setAttribute('aria-valuetext', `第 ${state.cursor + 1} 步，共 ${timeline.length} 步`);
    view.first.disabled = state.cursor === 0;
    view.prev.disabled = state.cursor === 0;
    view.next.disabled = state.cursor === last;
    view.play.disabled = last === 0;
    view.play.querySelector('use').setAttribute('href', playing ? '#i-pause' : '#i-play');
    view.play.querySelector('span').textContent = playing ? '暂停' : '播放';
    view.play.title = playing ? '暂停生成过程' : '播放生成过程';
  }

  function renderFrame() {
    updateScene(0);
    if (state.comparing) updateScene(1);
    renderPhases();
    renderStats();
    renderInspector();
    renderTransport();
  }

  function pause() {
    if (state.timer === null) return;
    clearTimeout(state.timer);
    state.timer = null;
  }

  function stepTo(index) {
    pause();
    state.cursor = Math.max(0, Math.min(timeline.length - 1, index));
    renderFrame();
  }

  function schedule() {
    state.timer = setTimeout(() => {
      state.cursor += 1;
      if (state.cursor < timeline.length - 1) schedule();
      else state.timer = null;
      renderFrame();
    }, 620 / state.speed);
  }

  function togglePlay() {
    if (timeline.length < 2) return;
    if (state.timer !== null) {
      pause();
      renderTransport();
      return;
    }
    if (state.cursor === timeline.length - 1) state.cursor = 0;
    schedule();
    renderFrame();
  }

  function generateSeed(seed) {
    pause();
    const previousSeed = state.seed;
    const previousCache = cache;
    state.seed = seed;
    cache = new Map();
    try {
      rebuildTimeline();
    } catch (error) {
      state.seed = view.seed.value = previousSeed;
      cache = previousCache;
      showStatus(`种子「${seed}」生成失败。 ${error.message}`);
      renderTransport();
      return;
    }
    view.seed.value = seed;
    for (const pane of panes) pane.selected = null;
    renderWorkspace();
    renderFrame();
  }

  function showStatus(message) {
    view.status.textContent = message;
    view.status.hidden = !message;
  }

  function showPackSelection(index) {
    const pane = panes[index];
    const selection = pane.draftPacks || state.growth[index];
    for (const [key, field] of Object.entries(pane.packSelects)) field.value = selection[key];
    const ruleset = catalog.get('ruleset', selection.ruleset);
    pane.roomTarget.closest('label').hidden = ruleset.roomTarget === undefined;
    if (ruleset.roomTarget !== undefined) {
      if (pane.roomTarget.length !== ruleset.maxRoomTarget) {
        pane.roomTarget.replaceChildren(...Array.from({ length: ruleset.maxRoomTarget }, (_, i) => new Option(i + 1, i + 1)));
      }
      pane.roomTarget.value = selection.roomTarget ?? ruleset.roomTarget;
    }
    const summary = selection.preset ? catalog.get('preset', selection.preset) : ruleset;
    pane.packSummary.textContent = summary.description || '';
    pane.packSummary.hidden = !summary.description || Boolean(pane.draftPacks);
  }

  function setPackFields(index, open) {
    panes[index].packFields.hidden = !open;
    panes[index].expand.setAttribute('aria-expanded', String(open));
  }

  function switchPacks(index, key, value) {
    const pane = panes[index];
    const previous = pane.draftPacks || state.growth[index];
    const presets = catalog.list('preset');
    let next;
    if (key === 'preset') {
      const preset = presets.find((item) => item.key === value);
      if (!preset) return;
      next = { preset: preset.key, ruleset: preset.ruleset, pool: preset.pool };
    } else {
      next = { ...previous, [key]: value };
      if (key === 'ruleset') delete next.roomTarget;
      next.preset = presets.find((p) => p.ruleset === next.ruleset && p.pool === next.pool)?.key || '';
    }
    pause();
    try {
      catalog.resolve(next);
      layoutFor(growthId, index, next);
    } catch (error) {
      pane.draftPacks = next;
      showPackSelection(index);
      setPackFields(index, true);
      pane.packError.textContent = `当前仍显示上次成功的组合。 ${error.message}`;
      pane.packError.hidden = false;
      renderTransport();
      return;
    }
    const position = cursorPosition();
    state.growth[index] = next;
    const retained = new Set(state.growth.filter(Boolean).map(growthKey));
    for (const [cacheKey, layout] of cache) {
      if (layout.id === growthId && !retained.has(cacheKey)) cache.delete(cacheKey);
    }
    pane.draftPacks = null;
    pane.selected = null;
    pane.packError.hidden = true;
    state.active = index;
    rebuildTimeline(position);
    renderWorkspace();
    renderFrame();
  }

  function switchAlgorithm(index, id) {
    const previous = state.algorithms[index];
    if (previous === id) { activate(index); return; }
    pause();
    const position = cursorPosition();
    const openPair = index === 0 && !state.comparing && id === growthId;
    try {
      layoutFor(id, index);
      if (openPair) layoutFor(id, 1);
    } catch (error) {
      panes[index].select.value = previous;
      showStatus(`无法生成「${nameOf(id)}」。 ${error.message}`);
      renderTransport();
      return;
    }
    if (openPair) {
      state.algorithms[1] = growthId;
      state.comparing = true;
      panes[1].selected = null;
    }
    if (index === 0 && gameOf(id) === 'minecraft') state.minecraft = id;
    state.algorithms[index] = id;
    panes[index].selected = null;
    panes[index].draftPacks = null;
    panes[index].packError.hidden = true;
    state.active = index;
    for (const pane of panes) pane.scene.clearMove();
    rebuildTimeline(position);
    renderWorkspace();
    renderFrame();
  }

  function toggleCompare() {
    pause();
    const position = cursorPosition();
    if (!state.comparing) {
      try { layoutFor(state.algorithms[1], 1); } catch (error) {
        showStatus(`无法生成 B 窗布局。 ${error.message}`);
        renderTransport();
        return;
      }
    }
    state.comparing = !state.comparing;
    state.active = 0;
    for (const pane of panes) pane.scene.clearMove();
    rebuildTimeline(position);
    renderWorkspace();
    renderFrame();
  }

  function setMode(mode) {
    const pane = panes[state.active];
    pane.scene.setMode(mode);
    pane.badge.textContent = viewLabel(pane, algorithms[state.algorithms[state.active]]);
    renderActive();
  }

  function syncFullscreen() {
    const full = document.fullscreenElement === view.workbench || view.workbench.classList.contains('fullscreen-fallback');
    view.full.setAttribute('aria-pressed', String(full));
    view.full.querySelector('use').setAttribute('href', full ? '#i-collapse' : '#i-full');
    view.full.title = full ? '退出全屏' : '全屏观察';
    view.full.setAttribute('aria-label', view.full.title);
  }

  async function toggleFullscreen() {
    if (document.fullscreenElement === view.workbench) await document.exitFullscreen();
    else if (view.workbench.classList.contains('fullscreen-fallback')) view.workbench.classList.remove('fullscreen-fallback');
    else {
      try {
        if (!view.workbench.requestFullscreen) throw new Error('Fullscreen unavailable');
        await view.workbench.requestFullscreen();
      } catch {
        view.workbench.classList.add('fullscreen-fallback');
      }
    }
    syncFullscreen();
  }

  function initGuide() {
    byId('source-list').innerHTML = ids.map((id) => {
      const { summary, sources } = algorithms[id];
      return `<div><strong>${nameOf(id)}</strong><p>${summary}</p>${sources.map(([name, url]) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${name}</a>`).join('')}</div>`;
    }).join('');
    byId('help-button').addEventListener('click', () => {
      view.guide.showModal();
      view.guide.scrollTop = 0;
    });
    byId('sources-button').addEventListener('click', () => {
      view.guide.showModal();
      byId('source-heading').scrollIntoView({ block: 'nearest' });
    });
    view.guide.addEventListener('click', (event) => {
      if (event.target === view.guide) view.guide.close();
    });
  }

  function bindControls() {
    view.pieceSelect.addEventListener('change', () => {
      const pane = panes[state.active];
      pane.selected = view.pieceSelect.value === '' ? null : Number(view.pieceSelect.value);
      if (pane.selected === null) pane.isolated = false;
      updateScene(state.active);
      if (pane.selected !== null && !pane.isolated) pane.scene.focusRoom(pane.frame.rooms[pane.selected]);
      renderInspector();
    });
    view.pieceFocus.addEventListener('click', () => {
      const pane = panes[state.active];
      pane.isolated = !pane.isolated;
      updateScene(state.active);
      renderInspector();
    });
    view.inspector.addEventListener('click', (event) => {
      const button = event.target.closest('[data-neighbor]');
      if (!button) return;
      const pane = panes[state.active];
      pane.selected = Number(button.dataset.neighbor);
      if (!onHeight(pane.frame.rooms[pane.selected], pane)) pane.level = null;
      updateScene(state.active);
      if (!pane.isolated) pane.scene.focusRoom(pane.frame.rooms[pane.selected]);
      renderInspector();
    });
    byId('seed-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const seed = view.seed.value.trim();
      if (seed) generateSeed(seed);
      else {
        view.seed.setCustomValidity('请输入种子，或使用骰子生成。');
        view.seed.reportValidity();
      }
    });
    view.seed.addEventListener('input', () => view.seed.setCustomValidity(''));
    byId('random-seed').addEventListener('click', () => {
      const number = globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
      view.seed.setCustomValidity('');
      generateSeed(String(100000 + number % 900000));
    });
    view.compare.addEventListener('click', toggleCompare);
    view.orbit.addEventListener('click', () => setMode('orbit'));
    view.fly.addEventListener('click', () => setMode('fly'));
    byId('reset-view').addEventListener('click', () => panes[state.active].scene.reset());
    view.full.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', syncFullscreen);
    view.first.addEventListener('click', () => stepTo(0));
    view.prev.addEventListener('click', () => stepTo(state.cursor - 1));
    view.next.addEventListener('click', () => stepTo(state.cursor + 1));
    view.play.addEventListener('click', togglePlay);
    view.progress.addEventListener('input', () => stepTo(Number(view.progress.value)));
    view.phases.addEventListener('click', (event) => {
      const button = event.target.closest('[data-phase]');
      if (button) stepTo(timeline.findIndex((step) => step.phase === Number(button.dataset.phase)));
    });
    view.rate.addEventListener('change', () => {
      state.speed = Number(view.rate.value);
      if (state.timer !== null) { pause(); schedule(); }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && view.workbench.classList.contains('fullscreen-fallback')) {
        view.workbench.classList.remove('fullscreen-fallback');
        syncFullscreen();
        return;
      }
      if (view.guide.open || event.target.closest('input, select, textarea, [contenteditable], a') || event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      const scene = panes[state.active].scene;
      if (scene.mode === 'fly' && moveKeys.has(key)) {
        event.preventDefault();
        scene.moveKey(key, true);
        return;
      }
      if (key === 'arrowleft' || key === 'arrowright') {
        event.preventDefault();
        stepTo(state.cursor + (key === 'arrowright' ? 1 : -1));
      } else if (key === ' ' && !event.repeat && !event.target.closest('button')) {
        event.preventDefault();
        togglePlay();
      }
    });
    document.addEventListener('keyup', (event) => {
      const key = event.key.toLowerCase();
      if (moveKeys.has(key)) for (const pane of panes) pane.scene.moveKey(key, false);
    });
    window.addEventListener('blur', () => panes.forEach(({ scene }) => scene.clearMove()));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) return;
      panes.forEach(({ scene }) => scene.clearMove());
      pause();
      renderTransport();
    });
  }

  async function initialize() {
    try {
      if (!catalog) throw new Error('无法读取内容目录。');
      await catalog.ready;
      populatePacks();
      if (catalog.diagnostics?.length) showStatus(catalog.diagnostics.map((item) => item.message).join(' '));
    } catch (error) {
      showStatus(`连接器内容包加载失败。 ${error.message}`);
    }
    renderAlgorithmList();
    initGuide();
    bindControls();
    const canComparePacks = state.growth.every(Boolean);
    if (!canComparePacks) {
      view.algorithms.querySelector(`[data-algorithm="${growthId}"]`).disabled = true;
      for (const pane of panes) pane.select.querySelector(`option[value="${growthId}"]`).disabled = true;
      if (view.status.hidden) showStatus('连接器生长缺少可用的规则和模板组合。');
    }
    if (location.hash === '#stronghold') state.algorithms[0] = state.minecraft = 'stronghold';
    if (location.hash === `#${growthId}` && canComparePacks) {
      state.algorithms = [growthId, growthId];
      state.comparing = true;
    }
    try {
      rebuildTimeline({ end: true });
    } catch (error) {
      showStatus(`无法加载请求的布局。 ${error.message}`);
      state.algorithms = ['dead', 'minecraft'];
      state.comparing = false;
      rebuildTimeline({ end: true });
    }
    renderWorkspace();
    renderFrame();
  }

  initialize();
})();
