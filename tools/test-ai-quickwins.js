/* Unit tests for AI Chat quick-win upgrades:
   - lib/line-diff.js unified diff engine
   - edit_file structured diff result
   - tool-cards diff rendering (renderDiffHtml)
   - claude-messages prompt caching breakpoints (system + tools)
   - runtime-context project rules injection (AGENTS.md / CLAUDE.md)
   - slash-commands pure logic (filterSlashCommands / parseSlashQuery)
   Run with: node tools/test-ai-quickwins.js */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildUnifiedDiff, MAX_MATRIX_LINES } = require('../src/plugins/ai-chat/lib/line-diff');
const { executeLocalTool } = require('../src/plugins/ai-chat/local-tools');
const ToolCards = require('../src/plugins/ai-chat/components/tool-cards');
const { ClaudeMessagesAdapter } = require('../src/plugins/ai-chat/protocols/claude-messages');
const { RuntimeContextService, readProjectRules } = require('../src/plugins/ai-chat/services/runtime-context-service');
const SlashCommands = require('../src/plugins/ai-chat/components/slash-commands');

/* ---- 1. line-diff engine ---- */

function testLineDiff() {
  // 无变化 → 空文本
  assert.strictEqual(buildUnifiedDiff('a\nb\nc', 'a\nb\nc').text, '');

  // 单行修改：+1/-1，hunk 上下文正确
  const r1 = buildUnifiedDiff('l1\nl2\nl3\nl4\nl5', 'l1\nl2\nl3X\nl4\nl5');
  assert.strictEqual(r1.stat.added, 1);
  assert.strictEqual(r1.stat.removed, 1);
  assert.ok(r1.text.includes('-l3'));
  assert.ok(r1.text.includes('+l3X'));
  assert.ok(r1.text.startsWith('@@ '));

  // 纯删除 / 纯插入
  const r2 = buildUnifiedDiff('a\nb\nc', 'a\nc');
  assert.strictEqual(r2.stat.removed, 1);
  assert.strictEqual(r2.stat.added, 0);
  const r3 = buildUnifiedDiff('a\nc', 'a\nb\nc');
  assert.strictEqual(r3.stat.added, 1);
  assert.strictEqual(r3.stat.removed, 0);

  // 相隔很远的两处修改 → 独立 hunk（每个 hunk header 含两个 @@）
  const far = Array.from({ length: 30 }, (_, i) => `line${i}`).join('\n');
  const far2 = far.replace('line2', 'LINE2').replace('line25', 'LINE25');
  const r4 = buildUnifiedDiff(far, far2);
  assert.strictEqual((r4.text.match(/@@/g) || []).length, 4); // 2 hunks

  // 大文件守卫：前缀裁剪后不产生巨型矩阵，尾部追加只出尾部 hunk
  const big = Array.from({ length: MAX_MATRIX_LINES * 2 }, (_, i) => `x${i}`).join('\n');
  const r5 = buildUnifiedDiff(big, big + '\ntail');
  assert.ok(r5.text.split('\n').length < 20, 'big-file diff must stay tiny');
  assert.ok(r5.text.includes('+tail'));

  // maxDiffLines 截断
  const many = Array.from({ length: 400 }, (_, i) => `old${i}`).join('\n');
  const many2 = Array.from({ length: 400 }, (_, i) => `new${i}`).join('\n');
  const r6 = buildUnifiedDiff(many, many2, { maxDiffLines: 30 });
  assert.ok(r6.text.split('\n').length <= 32, 'truncated diff must honor maxDiffLines');
  assert.ok(r6.text.includes('省略'), 'truncation marker expected');

  // CRLF 归一
  const r7 = buildUnifiedDiff('a\r\nb\r\nc', 'a\r\nb2\r\nc');
  assert.strictEqual(r7.stat.added, 1);
  assert.strictEqual(r7.stat.removed, 1);
}

/* ---- 2. edit_file diff result ---- */

