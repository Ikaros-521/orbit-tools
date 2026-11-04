const assert = require('assert');
const path = require('path');

// Load exported functions from panel.js
const { renderMarkdown, splitTableRow, parseTableDelimiterRow, extractTasksFromContent } = require('../src/plugins/ai-chat/panel');

console.log('Testing GFM Table and Mermaid parsing in AI Chat panel...');

// 1. splitTableRow
{
  const row1 = '| col1 | col2 | col3 |';
  assert.deepStrictEqual(splitTableRow(row1), ['col1', 'col2', 'col3']);

  const row2 = 'col1 | col2 | col3';
  assert.deepStrictEqual(splitTableRow(row2), ['col1', 'col2', 'col3']);

  const rowWithEscaped = '| a\\|b | c |';
  assert.deepStrictEqual(splitTableRow(rowWithEscaped), ['a|b', 'c']);
  console.log('PASS: splitTableRow helper functions');
}

// 2. parseTableDelimiterRow
{
  const delim1 = '| :--- | :---: | ---: | --- |';
  assert.deepStrictEqual(parseTableDelimiterRow(delim1), ['left', 'center', 'right', 'left']);

  const delimInvalid = '| col1 | col2 |';
  assert.strictEqual(parseTableDelimiterRow(delimInvalid), null);

  const delimNoPipe = ':--- | ---:';
  assert.deepStrictEqual(parseTableDelimiterRow(delimNoPipe), ['left', 'right']);
  console.log('PASS: parseTableDelimiterRow helper functions');
}

// 3. renderMarkdown: GFM Table
{
  const md = `
这是一段关于数据库选型的介绍：

| 数据库 | 类型 | 适用场景 | 推荐指数 |
| :--- | :---: | ---: | --- |
| **PostgreSQL** | \`关系型\` | 复杂业务查询与事务 | 5星 |
| **Redis** | \`键值缓存\` | 高性能热点缓存与会话 | 5星 |
| MongoDB | 文档型 | 动态 Schema 与海量日志 | 4星 |

以上是对比说明。
  `.trim();

  const html = renderMarkdown(md);
  assert.ok(html.includes('<div class="ai-table-wrap">'), 'Table wrapper missing');
  assert.ok(html.includes('<table class="ai-table">'), 'Table missing');
  assert.ok(html.includes('<thead><tr>'), 'Table thead missing');
  assert.ok(html.includes('<th style="text-align:left">数据库</th>'), 'Header col 1 alignment error');
  assert.ok(html.includes('<th style="text-align:center">类型</th>'), 'Header col 2 alignment error');
  assert.ok(html.includes('<th style="text-align:right">适用场景</th>'), 'Header col 3 alignment error');
  assert.ok(html.includes('<strong>PostgreSQL</strong>'), 'Inline bold inside table cell missing');
  assert.ok(html.includes('<code>关系型</code>'), 'Inline code inside table cell missing');
  assert.ok(html.includes('<p>这是一段关于数据库选型的介绍：</p>'), 'Leading paragraph missing');
  assert.ok(html.includes('<p>以上是对比说明。</p>'), 'Trailing paragraph missing');
  console.log('PASS: GFM Table HTML and alignment rendering');
}

// 4. renderMarkdown: Mermaid block extraction
{
  const mdMermaid = `
\`\`\`mermaid
graph TD
  A[开始] --> B{是否通过?}
  B -->|是| C[发布]
  B -->|否| D[重试]
\`\`\`
  `.trim();

  const html = renderMarkdown(mdMermaid);
  assert.ok(html.includes('class="ai-mermaid-wrap"'), 'Mermaid wrap missing');
  assert.ok(html.includes('class="ai-mermaid-bar"'), 'Mermaid top bar missing');
  assert.ok(html.includes('class="ai-mermaid-actions"'), 'Mermaid action buttons missing');
  assert.ok(html.includes('class="ai-mermaid-copy-btn"'), 'Mermaid copy button missing');
  assert.ok(html.includes('class="ai-mermaid-toggle-btn"'), 'Mermaid toggle button missing');
  assert.ok(html.includes('class="ai-mermaid-render-area"'), 'Mermaid render area missing');
  assert.ok(html.includes('data-mermaid-code="'), 'Mermaid data code missing');
  console.log('PASS: Mermaid block extraction');
}

