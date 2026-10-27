# 插件开发指南 / Plugin Guide

一个插件 = 一个文件夹。放进 `src/plugins/`（内置）或用户插件目录（设置 → 打开用户插件目录）即可，后者同 id 覆盖前者。

## 最小可用的插件

只需要两个文件：

```
my-tool/
├── plugin.json
└── panel.js
```

**plugin.json**

```json
{
  "id": "my-tool",
  "name": { "zh": "我的工具", "en": "My Tool" },
  "desc": { "zh": "一句话描述", "en": "one-liner" },
  "version": "1.0.0",
  "keywords": ["my", "tool"],
  "icon": "icon.svg",
  "defaultEnabled": true,
  "panel": { "script": "panel.js", "style": "panel.css" }
}
```

字段说明：

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✓ | 小写字母开头，`[a-z0-9-]`，全站唯一 |
| `name` / `desc` | ✓ | 字符串或 `{zh, en}`，中英随宿主语言切换 |
| `version` / `author` | | 元信息，显示在卡片与设置页 |
| `keywords` | | 搜索命中用（中英文都放） |
| `icon` | | `.svg` 文件名或内联 svg 字符串；缺省 `🧩` |
| `defaultEnabled` | | 首次扫描时是否默认启用，默认 `true` |
| `backend` | | 主进程模块文件名，不需要后端就省略 |
| `panel` | | `{script, style}`，面板脚本在宿主窗口里执行 |
| `actions` | | 可绑全局热键的动作，见下文 |

**panel.js**（运行在宿主渲染进程，无 Node、无 Electron API）

```js
(function () {
  function mount(el, ctx) {
    el.innerHTML = '<div class="pane-body">hello</div>';
    if (ctx.plugin.hasBackend) {
      ctx.call('greet', { name: 'orbit' }).then(msg => { el.textContent = msg; });
    }
  }
  window.Toolbox.panel({ mount, unmount() { /* 可选：清理 */ } });
})();
```

`mount(el, ctx)` 在用户点开卡片时调用；`el` 是面板容器，`ctx` 提供：

| ctx | 说明 |
|---|---|
| `ctx.call(method, args)` | 调你自己 backend 的 IPC handler（失败抛错） |
| `ctx.onEvent(channel, fn)` | 订阅 backend `ctx.send(channel, payload)` 推送的消息 |
| `ctx.plugin` | 插件序列化信息（id、name、actions…） |
| `ctx.lang` / `ctx.platform` | `'zh' | 'en'` / `win32 | darwin | linux` |
| `ctx.openExternal(url)` | 用系统浏览器打开 http(s) 链接 |
| `ctx.savePng()` | 弹出保存 PNG 对话框，返回路径或 null |

面板样式：`panel.style` 里的 css 会随面板一起加载，可以复用宿主的设计 token（`--ink`、`--amber`、`--r-lg`、`.btn`、`.input`、`.tool-bar`、`.pane-body` 等，见 `src/renderer/style.css`）。**不要**依赖其他插件的样式 —— 插件之间互不可见。

## 带后端的插件

**backend.js**（运行在主进程，拥有完整 Node / Electron 能力）

```js
module.exports = {
  activate(ctx) {
    ctx.ipc.handle('greet', async ({ name }) => `hi ${name}`);
  },
  deactivate() { /* 拔掉你的定时器、窗口、ipcMain 监听 */ },
};
```

`activate` 在插件启用 / 应用启动（且插件已启用）时调用；`deactivate` 在禁用 / 退出前调用。`ctx` 提供：

| ctx | 说明 |
|---|---|
| `ctx.ipc.handle(method, fn)` | 注册给面板 `ctx.call(method, args)` 用的 handler |
| `ctx.send(channel, payload)` | 推送消息到宿主面板与该插件的所有窗口 |
| `ctx.url(rel)` | `plugin://<id>/<rel>`，加载插件自己的 html/资源 |
| `ctx.windows.create(opts)` | 创建 BrowserWindow（自动被跟踪，禁用时销毁）；`opts.preload` 写相对插件根目录的路径 |
| `ctx.data.get() / set(patch)` | 每插件独立的 JSON 持久化（userData/plugin-data） |
| `ctx.root` / `ctx.id` | 插件文件夹绝对路径 / id |
| `ctx.getHostWindow()` | 宿主窗口（可空） |
| `ctx.chooseSavePng()` | 保存 PNG 对话框 |

约定：插件自有窗口用自己的 preload + `ipcMain.on('my-plugin:...')` 通道（带 id 前缀防撞），并在 `deactivate` 里 `removeListener / removeHandler`。参考 `src/plugins/screenshot-pin/backend.js`。

## 动作与全局热键

```json
"actions": [
  { "id": "capture", "label": { "zh": "框选截图", "en": "Capture" }, "method": "startCapture", "hotkey": "Ctrl+Alt+A" }
]
```

`method` 是 backend 的 IPC handler 名；`hotkey` 是默认值，用户可以在 设置 → 插件 里改绑或清除（`hotkey` 省略则默认无热键）。同 `pluginId:actionId` 的用户配置存于 config，覆盖 manifest。

## 调试

```bash
npm start          # 正常启动
# 面板报错会显示在面板区域；backend 报错显示在设置页该插件的行内
```

主进程 / 渲染进程 DevTools：改 `src/main.js` 里 `win.webContents` 相关注释（发布版关闭）。日志看终端 stdout。

## 目录约定（推荐）

```
my-tool/
├── plugin.json
├── icon.svg
├── panel.js / panel.css        # 宿主面板（必需）
├── backend.js                  # 主进程后端（可选）
├── <window>.html/.css/.js      # 自有窗口（可选）
└── <window>-preload.js         # 自有窗口的 contextBridge（可选）
```

复杂插件请按职责拆模块（参考 `port-scope/ports.js` 平台层与 `backend.js` IPC 层的分离），解析器之类纯逻辑写成可单测的模块。
