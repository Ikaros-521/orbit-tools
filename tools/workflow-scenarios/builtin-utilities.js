/* 内置工具节点场景：模板 / 正则 / 替换 / JSON 提取 / 条件分支 / 延时 / 数据源。
   纯引擎行为，不依赖任何插件。 */
module.exports = {
  scenarios: [
    {
      name: '文本模板拼接',
      workflow: {
        id: 'wf-tpl', name: 'tpl', nodes: [
          { id: 'n1', type: 'trigger/manual', title: '手动' },
          { id: 'n2', type: 'util/text-template', title: '模板', config: { template: '结果: {{value}} @ {{type}}' } },
        ], edges: [{ from: 'n1', to: 'n2' }],
      },
      input: 'hello',
      expect: {
        ok: true,
        finalType: 'text/plain',
        finalValue: '结果: hello @ text/plain',
        nodes: [{ title: '模板', status: 'ok' }],
      },
    },
    {
      name: '正则提取捕获组',
      workflow: {
        id: 'wf-re', name: 're', nodes: [
          { id: 'n1', type: 'trigger/manual', title: '手动' },
          { id: 'n2', type: 'util/regex-extract', title: '提取版本号', config: { pattern: 'v(\\d+)\\.(\\d+)', group: 2 } },
        ], edges: [{ from: 'n1', to: 'n2' }],
      },
      input: 'release v12.34 ready',
      expect: { ok: true, finalValue: '34' },
    },
    {
      name: '正则未命中应报错',
      workflow: {
        id: 'wf-re-miss', name: 're-miss', nodes: [
          { id: 'n1', type: 'trigger/manual', title: '手动' },
          { id: 'n2', type: 'util/regex-extract', title: '提取', config: { pattern: 'zzz' } },
        ], edges: [{ from: 'n1', to: 'n2' }],
      },
      input: 'nothing here',
      expect: { ok: false, errorIncludes: '未匹配到正则', nodes: [{ title: '提取', status: 'error' }] },
    },
    {
      name: '查找替换 (普通与正则模式)',
      workflow: {
        id: 'wf-rep', name: 'rep', nodes: [
          { id: 'n1', type: 'trigger/manual', title: '手动' },
          { id: 'n2', type: 'util/replace', title: '普通替换', config: { find: 'foo', replace: 'bar', regex: false } },
          { id: 'n3', type: 'util/replace', title: '正则替换', config: { find: '\\d+', replace: 'N', regex: true } },
        ], edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }],
      },
      input: 'foo 123 foo 456',
      expect: { ok: true, finalValue: 'bar N bar N' },
    },
    {
      name: 'JSON 字段路径提取 (含数组下标)',
      workflow: {
        id: 'wf-json', name: 'json', nodes: [
          { id: 'n1', type: 'trigger/manual', title: '手动' },
          { id: 'n2', type: 'util/json-field', title: '取 city', config: { path: 'data.items[1].city' } },
        ], edges: [{ from: 'n1', to: 'n2' }],
      },
      input: JSON.stringify({ data: { items: [{ city: '北京' }, { city: '上海' }] } }),
      expect: { ok: true, finalType: 'text/plain', finalValue: '上海' },
    },
    {
      name: '条件不满足时终止分支，另一分支继续',
      workflow: {
        id: 'wf-cond', name: 'cond', nodes: [
          { id: 'n1', type: 'trigger/manual', title: '手动' },
          { id: 'n2', type: 'util/condition', title: '必须包含 ERROR', config: { mode: 'contains', value: 'ERROR' } },
          { id: 'n3', type: 'util/delay', title: '失败分支延时' },
          { id: 'n4', type: 'util/text-template', title: '汇总模板', config: { template: '[{{value}}]' } },
        ],
        // 菱形：cond 失败 → delay 跳过；template 只依赖 cond… cond 未 halt 时 n4 才执行
        edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n4' }],
      },
      input: 'just info',
      expect: {
        ok: true,
        finalValue: 'just info', // 模板节点被跳过，值保持上游
        nodes: [
          { title: '必须包含 ERROR', status: 'skipped' },
          { title: '失败分支延时', status: 'skipped' },
          { title: '汇总模板', status: 'skipped' },
        ],
      },
    },
    {
      name: '条件满足时全链路通过',
      workflow: {
        id: 'wf-cond-ok', name: 'cond-ok', nodes: [
          { id: 'n1', type: 'trigger/manual', title: '手动' },
          { id: 'n2', type: 'util/condition', title: '必须包含 ERROR', config: { mode: 'contains', value: 'ERROR' } },
          { id: 'n3', type: 'util/delay', title: '延时', config: { ms: 10 } },
        ], edges: [{ from: 'n1', to: 'n2' }, { from: 'n2', to: 'n3' }],
      },
      input: 'ERROR: boom',
      expect: { ok: true, nodes: [{ title: '必须包含 ERROR', status: 'ok' }, { title: '延时', status: 'ok' }] },
    },
    {
      name: '静态文本数据源',
      workflow: {
        id: 'wf-src', name: 'src', nodes: [
          { id: 'n1', type: 'trigger/manual', title: '手动' },
          { id: 'n2', type: 'source/text', title: '固定文本', config: { text: '{"k":1}', type: 'application/json' } },
        ], edges: [{ from: 'n1', to: 'n2' }],
      },
      input: 'ignored',
      expect: { ok: true, finalType: 'application/json', finalValue: '{"k":1}' },
    },
  ],
};
