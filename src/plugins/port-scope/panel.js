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
    let filter = '';
    let protoOn = { TCP: true, UDP: true };
    let listenOnly = true;
    let busy = false;
    let sortKey = 'port';
    let sortDir = 1;

    el.innerHTML = `
      <div class="tool-bar">
        <div class="seg"><button data-proto="TCP" class="on">TCP</button><button data-proto="UDP" class="on">UDP</button></div>
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

    const tbody = el.querySelector('tbody');
    const statEl = el.querySelector('[data-role=stat]');
    const filterEl = el.querySelector('[data-role=filter]');
    const table = el.querySelector('.ps-table');
    const emptyEl = el.querySelector('.ps-empty');

    const rendered = () => {
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

    const render = () => {
      const list = rendered();
      tbody.innerHTML = '';
      for (const r of list) {
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
          b.addEventListener('click', async () => {
            const name = r.process || `pid ${r.pid}`;
            if (!window.confirm(T.confirmKill.replace('{name}', name).replace('{pid}', r.pid))) return;
            b.disabled = true;
            try {
              const res = await ctx.call('kill', { pid: r.pid, force: false });
              if (res && res.ok) statEl.textContent = T.killed.replace('{pid}', r.pid);
            } catch (err) {
              statEl.textContent = `${T.killFail}: ${err.message}`;
              b.disabled = false;
              return;
            }
            setTimeout(refresh, 350);
          });
          act.appendChild(b);
        }
        tr.appendChild(act);
        tbody.appendChild(tr);
      }
      emptyEl.hidden = list.length > 0;
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
      renderStatAndTable();
    }
    const renderStatAndTable = () => {
      const list = rendered();
      statEl.textContent = `${list.length} / ${rows.length}`;
      render();
    };

    el.addEventListener('click', e => {
      const pb = e.target.closest('button[data-proto]');
      if (pb) {
        protoOn[pb.dataset.proto] = !protoOn[pb.dataset.proto];
        pb.classList.toggle('on', protoOn[pb.dataset.proto]);
        renderStatAndTable();
        return;
      }
      const act = e.target.closest('button[data-act]');
      if (!act) return;
      if (act.dataset.act === 'refresh') refresh();
      else if (act.dataset.act === 'listen') {
        listenOnly = !listenOnly;
        act.classList.toggle('on', listenOnly);
        act.setAttribute('aria-pressed', String(listenOnly));
        renderStatAndTable();
      }
    });
    filterEl.addEventListener('input', () => { filter = filterEl.value; renderStatAndTable(); });
    table.addEventListener('click', e => {
      const th = e.target.closest('th[data-sort]');
      if (!th) return;
      const key = th.dataset.sort;
      if (sortKey === key) sortDir = -sortDir;
      else { sortKey = key; sortDir = 1; }
      render();
    });

    refresh();
  }

  window.Toolbox.panel({ mount });
})();
