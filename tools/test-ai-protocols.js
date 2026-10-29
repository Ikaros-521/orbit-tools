/* Unit tests for AI Multi-Protocol Parsers & Agent Tools
   Run with: node tools/test-ai-protocols.js */

const assert = require('assert');
const { PROTOCOLS, SSEParser, fetchRemoteModels } = require('../src/plugins/ai-chat/protocols');
const { AGENT_TOOLS_DEFINITIONS, executeAgentTool } = require('../src/plugins/ai-chat/agent-tools');

function testOpenAIChatProtocol() {
  const adapter = PROTOCOLS['openai-chat'];
  assert(adapter, 'OpenAI Chat adapter must exist');

  // 1. Build request
  const req = adapter.buildRequest({
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: 'sk-test-123',
    model: 'deepseek-reasoner',
    temperature: 0.6,
    messages: [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' }
    ]
  });

  assert.strictEqual(req.url, 'https://api.deepseek.com/v1/chat/completions');
  assert.strictEqual(req.headers['Authorization'], 'Bearer sk-test-123');
  const body = JSON.parse(req.body);
  assert.strictEqual(body.model, 'deepseek-reasoner');
  assert.strictEqual(body.stream, true);
  assert.strictEqual(body.messages.length, 2);

  // 2. Stream event handling (Content + CoT + Usage)
  const events = [];
  const emit = ev => events.push(ev);

  adapter.handleStreamEvent({
    data: {
      choices: [{
        delta: {
          reasoning_content: 'Let me think...',
          content: 'Hello!'
        }
      }],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
    }
  }, emit);

  assert.deepStrictEqual(events, [
    { type: 'usage', usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 } },
    { type: 'reasoning', delta: 'Let me think...' },
    { type: 'content', delta: 'Hello!' }
  ]);

  console.log('PASS: OpenAI Chat Protocol & Reasoning parsing');
}

function testClaudeMessagesProtocol() {
  const adapter = PROTOCOLS['claude-messages'];
  assert(adapter, 'Claude Messages adapter must exist');

  // 1. Build request with Native Thinking (CoT)
  const req = adapter.buildRequest({
    baseUrl: 'https://api.anthropic.com/v1',
    apiKey: 'sk-ant-test',
    model: 'claude-3-7-sonnet-20250219',
    enableReasoning: true,
    thinkingBudget: 2048,
    messages: [
      { role: 'system', content: 'System instruction' },
      { role: 'user', content: 'What is 2+2?' }
    ]
  });

  assert.strictEqual(req.url, 'https://api.anthropic.com/v1/messages');
  assert.strictEqual(req.headers['x-api-key'], 'sk-ant-test');
  assert.strictEqual(req.headers['anthropic-version'], '2023-06-01');
  const body = JSON.parse(req.body);
  assert.strictEqual(body.model, 'claude-3-7-sonnet-20250219');
  assert.strictEqual(body.system, 'System instruction');
  assert.deepStrictEqual(body.thinking, { type: 'enabled', budget_tokens: 2048 });

  // 2. Stream events (thinking_delta, text_delta)
  const events = [];
  const emit = ev => events.push(ev);

  adapter.handleStreamEvent({
    data: {
      type: 'content_block_delta',
      delta: { type: 'thinking_delta', thinking: 'Calculating 2+2...' }
    }
  }, emit);

  adapter.handleStreamEvent({
    data: {
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'The answer is 4.' }
    }
  }, emit);

  adapter.handleStreamEvent({ data: { type: 'message_stop' } }, emit);

  assert.strictEqual(events[0].type, 'reasoning');
  assert.strictEqual(events[0].delta, 'Calculating 2+2...');
  assert.strictEqual(events[1].type, 'content');
  assert.strictEqual(events[1].delta, 'The answer is 4.');
  assert.strictEqual(events[2].type, 'done');

  console.log('PASS: Claude Messages Protocol & Native Thinking parsing');
}

function testOpenAIResponsesProtocol() {
  const adapter = PROTOCOLS['openai-responses'];
  assert(adapter, 'OpenAI Responses adapter must exist');

  const req = adapter.buildRequest({
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-test',
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Hello responses' }]
  });

  assert.strictEqual(req.url, 'https://api.openai.com/v1/responses');
  const body = JSON.parse(req.body);
  assert.strictEqual(body.model, 'gpt-4o');
  assert.strictEqual(body.input[0].content, 'Hello responses');

  console.log('PASS: OpenAI Responses Protocol parsing');
}

function testSSEParser() {
  const events = [];
  const parser = new SSEParser(ev => events.push(ev));

  parser.feed('data: {"text":"hello"}\n\n');
  parser.feed('data: {"text":"world"}\n\ndata: [DONE]\n\n');

  assert.strictEqual(events.length, 3);
  assert.strictEqual(events[0].data.text, 'hello');
  assert.strictEqual(events[1].data.text, 'world');
  assert.strictEqual(events[2].type, 'done');

  console.log('PASS: SSE Stream Parser buffer & chunks');
}

async function testAgentTools() {
  assert(AGENT_TOOLS_DEFINITIONS.length >= 4, 'Must have at least 4 agent tools');

  // 1. run_javascript
  const mathRes = await executeAgentTool('run_javascript', { code: 'return Math.sqrt(144) * 5;' });
  assert.strictEqual(mathRes.ok, true);
  assert.strictEqual(mathRes.result, '60');

  // 2. get_current_time
  const timeRes = await executeAgentTool('get_current_time', {});
  assert.strictEqual(timeRes.ok, true);
  assert(timeRes.localTime, 'Must have localTime');

  // 3. create_workflow
  const fakeWorkflows = {
    list: () => [],
    save: wf => { fakeWorkflows.lastSaved = wf; return [wf]; }
  };
  const wfRes = await executeAgentTool('create_workflow', {
    name: '自动生成的流程',
    desc: 'Agent 自动创建',
    nodes: [
      { id: 'n1', type: 'source/text', title: '起点', config: { text: 'ok' } }
    ],
    edges: []
  }, { workflows: fakeWorkflows });

  assert.strictEqual(wfRes.ok, true);
  assert.strictEqual(fakeWorkflows.lastSaved.name, '自动生成的流程');
  assert.strictEqual(fakeWorkflows.lastSaved.nodes.length, 1);

  console.log('PASS: Agent Tools (run_javascript, get_current_time, create_workflow)');
}

async function testFetchRemoteModels() {
  const http = require('http');
  const server = http.createServer((req, res) => {
    if (req.url === '/v1/models') {
      assert(req.headers['authorization'] === 'Bearer sk-mock-key' || req.headers['x-api-key']);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        data: [
          { id: 'deepseek-chat', object: 'model' },
          { id: 'deepseek-reasoner', object: 'model' },
          { id: 'gpt-4o', object: 'model' }
        ]
      }));
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/v1`;

  try {
    const models = await fetchRemoteModels({
      protocol: 'openai-chat',
      baseUrl,
      apiKey: 'sk-mock-key'
    });
    assert.strictEqual(models.length, 3);
    assert(models.includes('deepseek-reasoner'));
    assert(models.includes('gpt-4o'));
    console.log('PASS: fetchRemoteModels from API endpoint');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function main() {
  testOpenAIChatProtocol();
  testClaudeMessagesProtocol();
  testOpenAIResponsesProtocol();
  testSSEParser();
  await testAgentTools();
  await testFetchRemoteModels();
  console.log('\nALL PROTOCOL & AGENT TESTS PASSED!');
}

main().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
