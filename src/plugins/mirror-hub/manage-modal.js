/* mirror-hub - manage modal (extracted from panel.js):
   environment/package navigation, proxy settings, mirror selection,
   speed-test dispatch and apply flow inside the manage modal.
   Dual CommonJS / Browser export; mutable selection state is shared with
   panel.js through the `state` getter/setter bag. */
(() => {
  function createManageModal(deps) {
    const {
      state,
      ENVS, T, escapeHtml,
      pingResultsMap, selectedMirrors,
      getEnvMirrors, renderCards, updatePkgLabel, updateShellButtons,
      manageBtn, navBtns, pkgInput, proxyInput,
      call, isZh
    } = deps;
    if (!manageBtn) return null;

    function openManageModal() {
      const existing = el.querySelector('.mhub-modal-backdrop');
      if (existing) existing.remove();

      const env = ENVS.find(x => x.id === state.currentEnvId) || ENVS[0];
      const mirrors = getEnvMirrors(state.currentEnvId);

      const backdrop = document.createElement('div');
      backdrop.className = 'mhub-modal-backdrop';

      backdrop.innerHTML = `
        <div class="mhub-modal">
          <div class="mhub-modal-header">
            <div class="mhub-modal-title">
              <span>⚙</span>
              <span>${T.modalTitle} - ${env.name}</span>
            </div>
            <button type="button" class="mhub-modal-close" title="${T.close}">✕</button>
          </div>
          <div class="mhub-modal-body">
            <div class="mhub-form-grid">
              <div class="mhub-form-item">
                <span class="mhub-form-label">${T.formName} *</span>
                <input type="text" class="mhub-form-input mhub-input-name" placeholder="${T.formNamePlaceholder}" />
              </div>
              <div class="mhub-form-item">
                <span class="mhub-form-label">${T.formUrl} *</span>
                <input type="text" class="mhub-form-input mhub-input-url" placeholder="${T.formUrlPlaceholder}" />
              </div>
              <div class="mhub-form-item full-width">
                <span class="mhub-form-label">${T.formNote}</span>
                <input type="text" class="mhub-form-input mhub-input-note" placeholder="${T.formNotePlaceholder}" />
              </div>
              <div class="mhub-form-actions">
                <button type="button" class="mhub-btn mhub-btn-add">
                  <span>+ ${T.btnAdd}</span>
                </button>
              </div>
            </div>
            <table class="mhub-mirror-table">
              <thead>
                <tr>
                  <th style="width: 140px;">${T.thName}</th>
                  <th>${T.thUrl}</th>
                  <th style="width: 80px;">${T.thLatency}</th>
                  <th style="width: 60px;">${T.thAction}</th>
                </tr>
              </thead>
              <tbody>
                ${mirrors.map(m => {
                  const pingInfo = pingResultsMap[m.url];
                  const latencyHtml = pingInfo ? (pingInfo.ok ? `${pingInfo.ms}ms` : '异常') : '-';
                  return `
                    <tr data-id="${m.id || ''}">
                      <td>
                        <div class="mhub-table-name">
                          <span>${escapeHtml(m.name)}</span>
                          <span class="mhub-table-badge ${m.isCustom ? 'mhub-table-badge-custom' : 'mhub-table-badge-built'}">
                            ${m.isCustom ? T.badgeCustom : T.badgeBuiltin}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div class="mhub-table-url" title="${escapeHtml(m.url)}">${escapeHtml(m.url)}</div>
                      </td>
                      <td>
                        <span class="mhub-table-latency">${latencyHtml}</span>
                      </td>
                      <td>
                        ${m.isCustom ? `<button type="button" class="mhub-btn-del" data-id="${m.id}" title="${T.del}">✕</button>` : `<span style="color:var(--ink-dim);font-size:11px;">-</span>`}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;

      backdrop.querySelector('.mhub-modal-close').addEventListener('click', () => backdrop.remove());
      backdrop.addEventListener('click', e => {
        if (e.target === backdrop) backdrop.remove();
      });

      const nameIn = backdrop.querySelector('.mhub-input-name');
      const urlIn = backdrop.querySelector('.mhub-input-url');
      const noteIn = backdrop.querySelector('.mhub-input-note');
      const addBtn = backdrop.querySelector('.mhub-btn-add');

      addBtn.addEventListener('click', async () => {
        const name = nameIn.value.trim();
        const url = urlIn.value.trim();
        const note = noteIn.value.trim();
        if (!name || !url) {
          alert(T.alertRequired);
          return;
        }
        try {
          await ctx.call('addCustomMirror', { envId: state.currentEnvId, mirror: { name, url, note } });
          const refreshed = await ctx.call('getCustomMirrors');
          if (refreshed) state.customMirrorsMap = refreshed;
          selectedMirrors[state.currentEnvId] = url;
          backdrop.remove();
          renderCards();
          openManageModal();
        } catch (err) {
          console.error('Failed to add mirror:', err);
        }
      });

      backdrop.querySelectorAll('.mhub-btn-del').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          if (id && confirm(T.confirmDel)) {
            try {
              await ctx.call('removeCustomMirror', { envId: state.currentEnvId, id });
              const refreshed = await ctx.call('getCustomMirrors');
              if (refreshed) state.customMirrorsMap = refreshed;
              backdrop.remove();
              renderCards();
              openManageModal();
            } catch (err) {
              console.error('Failed to delete mirror:', err);
            }
          }
        });
      });

      el.appendChild(backdrop);
    }

    return { openManageModal };
  }

  const exportsObj = { createManageModal };
  if (typeof window !== 'undefined') window.MirrorHubManageModal = exportsObj;
  if (typeof module !== 'undefined' && module.exports) module.exports = exportsObj;
})();
