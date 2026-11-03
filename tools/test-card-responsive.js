const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const Config = require(path.join(ROOT, 'src/core/config'));
const PluginManager = require(path.join(ROOT, 'src/core/plugin-manager'));
const { registerPluginProtocol } = require(path.join(ROOT, 'src/core/plugin-protocol'));
const createHotkeys = require(path.join(ROOT, 'src/core/hotkeys'));
const registerIpc = require(path.join(ROOT, 'src/core/ipc'));

protocol.registerSchemesAsPrivileged([
  { scheme: 'plugin', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

app.whenReady().then(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-resp-verify-'));
  const cfg = new Config(tmp);
  let win = null;
  const manager = new PluginManager({ userDataDir: tmp, config: cfg, getHostWindow: () => win });
  const hotkeys = createHotkeys({ cfg, manager, onSummon: () => {} });
  registerPluginProtocol(manager);
  registerIpc({ app, cfg, manager, hotkeys, getHostWindow: () => win });

  manager.discover();
  for (const p of manager.plugins.values()) if (p.enabled) manager.activate(p.id);

  win = new BrowserWindow({
    width: 980, height: 680, show: false,
    webPreferences: {
      preload: path.join(ROOT, 'src/preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  await win.loadFile(path.join(ROOT, 'src/renderer/index.html'));
  await new Promise(r => setTimeout(r, 600));

  const page = expr => win.webContents.executeJavaScript(expr);
  const shot = async (name) => {
    fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(ROOT, 'dist', `${name}.png`), img.toPNG());
  };

  const testSizes = [
    { w: 1200, h: 720, label: 'desktop-wide' },
    { w: 980, h: 680, label: 'desktop-default' },
    { w: 760, h: 520, label: 'compressed-min' },
    { w: 640, h: 480, label: 'compressed-compact' },
    { w: 500, h: 420, label: 'compressed-narrow' },
  ];

  let allPassed = true;

  for (const s of testSizes) {
    win.setSize(s.w, s.h);
    await new Promise(r => setTimeout(r, 350));

    const check = await page(`(() => {
      const cards = Array.from(document.querySelectorAll('#deck .card'));
      const deck = document.querySelector('#deck');
      const rail = document.querySelector('.rail');
      const minCardH = Math.min(...cards.map(c => c.offsetHeight));
      const maxCardH = Math.max(...cards.map(c => c.offsetHeight));
      const anyCollapsed = cards.some(c => c.offsetHeight < 110);
      const tabTexts = Array.from(document.querySelectorAll('.tabs button')).map(b => ({
        text: b.textContent.trim(),
        w: b.offsetWidth,
        h: b.offsetHeight,
      }));
      return {
        cardCount: cards.length,
        minCardH,
        maxCardH,
        anyCollapsed,
        deckClientH: deck.clientHeight,
        deckScrollH: deck.scrollHeight,
        hasScrollIfOverflow: deck.scrollHeight >= deck.clientHeight,
        tabTexts,
        railOverflow: rail.scrollWidth > rail.clientWidth + 2,
      };
    })()`);

    console.log(`[Verify ${s.w}x${s.h} (${s.label})]`);
    console.log(`  Cards: ${check.cardCount}, Card Heights: ${check.minCardH}px ~ ${check.maxCardH}px`);
    console.log(`  Collapsed (<110px): ${check.anyCollapsed}`);
    console.log(`  Deck scrollable: ${check.deckScrollH}px / ${check.deckClientH}px (scroll: ${check.hasScrollIfOverflow})`);
    console.log(`  Rail overflow: ${check.railOverflow}`);

    if (check.anyCollapsed) {
      console.error(`  FAIL: Cards collapsed at ${s.w}x${s.h}! Min height was ${check.minCardH}px`);
      allPassed = false;
    }
    if (check.railOverflow) {
      console.error(`  FAIL: Rail overflowed at ${s.w}x${s.h}!`);
      allPassed = false;
    }

    await shot(`verified-responsive-${s.label}-${s.w}x${s.h}`);
  }

  // Switch to plugins tab and verify responsiveness
  await page(`document.querySelector('button[data-view="plugins"]').click()`);
  await new Promise(r => setTimeout(r, 400));
  for (const s of [{ w: 760, h: 520, label: 'plugins-min' }, { w: 600, h: 480, label: 'plugins-compact' }]) {
    win.setSize(s.w, s.h);
    await new Promise(r => setTimeout(r, 350));
    await shot(`verified-responsive-${s.label}-${s.w}x${s.h}`);
  }

  console.log(`\nOVERALL RESPONSIVE VERIFICATION: ${allPassed ? 'ALL PASSED' : 'FAILED'}`);
  if (!allPassed) {
    process.exitCode = 1;
  }
  app.quit();
});
