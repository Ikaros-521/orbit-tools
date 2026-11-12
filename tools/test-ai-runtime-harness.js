/* Comprehensive automated tests for DeepSeek Harness runtime mechanisms in Orbit AI:
   1. Double-Layer Context & Prefix Caching Invariance (runtime-context-service.js)
   2. Tool Pairing Balanced Invariants & Context Bounding (context-bounds.js)
   3. Three-Stage Tool Execution Pipeline & Concurrency Scheduler (tool-pipeline.js)
   4. Subagent Derivations (Spawn vs Fork) & Depth Guard (subagent-service.js)
   5. Subagent Parallel Fan-Out, Timeout, Nesting & Background Registry (subagent-service.js)
   Run with: node tools/test-ai-runtime-harness.js */

const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

const PLUGIN_DIR = path.join(__dirname, '..', 'src', 'plugins', 'ai-chat');
const protocols = require(path.join(PLUGIN_DIR, 'protocols'));

const {
  buildStaticSystemPrompt,
  computeStateFingerprint,
  buildRuntimeContextBlock,
  RuntimeContextService
} = require(path.join(PLUGIN_DIR, 'services', 'runtime-context-service'));

const {
  toolPairingBalancedAt,
  findBalancedCutIndex,
  buildBoundedContext,
  cloneForInference
} = require(path.join(PLUGIN_DIR, 'lib', 'context-bounds'));

const {
  isConcurrencySafe,
  clipToolContent,
  ToolExecutionPipeline,
  CONCURRENCY_SAFE_TOOLS
} = require(path.join(PLUGIN_DIR, 'services', 'tool-pipeline'));

const {
  SubagentManager,
  SUBAGENT_TOOL_DEFINITION,
  CHECK_SUBAGENTS_TOOL_DEFINITION
} = require(path.join(PLUGIN_DIR, 'services', 'subagent-service'));

