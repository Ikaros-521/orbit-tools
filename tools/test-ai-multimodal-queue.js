const assert = require('assert');
const { PROTOCOLS } = require('../src/plugins/ai-chat/protocols');
const OpenAIChatAdapter = PROTOCOLS['openai-chat'];
const ClaudeMessagesAdapter = PROTOCOLS['claude-messages'];
const OpenAIResponsesAdapter = PROTOCOLS['openai-responses'];

console.log('Testing Multimodal Vision & Protocols...');

// 1. OpenAI Chat Adapter - Multimodal vision format
{
  const testImg1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const testImg2 = 'https://example.com/sample.jpg';

  const req = OpenAIChatAdapter.buildRequest({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: '请分析这张图',
        images: [{ url: testImg1, name: 'dot.png' }, testImg2]
      }
    ]
  });

  const parsedBody = JSON.parse(req.body);
  assert.strictEqual(parsedBody.model, 'gpt-4o');
  assert.strictEqual(parsedBody.messages.length, 1);
  const userMsg = parsedBody.messages[0];
  assert.strictEqual(userMsg.role, 'user');
  assert.ok(Array.isArray(userMsg.content), 'content should be an array for vision messages');
  assert.strictEqual(userMsg.content.length, 3);
  assert.deepStrictEqual(userMsg.content[0], { type: 'text', text: '请分析这张图' });
  assert.deepStrictEqual(userMsg.content[1], { type: 'image_url', image_url: { url: testImg1 } });
  assert.deepStrictEqual(userMsg.content[2], { type: 'image_url', image_url: { url: testImg2 } });
  console.log('PASS: OpenAI Chat Protocol converts images to standard image_url format');
}

// 2. Claude Messages Adapter - Base64 media_type extraction
{
  const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const testImg = `data:image/png;base64,${base64Data}`;

  const req = ClaudeMessagesAdapter.buildRequest({
    model: 'claude-3-5-sonnet-20241022',
    messages: [
      {
        role: 'user',
        content: '描述图像内容',
        images: [{ url: testImg }]
      }
    ]
  });

  const parsedBody = JSON.parse(req.body);
  assert.strictEqual(parsedBody.messages.length, 1);
  const userMsg = parsedBody.messages[0];
  assert.strictEqual(userMsg.role, 'user');
  assert.ok(Array.isArray(userMsg.content));
  // First item is the image block, second is text block
  const imgBlock = userMsg.content[0];
  assert.strictEqual(imgBlock.type, 'image');
  assert.strictEqual(imgBlock.source.type, 'base64');
  assert.strictEqual(imgBlock.source.media_type, 'image/png');
  assert.strictEqual(imgBlock.source.data, base64Data);

  const textBlock = userMsg.content[1];
  assert.strictEqual(textBlock.type, 'text');
  assert.strictEqual(textBlock.text, '描述图像内容');
  console.log('PASS: Claude Messages Protocol parses base64 data and media_type blocks');
}

// 3. OpenAI Responses Adapter - input_image items
{
  const testImg = 'data:image/webp;base64,AAAA';
  const req = OpenAIResponsesAdapter.buildRequest({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: '架构图识别',
        images: [{ url: testImg }]
      }
    ]
  });

  const parsedBody = JSON.parse(req.body);
  assert.ok(Array.isArray(parsedBody.input));
  assert.strictEqual(parsedBody.input.length, 1);
  const inputItem = parsedBody.input[0];
  assert.ok(Array.isArray(inputItem.content));
  assert.deepStrictEqual(inputItem.content[0], { type: 'input_text', text: '架构图识别' });
  assert.deepStrictEqual(inputItem.content[1], { type: 'input_image', image_url: testImg });
  console.log('PASS: OpenAI Responses Protocol converts to input_image array');
}

