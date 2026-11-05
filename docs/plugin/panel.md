# 前端面板

面板脚本 `panel.js` 运行在**宿主渲染进程的面板容器**内：普通 DOM 环境，无 Node 权限，样式与宿主共享主题令牌。脚本经 `plugin://<id>/panel.js` 隔离协议加载。

## 注册与挂载

```javascript
// panel.js
(function () {
  function mount(el, ctx) {
    el.innerHTML = `
      <div class="tool-bar">
        <button type="button" class="btn" id="btnAction">执行操作</button>
      </div>
      <textarea id="myInput" class="input" placeholder="请输入内容..."></textarea>
    `;

    const btn = el.querySelector('#btnAction');
    const input = el.querySelector('#myInput');

    btn.addEventListener('click', async () => {
      if (ctx.plugin.hasBackend) {
        // 调用后端 ctx.ipc.handle 注册的方法
        const res = await ctx.call('doSomething', { text: input.value });
        el.querySelector('#result').textContent = res;
      }
    });

    // 订阅后端 ctx.send 推送的事件，返回取消订阅函数
    const off = ctx.onEvent('data-updated', (payload) => {
      console.log('收到后端更新:', payload);
    });
    pendingUnsubs.push(off);
  }

  const pendingUnsubs = [];

  function unmount() {
    // 面板关闭时被调用：退订事件、清定时器、释放重资源
    for (const off of pendingUnsubs.splice(0)) off();
  }

  window.Toolbox.panel({ mount, unmount });
})();
```

生命周期约定：

- `mount(el, ctx)`：面板打开时调用，`el` 是插件专属的根元素，挂载完成前宿主显示 loading；
- `unmount()`：面板关闭（切换视图 / 换插件 / 窗口关闭）时调用，**必须**在这里退订事件、清理定时器，否则监听器会向已摘除的 DOM 持续派发；
- 同一面板重复打开只复用已注册的 def，重新执行 `mount`。

## ctx 上下文

| 属性 / 方法 | 类型 | 说明 |
|---|---|---|
| `ctx.plugin` | object | 插件元数据：`id` / `name` / `version` / `category` / `hasBackend` / `actions` / `capabilities` 等 |
| `ctx.el` | Element | 面板根元素（与 `mount` 第一参相同） |
| `ctx.payload` | any | 结构化打开载荷：经 smart-peek、跨插件 `openPluginPanel` 打开面板时传入，否则 `null` |
| `ctx.lang` | `'zh' \| 'en'` | 当前宿主语言 |
| `ctx.platform` | string | `'win32'` / `'darwin'` / `'linux'` |
| `ctx.call(method, args)` | `Promise<any>` | 调用本插件后端方法；后端抛错时 reject |
| `ctx.onEvent(channel, fn)` | `() => void` | 订阅本插件后端 `ctx.send` 的事件，返回取消函数 |
| `ctx.openExternal(url)` | `Promise<void>` | 系统默认浏览器打开链接（仅 http/https） |
| `ctx.savePng()` | `Promise<string\|null>` | 唤起 PNG 保存对话框，返回所选路径 |

## 与后端通信

```
面板                              后端 (backend.js)
 │ ctx.call('list', {limit: 50})    │
 │ ─────────────invoke────────────► │ ctx.ipc.handle('list', async args => ...)
 │ ◄─────────────resolve─────────── │ return 数据（可 JSON 序列化）
 │
 │ ◄──── plugin-event:<id> 广播 ──── │ ctx.send('data-updated', {...})
 │ ctx.onEvent('data-updated', fn)  │
```

- 参数与返回值都会经 IPC 序列化，不要传函数、DOM、Buffer；
- 后端抛出的错误会以 `reject` 形式回到 `ctx.call`，记得 `try/catch`；
- 高频推送场景（如剪贴板历史的 `new-clip`）让后端推、前端被动收，避免轮询。

## 面板样式

`plugin.json` 的 `panel.style` 声明的 CSS 会随面板一起注入。**所有颜色请引用宿主主题令牌**（`var(--bg)`、`var(--ink)`、`var(--amber)`……），并复用公共类名 `.btn` / `.input` / `.chip` / `.mono`，这样深浅主题自动适配。完整令牌表见[设计系统与主题](/plugin/theming)。

::: warning innerHTML 与 XSS
宿主不提供模板引擎。渲染用户输入、剪贴板内容、后端返回的外部数据时必须先转义（或用 `textContent` / `createElement`），直接拼 `innerHTML` 是 XSS 入口。
:::

## 开发迭代提示

- **改样式**：`panel.css` 随面板挂载注入，重开面板即可看到（也可 DevTools 里直接改，快速预览）；
- **改面板脚本**：`panel.js` 在渲染层有会话级缓存 —— 切换视图只会重新 `mount` 同一份脚本，改了源码要**重启应用**才会重新加载脚本本体；
- **改后端**：插件中心「重新扫描」即热重载，无需重启。

配合后端与独立窗口的开发见下一篇[后端模块](/plugin/backend)。
