/* AI Chat - Mermaid Dynamic Loader & Chart Interaction Component
   Loads mermaid.min.js dynamically on demand, renders SVGs, and binds copy/toggle events. */
(() => {
  let mermaidPromise = null;
  let lastMermaidTheme = null;

  /* Resolve the host colour scheme so chart theme follows the app theme
     (html[data-theme] drives the root `color-scheme`; "auto" exposes both
     values and defers to the OS preference). */
  function detectHostTheme() {
    try {
      const cs = (getComputedStyle(document.documentElement).colorScheme || '').trim();
      const modes = cs.split(/\s+/).filter(Boolean);
      if (modes.length === 1) return modes[0] === 'light' ? 'light' : 'dark';
      if (modes.length > 1 && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
    } catch {}
    return 'dark';
  }

  function applyMermaidTheme(mermaid) {
    const theme = detectHostTheme() === 'light' ? 'default' : 'dark';
    if (theme === lastMermaidTheme) return theme;
    try {
      mermaid.initialize({
        startOnLoad: false,
        theme,
        // strict（默认）启用 DOMPurify 清洗：图源码来自模型输出，loose +
        // htmlLabels 会把节点标签当 HTML 注入 foreignObject，构成 XSS
        securityLevel: 'strict',
        fontFamily: 'inherit',
        flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis' },
        sequence: { useMaxWidth: true },
        gantt: { useMaxWidth: true },
      });
      lastMermaidTheme = theme;
    } catch (e) {
      console.warn('[AI-Chat] Mermaid init warning:', e);
    }
    return theme;
  }

  function ensureMermaid() {
    if (window.mermaid) {
      applyMermaidTheme(window.mermaid);
      return Promise.resolve(window.mermaid);
    }
    if (mermaidPromise) return mermaidPromise;
    mermaidPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'plugin://ai-chat/vendor/mermaid.min.js';
      script.onload = () => {
        applyMermaidTheme(window.mermaid);
        resolve(window.mermaid);
      };
      script.onerror = err => {
        mermaidPromise = null;
        reject(err || new Error('Failed to load mermaid.min.js'));
      };
      document.head.appendChild(script);
    });
    return mermaidPromise;
  }

  async function renderMermaidInContainer(container) {
    if (!container) return;
    const wraps = container.querySelectorAll('.ai-mermaid-wrap:not([data-rendered="true"])');
    if (!wraps.length) return;

    let mermaid;
    try {
      mermaid = await ensureMermaid();
    } catch (err) {
      wraps.forEach(wrap => {
        const renderArea = wrap.querySelector('.ai-mermaid-render-area');
        const rawPre = wrap.querySelector('.ai-mermaid-code');
        if (renderArea) {
          renderArea.innerHTML = '<div class="ai-mermaid-err">⚠️ 未能加载 Mermaid 渲染引擎，已显示源码</div>';
        }
        if (rawPre) rawPre.classList.remove('hidden');
        const toggleBtn = wrap.querySelector('.ai-mermaid-toggle-btn');
        if (toggleBtn) toggleBtn.textContent = '查看图表';
      });
      return;
    }

    for (const wrap of wraps) {
      const renderArea = wrap.querySelector('.ai-mermaid-render-area');
      const rawPre = wrap.querySelector('.ai-mermaid-code');
      const toggleBtn = wrap.querySelector('.ai-mermaid-toggle-btn');
      const code = decodeURIComponent(wrap.dataset.mermaidCode || '').trim();
      if (!code) continue;

      wrap.dataset.rendered = 'true';
      const chartId = 'mermaid_' + Math.random().toString(36).slice(2, 9);
      try {
        const { svg } = await mermaid.render(chartId, code);
        if (renderArea) {
          renderArea.innerHTML = svg;
        }
      } catch (err) {
        console.warn('[AI-Chat] Mermaid render failed:', err);
        const stray = document.getElementById(chartId) || document.getElementById('d' + chartId);
        if (stray) stray.remove();

        if (renderArea) {
          renderArea.innerHTML = '<div class="ai-mermaid-err">⚠️ Mermaid 语法解析失败，已切换至源码模式</div>';
        }
        if (rawPre) rawPre.classList.remove('hidden');
        if (toggleBtn) toggleBtn.textContent = '查看图表';
      }
    }
  }

  function initMessageDynamicElements(bubble, { renderMermaid = false, copyToClipboard } = {}) {
    if (!bubble) return;
    const copyFn = copyToClipboard || (window.AiChatMarkdown && window.AiChatMarkdown.copyToClipboard);

    // Code copy buttons
    bubble.querySelectorAll('.ai-code-copy-btn:not([data-bound="true"])').forEach(btn => {
      btn.dataset.bound = 'true';
      btn.addEventListener('click', async (e) => {
        const pre = e.target.closest('pre');
        const code = pre ? pre.querySelector('code').textContent : '';
        if (copyFn) await copyFn(code);
        btn.textContent = '已复制';
        setTimeout(() => { btn.textContent = '复制'; }, 1200);
      });
    });

    // Mermaid controls
    bubble.querySelectorAll('.ai-mermaid-wrap:not([data-bound="true"])').forEach(wrap => {
      wrap.dataset.bound = 'true';
      const copyBtn = wrap.querySelector('.ai-mermaid-copy-btn');
      const toggleBtn = wrap.querySelector('.ai-mermaid-toggle-btn');
      const rawPre = wrap.querySelector('.ai-mermaid-code');
      const renderArea = wrap.querySelector('.ai-mermaid-render-area');
      const code = decodeURIComponent(wrap.dataset.mermaidCode || '');

      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          if (copyFn) await copyFn(code);
          copyBtn.textContent = '已复制';
          setTimeout(() => { copyBtn.textContent = '复制代码'; }, 1200);
        });
      }

      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          const isShowingCode = !rawPre.classList.contains('hidden');
          if (isShowingCode) {
            rawPre.classList.add('hidden');
            renderArea.style.display = '';
            toggleBtn.textContent = '查看源码';
          } else {
            rawPre.classList.remove('hidden');
            renderArea.style.display = 'none';
            toggleBtn.textContent = '查看图表';
          }
        });
      }
    });

    if (renderMermaid) {
      renderMermaidInContainer(bubble);
    }
  }

  const exportsObj = {
    ensureMermaid,
    renderMermaidInContainer,
    initMessageDynamicElements,
    detectHostTheme,
  };

  if (typeof window !== 'undefined') {
    window.AiChatMermaid = exportsObj;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})();
