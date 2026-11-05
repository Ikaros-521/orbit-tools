/* codec-lab panel — view layer; registry/helpers live in codec-defs.js
   (loaded via plugin:// before mount runs). */
(() => {
  const ensureDefs = () => new Promise(resolve => {
    if (window.CodecLabDefs) return resolve(window.CodecLabDefs);
    const s = document.createElement('script');
    s.src = 'plugin://codec-lab/codec-defs.js';
    s.onload = () => resolve(window.CodecLabDefs);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });

  let cleanup = null;

  async function mount(el, ctx) {
    const D = await ensureDefs();
    if (!D) return;
    const isZh = ctx.lang !== 'en';
    const t = k => (D.T[isZh ? 'zh' : 'en'][k] || k);
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const call = ctx.call;
    el.classList.add('cdc-root');

    const S = {
      cat: 'codec', codec: 'base64', mode: 'encode', inFmt: 'text',
      out: { hexCase: 'lower', hexSep: ' ', b64: 'std', gzipFmt: 'base64' },
      radixRows: [2, 8, 10, 16, 36, 62, 64], radixVal: undefined,
      hashAlgos: ['md5', 'sha1', 'sha256', 'sha512', 'sm3'],
      hash: { upper: false, perLine: false, hmac: false, hmacKey: '', salt: '' },
      cip: { op: 'encrypt', algo: 'aes-256-cbc', mode: 'password', kdf: 'md5', keyFmt: 'utf8', ivFmt: 'utf8', pad: 'pkcs7', inFmt: 'text', outFmt: 'base64', pwd: '', key: '', iv: '' },
      raw: '', hashRaw: '', cipRaw: '',
    };
    const V = {};          // live DOM refs of the active view
    const timers = new Set();
    const later = (fn, ms, ...args) => { const id = setTimeout(() => { timers.delete(id); fn(...args); }, ms); timers.add(id); };
    let flashT = 0;

    el.innerHTML = `
      <div class="tool-bar cdc-bar">
        <div class="seg" id="cdcCat"></div>
        <span class="grow"></span>
        <button type="button" class="btn ghost" data-act="swap" id="cdcSwap">${t('swap')}</button>
        <button type="button" class="btn ghost" data-act="copyOut" id="cdcCopy">${t('copyOut')}</button>
        <button type="button" class="btn ghost" data-act="clear" id="cdcClear">${t('clear')}</button>
        <button type="button" class="btn ghost" data-act="history" id="cdcHistBtn">${t('history')}</button>
      </div>
      <div class="cdc-subbar" id="cdcSub"></div>
      <div class="cdc-view" id="cdcView"></div>
      <div class="cdc-pop cdc-histpop" id="cdcHistPop" hidden></div>`;

    const catSeg = el.querySelector('#cdcCat');
    const sub = el.querySelector('#cdcSub');
    const view = el.querySelector('#cdcView');
    const histPop = el.querySelector('#cdcHistPop');
    const btnSwap = el.querySelector('#cdcSwap');
    const btnCopy = el.querySelector('#cdcCopy');
    const btnClear = el.querySelector('#cdcClear');
    const btnHist = el.querySelector('#cdcHistBtn');

    for (const c of D.CATS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = t(c.labelKey);
      b.dataset.cat = c.key;
      catSeg.appendChild(b);
    }
    catSeg.addEventListener('click', e => {
      const b = e.target.closest('button[data-cat]');
      if (b && b.dataset.cat !== S.cat) { S.cat = b.dataset.cat; renderAll(); }
    });

    /* ================= codec view ================= */
    function buildCodecView() {
      view.innerHTML = `
        <div class="cdc-codec">
          <div class="cdc-pane">
            <div class="cdc-pane-head"><span>${t('in')}</span><span class="cdc-head-ops" id="cdcInOps"></span><span class="hint" id="cdcHint"></span></div>
            <textarea id="cdcIn" class="cdc-ta" spellcheck="false" placeholder="${t('ph')}"></textarea>
          </div>
          <div class="cdc-pane">
            <div class="cdc-pane-head"><span>${t('out')}</span><span class="cdc-head-ops" id="cdcOutOps"></span><span class="hint" id="cdcStat"></span></div>
            <textarea id="cdcOut" class="cdc-ta" readonly spellcheck="false"></textarea>
            <div class="cdc-img" id="cdcImg" hidden></div>
          </div>
        </div>`;
      V.taIn = view.querySelector('#cdcIn');
      V.taOut = view.querySelector('#cdcOut');
      V.hint = view.querySelector('#cdcHint');
      V.stat = view.querySelector('#cdcStat');
      V.inOps = view.querySelector('#cdcInOps');
      V.outOps = view.querySelector('#cdcOutOps');
      V.img = view.querySelector('#cdcImg');

      // IN head: input pre-decode format (+ "now" for timestamp)
      const fmtSel = document.createElement('select');
      fmtSel.className = 'cdc-mini';
      fmtSel.title = isZh ? '先把输入按此格式解码为文本' : 'pre-decode input as this format';
      for (const [v, lab] of [['text', 'text'], ['base64', 'base64'], ['hex', 'hex'], ['url', 'url']]) {
        fmtSel.add(new Option(lab, v));
      }
      fmtSel.value = S.inFmt;
      fmtSel.addEventListener('change', () => { S.inFmt = fmtSel.value; runCodec(); });
      V.inOps.appendChild(fmtSel);
      if (S.codec === 'timestamp') {
        const now = document.createElement('button');
        now.type = 'button'; now.className = 'btn ghost cdc-now';
        now.textContent = t('now');
        now.addEventListener('click', () => { V.taIn.value = String(Math.floor(Date.now() / 1000)); runCodec(); });
        V.inOps.appendChild(now);
      }

      // OUT head: per-codec output options
      const c = D.CODECS[S.codec];
      const mkSel = (opts, value, onch) => {
        const s = document.createElement('select');
        s.className = 'cdc-mini';
        for (const [v, lab] of opts) s.add(new Option(lab, v));
        s.value = value;
        s.addEventListener('change', () => { onch(s.value); runCodec(); });
        return s;
      };
      if (c.outKind === 'hex') {
        V.outOps.appendChild(mkSel([[' ', t('sepSpace')], ['', t('sepNone')], [':', t('sepColon')], [',', t('sepComma')]], S.out.hexSep, v => { S.out.hexSep = v; }));
        V.outOps.appendChild(mkSel([['lower', t('caseLower')], ['upper', t('caseUpper')]], S.out.hexCase, v => { S.out.hexCase = v; }));
      } else if (c.outKind === 'base64') {
        V.outOps.appendChild(mkSel([['std', t('b64Std')], ['urlsafe', t('b64Url')]], S.out.b64, v => { S.out.b64 = v; }));
      } else if (c.outKind === 'gzipfmt') {
        V.outOps.appendChild(mkSel([['base64', 'base64'], ['hex', 'hex']], S.out.gzipFmt, v => { S.out.gzipFmt = v; }));
      }

      V.taIn.addEventListener('input', () => {
        if (D.CODECS[S.codec].async) later(runCodec, 300); else runCodec();
      });
      V.taIn.value = S.raw; // keep typed input across codec/mode switches
    }

    let codecSeq = 0;
    function runCodec() {
      if (S.cat !== 'codec' || !V.taIn) return;
      const c = D.CODECS[S.codec];
      V.hint.textContent = isZh ? (c.hint.zh || c.hint.en) : (c.hint.en || c.hint.zh);
      codecSeq++;
      const seq = codecSeq;
      const raw = V.taIn.value;
      hideImg();
      if (!raw.trim()) { V.taOut.value = ''; V.stat.textContent = ''; return; }

      let text = raw, bytes = null;
      if (S.inFmt !== 'text') {
        try {
          bytes = S.inFmt === 'base64' ? D.b64ToBytes(raw) : S.inFmt === 'hex' ? D.hexToBytes(raw) : D.enc.encode(decodeURIComponent(raw.replace(/\+/g, ' ')));
          text = D.dec.decode(bytes);
        } catch (err) { return codecError(err.message); }
      }
      const fn = S.mode === 'encode' ? c.encode : c.decode;
      if (!fn) { V.taOut.value = ''; V.stat.textContent = t('decodeOnly'); return; }

      const opts = c.outKind === 'hex' ? { case: S.out.hexCase !== 'upper', sep: S.out.hexSep }
        : c.outKind === 'base64' ? { urlsafe: S.out.b64 === 'urlsafe' }
        : c.outKind === 'gzipfmt' ? { fmt: S.out.gzipFmt } : {};
      const finish = v => {
        V.taOut.value = v;
        V.stat.textContent = `${v.length} ${t('chars')}`;
        V.taOut.classList.remove('err');
        V.taIn.classList.remove('err');
        if (c.imageable && S.mode === 'decode' && c.decodeBytes) {
          try { showImgIfAny(c.decodeBytes(raw)); } catch { /* decode already succeeded as text */ }
        }
        later(pushHistCur, 800, raw);
      };
      if (c.async) {
        V.stat.textContent = '…';
        // 成功分支同样要校验 seq：大输入 gzip 期间继续输入，先发的旧请求
        // 后到会把过期结果写进输出框（catch 分支早已检查，此处曾漏）
        fn(text, bytes || D.enc.encode(text), opts, call).then(v => { if (seq === codecSeq) finish(v); }).catch(e => { if (seq === codecSeq) codecError(e.message); });
      } else {
        try {
          finish(fn(text, bytes || D.enc.encode(text), opts, call, isZh));
        } catch (err) { codecError(err.message); }
      }
    }
    function codecError(msg) {
      V.taOut.value = '';
      V.taOut.classList.add('err');
      V.stat.textContent = msg || t('failed');
    }
    function showImgIfAny(bytes) {
      const mime = D.sniffImageMime(bytes);
      if (!mime || !bytes.length) return;
      const url = `data:${mime};base64,${D.bytesToB64(bytes)}`;
      V.img.innerHTML = `<div class="cdc-img-head"><span>${t('imgPrev')} · ${mime}</span><span><button type="button" class="btn ghost" data-img="copy">${t('copyImg')}</button><button type="button" class="btn ghost" data-img="dl">${t('download')}</button></span></div><img alt="">`;
      const img = V.img.querySelector('img');
      img.onload = () => { V.img.querySelector('.cdc-img-head span').textContent += ` · ${img.naturalWidth}×${img.naturalHeight}`; };
      img.src = url;
      V.img.hidden = false;
      V.img.onclick = async e => {
        const b = e.target.closest('button[data-img]');
        if (!b) return;
        if (b.dataset.img === 'copy') {
          const blob = await (await fetch(url)).blob();
          await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
          flash(b, t('imgCopied'));
        } else {
          const a = document.createElement('a');
          a.href = url;
          a.download = `decode.${mime.split('/')[1]}`;
          a.click();
        }
      };
    }
    function hideImg() { if (V.img) { V.img.hidden = true; V.img.innerHTML = ''; } }

    /* ================= radix view ================= */
    function buildRadixView() {
      view.innerHTML = `
        <div class="cdc-radix">
          <div class="cdc-radix-rows" id="cdcRadixRows"></div>
          <div class="cdc-radix-foot">
            <span class="hint" id="cdcRadixHint"></span>
            <span class="grow"></span>
            <button type="button" class="btn ghost" id="cdcRadixMore">${t('radixMore')}</button>
          </div>
          <div class="cdc-pop cdc-radixgrid" id="cdcRadixGrid" hidden></div>
        </div>`;
      V.radixRows = view.querySelector('#cdcRadixRows');
      V.radixGrid = view.querySelector('#cdcRadixGrid');
      V.radixHint = view.querySelector('#cdcRadixHint');
      const rows = S.radixRows.map(r => {
        const row = document.createElement('div');
        row.className = 'cdc-rrow';
        const sel = document.createElement('select');
        sel.className = 'cdc-mini cdc-rsel';
        for (let i = 2; i <= 64; i++) sel.add(new Option(String(i), String(i)));
        sel.value = String(r);
        const inp = document.createElement('input');
        inp.className = 'cdc-rin mono';
        inp.spellcheck = false;
        sel.addEventListener('change', () => {
          S.radixRows[rows.indexOf(row)] = Number(sel.value);
          syncRadix(); // re-render every row, including the one just re-based
        });
        inp.addEventListener('input', () => {
          inp.classList.remove('err');
          if (!inp.value.trim()) { S.radixVal = undefined; syncRadix(); return; }
          const v = D.strToBig(inp.value, Number(sel.value));
          if (v === null) { inp.classList.add('err'); V.radixHint.textContent = t('radixBad'); return; }
          V.radixHint.textContent = '';
          S.radixVal = v;
          syncRadix(rows.indexOf(row));
          later(pushHistCur, 800, D.bigToStr(v, 10));
        });
        row.append(sel, inp);
        return { row, sel, inp };
      });
      for (const r of rows) V.radixRows.appendChild(r.row);
      syncRadix();

      view.querySelector('#cdcRadixMore').addEventListener('click', () => {
        V.radixGrid.hidden = !V.radixGrid.hidden;
        if (!V.radixGrid.hidden) {
          V.radixGrid.innerHTML = '';
          for (let r = 2; r <= 64; r++) {
            const v = S.radixVal === undefined ? '' : D.bigToStr(S.radixVal, r);
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn ghost cdc-rcell';
            b.textContent = String(r);
            b.title = v;
            b.addEventListener('click', async () => {
              if (!v) return;
              await navigator.clipboard.writeText(v);
              flash(b, t('copied'));
            });
            V.radixGrid.appendChild(b);
          }
        }
      });
    }
    function syncRadix(skipIdx) {
      if (!V.radixRows) return;
      [...V.radixRows.children].forEach((row, i) => {
        if (i === skipIdx) return;
        const inp = row.querySelector('.cdc-rin');
        inp.classList.remove('err');
        inp.value = S.radixVal === undefined ? '' : D.bigToStr(S.radixVal, S.radixRows[i]);
      });
    }

    /* ================= hash view ================= */
    function buildHashView() {
      view.innerHTML = `
        <div class="cdc-hash">
          <div class="cdc-hash-top">
            <div class="cdc-pane-head"><span>${t('in')}</span><span class="cdc-head-ops" id="cdcHashOpts"></span></div>
            <textarea id="cdcHashIn" class="cdc-ta" spellcheck="false" placeholder="${t('ph')}"></textarea>
          </div>
          <div class="cdc-hash-grid" id="cdcHashGrid"></div>
        </div>`;
      V.hIn = view.querySelector('#cdcHashIn');
      V.hGrid = view.querySelector('#cdcHashGrid');
      const opts = view.querySelector('#cdcHashOpts');
      const mkChk = (key, label) => {
        const lab = document.createElement('label');
        lab.className = 'cdc-chk';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = S.hash[key];
        cb.addEventListener('change', () => { S.hash[key] = cb.checked; runHash(); });
        lab.append(cb, document.createTextNode(label));
        opts.appendChild(lab);
        return cb;
      };
      mkChk('upper', t('hashUpper'));
      mkChk('perLine', t('hashPerLine'));
      const hmacCb = mkChk('hmac', t('hashHmac'));
      const mkInput = (ph, id) => {
        const i = document.createElement('input');
        i.className = 'cdc-mini cdc-txt';
        i.placeholder = ph;
        i.id = id;
        i.addEventListener('input', runHash);
        opts.appendChild(i);
        return i;
      };
      const hmacKey = mkInput(`HMAC ${t('hashKey')}`, 'cdcHashHmac');
      hmacKey.hidden = !S.hash.hmac;
      hmacCb.addEventListener('change', () => { hmacKey.hidden = !hmacCb.checked; });
      const salt = mkInput(t('hashSalt'), 'cdcHashSalt');
      V.hHmac = hmacKey; V.hSalt = salt;
      V.hIn.addEventListener('input', () => later(runHash, 300));
      V.hIn.value = S.hashRaw;
      hmacKey.value = S.hash.hmacKey;
      salt.value = S.hash.salt;
      V.hGrid.innerHTML = `<span class="hint">${t('hashEmpty')}</span>`;
      if (call) call('digestAlgos').then(algos => {
        S.hashAlgos = algos;
        runHash();
      }).catch(() => {});
    }

    let hashSeq = 0;
    async function runHash() {
      if (S.cat !== 'hash' || !V.hIn || !call) return;
      hashSeq++;
      const seq = hashSeq;
      const input = V.hIn.value;
      if (!input.trim()) { V.hGrid.innerHTML = `<span class="hint">${t('hashEmpty')}</span>`; return; }
      try {
        const res = await call('hash', {
          input, algos: S.hashAlgos, perLine: S.hash.perLine,
          hmacKey: S.hash.hmac ? V.hHmac.value : '', salt: V.hSalt.value,
        });
        if (seq !== hashSeq) return;
        V.hGrid.innerHTML = '';
        for (const algo of S.hashAlgos) {
          const raw = res[algo];
          if (!raw) continue;
          const val = S.hash.perLine ? raw.map(x => S.hash.upper ? x.toUpperCase() : x).join('\n')
            : (S.hash.upper ? raw.toUpperCase() : raw);
          const card = document.createElement('div');
          card.className = 'cdc-hcard';
          card.innerHTML = `<div class="cdc-hcard-head"><span>${algo.toUpperCase()}</span><span class="hint">${val.length} ${t('chars')}</span></div>
            <div class="cdc-hval mono" tabindex="0"></div>
            <button type="button" class="btn ghost cdc-hcopy">${t('copyOut')}</button>`;
          card.querySelector('.cdc-hval').textContent = val;
          card.querySelector('.cdc-hcopy').addEventListener('click', async e => {
            await navigator.clipboard.writeText(val);
            flash(e.currentTarget, t('hashCopied'));
          });
          V.hGrid.appendChild(card);
        }
        later(pushHistCur, 800, input);
      } catch (e) {
        V.hGrid.innerHTML = `<span class="hint" style="color:var(--red)">${esc(e.message)}</span>`;
      }
    }

    /* ================= cipher view ================= */
    const CIPHER_LABELS = {
      'aes-128-cbc': 'AES-128-CBC', 'aes-192-cbc': 'AES-192-CBC', 'aes-256-cbc': 'AES-256-CBC',
      'aes-128-ecb': 'AES-128-ECB', 'aes-192-ecb': 'AES-192-ECB', 'aes-256-ecb': 'AES-256-ECB',
      'aes-128-ctr': 'AES-128-CTR', 'aes-192-ctr': 'AES-192-CTR', 'aes-256-ctr': 'AES-256-CTR',
      'des-cbc': 'DES-CBC', 'des-ede3-cbc': '3DES-CBC', 'rc4': 'RC4',
    };
    function buildCipherView() {
      view.innerHTML = `
        <div class="cdc-cipher">
          <div class="cdc-cf">
            <div class="seg" id="cipOp"></div>
            <select class="cdc-mini" id="cipAlgo"></select>
            <div class="seg" id="cipMode"></div>
            <span class="grow"></span>
            <label class="cdc-chk cdc-kdf" id="cipKdfWrap">${t('cipKdf')} <select class="cdc-mini" id="cipKdf"></select></label>
          </div>
          <div class="cdc-cf" id="cipPwdRow">
            <label>${t('cipPwd')} <input class="cdc-txt" id="cipPwd" spellcheck="false" autocomplete="off"></label>
            <span class="hint">${t('cipPwdHint')}</span>
          </div>
          <div class="cdc-cf" id="cipKeyRow">
            <label>${t('cipKey')} <input class="cdc-txt mono" id="cipKey" spellcheck="false" autocomplete="off"></label>
            <select class="cdc-mini" id="cipKeyFmt"><option value="utf8">utf8</option><option value="hex">hex</option></select>
            <label id="cipIvWrap">${t('cipIv')} <input class="cdc-txt mono" id="cipIv" spellcheck="false" autocomplete="off"></label>
            <select class="cdc-mini" id="cipIvFmt"><option value="utf8">utf8</option><option value="hex">hex</option></select>
            <label id="cipPadWrap">${t('cipPad')} <select class="cdc-mini" id="cipPad"><option value="pkcs7">PKCS7</option><option value="none">None</option></select></label>
          </div>
          <div class="cdc-body">
            <div class="cdc-pane">
              <div class="cdc-pane-head"><span>${t('in')}</span><select class="cdc-mini" id="cipInFmt"></select><span class="hint" id="cipStat"></span></div>
              <textarea id="cipIn" class="cdc-ta" spellcheck="false" placeholder="${t('ph')}"></textarea>
            </div>
            <div class="cdc-pane">
              <div class="cdc-pane-head"><span>${t('out')}</span><select class="cdc-mini" id="cipOutFmt"></select><span class="hint"></span></div>
              <textarea id="cipOut" class="cdc-ta" readonly spellcheck="false"></textarea>
            </div>
          </div>
        </div>`;
      V.cIn = view.querySelector('#cipIn');
      V.cOut = view.querySelector('#cipOut');
      V.cStat = view.querySelector('#cipStat');

      const opSeg = view.querySelector('#cipOp');
      const modeSeg = view.querySelector('#cipMode');
      const algoSel = view.querySelector('#cipAlgo');
      const kdfWrap = view.querySelector('#cipKdfWrap');
      const kdfSel = view.querySelector('#cipKdf');
      const padWrap = view.querySelector('#cipPadWrap');
      const ivWrap = view.querySelector('#cipIvWrap');

      const segBtn = (parent, val, label) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = label; b.dataset.v = val;
        parent.appendChild(b);
        return b;
      };
      segBtn(opSeg, 'encrypt', t('cipEnc'));
      segBtn(opSeg, 'decrypt', t('cipDec'));
      segBtn(modeSeg, 'password', t('cipPwdMode'));
      segBtn(modeSeg, 'key', t('cipKeyMode'));
      const syncCipSegs = () => {
        opSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === S.cip.op)));
        modeSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === S.cip.mode)));
      };
      opSeg.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b || b.dataset.v === S.cip.op) return;
        S.cip.op = b.dataset.v;
        // sensible per-direction defaults; user can still override afterwards
        S.cip.inFmt = S.cip.op === 'encrypt' ? 'text' : 'base64';
        S.cip.outFmt = S.cip.op === 'encrypt' ? 'base64' : 'text';
        view.querySelector('#cipInFmt').value = S.cip.inFmt;
        view.querySelector('#cipOutFmt').value = S.cip.outFmt;
        syncCipSegs(); runCipher();
      });
      modeSeg.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        S.cip.mode = b.dataset.v;
        syncCipSegs(); syncCipherRows(); runCipher();
      });

      for (const [v, lab] of [['text', 'text'], ['base64', 'base64'], ['hex', 'hex']]) {
        view.querySelector('#cipInFmt').add(new Option(lab, v));
        view.querySelector('#cipOutFmt').add(new Option(lab, v));
      }
      view.querySelector('#cipInFmt').value = S.cip.inFmt;
      view.querySelector('#cipOutFmt').value = S.cip.outFmt;
      view.querySelector('#cipInFmt').addEventListener('change', e => { S.cip.inFmt = e.target.value; runCipher(); });
      view.querySelector('#cipOutFmt').addEventListener('change', e => { S.cip.outFmt = e.target.value; runCipher(); });

      kdfSel.add(new Option('MD5', 'md5'));
      kdfSel.add(new Option('SHA-256', 'sha256'));
      kdfSel.value = S.cip.kdf;
      kdfSel.addEventListener('change', () => { S.cip.kdf = kdfSel.value; runCipher(); });

      if (call) call('ciphers').then(list => {
        algoSel.innerHTML = '';
        for (const a of list) algoSel.add(new Option(CIPHER_LABELS[a] || a, a));
        if (!list.includes(S.cip.algo)) S.cip.algo = list[0];
        algoSel.value = S.cip.algo;
        syncCipherRows();
      }).catch(() => {});
      algoSel.addEventListener('change', () => {
        S.cip.algo = algoSel.value;
        if (S.cip.algo === 'rc4' && S.cip.mode === 'password') { S.cip.mode = 'key'; syncCipSegs(); }
        syncCipherRows(); runCipher();
      });

      const bind = (sel, key) => view.querySelector(sel).addEventListener('input', e => {
        S.cip[key] = e.target.value;
        later(runCipher, 200);
      });
      bind('#cipPwd', 'pwd'); bind('#cipKey', 'key'); bind('#cipIv', 'iv');
      view.querySelector('#cipKeyFmt').addEventListener('change', e => { S.cip.keyFmt = e.target.value; runCipher(); });
      view.querySelector('#cipIvFmt').addEventListener('change', e => { S.cip.ivFmt = e.target.value; runCipher(); });
      view.querySelector('#cipPad').addEventListener('change', e => { S.cip.pad = e.target.value; runCipher(); });
      view.querySelector('#cipKeyFmt').value = S.cip.keyFmt;
      view.querySelector('#cipIvFmt').value = S.cip.ivFmt;
      view.querySelector('#cipPad').value = S.cip.pad;
      V.cIn.value = S.cipRaw;
      view.querySelector('#cipPwd').value = S.cip.pwd;
      view.querySelector('#cipKey').value = S.cip.key;
      view.querySelector('#cipIv').value = S.cip.iv;

      function syncCipherRows() {
        const pwdRow = view.querySelector('#cipPwdRow');
        const keyRow = view.querySelector('#cipKeyRow');
        const isPwd = S.cip.mode === 'password';
        pwdRow.hidden = !isPwd;
        keyRow.hidden = isPwd;
        kdfWrap.hidden = !isPwd;
        const algo = S.cip.algo;
        ivWrap.hidden = /ecb/.test(algo) || algo === 'rc4';
        view.querySelector('#cipIvFmt').style.visibility = ivWrap.hidden ? 'hidden' : 'visible';
        padWrap.hidden = /ctr/.test(algo) || algo === 'rc4';
      }
      syncCipherRows();
      syncCipSegs();
      V.cIn.addEventListener('input', () => later(runCipher, 300));
    }

    let cipSeq = 0;
    async function runCipher() {
      if (S.cat !== 'cipher' || !V.cIn || !call) return;
      cipSeq++;
      const seq = cipSeq;
      V.cOut.value = ''; V.cStat.textContent = '';
      V.cOut.classList.remove('err');
      const input = V.cIn.value;
      if (!input.trim()) return;
      if (S.cip.mode === 'password' && !view.querySelector('#cipPwd').value.trim()) {
        V.cStat.textContent = isZh ? '请输入口令' : 'password required';
        return;
      }
      if (S.cip.mode === 'key' && !view.querySelector('#cipKey').value.trim()) {
        V.cStat.textContent = isZh ? '请输入密钥' : 'key required';
        return;
      }
      V.cStat.textContent = '…';
      try {
        const args = {
          op: S.cip.op, algo: S.cip.algo, input, inputFormat: S.cip.inFmt, outputFormat: S.cip.outFmt,
          padding: S.cip.pad,
        };
        if (S.cip.mode === 'password') {
          args.password = view.querySelector('#cipPwd').value;
          args.kdfDigest = S.cip.kdf;
        } else {
          args.key = view.querySelector('#cipKey').value;
          args.keyFormat = S.cip.keyFmt;
          args.iv = view.querySelector('#cipIv').value;
          args.ivFormat = S.cip.ivFmt;
        }
        const res = await call('cipher', args);
        if (seq !== cipSeq) return;
        V.cOut.value = res;
        V.cStat.textContent = `${res.length} ${t('chars')}`;
        later(pushHistCur, 800, input);
      } catch (e) {
        if (seq !== cipSeq) return;
        V.cOut.classList.add('err');
        V.cStat.textContent = e.message || t('failed');
        return;
      }
      V.cOut.classList.remove('err');
    }

    /* ---------- history popover ---------- */
    const curScope = () =>
      S.cat === 'codec' ? `codec:${S.codec}:${S.mode}`
        : S.cat === 'hash' ? 'hash'
          : S.cat === 'cipher' ? `cipher:${S.cip.op}` : 'radix';
    function pushHistCur(value) { D.pushHist(curScope(), value); }
    function renderHistPop() {
      const list = (D.readHist()[curScope()] || []);
      if (!list.length) { histPop.innerHTML = `<div class="cdc-hist-empty hint">${t('histEmpty')}</div>`; return; }
      const two = n => String(n).padStart(2, '0');
      histPop.innerHTML = `<div class="cdc-hist-list">${list.map((e, i) => {
        const d = new Date(e.t);
        const prev = e.v.length > 60 ? e.v.slice(0, 60) + '…' : e.v;
        return `<div class="cdc-hist-item" data-i="${i}" title="${esc(e.v.slice(0, 500))}"><span class="cdc-hist-t">${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}</span><span class="cdc-hist-v mono">${esc(prev)}</span></div>`;
      }).join('')}</div><button type="button" class="btn ghost danger cdc-hist-clear">${t('histClear')}</button>`;
      histPop.querySelector('.cdc-hist-clear').addEventListener('click', () => {
        const store = D.readHist();
        delete store[curScope()];
        D.writeHist(store);
        renderHistPop();
      });
      histPop.querySelector('.cdc-hist-list').addEventListener('click', e => {
        const item = e.target.closest('.cdc-hist-item');
        if (!item) return;
        const entry = (D.readHist()[curScope()] || [])[Number(item.dataset.i)];
        if (!entry) return;
        fillInput(entry.v);
        histPop.hidden = true;
      });
    }
    function fillInput(value) {
      if (S.cat === 'codec') { V.taIn.value = value; runCodec(); V.taIn.focus(); }
      else if (S.cat === 'hash') { V.hIn.value = value; runHash(); }
      else if (S.cat === 'cipher') { V.cIn.value = value; runCipher(); }
      else if (S.cat === 'radix') {
        const idx = S.radixRows.indexOf(10);
        const row = idx >= 0 ? V.radixRows.children[idx] : V.radixRows.children[0];
        if (row) {
          row.querySelector('.cdc-rin').value = value;
          row.querySelector('.cdc-rin').dispatchEvent(new Event('input'));
        }
      }
    }

    /* ---------- global actions ---------- */
    el.addEventListener('click', async e => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'history') {
        renderHistPop();
        histPop.hidden = !histPop.hidden;
      } else if (act === 'clear') {
        if (S.cat === 'codec') { V.taIn.value = ''; runCodec(); V.taIn.focus(); }
        else if (S.cat === 'hash') { V.hIn.value = ''; runHash(); }
        else if (S.cat === 'cipher') { V.cIn.value = ''; V.cOut.value = ''; V.cStat.textContent = ''; }
        else if (S.cat === 'radix') { S.radixVal = undefined; syncRadix(); V.radixHint.textContent = ''; }
      } else if (act === 'copyOut') {
        const src = S.cat === 'codec' ? V.taOut && V.taOut.value : S.cat === 'cipher' ? V.cOut && V.cOut.value : '';
        if (src) { await navigator.clipboard.writeText(src); flash(b, t('copied')); }
      } else if (act === 'swap') {
        if (S.cat === 'codec' && V.taOut.value) {
          V.taIn.value = V.taOut.value;
          if (D.CODECS[S.codec].encode) S.mode = S.mode === 'encode' ? 'decode' : 'encode';
          renderSub(); renderAll(true);
        } else if (S.cat === 'cipher' && V.cOut.value) {
          V.cIn.value = V.cOut.value;
          S.cip.op = S.cip.op === 'encrypt' ? 'decrypt' : 'encrypt';
          S.cip.inFmt = S.cip.op === 'encrypt' ? 'text' : 'base64';
          S.cip.outFmt = S.cip.op === 'encrypt' ? 'base64' : 'text';
          renderAll(true);
        }
      }
    });
    el.addEventListener('click', e => { // close popovers on outside click
      if (!histPop.hidden && !e.target.closest('#cdcHistPop') && !e.target.closest('#cdcHistBtn')) histPop.hidden = true;
      if (V.radixGrid && !V.radixGrid.hidden && !e.target.closest('#cdcRadixGrid') && !e.target.closest('#cdcRadixMore')) V.radixGrid.hidden = true;
    });
    el.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const a = document.activeElement;
        const pair = S.cat === 'codec' ? [V.taIn, V.taOut] : S.cat === 'cipher' ? [V.cIn, V.cOut] : null;
        if (!pair) return;
        e.preventDefault();
        const to = a === pair[0] ? pair[1] : pair[0];
        to.focus();
        to.select();
      } else if (e.key === 'Escape' && !histPop.hidden) {
        histPop.hidden = true;
      }
    });

    function flash(b, txt) {
      const old = b.textContent;
      b.textContent = txt || t('copied');
      clearTimeout(flashT);
      flashT = setTimeout(() => { b.textContent = old; }, 900);
    }

    /* ---------- sub-bar (codec chips + mode seg) ---------- */
    function renderSub() {
      sub.innerHTML = '';
      if (S.cat !== 'codec') return;
      const chips = document.createElement('div');
      chips.className = 'cdc-chips';
      for (const key of D.CODEC_ORDER) {
        const c = D.CODECS[key];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cdc-chip';
        b.textContent = isZh ? (c.label.zh || c.label.en) : (c.label.en || c.label.zh);
        b.setAttribute('aria-pressed', String(key === S.codec));
        b.dataset.codec = key;
        chips.appendChild(b);
      }
      const modeSeg = document.createElement('div');
      modeSeg.className = 'seg';
      const c = D.CODECS[S.codec];
      const mk = (v, lab) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = lab; b.dataset.mode = v;
        b.setAttribute('aria-pressed', String(v === S.mode));
        return b;
      };
      if (c.encode) {
        const isZip = S.codec === 'gzip';
        modeSeg.append(mk('encode', isZip ? t('modeZip') : t('modeEnc')), mk('decode', isZip ? t('modeUnzip') : t('modeDec')));
      }
      sub.append(chips, modeSeg);
      chips.addEventListener('click', e => {
        const b = e.target.closest('button[data-codec]');
        if (b && b.dataset.codec !== S.codec) { S.codec = b.dataset.codec; renderAll(); }
      });
      modeSeg.addEventListener('click', e => {
        const b = e.target.closest('button[data-mode]');
        if (b && b.dataset.mode !== S.mode) { S.mode = b.dataset.mode; renderAll(); }
      });
    }

    function renderAll(keepSub) {
      // views are rebuilt on switch — snapshot live inputs first so nothing is lost
      if (S.cat === 'codec' && V.taIn) S.raw = V.taIn.value;
      else if (S.cat === 'hash' && V.hIn) {
        S.hashRaw = V.hIn.value;
        S.hash.hmacKey = V.hHmac.value;
        S.hash.salt = V.hSalt.value;
      } else if (S.cat === 'cipher' && V.cIn) {
        S.cipRaw = V.cIn.value;
        S.cip.pwd = view.querySelector('#cipPwd') ? view.querySelector('#cipPwd').value : S.cip.pwd;
        S.cip.key = view.querySelector('#cipKey') ? view.querySelector('#cipKey').value : S.cip.key;
        S.cip.iv = view.querySelector('#cipIv') ? view.querySelector('#cipIv').value : S.cip.iv;
      }
      catSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === S.cat)));
      if (!keepSub) renderSub();
      btnSwap.style.display = (S.cat === 'codec' || S.cat === 'cipher') ? '' : 'none';
      btnCopy.style.display = (S.cat === 'codec' || S.cat === 'cipher') ? '' : 'none';
      histPop.hidden = true;
      if (S.cat === 'codec') buildCodecView();
      else if (S.cat === 'radix') buildRadixView();
      else if (S.cat === 'hash') buildHashView();
      else buildCipherView();
      if (S.cat === 'codec') {
        runCodec();
        V.taIn.focus();
      } else if (S.cat === 'hash') {
        runHash(); V.hIn.focus();
      } else if (S.cat === 'cipher') {
        runCipher(); V.cIn.focus();
      }
    }

    /* ---------- incoming pipeline payload ---------- */
    if (ctx && ctx.payload) {
      const incoming = typeof ctx.payload === 'string' ? ctx.payload : ctx.payload.value;
      const target = D.PAYLOAD_TARGET[ctx.payload && ctx.payload.type];
      if (incoming && target) {
        S.cat = 'codec';
        [S.codec, S.mode] = target;
      }
      if (incoming) {
        renderAll();
        if (S.cat === 'codec') V.taIn.value = incoming;
        runCodec();
        return finish();
      }
    }

    renderAll();
    finish();

    function finish() {
      cleanup = () => { for (const id of timers) clearTimeout(id); timers.clear(); };
    }
  }

  window.Toolbox.panel({ mount, unmount() { cleanup && cleanup(); } });
})();