async function testEditFileDiff() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-quickwins-'));
  const target = path.join(dir, 'sample.js');
  const workDir = dir;

  fs.writeFileSync(target, 'function hello() {\n  return 1;\n}\n', 'utf8');
  const res = await executeLocalTool('edit_file', {
    path: 'sample.js',
    old_text: 'return 1;',
    new_text: 'return 42;'
  }, { workDir });

  assert.ok(res.ok, `edit_file should succeed: ${res.error}`);
  assert.strictEqual(res.replacements, 1);
  assert.ok(res.diffStat && res.diffStat === '+1 -1', `diffStat expected +1 -1, got ${res.diffStat}`);
  assert.ok(res.diff.includes('--- sample.js'));
  assert.ok(res.diff.includes('-  return 1;'));
  assert.ok(res.diff.includes('+  return 42;'));
  assert.ok(res.preview, 'legacy preview retained');

  fs.writeFileSync(target, 'stable\ncontent\n', 'utf8');
  const res2 = await executeLocalTool('edit_file', {
    path: 'sample.js',
    old_text: 'content',
    new_text: 'CONTENT'
  }, { workDir });
  assert.ok(res2.ok);
  assert.ok(res2.diff.includes('-content'));
  assert.ok(res2.diff.includes('+CONTENT'));

  // 大文件守卫：不挂起、diff 被截断
  const bigLines = Array.from({ length: 3000 }, (_, i) => `v${i}`).join('\n');
  fs.writeFileSync(target, bigLines, 'utf8');
  const res3 = await executeLocalTool('edit_file', {
    path: 'sample.js',
    old_text: 'v1000',
    new_text: 'w1000',
    replace_all: false
  }, { workDir });
  assert.ok(res3.ok, `big-file edit should not hang: ${res3.error}`);
  assert.ok(res3.diff.split('\n').length <= 160, 'diff must be bounded');

  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---- 3. tool-cards diff rendering ---- */

function testToolCardDiff() {
  const diffText = '--- a.js\n+++ a.js\n@@ -1,2 +1,2 @@\n ctx\n-old\n+new\n[… diff 过长，已省略中间 3 行 …]';
  const html = ToolCards.renderDiffHtml(diffText);
  assert.ok(html.startsWith('<pre class="ai-tool-diff">'));
  assert.ok(html.includes('dl-file'));
  assert.ok(html.includes('dl-hunk'));
  assert.ok(html.includes('dl-del">-old'));
  assert.ok(html.includes('dl-add">+new'));
  assert.ok(html.includes('dl-omit'));

  // XSS 防护：内容经 escape
  const xss = ToolCards.renderDiffHtml('--- x\n+++ x\n@@ -1 +1 @@\n-<img src=x onerror=alert(1)>');
  assert.ok(!xss.includes('<img'), 'diff rows must be escaped');

  // formatToolResultForDisplay 优先 diff
  const fmt = ToolCards.formatToolResultForDisplay({ ok: true, diff: '--- a\n+++ a\n@@ -1 +1 @@\n-a\n+b', preview: '1| b' });
  assert.ok(fmt.startsWith('--- a'));

  // resultTitle 显示编辑摘要
  const title = ToolCards.resultTitle('edit_file', { ok: true, path: 'E:\\x\\src\\app.js', diffStat: '+3 -1', replacements: 2 });
  assert.ok(title.includes('已编辑'));
  assert.ok(title.includes('app.js'));
  assert.ok(title.includes('+3 -1'));

  // 完整工具卡 DOM（Node 环境 fallback：只验证字符串拼装不抛错）
  assert.ok(typeof ToolCards.createToolCard === 'function');
}

/* ---- 4. Claude prompt caching breakpoints ---- */

function testClaudePromptCaching() {
  const mk = (enablePromptCaching) => ClaudeMessagesAdapter.buildRequest({
    baseUrl: 'https://api.anthropic.com/v1',
    apiKey: 'sk-ant-test',
    model: 'claude-sonnet-4-5',
    enablePromptCaching,
    messages: [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' }
    ],
    tools: [
      { type: 'function', function: { name: 'read_file', description: 'read', parameters: { type: 'object', properties: {} } } },
      { type: 'function', function: { name: 'run_command', description: 'cmd', parameters: { type: 'object', properties: {} } } }
    ]
  });

  const on = JSON.parse(mk(true).body);
  assert.ok(Array.isArray(on.system), 'system becomes block array when caching enabled');
  assert.deepStrictEqual(on.system[0].cache_control, { type: 'ephemeral' });
  assert.strictEqual(on.tools[on.tools.length - 1].cache_control.type, 'ephemeral', 'last tool carries breakpoint');
  assert.strictEqual(on.tools[0].cache_control, undefined, 'non-last tools carry no breakpoint');

  const off = JSON.parse(mk(false).body);
  assert.strictEqual(typeof off.system, 'string', 'system stays plain string when caching disabled');
  assert.strictEqual(off.tools[off.tools.length - 1].cache_control, undefined);

  // 无 tools 时只剩 system 断点，不抛错
  const noTools = JSON.parse(ClaudeMessagesAdapter.buildRequest({
    enablePromptCaching: true,
    messages: [{ role: 'user', content: 'Hi' }]
  }).body);
  assert.strictEqual(noTools.tools, undefined);
}

/* ---- 5. Project rules injection (AGENTS.md / CLAUDE.md) ---- */

