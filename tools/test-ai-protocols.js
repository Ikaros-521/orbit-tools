/* Unit tests for AI Multi-Protocol Parsers & Agent Tools
   Run with: node tools/test-ai-protocols.js */

const assert = require('assert');
const { PROTOCOLS, SSEParser, fetchRemoteModels } = require('../src/plugins/ai-chat/protocols');
const { AGENT_TOOLS_DEFINITIONS, executeAgentTool } = require('../src/plugins/ai-chat/agent-tools');

/* ---- Streaming test helpers ---- */

function sseEvent(eventName, data) {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

// Drives raw SSE text through the parser into an adapter, collecting adapter events.
function driveSse(adapter, chunks) {
  const events = [];
  const state = adapter.createStreamState();
  const parser = new SSEParser(ev => adapter.handleStreamEvent(ev, e => events.push(e), state));
  for (const chunk of chunks) parser.feed(chunk);
  parser.finish();
  return events;
}

// Mirrors backend.js tool_calls accumulation (src/plugins/ai-chat/backend.js ~lines 737-747)
function simulateBackendToolAssembly(events) {
  const currentToolCalls = [];
  for (const event of events) {
    if (event.type === 'tool_calls') {
      for (const tc of event.delta) {
        const idx = tc.index ?? 0;
        if (!currentToolCalls[idx]) {
          currentToolCalls[idx] = { id: tc.id || `tc_${idx}`, type: 'function', function: { name: '', arguments: '' } };
        }
        if (tc.function && tc.function.name) currentToolCalls[idx].function.name += tc.function.name;
        if (tc.function && tc.function.arguments) currentToolCalls[idx].function.arguments += tc.function.arguments;
      }
    }
  }
  return currentToolCalls.filter(Boolean);
}

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

function testClaudeStreamingToolUse() {
  const adapter = PROTOCOLS['claude-messages'];
  assert(adapter.createStreamState, 'Claude adapter must expose per-stream state');

  const sse = [
    sseEvent('message_start', { type: 'message_start', message: { id: 'msg_1', usage: { input_tokens: 25, output_tokens: 1 } } }),
    sseEvent('ping', { type: 'ping' }),
    sseEvent('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } }),
    sseEvent('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'User wants weather. ' } }),
    sseEvent('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'Use get_weather.' } }),
    sseEvent('content_block_stop', { type: 'content_block_stop', index: 0 }),
    sseEvent('content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } }),
    sseEvent('content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'Let me check ' } }),
    sseEvent('content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: 'the weather.' } }),
    sseEvent('content_block_stop', { type: 'content_block_stop', index: 1 }),
    sseEvent('content_block_start', { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'toolu_01ABC', name: 'get_weather' } }),
    sseEvent('content_block_delta', { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '{"city":' } }),
    sseEvent('content_block_delta', { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: '"Paris","unit":"celsius"}' } }),
    sseEvent('content_block_stop', { type: 'content_block_stop', index: 2 }),
    sseEvent('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 42 } }),
    sseEvent('message_stop', { type: 'message_stop' })
  ].join('');

  // Feed as two uneven raw chunks so events straddle the SSE buffer
  const cut = Math.floor(sse.length * 0.6);
  const events = driveSse(adapter, [sse.slice(0, cut), sse.slice(cut)]);

  const content = events.filter(e => e.type === 'content').map(e => e.delta).join('');
  assert.strictEqual(content, 'Let me check the weather.');
  const reasoning = events.filter(e => e.type === 'reasoning').map(e => e.delta).join('');
  assert.strictEqual(reasoning, 'User wants weather. Use get_weather.');

  assert.deepStrictEqual(
    events.find(e => e.type === 'usage'),
    { type: 'usage', usage: { promptTokens: 25, completionTokens: 0, totalTokens: 25 } }
  );
  assert.deepStrictEqual(
    events.find(e => e.type === 'usage_delta'),
    { type: 'usage_delta', usage: { completionTokens: 42 } }
  );

  const toolEvents = events.filter(e => e.type === 'tool_calls');
  assert.strictEqual(toolEvents.length, 1, 'must emit exactly one consolidated tool_calls event');
  assert.deepStrictEqual(toolEvents[0], {
    type: 'tool_calls',
    delta: [{
      index: 0,
      id: 'toolu_01ABC',
      type: 'function',
      function: { name: 'get_weather', arguments: '{"city":"Paris","unit":"celsius"}' }
    }]
  });

  // tool_calls must arrive before done; done must be the terminal event
  assert.ok(events.indexOf(toolEvents[0]) < events.findIndex(e => e.type === 'done'), 'tool_calls must precede done');
  assert.strictEqual(events[events.length - 1].type, 'done');

  // Arguments must parse back into the tool input object
  assert.deepStrictEqual(JSON.parse(toolEvents[0].delta[0].function.arguments), { city: 'Paris', unit: 'celsius' });

  // Backend.js accumulation contract must reconstruct the call identically
  const assembled = simulateBackendToolAssembly(events);
  assert.strictEqual(assembled.length, 1);
  assert.strictEqual(assembled[0].id, 'toolu_01ABC');
  assert.strictEqual(assembled[0].function.name, 'get_weather');
  assert.deepStrictEqual(JSON.parse(assembled[0].function.arguments), { city: 'Paris', unit: 'celsius' });

  console.log('PASS: Claude streaming tool_use assembly (thinking + text + split input_json_delta)');
}

function testResponsesStreamingToolUse() {
  const adapter = PROTOCOLS['openai-responses'];
  assert(adapter.createStreamState, 'Responses adapter must expose per-stream state');

  const sse = [
    sseEvent('response.created', { type: 'response.created', response: { id: 'resp_1' } }),
    sseEvent('response.output_item.added', { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_1', role: 'assistant', content: [] } }),
    sseEvent('response.output_text.delta', { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, delta: 'Checking now. ' }),
    sseEvent('response.output_text.delta', { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, delta: 'Done.' }),
    sseEvent('response.output_item.added', { type: 'response.output_item.added', output_index: 1, item: { type: 'function_call', id: 'fc_77', call_id: 'call_abc', name: 'run_javascript', arguments: '', status: 'in_progress' } }),
    sseEvent('response.function_call_arguments.delta', { type: 'response.function_call_arguments.delta', item_id: 'fc_77', output_index: 1, delta: '{"code":' }),
    sseEvent('response.function_call_arguments.delta', { type: 'response.function_call_arguments.delta', item_id: 'fc_77', output_index: 1, delta: '"return 6*7"}' }),
    sseEvent('response.output_item.done', { type: 'response.output_item.done', output_index: 1, item: { type: 'function_call', id: 'fc_77', call_id: 'call_abc', name: 'run_javascript', arguments: '{"code":"return 6*7"}', status: 'completed' } }),
    sseEvent('response.completed', { type: 'response.completed', response: { id: 'resp_1', usage: { input_tokens: 12, output_tokens: 34, total_tokens: 46 } } })
  ].join('');

  const events = driveSse(adapter, [sse]);

  const content = events.filter(e => e.type === 'content').map(e => e.delta).join('');
  assert.strictEqual(content, 'Checking now. Done.');

  assert.deepStrictEqual(
    events.find(e => e.type === 'usage'),
    { type: 'usage', usage: { promptTokens: 12, completionTokens: 34, totalTokens: 46 } }
  );

  const toolEvents = events.filter(e => e.type === 'tool_calls');
  assert.strictEqual(toolEvents.length, 1, 'must emit exactly one consolidated tool_calls event');
  assert.deepStrictEqual(toolEvents[0], {
    type: 'tool_calls',
    delta: [{
      index: 0,
      id: 'call_abc',
      type: 'function',
      function: { name: 'run_javascript', arguments: '{"code":"return 6*7"}' }
    }]
  });

  const assembled = simulateBackendToolAssembly(events);
  assert.strictEqual(assembled.length, 1);
  assert.strictEqual(assembled[0].id, 'call_abc');
  assert.strictEqual(assembled[0].function.name, 'run_javascript');
  assert.deepStrictEqual(JSON.parse(assembled[0].function.arguments), { code: 'return 6*7' });

  console.log('PASS: OpenAI Responses streaming text (string delta) + function_call assembly');
}

function testToolCallMalformedArguments() {
  // (1) Claude tool_use with NO input_json_delta → '{}' arguments, no throw
  const claude = PROTOCOLS['claude-messages'];
  let events = driveSse(claude, [
    sseEvent('message_start', { type: 'message_start', message: { id: 'msg_2', usage: { input_tokens: 5, output_tokens: 1 } } }),
    sseEvent('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_empty', name: 'get_current_time' } }),
    sseEvent('content_block_stop', { type: 'content_block_stop', index: 0 }),
    sseEvent('message_stop', { type: 'message_stop' })
  ]);
  let toolEv = events.find(e => e.type === 'tool_calls');
  assert(toolEv, 'empty-args tool_use must still emit tool_calls');
  assert.strictEqual(toolEv.delta[0].id, 'toolu_empty');
  assert.strictEqual(toolEv.delta[0].function.name, 'get_current_time');
  assert.strictEqual(toolEv.delta[0].function.arguments, '{}');

  // (2) Claude tool_use with truncated (malformed) partial_json → '{}' arguments, no throw
  events = driveSse(claude, [
    sseEvent('message_start', { type: 'message_start', message: { id: 'msg_3', usage: { input_tokens: 5, output_tokens: 1 } } }),
    sseEvent('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_bad', name: 'run_javascript' } }),
    sseEvent('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"code": "return [1,' } }),
    sseEvent('content_block_stop', { type: 'content_block_stop', index: 0 }),
    sseEvent('message_stop', { type: 'message_stop' })
  ]);
  toolEv = events.find(e => e.type === 'tool_calls');
  assert(toolEv, 'malformed-args tool_use must still emit tool_calls');
  assert.strictEqual(toolEv.delta[0].function.arguments, '{}');

  // (3) Responses function_call truncated in output_item.done → '{}' arguments, no throw
  const responses = PROTOCOLS['openai-responses'];
  events = driveSse(responses, [
    sseEvent('response.created', { type: 'response.created', response: { id: 'resp_2' } }),
    sseEvent('response.output_item.added', { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', id: 'fc_bad', call_id: 'call_bad', name: 'run_javascript', arguments: '' } }),
    sseEvent('response.function_call_arguments.delta', { type: 'response.function_call_arguments.delta', item_id: 'fc_bad', output_index: 0, delta: '{"code": "retu' }),
    sseEvent('response.output_item.done', { type: 'response.output_item.done', output_index: 0, item: { type: 'function_call', id: 'fc_bad', call_id: 'call_bad', name: 'run_javascript', arguments: '{"code": "retu' } }),
    sseEvent('response.completed', { type: 'response.completed', response: { id: 'resp_2', usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7 } } })
  ]);
  toolEv = events.find(e => e.type === 'tool_calls');
  assert(toolEv, 'malformed Responses function_call must still emit tool_calls');
  assert.strictEqual(toolEv.delta[0].function.arguments, '{}');

  // (4) Responses function_call missing output_item.done is flushed by response.completed
  events = driveSse(responses, [
    sseEvent('response.created', { type: 'response.created', response: { id: 'resp_3' } }),
    sseEvent('response.output_item.added', { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', id: 'fc_lost', call_id: 'call_lost', name: 'get_current_time', arguments: '' } }),
    sseEvent('response.function_call_arguments.delta', { type: 'response.function_call_arguments.delta', item_id: 'fc_lost', output_index: 0, delta: '{}' }),
    sseEvent('response.completed', { type: 'response.completed', response: { id: 'resp_3', usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7 } } })
  ]);
  toolEv = events.find(e => e.type === 'tool_calls');
  assert(toolEv, 'response.completed must flush unfinished function_call items');
  assert.strictEqual(toolEv.delta[0].id, 'call_lost');
  assert.strictEqual(toolEv.delta[0].function.arguments, '{}');

  console.log('PASS: Malformed/empty tool-call arguments degrade to {} without throwing');
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

async function testFallbackMechanism() {
  const http = require('http');
  const server = http.createServer(async (req, res) => {
    let raw = '';
    req.on('data', c => raw += c);
    req.on('end', () => {
      try {
        const body = JSON.parse(raw);
        if (body.model === 'fail-primary') {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Primary model overloaded' } }));
        } else if (body.model === 'backup-model') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            choices: [{ message: { role: 'assistant', content: 'Fallback Success' } }]
          }));
        } else {
          res.writeHead(400);
          res.end('Unknown model');
        }
      } catch {
        res.writeHead(400);
        res.end('Bad body');
      }
    });
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/v1`;

  const { syncCompletion } = require('../src/plugins/ai-chat/protocols');
  const reqOpts = {
    protocol: 'openai-chat',
    baseUrl,
    apiKey: 'sk-mock',
    model: 'fail-primary',
    messages: [{ role: 'user', content: 'hi' }]
  };

  // Test automatic fallback pattern
  let res;
  let fallbackInvoked = false;
  try {
    res = await syncCompletion(reqOpts);
  } catch (err) {
    const fallback = 'backup-model';
    if (fallback && fallback !== reqOpts.model) {
      fallbackInvoked = true;
      res = await syncCompletion({ ...reqOpts, model: fallback });
      res.fallbackFrom = reqOpts.model;
    }
  }

  assert.strictEqual(fallbackInvoked, true);
  assert.strictEqual(res.content, 'Fallback Success');
  assert.strictEqual(res.fallbackFrom, 'fail-primary');
  console.log('PASS: Fallback Model Automatic Recovery');

  await new Promise(resolve => server.close(resolve));
}

async function main() {
  testOpenAIChatProtocol();
  testClaudeMessagesProtocol();
  testOpenAIResponsesProtocol();
  testSSEParser();
  testClaudeStreamingToolUse();
  testResponsesStreamingToolUse();
  testToolCallMalformedArguments();
  await testAgentTools();
  await testFetchRemoteModels();
  await testFallbackMechanism();
  console.log('\nALL PROTOCOL & AGENT TESTS PASSED!');
}

main().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
