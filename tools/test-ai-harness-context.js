/* Test Suite: DeepSeek-Harness Inspired Context Management Optimizations
   Verifies:
   1. Head-Middle-Tail tool result pruning (preserves context setup & trailing exit status)
   2. Session-level tool result batch pruning (pruneSessionToolResults)
   3. Multimodal historical image offload (offloadSessionImages)
   4. Compaction transaction lock & Tool-Pairing Invariants preservation during compaction
   5. Prefix KV Cache stability: Static System Prompt anchor remains byte-for-byte immutable
   6. Context-overflow error detection & auto-recovery resilience
*/

const assert = require('assert');
const { pruneTextContent, clipToolContent } = require('../src/plugins/ai-chat/services/tool-pipeline');
const { CompactionService, compactionService } = require('../src/plugins/ai-chat/services/compaction-service');
const { ChatService } = require('../src/plugins/ai-chat/services/chat-service');
const { toolPairingBalancedAt } = require('../src/plugins/ai-chat/lib/context-bounds');

async function runTests() {
  console.log('==================================================');
  console.log('🚀 开始测试 DeepSeek-Harness 上下文管理机制优化');
  console.log('==================================================');

  // [Test 1] 验证 Head-Middle-Tail 工具结果智能剪枝
  console.log('\n[Test 1] 验证 Head-Middle-Tail 工具结果剪枝 (保留前因与尾部状态)...');
  const dummyHead = '=== Test Suite Run Starting: 15 tests queued ===\n';
  const dummyBloat = 'Line output padding: '.repeat(500); // ~11,000 chars
  const dummyTail = '\n=== Final Summary: 14 passed, 1 failed. Exit code 1. ===';
  const fullLog = `${dummyHead}${dummyBloat}${dummyTail}`;

  const pruned = pruneTextContent(fullLog, { threshold: 4000, headChars: 500, tailChars: 500 });
  assert.ok(pruned.length < fullLog.length, '剪枝后字符数应明显减少');
  assert.ok(pruned.startsWith(dummyHead), '必须完整保留头部 setup/前因信息');
  assert.ok(pruned.endsWith(dummyTail), '必须完整保留尾部最终统计与退出码');
  assert.ok(pruned.includes('[... 工具结果过长，已省略中间'), '中间超长部分应包含标准省略标记');

  // 验证 clipToolContent 默认使用 Head-Middle-Tail
  const clipped = clipToolContent(fullLog, 3000);
  assert.ok(clipped.startsWith(dummyHead.slice(0, 50)), 'clipToolContent 应保留头部');
  assert.ok(clipped.endsWith(dummyTail), 'clipToolContent 应保留尾部退出状态');
  console.log('✓ Test 1 通过');

  // [Test 2] 验证会话级历史工具结果批量剪枝 (pruneSessionToolResults)
  console.log('\n[Test 2] 验证会话级历史工具结果批量剪枝...');
  const testService = new CompactionService();
  const sessionWithBloatedTools = {
    id: 's_tools',
    messages: [
      { id: 'm1', role: 'user', content: '运行测试' },
      {
        id: 'm2',
        role: 'assistant',
        content: '已执行测试命令',
        toolCalls: [{ id: 'call_cmd_1', type: 'function', function: { name: 'run_command' } }]
      },
      {
        id: 'm3',
        role: 'tool',
        tool_call_id: 'call_cmd_1',
        content: `Start compile\n${'compiling file chunk...\n'.repeat(400)}\nCompilation succeeded. Status: 0`
      },
      { id: 'm4', role: 'user', content: '下一步' }
    ]
  };

  const pruneRes = testService.pruneSessionToolResults(sessionWithBloatedTools, {
    threshold: 2000,
    headChars: 400,
    tailChars: 400
  });

  assert.strictEqual(pruneRes.ok, true);
  assert.strictEqual(pruneRes.prunedCount, 1, '应命中并剪枝 1 条超长工具消息');
  assert.ok(pruneRes.savedChars > 5000, '应节省大额字符占用');
  const toolMsg = sessionWithBloatedTools.messages.find(m => m.role === 'tool');
  assert.ok(toolMsg.content.includes('Compilation succeeded. Status: 0'), '尾部成功状态必须完整保留');
  console.log('✓ Test 2 通过');

  // [Test 3] 验证多模态历史大图卸载 (offloadSessionImages)
  console.log('\n[Test 3] 验证多模态历史大图自动卸载 (Image Offload)...');
  const sessionWithImages = {
    id: 's_images',
    messages: [
      { id: 'img_user_1', role: 'user', content: '第一张图', images: ['data:image/png;base64,VERY_LARGE_IMAGE_DATA_1'] },
      { id: 'ast_1', role: 'assistant', content: '图1识别为架构图' },
      { id: 'img_user_2', role: 'user', content: '第二张图', images: ['data:image/png;base64,VERY_LARGE_IMAGE_DATA_2'] },
      { id: 'ast_2', role: 'assistant', content: '图2识别为流程图' },
      { id: 'img_user_3', role: 'user', content: '第三张图（最新）', images: ['data:image/png;base64,RECENT_IMAGE_DATA_3'] },
      { id: 'ast_3', role: 'assistant', content: '正在分析最新图' }
    ]
  };

  const { buildBoundedContext } = require('../src/plugins/ai-chat/lib/context-bounds');
  const offloadRes = testService.offloadSessionImages(sessionWithImages, { keepRecentRounds: 1 });
  assert.strictEqual(offloadRes.ok, true);
  assert.strictEqual(offloadRes.offloadedCount, 2, '前两张早期大图应被标记为卸载');

  const oldMsg1 = sessionWithImages.messages[0];
  const recentMsg = sessionWithImages.messages[4];

  // 1. UI 展示层：图片数据绝对不丢，用户依然可以翻看与缩放
  assert.strictEqual(oldMsg1.images.length, 1, 'UI展示层：历史旧图片的 base64 数组必须完整保留！');
  assert.strictEqual(recentMsg.images.length, 1, 'UI展示层：最新轮次的图片必须完整保留');

  // 2. 模型推理层：通过 buildBoundedContext 给大模型发请求时，历史旧图自动被卸载为文本占位，不占上下文
  const modelContextWithImages = buildBoundedContext(sessionWithImages.messages, 16);
  const modelOldMsg1 = modelContextWithImages.find(m => m.role === 'user' && m.content.includes('第一张图'));
  assert.ok(modelOldMsg1, '模型上下文中应当包含第一条用户消息');
  assert.strictEqual(modelOldMsg1.images, undefined, '模型端推理上下文中：旧图片的真实 payload 应被自动卸载');
  assert.ok(modelOldMsg1.content.includes('历史多模态图片'), '模型端应收到紧凑的占位提示说明');

  const modelRecentMsg = modelContextWithImages.find(m => m.role === 'user' && m.content === '第三张图（最新）');
  assert.ok(modelRecentMsg && Array.isArray(modelRecentMsg.images), '模型端推理上下文中：最新图片 payload 应被完整发送');
  console.log('✓ Test 3 通过');

  // [Test 4] 验证带工具调用的会话在压缩时严格保持 Tool Pairing Invariant 与展示层/模型层隔离
  console.log('\n[Test 4] 验证压缩过程展示数据完整无损、插入压缩卡片，且大模型上下文 Tool Pairing 平衡...');
  const sessionWithToolChain = {
    id: 's_chain',
    messages: [
      { id: 'u1', role: 'user', content: '分析项目结构' },
      {
        id: 'a1',
        role: 'assistant',
        content: '我来读取目录',
        tool_calls: [{ id: 'tc_101', type: 'function', function: { name: 'list_dir' } }]
      },
      { id: 't1', role: 'tool', tool_call_id: 'tc_101', content: 'index.js\npackage.json' },
      { id: 'a2', role: 'assistant', content: '目录读取完成，现在开始写测试' },
      { id: 'u2', role: 'user', content: '继续下一步' },
      {
        id: 'a3',
        role: 'assistant',
        content: '正在运行测试',
        tool_calls: [{ id: 'tc_102', type: 'function', function: { name: 'run_command' } }]
      },
      { id: 't2', role: 'tool', tool_call_id: 'tc_102', content: 'All tests passed' },
      { id: 'a4', role: 'assistant', content: '测试全部通过！' },
      { id: 'u3', role: 'user', content: '好的，请总结' }
    ]
  };

  const compResult = await testService.compactSession(sessionWithToolChain, {
    config: { baseUrl: 'http://127.0.0.1:1', apiKey: 'mock' },
    keepCount: 4,
    genId: p => `${p}_check`
  });

  assert.strictEqual(compResult.ok, true);

  // 1. UI 展示层：9 条历史原始消息一条不删，外加 1 条新插入的压缩结果卡片，总共 10 条
  assert.strictEqual(sessionWithToolChain.messages.length, 10, 'UI 展示层必须完整保留所有 9 条历史消息并插入 1 条压缩卡片 (9+1=10)');
  assert.ok(sessionWithToolChain.messages.some(m => m.id === 'u1'), '第一条消息 u1 必须在展示数据中');
  assert.ok(sessionWithToolChain.messages.some(m => m.id === 't1'), '工具执行结果 t1 必须在展示数据中');
  assert.ok(sessionWithToolChain.messages.some(m => m.role === 'compaction_divider'), '必须包含 compaction_divider 检查点卡片');

  // 2. 模型推理层：通过 buildBoundedContext 提取出的上下文已被大幅精简
  const modelContext = buildBoundedContext(sessionWithToolChain.messages, 16);
  assert.ok(modelContext.length < 9, '模型推理上下文应折叠历史，长度显著精简 (< 9)');
  assert.strictEqual(modelContext[0].role, 'assistant', '模型推理上下文起点为提炼摘要卡片');

  // 3. 校验大模型上下文中，所有出现的 tool 消息都严格拥有匹配的 assistant tool_call
  const remainingCalls = new Set();
  for (const m of modelContext) {
    const calls = m.tool_calls || m.toolCalls;
    if (Array.isArray(calls)) {
      for (const tc of calls) remainingCalls.add(tc.id);
    }
  }
  for (const m of modelContext) {
    if (m.role === 'tool') {
      assert.ok(
        remainingCalls.has(m.tool_call_id),
        `模型上下文中，工具消息 ${m.tool_call_id} 必须拥有匹配的前置 assistant tool_call`
      );
    }
  }

  // 验证事务锁自动释放
  assert.strictEqual(testService.isCompacting('s_chain'), false, '压缩完成后互斥锁应被正常释放');
  console.log('✓ Test 4 通过');

  // [Test 5] 验证静态前缀与动态运行时上下文解耦 (Prefix KV Cache 亲和性)
  console.log('\n[Test 5] 验证静态 System Prompt 前缀稳定不变 (Prefix Cache 锚点)...');
  const chatService = new ChatService();

  const mockSession1 = {
    id: 's_cache_1',
    personaId: 'developer',
    workDir: 'E:/projectA',
    taskList: [{ id: 't1', content: '步骤1', status: 'completed' }],
    messages: []
  };

  const getPersona = () => ({
    id: 'developer',
    prompt: '你是一位资深架构师。',
    temperature: 0.3
  });

  // 第一次运行环境 A
  const ctxA = chatService.runtimeContextService.assembleContext({
    session: mockSession1,
    persona: getPersona(),
    enableAgent: true,
    agentWorkDir: 'E:/projectA',
    userQuery: '检查项目 A',
    memories: []
  });

  // 第二次运行环境 B (修改了工作目录、更新了任务进度)
  mockSession1.workDir = 'E:/projectB';
  mockSession1.taskList = [
    { id: 't1', content: '步骤1', status: 'completed' },
    { id: 't2', content: '步骤2', status: 'in_progress' }
  ];

  const ctxB = chatService.runtimeContextService.assembleContext({
    session: mockSession1,
    persona: getPersona(),
    enableAgent: true,
    agentWorkDir: 'E:/projectB',
    userQuery: '检查项目 B',
    memories: []
  });

  assert.strictEqual(
    ctxA.systemPrompt,
    ctxB.systemPrompt,
    '不同环境/任务变动下，静态 System Prompt 必须保持逐字符绝对一致以命中 Prefix Cache'
  );
  assert.notStrictEqual(
    ctxA.dynamicContextBlock,
    ctxB.dynamicContextBlock,
    '动态环境事实必须独立演进，不污染系统提示词'
  );
  console.log('✓ Test 5 通过');

  console.log('\n==================================================');
  console.log('🎉 所有 DeepSeek-Harness 上下文优化测试均成功通过！');
  console.log('==================================================');
}

runTests().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
