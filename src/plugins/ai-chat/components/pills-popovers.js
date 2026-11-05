/* AI Chat - Input pills & quick-picker popovers (extracted from panel.js):
   CoT/Agent pills, agent-mode & think-level popovers, persona quick picker,
   model quick picker (preset channels + remote search).
   Dual CommonJS / Browser export; mutable config/session state is shared with
   panel.js through the `state` getter/setter bag. */
(() => {
  function createPillsPopovers(deps) {
    const {
      state,
      ctx,
      escapeHtml,
      closeAllPopovers, updateHeader, settingsCtrl,
      btnOpenSettings,
      pillCot, pillAgent,
      btnAgentMode, agentModeIcon, agentModeLabel, agentModePopover, agentAlwaysRow,
      btnThinkLevel, thinkLevelPopover, thinkLevelLabel,
      btnTogglePersonaPicker, personaPopover, currentPersonaTitle, currentPersonaIcon,
      inputPopoverPersonaSearch, btnClearPopoverPersonaSearch,
      popoverPersonaList, btnPopoverPrevPage, btnPopoverNextPage, popoverPageText,
      btnToggleModelPicker, modelPopover, modelPopoverList,
      inputModelQuickSearch, btnClearModelQuickSearch, btnModelPopoverOpenSettings,
      headerModelPill
    } = deps;
    if (!pillCot) return null;

    // 分页/搜索状态随工厂实例（重挂载清零）
    let popoverPersonaSearch = '';
    let popoverCurrentPage = 1;
    const popoverPageSize = 6;
    // modelQuickSearchText 由迁移块内的声明提供

    // CoT & Agent Pills
    pillCot.addEventListener('click', () => {
      pillCot.classList.toggle('active');
      syncThinkLevelPill();
    });
    pillAgent.addEventListener('click', () => {
      pillAgent.classList.toggle('active');
    });

    const AGENT_MODES = {
      ask: { icon: '🔐', label: '每次确认', cls: 'ask' },
      auto: { icon: '📝', label: '自动审核', cls: 'auto' },
      full: { icon: '🚀', label: '完全访问', cls: 'full' }
    };
    const THINK_LEVEL_LABELS = {
      auto: '思考·跟随默认',
      low: '思考·低',
      medium: '思考·中',
      high: '思考·高'
    };

    function updateAgentModeUI() {
      const m = AGENT_MODES[state.agentMode] || AGENT_MODES.ask;
      agentModeIcon.textContent = m.icon;
      agentModeLabel.textContent = m.label;
      btnAgentMode.className = `ai-pill-btn mode ${m.cls}`;
      agentModePopover.querySelectorAll('.ai-ctrl-opt').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.mode === state.agentMode);
      });
    }

    function updateThinkLevelUI() {
      thinkLevelLabel.textContent = THINK_LEVEL_LABELS[state.thinkLevel] || THINK_LEVEL_LABELS.auto;
      thinkLevelPopover.querySelectorAll('.ai-ctrl-opt').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.level === state.thinkLevel);
      });
      syncThinkLevelPill();
    }

    function syncThinkLevelPill() {
      const cotOn = pillCot.classList.contains('active');
      btnThinkLevel.classList.toggle('dimmed', !cotOn);
      btnThinkLevel.title = cotOn
        ? '思维等级：控制推理模型的思考深度'
        : '当前不生效：开启「深度思考」后思维等级才会应用';
    }

    function renderAlwaysAllowRow() {
      const list = (state.currentSession && state.currentSession.alwaysAllowTools) || [];
      if (!list.length) {
        agentAlwaysRow.classList.add('hidden');
        agentAlwaysRow.innerHTML = '';
        return;
      }
      agentAlwaysRow.classList.remove('hidden');
      agentAlwaysRow.innerHTML = `
        <span class="ai-ctrl-always-txt">本会话免确认：${list.map(t => escapeHtml(t)).join('、')}</span>
        <button type="button" class="ai-ctrl-reset-link">重置授权</button>
      `;
      agentAlwaysRow.querySelector('.ai-ctrl-reset-link').addEventListener('click', async () => {
        if (!state.currentSession) return;
        const res = await ctx.call('resetSessionApprovals', { sessionId: state.currentSession.id });
        if (res && res.ok) {
          state.currentSession.alwaysAllowTools = [];
          renderAlwaysAllowRow();
        }
      });
    }

    function closeCtrlPopovers() {
      agentModePopover.classList.add('hidden');
      thinkLevelPopover.classList.add('hidden');
    }

    btnAgentMode.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = agentModePopover.classList.contains('hidden');
      closeAllPopovers();
      if (willOpen) {
        renderAlwaysAllowRow();
        agentModePopover.classList.remove('hidden');
      }
    });

    btnThinkLevel.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = thinkLevelPopover.classList.contains('hidden');
      closeAllPopovers();
      if (willOpen) thinkLevelPopover.classList.remove('hidden');
    });

    agentModePopover.querySelectorAll('.ai-ctrl-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        state.agentMode = opt.dataset.mode;
        updateAgentModeUI();
        closeCtrlPopovers();
        ctx.call('saveConfig', { agentApprovalMode: state.agentMode });
      });
    });

    thinkLevelPopover.querySelectorAll('.ai-ctrl-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        state.thinkLevel = opt.dataset.level;
        updateThinkLevelUI();
        closeCtrlPopovers();
        ctx.call('saveConfig', { thinkingLevel: state.thinkLevel });
      });
    });

    // Persona Selector Popover
    function updateActivePersonaPill() {
      const activePersonaId = (state.currentSession && state.currentSession.personaId) || 'general';
      const p = state.personas.find(x => x.id === activePersonaId) || state.personas[0];
      if (p) {
        currentPersonaIcon.textContent = p.icon || '✨';
        currentPersonaTitle.textContent = p.title;
      }
    }

    function renderPopoverPersonas() {
      const q = popoverPersonaSearch.trim().toLowerCase();
      btnClearPopoverPersonaSearch.classList.toggle('hidden', !q);

      const filtered = q
        ? state.personas.filter(p => (p.title || '').toLowerCase().includes(q) || (p.prompt || '').toLowerCase().includes(q))
        : state.personas;

      const totalPages = Math.max(1, Math.ceil(filtered.length / popoverPageSize));
      if (popoverCurrentPage > totalPages) popoverCurrentPage = totalPages;
      if (popoverCurrentPage < 1) popoverCurrentPage = 1;

      popoverPageText.textContent = `${popoverCurrentPage} / ${totalPages}`;
      btnPopoverPrevPage.disabled = popoverCurrentPage <= 1;
      btnPopoverNextPage.disabled = popoverCurrentPage >= totalPages;

      const start = (popoverCurrentPage - 1) * popoverPageSize;
      const pageItems = filtered.slice(start, start + popoverPageSize);

      popoverPersonaList.innerHTML = '';
      if (pageItems.length === 0) {
        const empty = document.createElement('div');
        empty.style.padding = '12px 8px';
        empty.style.textAlign = 'center';
        empty.style.fontSize = '11.5px';
        empty.style.color = 'var(--ink-faint)';
        empty.textContent = q ? `未搜到包含 "${q}" 的人设` : '暂无人设';
        popoverPersonaList.appendChild(empty);
        return;
      }

      const activeId = (state.currentSession && state.currentSession.personaId) || 'general';
      pageItems.forEach(p => {
        const item = document.createElement('div');
        item.className = 'ai-popover-persona-item' + (p.id === activeId ? ' selected' : '');
        item.innerHTML = `
          <span class="ai-popover-persona-icon">${escapeHtml(p.icon || '✨')}</span>
          <div class="ai-popover-persona-content">
            <span class="ai-popover-persona-title">${escapeHtml(p.title)} <span style="font-weight:normal;opacity:0.6;font-size:10px;">(T: ${escapeHtml(p.temperature ?? 0.7)})</span></span>
            <span class="ai-popover-persona-desc">${escapeHtml(p.prompt || '')}</span>
          </div>
        `;
        item.addEventListener('click', async () => {
          if (!state.currentSession) return;
          personaPopover.classList.add('hidden');
          try {
            const res = await ctx.call('set_session_persona', { sessionId: state.currentSession.id, personaId: p.id });
            if (res && res.ok) {
              if (res.activeSession) state.currentSession = res.activeSession;
              updateActivePersonaPill();
            } else {
              alert(`切换人设失败: ${(res && res.error) || '未知错误'}`);
            }
          } catch (err) {
            alert(`切换人设失败: ${(err && err.message) || err}`);
          }
        });
        popoverPersonaList.appendChild(item);
      });
    }

    btnTogglePersonaPicker.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!state.currentSession) return;
      const willOpen = personaPopover.classList.contains('hidden');
      closeAllPopovers();
      if (willOpen) {
        popoverPersonaSearch = '';
        inputPopoverPersonaSearch.value = '';
        popoverCurrentPage = 1;
        renderPopoverPersonas();
        inputPopoverPersonaSearch.focus();
        personaPopover.classList.remove('hidden');
      }
    });

    inputPopoverPersonaSearch.addEventListener('input', () => {
      popoverPersonaSearch = inputPopoverPersonaSearch.value;
      popoverCurrentPage = 1;
      renderPopoverPersonas();
    });

    btnClearPopoverPersonaSearch.addEventListener('click', () => {
      popoverPersonaSearch = '';
      inputPopoverPersonaSearch.value = '';
      popoverCurrentPage = 1;
      renderPopoverPersonas();
      inputPopoverPersonaSearch.focus();
    });

    btnPopoverPrevPage.addEventListener('click', () => {
      if (popoverCurrentPage > 1) {
        popoverCurrentPage--;
        renderPopoverPersonas();
      }
    });

    btnPopoverNextPage.addEventListener('click', () => {
      popoverCurrentPage++;
      renderPopoverPersonas();
    });

    function renderPersonas() {
      updateActivePersonaPill();
      renderPopoverPersonas();
    }

    /* --- Model Quick Picker Controller ---------------------------------- */
    let modelQuickSearchText = '';

    function getPresetChannels() {
      if (typeof window !== 'undefined' && window.AiChatMarkdown && Array.isArray(window.AiChatMarkdown.PRESET_CHANNELS)) {
        return window.AiChatMarkdown.PRESET_CHANNELS;
      }
      try {
        const md = require('./lib/markdown-renderer');
        return md.PRESET_CHANNELS || [];
      } catch {}
      return [];
    }

    function renderModelPopoverList() {
      if (!modelPopoverList) return;
      modelPopoverList.innerHTML = '';
      const presetChannels = getPresetChannels();
      const currChannelId = (state.config && state.config.channel) || 'openai';
      const currModel = ((state.config && state.config.model) || 'gpt-4o-mini').trim();
      const currentChannel = presetChannels.find(ch => ch.id === currChannelId);

      const q = modelQuickSearchText.trim().toLowerCase();
      if (btnClearModelQuickSearch) {
        btnClearModelQuickSearch.classList.toggle('hidden', !q);
      }

      // 汇总候选列表
      // 1. 当前渠道推荐模型
      const currChannelModels = (currentChannel && currentChannel.models) ? currentChannel.models : [];
      // 2. 其它渠道预设模型（带渠道标志）
      const otherChannelModels = [];
      presetChannels.forEach(ch => {
        if (ch.id === currChannelId) return;
        (ch.models || []).forEach(m => {
          if (!currChannelModels.includes(m) && !otherChannelModels.some(x => x.model === m)) {
            otherChannelModels.push({ model: m, channelName: ch.name.split(' ')[0], icon: ch.icon || '🤖' });
          }
        });
      });

      const matchedCurr = currChannelModels.filter(m => !q || m.toLowerCase().includes(q));
      const matchedOther = otherChannelModels.filter(item => !q || item.model.toLowerCase().includes(q) || item.channelName.toLowerCase().includes(q));

      const totalMatched = matchedCurr.length + matchedOther.length;

      // 如果当前使用的模型既不在当前渠道也不在其他渠道，置顶显示
      if (currModel && !currChannelModels.includes(currModel) && !otherChannelModels.some(x => x.model === currModel)) {
        if (!q || currModel.toLowerCase().includes(q)) {
          const groupTitle = document.createElement('div');
          groupTitle.className = 'ai-model-popover-group-title';
          groupTitle.textContent = '当前自定义模型';
          modelPopoverList.appendChild(groupTitle);

          appendModelItem(currModel, '当前', '✨', true);
        }
      }

      // 渲染当前渠道模型
      if (matchedCurr.length > 0) {
        const groupTitle = document.createElement('div');
        groupTitle.className = 'ai-model-popover-group-title';
        groupTitle.textContent = currentChannel ? `${currentChannel.name.split(' ')[0]} 推荐` : '当前通道推荐';
        modelPopoverList.appendChild(groupTitle);

        matchedCurr.forEach(m => {
          appendModelItem(m, currentChannel ? currentChannel.name.split(' ')[0] : '推荐', (currentChannel && currentChannel.icon) || '⚡', m === currModel);
        });
      }

      // 渲染常用/其它渠道模型
      if (matchedOther.length > 0) {
        const groupTitle = document.createElement('div');
        groupTitle.className = 'ai-model-popover-group-title';
        groupTitle.textContent = '其它预设模型';
        modelPopoverList.appendChild(groupTitle);

        matchedOther.forEach(item => {
          appendModelItem(item.model, item.channelName, item.icon, item.model === currModel);
        });
      }

      // 如果有搜索词且当前搜索词不在已知模型中，提供一键使用自定义模型
      if (q && !currChannelModels.some(m => m.toLowerCase() === q) && !otherChannelModels.some(x => x.model.toLowerCase() === q) && currModel.toLowerCase() !== q) {
        const customOpt = document.createElement('div');
        customOpt.className = 'ai-model-popover-custom-opt';
        customOpt.innerHTML = `<span>➕</span> <span>使用模型 <b>"${escapeHtml(modelQuickSearchText.trim())}"</b></span>`;
        customOpt.addEventListener('click', () => {
          applyQuickModel(modelQuickSearchText.trim());
        });
        modelPopoverList.appendChild(customOpt);
      } else if (totalMatched === 0 && !q) {
        const empty = document.createElement('div');
        empty.className = 'ai-model-empty-tip';
        empty.style.padding = '12px';
        empty.style.textAlign = 'center';
        empty.style.color = 'var(--ink-faint)';
        empty.style.fontSize = '12px';
        empty.textContent = '暂无预设模型，可直接在上方输入模型名称';
        modelPopoverList.appendChild(empty);
      }

      function appendModelItem(modelName, badgeText, icon, isActive) {
        const item = document.createElement('div');
        item.className = 'ai-model-popover-item' + (isActive ? ' active' : '');
        item.title = `切换为 ${modelName}`;
        item.innerHTML = `
          <div class="ai-model-item-main">
            <span class="ai-model-item-icon">${icon}</span>
            <span class="ai-model-item-name">${escapeHtml(modelName)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            ${badgeText ? `<span class="ai-model-item-badge">${escapeHtml(badgeText)}</span>` : ''}
            ${isActive ? '<span class="ai-model-item-check">✓</span>' : ''}
          </div>
        `;
        item.addEventListener('click', () => {
          applyQuickModel(modelName);
        });
        modelPopoverList.appendChild(item);
      }
    }

    async function applyQuickModel(newModel) {
      if (!newModel) return;
      if (modelPopover) modelPopover.classList.add('hidden');
      if (state.config && state.config.model === newModel) return;

      try {
        const res = await ctx.call('saveConfig', { model: newModel });
        if (res && res.ok && res.state.config) {
          state.config = res.state.config;
          if (headerModelPill) headerModelPill.textContent = state.config.model;
          updateHeader();
        } else {
          alert('切换模型失败: ' + ((res && res.error) || '未知错误'));
        }
      } catch (err) {
        alert('切换模型异常: ' + (err.message || String(err)));
      }
    }

    if (btnToggleModelPicker) {
      btnToggleModelPicker.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!modelPopover) return;
        const willOpen = modelPopover.classList.contains('hidden');
        closeAllPopovers();
        if (willOpen) {
          modelQuickSearchText = '';
          if (inputModelQuickSearch) {
            inputModelQuickSearch.value = '';
            inputModelQuickSearch.focus();
          }
          renderModelPopoverList();
          modelPopover.classList.remove('hidden');
        }
      });
    }

    if (inputModelQuickSearch) {
      inputModelQuickSearch.addEventListener('input', () => {
        modelQuickSearchText = inputModelQuickSearch.value;
        renderModelPopoverList();
      });
      inputModelQuickSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const target = modelQuickSearchText.trim();
          if (target) {
            applyQuickModel(target);
          }
        }
      });
    }

    if (btnClearModelQuickSearch) {
      btnClearModelQuickSearch.addEventListener('click', () => {
        modelQuickSearchText = '';
        if (inputModelQuickSearch) {
          inputModelQuickSearch.value = '';
          inputModelQuickSearch.focus();
        }
        renderModelPopoverList();
      });
    }

    if (btnModelPopoverOpenSettings) {
      btnModelPopoverOpenSettings.addEventListener('click', () => {
        if (modelPopover) modelPopover.classList.add('hidden');
        if (typeof settingsCtrl !== 'undefined' && settingsCtrl && settingsCtrl.openSettings) {
          settingsCtrl.openSettings('model');
        } else if (btnOpenSettings) {
          btnOpenSettings.click();
        }
      });
    }

    return { updateAgentModeUI, updateThinkLevelUI, renderPersonas, updateActivePersonaPill, closeCtrlPopovers };
  }

  const exportsObj = { createPillsPopovers };
  if (typeof window !== 'undefined') {
    window.AiChatPillsPopovers = exportsObj;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})();
