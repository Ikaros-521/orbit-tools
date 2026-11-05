/* AI Chat settings - persona tab controller (extracted from
   settings-modals.js). Dual CommonJS / Browser export; mounted per-panel via
   the createPersonaTab factory so tab-local state stays per-mount. */
(() => {
  function createPersonaTab(deps) {
    const {
      PRESET_CHANNELS, btnCancelPersonaEdit, btnClosePersonaEdit, btnCreatePersona,
      btnNextPersonaPage, btnPrevPersonaPage, btnResetPersonas, btnSavePersona,
      ctx, escapeHtml, getState, inputPersonaIcon,
      inputPersonaPrompt, inputPersonaTitle, inputSearchPersonas, onConfigSaved,
      onPersonasChanged, panelEl, personaEditPanel, personaEditTitle,
      personaPageInfo, personaTempRange, personaTempVal, personasCardList,
      personasPagination, quickEmojiList, switchSettingsTab, updateState
    } = deps;
    if (!panelEl) return null;

    let editingPersonaId = null;
    let personaSearchKeyword = '';
    let personaCurrentPage = 1;
    const personaPageSize = 8;
        function renderPersonasSettingsList() {
      if (!personasCardList) return;
      const state = getState();
      const personas = state.personas || [];
      personasCardList.innerHTML = '';
      const q = personaSearchKeyword.trim().toLowerCase();
      const filtered = q
        ? personas.filter(p => (p.title || '').toLowerCase().includes(q) || (p.prompt || '').toLowerCase().includes(q))
        : personas;

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / personaPageSize));
      if (personaCurrentPage > totalPages) personaCurrentPage = totalPages;
      if (personaCurrentPage < 1) personaCurrentPage = 1;

      if (personaPageInfo) personaPageInfo.textContent = `第 ${personaCurrentPage} / ${totalPages} 页 (共 ${total} 项)`;
      if (btnPrevPersonaPage) btnPrevPersonaPage.disabled = personaCurrentPage <= 1;
      if (btnNextPersonaPage) btnNextPersonaPage.disabled = personaCurrentPage >= totalPages;

      if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'ai-model-empty-tip';
        empty.textContent = q ? `未找到匹配 "${q}" 的人设卡片` : '暂无人设卡片，点击右上角新建';
        personasCardList.appendChild(empty);
        return;
      }

      const start = (personaCurrentPage - 1) * personaPageSize;
      const pageItems = filtered.slice(start, start + personaPageSize);

      pageItems.forEach(p => {
        const card = document.createElement('div');
        card.className = 'ai-persona-card';
        card.innerHTML = `
          <div class="ai-persona-card-header">
            <div class="ai-persona-card-info">
              <span class="ai-persona-card-icon">${escapeHtml(p.icon || '✨')}</span>
              <span class="ai-persona-card-title">${escapeHtml(p.title || '未命名')}</span>
              <span class="ai-persona-card-temp">T: ${escapeHtml(p.temperature ?? 0.7)}</span>
            </div>
            <div class="ai-persona-card-btns">
              <button type="button" class="ai-persona-card-btn edit" data-id="${p.id}" title="编辑人设">✏️ 编辑</button>
              <button type="button" class="ai-persona-card-btn del" data-id="${p.id}" title="删除人设">🗑️ 删除</button>
            </div>
          </div>
          <div class="ai-persona-card-prompt">${escapeHtml(p.prompt || '(未设置提示词)')}</div>
        `;

        card.querySelector('.ai-persona-card-btn.edit').addEventListener('click', () => openPersonaEditor(p));
        card.querySelector('.ai-persona-card-btn.del').addEventListener('click', async () => {
          const currentP = getState().personas || [];
          if (currentP.length <= 1) {
            alert('必须保留至少一个人设角色，无法删除');
            return;
          }
          if (!confirm(`确定要删除人设「${p.title}」吗？`)) return;
          const res = await ctx.call('deletePersona', { id: p.id });
          if (res && res.ok) {
            updateState({ personas: res.personas });
            if (typeof onPersonasChanged === 'function') onPersonasChanged(res.personas);
            renderPersonasSettingsList();
          } else {
            alert(`删除失败: ${(res && res.error) || '未知错误'}`);
          }
        });

        personasCardList.appendChild(card);
      });
    }

    if (inputSearchPersonas) {
      inputSearchPersonas.addEventListener('input', () => {
        personaSearchKeyword = inputSearchPersonas.value;
        personaCurrentPage = 1;
        renderPersonasSettingsList();
      });
    }

    if (btnPrevPersonaPage) {
      btnPrevPersonaPage.addEventListener('click', () => {
        if (personaCurrentPage > 1) {
          personaCurrentPage--;
          renderPersonasSettingsList();
        }
      });
    }

    if (btnNextPersonaPage) {
      btnNextPersonaPage.addEventListener('click', () => {
        personaCurrentPage++;
        renderPersonasSettingsList();
      });
    }

    function openPersonaEditor(p) {
      if (p) {
        editingPersonaId = p.id;
        if (personaEditTitle) personaEditTitle.textContent = `编辑人设: ${p.title}`;
        if (inputPersonaTitle) inputPersonaTitle.value = p.title || '';
        if (inputPersonaIcon) inputPersonaIcon.value = p.icon || '✨';
        if (personaTempRange) personaTempRange.value = p.temperature ?? 0.7;
        if (personaTempVal) personaTempVal.textContent = p.temperature ?? 0.7;
        if (inputPersonaPrompt) inputPersonaPrompt.value = p.prompt || '';
      } else {
        editingPersonaId = null;
        if (personaEditTitle) personaEditTitle.textContent = '新建人设卡片';
        if (inputPersonaTitle) inputPersonaTitle.value = '';
        if (inputPersonaIcon) inputPersonaIcon.value = '✨';
        if (personaTempRange) personaTempRange.value = 0.7;
        if (personaTempVal) personaTempVal.textContent = '0.7';
        if (inputPersonaPrompt) inputPersonaPrompt.value = '';
      }
      if (personasCardList) personasCardList.classList.add('hidden');
      if (personasPagination) personasPagination.classList.add('hidden');
      if (personaEditPanel) personaEditPanel.classList.remove('hidden');
      if (inputPersonaTitle) inputPersonaTitle.focus();
    }

    function closePersonaEditor() {
      if (personaEditPanel) personaEditPanel.classList.add('hidden');
      if (personasCardList) personasCardList.classList.remove('hidden');
      if (personasPagination) personasPagination.classList.remove('hidden');
      editingPersonaId = null;
    }

    if (btnClosePersonaEdit) btnClosePersonaEdit.addEventListener('click', closePersonaEditor);
    if (btnCancelPersonaEdit) btnCancelPersonaEdit.addEventListener('click', closePersonaEditor);

    if (personaTempRange) {
      personaTempRange.addEventListener('input', () => {
        if (personaTempVal) personaTempVal.textContent = personaTempRange.value;
      });
    }

    if (quickEmojiList) {
      quickEmojiList.querySelectorAll('.ai-emoji-pill').forEach(pill => {
        pill.addEventListener('click', () => {
          if (inputPersonaIcon) inputPersonaIcon.value = pill.dataset.emoji;
        });
      });
    }

    if (btnCreatePersona) btnCreatePersona.addEventListener('click', () => openPersonaEditor(null));

    if (btnResetPersonas) {
      btnResetPersonas.addEventListener('click', async () => {
        if (!confirm('确定要恢复默认的人设卡片吗？自定义新增的人设将被重置。')) return;
        const res = await ctx.call('resetPersonas');
        if (res && res.ok) {
          updateState({ personas: res.personas });
          closePersonaEditor();
          if (typeof onPersonasChanged === 'function') onPersonasChanged(res.personas);
          renderPersonasSettingsList();
        }
      });
    }

    if (btnSavePersona) {
      btnSavePersona.addEventListener('click', async () => {
        const title = inputPersonaTitle.value.trim();
        if (!title) {
          alert('请输入人设标题');
          inputPersonaTitle.focus();
          return;
        }
        const patch = {
          id: editingPersonaId,
          title,
          icon: inputPersonaIcon.value.trim() || '✨',
          temperature: Number(personaTempRange.value),
          prompt: inputPersonaPrompt.value.trim()
        };
        const res = await ctx.call('savePersona', patch);
        if (res && res.ok) {
          updateState({ personas: res.personas });
          closePersonaEditor();
          if (typeof onPersonasChanged === 'function') onPersonasChanged(res.personas);
          renderPersonasSettingsList();
        } else {
          alert(`保存失败: ${(res && res.error) || '未知错误'}`);
        }
      });
    }


    return { renderPersonasSettingsList, openPersonaEditor, closePersonaEditor };
  }

  const exportsObj = { createPersonaTab };
  if (typeof window !== 'undefined') {
    window.AiChatSettingsParts = Object.assign(window.AiChatSettingsParts || {}, exportsObj);
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})();
