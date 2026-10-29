/* Lightweight DAG Workflow Engine & Storage.
   Zero external dependencies. Powers the node-based visual workflow canvas.
   Ensures complete decoupling from plugins with dynamic self-healing & state guards.

   Execution model: nodes run in topological order; each node receives its
   own predecessor's output envelope { type, value } (initial envelope for
   entry nodes). A `util/condition` node whose check fails HALTS its branch:
   downstream nodes whose every predecessor halted are skipped, other branches
   keep running.

   Plugin action nodes resolve generically, in order:
     1. plugin backend handler — method = capability.method || capabilityId,
        called with ({ value, type, config }) and free to return a string,
        an envelope { value, type } or any JSON (stringified);
     2. built-in transform derived from the capability's declared envelope type
        (json format / timestamp / base64 / jwt / url …) via core/capabilities;
     3. otherwise the node fails loudly — never a silent pass-through. */

const { DETECTORS } = require('./capabilities');

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

/* Detector probe order matters: JWT/Base64 overlap with plain text, JSON is
   the most specific, and bare hex ("cafebabe…") also passes the base64 probe
   so hex must run first. Math runs before everything — its charset (digits +
   operators only) can't shadow the others. Mirrors the smart-peek banner. */
const DETECT_ORDER = [
  'math/expression', 'color/css', 'application/json', 'text/timestamp', 'text/jwt', 'text/unicode', 'text/hex', 'text/base64', 'text/url', 'system/port'
];

function detectEnvelopeType(text) {
  const t = String(text || '').trim();
  if (!t) return 'text/plain';
  for (const type of DETECT_ORDER) {
    const det = DETECTORS[type];
    if (det && det.test(t)) return type;
  }
  return 'text/plain';
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, Math.max(0, Math.min(15000, ms))));
}

const pad = n => String(n).padStart(2, '0');
const localDateTime = (d = new Date()) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/* Walk "a.b[0].c" style paths into parsed JSON. */
function pickJsonPath(obj, path) {
  const segments = String(path || '').split('.').filter(Boolean);
  let cur = obj;
  for (const seg of segments) {
    if (cur === null || cur === undefined) throw new Error(`路径 "${path}" 在 "${seg}" 处中断：上游不是对象`);
    const m = seg.match(/^([^[\]]+)\[(\d+)\]$/);
    if (m) {
      cur = cur[m[1]];
      if (!Array.isArray(cur)) throw new Error(`路径 "${path}" 失败："${m[1]}" 不是数组`);
      cur = cur[Number(m[2])];
    } else {
      cur = cur[seg];
    }
  }
  if (cur === undefined) throw new Error(`路径 "${path}" 未找到对应字段`);
  return cur;
}

/* Built-in transforms reused from the smart-peek detectors so plugin panels,
   pipeline transit and workflow nodes always agree on the output format. */
function transformByDetectedType(detectedType, rawText) {
  const det = DETECTORS[detectedType];
  if (!det) return null;
  let res = null;
  try { res = det.resolve(String(rawText || '').trim()); } catch { res = null; }
  if (!res) return null;
  return { type: res.type || detectedType, value: res.copyValue };
}

class WorkflowRunner {
  constructor(manager, hooks = {}) {
    this.manager = manager;
    this.hooks = hooks;
  }

