/* Unit tests for AI IDE & CLI Dispatcher
   Run with: node tools/test-ai-ide-dispatch.js */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  TARGET_CATALOG,
  listAvailableIDEs,
  dispatchTask,
  injectTaskProtocol,
  setClipboardWriter,
  buildHandoffPrompt
} = require('../src/plugins/ai-chat/ide-dispatcher');
const {
  AGENT_TOOLS_DEFINITIONS,
  AGENT_TOOL_META,
  executeAgentTool
} = require('../src/plugins/ai-chat/agent-tools');

function testCatalogAndDetection() {
  console.log('Testing TARGET_CATALOG and Detection...');
  assert(TARGET_CATALOG.antigravity, 'Antigravity should be registered');
  assert(TARGET_CATALOG.claude, 'Claude should be registered');
  assert(TARGET_CATALOG.codex, 'Codex should be registered');
  assert(TARGET_CATALOG.qoder, 'Qoder should be registered');
  assert(TARGET_CATALOG.workbuddy, 'WorkBuddy should be registered');
  assert(TARGET_CATALOG.zcode, 'ZCode should be registered');
  assert(TARGET_CATALOG.cursor, 'Cursor should be registered');

  const res = listAvailableIDEs();
  assert.strictEqual(res.ok, true, 'listAvailableIDEs must return ok: true');
  assert(Array.isArray(res.ides), 'ides must be an array');
  assert.strictEqual(res.total, Object.keys(TARGET_CATALOG).length, 'total must match catalog size');
  assert(typeof res.count === 'number', 'count must be a number');

  console.log(`Detected ${res.count} of ${res.total} supported tools on this machine:`);
  for (const ide of res.ides) {
    console.log(`  - [${ide.installed ? 'x' : ' '}] ${ide.name} (${ide.id}): ${ide.path || 'Not detected'}`);
  }
  console.log('PASS: TARGET_CATALOG and live detection');
}

function testTaskProtocolInjection() {
  console.log('Testing Task Protocol Injection...');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-ide-test-'));

  try {
    const taskBrief = '实现待办日历事件提醒重构';
    const metaZCode = TARGET_CATALOG.zcode;
    const briefPath = injectTaskProtocol(tmpDir, taskBrief, metaZCode);

    assert(fs.existsSync(briefPath), 'TASK_BRIEF.md must be generated');
    const briefContent = fs.readFileSync(briefPath, 'utf8');
    assert(briefContent.includes('Orbit AI 任务调度交接简报'), 'Brief must have title');
    assert(briefContent.includes(taskBrief), 'Brief must contain task text');
    assert(briefContent.includes(metaZCode.name.zh), 'Brief must contain target name');

    // Test ZCode plan generation
    const zcodeDir = path.join(tmpDir, '.zcode', 'plans');
    assert(fs.existsSync(zcodeDir), '.zcode/plans directory should be created for zcode');
    const planFiles = fs.readdirSync(zcodeDir);
    assert(planFiles.length > 0, 'At least one plan file should exist');
    const planContent = fs.readFileSync(path.join(zcodeDir, planFiles[0]), 'utf8');
    assert(planContent.includes(taskBrief), 'Plan content must contain task text');

    console.log('PASS: injectTaskProtocol generates standard briefs and target-specific plans');
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

function testAgentToolsRegistration() {
  console.log('Testing Agent Tools Registration and Meta...');
  const listDef = AGENT_TOOLS_DEFINITIONS.find(t => t.function.name === 'list_available_ai_ides');
  assert(listDef, 'list_available_ai_ides definition must exist');
  assert.strictEqual(AGENT_TOOL_META.list_available_ai_ides.risk, 'low', 'list_available_ai_ides risk should be low');

  const dispatchDef = AGENT_TOOLS_DEFINITIONS.find(t => t.function.name === 'dispatch_task_to_ai_ide');
  assert(dispatchDef, 'dispatch_task_to_ai_ide definition must exist');
  assert.strictEqual(AGENT_TOOL_META.dispatch_task_to_ai_ide.risk, 'high', 'dispatch_task_to_ai_ide risk should be high');

  const reqProps = dispatchDef.function.parameters.required;
  assert(reqProps.includes('target'), 'target must be required');
  assert(reqProps.includes('task'), 'task must be required');

  console.log('PASS: Agent Tools schema & risk metadata');
}

async function testExecuteAgentTools() {
  console.log('Testing executeAgentTool integration...');
  // 1. Tool execution: list_available_ai_ides
  const listRes = await executeAgentTool('list_available_ai_ides', {});
  assert.strictEqual(listRes.ok, true, 'list_available_ai_ides execution ok');
  assert(Array.isArray(listRes.ides), 'ides must be an array');

  // 2. Tool execution: unknown target failure handling
  const badRes = await executeAgentTool('dispatch_task_to_ai_ide', {
    target: 'non_existent_ide_404',
    task: 'test'
  });
  assert.strictEqual(badRes.ok, false, 'unknown target should fail gracefully');
  assert(badRes.error.includes('不支持的 AI 工具标识'), 'error message should indicate unsupported target');

  // 3. Tool execution: missing target parameter
  const noTargetRes = await executeAgentTool('dispatch_task_to_ai_ide', {
    task: 'test'
  });
  assert.strictEqual(noTargetRes.ok, false, 'missing target should fail gracefully');

  console.log('PASS: executeAgentTool error handling & parameter validation');
}

function testHandoffPrompt() {
  console.log('Testing Handoff Prompt & Clipboard Writer...');
  const ws = path.join(os.tmpdir(), 'orbit ws demo'); // contains a space on purpose
  const prompt = buildHandoffPrompt(ws);
  assert(prompt.includes('TASK_BRIEF.md'), 'handoff prompt must reference TASK_BRIEF.md');
  assert(prompt.includes(ws), 'handoff prompt must embed the brief path');
  assert(prompt.includes('改动文件清单'), 'handoff prompt must request a completion report');

  // Writer registration must be safe without Electron (standalone CLI usage)
  setClipboardWriter(null);
  console.log('PASS: buildHandoffPrompt & setClipboardWriter standalone safety');
}

async function run() {
  try {
    testCatalogAndDetection();
    testTaskProtocolInjection();
    testHandoffPrompt();
    testAgentToolsRegistration();
    await testExecuteAgentTools();
    console.log('\nALL AI IDE DISPATCH TESTS PASSED!');
  } catch (err) {
    console.error('\nTEST FAILED:', err);
    process.exit(1);
  }
}

run();
