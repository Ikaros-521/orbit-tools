#!/usr/bin/env node
/**
 * Orbit Toolbox - Unified Test Runner
 * Industrial-grade test harness for executing unit & integration suites with
 * structured reporting, filtering, execution timing, and zero PATH dependencies.
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
const ELECTRON_BIN = require('electron');
const NODE_BIN = process.execPath;

/* --- ANSI Terminal Colors -------------------------------------------------- */
const isColorSupported = !process.env.NO_COLOR && (process.stdout.isTTY || process.env.CI);
const c = {
  reset: isColorSupported ? '\x1b[0m' : '',
  bold: isColorSupported ? '\x1b[1m' : '',
  dim: isColorSupported ? '\x1b[2m' : '',
  green: isColorSupported ? '\x1b[32m' : '',
  red: isColorSupported ? '\x1b[31m' : '',
  yellow: isColorSupported ? '\x1b[33m' : '',
  cyan: isColorSupported ? '\x1b[36m' : '',
  gray: isColorSupported ? '\x1b[90m' : '',
};

/* --- Test Suites Definition ------------------------------------------------ */
const UNIT_TESTS = [
  { file: 'tools/test-color-math.js', title: 'Color Math & Palette Parsing' },
  { file: 'tools/test-updater-flow.js', title: 'Update Manager & Hash Verification' },
  { file: 'tools/test-plugin-isolation.js', title: 'Plugin Worker Host & Fault Isolation' },
  { file: 'tools/test-port-parsers.js', title: 'Port & Process Output Parsers' },
  { file: 'tools/test-ai-protocols.js', title: 'AI Protocols (OpenAI & Claude)' },
  { file: 'tools/test-ai-ide-dispatch.js', title: 'AI IDE & Tool Dispatcher' },
  { file: 'tools/test-ai-markdown-mermaid.js', title: 'AI Markdown & Mermaid Parsing' },
  { file: 'tools/test-ai-mcp-playwright.js', title: 'AI MCP Playwright Capabilities' },
  { file: 'tools/test-ai-multimodal-queue.js', title: 'AI Multimodal Request Queue' },
  { file: 'tools/test-ai-agent-upgrade.js', title: 'AI Agent Lifecycle & Upgrade' },
  { file: 'tools/test-ai-runtime-harness.js', title: 'AI Runtime Context Harness' },
  { file: 'tools/test-ai-process-manager.js', title: 'AI Subprocess & MCP Process Manager' },
  { file: 'tools/test-ai-task-lifecycle.js', title: 'AI Task Lifecycle & State Transitions' },
  { file: 'tools/test-ai-compaction.js', title: 'AI Context Compaction & Summarizer' },
  { file: 'tools/test-ai-model-picker-layout.js', title: 'AI Model Picker Layout & Hierarchy' },
  { file: 'tools/test-ai-context-and-cache.js', title: 'AI Context Cache & Prompt Building' },
  { file: 'tools/test-ai-skills-market.js', title: 'AI Skills Market & Catalog Schema' },
  { file: 'tools/test-ai-live-market.js', title: 'AI Live Market Indexing' },
  { file: 'tools/test-ai-message-toolbar.js', title: 'AI Message Toolbar Actions' },
  { file: 'tools/test-ai-multi-channels.js', title: 'AI Multi-Channel & Multi-Key Routing' },
  { file: 'tools/test-ai-quickwins.js', title: 'AI Model Fallback & Quickwins' },
  { file: 'tools/test-mirror-commands.js', title: 'Mirror Hub Command Formatter' },
];

const INTEGRATION_TESTS = [
  { file: 'tools/smoke-plugins.js', title: 'Plugin System Smoke & Protocol Lifecycle' },
  { file: 'tools/test-renderer-boot.js', title: 'Renderer Shell Boot & Palette Mount' },
  { file: 'tools/test-deck-sort.js', title: 'Workbench Deck Card Sorting & Persistence' },
  { file: 'tools/test-workflows.js', title: 'Workflow DAG Engine Execution' },
  { file: 'tools/test-workflow-ui.js', title: 'Workflow Visual UI & Canvas Nodes' },
  { file: 'tools/test-card-responsive.js', title: 'Card Responsive Grid Layout' },
  { file: 'tools/test-hotkey-clear.js', title: 'Global Hotkey Conflict & Fallback' },
  { file: 'tools/test-text-tools.js', title: 'Text Codec & Encryption Tools (Electron)' },
  { file: 'tools/test-transform-tool.js', title: 'Payload Transformation Pipeline (Electron)' },
];

/* --- CLI Arguments --------------------------------------------------------- */
const args = process.argv.slice(2);
const isUnitOnly = args.includes('--unit');
const isIntegrationOnly = args.includes('--integration');
const isBail = args.includes('--bail');
const isVerbose = args.includes('--verbose') || args.includes('-v');