async function main() {
  console.log('--- 1. Testing Double-Layer Context & Prefix Caching ---');
  {
    const persona = {
      id: 'dev',
      title: '架构师',
      prompt: '你是专业架构师。'
    };

    // Static prompt anchor must be identical regardless of session state
    const prompt1 = buildStaticSystemPrompt(persona, { enableAgent: true });
    const prompt2 = buildStaticSystemPrompt(persona, { enableAgent: true });
    assert.strictEqual(prompt1, prompt2, 'Static anchor must be 100% deterministic');
    assert.ok(prompt1.includes('你是专业架构师。'), 'Includes persona');
    assert.ok(prompt1.includes('[本地 Agent 核心准则]'), 'Includes core guidelines');

    // Dynamic state fingerprinting
    const fp1 = computeStateFingerprint({
      workDir: '/path/a',
      taskList: [{ status: 'pending', content: 'task 1' }],
      recalledMemories: [{ id: 'mem1' }]
    });
    const fp2 = computeStateFingerprint({
      workDir: '/path/a',
      taskList: [{ status: 'pending', content: 'task 1' }],
      recalledMemories: [{ id: 'mem1' }]
    });
    const fp3 = computeStateFingerprint({
      workDir: '/path/b',
      taskList: [{ status: 'pending', content: 'task 1' }],
      recalledMemories: [{ id: 'mem1' }]
    });
    assert.strictEqual(fp1, fp2, 'Identical state must produce identical fingerprint');
    assert.notStrictEqual(fp1, fp3, 'Changed state must produce distinct fingerprint');

    // Runtime context block formatting
    const block = buildRuntimeContextBlock({
      workDir: '/workspace/project',
      taskList: [{ status: 'in_progress', content: '实现核心架构' }],
      recalledMemories: []
    });
    assert.ok(block.includes('[工作目录] /workspace/project'));
    assert.ok(block.includes('[当前任务清单]'));
    assert.ok(block.includes('实现核心架构'));

    // RuntimeContextService assembleContext
    const ctxService = new RuntimeContextService();
    const res = ctxService.assembleContext({
      session: { id: 's1', title: '开发测试', taskList: [] },
      persona,
      enableAgent: true,
      agentWorkDir: '/test/dir',
      userQuery: '测试查询',
      memories: []
    });
    assert.strictEqual(res.systemPrompt, prompt1, 'System prompt remains the clean prefix anchor');
    assert.ok(res.dynamicContextBlock.includes('/test/dir'), 'Dynamic context injected separately');

    console.log('PASS: Double-Layer Context & Prefix Caching Invariance verified');
  }

  console.log('--- 2. Testing Tool Pairing Balanced Cut Invariants ---');
  {
    // Construct a synthetic conversation with multi-turn tool loops:
    // Turn 1: User asks -> Assistant calls tool_1 & tool_2 -> Tool result 1 -> Tool result 2 -> Assistant answers
    // Turn 2: User asks -> Assistant calls tool_3 -> Tool result 3 -> Assistant answers
    const messages = [
      { id: '1', role: 'user', content: 'Q1' },
      { id: '2', role: 'assistant', content: '', tool_calls: [
        { id: 'tc_1', type: 'function', function: { name: 'read_file', arguments: '{}' } },
        { id: 'tc_2', type: 'function', function: { name: 'list_dir', arguments: '{}' } }
      ]},
      { id: '3', role: 'tool', tool_call_id: 'tc_1', content: 'content_1' },
      { id: '4', role: 'tool', tool_call_id: 'tc_2', content: 'content_2' },
      { id: '5', role: 'assistant', content: 'A1' },
      { id: '6', role: 'user', content: 'Q2' },
      { id: '7', role: 'assistant', content: '', tool_calls: [
        { id: 'tc_3', type: 'function', function: { name: 'grep_search', arguments: '{}' } }
      ]},
      { id: '8', role: 'tool', tool_call_id: 'tc_3', content: 'content_3' },
      { id: '9', role: 'assistant', content: 'A2' }
    ];

    // Cutting at index 0 (keep all) is balanced
    assert.strictEqual(toolPairingBalancedAt(messages, 0), true);

    // Cutting at index 2 (between assistant with tc_1,tc_2 and tool results) MUST be UNBALANCED!
    // Because tail contains tool results whose calls were in the pruned head
    assert.strictEqual(toolPairingBalancedAt(messages, 2), false, 'Cut separating call from result must be unbalanced');
    assert.strictEqual(toolPairingBalancedAt(messages, 3), false, 'Cut inside tool results must be unbalanced (tc_2 split)');

    // Cutting at index 4 (after both tc_1 and tc_2 results have closed) IS BALANCED!
    assert.strictEqual(toolPairingBalancedAt(messages, 4), true, 'Cut after all tool results have closed is balanced');

    // Cutting at index 5 (after A1 has concluded Turn 1) IS BALANCED!
    assert.strictEqual(toolPairingBalancedAt(messages, 5), true, 'Cut between Turn 1 and Turn 2 is balanced');

    // Cutting at index 6 (start of Turn 2) IS BALANCED!
    assert.strictEqual(toolPairingBalancedAt(messages, 6), true, 'Cut at clean User Turn 2 is balanced');

    // Cutting at index 7 (separating tc_3 from tool result 3) MUST be UNBALANCED!
    assert.strictEqual(toolPairingBalancedAt(messages, 7), false, 'Cut separating tc_3 must be unbalanced');

    // Test findBalancedCutIndex:
    // If we request to keep 4 messages from 9 (which would naively cut at index 5):
    // index 5 is balanced, so it cleanly cuts at turn boundary!
    const cutIdx = findBalancedCutIndex(messages, 4);
    assert.ok(toolPairingBalancedAt(messages, cutIdx), 'findBalancedCutIndex returns balanced boundary');

    // If we request to keep 6 messages (naive cut at index 3, which is invalid):
    // findBalancedCutIndex must NOT cut at 3! It should safely step backward to index 0 or clean boundary.
    const safeCut = findBalancedCutIndex(messages, 6);
    assert.ok(toolPairingBalancedAt(messages, safeCut), 'Must adjust naive cut to balanced index');
    assert.notStrictEqual(safeCut, 3, 'Must never cut at 3');
    assert.notStrictEqual(safeCut, 4, 'Must never cut at 4');

    // Test buildBoundedContext
    const bounded = buildBoundedContext(messages, 4);
    assert.ok(Array.isArray(bounded));
    // Verify no orphaned tool messages in bounded
    const callIds = new Set();
    for (const m of bounded) {
      if (Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls) callIds.add(tc.id);
      }
      if (m.role === 'tool') {
        assert.ok(callIds.has(m.tool_call_id), `Tool message ${m.tool_call_id} must have matching tool_call in bounded context!`);
      }
    }

    console.log('PASS: Tool Pairing Balanced Invariants verified');
  }

  console.log('--- 3. Testing Three-Stage Tool Pipeline & Concurrency ---');
  {
    // Concurrency classification
    assert.strictEqual(isConcurrencySafe('read_file'), true);
    assert.strictEqual(isConcurrencySafe('list_dir'), true);
    assert.strictEqual(isConcurrencySafe('grep_search'), true);
    assert.strictEqual(isConcurrencySafe('write_file'), false);
    assert.strictEqual(isConcurrencySafe('edit_file'), false);
    assert.strictEqual(isConcurrencySafe('run_command'), false);
    assert.strictEqual(isConcurrencySafe('unknown_custom_tool'), false, 'Fail-Closed: unknown is exclusive');

    // Pipeline batch execution with parallel speedup
    const pipeline = new ToolExecutionPipeline({ maxConcurrency: 4 });

    const callLogs = [];
    let concurrentCount = 0;
    let maxObservedConcurrency = 0;

    const fakeDispatcher = async (name, args) => {
      concurrentCount++;
      if (concurrentCount > maxObservedConcurrency) {
        maxObservedConcurrency = concurrentCount;
      }
      callLogs.push(`start:${name}:${args.id}`);
      await new Promise(r => setTimeout(r, 20)); // simulated I/O delay
      callLogs.push(`end:${name}:${args.id}`);
      concurrentCount--;
      return { ok: true, data: `result_${args.id}` };
    };

    const mockApprovalService = {
      checkPermission: () => 'auto',
      requestApproval: async () => ({ approved: true })
    };

    // 4 parallel read_file calls followed by 1 exclusive write_file call
    const testCalls = [
      { id: 'c1', function: { name: 'read_file', arguments: JSON.stringify({ id: 1 }) } },
      { id: 'c2', function: { name: 'read_file', arguments: JSON.stringify({ id: 2 }) } },
      { id: 'c3', function: { name: 'read_file', arguments: JSON.stringify({ id: 3 }) } },
      { id: 'c4', function: { name: 'read_file', arguments: JSON.stringify({ id: 4 }) } },
      { id: 'c5', function: { name: 'write_file', arguments: JSON.stringify({ id: 5 }) } }
    ];

    const results = await pipeline.dispatchBatch(testCalls, fakeDispatcher, {
      approvalService: mockApprovalService,
      agentApprovalMode: 'auto',
      session: { alwaysAllowTools: [] },
      streamId: 'test_stream',
      emitChunk: () => {}
    });

    assert.strictEqual(results.length, 5);
    assert.ok(maxObservedConcurrency > 1, `Observed concurrency was ${maxObservedConcurrency}, expected > 1`);
    assert.strictEqual(results[4].tc.id, 'c5');
    assert.strictEqual(results[4].postResult.rawResult.data, 'result_5');

    // Verify budget clipping
    const hugeText = 'x'.repeat(30 * 1024);
    const clipped = clipToolContent(hugeText, 1024);
    assert.ok(clipped.length < 2000);
    assert.ok(clipped.includes('已省略中间'));

    console.log('PASS: Three-Stage Tool Pipeline & Concurrency verified');
  }

  console.log('--- 4. Testing Subagent Derivation (Spawn/Fork) & Depth Guard ---');
  {
    const subManager = new SubagentManager({ maxDepth: 2 });

    // Verify tool definition
    assert.strictEqual(SUBAGENT_TOOL_DEFINITION.function.name, 'dispatch_subagent');
    assert.ok(SUBAGENT_TOOL_DEFINITION.function.parameters.properties.mode);

    // 1. Depth Guard test
    const parentAtMax = { delegationDepth: 2 };
    assert.strictEqual(subManager.canDerive(parentAtMax), false, 'Parent at maxDepth cannot derive');

    const blockedResult = await subManager.runSubagent({
      parentSession: parentAtMax,
      taskPrompt: '尝试深入调用'
    });
    assert.strictEqual(blockedResult.ok, false);
    assert.ok(blockedResult.error.includes('已达到最大智能体派生深度限制'));

    // 2. Spawn mode test (fresh slate execution with mocked stream)
    const originalStreamCompletion = protocols.streamCompletion;
    try {
      protocols.streamCompletion = async (opts, onEvent) => {
        // Mock subagent generating simple final conclusion
        onEvent({ type: 'content', delta: '专项任务调研已完成：无安全漏洞。' });
        onEvent({ type: 'done' });
      };

      const parentSession = { delegationDepth: 0, messages: [] };
      const spawnRes = await subManager.runSubagent({
        parentSession,
        taskPrompt: '检查安全配置',
        mode: 'spawn',
        role: '安全审计员',
        config: { model: 'gpt-4o-mini' }
      });

      assert.strictEqual(spawnRes.ok, true);
      assert.strictEqual(spawnRes.depth, 1);
      assert.strictEqual(spawnRes.mode, 'spawn');
      assert.ok(spawnRes.summary.includes('无安全漏洞'));

      // 3. Fork mode test (snapshot inheritance)
      let capturedOpts = null;
      protocols.streamCompletion = async (opts, onEvent) => {
        capturedOpts = opts;
        onEvent({ type: 'content', delta: '分叉分支探索得出结论 A 较优。' });
        onEvent({ type: 'done' });
      };

      const forkParent = {
        delegationDepth: 0,
        messages: [
          { role: 'user', content: '原始需求' },
          { role: 'assistant', content: '原始方案分析' }
        ]
      };

      const forkRes = await subManager.runSubagent({
        parentSession: forkParent,
        taskPrompt: '尝试方案 B',
        mode: 'fork'
      });

      assert.strictEqual(forkRes.ok, true);
      assert.ok(capturedOpts.messages.some(m => m.content === '原始方案分析'), 'Fork mode inherits parent messages');
      assert.ok(capturedOpts.messages.some(m => m.content.includes('尝试方案 B')), 'Fork mode includes task prompt');

    } finally {
      protocols.streamCompletion = originalStreamCompletion;
    }

    console.log('PASS: Subagent Derivations & Depth Guard verified');
  }

  console.log('--- 5. Testing Subagent Parallel Fan-Out, Timeout, Nesting & Background Registry ---');
  {
    // 让超时测试可快速收敛：注入远低于生产下限 (30s) 的最小超时
    const subManager = new SubagentManager({ maxDepth: 2, minChildTimeoutMs: 80 });
    const parentSession = { delegationDepth: 0, messages: [] };

    const originalStreamCompletion = protocols.streamCompletion;
    try {
      // 1. tasks 数组并行扇出：两个子任务交错执行，全部 start 先于任何 finish
      const chunkLog = [];
      let callSeq = 0;
      protocols.streamCompletion = async (opts, onEvent) => {
        const mySeq = ++callSeq;
        await new Promise(r => setTimeout(r, 60)); // 模拟流式延迟，制造交错窗口
        onEvent({ type: 'content', delta: `任务${mySeq}结论。` });
        onEvent({ type: 'done' });
      };

      const fanRes = await subManager.runSubagent({
        parentSession,
        tasks: [
          { task_prompt: '调研依赖链', role: '依赖分析员' },
          { task_prompt: '排查失败用例', role: '测试排查员' }
        ],
        toolCallId: 'tc_fanout',
        emitChunk: c => chunkLog.push(c)
      });

      assert.strictEqual(fanRes.ok, true, 'parallel fan-out succeeds');
      assert.strictEqual(fanRes.mode, 'multi');
      assert.strictEqual(fanRes.total, 2);
      assert.strictEqual(fanRes.succeeded, 2);
      assert.strictEqual(fanRes.tasks.length, 2);
      assert.ok(fanRes.tasks.every(t => t.ok && t.child_id), 'each task carries child result');

      const starts = chunkLog.filter(c => c.type === 'subagent_start');
      const finishes = chunkLog.filter(c => c.type === 'subagent_finish');
      assert.strictEqual(starts.length, 2);
      assert.strictEqual(finishes.length, 2);
      // 并行判据：第二个 start 在第一个 finish 之前（串行执行则相反）
      const firstFinishIdx = chunkLog.findIndex(c => c.type === 'subagent_finish');
      const secondStartIdx = chunkLog.map(c => c.type).lastIndexOf('subagent_start');
      assert.ok(secondStartIdx < firstFinishIdx, `children interleave (start@${secondStartIdx} < finish@${firstFinishIdx})`);
      // UI 路由元数据：toolCallId 透传 + taskIndex 区分兄弟任务
      assert.ok(starts.every(c => c.toolCallId === 'tc_fanout'));
      assert.deepStrictEqual(starts.map(c => c.taskIndex).sort(), [0, 1]);
      assert.ok(starts.every(c => c.depth === 1));

      // 2. per-child 墙钟超时：流式永不完成，超时 abort 后返回 timed_out + 部分结论
      protocols.streamCompletion = async (opts, onEvent, signal) => new Promise((resolve, reject) => {
        const t = setTimeout(resolve, 60000);
        if (signal) signal.addEventListener('abort', () => {
          clearTimeout(t);
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        }, { once: true });
      });

      const timeoutRes = await subManager.runSubagent({
        parentSession,
        taskPrompt: '慢任务',
        timeoutMs: 120
      });
      assert.strictEqual(timeoutRes.ok, false);
      assert.strictEqual(timeoutRes.timed_out, true);
      assert.ok(String(timeoutRes.error).includes('超时'));

      // 3. 受控嵌套：L1 子代理经 toolDispatcher 派生 L2 孙代（单任务），L2 层不再保留派生工具
      let l1CapturedTools = null;
      let l2CapturedTools = null;
      let l1Calls = 0;
      let l2Calls = 0;
      let l2Res = null;
      // 以系统提示词中的深度标记区分 L1/L2 流（L1: 深度: 1/2, L2: 深度: 2/2）
      protocols.streamCompletion = async (opts, onEvent) => {
        const sys = (opts.messages && opts.messages[0] && opts.messages[0].content) || '';
        if (sys.includes('深度: 2')) {
          l2Calls++;
          l2CapturedTools = opts.tools || [];
          onEvent({ type: 'content', delta: 'L2 孙代结论。' });
        } else {
          l1Calls++;
          l1CapturedTools = opts.tools || [];
          if (l1Calls === 1) {
            onEvent({
              type: 'tool_calls',
              delta: [{ index: 0, id: 'sub_tc_l1', function: { name: 'dispatch_subagent', arguments: JSON.stringify({ task_prompt: 'L2 孙代任务' }) } }]
            });
          } else {
            onEvent({ type: 'content', delta: 'L1 汇总完成。' });
          }
        }
        onEvent({ type: 'done' });
      };
      const dispatcherCalls = [];
      const childTools = [
        SUBAGENT_TOOL_DEFINITION,
        CHECK_SUBAGENTS_TOOL_DEFINITION,
        { type: 'function', function: { name: 'read_file', parameters: { type: 'object', properties: {} } } }
      ];
      const nestingRes = await subManager.runSubagent({
        parentSession,
        taskPrompt: 'L1 任务',
        role: '一级调研员',
        availableTools: childTools,
        toolDispatcher: async (subName, subArgs, childInfo) => {
          dispatcherCalls.push({ subName, depth: childInfo && childInfo.depth, hasConversation: Array.isArray(childInfo && childInfo.conversation) });
          if (subName !== 'dispatch_subagent') return { ok: true };
          if (!childInfo || childInfo.depth >= subManager.maxDepth) {
            return { ok: false, error: '子智能体内禁止再次派生子智能体（已达到派生深度限制）' };
          }
          // 深度预算内：派生 L2（模拟 chat-service 的嵌套放行路径）
          l2Res = await subManager.runSubagent({
            parentSession: { delegationDepth: childInfo.depth, messages: childInfo.conversation },
            taskPrompt: subArgs.task_prompt,
            availableTools: childTools
          });
          return l2Res;
        }
      });
      // L1 工具表在深度预算内保留 dispatch_subagent，但不含 check_subagents
      assert.ok(l1CapturedTools && l1CapturedTools.some(t => t.function && t.function.name === 'dispatch_subagent'),
        'L1 tool table keeps dispatch_subagent within depth budget');
      assert.ok(l1CapturedTools && !l1CapturedTools.some(t => t.function && t.function.name === 'check_subagents'),
        'check_subagents never leaks into child tool tables');
      // L2 已达 maxDepth：工具表不再保留 dispatch_subagent
      assert.ok(l2CapturedTools && !l2CapturedTools.some(t => t.function && t.function.name === 'dispatch_subagent'),
        'L2 tool table drops dispatch_subagent at depth budget');
      assert.strictEqual(dispatcherCalls.length, 1);
      assert.strictEqual(dispatcherCalls[0].depth, 1, 'childInfo carries real depth');
      assert.strictEqual(dispatcherCalls[0].hasConversation, true, 'childInfo carries child conversation');
      assert.strictEqual(nestingRes.ok, true);
      assert.strictEqual(nestingRes.depth, 1);
      assert.ok(l2Res && l2Res.ok && l2Res.depth === 2, 'grandchild (L2) executed at depth 2');
      assert.strictEqual(l1Calls, 2, 'L1 ran tool round + summary round');
      assert.strictEqual(l2Calls, 1, 'L2 ran a single summary round');

      // 4. 后台注册表：wait=false 立即返回，check_subagents 阻塞等待结果
      let bgDone = false;
      protocols.streamCompletion = async (opts, onEvent) => {
        await new Promise(r => setTimeout(r, 80));
        onEvent({ type: 'content', delta: '后台任务结论。' });
        onEvent({ type: 'done' });
        bgDone = true;
      };
      const bgRes = await subManager.runSubagent({
        parentSession: { ...parentSession, id: 'sess_bg' },
        taskPrompt: '后台调研',
        role: '后台调研员',
        wait: false,
        sessionId: 'sess_bg'
      });
      assert.strictEqual(bgRes.ok, true);
      assert.strictEqual(bgRes.background, true);
      assert.strictEqual(bgRes.tasks.length, 1);
      assert.strictEqual(bgRes.tasks[0].status, 'running');
      assert.ok(bgRes.tasks[0].task_id, 'background returns task_id');
      assert.ok(!bgDone, 'wait:false returns before child finishes');

      const checkRes = await subManager.checkSubagents({ sessionId: 'sess_bg', wait: true, timeoutMs: 5000 });
      assert.strictEqual(checkRes.ok, true);
      assert.strictEqual(checkRes.tasks.length, 1);
      assert.strictEqual(checkRes.tasks[0].status, 'completed');
      assert.ok(checkRes.tasks[0].summary.includes('后台任务结论'));

      // 跨会话隔离 + 提醒快照形状
      assert.strictEqual((await subManager.checkSubagents({ sessionId: 'sess_other' })).tasks.length, 0, 'session isolation');
      const snapshot = subManager.getReminderSnapshot('sess_bg');
      assert.strictEqual(snapshot.length, 1);
      assert.strictEqual(snapshot[0].status, 'completed');
      assert.strictEqual(snapshot[0].role, '后台调研员');
      assert.strictEqual(subManager.getReminderSnapshot('sess_none').length, 0);

      // 5. disposeAll 终止运行中的后台任务
      protocols.streamCompletion = async (opts, onEvent, signal) => new Promise((resolve, reject) => {
        const t = setTimeout(resolve, 60000);
        if (signal) signal.addEventListener('abort', () => {
          clearTimeout(t);
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        }, { once: true });
      });
      const killRes = await subManager.runSubagent({
        parentSession: { ...parentSession, id: 'sess_kill' },
        taskPrompt: '将被终止的任务',
        wait: false,
        sessionId: 'sess_kill'
      });
      subManager.disposeAll();
      const killCheck = await subManager.checkSubagents({ sessionId: 'sess_kill', wait: true, timeoutMs: 3000 });
      const killed = killCheck.tasks.find(t => t.task_id === killRes.tasks[0].task_id);
      assert.ok(killed, 'disposed task still queryable');
      assert.notStrictEqual(killed.status, 'running', 'disposeAll aborts running background children');
    } finally {
      protocols.streamCompletion = originalStreamCompletion;
    }

    console.log('PASS: Subagent Fan-Out, Timeout, Nesting & Background Registry verified');
  }

  console.log('--- 6. Testing Subagent Report Completion & Failure Delivery ---');
  {
    const manager = new SubagentManager({ minChildTimeoutMs: 20 });
    const original = protocols.streamCompletion;
    const tool = { type: 'function', function: { name: 'read_file', parameters: { type: 'object', properties: {} } } };
    try {
      // A tool-only last round must be followed by synthesis, for background tasks too.
      let calls = 0;
      protocols.streamCompletion = async (opts, emit) => {
        calls++;
        if (calls === 1) {
          emit({ type: 'tool_calls', delta: [{ index: 0, id: 'last_evidence', function: { name: 'read_file', arguments: '{}' } }] });
        } else {
          assert.strictEqual(opts.tools, null);
          assert.ok(opts.messages.some(m => m.role === 'tool' && m.content.includes('SOURCE_PAYLOAD')));
          emit({ type: 'content', delta: 'FINAL_REPORT_WITH_SOURCE_PAYLOAD' });
        }
      };
      await manager.runSubagent({
        parentSession: { id: 'report_bg' }, taskPrompt: '调研', maxRounds: 1,
        wait: false, availableTools: [tool], toolDispatcher: async () => ({ evidence: 'SOURCE_PAYLOAD' })
      });
      const checked = await manager.checkSubagents({ sessionId: 'report_bg', wait: true });
      assert.strictEqual(checked.tasks[0].status, 'completed');
      assert.strictEqual(checked.tasks[0].summary, 'FINAL_REPORT_WITH_SOURCE_PAYLOAD');
      assert.strictEqual(calls, 2, 'one tool round plus one final report round');

      // Empty output must not claim success or invent a generic completion report.
      const chunks = [];
      protocols.streamCompletion = async () => {};
      const empty = await manager.runSubagent({ taskPrompt: '空响应', emitChunk: c => chunks.push(c) });
      assert.strictEqual(empty.ok, false, 'empty report is a failure');
      assert.ok(empty.error.includes('最终报告'));
      assert.strictEqual(chunks.at(-1).ok, false, 'UI does not claim a completed report');

      // If synthesis fails, keep useful partial text but mark it incomplete.
      let round = 0;
      protocols.streamCompletion = async (opts, emit) => {
        if (++round === 1) {
          emit({ type: 'content', delta: 'PARTIAL_FINDING' });
          emit({ type: 'tool_calls', delta: [{ index: 0, id: 'partial', function: { name: 'read_file', arguments: '{}' } }] });
        } else {
          throw new Error('report endpoint unavailable');
        }
      };
      const partial = await manager.runSubagent({
        taskPrompt: '总结失败', maxRounds: 1, availableTools: [tool], toolDispatcher: async () => ({ ok: true })
      });
      assert.strictEqual(partial.ok, false);
      assert.strictEqual(partial.incomplete, true);
      assert.strictEqual(partial.summary, 'PARTIAL_FINDING');
      assert.ok(partial.error.includes('report endpoint unavailable'));

      // Timeout during synthesis must stay within the original child deadline.
      round = 0;
      protocols.streamCompletion = async (opts, emit, signal) => {
        if (++round === 1) {
          emit({ type: 'tool_calls', delta: [{ index: 0, id: 'deadline', function: { name: 'read_file', arguments: '{}' } }] });
          return;
        }
        emit({ type: 'content', delta: 'PARTIAL_REPORT_BEFORE_TIMEOUT' });
        await new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
      };
      const timeout = await manager.runSubagent({
        taskPrompt: '总结超时', maxRounds: 1, timeoutMs: 40, availableTools: [tool], toolDispatcher: async () => ({ ok: true })
      });
      assert.strictEqual(timeout.ok, false);
      assert.strictEqual(timeout.timed_out, true);
      assert.strictEqual(timeout.summary, 'PARTIAL_REPORT_BEFORE_TIMEOUT');
    } finally {
      manager.disposeAll();
      protocols.streamCompletion = original;
    }
    console.log('PASS: final reports synthesized; empty, failed and timed-out reports never claim success');
  }

  console.log('\n========================================');
  console.log('ALL DEEPSEEK-HARNESS RUNTIME TESTS PASSED!');
  console.log('========================================');
}

main().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
