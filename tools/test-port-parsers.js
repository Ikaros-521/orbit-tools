/* Parser unit tests for port-scope — plain asserts, run with `node tools/test-port-parsers.js`. */
const assert = require('assert');
const { parseNetstat, parseLsof, parseSs } = require('../src/plugins/port-scope/ports');

/* --- netstat (windows) -------------------------------------------------------- */
const NETSTAT_SAMPLE = `
  协议  本地地址          外部地址        状态           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1052
  TCP    192.168.1.5:52008      151.101.1.69:443       ESTABLISHED     22716
  TCP    [::1]:3000             [::]:0                 LISTENING       40212
  UDP    0.0.0.0:5353           *:*                                    4120
`;
{
  const rows = parseNetstat(NETSTAT_SAMPLE);
  assert.strictEqual(rows.length, 4, `netstat rows: ${rows.length}`);
  const tcp135 = rows.find(r => r.port === 135);
  assert.ok(tcp135, 'missing 135');
  assert.strictEqual(tcp135.proto, 'TCP');
  assert.strictEqual(tcp135.state, 'LISTENING');
  assert.strictEqual(tcp135.pid, 1052);
  const est = rows.find(r => r.port === 52008);
  assert.strictEqual(est.state, 'ESTABLISHED');
  assert.strictEqual(est.remote, '151.101.1.69:443');
  const v6 = rows.find(r => r.port === 3000);
  assert.strictEqual(v6.local, '[::1]:3000');
  assert.strictEqual(v6.state, 'LISTENING');
  const udp = rows.find(r => r.proto === 'UDP');
  assert.strictEqual(udp.port, 5353);
  assert.strictEqual(udp.state, '');
  assert.strictEqual(udp.remote, '*:*');
}

/* --- lsof -F pcnPT (macos) ------------------------------------------------------ */
const LSOF_SAMPLE = `
p1052
claunchd
n*:135 (LISTEN)
TST=LISTEN
Ptcp
p40212
cnode
n[::1]:3000 (LISTEN)
Ptcp
p4120
cmtmDNSResponder
n*:5353
Pudp
`;
{
  const rows = parseLsof(LSOF_SAMPLE);
  assert.strictEqual(rows.length, 3, `lsof rows: ${rows.length}`);
  const node = rows.find(r => r.port === 3000);
  assert.ok(node, 'missing node row');
  assert.strictEqual(node.process, 'node');
  assert.strictEqual(node.pid, 40212);
  assert.strictEqual(node.proto, 'TCP');
  assert.strictEqual(node.local, '[::1]:3000');
  const dns = rows.find(r => r.proto === 'UDP');
  assert.strictEqual(dns.process, 'mtmDNSResponder');
  assert.strictEqual(dns.port, 5353);
}

/* --- ss -tunlp4a (linux) --------------------------------------------------------- */
const SS_SAMPLE = `
Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:Port  Process
udp   UNCONN 0      0      0.0.0.0:5353         0.0.0.0:*
tcp   LISTEN 0      511    127.0.0.1:3000       0.0.0.0:*          users:(("node",pid=40212,fd=18))
tcp   ESTAB  0      0      192.168.1.5:52008    151.101.1.69:443   users:(("chrome",pid=22716,fd=32))
`;
{
  const rows = parseSs(SS_SAMPLE);
  assert.strictEqual(rows.length, 3, `ss rows: ${rows.length}`);
  const node = rows.find(r => r.port === 3000);
  assert.ok(node, 'missing ss node row');
  assert.strictEqual(node.process, 'node');
  assert.strictEqual(node.pid, 40212);
  assert.strictEqual(node.state, 'LISTEN');
  assert.strictEqual(node.local, '127.0.0.1:3000');
  const chrome = rows.find(r => r.pid === 22716);
  assert.strictEqual(chrome.process, 'chrome');
  assert.strictEqual(chrome.remote, '151.101.1.69:443');
}

/* --- killPid guards ---------------------------------------------------------------- */
{
  const ports = require('../src/plugins/port-scope/ports');
  assert.rejects(() => ports.killPid(1), /refusing/);
  assert.rejects(() => ports.killPid(0), /bad pid/);
  assert.rejects(() => ports.killPid(-5), /bad pid/);
  assert.rejects(() => ports.killPid(1.5), /bad pid/);
}

console.log('port-scope parser tests: all pass');
