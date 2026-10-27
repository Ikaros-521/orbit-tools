/* port-scope backend — thin IPC surface over ports.js. */
const ports = require('./ports');

module.exports = {
  activate(ctx) {
    ctx.ipc.handle('refresh', async () => {
      const rows = await ports.listPorts();
      // listening sockets are the 99% case; keep established rows too but flag them
      return { rows, ts: Date.now() };
    });
    ctx.ipc.handle('kill', async ({ pid, force }) => ports.killPid(pid, { force: !!force }));
  },
};