  async runNode(node, inputEnvelope) {
    const start = Date.now();
    const type = node.type || '';
    const inputText = inputEnvelope ? String(inputEnvelope.value ?? '') : '';
    const cfg = node.config || {};
    const done = (extra = {}) => ({
      output: extra.output !== undefined ? extra.output : inputEnvelope,
      duration: Date.now() - start,
      ok: true,
      ...extra
    });

    /* --- triggers: pass the initial envelope through ---------------------- */
    if (type.startsWith('trigger/')) {
      return done({ output: inputEnvelope || { type: 'text/plain', value: '' } });
    }

    /* --- built-in source & utility nodes ----------------------------------- */
    if (type === 'source/text') {
      return done({ output: { type: cfg.type || 'text/plain', value: String(cfg.text ?? '') } });
    }

    if (type === 'util/delay') {
      const ms = Number(cfg.ms) || 0;
      await sleep(ms);
      return done({ summary: `延时 ${ms}ms` });
    }

    if (type === 'util/text-template') {
      const tpl = String(cfg.template ?? '{{value}}');
      let value = tpl
        .replaceAll('{{value}}', inputText)
        .replaceAll('{{type}}', (inputEnvelope && inputEnvelope.type) || 'text/plain')
        .replaceAll('{{date}}', localDateTime());
      if (this.context) {
        if (this.context.variables) {
          value = value.replace(/\{\{variables\.([a-zA-Z0-9_-]+)\}\}/g, (_, k) => (this.context.variables[k] !== undefined ? this.context.variables[k] : ''));
        }
        if (this.context.nodes) {
          value = value.replace(/\{\{nodes\.([a-zA-Z0-9_-]+)\.value\}\}/g, (_, id) => (this.context.nodes[id] ? this.context.nodes[id].value : ''));
        }
      }
      return done({ output: { type: 'text/plain', value } });
    }

    if (type === 'util/code-run') {
      const vm = require('vm');
      const code = String(cfg.code || '').trim();
      if (!code) throw new Error('未配置 JavaScript 执行脚本');
      const contextVars = (this.context && this.context.variables) || {};
      const contextNodes = (this.context && this.context.nodes) || {};
      const sandbox = {
        input: inputText,
        value: inputText,
        type: (inputEnvelope && inputEnvelope.type) || 'text/plain',
        variables: contextVars,
        nodes: contextNodes,
        context: {
          get: k => contextVars[k],
          set: (k, v) => { contextVars[k] = v; }
        },
        console: { log: () => {} },
        JSON, Math, Date, RegExp, Array, Object, String, Number, Boolean
      };
      let res;
      try {
        const script = new vm.Script(`(() => {\n${code}\n})()`);
        res = script.runInNewContext(sandbox, { timeout: 5000 });
      } catch (err) {
        throw new Error(`代码执行错误: ${err.message}`);
      }
      if (cfg.outputVariable) {
        contextVars[cfg.outputVariable] = res;
      }
      let outEnvelope;
      if (res && typeof res === 'object' && !Array.isArray(res) && res.type && typeof res.value !== 'undefined') {
        outEnvelope = { type: res.type, value: String(res.value) };
      } else if (res && typeof res === 'object') {
        outEnvelope = { type: 'application/json', value: JSON.stringify(res, null, 2) };
      } else {
        outEnvelope = { type: 'text/plain', value: String(res ?? '') };
      }
      return done({ output: outEnvelope, summary: `脚本执行完成 (${outEnvelope.value.slice(0, 30)})` });
    }

    if (type === 'ai/chat') {
      const aiPlugin = this.manager.plugins.get('ai-chat');
      if (!aiPlugin) throw new Error('AI 对话插件 (ai-chat) 未安装');
      if (!aiPlugin.enabled) throw new Error('AI 对话插件 (ai-chat) 当前处于禁用状态');

      let prompt = inputText;
      if (cfg.promptTemplate) {
        prompt = String(cfg.promptTemplate).replaceAll('{{value}}', inputText);
        if (this.context && this.context.variables) {
          prompt = prompt.replace(/\{\{variables\.([a-zA-Z0-9_-]+)\}\}/g, (_, k) => (this.context.variables[k] !== undefined ? this.context.variables[k] : ''));
        }
      }

      const callArgs = {
        value: prompt,
        config: {
          personaId: cfg.personaId,
          systemPrompt: cfg.systemPrompt,
          model: cfg.model,
          temperature: cfg.temperature
        }
      };

      const res = await this.manager.call('ai-chat', 'chatComplete', callArgs);
      const outText = (res && typeof res.value !== 'undefined') ? String(res.value) : (typeof res === 'string' ? res : JSON.stringify(res));
      if (cfg.outputVariable && this.context && this.context.variables) {
        this.context.variables[cfg.outputVariable] = outText;
      }
      return done({
        output: { type: 'text/plain', value: outText },
        summary: `AI 回复 (${outText.slice(0, 30)})`
      });
    }

    if (type === 'util/regex-extract') {
      const pattern = String(cfg.pattern || '').trim();
      if (!pattern) throw new Error('未配置正则表达式');
      let re;
      try { re = new RegExp(pattern, String(cfg.flags || '')); }
      catch (err) { throw new Error(`正则表达式无效: ${err.message}`); }
      const m = re.exec(inputText);
      if (!m) throw new Error(`内容未匹配到正则 /${pattern}/`);
      const group = Math.max(0, Number(cfg.group) || 0);
      const value = m[group] !== undefined ? m[group] : m[0];
      return done({ output: { type: 'text/plain', value }, summary: `提取: ${String(value).slice(0, 40)}` });
    }

    if (type === 'util/replace') {
      const find = String(cfg.find ?? '');
      if (!find) throw new Error('未配置查找内容');
      let value;
      if (cfg.regex) {
        let re;
        try { re = new RegExp(find, 'g'); }
        catch (err) { throw new Error(`正则表达式无效: ${err.message}`); }
        value = inputText.replace(re, String(cfg.replace ?? ''));
      } else {
        value = inputText.split(find).join(String(cfg.replace ?? ''));
      }
      return done({ output: { type: 'text/plain', value } });
    }

    if (type === 'util/json-field') {
      const path = String(cfg.path || '').trim();
      if (!path) throw new Error('未配置字段路径');
      let parsed;
      try { parsed = JSON.parse(inputText.trim()); }
      catch { throw new Error('上游输入不是合法 JSON，无法提取字段'); }
      const picked = pickJsonPath(parsed, path);
      const isObj = picked !== null && typeof picked === 'object';
      return done({
        output: { type: isObj ? 'application/json' : 'text/plain', value: isObj ? JSON.stringify(picked, null, 2) : String(picked) },
        summary: `已提取字段 ${path}`
      });
    }

    if (type === 'util/condition') {
      const mode = cfg.mode || 'contains';
      const target = String(cfg.value ?? '');
      let pass = false;
      if (mode === 'contains') pass = inputText.includes(target);
      else if (mode === 'equals') pass = inputText === target;
      else if (mode === 'startsWith') pass = inputText.startsWith(target);
      else if (mode === 'regex') {
        try { pass = new RegExp(target).test(inputText); }
        catch (err) { throw new Error(`正则表达式无效: ${err.message}`); }
      }
      else if (mode === 'notEmpty') pass = inputText.trim().length > 0;
      else if (mode === 'empty') pass = inputText.trim().length === 0;
      else throw new Error(`未知判断方式 "${mode}"`);
      if (!pass) return done({ halt: true, summary: `条件不满足 (${mode})，下游分支已跳过` });
      return done({ summary: `条件满足 (${mode})` });
    }

    /* --- outputs ------------------------------------------------------------ */
    if (type === 'output/clipboard') {
      const { clipboard } = require('electron');
      clipboard.writeText(inputText);
      if (this.hooks.onClipboardWrite) this.hooks.onClipboardWrite(inputText);
      return done({ summary: `已写入剪贴板 (${inputText.length} 字符)` });
    }

    if (type === 'output/notification') {
      const { Notification } = require('electron');
      const val = inputText || '工作流运行完成';
      if (Notification.isSupported()) {
        new Notification({
          title: 'Orbit 工作流通知',
          body: val.length > 100 ? val.slice(0, 100) + '…' : val
        }).show();
      }
      return done({ summary: '通知已发送' });
    }

    if (type === 'output/panel') {
      if (!node.pluginId) {
        throw new Error('唤起面板节点未配置目标插件，请在节点检查器中选择');
      }
      if (!this.manager.plugins.get(node.pluginId)) {
        throw new Error(`目标插件 "${node.pluginId}" 未安装`);
      }
      const host = this.manager.getHostWindow && this.manager.getHostWindow();
      if (host && !host.isDestroyed()) {
        this.manager.bringToForeground(host);
        host.webContents.send('open-plugin', node.pluginId);
      }
      return done({ summary: `已唤起插件面板 (${node.pluginId})` });
    }

    /* --- plugin action nodes (generic, self-healing) ------------------------ */
    if (type === 'action/plugin') {
      return done(await this.runPluginAction(node, inputEnvelope));
    }

    return done({ summary: `未知节点类型 ${type}，已原样透传` });
  }

