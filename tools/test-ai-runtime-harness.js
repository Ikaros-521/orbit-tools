/* Comprehensive automated tests for DeepSeek Harness runtime mechanisms in Orbit AI:
   1. Double-Layer Context & Prefix Caching Invariance (runtime-context-service.js)
   2. Tool Pairing Balanced Invariants & Context Bounding (context-bounds.js)
   3. Three-Stage Tool Execution Pipeline & Concurrency Scheduler (tool-pipeline.js)
   4. Subagent Derivations (Spawn vs Fork) & Depth Guard (subagent-service.js)
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
  SUBAGENT_TOOL_DEFINITION
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
    assert.ok(clipped.includes('已自动截断'));

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

  console.log('\n========================================');
  console.log('ALL DEEPSEEK-HARNESS RUNTIME TESTS PASSED!');
  console.log('========================================');
}

main().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
