/* AI Chat - Unified Tool Card Component
   deepseek-harness inspired: one expandable card per tool call. The call is
   streamed to the UI first; approvals attach to the already-displayed card by
   callId (no second drifting copy of the arguments), and params stay
   inspectable after execution instead of vanishing with the approval card.
   Shared by the live stream-chunk path and the history re-render path. */
(() => {
  const defaultEscapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const escapeHtml = (s) => {
    const lib = (typeof window !== 'undefined' && window.AiChatMarkdown) || null;
    return lib && lib.escapeHtml ? lib.escapeHtml(s) : defaultEscapeHtml(s);
  };

  const parseArgs = (raw) => {
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
    } catch {
      return null;
    }
  };

  const prettyArgs = (raw) => {
    if (raw === undefined || raw === null || raw === '') return '';
    if (typeof raw !== 'string') {
      try { return JSON.stringify(raw, null, 2); } catch { return String(raw); }
    }
    const parsed = parseArgs(raw);
    if (parsed === null) return raw; // truncated / invalid JSON - show as-is
    try { return JSON.stringify(parsed, null, 2); } catch { return raw; }
  };

  /* Per-tool presentation metadata: icon + running title, computed from the
     (possibly partial) arguments. Anything unknown falls back to the generic
     wrench entry, so new tools keep working without registration. */
  const TOOL_META = {
    'dispatch_task_to_ai_ide': {
      icon: '🚀',
      title: (args) => `任务分派: ${args && args.target ? args.target : 'AI IDE'}`
    },
    'list_available_ai_ides': { icon: '🔍', title: () => '探测本地 AI IDE / CLI' },
    'list_processes': { icon: '📋', title: () => '查看后台进程' },
    'stop_process': {
      icon: '⏹',
      title: (args) => `停止后台进程${args && args.pid ? ` (PID: ${args.pid})` : ''}`
    },
    'dispatch_subagent': {
      icon: '🤖',
      title: (args) => `子智能体 [${(args && args.role) || '专项派生'}]`
    },
    'run_command': { icon: '⚡', title: (args) => `执行命令${args && args.command ? `: ${String(args.command).slice(0, 60)}` : ''}` },
    'write_file': { icon: '✏️', title: (args) => `写入文件${args && args.path ? `: ${args.path}` : ''}` },
    'edit_file': { icon: '✏️', title: (args) => `编辑文件${args && args.path ? `: ${args.path}` : ''}` },
    'read_file': { icon: '📖', title: (args) => `读取文件${args && args.path ? `: ${args.path}` : ''}` },
    'grep_search': { icon: '🔎', title: () => '内容检索 (grep)' },
    'search_files': { icon: '🔎', title: () => '文件搜索 (glob)' },
    'list_dir': { icon: '📁', title: (args) => `浏览目录${args && args.path ? `: ${args.path}` : ''}` },
    'run_javascript': { icon: '🧮', title: () => '执行 JavaScript' },
    'submit_plan': { icon: '📋', title: () => '呈交执行计划' },
    'update_task_list': { icon: '✅', title: () => '更新任务清单' },
    'list_skills': { icon: '🧠', title: () => '读取技能列表' },
    'read_skill': { icon: '📖', title: (args) => `读取技能${(args && args.skill_id) ? `: ${args.skill_id}` : ''}` },
    'list_open_source_skills': { icon: '🛒', title: () => '检索开源技能库' },
    'install_skill': { icon: '⬇️', title: (args) => `安装技能${(args && (args.source || args.skill_id)) ? `: ${args.source || args.skill_id}` : ''}` },
    'create_skill': { icon: '🧠', title: (args) => `创建技能${(args && args.name) ? `: ${args.name}` : ''}` }
  };

  const metaFor = (name) => {
    if (!name) return { icon: '🛠️', title: () => '工具调用' };
    if (TOOL_META[name]) return TOOL_META[name];
    if (/^mcp__[Pp]laywright__/.test(name)) {
      const op = name.replace(/^mcp__[Pp]laywright__/, '');
      return { icon: '🌐', title: () => `Playwright: ${op}` };
    }
    if (name.startsWith('mcp__')) {
      const short = name.replace(/^mcp__/, '').replace(/__/g, ' · ');
      return { icon: '🔌', title: () => `MCP: ${short}` };
    }
    if (name.startsWith('memory_')) return { icon: '🧠', title: () => `记忆: ${name.replace(/^memory_/, '')}` };
    return { icon: '🛠️', title: () => '工具调用' };
  };

  /* Result display formatter shared by live and history rendering. */
  const formatToolResultForDisplay = (res) => {
    if (res === null || res === undefined) return '(无执行结果)';
    if (typeof res === 'string') return res;
    if (typeof res === 'object') {
      if (typeof res.diff === 'string' && res.diff) {
        // edit_file：unified diff 是主要反馈，preview 行号片段作为补充
        return `${res.diff}\n\n${res.preview || ''}`.trim();
      }
      if (Array.isArray(res.content)) {
        const texts = res.content.map(c => (c && c.text) ? c.text : JSON.stringify(c)).filter(Boolean);
        if (texts.length > 0) return texts.join('\n');
      }
      if (res.stdout !== undefined || res.stderr !== undefined) {
        let out = '';
        if (res.stdout) out += res.stdout;
        if (res.stderr) out += (out ? '\n[stderr]\n' : '') + res.stderr;
        if (res.exitCode !== undefined) out += `\n[退出码: ${res.exitCode}]`;
        return out || '(无控制台输出)';
      }
      if (res.result !== undefined) {
        return typeof res.result === 'object' ? JSON.stringify(res.result, null, 2) : String(res.result);
      }
      return JSON.stringify(res, null, 2);
    }
    return String(res);
  };

  /* Completed-state title, ported from the former per-branch special cases. */
  const resultTitle = (toolName, res) => {
    if (!res) return `<span>✓ 工具已执行:</span> <strong>${escapeHtml(toolName)}</strong>`;
    if (res.denied) return `<span>✗ 已拒绝:</span> <strong>${escapeHtml(toolName)}</strong>`;
    if (res.background && res.pid) return `<span>⚡ 后台运行中 (PID: ${res.pid}):</span> <strong>${escapeHtml(toolName)}</strong>`;
    if (toolName === 'stop_process' && res.ok) return `<span>⏹ 已停止进程${res.pid ? ` (PID: ${res.pid})` : ''}</span>`;
    if (toolName === 'dispatch_subagent') {
      const modeLabel = res.mode === 'fork' ? '分叉探索' : '专项派生';
      const role = res.role || '子智能体';
      const state = res.ok ? `完成 (${res.rounds_executed || 1} 轮 · ${res.total_tool_calls || 0} 次工具)` : '失败';
      return `<span>🤖 子智能体 [${escapeHtml(role)}] (${modeLabel}):</span> <strong>${state}</strong>`;
    }
    if (toolName === 'dispatch_task_to_ai_ide') {
      const ide = res.targetName || res.target || '外部 AI';
      const mode = res.mode === 'headless' ? '批处理' : (res.mode === 'terminal' ? '终端' : 'IDE窗口');
      const state = res.ok ? '成功' : '失败';
      return `<span>🚀 任务已派发至:</span> <strong>${escapeHtml(ide)}</strong> <span style="opacity:0.85">(${mode}·${state})</span>`;
    }
    if (/^mcp__[Pp]laywright__/.test(toolName)) {
      return `<span>🌐 Playwright 执行完成:</span> <strong>${escapeHtml(toolName.replace(/^mcp__[Pp]laywright__/, ''))}</strong>`;
    }
    if (toolName === 'list_available_ai_ides') {
      return `<span>🔍 本地 AI 环境探测:</span> <strong>已找到 ${res.count !== undefined ? res.count : 0} 个可用工具</strong>`;
    }
    if (toolName === 'list_processes') {
      return `<span>📋 进程清单:</span> <strong>共 ${res.count !== undefined ? res.count : 0} 个活跃进程</strong>`;
    }
    if (toolName === 'submit_plan') {
      if (res.approved) return `<span>📋 计划已批准:</span> <strong>已转为任务清单</strong>`;
      if (res.feedback) return `<span>📋 计划评审:</span> <strong>已反馈 · 模型修订中</strong>`;
      return `<span>📋 计划评审:</span> <strong>${res.ok ? '等待用户评审' : (res.error ? escapeHtml(res.error) : '未批准')}</strong>`;
    }
    if (res.ok === false && res.error) {
      return `<span>⚠️ 执行失败:</span> <strong>${escapeHtml(toolName)}</strong> <span style="opacity:0.8">${escapeHtml(String(res.error).slice(0, 120))}</span>`;
    }
    if (toolName === 'edit_file' && res.ok) {
      const short = res.path ? String(res.path).split(/[\\/]/).pop() : '';
      const stat = res.diffStat ? ` <span style="opacity:0.85">${escapeHtml(res.diffStat)}</span>` : '';
      const times = (Number(res.replacements) || 1) > 1 ? ` <span style="opacity:0.85">×${res.replacements}</span>` : '';
      return `<span>✓ 已编辑:</span> <strong>${escapeHtml(short || toolName)}</strong>${stat}${times}`;
    }
    return `<span>✓ 工具已执行:</span> <strong>${escapeHtml(toolName)}</strong>`;
  };

  const renderDiffHtml = (diffText) => {
    const html = [];
    for (const line of String(diffText || '').split('\n')) {
      if (!line) continue;
      if (line.startsWith('--- ') || line.startsWith('+++ ')) {
        html.push(`<span class="dl-file">${escapeHtml(line)}</span>`);
      } else if (line.startsWith('@@')) {
        html.push(`<span class="dl-hunk">${escapeHtml(line)}</span>`);
      } else if (line.startsWith('[')) {
        html.push(`<span class="dl-omit">${escapeHtml(line)}</span>`);
      } else if (line.startsWith('-')) {
        html.push(`<span class="dl-del">${escapeHtml(line)}</span>`);
      } else if (line.startsWith('+')) {
        html.push(`<span class="dl-add">${escapeHtml(line)}</span>`);
      } else {
        html.push(`<span class="dl-ctx">${escapeHtml(line)}</span>`);
      }
    }
    return `<pre class="ai-tool-diff"><code>${html.join('')}</code></pre>`;
  };

  const buildArgsSection = (rawArgs) => {
    const pretty = prettyArgs(rawArgs);
    if (!pretty) return '';
    return `
      <details class="ai-tool-args-details">
        <summary class="ai-tool-args-summary"><span>⚙️ 查看调用参数</span><span class="ai-tool-detail-hint">▾</span></summary>
        <pre class="ai-tool-args-pre"><code>${escapeHtml(pretty)}</code></pre>
      </details>
    `;
  };

  const buildResultSection = (result) => {
    if (result === undefined || result === null) return '';
    if (result && result.denied) return '';
    // edit_file：结果区直接渲染着色 diff（默认展开级别与普通结果一致，可折叠）
    if (typeof result.diff === 'string' && result.diff) {
      const statLabel = result.diffStat ? ` · ${result.diffStat}` : '';
      return `
      <details class="ai-tool-result-details" open>
        <summary class="ai-tool-result-summary">
          <span>📝 变更 Diff${statLabel}</span>
          <span class="ai-tool-detail-hint">▾</span>
        </summary>
        ${renderDiffHtml(result.diff)}
      </details>
    `;
    }
    const formatted = formatToolResultForDisplay(result);
    const previewLen = formatted.length > 1024 ? `(${(formatted.length / 1024).toFixed(1)} KB)` : `(${formatted.length} 字符)`;
    return `
      <details class="ai-tool-result-details">
        <summary class="ai-tool-result-summary">
          <span>📋 查看执行结果</span>
          <span class="ai-tool-detail-hint">${previewLen} ▾</span>
        </summary>
        <pre class="ai-tool-result-pre"><code>${escapeHtml(formatted)}</code></pre>
      </details>
    `;
  };

  const buildStopBtn = (result) => {
    if (result && result.background && result.pid) {
      return `<button type="button" class="ai-tool-stop-proc-btn" data-pid="${result.pid}" title="停止此后台进程树 (PID: ${result.pid})">⏹ 停止进程</button>`;
    }
    return '';
  };

  /**
   * Create a tool card element.
   * @param {object} tc tool call: { id, round?, function: { name, arguments } }
   * @param {object} [opts]
   * @param {string} [opts.phase] 'streaming' | 'running' | 'done' | 'denied'
   * @param {*} [opts.result] execution result (done/denied phases)
   */
  function createToolCard(tc, opts = {}) {
    const name = (tc && tc.function && tc.function.name) || '';
    const meta = metaFor(name);
    const args = parseArgs(tc.function.arguments);
    const card = document.createElement('div');
    card.className = 'ai-tool-badge ai-tool-card';
    card.dataset.tool = tc.id || '';
    if (tc.round !== undefined && tc.round !== null) card.dataset.round = String(tc.round);
    card.dataset.name = name;
    if (tc.function && typeof tc.function.arguments === 'string') card.dataset.args = tc.function.arguments;

    const phase = opts.phase || 'streaming';
    let titleHtml = '';
    if (phase === 'denied') {
      card.classList.add('denied');
      titleHtml = resultTitle(name, { denied: true });
    } else if (phase === 'done') {
      titleHtml = resultTitle(name, opts.result);
      if (opts.result && opts.result.ok === false) card.classList.add('failed');
    } else {
      const statusText = phase === 'running' ? '(执行中…)' : '(参数就绪)';
      const label = meta.title(args === null ? {} : args);
      titleHtml = `<span>${meta.icon}</span> <strong>${escapeHtml(label)}</strong> <span class="ai-tool-badge-status">${statusText}</span>`;
    }

    card.innerHTML = `
      <div class="ai-tool-badge-head">
        <div class="ai-tool-badge-title">${titleHtml}</div>
        ${phase === 'done' ? buildStopBtn(opts.result) : ''}
      </div>
      ${phase === 'done' ? buildArgsSection(tc.function.arguments) : ''}
      ${phase === 'done' ? buildResultSection(opts.result) : ''}
      <div class="ai-tool-approval-slot"></div>
    `;
    return card;
  }

  /**
   * tool_exec_start: arguments are now authoritative; show them and mark running.
   */
  function applyExecStart(card, tc) {
    if (!card) return;
    if (tc.round !== undefined && tc.round !== null) card.dataset.round = String(tc.round);
    const name = (tc && tc.function && tc.function.name) || card.dataset.name || '';
    const meta = metaFor(name);
    const args = parseArgs(tc.function.arguments);
    const head = card.querySelector('.ai-tool-badge-head');
    if (head) {
      head.querySelector('.ai-tool-badge-title').innerHTML =
        `<span>${meta.icon}</span> <strong>${escapeHtml(meta.title(args === null ? {} : args))}</strong> <span class="ai-tool-badge-status">(执行中…)</span>`;
    }
    let argsEl = card.querySelector('.ai-tool-args-details');
    if (!argsEl) {
      const slot = document.createElement('div');
      slot.innerHTML = buildArgsSection(tc.function.arguments);
      argsEl = slot.firstElementChild;
      const approvalSlot = card.querySelector('.ai-tool-approval-slot');
      if (approvalSlot) card.insertBefore(argsEl, approvalSlot);
      else card.appendChild(argsEl);
    }
  }

  /**
   * tool_result: switch to completed layout, keeping args + approval status
   * sections (they are re-created deterministically from stored data).
   */
  function applyToolResult(card, toolName, result) {
    if (!card) return;
    const argsRaw = card.dataset.args !== undefined ? card.dataset.args : null;
    // Args were rendered in applyExecStart; rebuild them from the stored DOM.
    const argsEl = card.querySelector('.ai-tool-args-details');
    const approvalSlot = card.querySelector('.ai-tool-approval-slot');
    const approvalHtml = approvalSlot ? approvalSlot.innerHTML : '';

    card.classList.remove('running');
    if (result && result.denied) card.classList.add('denied');
    if (result && result.ok === false) card.classList.add('failed');

    card.innerHTML = `
      <div class="ai-tool-badge-head">
        <div class="ai-tool-badge-title">${resultTitle(toolName, result)}</div>
        ${buildStopBtn(result)}
      </div>
      ${argsEl ? argsEl.outerHTML : (argsRaw ? buildArgsSection(argsRaw) : '')}
      ${buildResultSection(result)}
      <div class="ai-tool-approval-slot">${approvalHtml}</div>
    `;
  }

  const exportsObj = {
    TOOL_META,
    metaFor,
    parseArgs,
    prettyArgs,
    formatToolResultForDisplay,
    resultTitle,
    renderDiffHtml,
    createToolCard,
    applyExecStart,
    applyToolResult
  };

  if (typeof window !== 'undefined') {
    window.AiChatToolCards = exportsObj;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})();
