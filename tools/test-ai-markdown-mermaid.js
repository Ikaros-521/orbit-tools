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

console.log('\nALL MARKDOWN & MERMAID & TASK TESTS PASSED!');
