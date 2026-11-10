/* AI Chat - Slash Command Controller
   deepseek-harness inspired: typing "/" at the start of the input opens a
   command popover combining session actions (plan/compress/export/new) with
   installed skills. Selecting a skill composes a directive that tells the
   model to read_skill first and follow its instructions, closing the
   model-side discovery loop with a user-side direct entry.
   Dual CommonJS / Browser export. */
(() => {
  const defaultEscapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const BUILTIN_COMMANDS = [
    { kind: 'action', id: 'plan', icon: '📋', name: 'plan', desc: '切换计划模式（先呈交计划评审，批准后再执行）' },
    { kind: 'action', id: 'compress', icon: '🗜️', name: 'compress', desc: '立即压缩当前会话上下文' },
    { kind: 'action', id: 'export', icon: '📤', name: 'export', desc: '导出当前会话为 Markdown 文件' },
    { kind: 'action', id: 'new', icon: '✨', name: 'new', desc: '新建会话' }
  ];

  /**
   * Pure filter over builtin + skill commands. query 不含前导 '/'。
   * 匹配 name / 技能名 / 描述（大小写不敏感子串）。
   */
  function filterSlashCommands(builtins, skills, query) {
    const q = String(query || '').trim().toLowerCase();
    const commands = [
      ...(builtins || BUILTIN_COMMANDS),
      ...(Array.isArray(skills) ? skills : []).map(s => ({
        kind: 'skill',
        id: s.id || s.name,
        icon: '🧠',
        name: s.name || s.id,
        desc: s.desc || '',
        skill: s
      }))
    ];
    if (!q) return commands;
    return commands.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.desc || '').toLowerCase().includes(q) ||
      String(c.id || '').toLowerCase().includes(q)
    );
  }

  /** 从输入框文本提取斜杠 query：以 / 开头且首个空白前的一段。 */
  function parseSlashQuery(value) {
    const text = String(value || '');
    if (!text.startsWith('/')) return null;
    // 换行或多行内容不再是斜杠命令输入态
    if (text.includes('\n')) return null;
    const m = text.match(/^\/(\S*)\s?([\s\S]*)$/);
    if (!m) return { query: '', rest: '' };
    return { query: m[1], rest: m[2] || '' };
  }

  function createSlashController(deps) {
    const {
      chatInput, aiInputBox,
      getSkills, getIsGenerating,
      actions, sendText, escapeHtml
    } = deps;
    const esc = escapeHtml || defaultEscapeHtml;
    if (!chatInput || !aiInputBox) return { dispose() {}, close() {}, handleInput() {} };

    let popover = null;
    let listEl = null;
    let visible = false;
    let items = [];
    let activeIdx = 0;

    const ensurePopover = () => {
      if (popover) return popover;
      popover = document.createElement('div');
      popover.className = 'ai-slash-popover hidden';
      popover.innerHTML = '<div class="ai-slash-list"></div><div class="ai-slash-hint">↑↓ 选择 · Enter 执行 · Esc 关闭</div>';
      listEl = popover.querySelector('.ai-slash-list');
      // mousedown 抢先于输入框 blur，避免点击项时 popover 先消失
      listEl.addEventListener('mousedown', e => {
        const item = e.target.closest('.ai-slash-item');
        if (!item) return;
        e.preventDefault();
        e.stopPropagation();
        runItem(items[Number(item.dataset.idx)]);
      });
      aiInputBox.appendChild(popover);
      return popover;
    };

    const close = () => {
      if (popover) popover.classList.add('hidden');
      visible = false;
      activeIdx = 0;
    };

    const renderList = () => {
      if (!listEl) return;
      if (items.length === 0) {
        listEl.innerHTML = '<div class="ai-slash-empty">没有匹配的命令或技能</div>';
        return;
      }
      listEl.innerHTML = items.map((it, i) => `
        <div class="ai-slash-item${i === activeIdx ? ' active' : ''}" data-idx="${i}">
          <span class="ai-slash-item-ico">${it.icon}</span>
          <span class="ai-slash-item-main">
            <b>/${esc(it.name)}</b>
            <i>${esc(it.desc || '')}</i>
          </span>
          <span class="ai-slash-item-kind">${it.kind === 'skill' ? '技能' : '命令'}</span>
        </div>
      `).join('');
    };

    const open = (query) => {
      ensurePopover();
      items = filterSlashCommands(BUILTIN_COMMANDS, getSkills ? getSkills() : [], query);
      activeIdx = 0;
      visible = true;
      popover.classList.remove('hidden');
      renderList();
    };

    const runItem = (it) => {
      if (!it) return;
      close();
      if (it.kind === 'action') {
        chatInput.value = '';
        chatInput.dispatchEvent(new Event('input', { bubbles: true }));
        const fn = actions && actions[it.id];
        if (typeof fn === 'function') fn();
        return;
      }
      // 技能：组装指令让模型先 read_skill 再按技能指引执行；rest 是斜杠命令后输入的任务要求
      if (getIsGenerating && getIsGenerating()) return; // 生成中不触发新发送
      const rest = (parseSlashQuery(chatInput.value) || {}).rest || '';
      const directive = `请先调用 read_skill 工具读取技能「${it.name}」并完整理解其内容，然后严格按照该技能的指引执行任务。${rest ? `\n\n任务要求：${rest}` : ''}`;
      chatInput.value = '';
      chatInput.dispatchEvent(new Event('input', { bubbles: true }));
      if (typeof sendText === 'function') sendText(directive);
    };

    const handleInput = () => {
      const parsed = parseSlashQuery(chatInput.value);
      if (!parsed) { close(); return; }
      open(parsed.query);
    };

    // capture 阶段接管导航键，阻断 panel 层的 Enter 发送监听
    const onKeyDown = (e) => {
      if (!visible || items.length === 0) return;
      if (e.isComposing) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        activeIdx = e.key === 'ArrowDown'
          ? (activeIdx + 1) % items.length
          : (activeIdx - 1 + items.length) % items.length;
        renderList();
        const el = listEl.querySelector(`.ai-slash-item[data-idx="${activeIdx}"]`);
        if (el) el.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        runItem(items[activeIdx]);
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };

    const onBlur = () => setTimeout(() => close(), 120);

    chatInput.addEventListener('input', handleInput);
    chatInput.addEventListener('keydown', onKeyDown, true);
    chatInput.addEventListener('blur', onBlur);

    return {
      close,
      handleInput,
      dispose() {
        chatInput.removeEventListener('input', handleInput);
        chatInput.removeEventListener('keydown', onKeyDown, true);
        chatInput.removeEventListener('blur', onBlur);
        close();
        if (popover && popover.parentElement) popover.parentElement.removeChild(popover);
        popover = null;
        listEl = null;
      }
    };
  }

  const exportsObj = { BUILTIN_COMMANDS, filterSlashCommands, parseSlashQuery, createSlashController };
  if (typeof window !== 'undefined') window.AiChatSlashCommands = exportsObj;
  if (typeof module !== 'undefined' && module.exports) module.exports = exportsObj;
})();
