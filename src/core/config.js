const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  hotkey: 'Alt+Shift+Space',
  lang: 'zh',
  theme: 'auto',
  enabled: {},          // pluginId -> bool; absent = manifest default
  pluginHotkeys: {},    // "pluginId:actionId" -> accelerator
  windowBounds: null,
  userPluginsDir: null, // string absolute path | null (defaults to <userData>/plugins)
};

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
