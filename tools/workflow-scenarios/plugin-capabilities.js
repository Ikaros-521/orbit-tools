/* 插件能力分发场景：验证 action/plugin 节点的三条解析路径
   1. 插件 backend 处理器 (capability.method 或 capabilityId 作为方法名)
   2. 按 capability.type 的内置转换 (复用 smart-peek 检测器)
   3. 都没有 → 明确报错，绝不静默透传
   以及插件禁用熔断与保存校验。 */
module.exports = {
  scenarios: [
    {
      name: 'backend 处理器按 capability.method 分发',
      plugins: [{
        id: 'shouty',
        capabilities: [{ id: 'shout', type: 'text/plain', method: 'makeLoud' }],
        handlers: {
          makeLoud: async ({ value }) => ({ type: 'text/plain', value: `<< ${String(value).toUpperCase()} >>` }),
        },
      }],
      workflow: {
        id: 'wf-shout', name: 'shout', nodes: [
          { id: 'n1', type: 'trigger/manual', title: '手动' },
          { id: 'n2', type: 'action/plugin', pluginId: 'shouty', capabilityId: 'shout', title: '大喊' },
        ], edges: [{ from: 'n1', to: 'n2' }],
      },
      input: 'hello orbit',
      expect: { ok: true, finalValue: '<< HELLO ORBIT >>' },
    },
    {
      name: 'backend 处理器方法名缺省为 capabilityId',
      plugins: [{
        id: 'counting',
        capabilities: [{ id: 'count', type: 'text/plain' }],
        handlers: {
          count: async ({ value }) => `长度 ${String(value).length}`,
        },
      }],
      workflow: {
        id: 'wf-count', name: 'count', nodes: [
          { id: 'n1', type: 'trigger/manual', title: '手动' },
          { id: 'n2', type: 'action/plugin', pluginId: 'counting', capabilityId: 'count', title: '计数' },
        ], edges: [{ from: 'n1', to: 'n2' }],
      },
      input: '12345',
      expect: { ok: true, finalValue: '长度 5' },
    },
    {
      name: '无 backend 时回落到 capability.type 内置转换',
      // json-editor 内置插件有 json-format 能力但只有面板没有 backend，
      // 应通过 application/json 检测器完成格式化
      workflow: {
        id: 'wf-json-format', name: 'json-format', nodes: [
          { id: 'n1', type: 'trigger/manual', title: '手动' },
          { id: 'n2', type: 'action/plugin', pluginId: 'json-editor', capabilityId: 'json-format', title: 'JSON 格式化' },
        ], edges: [{ from: 'n1', to: 'n2' }],
      },
      input: '{"a":1,"b":[2,3]}',
      expect: { ok: true, finalType: 'application/json', finalValueIncludes: '"a": 1' },
    },
    {
      name: '未知能力必须报错而非静默透传',
      plugins: [{
        id: 'mystery',
        backend: false, // 纯面板插件，无 backend
        capabilities: [{ id: 'magic', type: 'text/x-magic' }], // 未知类型无内置转换
      }],
      workflow: {
        id: 'wf-magic', name: 'magic', nodes: [
          { id: 'n1', type: 'trigger/manual', title: '手动' },
          { id: 'n2', type: 'action/plugin', pluginId: 'mystery', capabilityId: 'magic', title: '魔法' },
        ], edges: [{ from: 'n1', to: 'n2' }],
      },
      input: 'x',
      expect: { ok: false, errorIncludes: '未提供可执行处理器', nodes: [{ title: '魔法', status: 'error' }] },
    },
    {
      name: '目标插件被禁用时熔断',
      plugins: [{
        id: 'offline',
        defaultEnabled: false,
        capabilities: [{ id: 'work', type: 'text/plain' }],
        handlers: { work: async ({ value }) => value },
      }],
      workflow: {
        id: 'wf-off', name: 'off', nodes: [
          { id: 'n1', type: 'trigger/manual', title: '手动' },
          { id: 'n2', type: 'action/plugin', pluginId: 'offline', capabilityId: 'work', title: '工作' },
        ], edges: [{ from: 'n1', to: 'n2' }],
      },
      input: 'x',
      expect: { ok: false, errorIncludes: '禁用' },
    },
    {
      name: '多插件串联 (backend 处理器 + 内置转换)',
      plugins: [{
        id: 'wrapper',
        capabilities: [{ id: 'wrap', type: 'text/plain' }],
        handlers: { wrap: async ({ value }) => `{"wrapped":"${String(value).trim()}"}` },
      }],
      workflow: {
        id: 'wf-chain', name: 'chain', nodes: [
          { id: 'n1', type: 'trigger/manual', title: '手动' },
          { id: 'n2', type: 'action/plugin', pluginId: 'wrapper', capabilityId: 'wrap', title: '包装成 JSON' },
          { id: 'n4', type: 'action/plugin', pluginId: 'json-editor', capabilityId: 'json-format', title: '再格式化' },
          { id: 'n3', type: 'util/json-field', title: '取出 wrapped', config: { path: 'wrapped' } },
        ],
        edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n4' }, { from: 'n4', to: 'n3' }],
      },
      input: 'orbit',
      expect: { ok: true, finalType: 'text/plain', finalValue: 'orbit' },
    },
    {
      name: '保存校验：空名称回退、节点/边数组兜底',
      run: async ({ wfManager, fail }) => {
        const saved = wfManager.save({ id: 'wf-x', name: '   ', nodes: 'not-array', edges: null });
        const wf = saved.find(w => w.id === 'wf-x');
        if (!wf) fail('保存后列表中找不到工作流');
        if (wf.name !== '未命名工作流') fail(`空名称应回退为默认名，实际 "${wf.name}"`);
        if (!Array.isArray(wf.nodes) || wf.nodes.length !== 0) fail('nodes 应被兜底为空数组');
        if (!Array.isArray(wf.edges)) fail('edges 应被兜底为空数组');
        if (wf.enabled !== true) fail('enabled 缺省应为 true');
      },
    },
  ],
};
