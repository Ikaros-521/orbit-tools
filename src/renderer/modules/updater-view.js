/* Updater View Module - Update Checker & Release Notes Modal
   Manages update detection, download progress, release modal, and installation. */
(() => {
  window.OrbitUpdaterView = window.OrbitUpdaterView || {};

  function init(ctx) {
    const { state, els, I18N } = ctx;

    async function cancelUpdateDownload() {
      if (!state.downloadingUpdate && !state.downloadedFilePath) return;
      state.downloadCancelled = true; // 挂起的 downloadUpdate 以错误 settle 时不得覆盖「已停止下载」文案
      state.downloadingUpdate = false;
      state.downloadedFilePath = null;
      try {
        await window.host.cancelDownloadUpdate();
      } catch (err) {
        console.warn('cancelDownloadUpdate failed:', err);
      }
      if (els.updateDownloadArea) els.updateDownloadArea.hidden = true;
      if (els.btnCancelDownload) els.btnCancelDownload.hidden = true;
      if (els.btnUpdateAction) {
        els.btnUpdateAction.disabled = false;
        els.btnUpdateAction.textContent = I18N.t('btnDownloadUpdate');
      }
      if (els.updateErrorText) {
        els.updateErrorText.hidden = false;
        els.updateErrorText.textContent = I18N.t('downloadCancelled');
        setTimeout(() => {
          if (els.updateErrorText && els.updateErrorText.textContent === I18N.t('downloadCancelled')) {
            els.updateErrorText.hidden = true;
          }
        }, 3200);
      }
    }

    function hideUpdateModal() {
      if (state.downloadingUpdate) {
        cancelUpdateDownload();
      }
      if (els.updateModalMask) els.updateModalMask.hidden = true;
    }

    function showUpdateModal(info) {
      if (!els.updateModalMask || !info) return;
      state.updateInfo = info;
      state.downloadedFilePath = null;
      state.downloadingUpdate = false;

      if (els.updatePubDate) {
        els.updatePubDate.textContent = info.publishedAt
          ? I18N.t('updateModalReleaseDate', { date: new Date(info.publishedAt).toLocaleDateString() })
          : '';
      }
      if (els.updateCurVer) els.updateCurVer.textContent = `v${info.currentVersion}`;
      if (els.updateNewVer) els.updateNewVer.textContent = `v${info.latestVersion}`;
      if (els.updateNotesBox) els.updateNotesBox.textContent = info.releaseNotes || '暂无详细更新说明';

      if (els.updateDownloadArea) els.updateDownloadArea.hidden = true;
      if (els.btnCancelDownload) els.btnCancelDownload.hidden = true;
      if (els.updateProgressFill) els.updateProgressFill.style.width = '0%';
      if (els.updateErrorText) {
        els.updateErrorText.hidden = true;
        els.updateErrorText.textContent = '';
      }

      if (info.asset && info.asset.downloadUrl) {
        els.btnUpdateAction.hidden = false;
        els.btnUpdateAction.disabled = false;
        els.btnUpdateAction.textContent = I18N.t('btnDownloadUpdate');
      } else {
        els.btnUpdateAction.hidden = true;
      }

      els.updateModalMask.hidden = false;
    }

    async function checkForUpdates(manual = false) {
      if (state.isCheckingUpdate) return;
      state.isCheckingUpdate = true;
      if (els.btnCheckUpdate) {
        els.btnCheckUpdate.disabled = true;
        els.btnCheckUpdate.textContent = I18N.t('checkingUpdate');
      }
      try {
        const res = await window.host.checkUpdate({ manual });
        state.updateInfo = res;
        if (res && res.hasUpdate) {
          if (els.updateBadge) {
            els.updateBadge.hidden = false;
            els.updateBadge.className = 'update-badge has-update';
            els.updateBadge.textContent = I18N.t('updateFound', { version: `v${res.latestVersion}` });
          }
          showUpdateModal(res);
        } else if (res && res.ok) {
          if (els.updateBadge) {
            els.updateBadge.hidden = false;
            els.updateBadge.className = 'update-badge';
            els.updateBadge.textContent = I18N.t('updateLatest');
            setTimeout(() => { if (els.updateBadge && !state.updateInfo?.hasUpdate) els.updateBadge.hidden = true; }, 4000);
          }
        } else {
          if (manual && els.updateBadge) {
            els.updateBadge.hidden = false;
            els.updateBadge.className = 'update-badge warn';
            els.updateBadge.textContent = I18N.t('updateCheckFailed');
            setTimeout(() => { if (els.updateBadge && !state.updateInfo?.hasUpdate) els.updateBadge.hidden = true; }, 4000);
          }
        }
      } catch (err) {
        console.error('Update check failed:', err);
      } finally {
        state.isCheckingUpdate = false;
        if (els.btnCheckUpdate) {
          els.btnCheckUpdate.disabled = false;
          els.btnCheckUpdate.textContent = I18N.t('checkUpdate');
        }
      }
    }

    async function handleUpdateAction() {
      if (!state.updateInfo) return;
      if (state.downloadedFilePath) {
        try {
          await window.host.installUpdate(state.downloadedFilePath);
        } catch (err) {
          if (els.updateErrorText) {
            els.updateErrorText.hidden = false;
            els.updateErrorText.textContent = `启动安装失败: ${err.message || err}`;
          }
        }
        return;
      }

      const asset = state.updateInfo.asset;
      if (!asset || !asset.downloadUrl) {
        window.host.openExternal(state.updateInfo.releaseUrl);
        return;
      }

      state.downloadingUpdate = true;
      state.downloadCancelled = false; // 新下载开始，重置取消标记
      if (els.updateDownloadArea) els.updateDownloadArea.hidden = false;
      if (els.btnCancelDownload) els.btnCancelDownload.hidden = false;
      if (els.updateErrorText) els.updateErrorText.hidden = true;
      els.btnUpdateAction.disabled = true;
      els.btnUpdateAction.textContent = I18N.t('btnDownloadingUpdate', { percent: 0 });

      try {
        const res = await window.host.downloadUpdate({
          downloadUrl: asset.downloadUrl,
          fileName: asset.name,
        });
        if (res && res.ok && res.filePath) {
          state.downloadedFilePath = res.filePath;
          state.downloadingUpdate = false;
          if (els.btnCancelDownload) els.btnCancelDownload.hidden = true;
          if (els.updateProgressFill) els.updateProgressFill.style.width = '100%';
          if (els.updateProgressText) els.updateProgressText.textContent = '下载完成！安装包已就绪';
          if (els.updateProgressSpeed) els.updateProgressSpeed.textContent = '';
          els.btnUpdateAction.disabled = false;
          els.btnUpdateAction.textContent = I18N.t('btnInstallUpdate');
        } else {
          throw new Error(res && res.error ? res.error : '下载中断');
        }
      } catch (err) {
        state.downloadingUpdate = false;
        if (els.btnCancelDownload) els.btnCancelDownload.hidden = true;
        els.btnUpdateAction.disabled = false;
        els.btnUpdateAction.textContent = I18N.t('btnDownloadUpdate');
        if (state.downloadCancelled) return; // 用户主动取消，保留取消文案
        if (els.updateErrorText) {
          els.updateErrorText.hidden = false;
          els.updateErrorText.textContent = `${I18N.t('updateModalDownloadFailed')} (${err.message || err})`;
        }
      }
    }

    if (els.btnCheckUpdate) els.btnCheckUpdate.addEventListener('click', () => checkForUpdates(true));
    if (els.chkAutoUpdate) {
      els.chkAutoUpdate.addEventListener('change', () => {
        window.host.setPref('autoCheckUpdate', els.chkAutoUpdate.checked);
      });
    }
    if (els.btnCancelDownload) els.btnCancelDownload.addEventListener('click', cancelUpdateDownload);
    if (els.btnUpdateAction) els.btnUpdateAction.addEventListener('click', handleUpdateAction);
    if (els.btnUpdateOpenBrowser) {
      els.btnUpdateOpenBrowser.addEventListener('click', () => {
        window.host.openExternal(state.updateInfo ? state.updateInfo.releaseUrl : 'https://github.com/Ikaros-521/orbit-tools/releases');
      });
    }
    if (els.btnUpdateModalClose) els.btnUpdateModalClose.addEventListener('click', hideUpdateModal);
    if (els.btnUpdateCancel) els.btnUpdateCancel.addEventListener('click', hideUpdateModal);
    if (els.updateModalMask) {
      els.updateModalMask.addEventListener('click', e => {
        if (e.target === els.updateModalMask) hideUpdateModal();
      });
    }

    if (window.host.onUpdaterProgress) {
      window.host.onUpdaterProgress(prog => {
        if (!state.downloadingUpdate) return;
        if (els.updateProgressFill) els.updateProgressFill.style.width = `${prog.percent}%`;
        if (els.updateProgressText) els.updateProgressText.textContent = I18N.t('btnDownloadingUpdate', { percent: prog.percent });
        if (els.updateProgressSpeed && prog.speed) {
          const speedMb = (prog.speed / (1024 * 1024)).toFixed(1);
          els.updateProgressSpeed.textContent = `${speedMb} MB/s`;
        }
      });
    }

    if (window.host.onUpdaterHasUpdate) {
      window.host.onUpdaterHasUpdate(info => {
        if (info && info.hasUpdate) {
          state.updateInfo = info;
          if (els.updateBadge) {
            els.updateBadge.hidden = false;
            els.updateBadge.className = 'update-badge has-update';
            els.updateBadge.textContent = I18N.t('updateFound', { version: `v${info.latestVersion}` });
          }
        }
      });
    }

    return {
      checkForUpdates,
      showUpdateModal,
      hideUpdateModal,
      cancelUpdateDownload,
    };
  }

  window.OrbitUpdaterView.init = init;
})();
