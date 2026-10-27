# Orbit Toolbox · 轨道工具箱

uTools 风格的**插件化开发工具箱**。常用小工具封装成可插拔的插件：按需启用 / 禁用，全局热键一键呼出，往目录里丢一个文件夹就是安装。

A uTools-style pluggable developer toolbox. Every tool is a plugin — enable or disable it on demand, summon anything with a global hotkey, and install a new tool by dropping a folder into a directory.

基于 [antigravity-launcher](https://github.com/Ikaros-521/antigravity-launcher) 的架构经验重写：纯 Electron、无前端框架、无打包器，`contextIsolation + sandbox` 全开。

## 内置插件

| 插件 | 功能 | 默认热键 |
|---|---|---|
| 截图悬浮 Screenshot Pin | 框选截图 → 钉在屏幕上置顶悬浮；滚轮缩放、透明度、复制、保存 | `Ctrl+Alt+A` |
| 屏幕画板 Draw Board | 全屏透明画板：画笔 / 荧光笔 / 直线 / 箭头 / 矩形 / 椭圆 / 橡皮，撤销重做，导出 PNG | `Ctrl+Alt+D` |
| 端口与进程 Port Scope | 查 TCP/UDP 监听端口 + 进程名 + PID，过滤排序，一键结束进程 | — |
| 编码转换 Codec Lab | Base64 / URL / Hex / Unicode / JWT / 时间戳双向互转 | — |

工具箱本身的呼出热键默认 `Alt+Space`，可在设置里改。

**热键冲突检测**：应用内所有热键（呼出键 + 各插件动作键）共享一个注册表——把某个键改成已被占用的组合时会被拒绝，并提示「与『XX』冲突」，配置不会写入无效值。注意 Electron 检测不到**其他程序**占用的组合键（如 QQ 截图默认的 `Ctrl+Alt+A`）：注册会静默失败，若热键不生效，先换一个组合试试。

## 快速开始

```bash
npm install
npm start
```

打包：`npm run dist:win` / `dist:mac` / `dist:linux`（electron-builder，配置在 package.json）。

## 插拔设计

- **每个插件就是一个文件夹**：`plugin.json` 清单 + 面板脚本（渲染在宿主窗口里）+ 可选的后端模块（跑在主进程）。
- **启用 / 禁用**：设置页开关。禁用 = 后端模块不加载、热关注销、IPC 全部摘除；面板脚本只有打开时才注入，关闭即卸载。
- **安装 = 复制文件夹**：放到用户插件目录（设置页有入口），重新扫描即生效。同 id 的用户插件**覆盖**内置插件 —— 升级内置工具不用改主程序。
- **轻量**：无打包器、无运行时依赖（生产 files 只有 `src/`），主进程只加载已启用插件的后端。

插件开发指南见 [docs/plugin-guide.md](docs/plugin-guide.md)。

## 架构

```
src/
├── main.js                  # 主进程：宿主窗口、托盘、单实例、装配核心模块
├── preload.js               # 宿主 contextBridge（sandbox 兼容）
├── core/
│   ├── config.js            # JSON 持久化（热键 / 语言 / 主题 / 插件启停）
│   ├── plugin-manager.js    # 发现 / 启停 / IPC 路由 / 窗口跟踪 / 每插件数据目录
│   ├── plugin-protocol.js   # plugin:// 协议（路径越界防护）
│   ├── hotkeys.js           # 全局热键注册表 + 应用内冲突检测
│   └── ipc.js               # 宿主 IPC 面（boot / plugin-call / 设置 / 对话框）
├── renderer/                # 宿主 UI：搜索面板、插件面板容器、设置页、i18n、主题
└── plugins/
    ├── codec-lab/           # 编码转换（纯面板插件，无后端）
    ├── port-scope/          # 端口进程（后端拆分 ports.js 平台层 + backend.js IPC 层）
    ├── screenshot-pin/      # 截图悬浮（选区覆盖窗口 + 贴图窗口，各自独立 preload）
    └── draw-board/          # 屏幕画板（全屏透明画布 + 屏幕底图快照）
```

测试：`node tools/test-port-parsers.js`（解析器单测）、`electron tools/smoke-plugins.js`（插件系统冒烟）、`electron tools/uitest.js`（真实窗口 UI 回归，含热键冲突，截图输出到 dist/）。

安全边界：插件面板脚本运行在宿主渲染进程（contextIsolation、无 Node），只能通过 `Toolbox` 上下文调用宿主能力；插件后端模块运行在主进程，通过 `ctx` 拿到受控的窗口创建 / IPC / 持久化 API。插件自有窗口通过 `plugin://<id>/...` 协议加载资源，路径越界直接 403。

## License

MIT © Ikaros-521