  async runPluginAction(node, inputEnvelope) {
    const plugin = this.manager.plugins.get(node.pluginId);
    if (!plugin) throw new Error(`目标插件 "${node.pluginId}" 未安装`);
    if (!plugin.enabled) throw new Error(`目标插件 "${node.pluginId}" 当前处于禁用状态，工作流安全熔断`);

    const capDecl = (plugin.manifest.capabilities || [])
      .find(c => c && c.id === node.capabilityId);
    const inputText = inputEnvelope ? String(inputEnvelope.value ?? '') : '';
    const callArgs = {
      value: inputText,
      type: (inputEnvelope && inputEnvelope.type) || detectEnvelopeType(inputText),
      config: node.config || {}
    };

    // 1. plugin backend handler — the plugin owns the logic. Tried even when
    //    the manifest no longer declares the capability (self-healing) as long
    //    as a handler with that method name is registered.
    if (plugin.manifest.backend) {
      const method = (capDecl && capDecl.method) || node.capabilityId;
      try {
        const res = await this.manager.call(node.pluginId, method, callArgs);
        return this.normalizePluginResult(res, node, callArgs);
      } catch (err) {
        if (!/has no handler/.test(String(err.message))) throw err;
        // no handler registered — fall through to the built-in transform
      }
    }

    // 2. built-in transform derived from the declared envelope type. When the
    //    detector exists but the input doesn't match it, fail with a precise
    //    content-type error — NOT the generic "no handler" message.
    if (capDecl && capDecl.type && DETECTORS[capDecl.type]) {
      const det = DETECTORS[capDecl.type];
      const trimmed = inputText.trim();
      if (!det.test(trimmed)) {
        const actual = (inputEnvelope && inputEnvelope.type) || detectEnvelopeType(trimmed);
        throw new Error(`输入内容不是 ${capDecl.type} 格式 (实际 ${actual})，无法执行能力 "${node.capabilityId}"`);
      }
      const transformed = transformByDetectedType(capDecl.type, inputText);
      if (transformed) return { output: transformed, summary: `内置转换 (${capDecl.type})` };
    }

    throw new Error(
      `插件 "${node.pluginId}" 的能力 "${node.capabilityId}" 未提供可执行处理器` +
      (plugin.manifest.backend ? '' : ' (该插件没有 backend)')
    );
  }

