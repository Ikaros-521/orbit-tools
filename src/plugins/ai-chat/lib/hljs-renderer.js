/* AI Chat - highlight.js Lazy Loader & Code Highlight Post-Pass
   Loads the vendored UMD build on demand (first code block), then maps
   markdown-renderer's `lang-xxx` classes onto hljs languages. Gracefully
   no-ops when the vendor file is missing or the language is unknown, so the
   renderer never blocks on highlighting. Token colours live in panel.css. */
(() => {
  let hljsPromise = null;

  const LANG_ALIAS = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', node: 'javascript',
    ts: 'typescript', tsx: 'typescript', jsx: 'javascript',
    py: 'python', python3: 'python',
    sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash', powershell: 'powershell', ps1: 'powershell', bat: 'dos', cmd: 'dos',
    yml: 'yaml', md: 'markdown', 'c++': 'cpp', cc: 'cpp', h: 'cpp', hpp: 'cpp',
    cs: 'csharp', fs: 'fsharp', rb: 'ruby', golang: 'go', kt: 'kotlin', rs: 'rust',
    html: 'xml', svg: 'xml', xml: 'xml', vue: 'xml', jsp: 'xml',
    docker: 'dockerfile', dockerfile: 'dockerfile',
    texts: 'plaintext', text: 'plaintext', txt: 'plaintext', plain: 'plaintext', log: 'plaintext'
  };

  function ensureHljs() {
    if (typeof window !== 'undefined' && window.hljs) return Promise.resolve(window.hljs);
    if (hljsPromise) return hljsPromise;
    if (typeof document === 'undefined') return Promise.reject(new Error('no document'));
    hljsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'plugin://ai-chat/vendor/hljs/highlight.min.js';
      script.onload = () => {
        if (window.hljs) resolve(window.hljs);
        else reject(new Error('hljs global missing after load'));
      };
      script.onerror = () => {
        hljsPromise = null;
        reject(new Error('Failed to load highlight.min.js'));
      };
      document.head.appendChild(script);
    });
    return hljsPromise;
  }

  /**
   * Highlight every `pre code.lang-*` under container.
   * Resolves when done (or immediately when nothing to do / vendor missing).
   */
  function highlightContainer(container) {
    if (!container || !container.querySelectorAll) return Promise.resolve();
    const codes = container.querySelectorAll('pre code[class*="lang-"]');
    if (!codes.length) return Promise.resolve();

    return ensureHljs().then(hljs => {
      for (const code of codes) {
        if (code.dataset.hljs === 'done') continue;
        const m = /(?:^|\s)lang-([a-zA-Z0-9#+_-]+)/.exec(code.className || '');
        const rawLang = m ? m[1].toLowerCase() : '';
        if (!rawLang) continue;
        const lang = LANG_ALIAS[rawLang] || rawLang;
        if (lang === 'plaintext') continue;
        if (!hljs.getLanguage(lang)) continue;
        try {
          code.innerHTML = hljs.highlight(code.textContent, { language: lang, ignoreIllegals: true }).value;
          code.dataset.hljs = 'done';
          const pre = code.closest('pre');
          if (pre) pre.classList.add('hljs-done');
        } catch {}
      }
    }).catch(() => {
      /* vendor unavailable (offline / blocked): leave plain code blocks */
    });
  }

  const exportsObj = { ensureHljs, highlightContainer, LANG_ALIAS };

  if (typeof window !== 'undefined') {
    window.AiChatHljs = exportsObj;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})();
