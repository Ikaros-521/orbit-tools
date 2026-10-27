/* port-scope panel — table with filter, tcp/udp toggle, kill buttons. */
(function () {
  function mount(el, ctx) {
    const L = ctx.lang;
    const T = {
      zh: { refresh: '刷新', kill: '结束', forceKill: '强制结束', tcp: 'TCP', udp: 'UDP', listen: '仅监听',
        filterPh: '过滤：端口 / 进程 / PID…', pid: 'PID', proto: '协议', local: '本地地址', remote: '远端',
        state: '状态', proc: '进程', killed: '已结束 {pid}', killFail: '结束失败', confirmKill: '结束进程 {name}({pid})？',
        empty: '没有匹配的行', listening: 'LISTEN' },
      en: { refresh: 'Refresh', kill: 'End task', forceKill: 'Force kill', tcp: 'TCP', udp: 'UDP', listen: 'Listen only',
        filterPh: 'filter: port / process / pid…', pid: 'PID', proto: 'Proto', local: 'Local', remote: 'Remote',
        state: 'State', proc: 'Process', killed: 'killed {pid}', killFail: 'kill failed', confirmKill: 'End process {name}({pid})?',
        empty: 'no rows match', listening: 'LISTEN' },
    }[L === 'en' ? 'en' : 'zh'];

    let rows = [];
    let currentList = [];
    let renderedCount = 0;
    const PAGE_SIZE = 80;
    let filter = '';
    let protoOn = { TCP: true, UDP: true };
    let listenOnly = true;
    let busy = false;
    let sortKey = 'port';
    let sortDir = 1;
    let filterTimer = null;

    el.innerHTML = `
      <div class="tool-bar">
        <div class="seg"><button data-proto="TCP" class="on" aria-pressed="true">TCP</button><button data-proto="UDP" class="on" aria-pressed="true">UDP</button></div>
        <button type="button" class="btn" data-act="refresh">${T.refresh}</button>
        <button type="button" class="btn ghost on" data-act="listen" aria-pressed="true">${T.listen}</button>
        <input class="input" data-role="filter" placeholder="${T.filterPh}" spellcheck="false">
        <span class="grow"></span>
        <span class="hint" data-role="stat"></span>
      </div>
      <div class="pane-body ps-body">
        <table class="ps-table">
          <thead>
            <tr>
              <th data-sort="proto">${T.proto}</th>
              <th data-sort="local">${T.local}</th>
              <th data-sort="port">${T.pid === 'PID' ? 'PORT' : '端口'}</th>
              <th data-sort="state">${T.state}</th>
              <th data-sort="pid">${T.pid}</th>
              <th data-sort="process">${T.proc}</th>
              <th>${T.remote}</th>
              <th></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
        <div class="ps-empty" hidden>${T.empty}</div>
      </div>`;

    const bodyEl = el.querySelector('.ps-body');
    const tbody = el.querySelector('tbody');
    const statEl = el.querySelector('[data-role=stat]');
    const filterEl = el.querySelector('[data-role=filter]');
    const table = el.querySelector('.ps-table');
    const emptyEl = el.querySelector('.ps-empty');

    const computeList = () => {
      let out = rows;
      if (listenOnly) out = out.filter(r => !r.state || /LISTEN|listening/i.test(r.state));
      if (!protoOn.TCP) out = out.filter(r => r.proto !== 'TCP');
      if (!protoOn.UDP) out = out.filter(r => r.proto !== 'UDP');
      const q = filter.trim().toLowerCase();
      if (q) out = out.filter(r => `${r.local} ${r.port} ${r.pid} ${r.process} ${r.state}`.toLowerCase().includes(q));
      out = [...out].sort((a, b) => {
        const va = a[sortKey], vb = b[sortKey];
        const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
        return c * sortDir;
      });
      return out;
    };

    const createRow = r => {
      const tr = document.createElement('tr');
      const cells = [
        r.proto === 'TCP' ? 'TCP' : 'UDP',
        r.local,
        String(r.port),
        r.state || '—',
        r.pid ? String(r.pid) : '—',
        r.process || '—',
        r.remote || '—',
      ];
      for (const c of cells) {
        const td = document.createElement('td');
        td.textContent = c;
        tr.appendChild(td);
      }
      const act = document.createElement('td');
      if (r.pid) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn danger small';
        b.textContent = T.kill;
        b.dataset.act = 'kill';
        b.dataset.pid = String(r.pid);
        b.dataset.process = r.process || '';
        act.appendChild(b);
      }
      tr.appendChild(act);
      return tr;
    };

    const renderBatch = count => {
      if (renderedCount >= currentList.length) return;
      const end = Math.min(renderedCount + count, currentList.length);
      const frag = document.createDocumentFragment();
      for (let i = renderedCount; i < end; i++) {
        frag.appendChild(createRow(currentList[i]));
      }
      tbody.appendChild(frag);
      renderedCount = end;
    };

    const resetAndRender = () => {
      currentList = computeList();
      statEl.textContent = `${currentList.length} / ${rows.length}`;
      tbody.innerHTML = '';
      renderedCount = 0;
      renderBatch(PAGE_SIZE);
      emptyEl.hidden = currentList.length > 0;
      statEl.title = '';
    };

    async function refresh() {
      if (busy) return;
      busy = true;
      statEl.textContent = '…';
      try {
        const { rows: r } = await ctx.call('refresh');
        rows = r;
      } catch (err) {
        statEl.textContent = err.message;
      }
      busy = false;
      resetAndRender();
    }

    // Event delegation for kill buttons
    tbody.addEventListener('click', async e => {
      const b = e.target.closest('button[data-act="kill"]');
      if (!b || b.disabled) return;
      const pid = Number(b.dataset.pid);
      const name = b.dataset.process || `pid ${pid}`;
      if (!window.confirm(T.confirmKill.replace('{name}', name).replace('{pid}', pid))) return;
      b.disabled = true;
      try {
        try {
          await ctx.call('kill', { pid, force: false });
        } catch (graceErr) {
          if (!/no such process|not found|找不到|无法找到/i.test(String(graceErr.message))) {
            await ctx.call('kill', { pid, force: true });
          }
        }
        statEl.textContent = T.killed.replace('{pid}', pid);
      } catch (err) {
        statEl.textContent = `${T.killFail}: ${err.message}`;
        b.disabled = false;
        return;
      }
      setTimeout(refresh, 350);
    });

    // Lazy load remaining rows on scroll
    bodyEl.addEventListener('scroll', () => {
      if (bodyEl.scrollTop + bodyEl.clientHeight >= bodyEl.scrollHeight - 200) {
        renderBatch(PAGE_SIZE);
      }
    }, { passive: true });

    el.addEventListener('click', e => {
      const pb = e.target.closest('button[data-proto]');
      if (pb) {
        const proto = pb.dataset.proto;
        protoOn[proto] = !protoOn[proto];
        pb.classList.toggle('on', protoOn[proto]);
        pb.setAttribute('aria-pressed', String(protoOn[proto]));
        resetAndRender();
        return;
      }
      const act = e.target.closest('button[data-act]');
      if (!act) return;
      if (act.dataset.act === 'refresh') refresh();
      else if (act.dataset.act === 'listen') {
        listenOnly = !listenOnly;
        act.classList.toggle('on', listenOnly);
        act.setAttribute('aria-pressed', String(listenOnly));
        resetAndRender();
      }
    });

    filterEl.addEventListener('input', () => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(() => {
        filter = filterEl.value;
        resetAndRender();
      }, 120);
    });

    table.addEventListener('click', e => {
      const th = e.target.closest('th[data-sort]');
      if (!th) return;
      const key = th.dataset.sort;
      if (sortKey === key) sortDir = -sortDir;
      else { sortKey = key; sortDir = 1; }
      resetAndRender();
    });

    refresh();
  }

  window.Toolbox.panel({ mount });
})();