// 4. Prompt Queue & Dynamic Button Logic Simulation
console.log('Testing Prompt Queue State Machine & Button Dynamics...');
{
  // Button state resolver logic identical to panel.js
  function resolveBtnState({ isGenerating, inputValue, attachmentsCount }) {
    const hasInput = (inputValue && inputValue.trim().length > 0) || (attachmentsCount > 0);
    if (!isGenerating) {
      return { action: 'send', class: 'ai-btn-action send', title: '发送消息 (Enter)' };
    }
    if (hasInput) {
      return { action: 'queue', class: 'ai-btn-action send queue', title: '加入待发送队列 (Enter) · 当前回答完成后自动发送' };
    }
    return { action: 'stop', class: 'ai-btn-action stop', title: '中断生成' };
  }

  // State 1: Idle, input empty -> Send
  let state = resolveBtnState({ isGenerating: false, inputValue: '', attachmentsCount: 0 });
  assert.strictEqual(state.action, 'send');

  // State 2: Idle, input non-empty -> Send
  state = resolveBtnState({ isGenerating: false, inputValue: 'Hello', attachmentsCount: 0 });
  assert.strictEqual(state.action, 'send');

  // State 3: Generating, input empty -> Stop (pause)
  state = resolveBtnState({ isGenerating: true, inputValue: '', attachmentsCount: 0 });
  assert.strictEqual(state.action, 'stop');

  // State 4: Generating, user types text -> Becomes Send (Queue mode)
  state = resolveBtnState({ isGenerating: true, inputValue: '后续任务', attachmentsCount: 0 });
  assert.strictEqual(state.action, 'queue');
  assert.ok(state.class.includes('send') && state.class.includes('queue'));

  // State 5: Generating, text empty but has image/file attached -> Becomes Send (Queue mode)
  state = resolveBtnState({ isGenerating: true, inputValue: '', attachmentsCount: 1 });
  assert.strictEqual(state.action, 'queue');

  // State 6: User sends/enqueues, input clears -> Immediately reverts to Stop
  state = resolveBtnState({ isGenerating: true, inputValue: '', attachmentsCount: 0 });
  assert.strictEqual(state.action, 'stop');

  // State 7: Stream completes -> Reverts to Send
  state = resolveBtnState({ isGenerating: false, inputValue: '', attachmentsCount: 0 });
  assert.strictEqual(state.action, 'send');

  console.log('PASS: Send/Stop/Queue button dynamic transitions verified');

  // Queue FIFO and Recall test
  const queue = [];
  function enqueue(text, attachments = []) {
    queue.push({ id: 'q_' + (queue.length + 1), text, attachments });
  }

  enqueue('第一条排队指令');
  enqueue('第二条排队指令', [{ type: 'image', name: 'img1.png' }]);
  enqueue('第三条排队指令');
  assert.strictEqual(queue.length, 3);

  // Edit/Recall item 2
  const recalled = queue.splice(1, 1)[0];
  assert.strictEqual(recalled.text, '第二条排队指令');
  assert.strictEqual(recalled.attachments.length, 1);
  assert.strictEqual(queue.length, 2);

  // Auto Dequeue FIFO
  const next1 = queue.shift();
  assert.strictEqual(next1.text, '第一条排队指令');
  const next2 = queue.shift();
  assert.strictEqual(next2.text, '第三条排队指令');
  assert.strictEqual(queue.length, 0);

  console.log('PASS: Prompt Queue FIFO enqueue, recall, and dequeue logic verified');
}

