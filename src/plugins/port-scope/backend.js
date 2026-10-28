/* port-scope backend — thin IPC surface over ports.js. */
const ports = require('./ports');

module.exports = {
  activate(ctx) {
    ctx.ipc.handle('refresh', async () => {
      const rows = await ports.listPorts();
      // listening sockets are the 99% case; keep established rows too but flag them
      return { rows, ts: Date.now() };
    });
    ctx.ipc.handle('inspectPort', async ({ port }) => {
      const p = Number(port);
      if (!p || p < 1 || p > 65535) return { ok: false, error: 'invalid port' };
      const rows = await ports.listPorts();
      const matches = rows.filter(r => r.port === p);
      return { ok: true, port: p, matches };
    });
    ctx.ipc.handle('kill', async ({ pid, force }) => ports.killPid(pid, { force: !!force }));
  },
};
