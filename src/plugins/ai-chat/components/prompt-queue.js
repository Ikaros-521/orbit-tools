/* AI Chat - Multimodal Attachments & Prompt Queue Component
   Handles image/file/directory attachments, lightbox preview, input paste/dragdrop,
   prompt FIFO queue, and send/stop/queue dynamic button state machine.
   Dual CommonJS / Browser environment export. */
(() => {
  const defaultEscapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function initLightbox({ modalEl, imgEl, captionEl, backdropEl, closeBtnEl }) {
    function openLightbox(url, caption = '') {
      if (!modalEl || !imgEl) return;
      imgEl.src = url;
      if (captionEl) captionEl.textContent = caption || '';
      modalEl.classList.remove('hidden');
    }

    function closeLightbox() {
      if (!modalEl || !imgEl) return;
      modalEl.classList.add('hidden');
      imgEl.src = '';
    }

    if (backdropEl) backdropEl.addEventListener('click', closeLightbox);
    if (closeBtnEl) closeBtnEl.addEventListener('click', closeLightbox);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalEl && !modalEl.classList.contains('hidden')) {
        closeLightbox();
      }
    });

    return { openLightbox, closeLightbox };
  }

  function renderAttachmentsBar({
    container,
    pendingAttachments,
    openLightbox,
    onRemove,
    escapeHtml = defaultEscapeHtml
  }) {
    if (!container) return;
    if (!pendingAttachments || pendingAttachments.length === 0) {
      container.innerHTML = '';
      container.classList.add('hidden');
      return;
    }
    container.classList.remove('hidden');
    container.innerHTML = '';

    pendingAttachments.forEach((att, idx) => {
      const item = document.createElement('div');
      item.className = `ai-attachment-item ${att.type}`;

      if (att.type === 'image') {
        item.innerHTML = `
          <img src="${escapeHtml(att.url)}" alt="${escapeHtml(att.name || 'image')}" class="ai-attachment-thumb" />
          <span class="ai-attachment-name" title="${escapeHtml(att.name || '')}">${escapeHtml(att.name || `图${idx + 1}`)}</span>
          <button type="button" class="ai-attachment-del" title="移除此图片" data-idx="${idx}">×</button>
        `;
        const thumb = item.querySelector('.ai-attachment-thumb');
        if (thumb && typeof openLightbox === 'function') {
          thumb.addEventListener('click', () => {
            openLightbox(att.url, att.name || `图片 ${idx + 1}`);
          });
        }
      } else if (att.type === 'file') {
        const szStr = formatFileSize(att.size);
        item.innerHTML = `
          <span class="ai-attachment-ico">📄</span>
          <span class="ai-attachment-name" title="${escapeHtml(att.path || att.name)}">${escapeHtml(att.name)}</span>
          ${szStr ? `<span class="ai-attachment-size">${szStr}</span>` : ''}
          <button type="button" class="ai-attachment-del" title="移除此文件" data-idx="${idx}">×</button>
        `;
      } else if (att.type === 'directory') {
        item.innerHTML = `
          <span class="ai-attachment-ico">📁</span>
          <span class="ai-attachment-name" title="${escapeHtml(att.path || att.name)}">${escapeHtml(att.name)}</span>
          <span class="ai-attachment-tag">目录</span>
          <button type="button" class="ai-attachment-del" title="移除此文件夹" data-idx="${idx}">×</button>
        `;
      }

      const delBtn = item.querySelector('.ai-attachment-del');
      if (delBtn) {
        delBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          pendingAttachments.splice(idx, 1);
          if (typeof onRemove === 'function') onRemove(idx);
        });
      }
      container.appendChild(item);
    });
  }

  function addImageAttachment(file, pendingAttachments, onUpdate) {
    if (!file || !file.type || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      pendingAttachments.push({
        type: 'image',
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: file.name || 'image.png',
        size: file.size,
        url: e.target.result
      });
      if (typeof onUpdate === 'function') onUpdate();
    };
    reader.readAsDataURL(file);
  }

  function handleImageFiles(files, pendingAttachments, onUpdate) {
    if (!files || files.length === 0) return;
    const validFiles = Array.from(files).filter(f => f.type && f.type.startsWith('image/'));
    if (validFiles.length === 0) return;
    validFiles.slice(0, 8).forEach(f => addImageAttachment(f, pendingAttachments, onUpdate));
  }

  function renderPromptQueueBar({
    container,
    currentSession,
    sessionPromptQueues,
    onRecall,
    onQueueChanged,
    escapeHtml = defaultEscapeHtml
  }) {
    if (!container) return;
    if (!currentSession) {
      container.innerHTML = '';
      container.classList.add('hidden');
      return;
    }
    const queue = sessionPromptQueues.get(currentSession.id) || [];
    if (queue.length === 0) {
      container.innerHTML = '';
      container.classList.add('hidden');
      return;
    }

    const reRender = () => {
      renderPromptQueueBar({
        container,
        currentSession,
        sessionPromptQueues,
        onRecall,
        onQueueChanged,
        escapeHtml
      });
      if (typeof onQueueChanged === 'function') onQueueChanged();
    };

    container.classList.remove('hidden');
    container.innerHTML = `
      <div class="ai-queue-header">
        <div class="ai-queue-title">
          <span class="ai-queue-ico">📬</span>
          <span>待发送队列 <strong>(${queue.length})</strong></span>
          <span class="ai-queue-sub">当前回答完成后将自动按顺序发送</span>
        </div>
        <button type="button" class="ai-queue-btn-clear" id="btnClearPromptQueue" title="清空全部排队消息">清空队列</button>
      </div>
      <div class="ai-queue-list"></div>
    `;

    const btnClear = container.querySelector('#btnClearPromptQueue');
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        queue.length = 0;
        sessionPromptQueues.set(currentSession.id, []);
        reRender();
      });
    }

    const listEl = container.querySelector('.ai-queue-list');
    queue.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'ai-queue-item';
      const attCount = item.attachments ? item.attachments.length : (item.images ? item.images.length : 0);
      const attBadge = attCount > 0 ? `<span class="ai-queue-img-badge">📎 ×${attCount}</span>` : '';
      const previewText = item.text || (attCount > 0 ? '(附件消息)' : '');
      row.innerHTML = `
        <span class="ai-queue-num">#${idx + 1}</span>
        ${attBadge}
        <span class="ai-queue-text" title="${escapeHtml(previewText)}">${escapeHtml(previewText)}</span>
        <div class="ai-queue-actions">
          <button type="button" class="ai-queue-action-btn edit" title="撤回至输入框编辑">✏️ 编辑</button>
          <button type="button" class="ai-queue-action-btn del" title="移除此项">✕</button>
        </div>
      `;
      row.querySelector('.ai-queue-action-btn.edit').addEventListener('click', () => {
        const q = sessionPromptQueues.get(currentSession.id) || queue;
        const targetIdx = q.indexOf(item);
        if (targetIdx !== -1) {
          q.splice(targetIdx, 1);
        } else {
          q.splice(idx, 1);
        }
        reRender();
        if (typeof onRecall === 'function') onRecall(item);
      });
      row.querySelector('.ai-queue-action-btn.del').addEventListener('click', () => {
        const q = sessionPromptQueues.get(currentSession.id) || queue;
        const targetIdx = q.indexOf(item);
        if (targetIdx !== -1) {
          q.splice(targetIdx, 1);
        } else {
          q.splice(idx, 1);
        }
        reRender();
      });
      listEl.appendChild(row);
    });
  }

  function enqueueCurrentInput({
    chatInput,
    pendingAttachments,
    currentSession,
    sessionPromptQueues,
    onAfterEnqueue
  }) {
    const text = (chatInput && chatInput.value ? chatInput.value : '').trim();
    const atts = Array.isArray(pendingAttachments) ? [...pendingAttachments] : [];
    if (!text && atts.length === 0) return;
    if (!currentSession) return;

    let queue = sessionPromptQueues.get(currentSession.id);
    if (!queue) {
      queue = [];
      sessionPromptQueues.set(currentSession.id, queue);
    }
    queue.push({
      id: `queue_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      text,
      attachments: atts,
      timestamp: Date.now()
    });

    if (chatInput) chatInput.value = '';
    if (Array.isArray(pendingAttachments)) pendingAttachments.length = 0;
    if (typeof onAfterEnqueue === 'function') onAfterEnqueue();
  }

  function checkAndTriggerNextQueuedMessage({
    isGenerating,
    currentSession,
    sessionPromptQueues,
    sendMessage,
    onQueueChanged
  }) {
    if (isGenerating || !currentSession) return;
    const queue = sessionPromptQueues.get(currentSession.id);
    if (!queue || queue.length === 0) {
      if (typeof onQueueChanged === 'function') onQueueChanged();
      return;
    }
    // 出队后必须同步调用 sendMessage（守卫→setGeneratingState 之间无 await，
    // 是原子窗口）：原先 50ms 延迟期间第二个 drain 会再 shift 一条，而它
    // 的 sendMessage 撞上 isGenerating 守卫被静默丢弃——消息永久丢失
    const nextItem = queue.shift();
    if (typeof onQueueChanged === 'function') onQueueChanged();
    if (typeof sendMessage === 'function') {
      sendMessage(nextItem.text, null, nextItem.attachments);
    }
  }

  function updateSendOrStopButton({ btnSendOrStop, chatInput, pendingAttachments, isGenerating }) {
    if (!btnSendOrStop) return;
    const text = (chatInput && chatInput.value ? chatInput.value : '').trim();
    const hasInput = (text.length > 0) || (pendingAttachments && pendingAttachments.length > 0);
    if (!isGenerating) {
      btnSendOrStop.className = 'ai-btn-action send';
      btnSendOrStop.title = '发送消息 (Enter)';
      btnSendOrStop.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`;
    } else {
      if (hasInput) {
        btnSendOrStop.className = 'ai-btn-action send queue';
        btnSendOrStop.title = '加入待发送队列 (Enter) · 当前回答完成后自动发送';
        btnSendOrStop.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>`;
      } else {
        btnSendOrStop.className = 'ai-btn-action stop';
        btnSendOrStop.title = '中断生成';
        btnSendOrStop.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>`;
      }
    }
  }

  const exportsObj = {
    formatFileSize,
    initLightbox,
    renderAttachmentsBar,
    addImageAttachment,
    handleImageFiles,
    renderPromptQueueBar,
    enqueueCurrentInput,
    checkAndTriggerNextQueuedMessage,
    updateSendOrStopButton,
  };

  if (typeof window !== 'undefined') {
    window.AiChatPromptQueue = exportsObj;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})();
