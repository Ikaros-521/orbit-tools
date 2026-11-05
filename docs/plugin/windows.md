# 独立窗口

截图悬浮、屏幕画板、色彩吸管这类插件需要全屏遮罩或置顶贴图窗口 —— 它们超出了宿主面板容器的表达范围，需要创建插件自有窗口。

## 组成结构

一个独立窗口插件在三件套之外增加窗口四件套：

```
my-plugin/
├── plugin.json
├── panel.js / panel.css        # 主面板：通常只是"启动入口 + 设置"
├── backend.js                  # 创建/管理窗口
├── window.html                 # 窗口页面结构
├── window.css                  # 窗口样式
├── window.js                   # 窗口交互逻辑
└── window-preload.js           # 窗口专属 contextBridge（可选）
```

页面经 `plugin://<id>/window.html` 加载，静态资源同样受路径越界防护。

## 创建窗口

```javascript
// backend.js
module.exports = {
  activate(ctx) {
    let win = null;

    ctx.ipc.handle('open', async () => {
      if (win && !win.isDestroyed()) { win.show(); return; }

      win = ctx.windows.create({
        width: 420, height: 300,
        frame: false,                 // 无边框
        alwaysOnTop: true,            // 置顶
        transparent: true,            // 透明（全屏遮罩类窗口常用）
        resizable: false,
        webPreferences: {
          preload: 'window-preload.js',  // 相对路径自动解析到插件根目录
        },
      });
      await win.loadURL(ctx.url('window.html'));
      win.once('ready-to-show', () => win.show());
    });
  },
};
```

三个关键行为：

1. **隔离默认值不可关闭**：`webPreferences` 浅合并进 `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`，窗口页面与宿主面板同样无 Node 权限；
2. **窗口被宿主跟踪**：插件禁用时全部销毁，不会留孤儿窗口；`closed` 事件后自动移出跟踪集合；
3. **`show` 默认 false**：先 `loadURL` 再 `ready-to-show` 时 `show()`，避免白屏闪烁。

## 窗口 preload

窗口页面要与后端通信时，写一个专属 preload 暴露最小面：

```javascript
// window-preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('winAPI', {
  ok: () => ipcRenderer.invoke('plugin-call', {
    id: 'my-plugin', method: 'confirmCapture', args: {},
  }),
  onCommand: (fn) => {
    const listener = (_e, ev) => fn(ev.payload);
    ipcRenderer.on('plugin-event:my-plugin', listener);
    return () => ipcRenderer.removeListener('plugin-event:my-plugin', listener);
  },
});
```

```javascript
// window.js
window.winAPI.onCommand(({ cmd }) => { if (cmd === 'close') window.close(); });
```

要点：`plugin-call` 的 `id` 必须写**本插件 id**（宿主按 id 路由）；后端 `ctx.send` 的广播会同时送达宿主窗口与该插件全部自建窗口。

## 全屏 / 多显示器注意事项

来自内置插件实战的几条经验：

- **全屏遮罩**：`fullscreen: true` 或手按虚拟屏幕尺寸设置 bounds；截图类插件要处理 DPI 缩放比率，否则高分屏选区错位；
- **多显示器**：坐标要用"虚拟屏幕"合流计算（`screen.getAllDisplays()`），不要假设主屏原点是 (0,0)；
- **窗口拖动**：自绘标题栏拖动用 `setPointerCapture`，光标快速移出小窗外时事件才不会断流；
- **键盘细节**：窗口内有文本编辑器时，`Esc` 要 `stopPropagation()`，否则冒泡到全局键盘处理会把"取消输入"放大成"放弃整个操作"；
- **重入守卫**：打开全屏窗口是异步的（约 1 秒空窗），双击热键会叠开两个 —— 用 `opening` 标志位挡住重入。

## 完整范例

内置插件 `src/plugins/screenshot-pin/` 是最完整的独立窗口样本：

| 文件 | 角色 |
|---|---|
| `selection.html/js` | 全屏框选遮罩窗口（拖拽矩形 + 微调 + DPI 处理） |
| `pin.html/js` | 置顶贴图窗口（滚轮缩放 / 透明度 / OCR） |
| `overlay-preload.js` / `pin-preload.js` | 两个窗口各自的 contextBridge |
| `backend.js` | 协调遮罩创建 → 截图采集 → 贴图窗口的完整链路 |

`draw-board/` 与 `color-lab/picker.*` 是另外两组不同风格的样本。