  /* Normalize whatever a plugin handler returned into an envelope. */
  normalizePluginResult(res, node, callArgs) {
    if (res === null || res === undefined) {
      return { output: { type: callArgs.type, value: callArgs.value }, summary: '插件处理器无返回值，原样透传' };
    }
    if (typeof res === 'string') {
      return { output: { type: 'text/plain', value: res }, summary: `插件返回文本 (${res.length} 字符)` };
    }
    if (res && typeof res === 'object' && !Array.isArray(res) && res.ok === false) {
      throw new Error(res.error || `插件 "${node.pluginId}" 处理失败`);
    }
    if (res && typeof res === 'object' && !Array.isArray(res) && typeof res.value !== 'undefined' && !res.ok && !res.matches) {
      return { output: { type: res.type || 'text/plain', value: String(res.value) }, summary: '插件返回信封' };
    }
    // port-inspect shaped results read best as a human summary
    if (res && typeof res.port === 'number' && Array.isArray(res.matches)) {
      const first = res.matches[0];
      return {
        output: {
          type: 'system/port-info',
          value: first ? `端口 ${res.port} 已被占用 (PID: ${first.pid})` : `端口 ${res.port} 空闲可用`,
          matches: res.matches
        },
        summary: `端口 ${res.port} 探测完成`
      };
    }
    const json = JSON.stringify(res, null, 2);
    return { output: { type: 'application/json', value: json }, summary: `插件返回 JSON (${json.length} 字符)` };
  }

