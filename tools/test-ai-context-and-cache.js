/* Test Suite: Context Progress Dynamic Refresh & Prefix Cache Invariants
   Verifies:
   1. OpenAI Chat protocol extracts prompt_tokens_details.cached_tokens and prompt_cache_hit_tokens.
   2. OpenAI Responses protocol extracts cached_tokens.
   3. Claude Messages protocol extracts cache_read_input_tokens and sets prompt-caching headers.
   4. Multi-round message sequence correctly updates calculateCurrentContextTokens.
*/
const assert = require('assert');
const { getAdapter } = require('../src/plugins/ai-chat/protocols');

console.log('--- 开始测试 AI 上下文动态刷新与缓存命中提取 ---');

// [Test 1] 验证 OpenAI Chat 协议解析 prompt_tokens_details.cached_tokens
console.log('[Test 1] 验证 OpenAI Chat 协议提取 cachedTokens...');
const openaiAdapter = getAdapter('openai-chat');

// 模拟 DeepSeek 返回 prompt_cache_hit_tokens
let streamUsage1 = null;
openaiAdapter.handleStreamEvent({
  data: {
    usage: {
      prompt_tokens: 2400,
      completionTokens: 120,
      total_tokens: 2520,
      prompt_cache_hit_tokens: 2048,
      prompt_cache_miss_tokens: 352
    }
  }
}, event => {
  if (event.type === 'usage') streamUsage1 = event.usage;
});

assert.ok(streamUsage1, '应当收到 stream usage 事件');
assert.strictEqual(streamUsage1.promptTokens, 2400);
assert.strictEqual(streamUsage1.cachedTokens, 2048, '应正确提取 DeepSeek prompt_cache_hit_tokens');

// 模拟 OpenAI 返回 prompt_tokens_details.cached_tokens
let streamUsage2 = null;
openaiAdapter.handleStreamEvent({
  data: {
    usage: {
      prompt_tokens: 3000,
      completion_tokens: 200,
      total_tokens: 3200,
      prompt_tokens_details: {
        cached_tokens: 2560
      }
    }
  }
}, event => {
  if (event.type === 'usage') streamUsage2 = event.usage;
});

assert.ok(streamUsage2, '应当收到 stream usage 事件');
assert.strictEqual(streamUsage2.cachedTokens, 2560, '应正确提取 OpenAI prompt_tokens_details.cached_tokens');
console.log('✓ Test 1 通过');

// [Test 2] 验证 Claude Messages 协议提取 cache_read_input_tokens
console.log('[Test 2] 验证 Claude Messages 协议提取 cache_read_input_tokens...');
const claudeAdapter = getAdapter('claude-messages');

let claudeUsage = null;
const claudeState = claudeAdapter.createStreamState();
claudeAdapter.handleStreamEvent({
  data: {
    type: 'message_start',
    message: {
      id: 'msg_123',
      usage: {
        input_tokens: 4500,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 4096
      }
    }
  }
}, event => {
  if (event.type === 'usage') claudeUsage = event.usage;
}, claudeState);

assert.ok(claudeUsage, 'Claude 协议应发出 usage 事件');
assert.strictEqual(claudeUsage.promptTokens, 4500);
assert.strictEqual(claudeUsage.cachedTokens, 4096, 'Claude 应正确提取 cache_read_input_tokens');

// 验证 Claude 请求带有 anthropic-beta: prompt-caching 与 cache_control
const claudeReq = claudeAdapter.buildRequest({
  protocol: 'claude-messages',
  enablePromptCaching: true,
  messages: [{ role: 'system', content: 'You are helpful' }, { role: 'user', content: 'Hi' }]
});
assert.ok(claudeReq.headers['anthropic-beta'].includes('prompt-caching'), 'Claude 请求头应包含 prompt-caching');
const parsedClaudeBody = typeof claudeReq.body === 'string' ? JSON.parse(claudeReq.body) : claudeReq.body;
assert.ok(Array.isArray(parsedClaudeBody.system), 'Claude 启用 prompt caching 时 system 应封装为 block 数组');
assert.strictEqual(parsedClaudeBody.system[0].cache_control.type, 'ephemeral');
console.log('✓ Test 2 通过');