// 5. Unified Attachments (Files & Directories Context Assembling)
console.log('Testing Unified Attachments (Images, Files, Directories)...');
{
  function assemblePayload(userText, attachments) {
    const images = [];
    const fileContextBlocks = [];
    for (const att of attachments) {
      if (att.type === 'image' || att.url || att.isImage) {
        images.push({ url: att.url || att.dataUrl, name: att.name });
      } else if (att.type === 'file') {
        if (att.content) {
          fileContextBlocks.push(`[附件文件: ${att.path || att.name}]\n\`\`\`\n${att.content}\n\`\`\``);
        } else if (att.path) {
          fileContextBlocks.push(`[关联文件: ${att.path}]`);
        }
      } else if (att.type === 'directory') {
        fileContextBlocks.push(`[关联工作区文件夹: ${att.path}]`);
      }
    }
    let finalText = userText;
    if (fileContextBlocks.length > 0) {
      finalText = finalText ? `${finalText}\n\n${fileContextBlocks.join('\n\n')}` : fileContextBlocks.join('\n\n');
    }
    return { text: finalText, images, attachments };
  }

  const atts = [
    { type: 'image', name: 'demo.png', url: 'data:image/png;base64,123' },
    { type: 'file', name: 'package.json', path: 'E:/proj/package.json', content: '{"name":"test"}' },
    { type: 'directory', name: 'src', path: 'E:/proj/src' }
  ];

  const payload = assemblePayload('请帮我检查这个项目', atts);
  assert.strictEqual(payload.images.length, 1);
  assert.strictEqual(payload.images[0].name, 'demo.png');
  assert.ok(payload.text.includes('请帮我检查这个项目'));
  assert.ok(payload.text.includes('[附件文件: E:/proj/package.json]'));
  assert.ok(payload.text.includes('{"name":"test"}'));
  assert.ok(payload.text.includes('[关联工作区文件夹: E:/proj/src]'));
  console.log('PASS: Unified Attachments assembling files & directories into context verified');
}