// 5. renderMarkdown: Streaming unclosed Mermaid block
{
  const mdStreaming = `
正在思考流程图：
\`\`\`mermaid
graph LR
  Client --> Server
  `.trim();

  const html = renderMarkdown(mdStreaming);
  assert.ok(html.includes('class="ai-mermaid-wrap"'), 'Unclosed Mermaid block should be extracted in streaming');
  assert.ok(html.includes('图表生成中…'), 'Streaming placeholder should display');
  console.log('PASS: Streaming unclosed Mermaid block handling');
}

// 6. Normal code block should remain untouched
{
  const mdCode = `
\`\`\`javascript
const answer = 42;
console.log(answer);
\`\`\`
  `.trim();

  const html = renderMarkdown(mdCode);
  assert.ok(html.includes('<pre data-lang="javascript">'), 'Normal pre data-lang missing');
  assert.ok(html.includes('<code class="lang-javascript">'), 'Normal code tag missing');
  assert.ok(html.includes('ai-code-copy-btn'), 'Normal code copy button missing');
  assert.ok(!html.includes('ai-mermaid-wrap'), 'Normal code should not be treated as mermaid');
  console.log('PASS: Normal code block rendering preserved');
}


// 7. extractTasksFromContent (Floating Task Panel)
{
  const textWithTasks = `
这是一段助手回复：
### 任务规划
- [x] 完成架构方案设计与审核
- [ ] 开发侧边悬浮任务清单卡片
- [ ] 调整气泡宽度与圆角间隙
- [x] 验证测试套件

请确认以上计划。
`.trim();

  const extracted = extractTasksFromContent(textWithTasks);
  assert.strictEqual(extracted.length, 4, 'Should extract 4 tasks');
  assert.strictEqual(extracted[0].content, '完成架构方案设计与审核');
  assert.strictEqual(extracted[0].status, 'completed');
  assert.strictEqual(extracted[1].content, '开发侧边悬浮任务清单卡片');
  assert.strictEqual(extracted[1].status, 'pending');
  assert.strictEqual(extracted[2].status, 'pending');
  assert.strictEqual(extracted[3].status, 'completed');

  const textWithoutTasks = '这里是一段普通文本，没有任何清单项。';
  assert.deepStrictEqual(extractTasksFromContent(textWithoutTasks), []);
  assert.deepStrictEqual(extractTasksFromContent(null), []);

  console.log('PASS: extractTasksFromContent for floating task panel');
}

// 8. Incremental stream renderer: splitSettledPrefix safety boundaries
{
  const { splitSettledPrefix, rafThrottle } = require('../src/plugins/ai-chat/lib/stream-renderer');

  const r1 = splitSettledPrefix('第一段\n\n第二段还在写');
  assert.strictEqual(r1.settled, '第一段\n');
  assert.strictEqual(r1.active, '第二段还在写');

  const r2 = splitSettledPrefix('文本\n\n```js\nconst a = 1;\n\n围栏内空行\n继续流');
  assert.strictEqual(r2.settled, '文本\n', 'blank lines inside an open fence must not split');
  assert.ok(r2.active.startsWith('```js'));

  const r3 = splitSettledPrefix('文本\n\n```js\ncode\n```\n\n后续');
  assert.ok(r3.settled.includes('```'), 'closed fence can settle');
  assert.strictEqual(r3.active, '后续');

  const r4 = splitSettledPrefix('表头|列\n---|---\n行1|a\n\n尾段');
  assert.ok(r4.settled.includes('行1'), 'a full table settles as one unit');
  assert.strictEqual(r4.active, '尾段');

  const r5 = splitSettledPrefix('|a|b|\n|-|-|\n|1|2|');
  assert.strictEqual(r5.settled, '', 'unfinished table stays in the active tail');

  assert.deepStrictEqual(splitSettledPrefix(''), { settled: '', active: '' });

  // Incremental equivalence: settled deltas + active rendered separately must
  // equal one full render (the renderer is purely line/block based).
  const sample = '标题段\n\n- 项目一\n- 项目二\n\n```py\nprint("hi")\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n收尾文字…';
  const sp = splitSettledPrefix(sample);
  const whole = renderMarkdown(sample);
  const combined = renderMarkdown(sp.settled) + renderMarkdown(sp.active);
  assert.strictEqual(combined, whole, 'split render must be byte-identical with full render');

  assert.strictEqual(typeof rafThrottle, 'function');
  console.log('PASS: splitSettledPrefix streaming boundaries + incremental render equivalence');
}