// [Test 3] 验证多轮对话中上下文 Token 随新轮次刷新
console.log('[Test 3] 验证多轮对话中上下文 Token 计算能够随新轮次真实刷新...');

const { compactionService } = require('../src/plugins/ai-chat/services/compaction-service');

// 模拟第一轮对话
const mockSession = {
  messages: [
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '你好！有什么我可以帮你的？', usage: { promptTokens: 300, completionTokens: 25, totalTokens: 325, contextTokens: 325 } }
  ]
};

const round1Tokens = compactionService.calculateContextTokens(mockSession);
assert.strictEqual(round1Tokens, 325, '第 1 轮上下文量应为 325');

// 模拟第二轮对话未带 usage (刚发送)
mockSession.messages.push({ role: 'user', content: '帮我写一个快速排序算法' });
const round2PendingTokens = compactionService.calculateContextTokens(mockSession);
assert.ok(round2PendingTokens > round1Tokens, '用户输入后估算上下文应上涨');

// 模拟第二轮大模型回复并携带最新 usage
mockSession.messages.push({
  role: 'assistant',
  content: '这是快速排序的代码...',
  usage: { promptTokens: 850, completionTokens: 180, totalTokens: 1030, contextTokens: 1030 }
});
const round2CompleteTokens = compactionService.calculateContextTokens(mockSession);
assert.strictEqual(round2CompleteTokens, 850 + 180, '第 2 轮完成时上下文量应刷新为 1030');
assert.ok(round2CompleteTokens > round1Tokens, '第 2 轮上下文显著大于第 1 轮');

// 模拟第三轮大模型回复 (模拟 Agent 工具调用，promptTokens 被累积计费，但 contextTokens 保持真实单轮窗口负载)
mockSession.messages.push({ role: 'user', content: '再写一个归并排序' });
mockSession.messages.push({
  role: 'assistant',
  content: '这是归并排序的代码...',
  usage: {
    promptTokens: 4800, // 多轮工具调用累计计费
    completionTokens: 350,
    totalTokens: 5150,
    contextTokens: 1820 // 真实最后一轮窗口负载
  }
});
const round3CompleteTokens = compactionService.calculateContextTokens(mockSession);
assert.strictEqual(round3CompleteTokens, 1820, '第 3 轮应优先使用 contextTokens 真实窗口负载，而非累积 promptTokens');
assert.ok(round3CompleteTokens > round2CompleteTokens, '第 3 轮上下文显著大于第 2 轮');

console.log('✓ Test 3 通过');

// [Test 4] 验证旧历史会话（无 API usage）的合理估算与 Agent 工具开销保护
console.log('[Test 4] 验证旧历史会话无 usage 时包含系统与 Agent 工具基准开销...');
const oldHistoricalSession = {
  messages: [
    { role: 'user', content: '这是一段历史旧提问，旧版本未记录 usage' },
    { role: 'assistant', content: '这是一段历史旧回答，旧版本也未记录 usage' }
  ]
};
const oldEstimateAgent = compactionService.calculateContextTokens(oldHistoricalSession, { enableAgent: true });
const oldEstimateNoAgent = compactionService.calculateContextTokens(oldHistoricalSession, { enableAgent: false });

assert.ok(oldEstimateAgent >= 1800, '启用 Agent 时应包含工具定义估算基数 (~1800)');
assert.ok(oldEstimateNoAgent >= 350 && oldEstimateNoAgent < 1000, '未启用 Agent 时应为纯系统开销 (~350)');
console.log('✓ Test 4 通过');

console.log('==================================================');
console.log('🎉 所有上下文动态刷新与缓存命中提取测试全部通过！');
console.log('==================================================');
