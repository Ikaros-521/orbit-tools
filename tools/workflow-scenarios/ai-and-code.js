/* Scenarios for JS Code Execution, Variable Context, and AI workflow integration. */

module.exports = [
  {
    name: 'JS 代码执行：基础数据转换与计算',
    workflow: {
      id: 'wf-code-run-basic',
      name: 'JS 脚本测试',
      nodes: [
        { id: 'n1', type: 'source/text', title: '输入数字', config: { text: '21' } },
        { id: 'n2', type: 'util/code-run', title: '加倍计算', config: { code: 'return Number(input) * 2;' } },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' }
      ]
    },
    input: { type: 'text/plain', value: '' },
    expect: {
      ok: true,
      finalType: 'text/plain',
      finalValue: '42',
      nodes: [
        { title: '输入数字', status: 'ok' },
        { title: '加倍计算', status: 'ok' }
      ]
    }
  },
  {
    name: 'JS 代码执行：返回对象自动转为 JSON 信封',
    workflow: {
      id: 'wf-code-run-json',
      name: 'JS 返回对象',
      nodes: [
        { id: 'n1', type: 'source/text', title: '输入文本', config: { text: 'hello' } },
        { id: 'n2', type: 'util/code-run', title: '封装对象', config: { code: 'return { msg: input, len: input.length };' } },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' }
      ]
    },
    input: { type: 'text/plain', value: '' },
    expect: {
      ok: true,
      finalType: 'application/json',
      finalValueIncludes: '"msg": "hello"',
      nodes: [
        { title: '输入文本', status: 'ok' },
        { title: '封装对象', status: 'ok' }
      ]
    }
  },
  {
    name: '变量传递：代码节点导出变量供下游模板引用',
    workflow: {
      id: 'wf-var-passing',
      name: '变量跨节点传递',
      nodes: [
        { id: 'n1', type: 'source/text', title: '起点', config: { text: 'orbit' } },
        {
          id: 'n2',
          type: 'util/code-run',
          title: '设置变量',
          config: {
            code: 'context.set("appName", "Orbit Toolbox"); return input.toUpperCase();'
          }
        },
        {
          id: 'n3',
          type: 'util/text-template',
          title: '模板引用变量',
          config: {
            template: '欢迎使用 {{variables.appName}}，输入是 {{value}}'
          }
        }
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' },
        { id: 'e2', from: 'n2', to: 'n3' }
      ]
    },
    input: { type: 'text/plain', value: '' },
    expect: {
      ok: true,
      finalType: 'text/plain',
      finalValue: '欢迎使用 Orbit Toolbox，输入是 ORBIT',
      nodes: [
        { title: '起点', status: 'ok' },
        { title: '设置变量', status: 'ok' },
        { title: '模板引用变量', status: 'ok' }
      ]
    }
  },
  {
    name: 'AI 对话节点：调用 ai-chat 插件能力并流转数据',
    plugins: [{
      id: 'ai-chat',
      capabilities: [{ id: 'chat-complete', type: 'text/plain', method: 'chatComplete' }],
      handlers: {
        chatComplete: async ({ value }) => ({ type: 'text/plain', value: `AI 分析结果: ${value}` })
      }
    }],
    workflow: {
      id: 'wf-ai-chat-node',
      name: 'AI 对话测试',
      nodes: [
        { id: 'n1', type: 'source/text', title: '提示词输入', config: { text: '分析这段代码' } },
        {
          id: 'n2',
          type: 'action/plugin',
          pluginId: 'ai-chat',
          capabilityId: 'chat-complete',
          title: 'AI 总结'
        }
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2' }
      ]
    },
    input: { type: 'text/plain', value: '' },
    expect: {
      ok: true,
      finalType: 'text/plain',
      finalValue: 'AI 分析结果: 分析这段代码',
      nodes: [
        { title: '提示词输入', status: 'ok' },
        { title: 'AI 总结', status: 'ok' }
      ]
    }
  }
];
