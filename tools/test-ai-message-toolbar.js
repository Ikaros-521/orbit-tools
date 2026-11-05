const assert = require('assert');
const path = require('path');

// Setup minimal DOM mock environment for Node
class MockElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.className = '';
    this.classList = {
      _set: new Set(),
      add: (cls) => this.classList._set.add(cls),
      remove: (cls) => this.classList._set.delete(cls),
      contains: (cls) => this.classList._set.has(cls)
    };
    this.dataset = {};
    this.style = {};
    this._innerHTML = '';
    this.textContent = '';
    this.eventListeners = {};
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this.children = [];
    // Lightweight simulation of innerHTML with action buttons
    const matches = Array.from(html.matchAll(/class="([^"]+)"/g));
    matches.forEach(m => {
      const cls = m[1];
      const child = new MockElement('div');
      child.className = cls;
      cls.split(/\s+/).forEach(c => child.classList.add(c));
      this.appendChild(child);
    });
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  querySelector(selector) {
    return this._find(el => el._matches(selector));
  }

  querySelectorAll(selector) {
    const res = [];
    this._findAll(el => el._matches(selector), res);
    return res;
  }

  addEventListener(event, fn) {
    if (!this.eventListeners[event]) this.eventListeners[event] = [];
    this.eventListeners[event].push(fn);
  }

  dispatchEvent(event) {
    const fns = this.eventListeners[event.type || event] || [];
    fns.forEach(fn => fn(event));
  }

  click() {
    this.dispatchEvent({ type: 'click' });
  }

  focus() {}

  _matches(selector) {
    if (selector.startsWith('.')) {
      const classes = selector.slice(1).split('.');
      return classes.every(c => this.className.split(/\s+/).includes(c) || this.classList.contains(c));
    }
    if (selector.startsWith('#')) {
      return this.id === selector.slice(1);
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }

  _find(predicate) {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const found = child._find(predicate);
      if (found) return found;
    }
    return null;
  }

  _findAll(predicate, results) {
    for (const child of this.children) {
      if (predicate(child)) results.push(child);
      child._findAll(predicate, results);
    }
  }
}

global.document = {
  createElement: (tag) => new MockElement(tag)
};
global.window = {};

const { createMessageRenderer } = require('../src/plugins/ai-chat/components/message-renderer');

console.log('Testing AI Chat Message Renderer Toolbar & Resend Button...');