  async execute(workflow, initialEnvelope) {
    const logs = [];
    if (!workflow || !Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
      return { ok: false, error: '工作流未定义任何节点', logs };
    }

    // Build adjacency + predecessor lists for topological execution
    const nodesMap = new Map(workflow.nodes.map(n => [n.id, n]));
    const inDegree = new Map(workflow.nodes.map(n => [n.id, 0]));
    const nextMap = new Map(workflow.nodes.map(n => [n.id, []]));
    const predsMap = new Map(workflow.nodes.map(n => [n.id, []]));

    for (const edge of (workflow.edges || [])) {
      if (nodesMap.has(edge.from) && nodesMap.has(edge.to)) {
        inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
        nextMap.get(edge.from).push(edge.to);
        predsMap.get(edge.to).push(edge.from);
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

    // Each node's output is tracked per-node so branched workflows feed every
    // successor its OWN predecessor's output, not "whatever node ran last".
    const outputs = new Map(); // nodeId -> output envelope (non-halted nodes only)
    this.context = { variables: {}, nodes: {} };
    let finalOutput = initialEnvelope || { type: 'text/plain', value: '' };
    const executed = new Set();
    const halted = new Set(); // condition-failed (or fully-blocked) node ids

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (executed.has(nodeId)) continue;
      executed.add(nodeId);

      const node = nodesMap.get(nodeId);
      if (!node) continue;

      // A node whose every predecessor halted is itself skipped (branch cut)
      const preds = predsMap.get(nodeId) || [];
      if (preds.length > 0 && preds.every(p => halted.has(p))) {
        halted.add(nodeId);
        logs.push({ nodeId: node.id, title: node.title, type: node.type, ok: true, skipped: true, summary: '上游分支已终止，节点跳过' });
        for (const nextId of (nextMap.get(nodeId) || [])) {
          inDegree.set(nextId, (inDegree.get(nextId) || 0) - 1);
          if (inDegree.get(nextId) <= 0) queue.push(nextId);
        }
        continue;
      }

      // Input = the output of this node's most recent non-halted predecessor;
      // entry nodes with no predecessors take the initial envelope.
      let nodeInput = initialEnvelope || { type: 'text/plain', value: '' };
      for (let i = preds.length - 1; i >= 0; i--) {
        const out = outputs.get(preds[i]);
        if (out !== undefined) { nodeInput = out; break; }
      }

      try {
        const step = await this.runNode(node, nodeInput);
        finalOutput = step.output !== undefined ? step.output : nodeInput;
        if (step.halt) halted.add(nodeId);
        else {
          outputs.set(nodeId, step.output);
          if (this.context) {
            this.context.nodes[nodeId] = step.output;
            if (node.config && node.config.outputVariable) {
              this.context.variables[node.config.outputVariable] = step.output ? step.output.value : null;
            }
          }
        }
        logs.push({
          nodeId: node.id,
          title: node.title,
          type: node.type,
          duration: step.duration,
          summary: step.summary || (finalOutput ? String(finalOutput.value ?? '').slice(0, 40) : ''),
          ok: true,
          skipped: !!step.halt
        });
      } catch (err) {
        logs.push({
          nodeId: node.id,
          title: node.title,
          type: node.type,
          error: err.message,
          ok: false
        });
        return { ok: false, error: `节点 [${node.title}] 执行失败: ${err.message}`, logs, lastPayload: finalOutput };
      }

      for (const nextId of (nextMap.get(nodeId) || [])) {
        inDegree.set(nextId, (inDegree.get(nextId) || 0) - 1);
        if (inDegree.get(nextId) <= 0) queue.push(nextId);
      }
    }

    // Nodes stuck behind a cycle never enqueue; report instead of pretending
    // the run succeeded with half the graph silently missing.
    if (executed.size < workflow.nodes.length) {
      const stuck = workflow.nodes
        .filter(n => !executed.has(n.id))
        .map(n => n.title || n.id);
      return {
        ok: false,
        error: `工作流存在循环依赖，节点未执行: ${stuck.join('、')}`,
        logs,
        finalOutput
      };
    }

    return { ok: true, logs, finalOutput };
  }
}

class WorkflowManager {
  constructor(config, pluginManager, opts = {}) {
    this.config = config;
    this.pluginManager = pluginManager;
    this.onEvent = opts.onEvent || null;
    this.clipboardPollMs = Number(opts.clipboardPollMs) || 900;
    this.seedDefaults = opts.seedDefaults !== false;
    this.runner = new WorkflowRunner(pluginManager, {
      onClipboardWrite: text => this.suppressClipboardText(text)
    });
    this._watchTimer = null;
    this._lastClipboardText = null;
    this._suppressedTexts = new Set();
    this.init();
    this.syncClipboardWatch();
  }

