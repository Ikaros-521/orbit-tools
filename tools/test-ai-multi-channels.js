/* Test Suite: AI Chat Multi-Channel, Multi-Key & Popover Isolation Support
   Verifies:
   1. Multi-channel default configuration & clean configured-channels list.
   2. Data migration: legacy flat config smoothly migrates to channel entity with apiKeys array.
   3. Multi-channel credential isolation & switchActiveChannel.
   4. Single-channel multi-model management & syncChannelModels.
   5. Custom channel creation & safe deletion.
   6. UI Template structure: settings modal multi-key UI & create-channel popover.
   7. Single-channel multi-key management (addChannelKey, switchChannelActiveKey, deleteChannelKey).
   8. Chat popover isolation: unconfigured channels are strictly prevented from appearing or being searched.
*/
const assert = require('assert');
const backend = require('../src/plugins/ai-chat/backend');
const { PRESET_CHANNELS } = require('../src/plugins/ai-chat/lib/markdown-renderer');
const { getAiChatTemplate } = require('../src/plugins/ai-chat/components/panel-template');

console.log('--- 开始测试 AI 对话多渠道、单渠道多密钥与对话区隔离架构 ---');

// Mock context factory
function createMockContext(initialData = {}) {
  let storedData = JSON.parse(JSON.stringify(initialData));
  const handlers = {};
  return {
    data: {
      get: () => storedData,
      set: (d) => { storedData = JSON.parse(JSON.stringify(d)); }
    },
    ipc: {
      handle: (channel, fn) => { handlers[channel] = fn; }
    },
    // Test helper to invoke registered IPC handler
    call: async (channel, args) => {
      if (!handlers[channel]) throw new Error(`未注册的 IPC 处理器: ${channel}`);
      return await handlers[channel](args);
    },
    getStoredData: () => storedData
  };
}

// [Test 1] 默认配置与纯净已配置渠道列表初始化
console.log('[Test 1] 验证 DEFAULT_CONFIG 维护独立的已配置渠道列表，且模板库包含全部主流预设...');
assert.ok(Array.isArray(backend.DEFAULT_CONFIG.channels), 'DEFAULT_CONFIG.channels 应为数组');
assert.ok(backend.DEFAULT_CONFIG.channels.length >= 1, '已配置渠道列表默认初始化至少1个已配置渠道');
assert.ok(backend.PRESET_TEMPLATES.length >= 10, '预设模板库 PRESET_TEMPLATES 应当包含至少 10 个主流厂商模板');
const activeCh = backend.DEFAULT_CONFIG.channels.find(c => c.id === backend.DEFAULT_CONFIG.activeChannelId);
assert.ok(activeCh, '初始已配置渠道中必须包含当前激活渠道');
assert.ok(Array.isArray(activeCh.models) && activeCh.models.length > 0, '激活渠道应拥有内置模型列表');
console.log('✓ Test 1 通过');

// [Test 2] 旧版本数据向多渠道+多密钥无损平滑迁移
console.log('[Test 2] 验证旧版本扁平配置启动时无损平滑迁移入渠道库与多密钥结构...');
const legacyData = {
  config: {
    channel: 'deepseek',
    protocol: 'openai-chat',
    baseUrl: 'https://my-custom-deepseek-proxy.com/v1',
    apiKey: 'sk-deepseek-secret-123456',
    model: 'deepseek-reasoner'
  }
};
const ctxLegacy = createMockContext(legacyData);
backend.activate(ctxLegacy);

const initRes = ctxLegacy.getStoredData();
const migratedChannels = initRes.config.channels;
assert.ok(Array.isArray(migratedChannels), '迁移后配置应包含 channels 数组');
const migratedDeepseek = migratedChannels.find(c => c.id === 'deepseek');
assert.ok(migratedDeepseek, '迁移后应存在 deepseek 渠道');
assert.strictEqual(migratedDeepseek.apiKey, 'sk-deepseek-secret-123456', '旧 apiKey 应无损迁移至 deepseek 渠道');
assert.ok(Array.isArray(migratedDeepseek.apiKeys), '渠道内应拥有 apiKeys 密钥列表');
assert.strictEqual(migratedDeepseek.apiKeys.length, 1, '迁移后应自动将旧 key 包装为单条密钥记录');
assert.strictEqual(migratedDeepseek.apiKeys[0].key, 'sk-deepseek-secret-123456');
assert.strictEqual(migratedDeepseek.activeKeyId, migratedDeepseek.apiKeys[0].id, 'activeKeyId 应指向该密钥');
assert.strictEqual(migratedDeepseek.baseUrl, 'https://my-custom-deepseek-proxy.com/v1');
assert.strictEqual(migratedDeepseek.defaultModel, 'deepseek-reasoner');
assert.strictEqual(initRes.config.activeChannelId, 'deepseek');
assert.strictEqual(initRes.config.apiKey, 'sk-deepseek-secret-123456', '顶层动态投影 apiKey 应当同步');
console.log('✓ Test 2 通过');