// 1. Verify createMessageRenderer initialization with sendMessage & ctx & openLightbox
{
  let sentParams = null;
  const mockSendMessage = (text, editMessageId, atts) => {
    sentParams = { text, editMessageId, atts };
  };

  let ctxCalls = [];
  const mockCtx = {
    call: async (method, args) => {
      ctxCalls.push({ method, args });
      return { ok: true, session: { id: 'sess_1', messages: [] } };
    }
  };

  let lightboxCalls = [];
  const mockOpenLightbox = (url, caption) => {
    lightboxCalls.push({ url, caption });
  };

  const currentSession = {
    id: 'sess_1',
    messages: [
      { id: 'msg_user_1', role: 'user', content: '第一条用户提问', timestamp: 1000 },
      { id: 'msg_asst_1', role: 'assistant', content: '第一条助手回答', timestamp: 2000 }
    ]
  };

  const renderer = createMessageRenderer({
    state: { currentSession, isGenerating: false },
    ctx: mockCtx,
    sendMessage: mockSendMessage,
    openLightbox: mockOpenLightbox,
    escapeHtml: s => String(s),
    renderMarkdown: s => `<p>${s}</p>`,
    copyToClipboard: async () => {},
    chatInput: new MockElement('textarea'),
    pillAgent: new MockElement('div'),
    pillCot: new MockElement('div'),
    autoResizeInput: () => {},
    renderMessages: () => {},
    renderSessionsList: () => {},
    setGeneratingState: () => {},
    syncAttachmentsBar: () => {},
    updateHeader: () => {},
    updateSendOrStopButton: () => {}
  });

  assert.ok(renderer, 'Message renderer should be initialized');
  assert.strictEqual(typeof renderer.createMessageElement, 'function');
  console.log('PASS: createMessageRenderer accepts ctx, sendMessage, openLightbox dependencies');

  // 2. Test user message rendering and clicking "重发" (.btn-tool-resend)
  const userMsgEl = renderer.createMessageElement(currentSession.messages[0]);
  assert.ok(userMsgEl, 'User message element should be created');
  const btnResend = userMsgEl.querySelector('.btn-tool-resend');
  assert.ok(btnResend, 'User message toolbar should contain .btn-tool-resend button');

  // Trigger click on "重发"
  btnResend.click();
  assert.ok(sentParams, 'Clicking resend must invoke sendMessage');
  assert.strictEqual(sentParams.text, '第一条用户提问', 'Resent text should match user message');
  assert.strictEqual(sentParams.editMessageId, 'msg_user_1', 'Resent editMessageId should match user message id');
  assert.deepStrictEqual(sentParams.atts, [], 'Resent attachments should default to empty array');
  console.log('PASS: User message .btn-tool-resend triggers sendMessage with correct arguments');

  // 3. Test user message with attachments and images resending
  const userMsgWithAtts = {
    id: 'msg_user_2',
    role: 'user',
    content: '带附件的消息',
    attachments: [{ type: 'file', name: 'data.txt', content: '123' }],
    timestamp: 3000
  };
  currentSession.messages.push(userMsgWithAtts);
  const msgWithAttsEl = renderer.createMessageElement(userMsgWithAtts);
  const btnResendAtts = msgWithAttsEl.querySelector('.btn-tool-resend');
  btnResendAtts.click();
  assert.strictEqual(sentParams.text, '带附件的消息');
  assert.strictEqual(sentParams.editMessageId, 'msg_user_2');
  assert.strictEqual(sentParams.atts.length, 1);
  assert.strictEqual(sentParams.atts[0].name, 'data.txt');
  console.log('PASS: User message with attachments resends preserved attachments');

  // 4. Test assistant message rendering and clicking "重新生成" (.btn-tool-regen)
  const asstMsgEl = renderer.createMessageElement(currentSession.messages[1]);
  assert.ok(asstMsgEl, 'Assistant message element should be created');
  const btnRegen = asstMsgEl.querySelector('.btn-tool-regen');
  assert.ok(btnRegen, 'Assistant message toolbar should contain .btn-tool-regen button');

  btnRegen.click();
  assert.ok(sentParams, 'Clicking regen must invoke sendMessage');
  assert.strictEqual(sentParams.text, '第一条用户提问', 'Regen should use the preceding user message text');
  assert.strictEqual(sentParams.editMessageId, 'msg_user_1', 'Regen should use preceding user message id');
  console.log('PASS: Assistant message .btn-tool-regen triggers sendMessage of previous user message');

  // 5. Test message delete (.btn-tool-del)
  const btnDel = userMsgEl.querySelector('.btn-tool-del');
  assert.ok(btnDel, 'Message toolbar should contain .btn-tool-del button');
  btnDel.click();
  assert.strictEqual(ctxCalls.length, 1, 'Clicking delete should invoke ctx.call');
  assert.strictEqual(ctxCalls[0].method, 'deleteMessage');
  assert.strictEqual(ctxCalls[0].args.messageId, 'msg_user_1');
  console.log('PASS: Message .btn-tool-del invokes ctx.call deleteMessage');

  // 6. Test lightbox invocation on images
  const userMsgWithImg = {
    id: 'msg_user_3',
    role: 'user',
    content: '看图',
    images: [{ url: 'https://example.com/test.png', name: 'test.png' }],
    timestamp: 4000
  };
  const msgWithImgEl = renderer.createMessageElement(userMsgWithImg);
  const thumb = msgWithImgEl.querySelector('.ai-msg-image-thumb');
  assert.ok(thumb, 'Image thumbnail should exist');
  thumb.click();
  assert.strictEqual(lightboxCalls.length, 1, 'Clicking thumbnail should invoke openLightbox');
  assert.strictEqual(lightboxCalls[0].url, 'https://example.com/test.png');
  console.log('PASS: Image thumbnail click invokes openLightbox');
}

console.log('\n========================================');
console.log('🎉 ALL AI CHAT MESSAGE TOOLBAR & RESEND TESTS PASSED!');
console.log('========================================');
