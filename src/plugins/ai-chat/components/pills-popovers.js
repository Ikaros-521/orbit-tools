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
      headerModelPill,
      modelPopoverChannels = (deps.modelPopover && deps.modelPopover.querySelector('#modelPopoverChannels'))
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

    /* --- Model & Channel Quick Picker Controller ----------------------- */
    let modelQuickSearchText = '';
    let popoverSelectedChannelId = null;

    function getConfiguredChannels() {
      if (state.config && Array.isArray(state.config.channels)) {
        return state.config.channels;
      }
      return [];
    }

    function renderModelPopoverChannels(channels) {
      if (!modelPopoverChannels) return;
      modelPopoverChannels.innerHTML = '';
      channels.forEach(ch => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isCurrentCh = (ch.id === popoverSelectedChannelId);
        btn.className = `ai-popover-ch-btn ${isCurrentCh ? 'active' : ''}`;
        btn.title = `查看/切换至已配置渠道「${ch.name}」`;
        btn.innerHTML = `<span>${ch.icon || '🤖'}</span> <span>${escapeHtml((ch.name || '').split(' ')[0])}</span>`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          popoverSelectedChannelId = ch.id;
          renderModelPopoverList();
        });
        modelPopoverChannels.appendChild(btn);
      });
    }

    function renderModelPopoverList() {
      if (!modelPopoverList) return;
      modelPopoverList.innerHTML = '';
      const channels = getConfiguredChannels();

      if (channels.length === 0) {
        if (modelPopoverChannels) modelPopoverChannels.innerHTML = '';
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'ai-model-empty-tip';
        emptyDiv.style.padding = '22px 14px';
        emptyDiv.style.textAlign = 'center';
        emptyDiv.innerHTML = `
          <div style="font-size:24px;margin-bottom:6px;">🔌</div>
          <div style="font-size:12.5px;font-weight:600;margin-bottom:4px;color:var(--ink);">暂无已创建的渠道</div>
          <div style="font-size:11px;color:var(--ink-faint);margin-bottom:12px;line-height:1.4;">
            对话区仅支持检索与使用您已显式创建的渠道。<br>请前往设置面板添加或创建渠道。
          </div>
          <button type="button" class="ai-edit-btn primary" id="btnEmptyPopoverSettings" style="display:inline-flex;margin:0 auto;padding:4px 12px;font-size:11.5px;">⚙️ 前往设置创建渠道</button>
        `;
        const gotoBtn = emptyDiv.querySelector('#btnEmptyPopoverSettings');
        if (gotoBtn) {
          gotoBtn.addEventListener('click', () => {
            if (modelPopover) modelPopover.classList.add('hidden');
            if (typeof btnOpenSettings?.click === 'function') {
              btnOpenSettings.click();
            } else if (settingsCtrl && typeof settingsCtrl.openSettings === 'function') {
              settingsCtrl.openSettings('model');
            }
          });
        }
        modelPopoverList.appendChild(emptyDiv);
        return;
      }

      const activeChannelId = (state.config && (state.config.activeChannelId || state.config.channel)) || (channels[0] && channels[0].id) || 'openai';
      if (!popoverSelectedChannelId || !channels.some(c => c.id === popoverSelectedChannelId)) {
        popoverSelectedChannelId = activeChannelId;
      }

      renderModelPopoverChannels(channels);

      const currModel = ((state.config && state.config.model) || '').trim();
      const viewingChannel = channels.find(c => c.id === popoverSelectedChannelId) || channels[0];
      const q = modelQuickSearchText.trim().toLowerCase();
      if (btnClearModelQuickSearch) {
        btnClearModelQuickSearch.classList.toggle('hidden', !q);
      }

      // 如果有搜索词 q，仅在已创建渠道中进行快速筛选，绝不检索未创建渠道
      if (q) {
        let matched = [];
        channels.forEach(ch => {
          (ch.models || []).forEach(m => {
            if (m.toLowerCase().includes(q) || (ch.name && ch.name.toLowerCase().includes(q))) {
              matched.push({
                channel: ch,
                model: m,
                isActive: (ch.id === activeChannelId && m === currModel)
              });
            }
          });
        });

        if (matched.length === 0) {
          const customOpt = document.createElement('div');
          customOpt.className = 'ai-model-popover-custom-opt';
          customOpt.innerHTML = `<span>➕</span> <span>在已配置渠道「${viewingChannel ? viewingChannel.name.split(' ')[0] : '当前渠道'}」使用模型 <b>"${escapeHtml(modelQuickSearchText.trim())}"</b></span>`;
          customOpt.addEventListener('click', () => {
            applyQuickChannelAndModel(viewingChannel ? viewingChannel.id : activeChannelId, modelQuickSearchText.trim());
          });
          modelPopoverList.appendChild(customOpt);
          return;
        }

        matched.forEach(item => {
          appendModelItem(item.channel, item.model, item.channel.name.split(' ')[0], item.channel.icon || '🤖', item.isActive);
        });
        return;
      }

      // 无搜索词时，直接展示当前所选已创建渠道的模型列表
      const chModels = (viewingChannel && Array.isArray(viewingChannel.models)) ? viewingChannel.models : [];
      const chName = viewingChannel ? viewingChannel.name.split(' ')[0] : '渠道';
      const chIcon = (viewingChannel && viewingChannel.icon) || '⚡';

      const groupTitle = document.createElement('div');
      groupTitle.className = 'ai-model-popover-group-title';
      groupTitle.textContent = `${chName} 可用模型 (${chModels.length})`;
      modelPopoverList.appendChild(groupTitle);

      if (chModels.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'ai-model-empty-tip';
        empty.style.padding = '12px';
        empty.style.textAlign = 'center';
        empty.style.color = 'var(--ink-faint)';
        empty.style.fontSize = '12px';
        empty.textContent = '该渠道暂未配置模型，可在设置中添加或直接搜索输入';
        modelPopoverList.appendChild(empty);
      } else {
        chModels.forEach(m => {
          const isActive = (viewingChannel.id === activeChannelId && m === currModel);
          appendModelItem(viewingChannel, m, chName, chIcon, isActive);
        });
      }

      function appendModelItem(channel, modelName, badgeText, icon, isActive) {
        const item = document.createElement('div');
        item.className = 'ai-model-popover-item' + (isActive ? ' active' : '');
        item.title = `切换为 [${channel.name}] ${modelName}`;
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
          applyQuickChannelAndModel(channel.id, modelName);
        });
        modelPopoverList.appendChild(item);
      }
    }

    async function applyQuickChannelAndModel(channelId, newModel) {
      if (!channelId || !newModel) return;
      if (modelPopover) modelPopover.classList.add('hidden');

      const currChId = (state.config && (state.config.activeChannelId || state.config.channel)) || 'openai';
      if (currChId === channelId && state.config && state.config.model === newModel) return;

      try {
        const res = await ctx.call('switchActiveChannel', { channelId, model: newModel });
        const newCfg = (res && res.config) || (res && res.state && res.state.config);
        if (res && res.ok && newCfg) {
          state.config = newCfg;
          if (headerModelPill) headerModelPill.textContent = state.config.model;
          updateHeader();
        } else {
          // fallback
          const fb = await ctx.call('saveConfig', { activeChannelId: channelId, channel: channelId, model: newModel });
          const fbCfg = (fb && fb.config) || (fb && fb.state && fb.state.config);
          if (fb && fb.ok && fbCfg) {
            state.config = fbCfg;
            if (headerModelPill) headerModelPill.textContent = state.config.model;
            updateHeader();
          } else {
            alert('切换渠道与模型失败: ' + ((res && res.error) || '未知错误'));
          }
        }
      } catch (err) {
        alert('切换渠道与模型异常: ' + (err.message || String(err)));
      }
    }

    async function applyQuickModel(newModel) {
      const chId = (state.config && (state.config.activeChannelId || state.config.channel)) || 'openai';
      return applyQuickChannelAndModel(chId, newModel);
    }

    if (btnToggleModelPicker) {
      btnToggleModelPicker.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!modelPopover) return;
        const willOpen = modelPopover.classList.contains('hidden');
        closeAllPopovers();
        if (willOpen) {
          popoverSelectedChannelId = (state.config && (state.config.activeChannelId || state.config.channel)) || 'openai';
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
