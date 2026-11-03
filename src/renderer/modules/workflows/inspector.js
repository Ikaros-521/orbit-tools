/* Workflows Visual Canvas - Node Inspector
   Manages node property inspector rendering, form generation by node type, and live two-way synchronization. */
(() => {
  window.OrbitWorkflows = window.OrbitWorkflows || {};

  function wfNodeConfigSummary(ctx, node) {
    const cfg = node.config || {};
    const { state } = ctx;
    const triggerOpts = window.OrbitWorkflows.WF_TRIGGER_TYPE_OPTIONS || [];

    switch (node.type) {
      case 'trigger/clipboard': {
        const found = triggerOpts.find(([v]) => v === (cfg.type || 'any'));
        return `匹配: ${found ? found[1] : cfg.type || '任意文本'}`;
      }
      case 'source/text': {
        const txt = String(cfg.text ?? '');
        return txt ? `文本: ${txt.slice(0, 26)}${txt.length > 26 ? '…' : ''}` : '(未设置文本)';
      }
      case 'util/text-template': return `模板: ${String(cfg.template ?? '{{value}}').slice(0, 30)}`;
      case 'util/regex-extract': return `/${cfg.pattern || '?'}/${cfg.flags || ''}`;
      case 'util/replace': return `${cfg.find || '?'} → ${String(cfg.replace ?? '').slice(0, 12)}`;
      case 'util/json-field': return `路径: ${cfg.path || '?'}`;
      case 'util/code-run': return `脚本: ${String(cfg.code || '').replace(/\s+/g, ' ').slice(0, 24)}…`;
      case 'ai/chat': return `AI: ${String(cfg.promptTemplate || '{{value}}').slice(0, 22)}`;
      case 'util/condition': {
        const labels = { contains: '包含', equals: '等于', startsWith: '开头为', regex: '匹配正则', notEmpty: '非空', empty: '为空' };
        const m = labels[cfg.mode || 'contains'] || cfg.mode;
        return `若 ${m} ${cfg.mode === 'notEmpty' || cfg.mode === 'empty' ? '' : String(cfg.value ?? '').slice(0, 14)}`.trim();
      }
      case 'util/delay': return `延迟 ${cfg.ms || 0}ms`;
      case 'action/plugin': return `${node.pluginId || '?'} : ${node.capabilityId || '?'}`;
      case 'output/panel': {
        if (!node.pluginId) return '(未配置目标插件)';
        const p = state.plugins.find(x => x.id === node.pluginId);
        return `唤起 ${p ? (p.name.zh || p.id) : node.pluginId}`;
      }
      default: return '';
    }
  }

  const WF_NODE_FIELDS = {
    'trigger/clipboard': [
      { key: 'type', label: '匹配内容类型', kind: 'select', options: () => window.OrbitWorkflows.WF_TRIGGER_TYPE_OPTIONS, def: 'any' }
    ],
    'source/text': [
      { key: 'text', label: '静态文本内容', kind: 'textarea', def: '' },
      { key: 'type', label: 'MIME 类型', kind: 'text', def: 'text/plain' }
    ],
    'util/text-template': [
      { key: 'template', label: '模板 (支持 {{value}} {{type}} {{date}})', kind: 'textarea', def: '{{value}}' }
    ],
    'util/regex-extract': [
      { key: 'pattern', label: '正则表达式', kind: 'text', def: '' },
      { key: 'flags', label: '标志 (如 gi)', kind: 'text', def: '' },
      { key: 'group', label: '捕获组序号 (0=整体)', kind: 'number', def: 0 }
    ],
    'util/replace': [
      { key: 'find', label: '查找内容', kind: 'text', def: '' },
      { key: 'replace', label: '替换为', kind: 'text', def: '' },
      { key: 'regex', label: '按正则模式替换', kind: 'checkbox', def: false }
    ],
    'util/json-field': [
      { key: 'path', label: '字段路径 (a.b[0].c)', kind: 'text', def: '' }
    ],
    'util/code-run': [
      { key: 'code', label: 'JS 脚本 (支持 return / context.get / set / 变量)', kind: 'textarea', def: 'return input;' },
      { key: 'outputVariable', label: '输出存入变量名 (可选，如 myVar)', kind: 'text', def: '' }
    ],
    'ai/chat': [
      { key: 'promptTemplate', label: '提示词模板 (支持 {{value}} 与 {{variables.xxx}})', kind: 'textarea', def: '{{value}}' },
      {
        key: 'personaId', label: '助手人设预设', kind: 'select', def: 'general',
        options: [
          ['general', '通用助手'],
          ['developer', '架构与全栈工程师'],
          ['translator', '科技与学术翻译'],
          ['writer', '文案与文字润色'],
          ['workflow-architect', '工作流架构师']
        ]
      },
      { key: 'systemPrompt', label: '自定义 System 提示词 (覆盖人设)', kind: 'textarea', def: '' },
      { key: 'outputVariable', label: '输出存入变量名 (可选)', kind: 'text', def: '' }
    ],
    'util/condition': [
      {
        key: 'mode', label: '判断方式', kind: 'select', def: 'contains',
        options: [['contains', '包含…'], ['equals', '等于…'], ['startsWith', '以…开头'], ['regex', '匹配正则…'], ['notEmpty', '内容非空'], ['empty', '内容为空']]
      },
      { key: 'value', label: '判断值 (非空/为空时忽略)', kind: 'text', def: '' }
    ],
    'util/delay': [
      { key: 'ms', label: '延迟毫秒 (0-15000)', kind: 'number', def: 300 }
    ],
    'output/panel': [
      { key: 'pluginId', label: '目标插件', kind: 'plugin', target: 'node' }
    ],
  };

  function syncWfInspector(ctx) {
    const { els, wfCanvas } = ctx;
    if (!els.wfInspector) return;
    const currentWorkflow = ctx.getCurrentWorkflow();
    const node = currentWorkflow && wfCanvas.selectedNodeId
      ? currentWorkflow.nodes.find(n => n.id === wfCanvas.selectedNodeId)
      : null;
    if (!node) {
      wfCanvas.inspectorNodeId = null;
      els.wfInspector.hidden = true;
      return;
    }
    if (els.wfInspBody && wfCanvas.inspectorNodeId === node.id && els.wfInspBody.contains(document.activeElement)) return;
    renderWfInspector(ctx, node);
  }

  function renderWfInspector(ctx, node) {
    const { els, state } = ctx;
    ctx.wfCanvas.inspectorNodeId = node.id;
    els.wfInspector.hidden = false;
    els.wfInspType.textContent = node.type;
    els.wfInspBody.innerHTML = '';

    const makeField = (labelText, inputEl, hint) => {
      const field = document.createElement('label');
      field.className = 'wf-insp-field';
      const lab = document.createElement('span');
      lab.className = 'wf-insp-label';
      lab.textContent = labelText;
      field.append(lab, inputEl);
      if (hint) {
        const h = document.createElement('span');
        h.className = 'wf-insp-hint';
        h.textContent = hint;
        field.appendChild(h);
      }
      return field;
    };

    // title (all node types)
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'wf-insp-input';
    titleInput.value = node.title || '';
    titleInput.addEventListener('input', () => {
      ctx.beginWfFieldEdit(titleInput);
      node.title = titleInput.value;
      ctx.renderWorkflowCanvas();
    });
    els.wfInspBody.appendChild(makeField('节点标题', titleInput));

    // plugin info (read-only)
    if (node.type === 'action/plugin') {
      const info = document.createElement('div');
      info.className = 'wf-insp-info mono';
      info.textContent = `插件 ${node.pluginId || '?'} · 能力 ${node.capabilityId || '?'}，由插件后端或内置转换执行`;
      els.wfInspBody.appendChild(info);
    }

    const fields = WF_NODE_FIELDS[node.type] || [];
    if (fields.length === 0 && node.type !== 'action/plugin') {
      const info = document.createElement('div');
      info.className = 'wf-insp-info';
      info.textContent = '此节点类型无可配置参数';
      els.wfInspBody.appendChild(info);
    }

    fields.forEach(f => {
      const readVal = () => (f.target === 'node' ? node[f.key] : (node.config || {})[f.key]);
      const writeVal = v => {
        if (f.target === 'node') node[f.key] = v;
        else {
          if (!node.config) node.config = {};
          node.config[f.key] = v;
        }
      };
      let input;
      if (f.kind === 'plugin') {
        input = document.createElement('select');
        input.className = 'wf-insp-input';
        const panelPlugins = state.plugins.filter(p => p.enabled && p.panel);
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = panelPlugins.length ? '选择插件…' : '暂无带面板的已启用插件';
        input.appendChild(placeholder);
        panelPlugins.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = window.I18N.lang === 'en' ? (p.name.en || p.name.zh) : (p.name.zh || p.name.en);
          input.appendChild(opt);
        });
        input.value = readVal() ?? '';
        input.addEventListener('change', () => {
          ctx.pushWfHistory();
          writeVal(input.value || null);
          ctx.renderWorkflowCanvas();
        });
      } else if (f.kind === 'select') {
        input = document.createElement('select');
        input.className = 'wf-insp-input';
        const rawOptions = typeof f.options === 'function' ? f.options() : f.options;
        (rawOptions || []).forEach(([v, label]) => {
          const opt = document.createElement('option');
          opt.value = v;
          opt.textContent = label;
          input.appendChild(opt);
        });
        input.value = readVal() ?? f.def;
        input.addEventListener('change', () => {
          ctx.pushWfHistory();
          writeVal(input.value);
          ctx.renderWorkflowCanvas();
        });
      } else if (f.kind === 'checkbox') {
        input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'wf-insp-check';
        input.checked = !!readVal();
        input.addEventListener('change', () => {
          ctx.pushWfHistory();
          writeVal(input.checked);
          ctx.renderWorkflowCanvas();
        });
      } else if (f.kind === 'textarea') {
        input = document.createElement('textarea');
        input.className = 'wf-insp-input wf-insp-textarea';
        input.rows = 3;
        input.value = readVal() ?? f.def;
        input.addEventListener('input', () => {
          ctx.beginWfFieldEdit(input);
          writeVal(input.value);
          ctx.renderWorkflowCanvas();
        });
      } else {
        input = document.createElement('input');
        input.type = f.kind === 'number' ? 'number' : 'text';
        input.className = 'wf-insp-input';
        input.value = readVal() ?? f.def;
        input.addEventListener('input', () => {
          ctx.beginWfFieldEdit(input);
          writeVal(f.kind === 'number' ? Number(input.value) : input.value);
          ctx.renderWorkflowCanvas();
        });
      }
      els.wfInspBody.appendChild(makeField(f.label, input));
    });
  }

  window.OrbitWorkflows.wfNodeConfigSummary = wfNodeConfigSummary;
  window.OrbitWorkflows.WF_NODE_FIELDS = WF_NODE_FIELDS;
  window.OrbitWorkflows.syncWfInspector = syncWfInspector;
  window.OrbitWorkflows.renderWfInspector = renderWfInspector;
})();