// 9. highlight.js renderer: graceful degradation without a DOM/vendor
{
  const { highlightContainer, LANG_ALIAS } = require('../src/plugins/ai-chat/lib/hljs-renderer');
  assert.strictEqual(LANG_ALIAS.ts, 'typescript');
  assert.strictEqual(LANG_ALIAS.py, 'python');
  assert.strictEqual(LANG_ALIAS.yml, 'yaml');
  // No document / no vendor: must not throw (graceful no-op promise)
  let threw = false;
  let p = null;
  try {
    p = highlightContainer(null);
  } catch {
    threw = true;
  }
  assert.ok(!threw, 'no-DOM highlightContainer call must not throw');
  assert.ok(p && typeof p.then === 'function', 'returns a promise');
  p.catch(() => {});
  console.log('PASS: hljs renderer graceful degradation (no-DOM environment)');
}

// 10. Tool cards: pure presentation helpers
{
  const { metaFor, prettyArgs, parseArgs, resultTitle, formatToolResultForDisplay } = require('../src/plugins/ai-chat/components/tool-cards');

  assert.strictEqual(metaFor('read_file').icon, '📖');
  assert.strictEqual(metaFor('mcp__Playwright__navigate').icon, '🌐');
  assert.strictEqual(metaFor('totally_unknown_tool').icon, '🛠️', 'unknown tools fall back to the generic entry');
  assert.ok(metaFor('write_file').title({ path: 'a.js' }).includes('a.js'));

  assert.deepStrictEqual(parseArgs('{"x":1}'), { x: 1 });
  assert.strictEqual(parseArgs('{"truncated'), null, 'invalid JSON returns null (truncation signal)');
  assert.ok(prettyArgs('{"a":1}').includes('\n'), 'args pretty-printed');

  const t1 = resultTitle('submit_plan', { approved: true });
  assert.ok(t1.includes('已批准') && t1.includes('任务清单'));
  const t2 = resultTitle('submit_plan', { ok: true, approved: false, feedback: '再细化' });
  assert.ok(t2.includes('修订'), 'feedback state distinguished from pending');
  const t3 = resultTitle('run_command', { ok: false, error: 'boom' });
  assert.ok(t3.includes('执行失败') && t3.includes('boom'));

  assert.ok(formatToolResultForDisplay({ stdout: 'a', stderr: 'b', exitCode: 0 }).includes('[退出码: 0]'));
  assert.strictEqual(formatToolResultForDisplay(null), '(无执行结果)');
  console.log('PASS: tool-cards meta/pretty-args/result-title helpers');
}

// 11. Task tools: plan markdown conversion
{
  const { planMarkdownToTasks, SUBMIT_PLAN_TOOL_DEFINITION } = require('../src/plugins/ai-chat/task-tools');
  assert.strictEqual(SUBMIT_PLAN_TOOL_DEFINITION.function.name, 'submit_plan');

  const conv = planMarkdownToTasks('# 方案\n\n- [ ] 步骤一\n- [x] 步骤二\n- [ ] 步骤三');
  assert.ok(conv.ok && conv.tasks.length === 3);
  assert.strictEqual(conv.tasks[1].status, 'completed');

  // fallback: numbered/bulleted lines and ## headings without checklists
  const conv2 = planMarkdownToTasks('# 方案\n\n1. 做甲\n2. 做乙\n## 验证\n- 收尾');
  assert.ok(conv2.ok && conv2.tasks.length === 4, 'numbered/heading/bullet fallback extracts steps');
  assert.ok(conv2.tasks.some(t => t.content.includes('验证')), 'headings become steps in fallback');

  assert.ok(!planMarkdownToTasks('').ok);
  console.log('PASS: planMarkdownToTasks conversion + fallbacks');
}

console.log('\nALL MARKDOWN & MERMAID & TASK TESTS PASSED!');
