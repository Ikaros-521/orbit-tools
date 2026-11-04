const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  hotkey: 'Alt+Shift+Space',
  actionPaletteHotkey: 'Ctrl+K',
  lang: 'zh',
  theme: 'auto',
  deckSort: 'default',  // tool page order: default | frequent | recent | name
  enabled: {},          // pluginId -> bool; absent = manifest default
  pluginHotkeys: {},    // "pluginId:actionId" -> accelerator
  windowBounds: null,
  userPluginsDir: null, // string absolute path | null (defaults to <userData>/plugins)
  pluginDataDir: null,  // string absolute path | null (defaults to <userData>/plugin-data)
  workflows: [],        // visual DAG workflows
  workflowsSeeded: false, // true once the demo workflows have been seeded once
  usage: {},            // actionUsageId -> {n: count, t: lastUsedAt} for palette frecency
  autoCheckUpdate: true, // 启动时是否自动检查更新
};

/* A hand-edited or corrupted config.json (e.g. "enabled": null) must never
   take down the boot chain — every field has to keep its declared shape. */
const NULLABLE_STRINGS = new Set(['actionPaletteHotkey']); // 显式 null = 用户已清空该热键

function shapeOk(value, def, key) {
  if (Array.isArray(def)) return Array.isArray(value);
  if (def !== null && typeof def === 'object') {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  if (def === null) return value === null || (typeof value === 'object' && !Array.isArray(value));
  if (typeof def === 'string' && NULLABLE_STRINGS.has(key)) {
    return typeof value === 'string' || value === null;
  }
  return typeof value === typeof def;
}

class Config {
  constructor(dir) {
    this.file = path.join(dir, 'config.json');
    this.data = JSON.parse(JSON.stringify(DEFAULTS));
    this.load();
  }

  load() {
    try {
      this.data = { ...this.data, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch {
      /* first run */
    }
    for (const [k, def] of Object.entries(DEFAULTS)) {
      if (!shapeOk(this.data[k], def, k)) this.data[k] = JSON.parse(JSON.stringify(def));
    }
    return this;
  }

  save() {
    // save() 会从定时器回调（窗口尺寸防抖等）触发，裸抛异常等于主进程
    // uncaught exception；且写入需原子化——进程中途被杀留下截断的
    // config.json 会让下次启动整体回退默认值（插件启用状态/工作流全丢）。
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmpFile = `${this.file}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmpFile, this.file);
    } catch (err) {
      console.warn('[config] save failed:', err && err.message);
    }
  }

  set(patch) {
    this.data = { ...this.data, ...patch };
    this.save();
    return this.data;
  }
}

module.exports = Config;