(async () => {
  // [Test 3] 多渠道独立凭证与极速切换
  console.log('[Test 3] 验证多渠道凭据独立保存与 switchActiveChannel 极速切换...');
  // 1. 从预设模板创建 openai 渠道并赋予独立 key
  const createOpenAiRes = await ctxLegacy.call('createChannelFromPreset', {
    presetId: 'openai',
    name: '我的官方 OpenAI',
    apiKey: 'sk-openai-exclusive-key-888'
  });
  assert.ok(createOpenAiRes.ok);
  const openaiChannelId = createOpenAiRes.channel.id;

  // 2. 从当前 deepseek 切换到 openai
  const switchRes = await ctxLegacy.call('switchActiveChannel', {
    channelId: openaiChannelId,
    model: 'gpt-4o'
  });
  assert.ok(switchRes.ok, '切换到 openai 应该成功');
  assert.strictEqual(switchRes.config.activeChannelId, openaiChannelId);
  assert.strictEqual(switchRes.config.apiKey, 'sk-openai-exclusive-key-888', '切换后应立即生效 openai 的独立 Key');
  assert.strictEqual(switchRes.config.model, 'gpt-4o', '模型应同步切换为 gpt-4o');

  // 3. 再次切换回 deepseek，检查 deepseek 原有配置是否完好无损
  const switchBack = await ctxLegacy.call('switchActiveChannel', {
    channelId: 'deepseek'
  });
  assert.ok(switchBack.ok);
  assert.strictEqual(switchBack.config.activeChannelId, 'deepseek');
  assert.strictEqual(switchBack.config.apiKey, 'sk-deepseek-secret-123456', '切回 deepseek 时其专属密钥应完美保留，无需重新输入');
  console.log('✓ Test 3 通过');

  // [Test 4] 单渠道多模型管理 (添加模型、删除模型、同步在线拉取的模型)
  console.log('[Test 4] 验证单渠道多模型自定义添加与 syncChannelModels 一键同步...');
  const chDeepseek = ctxLegacy.getStoredData().config.channels.find(c => c.id === 'deepseek');
  const initialModelCount = chDeepseek.models.length;

  const fetchedModels = ['deepseek-ai/DeepSeek-V3-0324', 'deepseek-ai/DeepSeek-Coder-V2', 'deepseek-chat'];
  const syncRes = await ctxLegacy.call('syncChannelModels', {
    channelId: 'deepseek',
    models: fetchedModels
  });
  assert.ok(syncRes.ok);
  const updatedDeepseek = syncRes.channel;
  assert.ok(updatedDeepseek.models.includes('deepseek-ai/DeepSeek-V3-0324'), '拉取的新模型应当已持久化同步入该渠道');
  assert.ok(updatedDeepseek.models.includes('deepseek-reasoner'), '原有模型应继续保留');
  assert.ok(updatedDeepseek.models.length > initialModelCount, '渠道模型总数应当增加');
  console.log('✓ Test 4 通过');

  // [Test 5] 新建自定义渠道与安全删除渠道
  console.log('[Test 5] 验证自定义渠道创建与安全删除...');
  const customChannelData = {
    name: '公司内网私有模型代理',
    icon: '🏢',
    protocol: 'openai-chat',
    baseUrl: 'https://internal-llm.company.corp/v1',
    apiKey: 'corp-token-999',
    models: ['corp-llama3-70b', 'corp-qwen2.5-coder'],
    defaultModel: 'corp-llama3-70b',
    isActive: true
  };
  const saveCustomRes = await ctxLegacy.call('saveChannel', customChannelData);
  assert.ok(saveCustomRes.ok);
  assert.strictEqual(saveCustomRes.channel.name, '公司内网私有模型代理');
  assert.strictEqual(saveCustomRes.config.activeChannelId, saveCustomRes.channel.id);
  assert.strictEqual(saveCustomRes.config.baseUrl, 'https://internal-llm.company.corp/v1');
  assert.strictEqual(saveCustomRes.config.model, 'corp-llama3-70b');

  // 测试删除自定义渠道
  const customId = saveCustomRes.channel.id;
  const delRes = await ctxLegacy.call('deleteChannel', { id: customId });
  assert.ok(delRes.ok);
  assert.ok(!delRes.config.channels.some(c => c.id === customId), '该自定义渠道已被移除');
  assert.notStrictEqual(delRes.config.activeChannelId, customId, '删除当前激活渠道后应自动安全回退');
  console.log('✓ Test 5 通过');

  // [Test 6] UI 模板结构完整性测试
  console.log('[Test 6] 验证 UI 模板包含多渠道管理元素与 Popover 渠道快捷选择栏...');
  const template = getAiChatTemplate();
  assert.ok(template.includes('id="btnToggleCreateChannel"'), '应包含新增渠道按钮 btnToggleCreateChannel');
  assert.ok(template.includes('id="boxCreateChannel"'), '应包含创建渠道面板 boxCreateChannel');
  assert.ok(template.includes('id="selectChannelTemplate"'), '应包含模板选择下拉 selectChannelTemplate');
  assert.ok(template.includes('id="channelKeysList"'), '应包含多密钥管理容器 channelKeysList');
  assert.ok(template.includes('id="inputNewKeyValue"'), '应包含添加新密钥输入框 inputNewKeyValue');
  assert.ok(template.includes('id="btnAddKey"'), '应包含添加密钥按钮 btnAddKey');
  assert.ok(template.includes('id="modelPopoverChannels"'), 'Popover 中应包含已配置渠道快捷选择栏 modelPopoverChannels');
  console.log('✓ Test 6 通过');

  // [Test 7] 单渠道多密钥管理 (添加多 Key、单选切换生效 Key、删除 Key)
  console.log('[Test 7] 验证单渠道多密钥增删与生效密钥实时切换...');
  // 为 deepseek 渠道添加备用密钥
  const addKeyRes = await ctxLegacy.call('addChannelKey', {
    channelId: 'deepseek',
    name: '备用项目额度密钥',
    key: 'sk-deepseek-backup-key-8888'
  });
  assert.ok(addKeyRes.ok);
  const dsKeys = addKeyRes.channel.apiKeys;
  assert.strictEqual(dsKeys.length, 2, '当前渠道应拥有 2 个密钥');
  const backupKeyId = addKeyRes.newKey.id;

  // 此时激活 key 仍是原来的主 key
  assert.strictEqual(addKeyRes.channel.apiKey, 'sk-deepseek-secret-123456');

  // 切换激活 key 到备用密钥
  const switchKeyRes = await ctxLegacy.call('switchChannelActiveKey', {
    channelId: 'deepseek',
    keyId: backupKeyId
  });
  assert.ok(switchKeyRes.ok);
  assert.strictEqual(switchKeyRes.channel.activeKeyId, backupKeyId, '渠道激活 KeyId 应变更为备用密钥 ID');
  assert.strictEqual(switchKeyRes.channel.apiKey, 'sk-deepseek-backup-key-8888', '渠道当前 apiKey 应当动态更新为备用密钥');
  assert.strictEqual(switchKeyRes.config.apiKey, 'sk-deepseek-backup-key-8888', '顶层全局活跃 apiKey 应当动态同步生效');

  // 删除原主密钥
  const originalKeyId = dsKeys[0].id;
  const delKeyRes = await ctxLegacy.call('deleteChannelKey', {
    channelId: 'deepseek',
    keyId: originalKeyId
  });
  assert.ok(delKeyRes.ok);
  assert.strictEqual(delKeyRes.channel.apiKeys.length, 1, '删除后仅剩 1 个密钥');
  assert.strictEqual(delKeyRes.channel.apiKey, 'sk-deepseek-backup-key-8888', '删除非当前激活密钥后，生效密钥应保持为备用密钥');
  console.log('✓ Test 7 通过');

  // [Test 8] 对话区模型选择浮层数据源隔离测试 (未创建的渠道绝不能被检索和选择)
  console.log('[Test 8] 验证未创建渠道被严格隔离，绝不出现在对话区渠道栏与模型搜索中...');
  const currentChannels = ctxLegacy.getStoredData().config.channels;
  const configuredIds = currentChannels.map(c => c.id);

  // 验证只有显式创建并存在的渠道，未创建的预设厂商（如 claude, siliconflow, dashscope 等）不在其中
  assert.ok(!configuredIds.includes('claude'), '未创建的 claude 渠道绝不应出现在已配置列表中');
  assert.ok(!configuredIds.includes('siliconflow'), '未创建的 siliconflow 渠道绝不应出现在已配置列表中');
  assert.ok(!configuredIds.includes('dashscope'), '未创建的 dashscope 渠道绝不应出现在已配置列表中');

  // 模拟从对话区进行搜索检索：检索函数仅在当前已配置渠道范围内扫描
  function simulatePopoverSearch(channels, query) {
    const q = (query || '').trim().toLowerCase();
    const matched = [];
    channels.forEach(ch => {
      (ch.models || []).forEach(m => {
        if (m.toLowerCase().includes(q) || (ch.name && ch.name.toLowerCase().includes(q))) {
          matched.push({ channelId: ch.id, channelName: ch.name, model: m });
        }
      });
    });
    return matched;
  }

  // 搜索 "claude"：由于用户未创建 claude 渠道，匹配结果应为空
  const searchClaude = simulatePopoverSearch(currentChannels, 'claude');
  assert.strictEqual(searchClaude.length, 0, '未配置 claude 渠道时搜索 claude 不应返回任何结果，避免污染');

  // 搜索 "deepseek"：由于用户已配置 deepseek 渠道，应正常检索出其模型
  const searchDeepseek = simulatePopoverSearch(currentChannels, 'deepseek');
  assert.ok(searchDeepseek.length > 0, '已配置 deepseek 渠道时应能正常检索出模型');
  assert.ok(searchDeepseek.every(item => item.channelId === 'deepseek'));
  console.log('✓ Test 8 通过');

  console.log('==================================================');
  console.log('🎉 所有 AI 对话多渠道、单渠道多密钥与隔离测试全部通过！');
  console.log('==================================================');
})();