// 6. DOM-Level Prompt Queue Component (renderPromptQueueBar, delete item, clear queue, recall)
console.log('Testing PromptQueue.renderPromptQueueBar DOM Interactions & Event Handlers...');
{
  const PromptQueue = require('../src/plugins/ai-chat/components/prompt-queue');

  class MockElement {
    constructor(tagName = 'div') {
      this.tagName = tagName.toUpperCase();
      this.classList = {
        _classes: new Set(),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        contains(c) { return this._classes.has(c); }
      };
      this.children = [];
      this.listeners = {};
      this._innerHTML = '';
      this.parentElement = null;
    }

    set innerHTML(html) {
      this._innerHTML = html;
      this.children = [];
      if (!html) return;
      if (html.includes('id="btnClearPromptQueue"')) {
        const btnClear = new MockElement('button');
        btnClear.id = 'btnClearPromptQueue';
        btnClear.className = 'ai-queue-btn-clear';
        btnClear.parentElement = this;
        this.children.push(btnClear);
      }
      if (html.includes('class="ai-queue-list"')) {
        const listEl = new MockElement('div');
        listEl.className = 'ai-queue-list';
        listEl.parentElement = this;
        this.children.push(listEl);
      }
    }

    get innerHTML() {
      return this._innerHTML;
    }

    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }

    addEventListener(event, fn) {
      if (!this.listeners[event]) this.listeners[event] = [];
      this.listeners[event].push(fn);
    }

    click() {
      const fns = this.listeners['click'] || [];
      fns.forEach(fn => fn({ stopPropagation: () => {} }));
    }

    querySelector(selector) {
      if (selector.startsWith('#')) {
        const id = selector.slice(1);
        return this._find(el => el.id === id);
      }
      if (selector.startsWith('.')) {
        const cls = selector.slice(1).split('.');
        return this._find(el => el.className && cls.every(c => el.className.split(/\s+/).includes(c)));
      }
      return null;
    }

    querySelectorAll(selector) {
      const results = [];
      if (selector.startsWith('.')) {
        const cls = selector.slice(1).split('.');
        this._findAll(el => el.className && cls.every(c => el.className.split(/\s+/).includes(c)), results);
      }
      return results;
    }

    _find(predicate) {
      if (predicate(this)) return this;
      for (const child of this.children) {
        const found = child._find(predicate);
        if (found) return found;
      }
      return null;
    }

    _findAll(predicate, results) {
      if (predicate(this)) results.push(this);
      for (const child of this.children) {
        child._findAll(predicate, results);
      }
    }
  }

  // Setup minimal document mock for document.createElement in renderPromptQueueBar
  global.document = {
    createElement(tag) {
      const el = new MockElement(tag);
      el._originalSetInnerHTML = el.__lookupSetter__('innerHTML') || function(val) { el._innerHTML = val; };
      Object.defineProperty(el, 'innerHTML', {
        set(val) {
          el._innerHTML = val;
          // populate action buttons if matching ai-queue-item template
          if (val.includes('ai-queue-action-btn edit')) {
            const btnEdit = new MockElement('button');
            btnEdit.className = 'ai-queue-action-btn edit';
            el.appendChild(btnEdit);
          }
          if (val.includes('ai-queue-action-btn del')) {
            const btnDel = new MockElement('button');
            btnDel.className = 'ai-queue-action-btn del';
            el.appendChild(btnDel);
          }
        },
        get() {
          return el._innerHTML;
        }
      });
      return el;
    }
  };

  const container = new MockElement('div');
  const currentSession = { id: 'sess_1', title: '测试会话' };
  const sessionPromptQueues = new Map();

  const msg1 = { id: 'm1', text: '排队消息 1' };
  const msg2 = { id: 'm2', text: '排队消息 2' };
  const msg3 = { id: 'm3', text: '排队消息 3' };
  sessionPromptQueues.set('sess_1', [msg1, msg2, msg3]);

  let queueChangeNotified = 0;
  let recalledItem = null;

  PromptQueue.renderPromptQueueBar({
    container,
    currentSession,
    sessionPromptQueues,
    onRecall: (item) => { recalledItem = item; },
    onQueueChanged: () => { queueChangeNotified++; }
  });

  // Verify initial render
  assert.strictEqual(container.classList.contains('hidden'), false);
  const listEl = container.querySelector('.ai-queue-list');
  assert.ok(listEl, 'Queue list element should exist');
  assert.strictEqual(listEl.children.length, 3, 'Should have 3 rendered queue items');

  // Test 1: Delete middle item (msg2)
  const item2DelBtn = listEl.children[1].querySelector('.ai-queue-action-btn.del');
  assert.ok(item2DelBtn, 'Delete button for item 2 should exist');
  item2DelBtn.click();

  const qAfterDel = sessionPromptQueues.get('sess_1');
  assert.strictEqual(qAfterDel.length, 2, 'Queue should have 2 items remaining');
  assert.strictEqual(qAfterDel[0].id, 'm1');
  assert.strictEqual(qAfterDel[1].id, 'm3');
  assert.ok(queueChangeNotified >= 1, 'onQueueChanged should be called on deletion');

  // Verify container re-rendered automatically
  const listAfterDel = container.querySelector('.ai-queue-list');
  assert.strictEqual(listAfterDel.children.length, 2, 'DOM should re-render and contain 2 items');

  // Test 2: Edit/Recall item (m1)
  const item1EditBtn = listAfterDel.children[0].querySelector('.ai-queue-action-btn.edit');
  assert.ok(item1EditBtn, 'Edit button for item 1 should exist');
  item1EditBtn.click();

  assert.strictEqual(recalledItem.id, 'm1');
  const qAfterRecall = sessionPromptQueues.get('sess_1');
  assert.strictEqual(qAfterRecall.length, 1);
  assert.strictEqual(qAfterRecall[0].id, 'm3');

  // Test 3: Clear queue
  const btnClear = container.querySelector('#btnClearPromptQueue');
  assert.ok(btnClear, 'Clear queue button should exist');
  btnClear.click();

  const qAfterClear = sessionPromptQueues.get('sess_1');
  assert.strictEqual(qAfterClear.length, 0, 'Queue should be empty');
  assert.strictEqual(container.classList.contains('hidden'), true, 'Container should be hidden');
  assert.strictEqual(container.innerHTML, '', 'Container HTML should be empty');

  console.log('PASS: PromptQueue.renderPromptQueueBar delete item, recall, and clear queue verified');
}

console.log('\nALL MULTIMODAL & QUEUE & ATTACHMENT TESTS PASSED!');
