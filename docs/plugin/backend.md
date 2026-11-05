# 后端模块

当插件需要执行系统命令、探测网络、加解密、操作文件或管理多窗口时，在 `plugin.json` 里声明 `"backend": "backend.js"`。后端模块运行在**主进程**，通过宿主注入的受控 `ctx` 获得能力。

## 基本形态

```javascript
// backend.js
module.exports = {
  activate(ctx) {
    // 1. 注册供前端 ctx.call 调用的方法
    ctx.ipc.handle('doSomething', async (args) => {
      return `处理完成: ${args.text}`;
    });

    // 2. 本插件数据持久化
    const current = ctx.data.get();
    ctx.data.set({ lastActive: Date.now(), ...current });

    // 3. 向面板与自建窗口广播事件
    ctx.send('data-updated', { status: 'ready' });
  },

  deactivate() {
    // 禁用 / 重新扫描前调用：清理定时器、杀子进程、关文件句柄
    // （IPC 处理器、窗口、事件订阅由宿主统一回收，无需手动注销）
  },
};
```

## ctx API 总表

### 基础

| 成员 | 说明 |
|---|---|
| `ctx.id` | 插件 id |
| `ctx.root` | 插件根目录绝对路径 |
| `ctx.getHostWindow()` | 宿主主窗口实例（可能为 null，注意判空） |
| `ctx.url(rel)` | 相对路径 → `plugin://<id>/<rel>` 协议 URL |
| `ctx.workflows` | WorkflowManager 实例（工作流编排高级用法），未就绪时为 `null` |

### IPC 与事件

| 成员 | 说明 |
|---|---|
| `ctx.ipc.handle(method, fn)` | 注册方法，`fn(args, event)` 供前端 `ctx.call(method)` 调用 |
| `ctx.send(channel, payload)` | 向宿主窗口 + 本插件全部自建窗口广播 `plugin-event:<id>` |
| `ctx.callPlugin(id, method, args)` | 调用**另一个插件**的后端方法（跨插件协作） |
| `ctx.onPluginEvent(targetId, fn)` | 订阅**另一个插件**的事件广播，返回取消函数；随 deactivate 自动退订 |
| `ctx.openPluginPanel(id, payload)` | 唤起宿主并打开指定插件面板，可携带结构化 `payload`（面板经 `ctx.payload` 收到） |

### 数据持久化

| 成员 | 说明 |
|---|---|
| `ctx.data.get()` | 读取本插件数据（对象），内存缓存 |
| `ctx.data.set(patch)` | 浅合并 patch 后原子写盘（tmp + rename），返回合并后的完整对象 |

数据文件为 `<pluginDataDir>/<id>.json`，默认在 `<userData>/plugin-data/` 下（用户可在设置中整体迁移插件数据目录）。读取到损坏文件时宿主会先把原文件改名备份为 `<id>.json.corrupt-<时间戳>` 再兜底空对象，避免插件重播种覆写用户数据。

### 窗口

| 成员 | 说明 |
|---|---|
| `ctx.windows.create(options)` | 创建 `BrowserWindow`，见下节默认值与合并策略 |
| `ctx.windows.closeAll()` | 关闭本插件全部窗口 |

### 外部资产

| 成员 | 说明 |
|---|---|
| `ctx.addAssetRoot(alias, dir)` | 把插件目录**外**的资产目录登记为 `plugin://<id>/@<alias>/...`（alias 须匹配 `^[a-z][a-z0-9-]*$`） |
| `ctx.removeAssetRoot(alias)` | 注销 |

适合用户导入的大体积资源（模型、图片包）—— 放在插件文件夹外面，但仍用协议安全加载。

## ctx.windows.create 默认值

```js
ctx.windows.create({
  width: 800, height: 600,
  // 以下为宿主强制默认值（可覆盖外观类字段，隔离类字段始终生效）：
  // show: false            创建后自行 win.show()
  // skipTaskbar: true      不占任务栏
  // backgroundColor: '#0a0c0d'
  webPreferences: {
    // contextIsolation: true / nodeIntegration: false / sandbox: true
    // 传入的 webPreferences 是浅合并，隔离默认值不可被关闭
    preload: 'window-preload.js',  // 相对路径会解析到插件根目录
  },
})
```

窗口全部登记在插件状态里：插件禁用时统一销毁，`closed` 后自动移出跟踪集合。独立窗口的完整开发模式见[独立窗口](/plugin/windows)。

## 跨插件协作示例

桌面宠物插件的"文件拖落"入口就是三个 API 的组合：

```javascript
// backend.js（插件 A：接住文件，把用户送进工具箱的对应工具）
ctx.ipc.handle('dropFile', async ({ path }) => {
  const text = fs.readFileSync(path, 'utf8');           // 主进程 Node 能力
  if (text.trim().startsWith('{')) {
    return ctx.openPluginPanel('json-editor', { seed: text });  // 带 payload 打开 JSON 编辑器
  }
  return ctx.callPlugin('memo', 'appendNote', { text }); // 调用 memo 插件方法
});
```

```javascript
// backend.js（插件 B：监听 A 的就绪事件）
ctx.onPluginEvent('pet', ({ channel, payload }) => {
  if (channel === 'ready') console.log('桌宠已就绪', payload);
});
```

## 生命周期与清理职责

| 回调 | 时机 | 你需要做的 |
|---|---|---|
| `activate(ctx)` | 启用 / 重新扫描 / 重启后加载 | 注册 IPC、恢复状态、启动后台任务 |
| `deactivate()` | 禁用 / 重新扫描前 | 杀子进程、清定时器、保存未落盘数据 |

宿主在 `deactivate` 之后自动完成：销毁窗口、摘除 IPC 处理器、退订 `onPluginEvent`、清空模块缓存（下次 activate 重新 `require` 最新代码）。

::: warning 长任务与子进程
`ctx.call` 的处理器里不要跑无限循环或超长任务 —— 它会占住主进程。长任务放到子进程，或拆成"启动 + 查询进度"两个方法；派生的子进程务必在 `deactivate` 里终止。
:::
