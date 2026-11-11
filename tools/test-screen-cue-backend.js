/* Lifecycle regression tests. Pure Node VM + mock Electron; never launches UI.
   node tools/test-screen-cue-backend.js */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const core = require('../src/plugins/screen-cue/cue-core');
const root = path.resolve(__dirname, '../src/plugins/screen-cue');
const backendSource = fs.readFileSync(path.join(root, 'backend.js'), 'utf8');
const drawSource = fs.readFileSync(path.join(root, 'draw.js'), 'utf8');
let checks = 0;
let scenarios = 0;
function equal(actual, expected, message) {
  checks++;
  assert.strictEqual(actual, expected, message);
}
function ok(value, message) { checks++; assert.ok(value, message); }
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const displays = [
  { id: 11, bounds: { x: -1280, y: 0, width: 1280, height: 720 }, scaleFactor: 1.5 },
  { id: 22, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 2 },
];
const imageSources = () => displays.map(d => ({
  display_id: String(d.id),
  thumbnail: { isEmpty: () => false, toJPEG: () => Buffer.from(`jpeg-${d.id}`) },
}));

function harness(options = {}) {
  const ipcMain = new EventEmitter();
  const screen = new EventEmitter();
  const handlers = new Map();
  const windows = [];
  const captures = [];
  const statuses = [];
  const timers = new Set();
  const unregistered = [];
  const shortcutOwned = new Set();
  let saved = { settings: options.settings || {} };
  let focused = null;
  let spawnCount = 0;
  screen.getAllDisplays = () => options.displays || displays;
  screen.getCursorScreenPoint = () => ({ x: 20, y: 20 });
  screen.getPrimaryDisplay = () => displays[1];
  screen.getDisplayNearestPoint = () => displays[1];
  function timer(fn, ms, repeat = false) {
    const t = { fn, ms, repeat, unref() { return this; } };
    timers.add(t);
    return t;
  }
  class MockWindow extends EventEmitter {
    constructor(opts) {
      super();
      this.id = windows.length + 1;
      this.opts = opts;
      this.destroyed = false;
      this.visible = false;
      this.messages = [];
      this.webContents = new EventEmitter();
      this.webContents.send = (channel, payload) => this.messages.push([channel, clone(payload)]);
      this.webContents.setBackgroundThrottling = () => {};
      windows.push(this);
    }
    setAlwaysOnTop() {}
    setContentBounds() {}
    setIgnoreMouseEvents(value) { this.ignoresMouse = value; }
    loadURL(url) {
      this.role = path.basename(url, '.html');
      if (options.loadReject && this.role === 'draw') return Promise.reject(new Error('load denied'));
      return Promise.resolve();
    }
    show() { this.visible = true; }
    showInactive() { this.visible = true; }
    hide() { this.visible = false; }
    focus() { focused = this; }
    isFocused() { return focused === this; }
    isDestroyed() { return this.destroyed; }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true;
      this.visible = false;
      if (focused === this) focused = null;
      this.emit('closed');
    }
    close() { this.destroy(); }
  }
  const electron = {
    BrowserWindow: { fromWebContents: sender => windows.find(w => w.webContents === sender) },
    screen, ipcMain,
    desktopCapturer: {
      getSources: opts => {
        captures.push(clone(opts));
        return options.capture ? options.capture(opts, captures.length) : Promise.resolve(imageSources());
      },
    },
    globalShortcut: {
      register(acc) {
        const result = options.register ? options.register(acc) : true;
        if (result) shortcutOwned.add(acc);
        return result;
      },
      unregister(acc) { unregistered.push(acc); shortcutOwned.delete(acc); },
    },
  };
  const sandbox = {
    module: { exports: {} }, process: { platform: 'win32' }, Buffer,
    require(id) {
      if (id === 'electron') return electron;
      if (id === './cue-core.js') return core;
      if (id === 'child_process') return {
        spawn() {
          spawnCount++;
          const child = new EventEmitter();
          child.stdout = new PassThrough();
          child.stderr = new PassThrough();
          child.kill = () => { child.stdout.end(); child.stderr.end(); };
          return child;
        },
      };
      if (id === 'path' || id === 'readline') return require(id);
      throw new Error(`Unexpected backend dependency: ${id}`);
    },
    setTimeout: (fn, ms) => timer(fn, ms), clearTimeout: t => timers.delete(t),
    setInterval: (fn, ms) => timer(fn, ms, true), clearInterval: t => timers.delete(t),
  };
  vm.runInNewContext(backendSource, sandbox, { filename: path.join(root, 'backend.js') });
  sandbox.module.exports.activate({
    root,
    data: { get: () => saved, set: value => { saved = clone(value); } },
    windows: { create: opts => new MockWindow(opts) },
    url: name => path.join(root, name),
    ipc: { handle: (name, fn) => handlers.set(name, fn) },
    send: (_channel, payload) => statuses.push(clone(payload)),
  });
  return {
    windows, captures, statuses, timers, ipcMain, screen, unregistered, shortcutOwned,
    call: (name, args) => handlers.get(name)(args),
    state: () => handlers.get('getState')(),
    live: role => windows.filter(w => !w.destroyed && (!role || w.role === role)),
    event: (name, win, payload) => ipcMain.emit(`screen-cue:${name}`, { sender: win.webContents }, payload),
    init(win) {
      this.event('ready', win);
      return win.messages.find(([ch]) => ch === 'screen-cue:init')[1];
    },
    show(win) { this.init(win); this.event('displayed', win); },
    runTimers(ms) {
      for (const t of [...timers]) {
        if (!timers.has(t) || (ms !== undefined && t.ms !== ms)) continue;
        if (!t.repeat) timers.delete(t);
        t.fn();
      }
    },
    deactivate: () => sandbox.module.exports.deactivate(),
    spawnCount: () => spawnCount,
  };
}

