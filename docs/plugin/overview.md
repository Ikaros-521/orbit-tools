# 插件系统概览

## 插件即文件夹

每个插件在文件系统中就是一个独立文件夹：

```
my-plugin/
├── plugin.json        # 必需：清单（元数据 + 入口声明）
├── icon.svg           # 推荐：24x24 矢量图标
├── panel.js           # 面板脚本（渲染在宿主窗口里）
├── panel.css          # 可选：面板专用样式
├── backend.js         # 可选：主进程后端（需要系统能力时才写）
├── window.html        # 可选：独立窗口页面
└── window-preload.js  # 可选：独立窗口的安全隔离脚本
```

按能力需求，插件天然分成三种形态：

| 形态 | 组成 | 典型例子 |
|---|---|---|
| **纯前端** | `plugin.json` + `panel.js/css` | JSON 编辑器：纯页面逻辑，无后端 |
| **全栈** | 上述 + `backend.js` | 编码转换：crypto 加解密跑在主进程 |
| **独立窗口** | 全栈 + 自有窗口页面与 preload | 截图悬浮：全屏选区遮罩、置顶贴图窗口 |

## 目录与优先级

插件从两类目录发现：

1. **内置插件目录**：仓库内 `src/plugins/<id>/`；
2. **用户插件目录**：默认 `<userData>/plugins/`（Windows 下 `%APPDATA%\orbit-tools\plugins`），支持在**设置页自定义任意路径**（外接硬盘、云盘、Git 同步目录都可以）。

规则：

- **同 id 时用户插件覆盖内置插件** —— 这是升级内置工具的官方姿势：把改好的同 id 文件夹放进用户目录即可，不必动主程序；
- 安装 = 复制文件夹 + 插件中心点「重新扫描」；开发期也可以用软链接 / junction 把开发目录链进用户目录；
- 以 `.` 开头的文件夹和 `node_modules` 不会被当作插件扫描。

## 发现与校验

扫描时宿主逐目录读取 `plugin.json` 并做校验：

- `id` 必须匹配 `^[a-z][a-z0-9-]*$`，`name` 必填，`panel.script` 必须存在；
- 校验失败的文件夹不会击穿启动链，而是以**禁用的 ⚠️ 占位卡片**出现在插件中心，注明失败原因（`plugin.json missing/invalid`、`bad id` 等）；
- 声明了 `panel` 却没写 `actions` 的清单会自动注入一个「打开 xx」动作（`openPanel`），保证任何面板插件都能被热键 / 命令面板唤出。

## 生命周期

```
discover ──► enable ──► activate(ctx)     # require backend.js，注入 PluginContext
              │
              ├─ 禁用 / 重新扫描 ──► deactivate()
              │      · 调用模块的 deactivate()（若导出）
              │      · 销毁全部插件窗口
              │      · 摘除全部 IPC 处理器与事件订阅
              │      · 清空该插件目录的 require 缓存（热重载生效）
              │
              └─ 面板打开/关闭 ──► mount(el, ctx) / unmount()   # 渲染层，随用随挂
```

要点：

- **只有启用的插件才加载后端**：禁用 = 后端模块不加载、热关注销、IPC 全部摘除；
- **面板脚本按需注入**：打开插件时经 `plugin://<id>/panel.js` 加载进宿主渲染进程，关闭面板即调用 `unmount()` 卸载；
- **重新扫描是后端热重载**：整个插件目录（含后端 require 的子模块）的模块缓存被清空，改完 `backend.js` 点一下就生效，无需重启应用。

## IPC 路由

前后端通信全部经宿主中转，插件之间天然隔离：

```
面板 ctx.call('method', args)
   └─► invoke('plugin-call', { id, method, args })        # 只路由到本插件
         └─► PluginManager.call(id, method) → handlers.get(method)

后端 ctx.send('channel', payload)
   └─► 广播 plugin-event:<id> 到宿主窗口 + 该插件全部自建窗口
         └─► 面板 ctx.onEvent('channel', fn) 收到 payload
```

跨插件协作也走受控通道：`ctx.callPlugin`、`ctx.onPluginEvent`、`ctx.openPluginPanel`，详见[后端模块](/plugin/backend)。

## 安装分发

分发一个插件就是分发一个文件夹。常见方式：

- 直接 zip 打包发给使用者，解压到用户插件目录；
- 放进 Git 仓库，使用者把仓库 clone 到用户插件目录（或自定义目录直接指向仓库内路径）；
- 覆盖内置插件升级：同 id 放入用户目录。

接下来：从[清单规范](/plugin/manifest)开始动手写一个插件。
