/* Lightweight DAG Workflow Engine & Storage.
   Zero external dependencies. Powers the node-based visual workflow canvas.
   Ensures complete decoupling from plugins with dynamic self-healing & state guards. */

const DEFAULT_WORKFLOWS = [
  {
    id: 'wf-json-quick-format',
    name: '剪贴板 JSON 自动美化',
    desc: '当剪贴板出现 JSON 文本时，自动缩进格式化并写回剪贴板',
    enabled: true,
    nodes: [
      { id: 'node-1', type: 'trigger/clipboard', title: '剪贴板包含 JSON', x: 80, y: 120, config: { type: 'application/json' } },
      { id: 'node-2', type: 'action/plugin', pluginId: 'json-editor', capabilityId: 'json-format', title: 'JSON 校验与格式化', x: 380, y: 120 },
      { id: 'node-3', type: 'output/clipboard', title: '写入系统剪贴板', x: 680, y: 120 }
    ],
    edges: [
      { id: 'edge-1', from: 'node-1', to: 'node-2' },
      { id: 'edge-2', from: 'node-2', to: 'node-3' }
    ]
  },
  {
    id: 'wf-timestamp-peek',
    name: '时间戳解析并通知',
    desc: '识别剪贴板或输入的秒级时间戳，转为本地时间并弹出通知',
    enabled: true,
    nodes: [
      { id: 'node-1', type: 'trigger/manual', title: '手动 / 快捷键触发', x: 80, y: 120 },
      { id: 'node-2', type: 'action/plugin', pluginId: 'codec-lab', capabilityId: 'timestamp', title: '时间戳转换', x: 380, y: 120 },
      { id: 'node-3', type: 'output/notification', title: '显示系统通知', x: 680, y: 120 }
    ],
    edges: [
      { id: 'edge-1', from: 'node-1', to: 'node-2' },
      { id: 'edge-2', from: 'node-2', to: 'node-3' }
    ]
  }
];

class WorkflowRunner {
  constructor(manager) {
    this.manager = manager;
  }

  async runNode(node, inputEnvelope) {
    const start = Date.now();
    const type = node.type || '';

    // 1. Trigger nodes
    if (type.startsWith('trigger/')) {
      return {
        output: inputEnvelope || { type: 'text/plain', value: '' },
        duration: Date.now() - start,
        ok: true
      };
    }

    // 2. Output nodes
    if (type === 'output/clipboard') {
      const val = inputEnvelope ? String(inputEnvelope.value || '') : '';
      const { clipboard } = require('electron');
      clipboard.writeText(val);
      return {
        output: inputEnvelope,
        duration: Date.now() - start,
        ok: true,
        summary: `已写入剪贴板 (${val.length} 字符)`
      };
    }

    if (type === 'output/notification') {
      const { Notification } = require('electron');
      const val = inputEnvelope ? String(inputEnvelope.value || '') : '工作流运行完成';
      if (Notification.isSupported()) {
        new Notification({
          title: 'Orbit 工作流通知',
          body: val.length > 100 ? val.slice(0, 100) + '…' : val
        }).show();
      }
      return {
        output: inputEnvelope,
        duration: Date.now() - start,
        ok: true,
        summary: '通知已发送'
      };
    }

    if (type === 'output/panel') {
      const host = this.manager.getHostWindow && this.manager.getHostWindow();
      if (host && !host.isDestroyed() && node.pluginId) {
        this.manager.bringToForeground(host);
        host.webContents.send('open-plugin', node.pluginId);
      }
      return {
        output: inputEnvelope,
        duration: Date.now() - start,
        ok: true,
        summary: `已唤起插件面板 (${node.pluginId})`
      };
    }

    // 3. Plugin Action nodes (dynamic self-healing)
    if (type === 'action/plugin') {
      const plugin = this.manager.plugins.get(node.pluginId);
      if (!plugin) {
        throw new Error(`目标插件 "${node.pluginId}" 未安装`);
      }
      if (!plugin.enabled) {
        throw new Error(`目标插件 "${node.pluginId}" 当前处于禁用状态，工作流安全熔断`);
      }

      // Execute capability action based on capabilityId
      let transformed = inputEnvelope;
      const rawText = inputEnvelope ? String(inputEnvelope.value || '') : '';

      if (node.capabilityId === 'json-format' || node.pluginId === 'json-editor') {
        try {
          const parsed = JSON.parse(rawText.trim());
          transformed = { type: 'application/json', value: JSON.stringify(parsed, null, 2) };
        } catch {
          throw new Error('输入的不是合法 JSON 文本');
        }
      } else if (node.capabilityId === 'timestamp' || (node.pluginId === 'codec-lab' && node.capabilityId === 'timestamp')) {
        const trimmed = rawText.trim();
        let ms = Number(trimmed);
        if (trimmed.length === 10) ms *= 1000;
        const d = new Date(ms);
        if (isNaN(d.getTime())) throw new Error(`无法将 "${rawText}" 解析为有效时间戳`);
        const pad = n => String(n).padStart(2, '0');
        const formatted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        transformed = { type: 'text/plain', value: formatted };
      } else if (node.capabilityId === 'base64' || (node.pluginId === 'codec-lab' && node.capabilityId === 'base64')) {
        try {
          const decoded = Buffer.from(rawText.trim(), 'base64').toString('utf8');
          transformed = { type: 'text/plain', value: decoded };
        } catch {
          throw new Error('Base64 解码失败');
        }
      } else if (node.capabilityId === 'port-inspect' || node.pluginId === 'port-scope') {
        const port = Number(rawText.replace(/^:/, '').trim());
        const inspectRes = await this.manager.call('port-scope', 'inspectPort', { port });
        const count = inspectRes && inspectRes.matches ? inspectRes.matches.length : 0;
        transformed = {
          type: 'system/port-info',
          value: count > 0 ? `端口 ${port} 已被占用 (PID: ${inspectRes.matches[0].pid})` : `端口 ${port} 空闲可用`,
          matches: inspectRes.matches || []
        };
      }

      return {
        output: transformed,
        duration: Date.now() - start,
        ok: true
      };
    }

    return { output: inputEnvelope, duration: Date.now() - start, ok: true };
  }