async function scenario(label, fn) {
  await fn();
  scenarios++;
  console.log(`  PASS ${label}`);
}
const frozenSettings = { ink: { freezeScreen: true } };

async function main() {
  await scenario('default live annotation never requests capture; settings args are first argument', async () => {
    const h = harness();
    try {
      equal((await h.call('toggleAnnotate')).ok, true);
      equal(h.captures.length, 0, 'default mode must not access screen capture');
      equal(h.live('draw').length, 2);
      for (const win of h.live('draw')) {
        equal(win.opts.show, false, 'windows remain hidden until renderer confirms paint');
        equal(h.init(win).backdrop, null);
        equal(win.visible, false);
        h.event('displayed', win);
        equal(win.visible, true);
      }
      h.call('setSettings', { ink: { width: 12, freezeScreen: true } });
      equal(h.state().settings.ink.width, 12);
      const msg = h.live('draw')[0].messages.find(([ch]) => ch === 'screen-cue:ink-settings');
      equal(msg[1].freezeScreen, false, 'setting change must not freeze an existing live session');
      equal(h.captures.length, 0);
      await h.call('toggleAnnotate');
      await h.call('toggleAnnotate');
      equal(h.captures.length, 2, 'new setting applies on next annotation');
      h.call('stopAll');
      h.call('stopAll');
      equal(h.live().length, 0, 'stopAll is idempotent');
      equal(h.state().drawStarting, false);
    } finally { h.deactivate(); }
  });

  await scenario('frozen capture matches display IDs, physical sizes, and draw-only JPEG payload', async () => {
    const h = harness({ settings: frozenSettings });
    try {
      equal((await h.call('toggleAnnotate')).ok, true);
      equal(h.captures.length, 2);
      equal(JSON.stringify(h.captures.map(c => c.thumbnailSize)), JSON.stringify([
        { width: 1920, height: 1080 }, { width: 3840, height: 2160 },
      ]));
      for (const win of h.live('draw')) {
        const p = h.init(win);
        const id = win.opts.x < 0 ? 11 : 22;
        equal(p.backdrop, `data:image/jpeg;base64,${Buffer.from(`jpeg-${id}`).toString('base64')}`);
        equal(p.ink.freezeScreen, true);
      }
      for (const win of h.live('ink')) equal('backdrop' in h.init(win), false);
      const draw = h.live('draw')[0];
      h.event('commit', draw, { stroke: { tool: 'pen', pts: [{ x: 1, y: 2 }, { x: 3, y: 4 }] } });
      equal(h.state().strokeCount, 1);
      const sync = draw.messages.filter(([ch]) => ch === 'screen-cue:strokes').pop()[1];
      equal(sync.strokes.length, 1, 'frozen draw renders committed ink above its backdrop');
      h.call('setSettings', { ink: { freezeScreen: false } });
      const settingsMessage = draw.messages.filter(([ch]) => ch === 'screen-cue:ink-settings').pop()[1];
      equal(settingsMessage.freezeScreen, true, 'existing freeze session keeps its snapshot');
      await h.call('toggleAnnotate');
      equal(h.live('draw').length, 0, 'exiting destroys all backdrop owners');
      equal(h.state().strokeCount, 1, 'passive ink survives keep exit');
      equal(h.live('ink').length, 2);
      for (const win of h.live('ink')) {
        ok(win.messages.every(([, p]) => !Object.hasOwn(p, 'backdrop')), 'no backdrop in ink IPC');
      }
      await h.call('toggleAnnotate');
      equal(h.captures.length, 2, 'disabling freeze takes effect on next entry');
      equal(h.init(h.live('draw')[0]).backdrop, null);
    } finally { h.deactivate(); }
  });

  for (const cancel of ['stopAll', 'deactivate', 'toggleAnnotate', 'display-added', 'display-removed', 'display-metrics-changed']) {
    await scenario(`pending capture is cancelled by ${cancel} without resurrecting windows`, async () => {
      const pending = deferred();
      const h = harness({ settings: frozenSettings, capture: () => pending.promise });
      try {
        const start = h.call('toggleAnnotate');
        equal(h.state().drawStarting, true);
        equal(h.windows.length, 0, 'capture completes before any interceptor is created');
        if (cancel === 'deactivate') h.deactivate();
        else if (cancel.startsWith('display-')) h.screen.emit(cancel);
        else h.call(cancel);
        pending.resolve(imageSources());
        equal((await start).cancelled, true);
        h.runTimers();
        equal(h.live('draw').length, 0);
        equal(h.windows.length, 0);
        equal(h.state().drawStarting, false);
        equal(h.state().drawMode, false);
        equal(h.captures.length, 1, 'cancelled capture must not continue to another display');
      } finally { h.deactivate(); }
    });
  }

  await scenario('older cancelled capture cannot disturb a newer session or surface stale errors', async () => {
    const old = deferred();
    const h = harness({ settings: frozenSettings, capture: (_opts, n) => n === 1 ? old.promise : Promise.resolve(imageSources()) });
    try {
      const first = h.call('toggleAnnotate');
      h.call('toggleAnnotate');
      await h.call('toggleAnnotate');
      const live = h.live('draw');
      equal(live.length, 2);
      old.reject(new Error('stale permission rejection'));
      equal((await first).cancelled, true);
      equal(h.state().drawMode, true);
      equal(h.state().error, '');
      equal(h.live('draw')[0], live[0]);
    } finally { h.deactivate(); }
  });

  for (const failure of ['rejected', 'missing', 'empty', 'jpeg-empty', 'second-display']) {
    await scenario(`capture ${failure} reports error and creates no windows`, async () => {
      const h = harness({
        settings: frozenSettings,
        capture: (_opts, n) => {
          if (failure === 'rejected' || (failure === 'second-display' && n === 2)) {
            return Promise.reject(new Error('screen access denied'));
          }
          if (failure === 'missing') return Promise.resolve([]);
          const sources = imageSources();
          if (failure === 'empty') sources[0].thumbnail.isEmpty = () => true;
          if (failure === 'jpeg-empty') sources[0].thumbnail.toJPEG = () => Buffer.alloc(0);
          return Promise.resolve(sources);
        },
      });
      try {
        const result = await h.call('toggleAnnotate');
        equal(result.ok, false);
        ok(result.error.includes('Annotation failed:'), 'capture error is explicit');
        equal(h.state().error, result.error);
        equal(h.state().drawStarting, false);
        equal(h.state().drawMode, false);
        equal(h.windows.length, 0);
      } finally { h.deactivate(); }
    });
  }

  for (const failure of ['closed', 'load', 'crash', 'unresponsive', 'timeout', 'load-promise']) {
    await scenario(`draw ${failure} clears every interceptor and resets state`, async () => {
      const h = harness({ settings: frozenSettings, loadReject: failure === 'load-promise' });
      try {
        await h.call('toggleAnnotate');
        if (failure !== 'load-promise') {
          const draw = h.live('draw')[0];
          if (failure !== 'timeout') h.show(draw);
          if (failure === 'closed') draw.close();
          if (failure === 'load') draw.webContents.emit('did-fail-load', {}, -2, 'FAILED', '', true);
          if (failure === 'crash') draw.webContents.emit('render-process-gone', {}, { reason: 'crashed' });
          if (failure === 'unresponsive') draw.emit('unresponsive');
          if (failure === 'timeout') h.runTimers(10000);
          h.event('ready', draw);
          h.event('displayed', draw);
          equal(draw.visible, false, 'late renderer events cannot show destroyed window');
        }
        equal(h.live('draw').length, 0);
        equal(h.state().drawMode, false);
        equal(h.state().drawStarting, false);
        if (failure !== 'closed') ok(h.state().error.length > 0);
        // Recovery must be possible after a renderer closes itself.
        if (failure === 'closed') {
          equal((await h.call('toggleAnnotate')).ok, true);
          equal(h.live('draw').length, 2);
        }
      } finally { h.deactivate(); }
    });
  }

  await scenario('stale blur timer cannot exit a newer annotation; display changes close active draw', async () => {
    const h = harness();
    try {
      await h.call('toggleAnnotate');
      h.live('draw')[0].emit('blur');
      h.call('toggleAnnotate');
      await h.call('toggleAnnotate');
      h.runTimers(150);
      equal(h.state().drawMode, true);
      h.screen.emit('display-metrics-changed');
      equal(h.live('draw').length, 0, 'old bounds must stop intercepting immediately');
      h.runTimers(300);
      equal(h.live('draw').length, 0, 'display rebuild never reenters annotation');
    } finally { h.deactivate(); }
  });

  await scenario('late IPC from a closed draw cannot mutate or exit a newer session', async () => {
    const h = harness();
    try {
      await h.call('toggleAnnotate');
      const old = h.live('draw')[0];
      h.call('toggleAnnotate');
      await h.call('toggleAnnotate');
      const current = h.live('draw')[0];
      const stroke = { stroke: { tool: 'pen', pts: [{ x: 1, y: 2 }, { x: 3, y: 4 }] } };
      h.event('commit', old, stroke);
      equal(h.state().strokeCount, 0);
      h.event('commit', current, stroke);
      equal(h.state().strokeCount, 1);
      h.event('undo', old);
      h.event('clear-ink', old);
      h.event('tool-state', old, { state: { tool: 'arrow', width: 30 } });
      h.event('exit-draw', old);
      equal(h.state().strokeCount, 1);
      equal(h.state().settings.ink.width, 4);
      equal(h.state().drawMode, true);
      h.event('undo', current);
      equal(h.state().strokeCount, 0);
      h.event('exit-draw', current);
      equal(h.live('draw').length, 0);
    } finally { h.deactivate(); }
  });

  await scenario('passive overlays are hidden during capture and safely restored on cancellation', async () => {
    const pending = deferred();
    const h = harness({ capture: () => pending.promise });
    try {
      await h.call('toggleAnnotate');
      for (const w of h.live()) h.show(w);
      const draw = h.live('draw')[0];
      h.event('commit', draw, { stroke: { tool: 'pen', pts: [{ x: 1, y: 2 }, { x: 3, y: 4 }] } });
      h.call('toggleAnnotate');
      const ink = h.live('ink');
      equal(ink.every(w => w.visible), true);
      h.call('setSettings', { ink: { freezeScreen: true } });
      const start = h.call('toggleAnnotate');
      equal(ink.every(w => !w.visible), true, 'retained ink must not become baked into screenshot');
      h.call('toggleAnnotate');
      equal(ink.every(w => w.visible), true, 'cancelling restores passive ink');
      pending.resolve(imageSources());
      await start;
      equal(h.live('draw').length, 0);
    } finally { h.deactivate(); }
  });

  await scenario('temporary shortcuts only unregister successful registrations; teardown is idempotent', async () => {
    const h = harness({ register: acc => acc.endsWith('+Up') });
    h.call('toggleMagnifier');
    equal(h.spawnCount(), 1, 'helper is mocked, never a real process');
    h.call('stopAll');
    equal(JSON.stringify(h.unregistered), JSON.stringify(['CommandOrControl+Shift+Up']));
    h.deactivate();
    h.deactivate();
    equal(h.live().length, 0);
    equal(h.timers.size, 0);
    equal(h.ipcMain.eventNames().length, 0);
    equal(h.screen.eventNames().length, 0);
    equal(h.unregistered.length, 1);
  });

  await scenario('draw renderer waits for the separate image, repaints committed ink and releases it on exit', async () => {
    const r = drawHarness();
    r.init({ backdrop: 'data:image/jpeg;base64,AAAA', strokes: [{ id: 'old' }] });
    equal(r.displayed(), 0);
    equal(r.image.src, 'data:image/jpeg;base64,AAAA');
    r.image.onload();
    equal(r.displayed(), 1);
    equal(r.image.hidden, false);
    equal(r.painted.at(-1).id, 'old');
    r.strokes({ strokes: [{ id: 'new' }] });
    equal(r.painted.at(-1).id, 'new');
    r.toolbar.onExit();
    equal(r.exits(), 1);
    equal(r.image.hidden, true);
    equal(r.image.src, undefined);
    equal(r.image.onload, null);
    equal(r.image.onerror, null);
  });

  await scenario('renderer live mode has no image; failed/late image load never displays an interceptor', async () => {
    const r = drawHarness();
    r.init({ backdrop: null });
    equal(r.displayed(), 1);
    equal(r.image.src, undefined);
    r.init({ backdrop: 'data:image/jpeg;base64,AAAA' });
    const lateLoad = r.image.onload;
    r.image.onerror();
    equal(r.exits(), 1);
    equal(r.image.src, undefined);
    lateLoad();
    equal(r.displayed(), 1);
    r.init({ backdrop: 'data:image/jpeg;base64,BBBB' });
    const unloadingLoad = r.image.onload;
    r.events.pagehide();
    unloadingLoad();
    equal(r.displayed(), 1);
    equal(r.image.src, undefined);
  });
  console.log(`SCREEN CUE BACKEND PASS (${scenarios} scenarios, ${checks} checks; mocked Electron only)`);
}