let filterPattern = null;
const filterArg = args.find(a => a.startsWith('--filter=') || a.startsWith('-f='));
if (filterArg) {
  filterPattern = filterArg.split('=')[1].trim().toLowerCase();
} else {
  const fIndex = args.findIndex(a => a === '--filter' || a === '-f');
  if (fIndex >= 0 && args[fIndex + 1]) {
    filterPattern = args[fIndex + 1].trim().toLowerCase();
  }
}

/* --- Run Single Test Helper ------------------------------------------------ */
function runTest(testItem, isIntegration = false) {
  return new Promise(resolve => {
    const fullPath = path.resolve(ROOT_DIR, testItem.file);
    const bin = isIntegration ? ELECTRON_BIN : NODE_BIN;
    const testName = path.basename(testItem.file);
    const startTime = Date.now();

    let stdout = '';
    let stderr = '';

    const child = spawn(bin, [fullPath], {
      cwd: ROOT_DIR,
      env: { ...process.env, NODE_ENV: 'test' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });

    child.on('error', err => {
      const duration = Date.now() - startTime;
      resolve({
        ok: false,
        name: testName,
        title: testItem.title,
        duration,
        error: err.message,
        stdout,
        stderr,
      });
    });

    child.on('close', code => {
      const duration = Date.now() - startTime;
      resolve({
        ok: code === 0,
        name: testName,
        title: testItem.title,
        duration,
        code,
        stdout,
        stderr,
      });
    });
  });
}

/* --- Main Runner ----------------------------------------------------------- */
async function main() {
  console.log(`\n${c.bold}${c.cyan}Orbit Toolbox · Test Suite Runner${c.reset}`);
  console.log(`${c.gray}Node: ${process.version} | Electron: ${require('electron/package.json').version}${c.reset}\n`);

  let queue = [];
  if (isUnitOnly) {
    queue = UNIT_TESTS.map(t => ({ ...t, isIntegration: false }));
  } else if (isIntegrationOnly) {
    queue = INTEGRATION_TESTS.map(t => ({ ...t, isIntegration: true }));
  } else {
    queue = [
      ...UNIT_TESTS.map(t => ({ ...t, isIntegration: false })),
      ...INTEGRATION_TESTS.map(t => ({ ...t, isIntegration: true })),
    ];
  }

  if (filterPattern) {
    queue = queue.filter(t =>
      t.file.toLowerCase().includes(filterPattern) ||
      t.title.toLowerCase().includes(filterPattern)
    );
    console.log(`${c.yellow}Filtering tests matching: "${filterPattern}" (${queue.length} matched)${c.reset}\n`);
  }

  if (queue.length === 0) {
    console.log(`${c.yellow}No test suites found matching criteria.${c.reset}`);
    process.exit(0);
  }

  const overallStart = Date.now();
  const results = [];
  let failed = 0;

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    const prefix = item.isIntegration ? `[Electron]` : `[Node]    `;
    process.stdout.write(`  ${c.dim}${prefix}${c.reset} ${c.bold}${item.file}${c.reset} ... `);

    const res = await runTest(item, item.isIntegration);
    results.push(res);

    const durationStr = `${res.duration}ms`;
    if (res.ok) {
      const timingColor = res.duration > 2000 ? c.yellow : c.gray;
      console.log(`${c.green}✔ PASS${c.reset} ${timingColor}(${durationStr})${c.reset}`);
      if (isVerbose && res.stdout.trim()) {
        console.log(`${c.gray}${res.stdout.trim()}${c.reset}`);
      }
    } else {
      failed++;
      console.log(`${c.red}✖ FAIL${c.reset} ${c.red}(${durationStr})${c.reset}`);
      if (res.stderr.trim() || res.stdout.trim()) {
        const out = res.stderr.trim() || res.stdout.trim();
        console.log(`\n${c.red}---------------- Output for ${item.file} ----------------${c.reset}`);
        console.log(out);
        console.log(`${c.red}------------------------------------------------------------${c.reset}\n`);
      }
      if (isBail) {
        console.log(`\n${c.red}${c.bold}Bailing out after first failure.${c.reset}`);
        break;
      }
    }
  }

  const totalTime = ((Date.now() - overallStart) / 1000).toFixed(2);
  const passed = results.filter(r => r.ok).length;

  console.log(`\n${c.bold}======================== Summary ========================${c.reset}`);
  console.log(`  Suites:     ${failed === 0 ? c.green : c.red}${passed} passed${c.reset}, ${failed} failed, ${results.length} total`);
  console.log(`  Duration:   ${totalTime}s`);

  const slowTests = results.filter(r => r.duration > 2500);
  if (slowTests.length > 0) {
    console.log(`\n  ${c.yellow}Slow Tests (>2.5s):${c.reset}`);
    for (const st of slowTests) {
      console.log(`    - ${st.name}: ${(st.duration / 1000).toFixed(2)}s`);
    }
  }

  console.log(`${c.bold}=========================================================${c.reset}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`${c.red}Runner fatal error:${c.reset}`, err);
  process.exit(1);
});
