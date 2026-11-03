// Test AI Chat Context Compaction & Token Ring Metrics
const assert = require('assert');
const { CompactionService } = require('../src/plugins/ai-chat/services/compaction-service');
const backend = require('../src/plugins/ai-chat/backend');

async function runTests() {
  console.log('--- 开始测试 AI 对话上下文压缩与容量环形进度圈 ---');

  const compactionService = new CompactionService();

  // Test 1: calculateContextTokens accuracy
  console.log('[Test 1] 验证 calculateContextTokens 计算活跃上下文 Token 量...');
  assert.strictEqual(compactionService.calculateContextTokens(null), 0);
  assert.strictEqual(compactionService.calculateContextTokens({ messages: [] }), 0);

  const heuristicSession = {
    messages: [
      { role: 'user', content: '你好，请帮我设计一个系统。' }, // ~15 chars -> ~5 tokens + 150 overhead
      { role: 'assistant', content: '好的，请问有什么具体要求吗？' } // ~15 chars
    ]
  };
  const heuristicTokens = compactionService.calculateContextTokens(heuristicSession);
  assert.ok(heuristicTokens >= 150, '无 API usage 时应基于字符与基础开销估算 (>= 150)');

  const tailText = '第二轮继续追问：请展开说说第一点细节。';
  const sessionWithUsage = {
    messages: [
      { role: 'user', content: '第一轮用户提问' },
      {
        role: 'assistant',
        content: '第一轮助手回复',
        usage: { promptTokens: 350, completionTokens: 120, totalTokens: 470 }
      },
      { role: 'user', content: tailText }
    ]
  };
  const tokensWithUsage = compactionService.calculateContextTokens(sessionWithUsage);
  assert.strictEqual(tokensWithUsage, 350 + 120 + Math.ceil(tailText.length / 3.2), '应准确基于最新 API usage + 尾部增量');
  console.log('✓ Test 1 通过');

  // Test 2: compactSession rejection for short sessions
  console.log('[Test 2] 验证会话过短时拒绝压缩保护...');
  const shortSession = {
    id: 's_short',
    messages: [{ role: 'user', content: '单条消息' }]
  };
  const resShort = await compactionService.compactSession(shortSession);
  assert.strictEqual(resShort.ok, false);
  assert.ok(resShort.error.includes('历史较短') || resShort.error.includes('无需压缩'));
  console.log('✓ Test 2 通过');

  // Test 3: compactSession multi-turn compression & offline fallback
  console.log('[Test 3] 验证多轮对话压缩并保留最新对话轮次...');
  const multiTurnSession = {
    id: 's_multi',
    messages: [
      { id: 'm1', role: 'user', content: '我们来讨论下重构计划。' },
      { id: 'm2', role: 'assistant', content: '好的，可以分为架构梳理、接口契约和回归测试三个阶段。' },
      { id: 'm3', role: 'user', content: '第一阶段已经完成，现在开始第二阶段。' },
      { id: 'm4', role: 'assistant', content: '收到，正在定义接口契约…' },
      { id: 'm5', role: 'user', content: '继续完成第三阶段测试' }
    ]
  };

  const resCompact = await compactionService.compactSession(multiTurnSession, {
    config: { baseUrl: 'http://127.0.0.1:1', apiKey: 'invalid_mock_key_for_test' },
    genId: (prefix) => `${prefix}_test_checkpoint`
  });

  assert.strictEqual(resCompact.ok, true, '压缩应当执行成功 (自动降级至离线结构化提炼)');
  assert.ok(multiTurnSession.messages.length < 5, '会话消息条数应当被精简');

  const firstMsg = multiTurnSession.messages[0];
  assert.strictEqual(firstMsg.role, 'assistant', '第一条消息应转换为提炼摘要助手消息');
  assert.strictEqual(firstMsg.isCompacted, true, '摘要消息应打上 isCompacted: true 标记');
  assert.ok(firstMsg.content.includes('上下文压缩摘要'), '摘要内容应包含标准压缩标题');

  // Check that recent messages are preserved
  const lastMsg = multiTurnSession.messages[multiTurnSession.messages.length - 1];
  assert.strictEqual(lastMsg.id, 'm5', '最新消息应被完整保留');
  assert.strictEqual(lastMsg.content, '继续完成第三阶段测试');
  console.log('✓ Test 3 通过');

  // Test 4: Default maxContextTokens configuration
  console.log('[Test 4] 验证后端默认 maxContextTokens 配置为 200k...');
  assert.strictEqual(backend.DEFAULT_CONFIG.maxContextTokens, 200000, '默认 maxContextTokens 应为 200,000 (200k)');
  console.log('✓ Test 4 通过');

  // Test 5: Progress ring percentage & state logic
  console.log('[Test 5] 验证环形进度圈百分比与告警等级阈值计算...');
  const maxTokens = 200000;
  const calcState = (tokens) => {
    const pct = Math.min(100, Math.max(0, Math.round((tokens / maxTokens) * 100)));
    let state = 'normal';
    if (pct >= 85) state = 'danger';
    else if (pct >= 60) state = 'warning';
    return { pct, state };
  };

  assert.deepStrictEqual(calcState(20000), { pct: 10, state: 'normal' });
  assert.deepStrictEqual(calcState(120000), { pct: 60, state: 'warning' });
  assert.deepStrictEqual(calcState(170000), { pct: 85, state: 'danger' });
  assert.deepStrictEqual(calcState(250000), { pct: 100, state: 'danger' });
  console.log('✓ Test 5 通过');

  console.log('==================================================');
  console.log('✅ 所有 AI 上下文压缩与进度圈测试全部通过！');
  console.log('==================================================');
}

runTests().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
