(() => {
  'use strict';

  const { algorithms, roles, portalRoute, generate, label, stats } = globalThis.DungeonGenerators;
  const ids = Object.keys(algorithms);
  const games = ids.filter((id) => !algorithms[id].group);
  const minecraftVariants = ['minecraft', 'stronghold'];
  const gameOf = (id) => algorithms[id].group || id;
  const nameOf = (id) => {
    const { title, variant } = algorithms[id];
    return variant ? `${title} · ${variant}` : title;
  };
  const byId = (id) => document.getElementById(id);
  const pad = (number) => String(number).padStart(2, '0');
  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const metrics = [['rooms', '房间数'], ['doors', '连接数'], ['branches', '分岔点'], ['loops', '环路数']];
  const strongholdMetrics = [['heights', '门槛标高数'], ['stairPieces', '楼梯片段']];
  const moveKeys = new Set(['w', 'a', 's', 'd', 'q', 'e']);
  const { doorHeights } = globalThis.StrongholdTemplates;
  const compass = { n: '北', e: '东', s: '南', w: '西' };
  const portStates = { entrance: '起始入口', matched: '已连接', waiting: '待扩展', capped: '扩展结束', inactive: '未启用', terminal: '短廊末端' };
  const onHeight = (room, height) => height === null || doorHeights(room).includes(height);
  const heightsOf = (rooms) => [...new Set(rooms.flatMap(doorHeights))].sort((a, b) => b - a);
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
  };

  const state = { seed: view.seed.value, algorithms: ['dead', 'minecraft'], minecraft: 'minecraft', comparing: false, active: 0, cursor: 0, speed: 1, timer: null };
  if (location.hash === '#stronghold') {
    state.algorithms[0] = state.minecraft = 'stronghold';
  }
  let timeline = [];
  let cache = new Map();
  let renderedPhases = '';
  const panes = [makePane(0), makePane(1)];

  function makePane(index) {
    const root = byId('pane-template').content.firstElementChild.cloneNode(true);
    const select = root.querySelector('select');
    const levelSelect = root.querySelector('.level-select');
    const algorithmName = root.querySelector('.pane-algorithm');
    const pane = {
      root, select, levelSelect, algorithmName, selected: null, frame: null, layout: null, level: null, isolated: false,
      compareTitle: root.querySelector('.compare-title'), phase: root.querySelector('.pane-phase'),
      event: root.querySelector('.compare-event'), badge: root.querySelector('.stage-badge span'),
      mapTitle: root.querySelector('.minimap-title span'),
    };
    select.hidden = index === 0;
    select.parentElement.hidden = index === 0;
    algorithmName.hidden = index === 1;
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

  function layoutFor(id) {
    if (!cache.has(id)) cache.set(id, generate(id, state.seed));
    return cache.get(id);
  }

  function cursorPosition() {
    const current = timeline[state.cursor];
    return current && { phase: current.phase, progress: current.progress, end: state.cursor === timeline.length - 1 };
  }

  function rebuildTimeline(position) {
    const layouts = state.algorithms.slice(0, state.comparing ? 2 : 1).map(layoutFor);
    timeline = layouts[0].framesByPhase.flatMap((_, phase) => {
      const phases = layouts.map((layout) => layout.framesByPhase[phase]);
      const length = Math.max(...phases.map((frames) => frames.length));
      return Array.from({ length }, (_, index) => {
        const progress = length > 1 ? index / (length - 1) : 0;
        return { phase, progress, frames: phases.map((frames) => frames[Math.round(progress * (frames.length - 1))]) };
      });
    });
    if (position?.end) state.cursor = timeline.length - 1;
    else if (position) {
      const candidates = timeline.map((step, index) => ({ step, index })).filter(({ step }) => step.phase === position.phase);
      state.cursor = candidates.reduce((best, next) => Math.abs(next.step.progress - position.progress) < Math.abs(best.step.progress - position.progress) ? next : best).index;
    } else state.cursor = 0;
    view.progress.max = timeline.length - 1;
  }

  function updateScene(index) {
    const pane = panes[index];
    const id = state.algorithms[index];
    const template = algorithms[id];
    const layout = layoutFor(id);
    const frame = timeline[state.cursor].frames[index];
    if (!frame) return;
    if (pane.layout !== layout) {
      pane.layout = layout;
      pane.level = null;
      pane.isolated = false;
      pane.root.classList.toggle('stronghold-pane', id === 'stronghold');
      pane.levelSelect.parentElement.hidden = id !== 'stronghold';
      if (id === 'stronghold') {
        const heights = heightsOf(layout.final.rooms);
        pane.levelSelect.innerHTML = '<option value="">全部标高</option>' + heights.map((height) =>
          `<option value="${height}">门槛 Y = ${height}</option>`).join('');
      }
    }
    if (id === 'stronghold') {
      const present = new Set(heightsOf(frame.rooms));
      if (!present.has(pane.level)) pane.level = null;
      for (const option of pane.levelSelect.options) option.disabled = option.value !== '' && !present.has(Number(option.value));
      pane.levelSelect.value = pane.level ?? '';
    }
    if (!frame.rooms.some((room) => room.id === pane.selected && onHeight(room, pane.level))) {
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
      const algorithm = algorithms[state.algorithms[index]];
      pane.compareTitle.hidden = !comparing;
      pane.event.hidden = !comparing;
      pane.algorithmName.querySelector('strong').textContent = nameOf(state.algorithms[index]);
      pane.algorithmName.style.setProperty('--game-color', algorithm.accent);
      pane.select.value = state.algorithms[index];
      for (const option of pane.select.options) option.disabled = option.value === state.algorithms[0];
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
    const usedRoles = new Set(visible.flatMap((id) => layoutFor(id).final.rooms.map((room) => room.role)));
    const items = Object.entries(roles).filter(([key]) => usedRoles.has(key)).map(([, role]) => role);
    if (visible.includes('stronghold')) items.push(portalRoute);
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

  function frameStats({ frame, layout }) {
    const counts = stats(frame);
    if (layout.id === 'stronghold') {
      const stairPieces = frame.rooms.filter((room) => ['start', 'straightStairs', 'spiralStairs'].includes(room.templateId)).length;
      return { ...counts, heights: heightsOf(frame.rooms).length, stairPieces };
    }
    return counts;
  }

  function renderStats() {
    const left = frameStats(panes[0]);
    if (!state.comparing) {
      const shown = state.algorithms[0] === 'stronghold' ? [['rooms', '结构片段'], metrics[1], ...strongholdMetrics] : metrics;
      view.stats.innerHTML = `<div class="stats-grid">${shown.map(([key, name]) => `<div class="stat"><strong>${pad(left[key])}</strong><span>${name}</span></div>`).join('')}</div>`;
      return;
    }
    const right = frameStats(panes[1]);
    const titles = state.algorithms.map(nameOf);
    const shown = state.algorithms.includes('stronghold') ? [...metrics, ...strongholdMetrics] : metrics;
    const number = (value) => value === undefined ? '—' : pad(value);
    view.stats.innerHTML = `<table class="compare-stats" aria-label="两种算法的布局统计"><thead><tr><th scope="col">指标</th><th scope="col" title="${titles[0]}" aria-label="${titles[0]}">左侧</th><th scope="col" title="${titles[1]}" aria-label="${titles[1]}">右侧</th></tr></thead>
      <tbody>${shown.map(([key, name]) => `<tr><th scope="row">${name}</th><td>${number(left[key])}</td><td>${number(right[key])}</td></tr>`).join('')}</tbody></table>`;
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
    const stronghold = pane.layout?.id === 'stronghold';
    view.pieceTools.hidden = !stronghold;
    if (stronghold) {
      const groups = new Map();
      for (const item of pane.frame.rooms.filter((item) => onHeight(item, pane.level))) {
        if (!groups.has(item.template)) groups.set(item.template, []);
        groups.get(item.template).push(`<option value="${item.id}">${label(item)} · ${item.variantName || item.template}</option>`);
      }
      const options = '<option value="">选择要塞片段…</option>' + [...groups].map(([name, items]) =>
        `<optgroup label="${name}">${items.join('')}</optgroup>`).join('');
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
        const action = to ? `<button type="button" data-neighbor="${to.id}" title="查看${to.template}">${label(to)}</button>` : '';
        return `<div class="port-row"><span>${p.label} · ${compass[p.side]}</span>${action}
          <small>局部 (${p.local.join(', ')}) · Y=${p.point[1]}<br>${stateText}</small></div>`;
      }).join('');
      const role = roles[room.role];
      view.inspector.innerHTML = `<div class="inspector-room" style="--role-color:${role.color}"><strong>${label(room)}</strong><span>${room.template}</span></div>
        <dl class="room-detail"><dt>模板尺寸</dt><dd>${room.localW} × ${room.localH} × ${room.localD} 格</dd>
        <dt>朝向 / 深度</dt><dd>${compass[room.facing]} / 第 ${room.depth} 代</dd>
        <dt>入口样式</dt><dd>${doorTypes[room.doorType]}</dd>
        ${room.variantName ? `<dt>内部结构</dt><dd>${room.variantName}</dd>` : ''}
        ${room.contactRoom !== undefined ? `<dt>末端接触</dt><dd>${label(pane.frame.rooms[room.contactRoom])} 的墙面</dd>` : ''}</dl>
        <div class="port-list"><h3>门位与连接</h3>${rows}</div>`;
      return;
    }
    const neighbors = links.map((edge) => label(pane.frame.rooms[edge.a === room.id ? edge.b : edge.a]));
    const role = roles[room.role];
    const levelDetail = room.level === undefined ? '' : `<dt>所在楼层</dt><dd>第 ${room.level + 1} 层</dd><dt>距入口</dt><dd>${room.depth} 段连接</dd>`;
    const roomTitle = room.template === role.name ? label(room) : `${label(room)} · ${role.name}`;
    const display = `<div class="inspector-room" style="--role-color:${role.color}"><strong>${roomTitle}</strong><span>${room.template || '规划节点'}</span></div>
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
    state.seed = seed;
    view.seed.value = seed;
    cache = new Map();
    for (const pane of panes) pane.selected = null;
    rebuildTimeline();
    renderWorkspace();
    renderFrame();
  }

  function switchAlgorithm(index, id) {
    const previous = state.algorithms[index];
    if (previous === id) { activate(index); return; }
    pause();
    const position = cursorPosition();
    if (index === 0 && state.algorithms[1] === id) {
      const alternate = minecraftVariants.find((variant) => variant !== id);
      state.algorithms[1] = !state.comparing && gameOf(id) === 'minecraft' ? alternate : previous;
      panes[1].selected = null;
    }
    if (index === 0 && gameOf(id) === 'minecraft') state.minecraft = id;
    state.algorithms[index] = id;
    panes[index].selected = null;
    state.active = index;
    for (const pane of panes) pane.scene.clearMove();
    rebuildTimeline(position);
    renderWorkspace();
    renderFrame();
  }

  function toggleCompare() {
    pause();
    const position = cursorPosition();
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
      if (!onHeight(pane.frame.rooms[pane.selected], pane.level)) pane.level = null;
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

  renderAlgorithmList();
  initGuide();
  bindControls();
  rebuildTimeline({ end: true });
  renderWorkspace();
  renderFrame();
})();