  init() {
    // Seed defaults only on the FIRST run ever. Keying off "array is empty"
    // would resurrect the demos after the user deliberately deleted them all.
    if (this.seedDefaults && !this.config.data.workflowsSeeded) {
      const patch = { workflowsSeeded: true };
      const cur = this.config.data.workflows;
      if (!Array.isArray(cur) || cur.length === 0) {
        patch.workflows = JSON.parse(JSON.stringify(DEFAULT_WORKFLOWS));
      }
      this.config.set(patch);
    }
  }

  list() {
    return this.config.data.workflows || [];
  }

  save(wf) {
    if (!wf || typeof wf !== 'object' || !wf.id) throw new Error('invalid workflow object');
    const clean = {
      ...wf,
      name: String(wf.name || '').trim() || '未命名工作流',
      desc: String(wf.desc || ''),
      enabled: wf.enabled !== false,
      nodes: Array.isArray(wf.nodes) ? wf.nodes : [],
      edges: Array.isArray(wf.edges) ? wf.edges : []
    };
    const list = [...this.list()];
    const idx = list.findIndex(x => x.id === clean.id);
    if (idx >= 0) {
      list[idx] = clean;
    } else {
      list.push(clean);
    }
    this.config.set({ workflows: list });
    this.syncClipboardWatch();
    return list;
  }

  delete(id) {
    const list = this.list().filter(x => x.id !== id);
    this.config.set({ workflows: list });
    this.syncClipboardWatch();
    return list;
  }

  async run(id, initialEnvelope) {
    const wf = this.list().find(x => x.id === id);
    if (!wf) throw new Error(`工作流 "${id}" 不存在`);
    return this.runner.execute(wf, initialEnvelope);
  }

  /* --- clipboard auto-trigger ----------------------------------------------

     Watches the system clipboard; when the text changes, every ENABLED
     workflow that contains a `trigger/clipboard` node whose configured type
     matches the detected content type runs automatically. Writes made by
     workflow output nodes are suppressed so a workflow that formats the
     clipboard doesn't re-trigger itself in a loop. */

  hasClipboardTrigger(wf) {
    return (wf.nodes || []).some(n => n && n.type === 'trigger/clipboard');
  }