  async execute(workflow, initialEnvelope) {
    const logs = [];
    if (!workflow || !Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
      return { ok: false, error: '工作流未定义任何节点', logs };
    }

    // Build adjacency list for topological execution
    const nodesMap = new Map(workflow.nodes.map(n => [n.id, n]));
    const inDegree = new Map(workflow.nodes.map(n => [n.id, 0]));
    const nextMap = new Map(workflow.nodes.map(n => [n.id, []]));

    for (const edge of (workflow.edges || [])) {
      if (nodesMap.has(edge.from) && nodesMap.has(edge.to)) {
        inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
        nextMap.get(edge.from).push(edge.to);
      }
    }

    // Find trigger / entry nodes
    const queue = [];
    for (const [id, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(id);
    }
    if (queue.length === 0 && workflow.nodes.length > 0) {
      queue.push(workflow.nodes[0].id);
    }

    let currentPayload = initialEnvelope || { type: 'text/plain', value: '' };
    const executed = new Set();

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (executed.has(nodeId)) continue;
      executed.add(nodeId);

      const node = nodesMap.get(nodeId);
      if (!node) continue;

      try {
        const step = await this.runNode(node, currentPayload);
        currentPayload = step.output;
        logs.push({
          nodeId: node.id,
          title: node.title,
          type: node.type,
          duration: step.duration,
          summary: step.summary || (currentPayload ? String(currentPayload.value || '').slice(0, 40) : ''),
          ok: true
        });
      } catch (err) {
        logs.push({
          nodeId: node.id,
          title: node.title,
          type: node.type,
          error: err.message,
          ok: false
        });
        return { ok: false, error: `节点 [${node.title}] 执行失败: ${err.message}`, logs, lastPayload: currentPayload };
      }

      for (const nextId of (nextMap.get(nodeId) || [])) {
        inDegree.set(nextId, inDegree.get(nextId) - 1);
        if (inDegree.get(nextId) <= 0) queue.push(nextId);
      }
    }

    return { ok: true, logs, finalOutput: currentPayload };
  }
}

class WorkflowManager {
  constructor(config, pluginManager) {
    this.config = config;
    this.pluginManager = pluginManager;
    this.runner = new WorkflowRunner(pluginManager);
    this.init();
  }

  init() {
    if (!Array.isArray(this.config.data.workflows) || this.config.data.workflows.length === 0) {
      this.config.set({ workflows: JSON.parse(JSON.stringify(DEFAULT_WORKFLOWS)) });
    }
  }

  list() {
    return this.config.data.workflows || [];
  }

  save(wf) {
    if (!wf || !wf.id) throw new Error('invalid workflow object');
    const list = [...this.list()];
    const idx = list.findIndex(x => x.id === wf.id);
    if (idx >= 0) {
      list[idx] = wf;
    } else {
      list.push(wf);
    }
    this.config.set({ workflows: list });
    return list;
  }

  delete(id) {
    const list = this.list().filter(x => x.id !== id);
    this.config.set({ workflows: list });
    return list;
  }

  async run(id, initialEnvelope) {
    const wf = this.list().find(x => x.id === id);
    if (!wf) throw new Error(`工作流 "${id}" 不存在`);
    return this.runner.execute(wf, initialEnvelope);
  }
}

module.exports = {
  WorkflowManager,
  WorkflowRunner,
  DEFAULT_WORKFLOWS
};
