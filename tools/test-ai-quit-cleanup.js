/* Regression test for the shutdown process-tree kill race (win32).
   Background: taskkill fired without waiting loses the race against the app's
   own exit — when Electron's main process dies, the cmd.exe wrapper (stdio
   pipes on our side) goes down with it, so taskkill's /T enumeration finds
   nothing and the real server/command grandchild survives as an orphan.
   Measured with the old fire-and-forget path: 5/5 quit attempts leaked.
   The shutdown path therefore kills synchronously: conn.dispose(true) and
   killRunningCommands(streamId, true) block until the tree is down.
   Run with: node tools/test-ai-quit-cleanup.js */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PLUGIN = path.join(__dirname, '..', 'src', 'plugins', 'ai-chat');

if (process.platform !== 'win32') {
  console.log('SKIP: quit-race regression is win32-specific');
  process.exit(0);
}

const MARKER = 'orbit-quit-cleanup-probe';
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-quit-'));

/* Fake MCP stdio server answering initialize; the node grandchild ignores
   stdin EOF and stays alive, like a real npx-spawned server that outlives
   its cmd.exe wrapper. */
fs.writeFileSync(path.join(DIR, `${MARKER}.js`),
  'const rl=require("readline").createInterface({input:process.stdin});\n' +
  'rl.on("line",l=>{let m;try{m=JSON.parse(l)}catch{return}\n' +
  'if(m.id===undefined)return;\n' +
  'const r=m.method==="initialize"?{protocolVersion:"2024-11-05",capabilities:{},serverInfo:{name:"probe",version:"1"}}:{};\n' +
  'process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:m.id,result:r})+"\\n")});\n' +
  'setInterval(()=>{},10000);\n');
fs.writeFileSync(path.join(DIR, `${MARKER}.cmd`), `@echo off\r\nnode "%~dp0${MARKER}.js"\r\n`);

/* CIM query helper: JSON array even for 0/1 hits. Query powershell excludes
   itself via the Name filter. */
const cim = ps => {
  let out = '';
  try {
    out = execFileSync('powershell.exe',
      ['-NoProfile', '-Command', `$ErrorActionPreference='SilentlyContinue'; ${ps}`],
      { encoding: 'utf8', windowsHide: true }).trim();
  } catch { return []; }
  if (!out) return [];
  try { const j = JSON.parse(out); return Array.isArray(j) ? j : (j && j.ProcessId ? [j] : []); } catch { return []; }
};
const probeTree = () => cim(
  `Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'cmd.exe' -or $_.Name -eq 'node.exe') -and $_.CommandLine -match '${MARKER}' } | Select-Object ProcessId,Name | ConvertTo-Json -Compress`);
const probePings = () => cim(
  `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'ping.exe' -and $_.CommandLine -match '300 127' } | Select-Object ProcessId | ConvertTo-Json -Compress`);
const cleanup = () => {
  for (const p of probeTree()) { try { require('child_process').spawnSync('taskkill', ['/F', '/T', '/PID', String(p.ProcessId)], { stdio: 'ignore' }); } catch {} }
  for (const p of probePings()) { try { require('child_process').spawnSync('taskkill', ['/F', '/PID', String(p.ProcessId)], { stdio: 'ignore' }); } catch {} }
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}
};

(async () => {
  const { McpServerConnection } = require(path.join(PLUGIN, 'mcp-client.js'));
  const { executeLocalTool, killRunningCommands } = require(path.join(PLUGIN, 'local-tools.js'));

  // --- MCP stdio: sync dispose returns only after the whole cmd->node tree is dead
  const conn = new McpServerConnection({ command: path.join(DIR, `${MARKER}.cmd`) });
  await conn.start();
  assert(probeTree().some(p => p.Name === 'node.exe'), 'probe node.exe should be alive before dispose');
  conn.dispose(true);
  assert.strictEqual(probeTree().length, 0, 'sync dispose must leave no orphaned tree');
  console.log('PASS: sync MCP dispose kills the cmd->node tree before returning');

  // --- shell: sync killRunningCommands takes the ping grandchild with it
  const streamId = 'quit-cleanup-test';
  const before = probePings().length;
  const done = executeLocalTool('run_command',
    { command: 'ping -n 300 127.0.0.1 >nul', timeout_ms: 60000 }, { streamId });
  await new Promise(r => setTimeout(r, 1500));
  assert.strictEqual(probePings().length, before + 1, 'ping grandchild should be running');
  killRunningCommands(streamId, true);
  assert.strictEqual(probePings().length, before, 'sync kill must leave no orphaned ping');
  await done;
  console.log('PASS: sync killRunningCommands kills the shell grandchild');

  cleanup();
  console.log('ALL QUIT-CLEANUP TESTS PASSED');
})().catch(e => {
  cleanup();
  console.error('FAIL:', e && e.message || e);
  process.exit(1);
});
