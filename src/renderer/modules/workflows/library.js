/* Workflows Visual Canvas - Node Library Catalogue
   Manages built-in node templates, plugin dynamic capabilities, library search, and node instantiation. */
(() => {
  window.OrbitWorkflows = window.OrbitWorkflows || {};

  const WF_TRIGGER_TYPE_OPTIONS = [
    ['any', '任意文本'],
    ['math/expression', '算式 (数学表达式)'],
    ['color/css', '颜色值 (HEX / RGB / HSL)'],
    ['application/json', 'JSON'],
    ['text/timestamp', '时间戳'],
    ['text/base64', 'Base64'],
    ['text/hex', 'Hex 十六进制'],
    ['text/unicode', 'Unicode 转义'],
    ['text/url', 'URL'],
    ['text/jwt', 'JWT'],
    ['system/port', '端口号'],
    ['text/plain', '纯文本 (未识别类型)'],
  ];

  const WF_LIB_CATALOG = [
    {
      id: 'triggers', title: '⚡ 触发器 · Triggers', items: [
        { type: 'trigger/clipboard', title: '剪贴板监听', icon: '📋', desc: '剪贴板出现匹配内容时自动运行', config: { type: 'any' } },
        { type: 'trigger/manual', title: '手动 / 快捷键', icon: '🖱️', desc: '点击「运行测试」或从动作抽屉触发' },
      ],
    },
    {
      id: 'sources', title: '📄 数据源 · Sources', items: [
        { type: 'source/text', title: '静态文本', icon: '🔤', desc: '以固定文本作为流程起点', config: { text: '', type: 'text/plain' } },
      ],
    },
    {
      id: 'utils', title: '🧰 内置工具 · Utilities', items: [
        { type: 'util/text-template', title: '文本模板', icon: '🧵', desc: '拼接输出，支持 {{value}} {{type}} {{date}}', config: { template: '{{value}}' } },
        { type: 'util/regex-extract', title: '正则提取', icon: '🔎', desc: '按正则提取命中的内容/捕获组', config: { pattern: '', flags: '', group: 0 } },
        { type: 'util/replace', title: '查找替换', icon: '🔁', desc: '普通文本或正则模式替换', config: { find: '', replace: '', regex: false } },
        { type: 'util/json-field', title: 'JSON 字段提取', icon: '🗂️', desc: '按 a.b[0].c 路径取出字段值', config: { path: '' } },
        { type: 'util/code-run', title: 'JS 代码执行', icon: '💻', desc: '执行自定义 JS 脚本，可读写变量与数据转换', config: { code: 'return input;', outputVariable: '' } },
        { type: 'util/condition', title: '条件判断', icon: '🚦', desc: '不满足时终止该分支下游节点', config: { mode: 'contains', value: '' } },
        { type: 'util/delay', title: '延时等待', icon: '⏱️', desc: '延迟指定毫秒后继续 (0-15000)', config: { ms: 300 } },
      ],
    },
    {
      id: 'ai', title: '🤖 人工智能 · AI Actions', items: [
        { type: 'ai/chat', title: 'AI 对话与推理', icon: '🧠', desc: '支持 Prompt 变量插值、人设选择与 AI 推理生成', config: { promptTemplate: '{{value}}', personaId: 'general', outputVariable: '' } },
      ],
    },
    { id: 'plugins', title: '🧩 插件能力 · Plugin Actions', dynamic: true },
    {
      id: 'outputs', title: '📤 交付输出 · Outputs', items: [
        { type: 'output/clipboard', title: '写入系统剪贴板', icon: '📝', desc: '把结果写回系统剪贴板' },
        { type: 'output/notification', title: '显示系统通知', icon: '🔔', desc: '以系统通知弹窗展示结果' },
        { type: 'output/panel', title: '唤起对应面板', icon: '🚀', desc: '打开指定插件的工具面板' },
      ],
    },
  ];

  function wfPluginLibItems(ctx) {
    const items = [];
    ctx.state.plugins.forEach(p => {
      if (!p.enabled) return;
      const caps = Array.isArray(p.capabilities) ? p.capabilities : [];
      caps.forEach(cap => {
        const capTitle = cap.title ? (cap.title.zh || cap.title.en || cap.id) : cap.id;
        items.push({
          type: 'action/plugin',
          title: `${p.name.zh || p.id}: ${capTitle}`,
          icon: '🧩',
          desc: `由插件 ${p.id} 提供 · 能力 ${cap.id}`,
          extra: { pluginId: p.id, capabilityId: cap.id },
        });
      });
    });
    return items;
  }

  function renderWorkflowLib(ctx) {
    const { els, state, escapeHtml } = ctx;
    if (!els.wfLibList) return;
    const q = (state.wfLibQuery || '').trim().toLowerCase();
    els.wfLibList.innerHTML = '';

    WF_LIB_CATALOG.forEach(group => {
      const items = group.dynamic ? wfPluginLibItems(ctx) : (group.items || []);
      const matched = q
        ? items.filter(it => `${it.title} ${it.desc || ''} ${it.type}`.toLowerCase().includes(q))
        : items;
      if (matched.length === 0) return;

      const box = document.createElement('details');
      box.className = 'wf-lib-group';
      box.open = true;
      const summary = document.createElement('summary');
      summary.className = 'wf-lib-group-title';
      summary.textContent = `${group.title} (${matched.length})`;
      box.appendChild(summary);

      matched.forEach(item => {
        const el = document.createElement('div');
        el.className = 'wf-lib-item';
        el.setAttribute('draggable', 'true');
        el.innerHTML = `
          <span class="icon">${item.icon || '🧩'}</span>
          <span class="wf-lib-item-text">
            <span class="wf-lib-item-title">${escapeHtml(item.title)}</span>
            <span class="wf-lib-item-desc">${escapeHtml(item.desc || '')}</span>
          </span>`;
        el.title = `${item.desc || ''} (点击或拖拽至画布)`;
        el.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', JSON.stringify({
            type: item.type, title: item.title, config: item.config || null, extra: item.extra || null,
          }));
        });
        el.addEventListener('click', () => addNodeToCanvas(ctx, item.type, item.title, {
          ...(item.extra || {}),
          config: item.config || undefined,
        }));
        box.appendChild(el);
      });
      els.wfLibList.appendChild(box);
    });

    if (!els.wfLibList.querySelector('.wf-lib-group')) {
      const empty = document.createElement('div');
      empty.className = 'wf-lib-empty';
      empty.textContent = q ? '没有匹配的节点' : '暂无可用插件能力';
      els.wfLibList.appendChild(empty);
    }
  }

  function defaultNodePosition(ctx) {
    const { els, wfCanvas } = ctx;
    const currentWorkflow = ctx.getCurrentWorkflow();
    const n = currentWorkflow ? currentWorkflow.nodes.length : 0;
    const jitter = (n % 5);
    if (!els.wfCanvasArea) return { x: 120 + jitter * 40, y: 90 + jitter * 40 };
    const rect = els.wfCanvasArea.getBoundingClientRect();
    const cx = (rect.width / 2 - wfCanvas.panX) / wfCanvas.scale;
    const cy = (rect.height / 2 - wfCanvas.panY) / wfCanvas.scale;
    return { x: Math.round(cx - 110 + jitter * 26), y: Math.round(cy - 34 + jitter * 20) };
  }

  function addNodeToCanvas(ctx, type, title, extra = {}) {
    const currentWorkflow = ctx.getCurrentWorkflow();
    if (!currentWorkflow) return;
    const { config, ...rest } = extra;
    const id = `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const pos = extra.x !== undefined ? { x: extra.x, y: extra.y } : defaultNodePosition(ctx);
    ctx.pushWfHistory();
    const newNode = {
      x: pos.x,
      y: pos.y,
      ...(config && Object.keys(config).length ? { config: { ...config } } : {}),
      ...rest,
      id,
      type,
      title,
    };
    currentWorkflow.nodes.push(newNode);
    ctx.scheduleWfAutosave(); // 画布增删/连线/拖动/检查器改配置都是编辑，须与名称输入框一样调度自动保存
    ctx.wfCanvas.selectedNodeId = id;
    ctx.renderWorkflowCanvas();
    ctx.updateWfUndoButtons();
    ctx.logToWfConsole(`+ 已添加节点 [${title}]，可在右侧检查器配置参数`);
  }

  window.OrbitWorkflows.WF_TRIGGER_TYPE_OPTIONS = WF_TRIGGER_TYPE_OPTIONS;
  window.OrbitWorkflows.WF_LIB_CATALOG = WF_LIB_CATALOG;
  window.OrbitWorkflows.wfPluginLibItems = wfPluginLibItems;
  window.OrbitWorkflows.renderWorkflowLib = renderWorkflowLib;
  window.OrbitWorkflows.defaultNodePosition = defaultNodePosition;
  window.OrbitWorkflows.addNodeToCanvas = addNodeToCanvas;
})();
