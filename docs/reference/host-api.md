# 宿主 API（window.host）

`src/preload.js` 通过 `contextBridge` 暴露的**白名单通道总表**。这是宿主渲染层（含插件面板所在环境）能看到的全部宿主能力。

> 插件面板请优先使用面板 [ctx](/plugin/panel#ctx-上下文)（`ctx.call` / `ctx.onEvent` / `ctx.openExternal`…），它是对下表的插件语义封装。直接使用 `window.host` 一般只出现在宿主自身视图模块与高级场景。

## invoke 方法（`await window.host.xxx()`）

### 启动与插件

| 方法 | 参数 | 说明 |
|---|---|---|
| `boot()` | — | 启动握手，返回插件列表 / 热键 / 配置等初始状态 |
| `pluginCall(id, method, args)` | 插件id、方法名、参数 | 调用插件后端方法，返回 `{ ok, data, error }` |
| `setPluginEnabled(id, on)` | 插件id、开关 | 启用 / 禁用插件，返回新状态 |
| `rescanPlugins()` | — | 重新扫描插件目录（后端热重载） |
| `openPluginFolder(id)` | 插件id | 在资源管理器打开插件目录 |
| `bumpUsage(id)` | 插件id | 记一次使用（frecency 排序依据） |

### 热键

| 方法 | 说明 |
|---|---|
| `setHotkey(accel)` | 设置主窗口呼出热键 |
| `setPaletteHotkey(accel)` | 设置动作抽屉热键（允许 `null` 清空） |
| `setPluginHotkey(key, accel)` | 设置插件动作热键（`key` 为 `<插件id>:<动作id>`） |
| `hotkeys()` | 读取当前热键注册表与状态 |

### 目录与对话框

| 方法 | 说明 |
|---|---|
| `openUserPlugins()` | 打开用户插件目录 |
| `chooseUserPluginsDir()` / `setUserPluginsDir(dir)` | 选择 / 设置用户插件目录 |
| `openPluginDataDir()` | 打开插件数据目录 |
| `choosePluginDataDir()` / `setPluginDataDir(dir)` | 选择 / 设置插件数据目录 |
| `chooseSavePng()` | PNG 保存对话框，返回所选路径或 null |

### 剪贴板与划选

| 方法 | 说明 |
|---|---|
| `readClipboardText()` / `writeClipboardText(text)` | 读 / 写剪贴板文本 |
| `captureSelection()` | 划选捕获：读取当前前台窗口选中文本（自动备份恢复剪贴板） |
| `detectSmartPeek(text)` | 文本 → 信封类型嗅探 |
| `getPipelineActions(envelope)` | 信封 → 可接管的插件动作推荐列表 |

### 工作流

| 方法 | 说明 |
|---|---|
| `listWorkflows()` | 工作流列表 |
| `saveWorkflow(wf)` / `deleteWorkflow(id)` | 保存 / 删除 |
| `runWorkflow(id, input)` | 手动执行（`input` 为初始信封） |

### 更新

| 方法 | 说明 |
|---|---|
| `checkUpdate(opts)` | 检查 GitHub Releases 新版本 |
| `downloadUpdate({ downloadUrl, fileName })` | 分片断点续传下载 |
| `cancelDownloadUpdate()` | 取消进行中的下载 |
| `installUpdate(filePath)` | 退出并安装 |

## send 方法

| 方法 | 说明 |
|---|---|
| `win(action)` | 主窗口控制（最小化 / 最大化 / 关闭等） |
| `resizePalette(height)` | 动作抽屉高度自适应 |
| `toggleActionPalette()` | 呼出 / 收起动作抽屉 |

## 订阅方法（返回取消函数）

| 方法 | 事件 |
|---|---|
| `onPluginEvent(id, fn)` | `plugin-event:<id>`：该插件后端 `ctx.send` 的广播 |
| `onWindowStateChange(fn)` | 主窗口最大化 / 还原状态 |
| `onPaletteFocus(fn)` | 抽屉获得焦点（聚焦输入框） |
| `onOpenActionPalette(fn)` | 打开窗口内动作抽屉 |
| `onOpenPlugin(fn)` | 请求打开某插件面板 |
| `onNavigateTo(fn)` | 视图导航指令（含结构化 payload） |
| `onWorkflowEvent(fn)` | 工作流执行事件（run-start / run-finish…） |
| `onUpdaterProgress(fn)` / `onUpdaterHasUpdate(fn)` | 更新下载进度 / 发现新版本 |

## 其他成员

| 方法 | 说明 |
|---|---|
| `getWindowState()` | 主窗口状态快照 |
| `openExternal(url)` | 系统浏览器打开链接（仅 http/https） |
| `openWorkbench(opts)` | 打开工作台视图 |
| `setPref(k, v)` | 写用户偏好项 |

> 本表随主仓演进，权威定义以 [`src/preload.js`](https://github.com/Ikaros-521/orbit-tools/blob/main/src/preload.js) 源码为准。
