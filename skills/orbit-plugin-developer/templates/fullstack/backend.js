/* 后端主进程模块：拥有完整 Node.js 与 Electron API 能力 */
const os = require('os');

module.exports = {
  activate(ctx) {
    // 1. 注册前端调用的 IPC 处理函数
    ctx.ipc.handle('getSystemStats', async () => {
      const saved = ctx.data.get();
      const count = (saved.callCount || 0) + 1;
      ctx.data.set({ callCount: count, lastCalled: Date.now() });

      return {
        platform: os.platform(),
        arch: os.arch(),
        uptime: Math.round(os.uptime()),
        freeMem: Math.round(os.freemem() / 1024 / 1024),
        totalMem: Math.round(os.totalmem() / 1024 / 1024),
        callCount: count,
      };
    });

    // 2. 注册快捷键绑定的动作处理函数 (对应 plugin.json 中的 method)
    ctx.ipc.handle('ping', async () => {
      ctx.send('from-backend', { message: 'Hello from action hotkey!' });
      return { ok: true };
    });
  },

  deactivate() {
    // 插件禁用或重新扫描时的清理工作
  }
};
