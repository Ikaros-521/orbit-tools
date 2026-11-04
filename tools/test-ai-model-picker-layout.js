/* Test Suite: AI Chat Model Quick Picker & Input Layout Migration
   Verifies:
   1. DOM elements migration: Model Pill, WorkDir Pill, Context Ring, Compact Context moved to Input Area.
   2. Header is clean and uncluttered.
   3. Input footer layout contains WorkDir & Context Ring & Compact Context.
   4. Model Quick Picker DOM elements and template existence.
*/
const assert = require('assert');

// 1. Mock minimal DOM if needed or check template strings directly
const { getAiChatTemplate } = require('../src/plugins/ai-chat/components/panel-template');

console.log('--- 开始测试 AI 对话模型切换器与输入区上下排布 ---');

// [Test 1] 验证 HTML 模板结构迁移
console.log('[Test 1] 验证顶部 Header 精简化，不残留已迁移元素...');
const template = getAiChatTemplate();

// 提取 <header class="ai-header">...</header> 内容
const headerMatch = template.match(/<header class="ai-header">([\s\S]*?)<\/header>/);
assert.ok(headerMatch, '应当存在 <header class="ai-header">');
const headerHtml = headerMatch[1];

assert.ok(!headerHtml.includes('id="headerModelPill"'), 'Header 中不应包含 headerModelPill');
assert.ok(!headerHtml.includes('id="headerWorkDirPill"'), 'Header 中不应包含 headerWorkDirPill');
assert.ok(!headerHtml.includes('id="contextRingWrap"'), 'Header 中不应包含 contextRingWrap');
assert.ok(!headerHtml.includes('id="btnCompactContext"'), 'Header 中不应包含 btnCompactContext');
assert.ok(headerHtml.includes('id="headerTitle"'), 'Header 中应保留对话标题');
assert.ok(headerHtml.includes('id="sessionUsageBadge"'), 'Header 中应保留会话用量');
assert.ok(headerHtml.includes('id="btnOpenSettings"'), 'Header 中应保留设置入口');
console.log('✓ Test 1 通过');

// [Test 2] 验证输入框上方 Pills 工具栏恢复整洁，不残留模型切换器
console.log('[Test 2] 验证输入框上方 Pills 工具栏恢复以附件 [+] 按钮开头...');
const pillsBarMatch = template.match(/<div class="ai-pills-bar">([\s\S]*?)<\/div>\s*<!-- 待发送队列看板 -->/);
assert.ok(pillsBarMatch, '应存在 ai-pills-bar 工具栏');
const pillsBarHtml = pillsBarMatch[1];
assert.ok(!pillsBarHtml.includes('id="btnToggleModelPicker"'), 'Pills 工具栏中不应再包含模型选择器');
assert.ok(pillsBarHtml.includes('id="btnPlusAttachment"'), 'Pills 工具栏应包含附件按钮');
console.log('✓ Test 2 通过');

// [Test 3] 验证输入框下方右下角包含模型快速选择器，以及工作路径与上下文压缩按钮
console.log('[Test 3] 验证输入框右下角包含模型切换器，左侧排布工作路径，右侧排布上下文与压缩...');
const footerMatch = template.match(/<div class="ai-input-footer">([\s\S]*?)<\/footer>/);
assert.ok(footerMatch, '应当存在 .ai-input-footer 底部排布容器');
const footerHtml = footerMatch[1];

// 提取右侧容器 (直到 footer 结束前)
const footerRightIndex = footerHtml.indexOf('class="ai-input-footer-right"');
assert.ok(footerRightIndex !== -1, '应当存在 .ai-input-footer-right 右下角容器');
const footerRightHtml = footerHtml.slice(footerRightIndex);

assert.ok(footerRightHtml.includes('id="btnToggleModelPicker"'), '右下角应包含模型选择按钮 btnToggleModelPicker');
assert.ok(footerRightHtml.includes('id="headerModelPill"'), '右下角应包含模型名称 headerModelPill');
assert.ok(footerRightHtml.includes('id="modelPopover"'), '右下角应包含模型弹窗 modelPopover');
assert.ok(footerRightHtml.includes('id="inputModelQuickSearch"'), '浮层中应包含搜索输入框 inputModelQuickSearch');
assert.ok(footerRightHtml.includes('id="modelPopoverList"'), '浮层中应包含模型列表容器 modelPopoverList');
assert.ok(footerRightHtml.includes('id="btnModelPopoverOpenSettings"'), '浮层中应包含设置直达入口');

assert.ok(footerHtml.includes('id="headerWorkDirPill"'), '输入框下方左侧应包含工作路径 headerWorkDirPill');
assert.ok(footerRightHtml.includes('id="contextRingWrap"'), '右下角应包含上下文容量圈 contextRingWrap');
assert.ok(footerRightHtml.includes('id="contextRingMeter"'), '上下文容量圈中应包含进度条 meter');
assert.ok(footerRightHtml.includes('id="contextRingText"'), '上下文容量圈中应包含百分比文本');
assert.ok(footerRightHtml.includes('id="btnCompactContext"'), '右下角应包含压缩上下文按钮 btnCompactContext');
console.log('✓ Test 3 通过');

// [Test 4] 验证 PRESET_CHANNELS 预设模型可正常导入并提供候选
console.log('[Test 4] 验证 PRESET_CHANNELS 预设模型库正常集成...');
const { PRESET_CHANNELS } = require('../src/plugins/ai-chat/lib/markdown-renderer');
assert.ok(Array.isArray(PRESET_CHANNELS) && PRESET_CHANNELS.length > 0, 'PRESET_CHANNELS 应为非空数组');
const deepseekCh = PRESET_CHANNELS.find(c => c.id === 'deepseek');
assert.ok(deepseekCh && deepseekCh.models.includes('deepseek-chat'), 'DeepSeek 通道应包含 deepseek-chat');
const openaiCh = PRESET_CHANNELS.find(c => c.id === 'openai');
assert.ok(openaiCh && openaiCh.models.includes('gpt-4o-mini'), 'OpenAI 通道应包含 gpt-4o-mini');
console.log('✓ Test 4 通过');

console.log('==================================================');
console.log('🎉 所有模型选择器与输入区排布迁移测试全部通过！');
console.log('==================================================');
