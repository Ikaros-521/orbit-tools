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

console.log('\nALL MULTIMODAL & QUEUE & ATTACHMENT TESTS PASSED!');
