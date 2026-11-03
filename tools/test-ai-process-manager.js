// Test Process Manager & run_command timeout / background lifecycle
const assert = require('assert');
const { executeLocalTool } = require('../src/plugins/ai-chat/local-tools');
const { processManager } = require('../src/plugins/ai-chat/services/process-manager');

async function runTests() {
  console.log('--- 开始测试 ProcessManager 与 run_command 机制 ---');

  // Test 1: Short command should complete normally
  console.log('[Test 1] 运行短命令正常退出...');
  const res1 = await executeLocalTool('run_command', { command: 'node -e "console.log(\'short-test-ok\')"' });
  assert.strictEqual(res1.ok, true, '短命令执行应当 ok');
  assert.strictEqual(res1.exitCode, 0, '退出码应当为 0');
  assert.ok(res1.stdout.includes('short-test-ok'), 'stdout 应当包含 short-test-ok');
  console.log('✓ Test 1 通过');

  // Test 2: Long running command with timeout -> auto background detachment without hanging
  console.log('[Test 2] 运行长驻命令，到点自动转为后台并脱离阻塞...');
  const t0 = Date.now();
  const res2 = await executeLocalTool('run_command', {
    command: 'node -e "setInterval(()=>{}, 1000)"',
    timeout_ms: 1500
  });
  const elapsed2 = Date.now() - t0;
  assert.ok(elapsed2 >= 1300 && elapsed2 < 5000, `应当在 ~1.5s 左右脱离阻塞返回，实际耗时: ${elapsed2}ms`);
  assert.strictEqual(res2.ok, true, '长驻命令到点转后台应当返回 ok: true');
  assert.strictEqual(res2.background, true, '应当标记 background: true');
  assert.ok(typeof res2.pid === 'number' && res2.pid > 0, `应当有合法的子进程 PID: ${res2.pid}`);
  assert.ok(res2.message.includes('后台持续运行'), '提示信息应说明已转入后台持续运行');
  const bgPid = res2.pid;
  console.log(`✓ Test 2 通过 (PID: ${bgPid}, 耗时: ${elapsed2}ms)`);

  // Test 3: list_processes should see the background process
  console.log('[Test 3] 验证 list_processes 能检出后台进程...');
  const res3 = await executeLocalTool('list_processes', {});
  assert.strictEqual(res3.ok, true, 'list_processes 应当成功');
  const found = res3.processes.find(p => p.pid === bgPid);
  assert.ok(found, `list_processes 中应当能找到 PID: ${bgPid}`);
  assert.strictEqual(found.isBackground, true, 'isBackground 应当为 true');
  assert.strictEqual(found.status, 'running', '状态应当为 running');
  console.log('✓ Test 3 通过');

  // Test 4: stop_process should stop the background process
  console.log('[Test 4] 验证 stop_process 终止进程树...');
  const res4 = await executeLocalTool('stop_process', { pid: bgPid });
  assert.strictEqual(res4.ok, true, 'stop_process 应当成功');
  assert.strictEqual(res4.pid, bgPid, '返回 pid 应当匹配');
  // Wait briefly for OS process table update
  await new Promise(r => setTimeout(r, 400));
  const res4Check = await executeLocalTool('list_processes', {});
  const foundAfter = res4Check.processes.find(p => p.pid === bgPid);
  assert.ok(!foundAfter || !foundAfter.isAlive || foundAfter.status === 'killed' || foundAfter.status === 'exited', '进程应当已终止');
  console.log('✓ Test 4 通过');

  // Test 5: kill_on_timeout: true should kill and return timedOut: true
  console.log('[Test 5] 验证 kill_on_timeout 强制终止模式...');
  const t1 = Date.now();
  const res5 = await executeLocalTool('run_command', {
    command: 'node -e "setInterval(()=>{}, 1000)"',
    timeout_ms: 1200,
    kill_on_timeout: true
  });
  const elapsed5 = Date.now() - t1;
  assert.ok(elapsed5 >= 1000 && elapsed5 < 4000, `强制终止应当在 ~1.5s 返回，耗时: ${elapsed5}ms`);
  assert.strictEqual(res5.ok, false, 'kill_on_timeout 超时后 ok 应当为 false');
  assert.strictEqual(res5.timedOut, true, 'timedOut 应当为 true');
  console.log(`✓ Test 5 通过 (耗时: ${elapsed5}ms)`);

  // Test 6: processManager.killAll(true) should clean up all spawned processes
  console.log('[Test 6] 验证 processManager.killAll(true) 安全清理...');
  const res6 = await executeLocalTool('run_command', {
    command: 'node -e "setInterval(()=>{}, 1000)"',
    timeout_ms: 1000
  });
  assert.ok(res6.pid > 0);
  processManager.killAll(true);
  const res6Check = processManager.listProcesses();
  assert.strictEqual(res6Check.length, 0, 'killAll 之后活跃清单应当为空');
  console.log('✓ Test 6 通过');

  console.log('\n========================================');
  console.log('🎉 所有 6 项子进程生命周期与超时测试全部通过！');
  console.log('========================================\n');
}

runTests().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
