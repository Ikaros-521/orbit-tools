/* Agent Tools & Workflow Generator for AI Chat.
   Allows the AI model to execute computations, query system info,
   and generate / save visual DAG workflows directly into Orbit Toolbox. */

const vm = require('vm');

const AGENT_TOOLS_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'run_javascript',
      description: '在受限沙箱中执行一段 JavaScript 表达式或脚本，用于高精度计算、数据转换、文本处理等。',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description: '待执行的 JavaScript 代码。最后一条表达式的值或 return 的值将作为输出返回。'
          }
        },
        required: ['code']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: '获取当前的本地时间、日期、星期几以及 ISO 时间戳。',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_workflows',
      description: '列出 Orbit 工具箱中当前已安装/已配置的所有工作流列表与节点结构。',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_workflow',
      description: '在 Orbit 工具箱中自动生成并保存一个新的可视化 DAG 工作流。用户可以直接在工作流画布中查看、测试或快捷键运行它。',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '工作流名称，例如：剪贴板正则提取与通知'
          },
          desc: {
            type: 'string',
            description: '工作流功能简述'
          },
          nodes: {
            type: 'array',
            description: '节点列表。可用节点类型：trigger/clipboard (剪贴板监听，config: { type: "any"|"application/json"等 }), trigger/manual (手动触发), source/text (静态文本，config: { text: "..." }), util/text-template (文本模板，config: { template: "{{value}}" }), util/regex-extract (正则提取，config: { pattern: "...", group: 0 }), util/replace (查找替换), util/condition (条件判断), util/code-run (JS代码脚本，config: { code: "..." }), action/plugin (插件能力，需指定 pluginId 与 capabilityId), output/clipboard (写回剪贴板), output/notification (系统通知)。',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                type: { type: 'string' },
                title: { type: 'string' },
                x: { type: 'number' },
                y: { type: 'number' },
                config: { type: 'object' },
                pluginId: { type: 'string' },
                capabilityId: { type: 'string' }
              },
              required: ['id', 'type', 'title']
            }
          },
          edges: {
            type: 'array',
            description: '连线列表，从某个节点的出口连接到下游节点的入口。',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                from: { type: 'string' },
                to: { type: 'string' }
              },
              required: ['from', 'to']
            }
          }
        },
        required: ['name', 'nodes', 'edges']
      }
    }
  }
];

async function executeAgentTool(name, rawArgs, ctx) {
  let args = {};
  if (typeof rawArgs === 'string') {
    try { args = JSON.parse(rawArgs); } catch { args = { input: rawArgs }; }
  } else if (rawArgs && typeof rawArgs === 'object') {
    args = rawArgs;
  }

  if (name === 'run_javascript') {
    const code = String(args.code || '');
    if (!code.trim()) return { ok: false, error: 'code 不能为空' };
    try {
      const sandbox = {
        console: { log: () => {} },
        JSON,
        Math,
        Date,
        RegExp,
        Array,
        Object,
        String,
        Number,
        Boolean
      };
      const script = new vm.Script(`(() => {\n${code}\n})()`);
      const result = script.runInNewContext(sandbox, { timeout: 3000 });
      return { ok: true, result: typeof result === 'object' ? JSON.stringify(result) : String(result) };
    } catch (err) {
      return { ok: false, error: `脚本执行出错: ${err.message}` };
    }
  }

  if (name === 'get_current_time') {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return {
      ok: true,
      localTime: local,
      dayOfWeek: days[d.getDay()],
      iso: d.toISOString(),
      timestampMs: d.getTime()
    };
  }

  if (name === 'list_workflows') {
    if (!ctx || !ctx.workflows) return { ok: false, error: '工作流管理器未注入' };
    const list = ctx.workflows.list();
    return {
      ok: true,
      workflows: list.map(w => ({
        id: w.id,
        name: w.name,
        desc: w.desc,
        enabled: w.enabled,
        nodeCount: (w.nodes || []).length
      }))
    };
  }

  if (name === 'create_workflow') {
    if (!ctx || !ctx.workflows) return { ok: false, error: '工作流管理器未注入' };
    const id = `wf-ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const newWorkflow = {
      id,
      name: String(args.name || 'AI 生成工作流'),
      desc: String(args.desc || '由 AI 助手自动生成'),
      enabled: true,
      nodes: (args.nodes || []).map((n, i) => ({
        id: n.id || `node-${i + 1}`,
        type: n.type || 'source/text',
        title: n.title || n.type,
        x: typeof n.x === 'number' ? n.x : 80 + i * 280,
        y: typeof n.y === 'number' ? n.y : 120,
        config: n.config || {},
        ...(n.pluginId ? { pluginId: n.pluginId } : {}),
        ...(n.capabilityId ? { capabilityId: n.capabilityId } : {})
      })),
      edges: (args.edges || []).map((e, i) => ({
        id: e.id || `edge-${i + 1}`,
        from: e.from,
        to: e.to
      }))
    };

    try {
      ctx.workflows.save(newWorkflow);
      return {
        ok: true,
        workflowId: id,
        name: newWorkflow.name,
        message: `工作流 [${newWorkflow.name}] 已成功创建并保存！包含 ${newWorkflow.nodes.length} 个节点。`
      };
    } catch (err) {
      return { ok: false, error: `工作流保存失败: ${err.message}` };
    }
  }

  return { ok: false, error: `未知工具 "${name}"` };
}

module.exports = {
  AGENT_TOOLS_DEFINITIONS,
  executeAgentTool
};
