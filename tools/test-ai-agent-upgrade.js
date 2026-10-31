/* Tests for the agent-layer upgrade of ai-chat:
   1. memory.js — tokenizer, scoped keyword recall, CRUD tools, cap pruning
   2. task-tools.js — list normalization (single in_progress, caps) & prompt fmt
   3. local-tools edit_file / grep_search
   4. backend multi-round agent loop (scripted streamCompletion): tool chaining,
      task list + memory persistence & injection, dup tool-id rewrite,
      max-rounds cutoff with forced tool-free final answer, usage summing,
      and replay invariants of the stored history on the next turn.
   Run with: node tools/test-ai-agent-upgrade.js */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PLUGIN = path.join(__dirname, '..', 'src', 'plugins', 'ai-chat');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, timeout = 8000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > timeout) throw new Error('waitFor timeout');
    await sleep(15);
  }
};

async function main() {
  /* --- sandbox -------------------------------------------------------------- */
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-agent-upgrade-'));
  fs.writeFileSync(path.join(sandbox, 'note.md'), '# 标题\n\n第一段内容 hello-local\n第二行 world');
  fs.mkdirSync(path.join(sandbox, 'sub'));
  fs.writeFileSync(path.join(sandbox, 'sub', 'util.js'), 'const x = 1; // TODO marker\nconsole.log(x);\n');
  fs.writeFileSync(path.join(sandbox, 'binary.bin'), Buffer.from([0x00, 0x01, 0x02, 0x00]));

  /* --- 1. memory.js ---------------------------------------------------------- */
  {
    const mem = require(path.join(PLUGIN, 'memory.js'));

    const toks = mem.tokenizeText('用户偏好 pnpm 管理 依赖');
    assert.ok(toks.has('pnpm') && toks.has('用户') && toks.has('偏好'), JSON.stringify([...toks]));

    const list = [
      mem.createMemoryRecord({ content: '用户偏好使用 pnpm 管理依赖', type: 'preference' }),
      mem.createMemoryRecord({ content: '构建命令是 npm run dist', type: 'project', scope: sandbox }),
      mem.createMemoryRecord({ content: '会议纪要存放在 /tmp/minutes', type: 'fact' })
    ];
    // scope filter: project-scope records only surface for the matching dir
    let hits = mem.searchMemories(list, '构建 命令', { scope: sandbox });
    assert.strictEqual(hits.length, 1);
    assert.ok(hits[0].record.content.includes('npm run dist'));
    hits = mem.searchMemories(list, '构建 命令', { scope: path.join(sandbox, 'other') });
    assert.strictEqual(hits.length, 0, 'project memory must not leak into other scopes');
    hits = mem.searchMemories(list, 'pnpm 依赖', { scope: 'global' });
    assert.ok(hits.length >= 1 && hits[0].record.content.includes('pnpm'), 'global recall ranks the preference first');

    const block = mem.formatMemoriesForPrompt(mem.searchMemories(list, 'pnpm', { scope: 'global' }));
    assert.ok(block.startsWith('[长期记忆]') && block.includes('pnpm'));
    assert.strictEqual(mem.formatMemoriesForPrompt([]), '');

    // CRUD tools against a fake runtime
    const store = { memories: [...list], saved: 0 };
    const rt = { get memories() { return store.memories; }, set memories(v) { store.memories = v; }, save: () => { store.saved++; }, scope: sandbox };
    const wr = mem.executeMemoryTool('memory_write', { content: '测试写入的项目记忆', type: 'project', scope: 'project' }, rt);
    assert.ok(wr.ok && store.memories.some(m => m.content === '测试写入的项目记忆' && m.scope === sandbox));
    const wrId = store.memories.find(m => m.content === '测试写入的项目记忆').id;
    const sr = mem.executeMemoryTool('memory_search', { query: '测试 写入' }, rt);
    assert.ok(sr.ok && sr.matched >= 1 && sr.memories[0].id === wrId);
    const ls = mem.executeMemoryTool('memory_list', {}, rt);
    assert.ok(ls.ok && ls.count === 4 && ls.memories.every(m => m.scope === '全局' || m.scope === '项目'));
    const dl = mem.executeMemoryTool('memory_delete', { memory_id: wrId }, rt);
    assert.ok(dl.ok && !store.memories.some(m => m.id === wrId));
    assert.ok(store.saved >= 2, 'mutations persist');
    assert.ok(!mem.executeMemoryTool('memory_write', { content: '' }, rt).ok);

    console.log('PASS: memory tokenize/scope-recall/prompt-format/CRUD');
  }

  /* --- 2. task-tools.js ------------------------------------------------------ */
  {
    const { normalizeTaskList, formatTaskListForPrompt, summarizeTaskProgress } = require(path.join(PLUGIN, 'task-tools.js'));
    let r = normalizeTaskList([{ content: '定位代码' }, { content: '修改文件', status: 'in_progress' }, { content: '跑测试', status: 'bogus' }]);
    assert.ok(r.ok && r.tasks.length === 3);
    assert.strictEqual(r.tasks[0].status, 'pending', 'status defaults to pending');
    assert.strictEqual(r.tasks[2].status, 'pending', 'invalid status demoted to pending');
    r = normalizeTaskList([{ content: 'a', status: 'in_progress' }, { content: 'b', status: 'in_progress' }]);
    assert.strictEqual(r.tasks.filter(t => t.status === 'in_progress').length, 1, 'single in_progress enforced');
    assert.ok(!normalizeTaskList('nope').ok);
    assert.ok(!normalizeTaskList([]).ok);
    assert.ok(!normalizeTaskList(Array.from({ length: 25 }, (_, i) => ({ content: 't' + i }))).ok);
    const fmt = formatTaskListForPrompt([{ content: '步骤一', status: 'completed' }, { content: '步骤二', status: 'in_progress' }]);
    assert.ok(fmt.includes('[当前任务清单] 1/2') && fmt.includes('✓ 步骤一') && fmt.includes('步骤二（进行中）'));
    assert.strictEqual(summarizeTaskProgress([{ status: 'completed' }, { status: 'pending' }]), '1/2');
    console.log('PASS: task list normalize/format');
  }

  /* --- 3. local-tools: edit_file & grep_search ------------------------------- */
  {
    const { executeLocalTool } = require(path.join(PLUGIN, 'local-tools.js'));
    const rt = { workDir: sandbox };

    const ed1 = await executeLocalTool('edit_file', { path: 'sub/util.js', old_text: 'const x = 1;', new_text: 'const x = 42;' }, rt);
    assert.ok(ed1.ok && ed1.replacements === 1 && ed1.preview.includes('const x = 42;'), JSON.stringify(ed1));
    assert.strictEqual(fs.readFileSync(path.join(sandbox, 'sub', 'util.js'), 'utf8'), 'const x = 42; // TODO marker\nconsole.log(x);\n');

    const edAmb = await executeLocalTool('edit_file', { path: 'note.md', old_text: '第', new_text: 'X' }, rt);
    assert.ok(!edAmb.ok && /2 处/.test(edAmb.error), JSON.stringify(edAmb));

    fs.writeFileSync(path.join(sandbox, 'dup.txt'), 'aa\naa\naa\n');
    const edAll = await executeLocalTool('edit_file', { path: 'dup.txt', old_text: 'aa', new_text: 'bb', replace_all: true }, rt);
    assert.ok(edAll.ok && edAll.replacements === 3, JSON.stringify(edAll));
    assert.strictEqual(fs.readFileSync(path.join(sandbox, 'dup.txt'), 'utf8'), 'bb\nbb\nbb\n');

    const edMiss = await executeLocalTool('edit_file', { path: 'note.md', old_text: '不存在的文本', new_text: 'x' }, rt);
    assert.ok(!edMiss.ok && /未找到/.test(edMiss.error));
    const edNoop = await executeLocalTool('edit_file', { path: 'note.md', old_text: 'same', new_text: 'same' }, rt);
    assert.ok(!edNoop.ok);
    const edGone = await executeLocalTool('edit_file', { path: 'no-such.txt', old_text: 'a', new_text: 'b' }, rt);
    assert.ok(!edGone.ok && /不存在/.test(edGone.error));

    const g1 = await executeLocalTool('grep_search', { pattern: 'TODO' }, rt);
    assert.ok(g1.ok && g1.matches.length === 1 && g1.matches[0].file.includes('util.js') && g1.matches[0].line === 1, JSON.stringify(g1));

    const g2 = await executeLocalTool('grep_search', { pattern: 'cons(o?)ole\\.log', is_regex: true }, rt);
    assert.ok(g2.ok && g2.matches.length === 1 && g2.matches[0].text.includes('console.log(x)'));

    const g3 = await executeLocalTool('grep_search', { pattern: 'TODO', ignore_case: true }, rt);
    assert.ok(g3.ok && g3.matches.length === 1);
    const g4 = await executeLocalTool('grep_search', { pattern: 'todo', ignore_case: true }, rt);
    assert.ok(g4.ok && g4.matches.length === 1, 'ignore_case matches both cases');

    const gGlob = await executeLocalTool('grep_search', { pattern: 'hello-local', glob: '*.js' }, rt);
    assert.ok(gGlob.ok && gGlob.matches.length === 0, 'glob filter excludes note.md');
    const gBad = await executeLocalTool('grep_search', { pattern: '([unclosed' , is_regex: true }, rt);
    assert.ok(!gBad.ok && /正则无效/.test(gBad.error));
    const gBin = await executeLocalTool('grep_search', { pattern: '.' }, rt);
    assert.ok(gBin.ok && !gBin.matches.some(m => m.file.includes('binary.bin')), 'binary skipped');

    console.log('PASS: edit_file (unique/ambiguous/replaceAll/missing) + grep_search (literal/regex/case/glob/binary)');
  }

  /* --- 4. backend multi-round agent loop ------------------------------------- */
  const protocols = require(path.join(PLUGIN, 'protocols.js'));
  const calls = []; // every streamCompletion invocation: { opts, round# }
  const scripts = []; // per-invocation behavior queue (shifted)
  protocols.streamCompletion = async (opts, onChunk) => {
    calls.push({ opts, script: scripts.shift() });
    const step = calls[calls.length - 1].script;
    await step(opts, onChunk);
  };
  const backend = require(path.join(PLUGIN, 'backend.js'));

  function makeCtx() {
    const handlers = new Map();
    const chunks = [];
    const store = { config: {}, personas: [], sessions: [], activeSessionId: null };
    return {
      chunks, handlers, store,
      ipc: { handle: (n, f) => handlers.set(n, f) },
      data: { get: () => store, set: d => Object.assign(store, d) },
      send: (ch, payload) => chunks.push(payload.chunk),
      call: (n, a) => handlers.get(n)(a),
      workflows: { list: () => [], save: () => {} }
    };
  }
  const ctx = makeCtx();
  backend.activate(ctx);

  const emitTool = (onChunk, idx, id, name, args) =>
    onChunk({ type: 'tool_calls', delta: [{ index: idx, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] });

  // Scenario A: plan → act (3 tools incl. memory/task/grep) → final answer
  await ctx.call('saveConfig', { agentWorkDir: sandbox, agentApprovalMode: 'full' });
  let sid = (await ctx.call('getInitData')).activeSession.id;
  await ctx.call('setSessionWorkDir', { sessionId: sid, dir: sandbox });

  scripts.push(async (opts, onChunk) => {
    onChunk({ type: 'content', delta: '我先规划任务。' });
    onChunk({ type: 'usage', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } });
    emitTool(onChunk, 0, 'tc_plan', 'update_task_list', { tasks: [
      { content: '搜索示例文件', status: 'in_progress' },
      { content: '沉淀记忆', status: 'pending' }
    ] });
    emitTool(onChunk, 1, 'tc_mem', 'memory_write', { content: '用户偏好使用 pnpm 管理依赖', type: 'preference', scope: 'project' });
    emitTool(onChunk, 2, 'tc_grep', 'grep_search', { pattern: 'hello-local' });
  });
  scripts.push(async (opts, onChunk) => {
    onChunk({ type: 'usage', usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 } });
    onChunk({ type: 'content', delta: '最终回答完成。' });
  });

  await ctx.call('sendMessage', { sessionId: sid, content: '请规划并执行', enableAgent: true, enableReasoning: false, agentApprovalMode: 'full' });
  await waitFor(() => ctx.chunks.some(c => c.type === 'complete'));
  {
    assert.strictEqual(calls.length, 2, 'exactly two model rounds');
    const r2 = calls[1].opts;
    assert.ok(Array.isArray(r2.tools) && r2.tools.length > 0, 'follow-up round keeps the tool table (multi-round loop)');
    const asst = r2.messages.find(m => m.role === 'assistant' && Array.isArray(m.tool_calls));
    assert.ok(asst && asst.tool_calls.length === 3, 'round-2 context carries the assistant tool_calls');
    const toolMsgs = r2.messages.filter(m => m.role === 'tool');
    assert.strictEqual(toolMsgs.length, 3, 'each call got its tool response');
    assert.deepEqual(toolMsgs.map(m => m.tool_call_id).sort(), ['tc_grep', 'tc_mem', 'tc_plan']);

    const done = ctx.chunks.find(c => c.type === 'complete');
    assert.strictEqual(done.message.toolCalls.length, 3);
    assert.ok(done.message.content.includes('我先规划任务。') && done.message.content.includes('最终回答完成。'));
    assert.strictEqual(done.message.usage.promptTokens, 110, 'usage summed across rounds');
    assert.strictEqual(done.message.usage.completionTokens, 55);

    const taskChunk = ctx.chunks.find(c => c.type === 'task_list');
    assert.ok(taskChunk && taskChunk.tasks.length === 2 && taskChunk.tasks[0].status === 'in_progress');
    assert.ok(ctx.store.sessions[0].taskList && ctx.store.sessions[0].taskList.length === 2, 'task list persisted on session');
    assert.ok(ctx.store.memories.some(m => m.content.includes('pnpm') && m.scope === sandbox), 'agent memory persisted with project scope');
    console.log('PASS: multi-round loop (tool chaining + task list + memory persistence + usage sum)');
  }

  // Scenario B: next turn replays the stored multi-round history validly,
  // and system prompt carries memory recall + live task list
  const captured = [];
  scripts.push(async (opts) => { captured.push(opts.messages); });
  await ctx.call('sendMessage', { sessionId: sid, content: 'pnpm 怎么配置', enableAgent: true, enableReasoning: false, agentApprovalMode: 'full' });
  await waitFor(() => ctx.chunks.filter(c => c.type === 'complete').length >= 2);
  {
    const msgs = captured[0];
    const sys = msgs.find(m => m.role === 'system');
    assert.ok(sys && sys.content.includes('[长期记忆]') && sys.content.includes('pnpm'), 'memory recalled into system prompt');
    assert.ok(sys.content.includes('[当前任务清单]'), 'live task list injected');
    const asst = msgs.filter(m => m.role === 'assistant' && Array.isArray(m.tool_calls)).pop();
    assert.ok(asst && asst.tool_calls.length === 3, 'history replay keeps the tool-call table');
    const ids = new Set(asst.tool_calls.map(tc => tc.id));
    const answered = msgs.filter(m => m.role === 'tool').map(m => m.tool_call_id);
    assert.strictEqual(answered.length, 3);
    assert.ok(answered.every(id => ids.has(id)), 'replay pairs every tool response with its call');
    console.log('PASS: next-turn replay invariants + memory/task injection');
  }

  // Scenario C: round budget — model always wants tools; cap forces a tool-free
  // final round, and reused tool-call ids get rewritten to stay unique
  await ctx.call('saveConfig', { agentMaxRounds: 2 });
  sid = (await ctx.call('getInitData')).activeSession.id;
  const beforeCalls = calls.length;
  for (let i = 0; i < 3; i++) {
    scripts.push(async (opts, onChunk) => {
      if (Array.isArray(opts.tools) && opts.tools.length > 0) {
        emitTool(onChunk, 0, 'dup_id', 'get_current_time', {});
      } else {
        onChunk({ type: 'content', delta: '被迫收尾' });
      }
    });
  }
  await ctx.call('sendMessage', { sessionId: sid, content: '无限工具循环测试', enableAgent: true, enableReasoning: false, agentApprovalMode: 'full' });
  await waitFor(() => ctx.chunks.filter(c => c.type === 'complete').length >= 3);
  {
    assert.strictEqual(calls.length - beforeCalls, 3, '2 tool rounds + 1 forced final round');
    const finalOpts = calls[calls.length - 1].opts;
    assert.ok(!finalOpts.tools, 'final round runs without tools');
    assert.strictEqual(finalOpts.messages[finalOpts.messages.length - 1].role, 'user');
    assert.ok(finalOpts.messages[finalOpts.messages.length - 1].content.includes('工具调用上限'), 'cap nudge message present');
    const toolIds = ctx.chunks.filter(c => c.type === 'tool_result').map(c => c.toolId).slice(-2);
    const capChunk = ctx.chunks.filter(c => c.type === 'complete')[2];
    assert.strictEqual(capChunk.message.toolCalls.length, 2, 'exactly two tool executions');
    assert.notStrictEqual(toolIds[0], toolIds[1], 'duplicate tool-call id rewritten');
    const uniq = new Set(capChunk.message.toolCalls.map(tc => tc.id));
    assert.strictEqual(uniq.size, 2);
    assert.ok(capChunk.message.content.includes('被迫收尾'));
    console.log('PASS: max-rounds cutoff + dup tool-id rewrite');
  }

  // UI-facing IPC: memory CRUD + task list clearing
  {
    const ls = await ctx.call('listMemories');
    assert.ok(ls.ok && ls.memories.length >= 1);
    const sv = await ctx.call('saveMemory', { content: '全局记忆：用户在 Windows 上开发', type: 'fact', scope: 'global' });
    assert.ok(sv.ok && sv.memories.some(m => m.content.includes('Windows')));
    const dv = await ctx.call('deleteMemory', { id: sv.memory.id });
    assert.ok(dv.ok && !dv.memories.some(m => m.id === sv.memory.id));
    const badScope = await ctx.call('saveMemory', { content: 'x', scope: 'Z:\\不存在\\目录' });
    assert.ok(!badScope.ok, 'invalid project scope rejected');
    const cl = await ctx.call('clearTaskList', { sessionId: sid });
    assert.ok(cl.ok && cl.session.taskList === null);
    console.log('PASS: memory/task IPC surface');
  }

  backend.deactivate();
  fs.rmSync(sandbox, { recursive: true, force: true });
  /* --- 5. protocol adapters carry tool dialogue for the loop -----------------
     Claude needs tool_use/tool_result blocks; Responses needs typed
     function_call items — without the conversion the multi-round loop's
     follow-up rounds would silently drop all tool context. */
  {
    const { PROTOCOLS } = protocols;
    const toolMsgs = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'go' },
      { role: 'assistant', content: 'plan', tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'grep_search', arguments: '{"pattern":"x"}' } },
        { id: 'c2', type: 'function', function: { name: 'read_file', arguments: '{}' } }
      ] },
      { role: 'tool', tool_call_id: 'c1', name: 'grep_search', content: 'r1' },
      { role: 'tool', tool_call_id: 'c2', name: 'read_file', content: 'r2' },
      { role: 'user', content: 'next' }
    ];

    const claude = PROTOCOLS['claude-messages'].buildRequest({ messages: toolMsgs, maxTokens: 1024, tools: [{ type: 'function', function: { name: 't', description: 'd', parameters: {} } }] });
    const cbody = JSON.parse(claude.body);
    assert.strictEqual(cbody.system, 'sys');
    const asst = cbody.messages.find(m => m.role === 'assistant' && Array.isArray(m.content));
    assert.ok(asst && asst.content.some(b => b.type === 'text' && b.text === 'plan'));
    assert.ok(asst.content.some(b => b.type === 'tool_use' && b.id === 'c1' && b.input.pattern === 'x'), 'assistant carries tool_use blocks with parsed input');
    const toolRes = cbody.messages.find(m => m.role === 'user' && Array.isArray(m.content) && m.content[0] && m.content[0].type === 'tool_result');
    assert.ok(toolRes && toolRes.content.length === 2 && toolRes.content.every(b => b.type === 'tool_result'), 'consecutive tool responses merge into ONE user turn');
    assert.deepEqual(toolRes.content.map(b => b.tool_use_id), ['c1', 'c2']);
    assert.ok(Array.isArray(cbody.tools) && cbody.tools[0].name === 't' && cbody.tools[0].input_schema, 'tools converted to Claude schema');

    const resp = PROTOCOLS['openai-responses'].buildRequest({ messages: toolMsgs });
    const rbody = JSON.parse(resp.body);
    const fc = rbody.input.filter(i => i.type === 'function_call');
    const fo = rbody.input.filter(i => i.type === 'function_call_output');
    assert.strictEqual(fc.length, 2);
    assert.ok(fc[0].call_id === 'c1' && fc[0].name === 'grep_search' && typeof fc[0].arguments === 'string');
    assert.deepEqual(fo.map(i => i.call_id), ['c1', 'c2']);
    assert.ok(rbody.input.some(i => i.role === 'system' && i.content === 'sys'));
    console.log('PASS: Claude/Responses adapters convert tool dialogue (multi-round wire format)');
  }

  console.log('ALL AGENT-UPGRADE TESTS PASSED');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
