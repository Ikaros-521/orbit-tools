/* AI Chat settings - model tab controller (extracted from
   settings-modals.js). Dual CommonJS / Browser export; mounted per-panel via
   the createModelTab factory so tab-local state stays per-mount. */
(() => {
  function createModelTab(deps) {
    const {
      PRESET_CHANNELS, btnClearModelSearch, btnFetchModels, btnToggleApiKey,
      btnToggleModelSearch, cfgApiKey, cfgBaseUrl, cfgChannel,
      cfgModel, cfgProtocol, channelModelChips, countAllModels,
      countChannelModels, countRemoteModels, ctx, escapeHtml,
      getState, iconFetchSpin, inputModelSearch, modelFilterTabs,
      modelSearchPanel, modelSearchResults, onConfigSaved, onPersonasChanged,
      panelEl, switchSettingsTab, tabRemoteModels, updateState
    } = deps;
    if (!panelEl) return null;

    let remoteModels = [];
    let activeModelTab = 'all';
        function getAllPresetModels() {
      const all = [];
      const seen = new Set();
      const currCh = PRESET_CHANNELS.find(x => x.id === cfgChannel.value);
      if (currCh && currCh.models) {
        currCh.models.forEach(m => {
          if (!seen.has(m)) {
            seen.add(m);
            all.push({ id: m, badge: currCh.name.split(' ')[0], channelId: currCh.id, isRemote: false });
          }
        });
      }
      PRESET_CHANNELS.forEach(ch => {
        if (ch.id === cfgChannel.value) return;
        (ch.models || []).forEach(m => {
          if (!seen.has(m)) {
            seen.add(m);
            all.push({ id: m, badge: ch.name.split(' ')[0], channelId: ch.id, isRemote: false });
          }
        });
      });
      return all;
    }

    function renderModelSearchResults() {
      if (!modelSearchResults) return;
      const kw = (inputModelSearch ? inputModelSearch.value : '').trim().toLowerCase();
      if (btnClearModelSearch) btnClearModelSearch.classList.toggle('hidden', !kw);

      const currCh = PRESET_CHANNELS.find(x => x.id === cfgChannel.value);
      const currChModels = (currCh && currCh.models) || [];
      const allPreset = getAllPresetModels();

      if (countChannelModels) countChannelModels.textContent = currChModels.length;
      if (countAllModels) countAllModels.textContent = allPreset.length;
      if (countRemoteModels) countRemoteModels.textContent = remoteModels.length;

      let candidates = [];
      if (kw) {
        const pool = (activeModelTab === 'remote')
          ? remoteModels.map(m => ({ id: m, badge: '在线', isRemote: true }))
          : (activeModelTab === 'channel')
            ? currChModels.map(m => ({ id: m, badge: currCh ? currCh.name.split(' ')[0] : '渠道', isRemote: false }))
            : allPreset.concat(remoteModels.map(m => ({ id: m, badge: '在线', isRemote: true })));

        candidates = pool.filter(item => item.id.toLowerCase().includes(kw));
      } else {
        if (activeModelTab === 'remote') {
          candidates = remoteModels.map(m => ({ id: m, badge: '在线', isRemote: true }));
        } else if (activeModelTab === 'channel') {
          candidates = currChModels.map(m => ({ id: m, badge: currCh ? currCh.name.split(' ')[0] : '渠道', isRemote: false }));
        } else {
          candidates = allPreset;
        }
      }

      modelSearchResults.innerHTML = '';
      if (candidates.length === 0) {
        const tip = document.createElement('div');
        tip.className = 'ai-model-empty-tip';
        if (activeModelTab === 'remote' && remoteModels.length === 0) {
          tip.innerHTML = '尚未拉取在线模型，请点击上方「<b>🔄 在线拉取模型</b>」按钮';
        } else if (kw) {
          tip.innerHTML = `未搜到包含 "<b>${escapeHtml(kw)}</b>" 的模型<br><span style="opacity:0.7">可直接在输入框手动填入自定义模型名称</span>`;
        } else {
          tip.textContent = '暂无预设模型，可直接在上方输入';
        }
        modelSearchResults.appendChild(tip);
        return;
      }

      candidates.forEach(item => {
        const div = document.createElement('div');
        div.className = `ai-model-item ${item.isRemote ? 'remote' : ''} ${cfgModel.value.trim() === item.id ? 'selected' : ''}`;
        div.dataset.model = item.id;
        div.title = `点击选用: ${item.id}`;

        let nameHtml = escapeHtml(item.id);
        if (kw) {
          const idx = item.id.toLowerCase().indexOf(kw);
          if (idx !== -1) {
            const before = escapeHtml(item.id.slice(0, idx));
            const match = escapeHtml(item.id.slice(idx, idx + kw.length));
            const after = escapeHtml(item.id.slice(idx + kw.length));
            nameHtml = `${before}<span style="color:var(--amber);text-decoration:underline;font-weight:600">${match}</span>${after}`;
          }
        }

        div.innerHTML = `
          <span class="ai-model-name">${nameHtml}</span>
          <span class="ai-model-badge">${escapeHtml(item.badge || '')}</span>
        `;

        div.addEventListener('click', () => {
          cfgModel.value = item.id;
          if (modelSearchPanel) modelSearchPanel.classList.add('hidden');
        });
        modelSearchResults.appendChild(div);
      });
    }

    if (modelFilterTabs) {
      modelFilterTabs.querySelectorAll('.ai-filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          modelFilterTabs.querySelectorAll('.ai-filter-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          activeModelTab = tab.dataset.tab;
          renderModelSearchResults();
        });
      });
    }

    if (inputModelSearch) {
      inputModelSearch.addEventListener('input', () => renderModelSearchResults());
    }

    if (btnClearModelSearch) {
      btnClearModelSearch.addEventListener('click', () => {
        inputModelSearch.value = '';
        inputModelSearch.focus();
        renderModelSearchResults();
      });
    }

    if (btnToggleModelSearch && modelSearchPanel) {
      btnToggleModelSearch.addEventListener('click', () => {
        const isHidden = modelSearchPanel.classList.toggle('hidden');
        if (!isHidden) {
          inputModelSearch.value = '';
          renderModelSearchResults();
          inputModelSearch.focus();
        }
      });
    }

    if (cfgModel) {
      cfgModel.addEventListener('focus', () => {
        if (modelSearchPanel && modelSearchPanel.classList.contains('hidden')) {
          modelSearchPanel.classList.remove('hidden');
          if (inputModelSearch) inputModelSearch.value = cfgModel.value.trim();
          renderModelSearchResults();
        }
      });
    }

    if (btnFetchModels) {
      btnFetchModels.addEventListener('click', async () => {
        const baseUrl = cfgBaseUrl.value.trim();
        if (!baseUrl) {
          alert('请先填写 API 基础路径 (Base URL)');
          cfgBaseUrl.focus();
          return;
        }
        btnFetchModels.disabled = true;
        if (iconFetchSpin) iconFetchSpin.classList.add('spinning');
        try {
          const res = await ctx.call('fetchModels', {
            protocol: cfgProtocol.value,
            baseUrl,
            apiKey: cfgApiKey.value.trim()
          });
          if (res && res.ok && Array.isArray(res.models)) {
            remoteModels = res.models;
            if (tabRemoteModels) tabRemoteModels.classList.remove('hidden');
            if (countRemoteModels) countRemoteModels.textContent = remoteModels.length;
            if (modelFilterTabs) {
              modelFilterTabs.querySelectorAll('.ai-filter-tab').forEach(t => t.classList.remove('active'));
            }
            if (tabRemoteModels) tabRemoteModels.classList.add('active');
            activeModelTab = 'remote';
            if (modelSearchPanel) modelSearchPanel.classList.remove('hidden');
            if (inputModelSearch) inputModelSearch.value = '';
            renderModelSearchResults();
          } else {
            alert(`拉取模型失败: ${(res && res.error) || '未知错误'}`);
          }
        } catch (err) {
          alert(`拉取模型异常: ${err.message || err}`);
        } finally {
          btnFetchModels.disabled = false;
          if (iconFetchSpin) iconFetchSpin.classList.remove('spinning');
        }
      });
    }

    function renderChannelChips(channelId) {
      if (!channelModelChips) return;
      channelModelChips.innerHTML = '';
      const ch = PRESET_CHANNELS.find(x => x.id === channelId);
      if (!ch || !ch.models || ch.models.length === 0) return;
      ch.models.slice(0, 5).forEach(m => {
        const chip = document.createElement('span');
        chip.className = 'ai-chip';
        chip.textContent = m;
        chip.title = `点击选用 ${m}`;
        chip.addEventListener('click', () => {
          cfgModel.value = m;
        });
        channelModelChips.appendChild(chip);
      });
    }

    if (cfgChannel) {
      cfgChannel.addEventListener('change', () => {
        const ch = PRESET_CHANNELS.find(x => x.id === cfgChannel.value);
        if (ch) {
          if (remoteModels.length) {
            remoteModels = [];
            if (tabRemoteModels) tabRemoteModels.classList.add('hidden');
            if (activeModelTab === 'remote') {
              activeModelTab = 'channel';
              if (modelFilterTabs) {
                modelFilterTabs.querySelectorAll('.ai-filter-tab').forEach(t => {
                  t.classList.toggle('active', t.dataset.tab === activeModelTab);
                });
              }
            }
          }
          if (ch.baseUrl) cfgBaseUrl.value = ch.baseUrl;
          if (ch.protocol) cfgProtocol.value = ch.protocol;
          if (ch.defaultModel) cfgModel.value = ch.defaultModel;
          renderChannelChips(ch.id);
          renderModelSearchResults();
        }
      });
    }

    if (btnToggleApiKey) {
      btnToggleApiKey.addEventListener('click', () => {
        if (cfgApiKey.type === 'password') {
          cfgApiKey.type = 'text';
          btnToggleApiKey.textContent = '🙈';
          btnToggleApiKey.title = '隐藏密钥';
        } else {
          cfgApiKey.type = 'password';
          btnToggleApiKey.textContent = '👁️';
          btnToggleApiKey.title = '显示密钥';
        }
      });
    }


    return { renderModelSearchResults, renderChannelChips, getAllPresetModels };
  }

  const exportsObj = { createModelTab };
  if (typeof window !== 'undefined') {
    window.AiChatSettingsParts = Object.assign(window.AiChatSettingsParts || {}, exportsObj);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})();
