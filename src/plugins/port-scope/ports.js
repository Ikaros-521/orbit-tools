/* Platform layer of port-scope: builds the listing command per OS and parses
   its output into rows {proto, local(address), port, remote, state, pid, process}.
   Kept dependency-free and pure so it can be unit-tested with sample output. */
const { execFile } = require('child_process');

const run = (file, args, timeout = 10000) => new Promise((resolve, reject) => {
  execFile(file, args, { windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
    if (err && !stdout) reject(err);
    else resolve(String(stdout));
  });
});

/* --- parsers ------------------------------------------------------------------ */

// Windows: netstat -aon -p tcp|udp — columns are positional-ish; PID is the
// last token, state sits before it for TCP. UDP lines have no state column.
function parseNetstat(text) {
  const rows = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^(TCP|UDP)\s+(\S+)\s+(\S+)(?:\s+(\S+))?\s+(\d+)$/i);
    if (!m) continue;
    const proto = m[1].toUpperCase();
    const local = m[2], remote = m[3];
    const state = proto === 'TCP' ? m[4] : '';
    const pid = Number(m[5]);
    const port = Number(local.match(/:(\d+)$/)?.[1] ?? 0);
    rows.push({ proto, local, port, remote: proto === 'UDP' ? '*:*' : remote, state, pid, process: '' });
  }
  return rows;
}

// macOS/Linux lsof -nP -i -F pcnPT: a record per connection as a run of
// single-letter fields (p pid, c command, P protocol, T state, n addresses).
function parseLsof(text) {
  const rows = [];
  let cur = {};
  const push = () => {
    if (cur.pid && cur.local) {
      rows.push({
        proto: cur.proto || 'TCP',
        local: cur.local,
        port: cur.port,
        remote: cur.remote || '',
        state: cur.state || '',
        pid: Number(cur.pid),
        process: cur.process || '',
      });
    }
    cur = {};
  };
  const addr = n => {
    // "192.168.1.5:52344->151.101.1.69:443" or "[::1]:5000 (LISTEN)" or "*:3000 (LISTEN)"
    const mm = n.match(/^(\S+?)(?::(\d+))?\s*(?:\(([^)]*)\))?$/);
    return mm ? { host: mm[1], port: Number(mm[2] || 0), note: mm[3] || '' } : { host: n, port: 0, note: '' };
  };
  for (const line of text.split(/\r?\n/)) {
    if (!line) { push(); continue; }
    const tag = line[0], val = line.slice(1);
    if (tag === 'p') { push(); cur.pid = val; }
    else if (tag === 'c') cur.process = val;
    else if (tag === 'P') cur.proto = val.toUpperCase();
    else if (tag === 'T') { if (val === 'LISTEN') cur.state = 'LISTEN'; }
    else if (tag === 'n') {
      const sides = val.split('->');
      const l = addr(sides[0].trim());
      cur.local = `${l.host}:${l.port}`;
      cur.port = l.port;
      if (!cur.state && l.note) cur.state = l.note;
      if (sides[1]) cur.remote = sides[1].trim();
    }
  }
  push();
  return rows;
}

// Linux ss -tunlp4/a: header row then whitespace-separated columns.
function parseSs(text) {
  const rows = [];
  const lines = text.split(/\r?\n/).filter(l => l.trim() && !/^netid\s/i.test(l.trim()));
  for (const line of lines) {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5) continue;
    const proto = cols[0].toUpperCase();
    const local = cols[4];
    const remote = cols[5] || '';
    // process info rides in the last column like users:(("node",pid=1234,fd=18))
    const pm = line.match(/users:\(\("([^"]+)",pid=(\d+)/);
    const port = Number(local.match(/:(\d+)$/)?.[1] ?? 0);
    rows.push({
      proto, local, port, remote,
      state: cols[1] === 'UNCONN' ? '' : cols[1],
      pid: pm ? Number(pm[2]) : 0,
      process: pm ? pm[1] : '',
    });
  }
  return rows;
}

/* --- listing ------------------------------------------------------------------ */

async function listPorts() {
  if (process.platform === 'win32') {
    const out = await run('netstat', ['-aon', '-p', 'tcp']).catch(() => '');
    const outUdp = await run('netstat', ['-aon', '-p', 'udp']).catch(() => '');
    const rows = [...parseNetstat(out), ...parseNetstat(outUdp)];
    await attachWindowsNames(rows);
    return rows;
  }
  if (process.platform === 'darwin') {
    const out = await run('lsof', ['-nP', '-i', '-F', 'pcnPT']).catch(() => '');
    return parseLsof(out);
  }
  // linux: ss first (no sudo needed for own processes), fall back to lsof
  let out = await run('ss', ['-tunlp4a']).catch(() => '');
  let rows = out ? parseSs(out) : [];
  if (!rows.length) {
    out = await run('lsof', ['-nP', '-i', '-F', 'pcnPT']).catch(() => '');
    rows = parseLsof(out);
  }
  return rows;
}

// Windows netstat gives bare pids; resolve names with tasklist so the table
// shows "node.exe (1234)" like the unix paths do.
async function attachWindowsNames(rows) {
  const pids = [...new Set(rows.map(r => r.pid).filter(p => p > 0))];
  if (!pids.length) return;
  const out = await run('tasklist', ['/FO', 'CSV', '/NH']).catch(() => '');
  if (!out) return;
  const names = new Map();
  for (const line of out.split(/\r?\n/)) {
    const cols = line.match(/"([^"]*)"/g);
    if (!cols || cols.length < 2) continue;
    const name = cols[0].slice(1, -1);
    const pid = Number(cols[1].slice(1, -1));
    if (pid) names.set(pid, name);
  }
  for (const r of rows) r.process = names.get(r.pid) || '';
}

/* --- kill ---------------------------------------------------------------------- */

async function killPid(pid, { force = false } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('bad pid');
  if (pid === 1 || pid === 0) throw new Error('refusing to kill pid 0/1');
  const protect = new Set([process.pid, ...((process.ppid && [process.ppid]) || [])]);
  if (protect.has(pid)) throw new Error('refusing to kill myself');
  let cmd, args;
  if (process.platform === 'win32') {
    cmd = 'taskkill';
    args = force ? ['/F', '/T', '/PID', String(pid)] : ['/T', '/PID', String(pid)];
  } else {
    cmd = 'kill';
    args = force ? ['-9', String(pid)] : [String(pid)];
  }
  try {
    await run(cmd, args, 8000);
    return { ok: true };
  } catch (err) {
    const msg = String(err.message || err);
    if (/no such process|not found|找不到|无法找到/i.test(msg)) return { ok: true };
    throw err;
  }
}

module.exports = { listPorts, killPid, parseNetstat, parseLsof, parseSs };
