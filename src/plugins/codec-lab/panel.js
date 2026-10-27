/* codec-lab panel — pure renderer logic, no backend needed.
   Split into modules would be overkill for one screen; the codec registry is
   the only "framework" here: every codec is {label, encode, decode}. */
(function () {
  const enc = new TextEncoder();
  const dec = new TextDecoder('utf-8', { fatal: false });
  const b64encode = s => btoa(String.fromCharCode(...enc.encode(s)));
  // accept padded and unpadded / base64url input
  const b64decode = s => {
    const norm = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    return dec.decode(Uint8Array.from(atob(norm + '='.repeat((4 - (norm.length % 4)) % 4)), c => c.charCodeAt(0)));
  };

  const CODECS = {
    base64: {
      label: 'Base64',
      encode: s => b64encode(s),
      decode: s => b64decode(s),
      hint: 'UTF-8 → Base64',
    },
    url: {
      label: 'URL',
      encode: s => encodeURIComponent(s),
      decode: s => decodeURIComponent(s.replace(/\+/g, ' ')),
      hint: 'percent-encoding',
    },
    hex: {
      label: 'Hex',
      encode: s => [...enc.encode(s)].map(b => b.toString(16).padStart(2, '0')).join(' '),
      decode: s => dec.decode(Uint8Array.from((s.replace(/0x/gi, '').replace(/[\s,:-]+/g, '').match(/.{1,2}/g) || []).map(h => parseInt(h, 16)))),
      hint: 'bytes in hex',
    },
    unicode: {
      label: 'Unicode',
      encode: s => [...s].map(c => '\\u' + c.codePointAt(0).toString(16).padStart(4, '0')).join(''),
      decode: s => s.replace(/\\u\{([0-9a-f]+)\}|\\u([0-9a-f]{4})|&#x([0-9a-f]+);|\\x([0-9a-f]{2})/gi, (_, b1, b2, b3, b4) => String.fromCodePoint(parseInt(b1 || b2 || b3 || b4, 16))),
      hint: '\\uXXXX / \\u{X} / &#xX;',
    },
    jwt: {
      label: 'JWT',
      encode: null, // JWT is decode-only here: signing needs a secret
      decode: s => {
        const parts = s.trim().split('.');
        if (parts.length < 2) throw new Error('not a JWT (need header.payload)');
        const j = part => JSON.stringify(JSON.parse(b64decode(part.replace(/-/g, '+').replace(/_/g, '/'))), null, 2);
        const out = [`// header\n${j(parts[0])}`, `// payload\n${j(parts[1])}`];
        if (parts[2]) out.push(`// signature (raw)\n${parts[2]}`);
        return out.join('\n\n');
      },
      hint: 'decode only',
    },
    timestamp: {
      label: 'Timestamp',
      // Encode = now in seconds; decode = parse s/ms/µs and render local + UTC + ISO.
      encode: () => String(Math.floor(Date.now() / 1000)),
      decode: s => {
        const n = Number(s.replace(/[^\d]/g, ''));
        if (!Number.isFinite(n) || n <= 0) throw new Error('not a timestamp');
        const ms = n > 1e14 ? n / 1000 : n > 1e11 ? n : n * 1000;
        const d = new Date(ms);
        if (isNaN(d)) throw new Error('out of range');
        const p = (x, w = 2) => String(x).padStart(w, '0');
        return [
          `local  ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
          `UTC    ${d.toISOString().slice(0, 19).replace('T', ' ')}`,
          `ISO    ${d.toISOString()}`,
          `unix   ${Math.floor(ms / 1000)} (s) / ${Math.floor(ms)} (ms)`,
        ].join('\n');
      },
      hint: 's / ms / µs → date',
    },
  };

  const MODES = [
    { key: 'encode', zh: '编码', en: 'Encode' },
    { key: 'decode', zh: '解码', en: 'Decode' },
  ];

  function mount(el, ctx) {
    let codec = 'base64';
    let mode = 'encode';
    let swapT = 0;

    el.innerHTML = `
      <div class="tool-bar">
        <div class="seg cdc-seg" id="cdcCodec"></div>
        <div class="seg cdc-seg" id="cdcMode"></div>
        <span class="grow"></span>
        <button type="button" class="btn ghost" data-act="swap">⇅ swap</button>
        <button type="button" class="btn ghost" data-act="copyOut">copy out</button>
        <button type="button" class="btn ghost" data-act="clear">clear</button>
      </div>
      <div class="cdc-body">
        <div class="cdc-pane">
          <div class="cdc-pane-head"><span>IN</span><span class="hint" id="cdcHint"></span></div>
          <textarea id="cdcIn" class="cdc-ta" spellcheck="false" placeholder="type / paste here…"></textarea>
        </div>
        <div class="cdc-pane">
          <div class="cdc-pane-head"><span>OUT</span><span class="hint" id="cdcStat"></span></div>
          <textarea id="cdcOut" class="cdc-ta" readonly spellcheck="false"></textarea>
        </div>
      </div>`;

    const codecSeg = el.querySelector('#cdcCodec');
    const modeSeg = el.querySelector('#cdcMode');
    const taIn = el.querySelector('#cdcIn');
    const taOut = el.querySelector('#cdcOut');
    const hint = el.querySelector('#cdcHint');
    const stat = el.querySelector('#cdcStat');

    const L = ctx.lang;
    for (const [key, c] of Object.entries(CODECS)) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = c.label; b.dataset.codec = key;
      codecSeg.appendChild(b);
    }
    for (const m of MODES) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = L === 'en' ? m.en : m.zh; b.dataset.mode = m.key;
      modeSeg.appendChild(b);
    }

    const syncSegs = () => {
      codecSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.codec === codec)));
      modeSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    };

    const run = () => {
      const c = CODECS[codec];
      hint.textContent = c.hint;
      const input = taIn.value;
      if (!input.trim()) { taOut.value = ''; stat.textContent = ''; return; }
      const fn = mode === 'encode' ? c.encode : c.decode;
      if (!fn) {
        taOut.value = '';
        stat.textContent = L === 'en' ? 'decode-only codec' : '该编码仅支持解码';
        return;
      }
      try {
        taOut.value = fn(input);
        stat.textContent = `${taOut.value.length} ch`;
        taOut.classList.remove('err');
        taIn.classList.remove('err');
      } catch (err) {
        taOut.value = '';
        taOut.classList.add('err');
        stat.textContent = err.message || 'error';
      }
    };

    codecSeg.addEventListener('click', e => {
      const b = e.target.closest('button[data-codec]');
      if (b) { codec = b.dataset.codec; syncSegs(); run(); }
    });
    modeSeg.addEventListener('click', e => {
      const b = e.target.closest('button[data-mode]');
      if (b) { mode = b.dataset.mode; syncSegs(); run(); }
    });
    taIn.addEventListener('input', run);
    el.addEventListener('click', async e => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'swap') {
        taIn.value = taOut.value;
        mode = mode === 'encode' ? 'decode' : 'encode';
        syncSegs(); run();
      } else if (act === 'copyOut') {
        if (taOut.value) { await navigator.clipboard.writeText(taOut.value); flashCopied(b); }
      } else if (act === 'clear') {
        taIn.value = ''; run(); taIn.focus();
      }
    });

    function flashCopied(b) {
      const old = b.textContent;
      b.textContent = '✓';
      clearTimeout(swapT);
      swapT = setTimeout(() => { b.textContent = old; }, 900);
    }

    // Ctrl+Enter jumps to the other side's text (quick paste-copy loop).
    el.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        (document.activeElement === taIn ? taOut : taIn).focus();
        (document.activeElement).select();
      }
    });

    syncSegs();
    run();
    taIn.focus();
  }

  window.Toolbox.panel({ mount });
})();
