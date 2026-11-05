# 架构总览

## 进程与信任模型

Orbit Toolbox 是标准的 Electron 三层结构，叠加了一套插件双态模型：

```
┌─────────────────────────────────────────────────────────────┐
│  主进程 (src/main.js + src/core/*)                           │
│  · 窗口/托盘/单实例生命周期      · 全局热键注册表              │
│  · 插件发现/启停/IPC 路由        · 工作流引擎                  │
│  · 配置持久化(原子写)            · 划选捕获/自动更新            │
│        ▲ invoke/send                    ▲ require             │
│  ┌─────┴──────────┐              ┌──────┴──────────┐         │
│  │ 宿主渲染进程     │              │ 插件后端 backend │         │
│  │ src/renderer/*  │              │ (主进程内受限ctx) │         │
│  │ window.host 桥  │              └─────────────────┘         │
│  │  · 工作台 deck  │                                          │
│  │  · 动作抽屉      │   plugin://<id>/<file> 隔离协议加载       │
│  │  · 插件面板容器  │◄────────────────────────────┐            │
│  └────────────────┘                               │            │
│         插件面板 panel.js（渲染进程沙箱内，无 Node）  │            │
└─────────────────────────────────────────────────────────────┘
```

三条铁律构成了整个架构的安全与简洁基础：

1. **渲染层永不接触 Node**：`contextIsolation` 与 `sandbox` 强制开启，宿主能力只能通过 `preload.js` 用 `contextBridge` 暴露的白名单 `window.host` 访问；
2. **插件后端只能拿到受控 `ctx`**：后端模块虽运行在主进程，但通过 `PluginContext` 获得窗口创建、IPC、持久化等封装好的能力，而非裸 Electron API；
3. **插件静态资源走自定义协议**：面板脚本、样式、独立窗口页面统一经 `plugin://<id>/<path>` 加载，协议处理器做路径越界校验。

## 核心模块（src/core/）

| 模块 | 职责 | 关键点 |
|---|---|---|
| `plugin-manager.js` | 插件生命周期与 IPC 路由中枢 | 发现（用户目录优先于内置，同 id 覆盖）、启停（IPC 摘除 / 窗口销毁 / 订阅退订）、`PluginContext` 注入、`invokeBackend` 路由 |
| `plugin-protocol.js` | `plugin://` 协议处理器 | 路径校验限制在插件根目录内，杜绝 `../` 穿越 |
| `config.js` | 全局配置持久化 | 字段形状校验、tmp+rename 原子写、损坏配置静默重置默认值 |
| `hotkeys.js` | 全局热键注册表 | 应用内冲突拒绝、外部独占精确检测、启动期降级备用键 |
| `ipc.js` | 宿主 IPC 通道集中注册 | 分发插件调用 / 剪贴板 / 热键 / 偏好 / 工作流 / 更新通道 |
| `capabilities.js` | 能力探测与信封嗅探 | 检测文本是 JSON / URL / Base64 / JWT / 颜色 / 端口等 11 种信封类型，驱动智能推荐与工作流 |
| `workflows.js` | 工作流编排与执行引擎 | 触发器（手动 / 剪贴板）、节点链执行、变量与数据管道、超时保护 |
| `updater.js` | 自动更新管理器 | 检查 GitHub Releases、semver 比较、按平台匹配 Asset、分片断点续传 |
| `selection.js` | 跨进程划选内容获取 | 备份并恢复剪贴板；UI Automation 读取选区，超时回退按键模拟 |

## 渲染层（src/renderer/）

宿主 UI 是纯原生 JS，无框架无打包器：

| 模块 | 职责 |
|---|---|
| `app.js` | 主控制器：装配各视图模块、插件面板容器与挂载 / 卸载、全局事件协调 |
| `modules/deck-view.js` | 工作台插件卡片：frecency 排序、smart-peek 剪贴板零点击预览、右键菜单 |
| `modules/action-palette-view.js` | 窗口内动作抽屉：动作搜索、载荷路由、键盘导航 |
| `modules/plugin-center.js` | 插件中心：目录过滤、启停开关、热键绑定、开发者指南入口 |
| `modules/settings-view.js` | 设置：热键 / 主题 / 语言 / 插件目录 / 更新 |
| `palette.js` + `palette.html` | 悬浮 Spotlight 式命令面板：拼音模糊搜索、划选 > 剪贴板 > 其他三级动作推荐 |
| `i18n.js` | zh-CN / en-US 双语字典 |
| `style.css` | 全局样式与 light-dark() 主题令牌体系 |

## 插件的面板态与后端态

一个插件由两部分组成，二者可独立存在：

- **面板（renderer 侧）**：宿主打开插件时把 `panel.js` 经 `plugin://` 协议注入宿主渲染进程，`window.Toolbox.panel()` 注册 `{ mount, unmount }`；关闭面板即卸载。面板通过 `ctx.call()` 与后端通信。
- **后端（main 侧）**：`backend.js` 在插件启用时被 `require` 进主进程，`activate(ctx)` 拿到受控上下文注册 IPC 处理器；禁用时 `deactivate()` 后 IPC 摘除、窗口销毁。**只有启用的插件才加载后端**。

数据流一览：

```
panel.js ──ctx.call(method,args)──► host.pluginCall ──invoke──► plugin-manager
                                                                      │ handlers.get(method)
panel.js ◄──plugin-event:<id>──── broadcast ◄────ctx.send(channel)── backend handler
```

## 关键生命周期行为

- **单实例**：二次启动只呼出动作抽屉，不再唤起第二个主窗口；
- **窗口几何**：bounds 保存为尾沿防抖，最大化几何不落盘（避免重启后“占满屏但 `isMaximized` 为 false”的状态错乱）；
- **退出清理**：`will-quit` 销毁托盘防幽灵图标；更新器取消悬挂下载请求防延迟退出；
- **重新扫描**：整目录清空插件 `require` 缓存（含后端 require 的子模块），改后端代码无需重启应用。

下一步推荐阅读 [安全模型](/guide/security) 与 [插件系统概览](/plugin/overview)。
