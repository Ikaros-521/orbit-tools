/* Plugin Worker Host - Worker Thread Sandbox
   Hosts non-privileged and user-installed plugin backends inside dedicated
   Worker Threads to achieve complete crash isolation and fault tolerance.
   The main Electron process will never crash from unhandled worker exceptions. */
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

if (isMainThread) {
  /* --- Main Process Controller -------------------------------------------- */
  class PluginWorkerHost extends EventEmitter {
    constructor({ plugin, dataRoot, broadcast, callPlugin }) {
      super();
      this.plugin = plugin;
      this.dataRoot = dataRoot;
      this.broadcast = broadcast;
      this.callPlugin = callPlugin;
      this.worker = null;
      this.seq = 0;
      this.pendingCalls = new Map(); // reqId -> { resolve, reject, timer }
      this.isStarted = false;
    }

    async start() {
      return new Promise((resolve, reject) => {
        try {
          const backendFile = path.resolve(this.plugin.root, this.plugin.manifest.backend);
          this.worker = new Worker(__filename, {
            workerData: {
              pluginId: this.plugin.id,
              pluginRoot: this.plugin.root,
              backendFile,
              dataRoot: this.dataRoot,
            },
          });

          const onStartError = err => {
            this.cleanup();
            reject(new Error(`Worker host start failed: ${err.message}`));
          };

          this.worker.once('error', onStartError);

          this.worker.on('message', msg => {
            if (!msg || typeof msg !== 'object') return;

            if (msg.type === 'ready') {
              this.worker.removeListener('error', onStartError);
              this.isStarted = true;
              resolve(true);
              return;
            }

            if (msg.type === 'broadcast') {
              if (typeof this.broadcast === 'function') {
                this.broadcast(this.plugin.id, msg.channel, msg.payload);
              }
              return;
            }

            if (msg.type === 'call-plugin') {
              if (typeof this.callPlugin === 'function') {
                this.callPlugin(msg.targetId, msg.method, msg.args)
                  .then(result => {
                    if (this.worker) {
                      this.worker.postMessage({ type: 'call-plugin-reply', callId: msg.callId, result });
                    }
                  })
                  .catch(err => {
                    if (this.worker) {
                      this.worker.postMessage({ type: 'call-plugin-reply', callId: msg.callId, error: err.message });
                    }
                  });
              }
              return;
            }

            if (msg.type === 'call-result') {
              const pending = this.pendingCalls.get(msg.reqId);
              if (pending) {
                clearTimeout(pending.timer);
                this.pendingCalls.delete(msg.reqId);
                pending.resolve(msg.result);
              }
              return;
            }

            if (msg.type === 'call-error') {
              const pending = this.pendingCalls.get(msg.reqId);
              if (pending) {
                clearTimeout(pending.timer);
                this.pendingCalls.delete(msg.reqId);
                pending.reject(new Error(msg.error || 'Worker execution failed'));
              }
              return;
            }
          });

          this.worker.on('error', err => {
            console.error(`[WorkerHost:${this.plugin.id}] Error:`, err && err.message);
            this.emit('crash', err);
            this._rejectAllPending(new Error(`Worker crashed: ${err.message}`));
          });

          this.worker.on('exit', code => {
            if (code !== 0) {
              console.warn(`[WorkerHost:${this.plugin.id}] Exited with non-zero code ${code}`);
              this.emit('exit', code);
              this._rejectAllPending(new Error(`Worker exited unexpectedly with code ${code}`));
            }
            this.cleanup();
          });
        } catch (err) {
          reject(err);
        }
      });
    }

    async call(method, args, { timeoutMs = 25000 } = {}) {
      if (this.startPromise) {
        await this.startPromise;
      }
      if (!this.worker || !this.isStarted) {
        throw new Error(`Worker host for "${this.plugin.id}" is not running`);
      }

      return new Promise((resolve, reject) => {
        const reqId = ++this.seq;
        const timer = setTimeout(() => {
          this.pendingCalls.delete(reqId);
          reject(new Error(`Worker call "${this.plugin.id}:${method}" timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        this.pendingCalls.set(reqId, { resolve, reject, timer });
        this.worker.postMessage({ type: 'call', reqId, method, args });
      });
    }

    _rejectAllPending(err) {
      for (const [, pending] of this.pendingCalls) {
        clearTimeout(pending.timer);
        pending.reject(err);
      }
      this.pendingCalls.clear();
    }

    cleanup() {
      this.isStarted = false;
      this._rejectAllPending(new Error('Worker host terminated'));
    }

    terminate() {
      const w = this.worker;
      this.worker = null;
      this.cleanup();
      if (w) {
        try { w.terminate(); } catch {}
      }
    }
  }

  module.exports = { PluginWorkerHost };
} else {
  /* --- Worker Thread Execution Context ------------------------------------ */
  const handlers = new Map();
  let dataCache = null;

  const getDataFile = () => path.join(workerData.dataRoot, `${workerData.pluginId}.json`);

  const readData = () => {
    if (!dataCache) {
      try {
        dataCache = JSON.parse(fs.readFileSync(getDataFile(), 'utf8'));
      } catch {
        dataCache = {};
      }
    }
    return dataCache;
  };

  const ctx = {
    id: workerData.pluginId,
    root: workerData.pluginRoot,
    url: rel => `plugin://${workerData.pluginId}/${String(rel).replace(/^\/+/, '')}`,
    send: (channel, payload) => {
      parentPort.postMessage({ type: 'broadcast', channel, payload });
    },
    ipc: {
      handle: (method, fn) => {
        handlers.set(method, fn);
      },
    },
    data: {
      get: () => readData(),
      set: patch => {
        dataCache = { ...readData(), ...patch };
        try {
          fs.mkdirSync(workerData.dataRoot, { recursive: true });
          const tmp = `${getDataFile()}.tmp`;
          fs.writeFileSync(tmp, JSON.stringify(dataCache, null, 2));
          fs.renameSync(tmp, getDataFile());
        } catch (err) {
          console.error(`[Worker:${workerData.pluginId}] data persist failed:`, err.message);
        }
        return dataCache;
      },
    },
    callPlugin: (id, method, args) => {
      return new Promise((resolve, reject) => {
        const callId = `cp-${Date.now()}-${Math.random()}`;
        const onReply = msg => {
          if (msg && msg.type === 'call-plugin-reply' && msg.callId === callId) {
            parentPort.removeListener('message', onReply);
            if (msg.error) reject(new Error(msg.error));
            else resolve(msg.result);
          }
        };
        parentPort.on('message', onReply);
        parentPort.postMessage({ type: 'call-plugin', callId, targetId: id, method, args });
      });
    },
    windows: {
      create: () => {
        throw new Error(`Worker-isolated plugin "${workerData.pluginId}" cannot directly create BrowserWindow.`);
      },
      closeAll: () => {},
    },
  };

  process.on('uncaughtException', err => {
    console.error(`[Worker:${workerData.pluginId}] Uncaught Exception:`, err);
  });

  process.on('unhandledRejection', reason => {
    console.error(`[Worker:${workerData.pluginId}] Unhandled Rejection:`, reason);
  });

  try {
    const mod = require(workerData.backendFile);
    if (mod && typeof mod.activate === 'function') {
      mod.activate(ctx);
    }
    parentPort.postMessage({ type: 'ready' });
  } catch (err) {
    console.error(`[Worker:${workerData.pluginId}] activate() failed:`, err);
    throw err;
  }

  parentPort.on('message', async msg => {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'call') {
      const fn = handlers.get(msg.method);
      if (typeof fn !== 'function') {
        parentPort.postMessage({
          type: 'call-error',
          reqId: msg.reqId,
          error: `no handler for "${workerData.pluginId}:${msg.method}"`,
        });
        return;
      }

      try {
        const result = await fn(msg.args);
        parentPort.postMessage({ type: 'call-result', reqId: msg.reqId, result });
      } catch (err) {
        parentPort.postMessage({
          type: 'call-error',
          reqId: msg.reqId,
          error: (err && err.message) || String(err),
        });
      }
    }
  });
}
