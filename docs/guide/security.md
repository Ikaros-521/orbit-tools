# 安全模型

Orbit Toolbox 是一个加载第三方代码的平台，安全边界设计在架构层而非约定层。

## 渲染进程：隔离 + 沙箱全开

所有宿主窗口与插件面板共享以下不可协商的默认值：

```js
webPreferences: {
  contextIsolation: true,  // 页面上下文与 preload 隔离
  nodeIntegration: false,  // 页面无 Node 权限
  sandbox: true,           // 渲染器运行在 OS 沙箱
}
```

插件面板脚本（`panel.js`）运行在宿主渲染进程内：**没有 `require`、没有 `process`、没有 Node API**，能做的只是普通 DOM 操作，以及调用宿主注入的面板 `ctx`。

即便插件通过 `ctx.windows.create()` 创建独立窗口，传入的 `webPreferences` 也是**浅合并**进隔离默认值，而不是整体替换 —— 想靠传 `{ nodeIntegration: true }` 逃逸是无效的。

## preload：白名单桥，不暴露 ipcRenderer

`src/preload.js` 用 `contextBridge.exposeInMainWorld('host', {...})` 暴露一组**封装好的方法**（`boot` / `pluginCall` / 剪贴板 / 热键 / 工作流 / 更新通道等），每个方法内部固定调用特定 IPC 通道：

```js
// 典型白名单封装：通道与参数都是宿主决定的，页面无法自由发消息
pluginCall: (id, method, args) => ipcRenderer.invoke('plugin-call', { id, method, args }),
```

渲染层拿不到裸 `ipcRenderer`，因此也就无法探测或调用平台未开放的通道。通道清单见 [宿主 API 参考](/reference/host-api)。

## plugin:// 协议：路径越界防护

插件静态资源（脚本 / 样式 / 独立窗口页面）统一经自定义协议加载：

```
plugin://<plugin-id>/<relative-path>
```

协议处理器在映射到物理文件系统前做严格路径校验，只允许落在**该插件自己的根目录**之内，`../` 穿越与符号链接逃逸直接拒绝。后端还可以用 `ctx.addAssetRoot(alias, dir)` 把插件目录**之外**的资产目录（如用户导入的资源包）登记为 `plugin://<id>/<@alias>/...`，同样纳入统一校验。

## 插件后端：受控上下文

后端模块运行在主进程，理论上是高权限区，因此宿主只通过 `PluginContext` 提供封装过的能力：

- `ctx.ipc.handle` 只能注册**本插件命名空间**内的方法，前端调用按插件 id 路由；
- `ctx.windows.create` 创建的窗口全部登记在册，插件禁用时统一销毁，不留孤儿窗口；
- `ctx.data` 只读写本插件的数据文件；
- `ctx.onPluginEvent` 的跨插件订阅记账在插件状态里，deactivate 时统一退订，杜绝启停循环累积泄漏。

## 数据与网络

| 场景 | 防护 |
|---|---|
| 全局配置 / 插件数据持久化 | tmp + rename 原子写，中途崩溃不会留下半写文件 |
| 插件数据损坏 | 先改名备份为 `<id>.json.corrupt-<时间戳>` 再兜底空对象，避免重播种覆写用户数据 |
| 打开外部链接 | `openExternal` 仅接受 `http://` / `https://`，经系统默认浏览器 |
| 剪贴板划选捕获 | 捕获前备份用户剪贴板，操作完成后恢复 |
| 全局热键 | 应用内共享注册表防冲突；注册失败（被外部独占）精确标黄提示而非假成功 |

## 给插件作者的安全清单

1. 面板渲染任何来自用户或外部的内容时自行转义（宿主不提供模板引擎，`innerHTML` 直插是不可信输入的 XSS 入口）；
2. 后端处理 `ctx.call` 传入的 `args` 前先校验形状 —— 参数来自前端，前端是可被注入的；
3. 后端执行子进程命令时使用参数数组而非字符串拼接，避免 shell 注入；
4. 不要把密钥写进插件数据文件预期它被加密 —— `ctx.data` 是明文 JSON。
