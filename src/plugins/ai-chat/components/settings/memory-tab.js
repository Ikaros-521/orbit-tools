/* AI Chat settings - memory tab controller (extracted from
   settings-modals.js). Dual CommonJS / Browser export; mounted per-panel via
   the createMemoryTab factory so tab-local state stays per-mount. */
(() => {
  function createMemoryTab(deps) {
    const {
      PRESET_CHANNELS, btnCancelMemoryEdit, btnCloseMemoryEdit, btnCreateMemory,
      btnSaveMemoryEdit, ctx, escapeHtml, getState,
      inputMemoryContent, inputSearchMemories, memoriesCardList, memoryCountBadge,
      memoryEditPanel, memoryEditTitle, onConfigSaved, onPersonasChanged,
      panelEl, selectMemoryScope, selectMemoryType, switchSettingsTab,
      updateState
    } = deps;
    if (!panelEl) return null;

    let editingMemoryId = null;
    let memorySearchKeyword = '';
        const MEMORY_TYPE_LABELS = { fact: '事实', preference: '偏好', project: '项目' };
    function shortDirLabel(dir) {
      const parts = String(dir || '').replace(/\\/g, '/').split('/').filter(Boolean);
      return parts.length ? `…/${parts[parts.length - 1]}` : String(dir || '');
    }

    function renderMemoriesList() {
      if (!memoriesCardList) return;
      const state = getState();
      const memories = state.memories || [];
      memoriesCardList.innerHTML = '';
      const q = memorySearchKeyword.trim().toLowerCase();
      const filtered = q ? memories.filter(m => (m.content || '').toLowerCase().includes(q)) : memories;
      if (memoryCountBadge) memoryCountBadge.textContent = `${memories.length} 条`;

      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'ai-model-empty-tip';
        empty.textContent = q ? `未找到匹配 "${q}" 的记忆` : '记忆库为空：可在对话中让助手「记住这个偏好」，或点右上角手动新建';
        memoriesCardList.appendChild(empty);
        return;
      }

      filtered.forEach(m => {
        const card = document.createElement('div');
        card.className = 'ai-memory-card';
        const scopeLabel = m.scope === 'global' ? '🌐 全局' : `📁 ${shortDirLabel(m.scope)}`;
        const typeLabel = MEMORY_TYPE_LABELS[m.type] || m.type;
        const time = new Date(m.updatedAt || Date.now()).toLocaleString();
        card.innerHTML = `
          <div class="ai-memory-card-head">
            <span class="ai-memory-scope">${escapeHtml(scopeLabel)}</span>
            <span class="ai-memory-type">${escapeHtml(typeLabel)}</span>
            ${m.source === 'agent' ? '<span class="ai-memory-src" title="由 Agent 自主写入">🤖</span>' : ''}
            <span class="ai-memory-actions">
              <button type="button" class="ai-persona-card-btn edit" title="编辑">✏️</button>
              <button type="button" class="ai-persona-card-btn del" title="删除">🗑️</button>
            </span>
          </div>
          <div class="ai-memory-content">${escapeHtml(m.content)}</div>
          <div class="ai-memory-meta">${escapeHtml(time)}</div>
        `;
        card.querySelector('.ai-memory-actions .edit').addEventListener('click', () => openMemoryEditor(m));
        card.querySelector('.ai-memory-actions .del').addEventListener('click', async () => {
          if (!confirm('删除这条记忆？')) return;
          const res = await ctx.call('deleteMemory', { id: m.id });
          if (res && res.ok) {
            updateState({ memories: res.memories });
            renderMemoriesList();
          }
        });
        memoriesCardList.appendChild(card);
      });
    }

    function openMemoryEditor(m) {
      editingMemoryId = m ? m.id : null;
      if (memoryEditTitle) memoryEditTitle.textContent = m ? '编辑记忆' : '新建记忆';
      if (inputMemoryContent) inputMemoryContent.value = m ? m.content : '';
      if (selectMemoryScope) selectMemoryScope.value = m && m.scope !== 'global' ? 'project' : 'global';
      if (selectMemoryType) selectMemoryType.value = m ? (m.type || 'fact') : 'fact';
      if (memoryEditPanel) memoryEditPanel.classList.remove('hidden');
    }

    function closeMemoryEditor() {
      editingMemoryId = null;
      if (memoryEditPanel) memoryEditPanel.classList.add('hidden');
    }

    if (btnCreateMemory) btnCreateMemory.addEventListener('click', () => openMemoryEditor(null));
    if (btnCloseMemoryEdit) btnCloseMemoryEdit.addEventListener('click', closeMemoryEditor);
    if (btnCancelMemoryEdit) btnCancelMemoryEdit.addEventListener('click', closeMemoryEditor);
    if (inputSearchMemories) {
      inputSearchMemories.addEventListener('input', () => {
        memorySearchKeyword = inputSearchMemories.value;
        renderMemoriesList();
      });
    }

    if (btnSaveMemoryEdit) {
      btnSaveMemoryEdit.addEventListener('click', async () => {
        const content = inputMemoryContent.value.trim();
        if (!content) { alert('记忆内容不能为空'); return; }
        const state = getState();
        let scope = 'global';
        if (selectMemoryScope.value === 'project') {
          scope = (state.currentSession && state.currentSession.workDir) || (state.config && state.config.agentWorkDir) || '';
          if (!scope) {
            alert('当前没有可用的项目工作目录：请先在会话顶栏 📁 设置工作目录');
            return;
          }
        }
        const res = await ctx.call('saveMemory', {
          id: editingMemoryId || undefined,
          content,
          type: selectMemoryType.value,
          scope
        });
        if (res && res.ok) {
          updateState({ memories: res.memories });
          closeMemoryEditor();
          renderMemoriesList();
        } else {
          alert(`保存失败: ${(res && res.error) || '未知错误'}`);
        }
      });
    }


    return { renderMemoriesList, openMemoryEditor, closeMemoryEditor };
  }

  const exportsObj = { createMemoryTab };
  if (typeof window !== 'undefined') {
    window.AiChatSettingsParts = Object.assign(window.AiChatSettingsParts || {}, exportsObj);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})();
