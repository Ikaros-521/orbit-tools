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
};

/* A hand-edited or corrupted config.json (e.g. "enabled": null) must never
   take down the boot chain — every field has to keep its declared shape. */
function shapeOk(value, def) {
  if (Array.isArray(def)) return Array.isArray(value);
  if (def !== null && typeof def === 'object') {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  if (def === null) return value === null || (typeof value === 'object' && !Array.isArray(value));
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
      if (!shapeOk(this.data[k], def)) this.data[k] = JSON.parse(JSON.stringify(def));
    }
    return this;
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  set(patch) {
    this.data = { ...this.data, ...patch };
    this.save();
    return this.data;
  }
}

module.exports = Config;
