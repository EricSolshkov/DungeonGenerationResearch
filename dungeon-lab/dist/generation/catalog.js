(() => {
  'use strict';

  const registry = { pool: new Map(), ruleset: new Map(), preset: new Map() };
  const names = { pool: '模板池', ruleset: '规则集', preset: '预设' };
  const diagnostics = [];
  let loading = null;

  function bucket(kind) {
    if (!Object.hasOwn(registry, kind)) throw new Error(`未知内容类型「${kind}」。`);
    return registry[kind];
  }

  // Packages describe immutable inputs. Mutable counters and random decisions
  // belong to a run or a room instance, including when two panes share a pool.
  function freezeData(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    for (const field of Object.values(value)) freezeData(field, seen);
    return Object.freeze(value);
  }

  function indexTemplates(definition, key) {
    if (!Array.isArray(definition.templates) || !definition.templates.length ||
        !['measure', 'instantiate', 'worldPoint', 'worldSide'].every((field) => typeof definition[field] === 'function')) {
      throw new Error(`模板池「${key}」缺少模板、尺寸查询、实例化或坐标变换。`);
    }
    const pieces = Object.create(null);
    for (const t of definition.templates) {
      if (!t || typeof t.id !== 'string' || !t.id || Object.hasOwn(pieces, t.id) ||
          ![t.w, t.h, t.d].every((n) => Number.isFinite(n) && n > 0) || !Array.isArray(t.connectors)) {
        throw new Error(`模板池「${key}」的片段标识、尺寸或门位有误。`);
      }
      const ids = new Set();
      for (const p of t.connectors) {
        if (!p || typeof p.id !== 'string' || !p.id || ids.has(p.id) ||
            !['n', 'e', 's', 'w'].includes(p.side) || ![p.x, p.y, p.z].every(Number.isFinite)) {
          throw new Error(`片段「${t.id}」包含无效或重复的门位。`);
        }
        ids.add(p.id);
      }
      const entry = t.connectors.find((port) => port.id === 'entry');
      const onFace = entry && { n: entry.z === 0, e: entry.x === t.w, s: entry.z === t.d, w: entry.x === 0 }[entry.side];
      if (!onFace || entry.x < 0 || entry.x > t.w || entry.y < 0 || entry.y > t.h || entry.z < 0 || entry.z > t.d) {
        throw new Error(`片段「${t.id}」需要位于对应外壁面的 entry 入口。`);
      }
      pieces[t.id] = t;
    }
    return pieces;
  }

  function register(kind, definition) {
    const entries = bucket(kind);
    if (!definition || typeof definition.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(definition.id) ||
        typeof definition.version !== 'string' || !/^[0-9][a-zA-Z0-9.+-]*$/.test(definition.version) ||
        typeof definition.name !== 'string' || !definition.name.trim()) {
      throw new Error(`${names[kind]}需要标识、版本和名称。`);
    }
    const key = `${definition.id}@${definition.version}`;
    if (definition.key && key !== definition.key) throw new Error(`${names[kind]}键与标识和版本不一致：${key}。`);
    if (entries.has(key)) throw new Error(`重复的${names[kind]}「${key}」。`);
    if (loading && (kind !== loading.kind || key !== loading.key || loading.item)) {
      throw new Error(`内容脚本应注册${names[loading.kind]}「${loading.key}」。`);
    }
    const record = { apiVersion: 1, ...definition, key };
    if (kind === 'pool') record.pieces = indexTemplates(definition, key);
    if (kind === 'ruleset' && !['begin', 'start', 'level', 'select', 'placed', 'next', 'finish']
      .every((hook) => typeof definition[hook] === 'function')) {
      throw new Error(`规则集「${key}」缺少生成驱动器需要的阶段函数。`);
    }
    if (kind === 'preset' && (typeof definition.ruleset !== 'string' || typeof definition.pool !== 'string')) {
      throw new Error(`预设「${key}」需要带版本的规则集和模板池引用。`);
    }
    const item = freezeData(record);
    if (loading) loading.item = item;
    else {
      if (kind === 'preset') resolve(item);
      entries.set(key, item);
    }
    return item;
  }

  function get(kind, key) {
    const item = bucket(kind).get(key);
    if (!item) throw new Error(`找不到${names[kind]}「${key}」。`);
    return item;
  }

  const list = (kind) => Array.from(bucket(kind).values());

  function resolve(selection = {}) {
    const preset = selection.preset || (!selection.ruleset && !selection.pool ? catalog.defaultPresets.control : null);
    const defaults = preset ? get('preset', preset) : {};
    const ruleset = get('ruleset', selection.ruleset ?? defaults.ruleset);
    const pool = get('pool', selection.pool ?? defaults.pool);
    if (ruleset.apiVersion !== pool.apiVersion || ruleset.apiVersion !== 1) {
      throw new Error(`规则集「${ruleset.key}」与模板池「${pool.key}」的接口版本不兼容。`);
    }
    const required = new Set([...(ruleset.requiredTemplates || []), ...(ruleset.entries || []).map((entry) => entry.id)]);
    const missing = [...required].filter((id) => !pool.pieces[id]);
    for (const [id, connectors] of Object.entries(ruleset.requiredConnectors || {})) {
      const available = new Set(pool.pieces[id]?.connectors.map((c) => c.id));
      for (const port of connectors) if (!available.has(port)) missing.push(`${id}.${port} 门位`);
    }
    if (ruleset.requiredTags?.length) {
      const tags = new Set(pool.templates.flatMap((t) => t.tags || []));
      for (const tag of ruleset.requiredTags) if (!tags.has(tag)) missing.push(`标签「${tag}」`);
    }
    if (missing.length) throw new Error(`规则集「${ruleset.name}」需要模板池提供 ${missing.join('、')}。`);
    return { ruleset, pool };
  }

  const catalog = { register, get, list, resolve, diagnostics,
    get defaultPresets() { return globalThis.GrowthPackageDefaults ?? {}; } };
  globalThis.GrowthCatalog = catalog;

  // Check each manifest entry as it is loaded. A broken optional package does
  // not prevent selection of the remaining versions.
  function checkEntry(entry) {
    const entries = bucket(entry.kind);
    if (entries.has(entry.key)) throw new Error(`清单重复列出「${entry.key}」。`);
    if (typeof entry.src !== 'string' || !/^[a-zA-Z0-9_.\/-]+\.js$/.test(entry.src) ||
        entry.src.startsWith('/') || entry.src.split('/').includes('..')) throw new Error('内容脚本路径无效。');
    loading = { kind: entry.kind, key: entry.key, item: null };
  }

  function finishEntry() {
    const { kind, key, item } = loading;
    if (!item) throw new Error(`内容脚本没有注册${names[kind]}「${key}」。`);
    if (kind === 'preset') resolve(item);
    bucket(kind).set(key, item);
  }

  function report(entry, error) {
    diagnostics.push({ kind: entry.kind, key: entry.key, message: error.message });
  }

  if (typeof module === 'object' && module.exports) {
    require('./packages.js');
    for (const entry of globalThis.GrowthPackageManifest) {
      try {
        checkEntry(entry);
        require('../' + entry.src);
        finishEntry();
      } catch (error) { report(entry, error); }
      finally { loading = null; }
    }
    catalog.ready = Promise.resolve(catalog);
    module.exports = catalog;
  } else {
    const root = new URL('../', document.currentScript.src);
    const load = (path) => new Promise((done, fail) => {
      const script = document.createElement('script');
      script.src = new URL(path, root).href;
      script.onload = done;
      script.onerror = () => fail(new Error(`无法加载内容脚本「${path}」。`));
      document.head.append(script);
    });
    catalog.ready = (async () => {
      await load('generation/packages.js');
      for (const entry of globalThis.GrowthPackageManifest) {
        try {
          checkEntry(entry);
          await load(entry.src);
          finishEntry();
        } catch (error) { report(entry, error); }
        finally { loading = null; }
      }
      return catalog;
    })();
  }
})();