function drawHarness() {
  const events = {};
  const painted = [];
  let init, strokes, toolbar;
  let displayed = 0, exits = 0;
  const image = { hidden: true, removeAttribute(name) { delete this[name]; } };
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ setTransform() {}, clearRect() {}, drawImage() { throw new Error('Backdrop must never be painted into a stroke canvas'); } }),
    addEventListener() {},
  };
  const elements = { draw: canvas, scBackdrop: image, scBar: { style: {} }, scHint: { style: {} } };
  vm.runInNewContext(drawSource, {
    document: { getElementById: id => elements[id] },
    window: {
      devicePixelRatio: 1.5, innerWidth: 1280, innerHeight: 720,
      addEventListener: (name, fn) => { events[name] = fn; },
      CueStrokes: { drawStroke: (_ctx, stroke) => painted.push(stroke) },
      createDrawToolbar: (_el, opts) => { toolbar = opts; return { setState() {} }; },
      cue: {
        ready() {}, onInit: fn => { init = fn; }, onStrokes: fn => { strokes = fn; },
        onInkSettings() {}, displayed: () => displayed++, exitDraw: () => exits++,
      },
    },
  }, { filename: path.join(root, 'draw.js') });
  return {
    image, events, painted, toolbar, init: payload => init(payload), strokes: payload => strokes(payload),
    displayed: () => displayed, exits: () => exits,
  };
}

main().catch(error => { console.error(error); process.exitCode = 1; });
