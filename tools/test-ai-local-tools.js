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

    const t0 = Date.now();
    const slow = await executeLocalTool('run_command', { command: 'node -e "setTimeout(()=>{},8000)"', timeout_ms: 3000 }, rt);
    assert.ok(!slow.ok && slow.timedOut, 'timeout kills the command');
    assert.ok(Date.now() - t0 < 7000, 'killed near the 3s timeout');
    console.log('PASS: run_command (stdout/exitCode/cwd/timeout kill)');
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
  protocols.streamCompletion = async (opts, onChunk) => {
    if (Array.isArray(opts.tools) && opts.tools.some(t => t.function && t.function.name === 'read_file')) {
      sawLocalToolDefs = true;
    }
    onChunk({ type: 'tool_calls', delta: [{ index: 0, id: 'tc_rd', function: { name: 'read_file', arguments: '{"path":"note.md"}' } }] });
    onChunk({ type: 'tool_calls', delta: [{ index: 1, id: 'tc_wr', function: { name: 'write_file', arguments: '{"path":"by-agent.txt","content":"agent 写入"}' } }] });
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

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitFor = async (fn, t = 6000) => {
    const t0 = Date.now();
    while (!fn()) {
      if (Date.now() - t0 > t) throw new Error('waitFor timeout');
      await sleep(15);
    }
  };

  const res = await ctx.call('sendMessage', { sessionId: 's', content: 'go', enableAgent: true, enableReasoning: false, agentApprovalMode: 'auto' });
  assert.ok(sawLocalToolDefs, 'local tools must be merged into the agent tool table');
  await waitFor(() => chunks.some(c => c.type === 'tool_approval_request' && c.toolId === 'tc_wr'));
  assert.ok(!chunks.some(c => c.type === 'tool_approval_request' && c.toolId === 'tc_rd'), 'auto tier: read runs without asking');
  const rdRes = chunks.find(c => c.type === 'tool_result' && c.toolId === 'tc_rd');
  assert.ok(rdRes && rdRes.result.ok && rdRes.result.content.includes('hello-local'), 'relative path resolved against session workDir');

  await ctx.call('resolveToolApproval', { streamId: res.streamId, toolCallId: 'tc_wr', approved: true });
  await waitFor(() => chunks.some(c => c.type === 'complete'));
  assert.strictEqual(fs.readFileSync(path.join(sandbox, 'by-agent.txt'), 'utf8'), 'agent 写入', 'approved write landed in workDir');

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
