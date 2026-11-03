/* Orbit AI Chat - Subprocess Lifecycle & Process Tree Manager
   Maintains all background processes spawned by run_command / agent tools,
   supports status inspection, process tree killing (taskkill /T /F on Win),
   and guarantees clean shutdown when the application or plugin exits. */

const { spawn, spawnSync } = require('child_process');

class ProcessManager {
  constructor() {
    this.processes = new Map(); // pid -> record
    this._exitHooked = false;
    this.hookExitListeners();
  }

  register(child, { command, workDir, streamId, sessionId, isBackground = false } = {}) {
    if (!child || !child.pid) return null;
    const pid = child.pid;
    const record = {
      pid,
      command: String(command || '').trim(),
      title: (String(command || '').trim().split(/\s+/)[0] || 'process'),
      workDir: workDir || process.cwd(),
      streamId: streamId || null,
      sessionId: sessionId || null,
      startTime: Date.now(),
      status: 'running',
      isBackground: Boolean(isBackground),
      child,
      exitCode: null,
      error: null,
      endTime: null
    };

    this.processes.set(pid, record);

    const onExitOrClose = (code, signal) => {
      if (record.status === 'running') {
        record.status = (signal || (code !== null && code !== 0)) ? 'exited' : 'completed';
        record.exitCode = code;
        record.endTime = Date.now();
      }
    };

    child.once('exit', onExitOrClose);
    child.once('close', onExitOrClose);
    child.once('error', (err) => {
      record.status = 'error';
      record.error = err.message;
      record.endTime = Date.now();
    });

    return record;
  }

  unregister(pid) {
    this.processes.delete(Number(pid));
  }

  getProcess(pid) {
    return this.processes.get(Number(pid));
  }

  listProcesses(sessionId = null) {
    const now = Date.now();
    const list = [];
    for (const [pid, rec] of this.processes.entries()) {
      if (sessionId && rec.sessionId && rec.sessionId !== sessionId) continue;
      // Probe if process is actually still alive
      let isAlive = false;
      try {
        isAlive = process.kill(pid, 0);
      } catch {
        isAlive = false;
      }
      if (!isAlive && rec.status === 'running') {
        rec.status = 'exited';
      }
      list.push({
        pid: rec.pid,
        command: rec.command,
        title: rec.title,
        status: rec.status,
        isAlive,
        startTime: rec.startTime,
        runningTimeMs: (rec.endTime || now) - rec.startTime,
        isBackground: rec.isBackground,
        workDir: rec.workDir
      });
    }
    return list;
  }

  killProcess(pid, sync = false) {
    const numPid = Number(pid);
    if (!numPid) return { ok: false, error: '无效的 PID' };
    const record = this.processes.get(numPid);
    const isWin = process.platform === 'win32';

    try {
      if (isWin) {
        if (sync) {
          spawnSync('taskkill', ['/pid', String(numPid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        } else {
          spawn('taskkill', ['/pid', String(numPid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        }
      } else {
        if (record && record.child) {
          try { record.child.kill('SIGKILL'); } catch {}
        }
        try { process.kill(numPid, 'SIGKILL'); } catch {}
      }
      if (record) {
        record.status = 'killed';
        record.endTime = Date.now();
      }
      this.processes.delete(numPid);
      return { ok: true, pid: numPid, message: `已成功停止子进程树 (PID: ${numPid})` };
    } catch (err) {
      return { ok: false, pid: numPid, error: `停止进程失败: ${err.message}` };
    }
  }

  killAll(sync = false) {
    const pids = Array.from(this.processes.keys());
    for (const pid of pids) {
      try {
        this.killProcess(pid, sync);
      } catch {}
    }
    this.processes.clear();
  }

  hookExitListeners() {
    if (this._exitHooked) return;
    this._exitHooked = true;

    const cleanup = () => {
      try { this.killAll(true); } catch {}
    };

    process.once('exit', cleanup);
    process.once('SIGINT', () => { cleanup(); process.exit(130); });
    process.once('SIGTERM', () => { cleanup(); process.exit(143); });
  }
}

const processManager = new ProcessManager();

module.exports = {
  ProcessManager,
  processManager
};
