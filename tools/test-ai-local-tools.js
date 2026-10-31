/* Tests for the local assistant tools: filesystem ops, shell execution,
   path resolution against the session working directory, approval tier
   classification, and backend dispatch integration.
   Run with: node tools/test-ai-local-tools.js */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PLUGIN = path.join(__dirname, '..', 'src', 'plugins', 'ai-chat');

async function main() {
  const { executeLocalTool } = require(path.join(PLUGIN, 'local-tools.js'));
  const { resolveToolPermission } = require(path.join(PLUGIN, 'agent-tools.js'));

  /* --- sandbox -------------------------------------------------------------- */
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-local-agent-'));
  fs.writeFileSync(path.join(sandbox, 'note.md'), '# 标题\n\n第一段内容 hello-local\n第二行');
  fs.mkdirSync(path.join(sandbox, 'sub'));
  fs.writeFileSync(path.join(sandbox, 'sub', 'util.js'), 'console.log("util"); // TODO marker');
  fs.writeFileSync(path.join(sandbox, 'binary.bin'), Buffer.from([0x00, 0x01, 0x02, 0x00]));
  const rt = { workDir: sandbox };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, t = 6000) => {
    const t0 = Date.now();
    while (!fn()) {
      if (Date.now() - t0 > t) throw new Error('waitFor timeout');
      await sleep(15);
    }
  };

  /* --- 1. filesystem tools ------------------------------------------------- */
  {
    const ls = await executeLocalTool('list_dir', { path: '.' }, rt);
    assert.ok(ls.ok && ls.entries.some(e => e.name === 'note.md' && e.type === 'file'));
    assert.ok(ls.entries.some(e => e.name === 'sub' && e.type === 'dir'));

    const rd = await executeLocalTool('read_file', { path: 'note.md' }, rt);
    assert.ok(rd.ok && rd.content.includes('hello-local'));

    const rdLines = await executeLocalTool('read_file', { path: 'note.md', offset_line: 3, max_lines: 1 }, rt);
    assert.ok(rdLines.ok && rdLines.content.trim() === '第一段内容 hello-local', JSON.stringify(rdLines));

    const rdAbs = await executeLocalTool('read_file', { path: path.join(sandbox, 'note.md') }, rt);
    assert.ok(rdAbs.ok, 'absolute path passthrough');

    const rdBin = await executeLocalTool('read_file', { path: 'binary.bin' }, rt);
    assert.ok(!rdBin.ok && /二进制/.test(rdBin.error));

    const wr = await executeLocalTool('write_file', { path: 'out/gen.txt', content: '写入内容 A\n' }, rt);
    assert.ok(wr.ok && wr.mode === 'overwrite');
    assert.strictEqual(fs.readFileSync(path.join(sandbox, 'out', 'gen.txt'), 'utf8'), '写入内容 A\n', 'parent dir auto-created');

    const ap = await executeLocalTool('write_file', { path: 'out/gen.txt', content: '追加 B\n', mode: 'append' }, rt);
    assert.ok(ap.ok && ap.mode === 'append');
    assert.strictEqual(fs.readFileSync(path.join(sandbox, 'out', 'gen.txt'), 'utf8'), '写入内容 A\n追加 B\n');

    const byName = await executeLocalTool('search_files', { glob: '*.js' }, rt);
    assert.ok(byName.ok && byName.files.includes(path.join('sub', 'util.js')), JSON.stringify(byName));

    const byContent = await executeLocalTool('search_files', { glob: '*.js', contains: 'TODO' }, rt);
    assert.ok(byContent.ok && byContent.files.length === 1);
    const none = await executeLocalTool('search_files', { glob: '*.js', contains: 'NOT-EXIST' }, rt);
    assert.strictEqual(none.files.length, 0);

    const outside = await executeLocalTool('read_file', { path: path.join(sandbox, 'no-such.md') }, rt);
    assert.ok(!outside.ok);
    console.log('PASS: list_dir / read_file (offset/binary/abs) / write_file (mkdir/append) / search_files (glob/content)');
  }

  /* --- 2. run_command -------------------------------------------------------- */
  {
    const echo = await executeLocalTool('run_command', { command: 'echo hello-shell' }, rt);
    assert.ok(echo.ok && /hello-shell/.test(echo.stdout), JSON.stringify(echo));

    const nodeSum = await executeLocalTool('run_command', { command: 'node -e "console.log(6*7)"' }, rt);
    assert.ok(nodeSum.ok && nodeSum.stdout.trim() === '42');

    const cwdOk = await executeLocalTool('run_command', { command: 'node -e "console.log(process.cwd())"' }, rt);
    assert.strictEqual(path.resolve(cwdOk.stdout.trim()), path.resolve(sandbox), 'command cwd = working dir');

    const fail = await executeLocalTool('run_command', { command: 'node -e "process.exit(3)"' }, rt);
    assert.ok(!fail.ok && fail.exitCode === 3);

    // stdin-reading children get EOF instead of stalling until the timeout
    const tStdin = Date.now();
    const stdinEof = await executeLocalTool('run_command', { command: 'node -e "let n=0;process.stdin.on(\'data\',c=>n+=c.length);process.stdin.on(\'end\',()=>{console.log(\'eof:\'+n)})"', timeout_ms: 8000 }, rt);
    assert.ok(stdinEof.ok && /eof:\d+/.test(stdinEof.stdout), `stdin closed -> immediate EOF, got ${JSON.stringify(stdinEof)}`);
    assert.ok(Date.now() - tStdin < 7000, 'no stall waiting on stdin');

    // localized output must survive the console OEM codepage (CP936 on zh-CN)
    const localized = await executeLocalTool('run_command', { command: 'echo 中文输出测试' }, rt);
    assert.ok(localized.ok && localized.stdout.includes('中文输出测试'), `OEM codepage decode, got ${JSON.stringify(localized.stdout)}`);

    // timeout must kill the whole process tree: cmd.exe child AND the node
    // grandchild keeps heartbeating to a file only while it is alive
    const hb = path.join(sandbox, 'hb.txt');
    const hbLit = "'" + hb.replace(/\\/g, '\\\\') + "'";
    const tree = await executeLocalTool('run_command', {
      command: `node -e "const fs=require('fs');const i=setInterval(()=>{try{fs.appendFileSync(${hbLit},Date.now()+'\\n')}catch(e){}},200)"`,
      timeout_ms: 3000
    }, rt);
    assert.ok(!tree.ok && tree.timedOut, 'timeout reported');
    await sleep(1500);
    const snap1 = fs.readFileSync(hb, 'utf8').trim().split('\n').length;
    await sleep(900);
    const snap2 = fs.readFileSync(hb, 'utf8').trim().split('\n').length;
    assert.strictEqual(snap2, snap1, `grandchild must be dead after timeout (heartbeats ${snap1} -> ${snap2})`);
    console.log('PASS: run_command (stdout/exitCode/cwd/timeout kill/tree/stdio/codepage)');
  }

  /* --- 3. approval tier classification --------------------------------------- */
  {
    assert.strictEqual(resolveToolPermission('auto', 'read_file', []), 'auto');
    assert.strictEqual(resolveToolPermission('auto', 'list_dir', []), 'auto');
    assert.strictEqual(resolveToolPermission('auto', 'search_files', []), 'auto');
    assert.strictEqual(resolveToolPermission('auto', 'write_file', []), 'ask');
    assert.strictEqual(resolveToolPermission('auto', 'run_command', []), 'ask');
    assert.strictEqual(resolveToolPermission('ask', 'read_file', []), 'ask');
    console.log('PASS: approval tiers (reads low / writes & commands high)');
  }

  /* --- 4. backend dispatch + workDir wiring ---------------------------------- */
  const protocols = require(path.join(PLUGIN, 'protocols.js'));
  let sawLocalToolDefs = false;
  let turnCounter = 0;
  let lastTurnRequestMessages = null;
  let failNextFollowUp = false;
  let emitToolCallsNext = false;
  let withToolsCalls = 0;
  let failOnWithToolsCount = 0; // throw when the Nth with-tools call arrives (post-tool round of the loop)
  protocols.streamCompletion = async (opts, onChunk) => {
    const hasTools = Array.isArray(opts.tools) && opts.tools.some(Boolean);
    if (!hasTools) {
      // tool-free final round (round budget exhausted)
      if (failNextFollowUp) { failNextFollowUp = false; throw new Error('simulated follow-up failure'); }
      onChunk({ type: 'content', delta: ' 继续回答' });
      onChunk({ type: 'done' });
      return;
    }
    withToolsCalls++;
    if (failOnWithToolsCount && withToolsCalls === failOnWithToolsCount) {
      failOnWithToolsCount = 0;
      throw new Error('simulated follow-up failure');
    }
    if (opts.tools.some(t => t.function && t.function.name === 'read_file')) {
      sawLocalToolDefs = true;
    }
    turnCounter++;
    if (turnCounter === 1) {
      onChunk({ type: 'tool_calls', delta: [{ index: 0, id: 'tc_rd', function: { name: 'read_file', arguments: '{"path":"note.md"}' } }] });
      onChunk({ type: 'tool_calls', delta: [{ index: 1, id: 'tc_wr', function: { name: 'write_file', arguments: '{"path":"by-agent.txt","content":"agent 写入"}' } }] });
    } else if (emitToolCallsNext) {
      emitToolCallsNext = false;
      onChunk({ type: 'tool_calls', delta: [{ index: 0, id: 'tc_x', function: { name: 'read_file', arguments: '{"path":"note.md"}' } }] });
    } else {
      lastTurnRequestMessages = opts.messages;
      onChunk({ type: 'content', delta: '第二回合回答' });
      onChunk({ type: 'done' });
    }
  };
  const backend = require(path.join(PLUGIN, 'backend.js'));
  const handlers = new Map();
  const store = { config: {}, personas: [], sessions: [{ id: 's', title: 't', personaId: 'general', messages: [] }], activeSessionId: 's' };
  const chunks = [];
  const ctx = {
    ipc: { handle: (n, f) => handlers.set(n, f) },
    data: { get: () => store, set: d => Object.assign(store, d) },
    send: (ch, p) => chunks.push(p.chunk),
    call: (n, a) => handlers.get(n)(a),
    workflows: { list: () => [], save: () => {} }
  };
  backend.activate(ctx);

  const setRes = await ctx.call('setSessionWorkDir', { sessionId: 's', dir: sandbox });
  assert.ok(setRes.ok && setRes.workDir === path.resolve(sandbox));
  const badDir = await ctx.call('setSessionWorkDir', { sessionId: 's', dir: path.join(sandbox, 'note.md') });
  assert.ok(!badDir.ok, 'file path rejected as workDir');

  const res = await ctx.call('sendMessage', { sessionId: 's', content: 'go', enableAgent: true, enableReasoning: false, agentApprovalMode: 'auto' });
  assert.ok(sawLocalToolDefs, 'local tools must be merged into the agent tool table');
  await waitFor(() => chunks.some(c => c.type === 'tool_approval_request' && c.toolId === 'tc_wr'));
  assert.ok(!chunks.some(c => c.type === 'tool_approval_request' && c.toolId === 'tc_rd'), 'auto tier: read runs without asking');
  const rdRes = chunks.find(c => c.type === 'tool_result' && c.toolId === 'tc_rd');
  assert.ok(rdRes && rdRes.result.ok && rdRes.result.content.includes('hello-local'), 'relative path resolved against session workDir');

  await ctx.call('resolveToolApproval', { streamId: res.streamId, toolCallId: 'tc_wr', approved: true });
  await waitFor(() => chunks.some(c => c.type === 'complete'));
  assert.strictEqual(fs.readFileSync(path.join(sandbox, 'by-agent.txt'), 'utf8'), 'agent 写入', 'approved write landed in workDir');

  /* --- 5. second turn: history rebuild carries grouped tool pairs ------------- */
  {
    const completesBefore = chunks.filter(c => c.type === 'complete').length;
    await ctx.call('sendMessage', { sessionId: 's', content: 'again', enableAgent: true, enableReasoning: false, agentApprovalMode: 'auto' });
    await waitFor(() => chunks.filter(c => c.type === 'complete').length > completesBefore);
    assert.ok(lastTurnRequestMessages, 'second turn captured request messages');
    const ast = lastTurnRequestMessages.find(m => m.role === 'assistant' && m.tool_calls);
    assert.ok(ast && Array.isArray(ast.tool_calls) && ast.tool_calls.length === 2, 'assistant history must expose snake_case tool_calls (camelCase-only before the fix)');
    assert.ok(!lastTurnRequestMessages.some(m => m.role === 'assistant' && m.toolCalls), 'camelCase toolCalls must not leak to the wire');
    const toolMsgs = lastTurnRequestMessages.filter(m => m.role === 'tool');
    assert.deepStrictEqual(toolMsgs.map(m => m.tool_call_id), ast.tool_calls.map(t => t.id), 'each tool response follows its assistant message in order');
    console.log('PASS: second turn rebuild (snake_case tool_calls + grouped tool responses)');
  }

  /* --- 6. context window keeps assistant/tool pairs intact; orphans dropped --- */
  const mkCtx = store => {
    const handlers2 = new Map();
    const chunks2 = [];
    return {
      chunks: chunks2,
      ctx: {
        ipc: { handle: (n, f) => handlers2.set(n, f) },
        data: { get: () => store, set: d => Object.assign(store, d) },
        send: (ch, p) => chunks2.push(p.chunk),
        call: (n, a) => handlers2.get(n)(a),
        workflows: { list: () => [], save: () => {} }
      }
    };
  };
  {
    const store2 = {
      config: { maxContextMessages: 5 },
      personas: [],
      sessions: [{
        id: 's2', title: 't', personaId: 'general', messages: [
          { id: 'm1', role: 'user', content: 'u1' },
          { id: 'm2', role: 'assistant', content: 'a1' },
          { id: 'm3', role: 'user', content: 'u2' },
          { id: 'm4', role: 'assistant', content: '', toolCalls: [
            { id: 'tc_a', type: 'function', function: { name: 'read_file', arguments: '{}' } },
            { id: 'tc_b', type: 'function', function: { name: 'list_dir', arguments: '{}' } }
          ] },
          { id: 'm5', role: 'tool', tool_call_id: 'tc_a', name: 'read_file', content: 'r1' },
          { id: 'm6', role: 'tool', tool_call_id: 'tc_b', name: 'list_dir', content: 'r2' },
          { id: 'm7', role: 'user', content: 'u3' }
        ]
      }],
      activeSessionId: 's2'
    };
    const { ctx: ctx2, chunks: chunks2 } = mkCtx(store2);
    backend.activate(ctx2);
    await ctx2.call('sendMessage', { sessionId: 's2', content: 'u4', enableAgent: true, enableReasoning: false, agentApprovalMode: 'auto' });
    await waitFor(() => chunks2.some(c => c.type === 'complete'));
    assert.ok(lastTurnRequestMessages, 'window test captured request messages');
    assert.strictEqual(lastTurnRequestMessages[0] && lastTurnRequestMessages[0].role, 'system');
    const astIdx = lastTurnRequestMessages.findIndex(m => m.role === 'assistant' && m.tool_calls);
    assert.ok(astIdx > 0, 'bounded assistant tool_calls message present');
    const tools = lastTurnRequestMessages.filter(m => m.role === 'tool');
    assert.deepStrictEqual(tools.map(m => m.tool_call_id), ['tc_a', 'tc_b'], 'assistant and its tool responses travel together');
    assert.deepStrictEqual(
      lastTurnRequestMessages.slice(astIdx + 1).filter(m => m.role !== 'tool').map(m => m.content),
      ['u3', 'u4'],
      'newest user messages kept alongside the pair'
    );
    assert.ok(!lastTurnRequestMessages.some(m => ['u1', 'u2'].includes(m.content)), 'older messages dropped as whole units, never splitting the pair');
    backend.deactivate();
    console.log('PASS: context window keeps assistant/tool pairs intact');
  }
  {
    // orphan tool response (its assistant message was deleted) must not reach the API
    const store3 = {
      config: {},
      personas: [],
      sessions: [{
        id: 's3', title: 't', personaId: 'general', messages: [
          { id: 'o1', role: 'user', content: 'orphan-parent' },
          { id: 'o2', role: 'tool', tool_call_id: 'tc_lost', name: 'read_file', content: 'r' },
          { id: 'o3', role: 'user', content: 'next question' }
        ]
      }],
      activeSessionId: 's3'
    };
    const { ctx: ctx3, chunks: chunks3 } = mkCtx(store3);
    backend.activate(ctx3);
    await ctx3.call('sendMessage', { sessionId: 's3', content: 'ask', enableAgent: true, enableReasoning: false, agentApprovalMode: 'auto' });
    await waitFor(() => chunks3.some(c => c.type === 'complete'));
    assert.ok(!lastTurnRequestMessages.some(m => m.role === 'tool'), 'orphaned tool response dropped from context');
    backend.deactivate();
    console.log('PASS: orphaned tool responses dropped from context');
  }

  /* --- 7. fallback must not re-run already-executed tools ---------------------- */
  {
    const store4 = {
      config: { fallbackModel: 'fb-model' },
      personas: [],
      sessions: [{ id: 's4', title: 't', personaId: 'general', workDir: sandbox, messages: [] }],
      activeSessionId: 's4'
    };
    const { ctx: ctx4, chunks: chunks4 } = mkCtx(store4);
    backend.activate(ctx4);
    emitToolCallsNext = true;
    // Round 1 emits the tool call, round 2 (the loop's post-tool continuation,
    // which keeps tools enabled) fails: the error must surface and the
    // fallback model must NOT replay the already-executed tool call.
    failOnWithToolsCount = withToolsCalls + 2;
    await ctx4.call('sendMessage', { sessionId: 's4', content: 'run', enableAgent: true, enableReasoning: false, agentApprovalMode: 'auto' });
    await waitFor(() => chunks4.some(c => c.type === 'complete'));
    const toolResults = chunks4.filter(c => c.type === 'tool_result');
    assert.strictEqual(toolResults.length, 1, `tool executed exactly once (got ${toolResults.length})`);
    assert.ok(!chunks4.some(c => c.type === 'fallback'), 'no fallback after tools executed');
    assert.ok(chunks4.some(c => c.type === 'error' && /simulated follow-up failure/.test(c.error)), 'primary error surfaced to the renderer');
    backend.deactivate();
    console.log('PASS: fallback skipped after tool execution (no double side effects)');
  }

  /* --- 8. concurrent send + destructive IPC guards ------------------------------ */
  {
    const store5 = {
      config: {},
      personas: [],
      sessions: [{ id: 's5', title: 't', personaId: 'general', messages: [] }],
      activeSessionId: 's5'
    };
    const { ctx: ctx5, chunks: chunks5 } = mkCtx(store5);
    backend.activate(ctx5);
    // pin the stream open on an approval card, then probe the guards
    emitToolCallsNext = true;
    const first = await ctx5.call('sendMessage', { sessionId: 's5', content: 'first', enableAgent: true, enableReasoning: false, agentApprovalMode: 'ask' });
    await waitFor(() => chunks5.some(c => c.type === 'tool_approval_request'));
    const dup = await ctx5.call('sendMessage', { sessionId: 's5', content: 'second', enableAgent: true, enableReasoning: false, agentApprovalMode: 'ask' });
    assert.ok(dup.ok === false && /生成中/.test(dup.error || ''), 'concurrent send rejected while generating');
    const clr = await ctx5.call('clearSession', { id: 's5' });
    assert.ok(clr.ok === false, 'clearSession rejected while generating');
    const del = await ctx5.call('deleteMessage', { sessionId: 's5', messageId: first.userMessage.id });
    assert.ok(del.ok === false, 'deleteMessage rejected while generating');
    await ctx5.call('abortStream', { streamId: first.streamId });
    await waitFor(() => chunks5.some(c => c.type === 'complete'));
    const dup2 = await ctx5.call('sendMessage', { sessionId: 's5', content: 'third', enableAgent: true, enableReasoning: false, agentApprovalMode: 'ask' });
    assert.ok(dup2.ok, 'send allowed again after abort');
    await waitFor(() => chunks5.filter(c => c.type === 'complete').length >= 2);
    backend.deactivate();
    console.log('PASS: concurrent send & destructive IPC guards');
  }

  backend.deactivate();
  // Windows: the exec'd shell may hold the dir briefly — retry, and never fail
  // the suite on cleanup
  try {
    fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {}
  console.log('PASS: backend dispatch (workDir resolution, auto-tier read, approved write)');
  console.log('ALL LOCAL ASSISTANT TESTS PASSED');
}

main().catch(err => {
  console.error('FAIL:', err && (err.stack || err.message));
  process.exit(1);
});
