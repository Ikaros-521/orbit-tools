/* Test Suite: AI Chat Popovers & Modals Solid Background Verification
   Verifies:
   1. Popover and modal cards have opaque background (var(--surface) or solid color).
   2. Sub-headers and footers have non-transparent backgrounds (var(--surface-subtle)).
   3. Popovers have backdrop-filter blur.
   4. Popovers have proper z-index to stay above other controls.
*/
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- 开始测试 AI 对话弹窗与弹层非透明背景色修复 ---');

const cssPath = path.join(__dirname, '../src/plugins/ai-chat/panel.css');
const css = fs.readFileSync(cssPath, 'utf8');

// 辅助函数：提取某选择器的规则体
function getRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, 'm');
  const match = css.match(regex);
  assert.ok(match, `CSS 中应当包含选择器 ${selector}`);
  return match[1];
}

console.log('[Test 1] 验证基础表面变量 --surface 与 --surface-subtle 存在且不透明...');
assert.ok(css.includes('--surface: light-dark(#ffffff, #191f21)'), '--surface 变量应当定义');
assert.ok(css.includes('--surface-subtle: light-dark(#f8faf9, #151a1c)'), '--surface-subtle 变量应当定义');
console.log('✓ Test 1 通过');

console.log('[Test 2] 验证模型快速选择弹窗 (.ai-model-popover) 具有实体背景与模糊滤镜...');
const modelRule = getRule('.ai-model-popover');
assert.ok(modelRule.includes('background: var(--surface)'), '模型弹窗必须采用 var(--surface) 实体背景');
assert.ok(!modelRule.includes('background: var(--panel-hi)'), '模型弹窗不得使用半透明 var(--panel-hi)');
assert.ok(modelRule.includes('backdrop-filter: blur'), '模型弹窗应包含 backdrop-filter');
assert.ok(modelRule.includes('z-index: 120'), '模型弹窗 z-index 应为 120');

const modelHeader = getRule('.ai-model-popover-header');
assert.ok(modelHeader.includes('background: var(--surface-subtle)'), '模型弹窗头部必须使用 var(--surface-subtle)');

const modelFooter = getRule('.ai-model-popover-footer');
assert.ok(modelFooter.includes('background: var(--surface-subtle)'), '模型弹窗底部必须使用 var(--surface-subtle)');
console.log('✓ Test 2 通过');

console.log('[Test 3] 验证审批/思维等级控制弹窗 (.ai-ctrl-popover) 具有实体背景与模糊滤镜...');
const ctrlRule = getRule('.ai-ctrl-popover');
assert.ok(ctrlRule.includes('background: var(--surface)'), '控制弹窗必须采用 var(--surface) 实体背景');
assert.ok(!ctrlRule.includes('background: var(--panel-hi)'), '控制弹窗不得使用半透明 var(--panel-hi)');
assert.ok(ctrlRule.includes('backdrop-filter: blur'), '控制弹窗应包含 backdrop-filter');
assert.ok(ctrlRule.includes('z-index: 120'), '控制弹窗 z-index 应为 120');
console.log('✓ Test 3 通过');

console.log('[Test 4] 验证人设选择弹窗 (.ai-persona-popover) 具有实体背景与模糊滤镜...');
const personaRule = getRule('.ai-persona-popover');
assert.ok(personaRule.includes('background: var(--surface)'), '人设弹窗必须采用 var(--surface) 实体背景');
assert.ok(!personaRule.includes('background: var(--panel-hi)'), '人设弹窗不得使用半透明 var(--panel-hi)');
assert.ok(personaRule.includes('backdrop-filter: blur'), '人设弹窗应包含 backdrop-filter');
assert.ok(personaRule.includes('z-index: 120'), '人设弹窗 z-index 应为 120');

const personaHeader = getRule('.ai-persona-popover-header');
assert.ok(personaHeader.includes('background: var(--surface-subtle)'), '人设弹窗头部必须使用 var(--surface-subtle)');

const personaFooter = getRule('.ai-persona-popover-footer');
assert.ok(personaFooter.includes('background: var(--surface-subtle)'), '人设弹窗底部必须使用 var(--surface-subtle)');
console.log('✓ Test 4 通过');

console.log('[Test 5] 验证模态设置弹窗 (.ai-modal-card) 与工作目录弹窗实体背景...');
const modalRule = getRule('.ai-modal-card');
assert.ok(modalRule.includes('background: var(--surface)'), '模态卡片必须采用 var(--surface) 实体背景');
assert.ok(!modalRule.includes('background: var(--panel-hi)'), '模态卡片不得使用半透明 var(--panel-hi)');
assert.ok(modalRule.includes('backdrop-filter: blur'), '模态卡片应包含 backdrop-filter');

const modalHeader = getRule('.ai-modal-header');
assert.ok(modalHeader.includes('background: var(--surface-subtle)'), '模态卡片头部应有背景');

const modalFooter = getRule('.ai-modal-footer');
assert.ok(modalFooter.includes('background: var(--surface-subtle)'), '模态卡片底部应有背景');

const modalNavTabs = getRule('.ai-modal-nav-tabs');
assert.ok(modalNavTabs.includes('background: var(--surface-subtle)'), '模态卡片导航栏应有背景');
console.log('✓ Test 5 通过');

console.log('[Test 6] 验证弹窗内嵌套编辑层 (.ai-persona-edit-panel, .ai-model-search-panel, .ai-ext-editor)...');
const personaEditRule = getRule('.ai-persona-edit-panel');
assert.ok(personaEditRule.includes('background: var(--surface)'), '人设编辑面板必须采用 var(--surface)');

const modelSearchRule = getRule('.ai-model-search-panel');
assert.ok(modelSearchRule.includes('background: var(--surface)'), '模型搜索面板必须采用 var(--surface)');

const extEditorRule = getRule('.ai-ext-editor');
assert.ok(extEditorRule.includes('background: var(--surface-subtle)'), '扩展编辑面板必须采用 var(--surface-subtle)');
console.log('✓ Test 6 通过');

console.log('==================================================');
console.log('🎉 所有弹窗与弹层非透明背景色测试全部通过！');
console.log('==================================================');
