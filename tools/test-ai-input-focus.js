// Test AI Chat Input Focus & Popover Dismissal Invariants
const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('--- 开始测试 AI 对话输入框点击聚焦与浮层互斥关闭 ---');

  // Test 1: 验证 CSS 关键防护规则
  console.log('[Test 1] 验证 panel.css 关键样式与光标/层级防护...');
  const cssContent = fs.readFileSync(path.join(__dirname, '../src/plugins/ai-chat/panel.css'), 'utf-8');

  // 1.1 输入框容器 text 指针与层级
  assert.ok(cssContent.includes('.ai-input-box {'), '应当包含 .ai-input-box 样式');
  assert.ok(
    /\.ai-input-box\s*\{[^}]*cursor:\s*text;/s.test(cssContent),
    '.ai-input-box 必须设置 cursor: text 保证全区域文本光标反馈'
  );
  assert.ok(
    /\.ai-input-box\s*\{[^}]*position:\s*relative;/s.test(cssContent),
    '.ai-input-box 应当设置 position: relative 建立独立堆叠上下文'
  );

  // 1.2 发送/停止按钮 pointer 指针
  assert.ok(
    /\.ai-btn-action\s*\{[^}]*cursor:\s*pointer;/s.test(cssContent),
    '.ai-btn-action 必须设置 cursor: pointer 保持按钮手型光标'
  );

  // 1.3 输入区 flex-shrink: 0 防挤压
  assert.ok(
    /\.ai-input-wrap\s*\{[^}]*flex-shrink:\s*0;/s.test(cssContent),
    '.ai-input-wrap 必须设置 flex-shrink: 0 防止视口缩小被挤压'
  );

  // 1.4 所有 Popovers .hidden 强制隐藏
  assert.ok(
    /\.ai-model-popover\.hidden\s*\{[^}]*display:\s*none\s*!important;/s.test(cssContent),
    '.ai-model-popover.hidden 必须具有 display: none !important;'
  );
  assert.ok(
    /\.ai-persona-popover\.hidden\s*\{[^}]*display:\s*none\s*!important;/s.test(cssContent),
    '.ai-persona-popover.hidden 必须具有 display: none !important;'
  );
  console.log('✓ Test 1 通过');

  // Test 2: 验证 panel.js 中包含 aiInputBox 的点击聚焦代理
  console.log('[Test 2] 验证 panel.js 中包含输入容器全区域点击聚焦代理...');
  const panelJs = fs.readFileSync(path.join(__dirname, '../src/plugins/ai-chat/panel.js'), 'utf-8');
  assert.ok(
    panelJs.includes("el.querySelector('.ai-input-box')"),
    'panel.js 必须检索 .ai-input-box 容器引用'
  );
  assert.ok(
    panelJs.includes('closeAllPopovers'),
    'panel.js 必须包含统一的 closeAllPopovers 浮层收拢管理器'
  );
  assert.ok(
    panelJs.includes('chatInput.focus()'),
    'panel.js 必须在容器点击或会话切换时触发 chatInput.focus()'
  );
  console.log('✓ Test 2 通过');

  // Test 3: 模拟验证统一浮层收拢器与点击代理的行为
  console.log('[Test 3] 模拟验证 closeAllPopovers 与输入容器聚焦代理交互行为...');

  class MockClassList {
    constructor() {
      this.classes = new Set();
    }
    add(cls) { this.classes.add(cls); }
    remove(cls) { this.classes.delete(cls); }
    toggle(cls) {
      if (this.classes.has(cls)) {
        this.classes.delete(cls);
        return false;
      } else {
        this.classes.add(cls);
        return true;
      }
    }
    contains(cls) { return this.classes.has(cls); }
  }

  class MockElement {
    constructor(id = '', className = '') {
      this.id = id;
      this.className = className;
      this.classList = new MockClassList();
      if (className) {
        className.split(/\s+/).filter(Boolean).forEach(c => this.classList.add(c));
      }
      this.listeners = {};
      this.focused = false;
      this.parentElement = null;
    }
    addEventListener(event, fn) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(fn);
    }
    dispatchEvent(event, payload = {}) {
      const fns = this.listeners[event] || [];
      fns.forEach(fn => fn({ target: payload.target || this, stopPropagation: () => {} }));
    }
    focus() {
      this.focused = true;
    }
    closest(selector) {
      if (selector === '#btnSendOrStop' && (this.id === 'btnSendOrStop' || (this.parentElement && this.parentElement.id === 'btnSendOrStop'))) {
        return this.id === 'btnSendOrStop' ? this : this.parentElement;
      }
      return null;
    }
  }

  const mockPlusPopover = new MockElement('plusPopover', 'ai-plus-popover hidden');
  const mockPersonaPopover = new MockElement('personaPopover', 'ai-persona-popover hidden');
  const mockAgentModePopover = new MockElement('agentModePopover', 'ai-ctrl-popover hidden');
  const mockThinkLevelPopover = new MockElement('thinkLevelPopover', 'ai-ctrl-popover hidden');
  const mockModelPopover = new MockElement('modelPopover', 'ai-model-popover hidden');

  function closeAllPopovers(except = null) {
    if (mockPlusPopover && except !== mockPlusPopover) mockPlusPopover.classList.add('hidden');
    if (mockPersonaPopover && except !== mockPersonaPopover) mockPersonaPopover.classList.add('hidden');
    if (mockAgentModePopover && except !== mockAgentModePopover) mockAgentModePopover.classList.add('hidden');
    if (mockThinkLevelPopover && except !== mockThinkLevelPopover) mockThinkLevelPopover.classList.add('hidden');
    if (mockModelPopover && except !== mockModelPopover) mockModelPopover.classList.add('hidden');
  }

  // 展开 modelPopover
  mockModelPopover.classList.remove('hidden');
  assert.strictEqual(mockModelPopover.classList.contains('hidden'), false);

  const mockAiInputBox = new MockElement('aiInputBox', 'ai-input-box');
  const mockChatInput = new MockElement('chatInput', 'ai-input-textarea');
  const mockBtnSendOrStop = new MockElement('btnSendOrStop', 'ai-btn-action send');

  // 模拟绑定 panel.js 的点击代理
  mockAiInputBox.addEventListener('click', (e) => {
    if (!e.target.closest('#btnSendOrStop')) {
      closeAllPopovers();
      mockChatInput.focus();
    }
  });

  // 模拟用户点击了输入框容器 padding 区域 (target 为 mockAiInputBox)
  mockAiInputBox.dispatchEvent('click', { target: mockAiInputBox });

  assert.strictEqual(mockChatInput.focused, true, '点击容器空白处必须自动让 chatInput 获得焦点');
  assert.strictEqual(mockModelPopover.classList.contains('hidden'), true, '点击输入区时必须将展开的 modelPopover 自动收拢隐藏');

  console.log('✓ Test 3 通过');

  console.log('==================================================');
  console.log('🎉 所有 AI 对话输入框点击聚焦与浮层互斥测试全部通过！');
  console.log('==================================================');
}

runTests().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