  syncClipboardWatch() {
    const need = this.list().some(wf => wf.enabled !== false && this.hasClipboardTrigger(wf));
    if (need && !this._watchTimer) {
      try {
        const { clipboard } = require('electron');
        this._lastClipboardText = clipboard.readText();
      } catch { this._lastClipboardText = null; }
      this._watchTimer = setInterval(() => this.pollClipboard(), this.clipboardPollMs);
      if (this._watchTimer.unref) this._watchTimer.unref();
    } else if (!need && this._watchTimer) {
      this.stopClipboardWatch();
    }
  }

  stopClipboardWatch() {
    if (this._watchTimer) {
      clearInterval(this._watchTimer);
      this._watchTimer = null;
    }
  }

  suppressClipboardText(text) {
    if (typeof text === 'string' && text) this._suppressedTexts.add(text);
  }

  pollClipboard() {
    let text;
    try {
      const { clipboard } = require('electron');
      text = clipboard.readText();
    } catch { return; }
    if (text === this._lastClipboardText) return;
    // Selection-capture sentinels must never look like a user copy: skip them
    // WITHOUT touching the baseline, so the follow-up restore of the user's
    // real clipboard content doesn't register as a change either.
    if (typeof text === 'string' && text.startsWith('__ORBIT_SEL_')) return;
    this._lastClipboardText = text;
    const suppressed = this._suppressedTexts.has(text);
    this._suppressedTexts.clear();
    if (suppressed || !text || !text.trim()) return;
    this.fireClipboardTriggers(text).catch(() => { /* logged per workflow */ });
  }

  /* Content types a workflow's plugin-action nodes declare they consume.
     'text/plain' is the wildcard (any text), so it imposes no constraint.
     Used to auto-skip clipboard triggers whose payload obviously can't feed
     the chain — e.g. copying prose into a timestamp-conversion workflow. */
  capabilityTypeConstraints(wf) {
    const types = new Set();
    for (const node of (wf.nodes || [])) {
      if (!node || node.type !== 'action/plugin' || !node.pluginId) continue;
      const plugin = this.pluginManager.plugins.get(node.pluginId);
      if (!plugin) continue;
      const cap = (plugin.manifest.capabilities || [])
        .find(c => c && c.id === node.capabilityId);
      if (cap && cap.type && cap.type !== 'text/plain') types.add(cap.type);
    }
    return types;
  }

  async fireClipboardTriggers(text) {
    const detected = detectEnvelopeType(text);
    const envelope = { type: detected, value: text };
    for (const wf of this.list()) {
      if (wf.enabled === false) continue;
      const trig = (wf.nodes || []).find(n => n && n.type === 'trigger/clipboard');
      if (!trig) continue;
      const want = (trig.config && trig.config.type) || 'any';
      if (want !== 'any' && want !== detected) continue;
      if (want === 'any') {
        const constraints = this.capabilityTypeConstraints(wf);
        if (constraints.size > 0 && !constraints.has(detected)) {
          this.emit({
            event: 'auto-skip',
            trigger: 'clipboard',
            reason: 'type-mismatch',
            id: wf.id,
            name: wf.name,
            need: [...constraints].join(' / '),
            detectedType: detected
          });
          continue;
        }
      }
      let res;
      try {
        res = await this.runner.execute(wf, envelope);
      } catch (err) {
        res = { ok: false, error: String(err && err.message || err), logs: [] };
      }
      this.emit({
        event: 'auto-run',
        trigger: 'clipboard',
        detectedType: detected,
        id: wf.id,
        name: wf.name,
        ok: res.ok,
        error: res.error || null,
        logs: res.logs || [],
        finalOutput: res.finalOutput || null
      });
    }
  }

  emit(payload) {
    if (typeof this.onEvent === 'function') {
      try { this.onEvent(payload); } catch { /* listener's own problem */ }
    }
  }
}

module.exports = {
  WorkflowManager,
  WorkflowRunner,
  DEFAULT_WORKFLOWS,
  detectEnvelopeType
};