function testProjectRules() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-rules-'));

  // 无规则文件 → 空
  let rules = readProjectRules(dir);
  assert.strictEqual(rules.text, '');
  assert.strictEqual(rules.sources.length, 0);

  // 写 AGENTS.md → 读取 + 命中缓存
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# 规则\n使用 pnpm。', 'utf8');
  rules = readProjectRules(dir);
  assert.deepStrictEqual(rules.sources, ['AGENTS.md']);
  assert.ok(rules.text.includes('使用 pnpm'));
  const cachedRef = readProjectRules(dir);
  assert.strictEqual(cachedRef, rules, 'mtime cache must return same object');

  // CLAUDE.md 同时存在 → 双文件拼接
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Claude 规则\n回答要简洁。', 'utf8');
  rules = readProjectRules(dir);
  assert.deepStrictEqual(rules.sources, ['AGENTS.md', 'CLAUDE.md']);
  assert.ok(rules.text.includes('使用 pnpm'));
  assert.ok(rules.text.includes('回答要简洁'));

  // 修改文件 → mtime 变化 → 缓存失效重读
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# 规则 v2\n使用 npm。', 'utf8');
  rules = readProjectRules(dir);
  assert.ok(rules.text.includes('使用 npm'));
  assert.ok(!rules.text.includes('使用 pnpm'));

  // 预算截断
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), 'x'.repeat(8000), 'utf8');
  rules = readProjectRules(dir);
  assert.ok(rules.text.length < 8000, `budget expected, got ${rules.text.length}`);
  assert.ok(rules.text.includes('截断'));

  // assembleContext 注入 dynamicContextBlock
  const svc = new RuntimeContextService();
  const session = { id: 'sess_test_rules', title: 'T', taskList: [], messages: [] };
  const out = svc.assembleContext({
    session,
    persona: null,
    enableAgent: true,
    agentWorkDir: dir,
    userQuery: 'test',
    memories: []
  });
  assert.ok(out.dynamicContextBlock.includes('项目规则文件'));
  assert.ok(out.dynamicContextBlock.includes('AGENTS.md'));
  assert.ok(out.dynamicContextBlock.includes('必须遵守'));

  // 非 agent 模式不注入
  const plain = svc.assembleContext({ session, persona: null, enableAgent: false, agentWorkDir: dir, userQuery: 'x', memories: [] });
  assert.strictEqual(plain.dynamicContextBlock, null);

  fs.rmSync(dir, { recursive: true, force: true });
}

/* ---- 6. Slash command pure logic ---- */

function testSlashLogic() {
  const { filterSlashCommands, parseSlashQuery, BUILTIN_COMMANDS } = SlashCommands;
  assert.strictEqual(BUILTIN_COMMANDS.length, 4);

  // 空 query → 全部内置 + 技能
  const all = filterSlashCommands(null, [{ id: 's1', name: '代码审查', desc: 'review code' }], '');
  assert.strictEqual(all.length, 5);

  // 过滤命中 name（英文）与 desc（中文）
  assert.ok(filterSlashCommands(null, [], 'plan').some(c => c.id === 'plan'));
  assert.ok(filterSlashCommands(null, [{ id: 's1', name: '代码审查', desc: 'review code' }], '审查').some(c => c.id === 's1'));
  assert.ok(filterSlashCommands(null, [{ id: 's1', name: 'review', desc: '' }], 'rev').some(c => c.id === 's1'));
  assert.strictEqual(filterSlashCommands(null, [], 'zzzz').length, 0);

  // parseSlashQuery
  assert.deepStrictEqual(parseSlashQuery('/pl'), { query: 'pl', rest: '' });
  assert.deepStrictEqual(parseSlashQuery('/plan 做个首页'), { query: 'plan', rest: '做个首页' });
  assert.deepStrictEqual(parseSlashQuery('/技能名 任务A'), { query: '技能名', rest: '任务A' });
  assert.strictEqual(parseSlashQuery('hello /x'), null);
  assert.strictEqual(parseSlashQuery('/multi\nline'), null);
}

/* ---- runner ---- */

const tests = [
  ['line-diff engine', testLineDiff],
  ['edit_file diff result', testEditFileDiff],
  ['tool-cards diff rendering', testToolCardDiff],
  ['claude prompt caching', testClaudePromptCaching],
  ['project rules injection', testProjectRules],
  ['slash command logic', testSlashLogic]
];

let failed = 0;
(async () => {
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.stack ? err.stack.split('\n').slice(0, 6).join('\n    ') : err}`);
    }
  }

  if (failed > 0) {
    console.error(`\nAI quickwins tests: ${failed}/${tests.length} FAILED`);
    process.exit(1);
  }
  console.log(`\nAI quickwins tests: all ${tests.length} passed`);
})();
