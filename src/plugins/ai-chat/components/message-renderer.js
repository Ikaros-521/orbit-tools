/* AI Chat - Message DOM rendering layer (extracted from panel.js):
   - attachment helpers + hover context popover
   - pending-late-chunk buffer & incremental StreamSlot infra (dsh delta fast path)
   - message element factory (bubbles, attachment cards, tool badges, turn footers)
   Dual CommonJS / Browser environment export. Mutable session/stream state is
   shared with panel.js through the `state` getter/setter bag. */
(() => {
  function createMessageRenderer(deps) {
    const {
      state,
      escapeHtml, renderMarkdown, copyToClipboard,
      chatInput, pillAgent, pillCot,
      autoResizeInput, renderMessages, renderSessionsList,
      setGeneratingState, syncAttachmentsBar, updateHeader, updateSendOrStopButton
    } = deps;
    if (!chatInput) return null;

    // window libs resolved at factory time (ensureDependencies has run in mount)
    const MermaidRenderer = window.AiChatMermaid;
    const HljsRenderer = window.AiChatHljs;
    const ToolCards = window.AiChatToolCards;
    const StreamRendererLib = window.AiChatStreamRenderer;

    /* --- Attachment Context & Display Helpers -------------------------------- */
    function formatFileSize(bytes) {
      if (!bytes || bytes <= 0) return '';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function formatAttachmentContextSnippet(att) {
      if (!att) return '';
      if (att.type === 'file' || (!att.type && att.content !== undefined)) {
        return `### 附件文件: ${att.name || att.path}\n\`\`\`\n${att.content || ''}\n\`\`\``;
      }
      if (att.type === 'directory' || att.isDirectory) {
        return `### 附件文件夹目录: ${att.path || att.name}\n(已关联本地目录供分析与定位)`;
      }
      return '';
    }

    /**
     * Decomposes message content and attached context.
     * Extracts clean user instruction and isolates extracted file/folder snippets
     * for both clean new messages and legacy assembled messages.
     */
    function parseDisplayMessage(msg) {
      if (!msg) return { text: '', legacyAttachments: [], isLegacyAssembled: false };
      const raw = String(msg.content || '');
      const CONTEXT_START = '[用户随附文件/目录上下文]:';
      const INSTRUCTION_START = '[用户指令]:';

      if (raw.includes(CONTEXT_START) && raw.includes(INSTRUCTION_START)) {
        const parts = raw.split(INSTRUCTION_START);
        const contextSection = parts[0].replace(CONTEXT_START, '').trim();
        const instructionText = (parts[1] || '').trim();

        const legacyAttachments = [];
        if (!Array.isArray(msg.attachments) || msg.attachments.length === 0) {
          const fileBlocks = contextSection.split(/(?=### 附件(?:文件|文件夹目录):)/g);
          fileBlocks.forEach((fb, idx) => {
            const trimmed = fb.trim();
            if (!trimmed) return;
            const fileMatch = trimmed.match(/^### 附件文件:\s*(.+)$/m);
            const dirMatch = trimmed.match(/^### 附件文件夹目录:\s*(.+)$/m);
            if (fileMatch) {
              const name = fileMatch[1].trim();
              const codeMatch = trimmed.match(/```(?:\w+)?\n([\s\S]*?)\n```/);
              legacyAttachments.push({
                type: 'file',
                id: `legacy_file_${idx}`,
                name: name.split(/[\\/]/).pop() || name,
                path: name,
                content: codeMatch ? codeMatch[1] : trimmed,
                size: codeMatch ? new Blob([codeMatch[1]]).size : 0
              });
            } else if (dirMatch) {
              const dirPath = dirMatch[1].trim();
              legacyAttachments.push({
                type: 'directory',
                id: `legacy_dir_${idx}`,
                name: dirPath.split(/[\\/]/).pop() || dirPath,
                path: dirPath
              });
            }
          });
        }

        const isDefaultInstruction = instructionText === '请基于上述随附文件/目录进行分析。';
        return {
          text: isDefaultInstruction ? '' : instructionText,
          legacyAttachments,
          isLegacyAssembled: true
        };
      }

      return {
        text: raw,
        legacyAttachments: [],
        isLegacyAssembled: false
      };
    }

    let contextPopoverEl = null;
    let popoverHideTimer = null;

    function ensureContextPopover() {
      if (contextPopoverEl && contextPopoverEl.parentElement) return contextPopoverEl;
      contextPopoverEl = document.createElement('div');
      contextPopoverEl.className = 'ai-att-popover hidden';
      contextPopoverEl.innerHTML = `
        <div class="ai-att-popover-header">
          <div class="ai-att-popover-title">
            <span class="ai-att-popover-icon">📄</span>
            <span class="ai-att-popover-heading">实际注入模型上下文</span>
          </div>
          <div class="ai-att-popover-actions">
            <span class="ai-att-popover-stats"></span>
            <button type="button" class="ai-att-popover-copy-btn" title="复制完整实际发送上下文">
              <span>📋</span> <span class="btn-text">复制上下文</span>
            </button>
          </div>
        </div>
        <div class="ai-att-popover-body">
          <pre class="ai-att-popover-code"><code></code></pre>
        </div>
      `;
      document.body.appendChild(contextPopoverEl);

      contextPopoverEl.addEventListener('mouseenter', () => {
        if (popoverHideTimer) {
          clearTimeout(popoverHideTimer);
          popoverHideTimer = null;
        }
      });

      contextPopoverEl.addEventListener('mouseleave', () => {
        scheduleHideContextPopover();
      });

      return contextPopoverEl;
    }

    function showContextPopover(anchorEl, att) {
      if (popoverHideTimer) {
        clearTimeout(popoverHideTimer);
        popoverHideTimer = null;
      }

      const popover = ensureContextPopover();
      const snippet = formatAttachmentContextSnippet(att);
      const charCount = snippet.length;
      const approxTokens = Math.ceil(charCount / 3.2);

      const headingEl = popover.querySelector('.ai-att-popover-heading');
      const iconEl = popover.querySelector('.ai-att-popover-icon');
      const statsEl = popover.querySelector('.ai-att-popover-stats');
      const codeEl = popover.querySelector('.ai-att-popover-code code');
      const copyBtn = popover.querySelector('.ai-att-popover-copy-btn');

      if (iconEl) iconEl.textContent = att.type === 'directory' ? '📁' : '📄';
      if (headingEl) headingEl.textContent = `${att.name || '附件'} · 实际注入模型上下文`;
      if (statsEl) statsEl.textContent = `共 ${charCount.toLocaleString()} 字符 · 约 ${approxTokens.toLocaleString()} Tokens`;
      if (codeEl) codeEl.textContent = snippet;

      copyBtn.onclick = async (ev) => {
        ev.stopPropagation();
        await copyToClipboard(snippet);
        const textSpan = copyBtn.querySelector('.btn-text');
        if (textSpan) textSpan.textContent = '已复制';
        copyBtn.classList.add('success');
        setTimeout(() => {
          if (textSpan) textSpan.textContent = '复制上下文';
          copyBtn.classList.remove('success');
        }, 1500);
      };

      popover.classList.remove('hidden');

      const rect = anchorEl.getBoundingClientRect();
      const popoverWidth = Math.min(540, window.innerWidth - 32);
      popover.style.width = popoverWidth + 'px';

      const popoverHeight = 320;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      let top;
      if (spaceBelow >= popoverHeight || spaceBelow >= spaceAbove) {
        top = rect.bottom + 6;
      } else {
        top = Math.max(10, rect.top - popoverHeight - 6);
      }

      let left = rect.left;
      if (left + popoverWidth > window.innerWidth - 16) {
        left = window.innerWidth - popoverWidth - 16;
      }
      if (left < 16) left = 16;

      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;
    }

    function scheduleHideContextPopover() {
      if (popoverHideTimer) clearTimeout(popoverHideTimer);
      popoverHideTimer = setTimeout(() => {
        if (contextPopoverEl) {
          contextPopoverEl.classList.add('hidden');
        }
      }, 180);
    }
    const pendingLateChunks = new Map();
    function getLateChunkBuf(sessionId) {
      let b = pendingLateChunks.get(sessionId);
      if (!b) {
        b = { approvals: [], plans: [], terminated: false };
        pendingLateChunks.set(sessionId, b);
      }
      return b;
    }
    // 增量流式渲染槽位：messageId::round -> StreamSlot（dsh delta 快路径）
    const streamSlots = new Map();
    const getStreamSlot = (mdBlock, messageId, round) => {
      const key = `${messageId}::${round}`;
      let slot = streamSlots.get(key);
      // 会话切换重渲后，旧槽位绑定的节点已脱离 DOM——丢弃并重建，避免内容更新到游离节点
      if (slot && slot.host && !slot.host.isConnected) {
        streamSlots.delete(key);
        slot = null;
      }
      if (!slot && StreamRendererLib && mdBlock) {
        slot = new StreamRendererLib.StreamSlot(mdBlock, renderMarkdown);
        slot.scheduleUpdate = StreamRendererLib.rafThrottle(text => slot.update(text));
        slot.key = key;
        streamSlots.set(key, slot);
      }
      return slot;
    };
    const finalizeStreamSlots = (bubble, messageId, { deep = false } = {}) => {
      if (!StreamRendererLib) return;
      const targets = [];
      for (const [key, slot] of streamSlots) {
        if (key.startsWith(`${messageId}::`)) targets.push({ key, slot });
      }
      for (const { key, slot } of targets) {
        const host = slot.finalize();
        if (host) {
          if (MermaidRenderer) MermaidRenderer.initMessageDynamicElements(host, { renderMermaid: false, copyToClipboard });
          if (HljsRenderer) HljsRenderer.highlightContainer(host);
        }
        streamSlots.delete(key);
      }
      if (deep && bubble && HljsRenderer) HljsRenderer.highlightContainer(bubble);
    };

    // dsh Turn 折叠：把已完成的工具轮收拢为摘要行，仅保留最新轮展开
    const collapseCompletedRounds = (timeline, upToRoundExclusive) => {
      if (!timeline) return;
      const wrappedRounds = new Set(
        Array.from(timeline.querySelectorAll('.ai-round-group')).map(g => Number(g.dataset.round))
      );
      for (let r = 0; r < upToRoundExclusive; r++) {
        if (wrappedRounds.has(r)) continue;
        const children = Array.from(timeline.children).filter(el => {
          const dr = el.dataset ? el.dataset.round : undefined;
          return dr !== undefined && Number(dr) === r && !el.classList.contains('ai-round-group');
        });
        if (!children.length) continue;

        const toolCount = children.filter(c => c.classList.contains('ai-tool-card')).length;
        const mdEl = children.find(c => c.classList.contains('ai-md-block'));
        const contentChars = mdEl ? (mdEl.textContent || '').trim().length : 0;
        const hasCot = children.some(c => c.classList.contains('ai-cot-box'));

        const bits = [];
        if (hasCot) bits.push('思考 ✓');
        if (toolCount > 0) bits.push(`工具 ${toolCount} ✓`);
        if (contentChars > 0) bits.push(`内容 ${contentChars} 字`);
        const label = bits.length ? bits.join(' · ') : '已完成';

        const group = document.createElement('details');
        group.className = 'ai-round-group';
        group.dataset.round = String(r);
        group.open = false;
        group.innerHTML = `<summary class="ai-round-group-summary"><span>第 ${r + 1} 轮 · ${label}</span><span class="ai-round-group-caret">▸</span></summary>`;
        // 先在首个子元素原位置占位，再搬移子元素，保持轮次顺序不变
        const firstHost = children[0];
        if (firstHost) timeline.insertBefore(group, firstHost);
        else timeline.appendChild(group);
        for (const child of children) group.appendChild(child);
        for (const child of children) {
          if (child.classList.contains('ai-cot-box')) child.open = false;
        }
      }
    };

    const markRoundUpTo = (timeline, round) => {
      // 新一轮开始时折叠此前所有轮
      const maxWrapped = Number(round) || 0;
      collapseCompletedRounds(timeline, maxWrapped);
    };

    // dsh Turn 页脚：模型（含降级链）、轮数、耗时、Token 与压缩标记
    const formatDuration = (ms) => {
      if (!ms || ms < 0) return '';
      if (ms < 1000) return `${ms}ms`;
      if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
      const m = Math.floor(ms / 60000);
      const s = Math.round((ms % 60000) / 1000);
      return `${m}m${s}s`;
    };
    const renderTurnFooter = (bubble, msg) => {
      if (!bubble || !msg) return;
      let footer = bubble.querySelector('.ai-turn-footer');
      const parts = [];
      const model = msg.model || '';
      if (model) {
        if (msg.fallbackFrom) parts.push(`🤖 ${msg.fallbackFrom} → ${model} (降级)`);
        else parts.push(`🤖 ${model}`);
      }
      if (Number.isFinite(msg.rounds) && msg.rounds > 0) parts.push(`${msg.rounds} 轮`);
      const dur = formatDuration(msg.endedAt ? msg.endedAt - (msg.timestamp || msg.endedAt) : null);
      if (dur) parts.push(`⏱ ${dur}`);
      if (msg.usage && msg.usage.totalTokens) {
        const tok = msg.usage.totalTokens >= 1000 ? `${(msg.usage.totalTokens / 1000).toFixed(1)}k tok` : `${msg.usage.totalTokens} tok`;
        const cached = msg.usage.cachedTokens ? ` (缓存 ${(msg.usage.cachedTokens / 1000).toFixed(1)}k)` : '';
        parts.push(`📊 ${tok}${cached}`);
      }
      if (msg.compactedDuringTurn) parts.push('🗜️ 已压缩');
      if (!parts.length) { if (footer) footer.remove(); return; }
      if (!footer) {
        footer = document.createElement('div');
        footer.className = 'ai-turn-footer';
        const tl = bubble.querySelector('.ai-bubble-timeline');
        if (tl) tl.insertAdjacentElement('afterend', footer);
        else bubble.appendChild(footer);
      }
      footer.textContent = parts.join(' · ');
    };
    function createCompactionCardElement(msg) {
      const card = document.createElement('div');
      card.className = 'ai-compaction-card';
      card.dataset.id = msg.id;

      const count = msg.compactedCount || (msg.compactedRange ? msg.compactedRange.count : null) || '若干';
      const timeStr = new Date(msg.timestamp || Date.now()).toLocaleTimeString();

      card.innerHTML = `
        <div class="ai-compaction-card-divider">
          <div class="ai-compaction-line"></div>
          <div class="ai-compaction-badge-pill">
            <span class="ai-compaction-badge-icon">🗜️</span>
            <span class="ai-compaction-badge-title">历史上下文已提炼 (上方 ${count} 条对话已折叠)</span>
          </div>
          <div class="ai-compaction-line"></div>
        </div>
        <div class="ai-compaction-card-container">
          <div class="ai-compaction-card-header">
            <div class="ai-compaction-summary-label">
              <span>📋</span> <span>上下文压缩摘要</span>
            </div>
            <div class="ai-compaction-actions">
              <button type="button" class="ai-compaction-btn btn-toggle-summary" title="展开/收起摘要详情">
                <span class="toggle-icon">▼</span> <span class="toggle-text">收起摘要</span>
              </button>
              <button type="button" class="ai-compaction-btn btn-copy-summary" title="复制摘要文本">
                <span>📋</span> <span>复制</span>
              </button>
              <button type="button" class="ai-compaction-btn btn-del-summary" title="移除此检查点卡片">
                <span>🗑️</span>
              </button>
              <span class="ai-compaction-time">${timeStr}</span>
            </div>
          </div>
          <div class="ai-compaction-card-tip">
            💡 提示：此分割线以上的历史对话已对大模型进行高密度折叠，后续推理基于此摘要进行，不再占用 Token 窗口。您仍可随时向上翻看与检索完整的原始对话及附件。
          </div>
          <div class="ai-compaction-card-body">
            <div class="ai-compaction-summary-content markdown-body"></div>
          </div>
        </div>
      `;

      const summaryContentEl = card.querySelector('.ai-compaction-summary-content');
      if (summaryContentEl && msg.content) {
        summaryContentEl.innerHTML = renderMarkdown(msg.content);
        try {
          if (typeof MermaidRenderer !== 'undefined' && MermaidRenderer.initMessageDynamicElements) {
            MermaidRenderer.initMessageDynamicElements(summaryContentEl, { renderMermaid: true, copyToClipboard });
          }
        } catch {}
      }

      const toggleBtn = card.querySelector('.btn-toggle-summary');
      const bodyEl = card.querySelector('.ai-compaction-card-body');
      if (toggleBtn && bodyEl) {
        let isExpanded = true;
        toggleBtn.addEventListener('click', () => {
          isExpanded = !isExpanded;
          bodyEl.style.display = isExpanded ? 'block' : 'none';
          toggleBtn.querySelector('.toggle-icon').textContent = isExpanded ? '▼' : '▶';
          toggleBtn.querySelector('.toggle-text').textContent = isExpanded ? '收起摘要' : '展开摘要';
        });
      }

      const copyBtn = card.querySelector('.btn-copy-summary');
      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          await copyToClipboard(msg.content || '');
          const origHtml = copyBtn.innerHTML;
          copyBtn.innerHTML = '<span>✓</span> <span>已复制</span>';
          setTimeout(() => { copyBtn.innerHTML = origHtml; }, 1500);
        });
      }

      const delBtn = card.querySelector('.btn-del-summary');
      if (delBtn) {
        delBtn.addEventListener('click', async () => {
          if (!state.currentSession) return;
          const idx = state.currentSession.messages.findIndex(m => m.id === msg.id);
          if (idx !== -1) {
            state.currentSession.messages.splice(idx, 1);
            renderMessages();
            await ctx.call('deleteMessage', { sessionId: state.currentSession.id, messageId: msg.id });
          }
        });
      }

      return card;
    }

    function createMessageElement(msg) {
      if (msg.role === 'compaction_divider' || msg.type === 'compaction_checkpoint') {
        return createCompactionCardElement(msg);
      }
      const isUser = msg.role === 'user';
      const isShadowed = !!msg.isShadowed;
      const msgEl = document.createElement('div');
      msgEl.className = `ai-msg ${isUser ? 'user' : 'assistant'}${isShadowed ? ' is-shadowed' : ''}`;
      msgEl.dataset.id = msg.id;

      const bubble = document.createElement('div');
      bubble.className = 'ai-msg-bubble';

      const toolbar = document.createElement('div');
      toolbar.className = 'ai-msg-toolbar';

      const timeStr = new Date(msg.timestamp || Date.now()).toLocaleTimeString();

      if (isUser) {
        bubble.innerHTML = '';
        if (Array.isArray(msg.images) && msg.images.length > 0) {
          const imgsWrap = document.createElement('div');
          imgsWrap.className = 'ai-msg-images';
          msg.images.forEach((img, idx) => {
            const url = typeof img === 'string' ? img : (img && img.url ? img.url : '');
            if (!url) return;
            const thumb = document.createElement('div');
            thumb.className = 'ai-msg-image-thumb';
            thumb.innerHTML = `<img src="${escapeHtml(url)}" alt="图片 ${idx + 1}" /><span class="ai-msg-image-zoom">🔍</span>`;
            thumb.addEventListener('click', () => openLightbox(url, (img && img.name) || `图片 ${idx + 1}`));
            imgsWrap.appendChild(thumb);
          });
          bubble.appendChild(imgsWrap);
        }

        const parsed = parseDisplayMessage(msg);
        const nonImgs = (Array.isArray(msg.attachments) && msg.attachments.length > 0)
          ? msg.attachments.filter(a => a.type === 'file' || a.type === 'directory' || (!a.type && a.content !== undefined))
          : parsed.legacyAttachments;

        if (nonImgs.length > 0) {
          const cardsWrap = document.createElement('div');
          cardsWrap.className = 'ai-msg-att-cards';
          nonImgs.forEach(att => {
            const isDir = att.type === 'directory' || att.isDirectory;
            const ext = isDir ? 'DIR' : ((att.name || '').split('.').pop() || 'FILE').slice(0, 4).toUpperCase();
            const szStr = !isDir ? formatFileSize(att.size || (att.content ? new Blob([att.content]).size : 0)) : '';
            const lineCount = (att.content && typeof att.content === 'string') ? `${att.content.split('\n').length} 行` : '';

            const card = document.createElement('div');
            card.className = `ai-msg-att-card ${isDir ? 'directory' : 'file'}`;
            card.title = `${att.path || att.name}\n(鼠标悬浮查看实际注入大模型的上下文)`;

            card.innerHTML = `
              <div class="ai-att-card-icon ${isDir ? 'dir' : 'file'}">
                ${isDir ? '📁' : `<span class="ai-att-ext">${escapeHtml(ext)}</span>`}
              </div>
              <div class="ai-att-card-main">
                <div class="ai-att-card-name" title="${escapeHtml(att.path || att.name)}">${escapeHtml(att.name || att.path)}</div>
                <div class="ai-att-card-sub">
                  ${isDir ? '<span class="ai-att-card-tag">本地关联目录</span>' : ''}
                  ${szStr ? `<span>${escapeHtml(szStr)}</span>` : ''}
                  ${lineCount ? `<span>· ${escapeHtml(lineCount)}</span>` : ''}
                </div>
              </div>
              <div class="ai-att-card-badge" title="鼠标悬浮查看实际注入大模型的上下文内容">
                <span>👁️ 上下文</span>
              </div>
            `;

            card.addEventListener('mouseenter', () => showContextPopover(card, att));
            card.addEventListener('mouseleave', () => scheduleHideContextPopover());

            cardsWrap.appendChild(card);
          });
          bubble.appendChild(cardsWrap);
        }

        const displayText = parsed.text;
        if (displayText) {
          const textEl = document.createElement('div');
          textEl.className = 'ai-msg-text';
          textEl.textContent = displayText;
          bubble.appendChild(textEl);
        }

        toolbar.innerHTML = `
          <button type="button" class="ai-msg-tool-btn btn-tool-edit" title="编辑消息内容">
            <span>✏️</span> <span>编辑</span>
          </button>
          <button type="button" class="ai-msg-tool-btn btn-tool-resend" title="重新发送并生成回复">
            <span>🔄</span> <span>重发</span>
          </button>
          <button type="button" class="ai-msg-tool-btn btn-tool-copy" title="复制消息文本">
            <span>📋</span> <span>复制</span>
          </button>
          <button type="button" class="ai-msg-tool-btn btn-tool-del" title="删除此消息">
            <span>🗑️</span> <span>删除</span>
          </button>
          ${msg.steered ? `<span class="ai-steer-tag${msg.steerState === 'consumed' ? ' ok' : (msg.steerState === 'deferred' ? ' deferred' : '')}" title="运行中插话：在下一工具轮边界注入模型上下文">${msg.steerState === 'consumed' ? '🧭 已生效 ✓' : (msg.steerState === 'deferred' ? '🧭 本轮未消费 · 已入历史' : '🧭 已插话')}</span>` : ''}
          ${isShadowed ? '<span class="ai-msg-shadowed-tag" title="此消息已被模型上下文折叠，但在历史中完整保留供随时查看">📜 历史归档</span>' : ''}
          <span class="ai-msg-meta">${timeStr}</span>
        `;
      } else {
        if (msg.fallbackFrom) {
          const fbBadge = document.createElement('div');
          fbBadge.className = 'ai-msg-fallback-badge';
          fbBadge.textContent = `⚠️ 主模型 [${msg.fallbackFrom}] 异常，已自动降级至备用模型`;
          bubble.appendChild(fbBadge);
        }

        if (msg.isCompacted) {
          const compactBadge = document.createElement('div');
          compactBadge.className = 'ai-compact-badge';
          compactBadge.innerHTML = '<span>🗜️</span> <span>历史上下文压缩检查点</span>';
          bubble.appendChild(compactBadge);
        }

        const formatToolResultForDisplay = (res) => {
          if (res === null || res === undefined) return '(无执行结果)';
          if (typeof res === 'string') return res;
          if (typeof res === 'object') {
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

        const timeline = document.createElement('div');
        timeline.className = 'ai-bubble-timeline';
        bubble.appendChild(timeline);

        const renderSingleToolBadge = (tc, explicitResult, container = timeline) => {
          const statusMap = msg.toolStatus || {};
          const st = statusMap[tc.id];

          let result = explicitResult !== undefined ? explicitResult : (msg.toolResults ? msg.toolResults[tc.id] : undefined);
          if (result === undefined && tc.result !== undefined) result = tc.result;
          if (result === undefined && state.currentSession && state.currentSession.messages) {
            const tm = state.currentSession.messages.find(m => m.role === 'tool' && m.tool_call_id === tc.id);
            if (tm) result = tm.content;
          }

          const toolBadge = ToolCards
            ? ToolCards.createToolCard(tc, { phase: st === 'denied' ? 'denied' : 'done', result })
            : (() => {
                const d = document.createElement('div');
                d.className = 'ai-tool-badge';
                d.dataset.tool = tc.id;
                d.innerHTML = `<div class="ai-tool-badge-head"><div class="ai-tool-badge-title"><span>🛠️ 工具调用:</span> <strong>${escapeHtml(tc.function.name)}</strong></div></div>`;
                return d;
              })();
          (container || timeline || bubble).appendChild(toolBadge);
        };

        const renderSingleCotBox = (text, roundIdx = 0, totalSteps = 1, container = timeline) => {
          if (!text || !text.trim()) return;
          const cotBox = document.createElement('details');
          cotBox.className = 'ai-cot-box';
          cotBox.dataset.round = String(roundIdx);
          cotBox.open = false;
          const title = totalSteps <= 1 ? '🧠 思考过程' : (roundIdx === 0 ? '🧠 思考过程' : `🧠 进一步思考 (第 ${roundIdx + 1} 步)`);
          cotBox.innerHTML = `
            <summary class="ai-cot-summary">
              <span>${title}</span>
            </summary>
            <div class="ai-cot-body">${escapeHtml(text)}</div>
          `;
          (container || timeline || bubble).appendChild(cotBox);
        };

        const renderSingleMdBlock = (text, roundIdx = 0, container = timeline) => {
          if (!text || !text.trim()) return;
          const mdBlock = document.createElement('div');
          mdBlock.className = 'ai-md-block ai-md-body';
          mdBlock.dataset.round = String(roundIdx);
          mdBlock.innerHTML = renderMarkdown(text);
          (container || timeline || bubble).appendChild(mdBlock);
        };

        const hasStepData = (Array.isArray(msg.reasoningSteps) && msg.reasoningSteps.length > 0) ||
                            (Array.isArray(msg.contentSteps) && msg.contentSteps.length > 0);

        if (hasStepData) {
          const allTools = Array.isArray(msg.toolCalls) ? [...msg.toolCalls] : [];
          const renderedToolIds = new Set();
          const rSteps = Array.isArray(msg.reasoningSteps) ? msg.reasoningSteps : [];
          const cSteps = Array.isArray(msg.contentSteps) ? msg.contentSteps : [];

          const rounds = Array.from(new Set([
            ...rSteps.map(s => s.round),
            ...cSteps.map(s => s.round),
            ...allTools.map(t => (t.round !== undefined ? t.round : 0))
          ])).sort((a, b) => a - b);

          let renderedAnyContent = false;
          rounds.forEach(r => {
            const stepCot = rSteps.find(s => s.round === r);
            if (stepCot && stepCot.reasoning) {
              renderSingleCotBox(stepCot.reasoning, r, rSteps.length, timeline);
            }
            const stepContent = cSteps.find(s => s.round === r);
            if (stepContent && stepContent.content && stepContent.content.trim()) {
              renderSingleMdBlock(stepContent.content, r, timeline);
              renderedAnyContent = true;
            }
            const stepTools = allTools.filter(t => (t.round === r || (t.round === undefined && r === 0)) && !renderedToolIds.has(t.id));
            stepTools.forEach(tc => {
              renderSingleToolBadge(tc, undefined, timeline);
              renderedToolIds.add(tc.id);
            });
          });
          allTools.filter(t => !renderedToolIds.has(t.id)).forEach(tc => renderSingleToolBadge(tc, undefined, timeline));

          if (!renderedAnyContent && msg.content && msg.content.trim()) {
            renderSingleMdBlock(msg.content, rounds.length, timeline);
          }
        } else {
          if (msg.reasoning) renderSingleCotBox(msg.reasoning, 0, 1, timeline);
          if (Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
            msg.toolCalls.forEach(tc => renderSingleToolBadge(tc, undefined, timeline));
          }
          if (msg.content && msg.content.trim()) {
            renderSingleMdBlock(msg.content, 0, timeline);
          }
        }

        let usageText = '';
        if (msg.usage) {
          const cachedText = (msg.usage && msg.usage.cachedTokens) ? ` (命中缓存 ${msg.usage.cachedTokens.toLocaleString()})` : '';
          usageText = `Prompt: ${msg.usage.promptTokens}${cachedText} · Output: ${msg.usage.completionTokens} · Total: ${msg.usage.totalTokens}`;
        }

        toolbar.innerHTML = `
          <button type="button" class="ai-msg-tool-btn btn-tool-copy" title="复制完整回答文本">
            <span>📋</span> <span>复制回答</span>
          </button>
          <button type="button" class="ai-msg-tool-btn btn-tool-regen" title="重新生成回复">
            <span>🔄</span> <span>重新生成</span>
          </button>
          <button type="button" class="ai-msg-tool-btn btn-tool-del" title="删除此消息">
            <span>🗑️</span> <span>删除</span>
          </button>
          ${isShadowed ? '<span class="ai-msg-shadowed-tag" title="此消息已被模型上下文折叠，但在历史中完整保留供随时查看">📜 历史归档</span>' : ''}
          <span class="ai-msg-meta ai-msg-usage">${usageText}</span>
          <span class="ai-msg-meta ai-msg-time">${timeStr}</span>
        `;
      }

      msgEl.appendChild(bubble);
      msgEl.appendChild(toolbar);

      // Event listeners for message toolbar
      const btnCopy = toolbar.querySelector('.btn-tool-copy');
      if (btnCopy) {
        btnCopy.addEventListener('click', async () => {
          const curMsg = (state.currentSession && state.currentSession.messages)
            ? (state.currentSession.messages.find(m => m.id === msg.id) || msg)
            : msg;
          const parsed = parseDisplayMessage(curMsg);
          const textToCopy = parsed.text || curMsg.content || '';
          await copyToClipboard(textToCopy);
          const origHtml = btnCopy.innerHTML;
          btnCopy.innerHTML = '<span>✓</span> <span>已复制</span>';
          btnCopy.classList.add('success');
          setTimeout(() => {
            btnCopy.innerHTML = origHtml;
            btnCopy.classList.remove('success');
          }, 1500);
        });
      }

      const btnDel = toolbar.querySelector('.btn-tool-del');
      if (btnDel) {
        btnDel.addEventListener('click', async () => {
          if (state.isGenerating && state.currentSession && state.generatingSessionId === state.currentSession.id) {
            alert('正在生成中…');
            return;
          }
          const res = await ctx.call('deleteMessage', { sessionId: state.currentSession.id, messageId: msg.id });
          if (res && res.ok) {
            state.currentSession = res.session;
            renderMessages();
            renderSessionsList();
            updateHeader();
          }
        });
      }

      const btnEdit = toolbar.querySelector('.btn-tool-edit');
      if (btnEdit) {
        btnEdit.addEventListener('click', () => {
          const parsed = parseDisplayMessage(msg);
          bubble.innerHTML = `
            <div class="ai-edit-box">
              <textarea class="ai-edit-textarea">${escapeHtml(parsed.text)}</textarea>
              <div class="ai-edit-actions">
                <button class="ai-edit-btn cancel">取消</button>
                <button class="ai-edit-btn primary save">保存并重新生成</button>
              </div>
            </div>
          `;
          const ta = bubble.querySelector('.ai-edit-textarea');
          ta.focus();
          bubble.querySelector('.cancel').addEventListener('click', () => renderMessages());
          bubble.querySelector('.save').addEventListener('click', () => {
            const val = ta.value.trim();
            const atts = (msg.attachments && msg.attachments.length > 0) ? msg.attachments : (parsed.legacyAttachments.length > 0 ? parsed.legacyAttachments : undefined);
            if (val || (atts && atts.length > 0)) {
              sendMessage(val, msg.id, atts || msg.images);
            }
          });
        });
      }

      const btnResend = toolbar.querySelector('.btn-tool-resend');
      if (btnResend) {
        btnResend.addEventListener('click', () => {
          const parsed = parseDisplayMessage(msg);
          const atts = (msg.attachments && msg.attachments.length > 0) ? msg.attachments : (parsed.legacyAttachments.length > 0 ? parsed.legacyAttachments : undefined);
          sendMessage(parsed.text, msg.id, atts || msg.images);
        });
      }

      const btnRegen = toolbar.querySelector('.btn-tool-regen');
      if (btnRegen) {
        btnRegen.addEventListener('click', () => {
          const idx = state.currentSession.messages.findIndex(m => m.id === msg.id);
          if (idx > 0) {
            const prevUserMsg = state.currentSession.messages[idx - 1];
            if (prevUserMsg && prevUserMsg.role === 'user') {
              const parsed = parseDisplayMessage(prevUserMsg);
              const atts = (prevUserMsg.attachments && prevUserMsg.attachments.length > 0) ? prevUserMsg.attachments : (parsed.legacyAttachments.length > 0 ? parsed.legacyAttachments : undefined);
              sendMessage(parsed.text, prevUserMsg.id, atts || prevUserMsg.images);
            }
          }
        });
      }

      if (MermaidRenderer) {
        MermaidRenderer.initMessageDynamicElements(bubble, { renderMermaid: true, copyToClipboard });
      }
      if (HljsRenderer) {
        HljsRenderer.highlightContainer(bubble);
      }
      // 历史态：多轮工具回合折叠为摘要行（保留最后一轮正文展开）+ Turn 页脚
      const histTimeline = bubble.querySelector('.ai-bubble-timeline');
      if (histTimeline) {
        const histRoundNums = Array.from(histTimeline.children)
          .map(el => (el.dataset ? Number(el.dataset.round) : NaN))
          .filter(n => !Number.isNaN(n));
        if (histRoundNums.length) {
          const histMax = Math.max(...histRoundNums);
          const toolRounds = Array.from(histTimeline.children)
            .filter(el => el.classList && el.classList.contains('ai-tool-card'))
            .map(el => Number(el.dataset.round) || 0);
          if (toolRounds.length) collapseCompletedRounds(histTimeline, histMax);
        }
      }
      renderTurnFooter(bubble, msg);
      bubble.querySelectorAll('img:not(.ai-attachment-thumb)').forEach(img => {
        img.style.cursor = 'zoom-in';
        img.addEventListener('click', () => {
          openLightbox(img.src, img.alt || '查看图片');
        });
      });

      return msgEl;
    }

    return {
      formatFileSize, formatAttachmentContextSnippet, parseDisplayMessage,
      ensureContextPopover, showContextPopover, scheduleHideContextPopover,
      getLateChunkBuf,
      peekLateChunkBuf: sessionId => pendingLateChunks.get(sessionId),
      deleteLateChunkBuf: sessionId => pendingLateChunks.delete(sessionId),
      getStreamSlot, finalizeStreamSlots, collapseCompletedRounds, markRoundUpTo,
      formatDuration, renderTurnFooter,
      createMessageElement, createCompactionCardElement
    };
  }

  const exportsObj = { createMessageRenderer };
  if (typeof window !== 'undefined') {
    window.AiChatMessageRenderer = exportsObj;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})();
