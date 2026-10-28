# Orbit Toolbox · 轨道工具箱

uTools 风格的**插件化开发工具箱**。常用小工具封装成可插拔的插件：按需启用 / 禁用，全局热键一键呼出，往目录里丢一个文件夹就是安装。

A uTools-style pluggable developer toolbox. Every tool is a plugin — enable or disable it on demand, summon anything with a global hotkey, and install a new tool by dropping a folder into a directory.

基于 [antigravity-launcher](https://github.com/Ikaros-521/antigravity-launcher) 的架构经验重写：纯 Electron、无前端框架、无打包器，`contextIsolation + sandbox` 全开。

## 内置插件

| 插件 | 功能 | 默认热键 |
|---|---|---|
| 截图悬浮 Screenshot Pin | 框选截图 → 钉在屏幕上置顶悬浮；滚轮缩放、透明度、复制、保存 | `Ctrl+Shift+A` |
| 屏幕画板 Draw Board | 全屏透明画板：画笔 / 荧光笔 / 直线 / 箭头 / 矩形 / 椭圆 / 橡皮，撤销重做，导出 PNG | `Ctrl+Shift+D` |
| 反重力代理启动器 Antigravity Launcher | Google Antigravity 进程级代理启动器：握手探测、网络诊断、终端代理与一键拉起 | `Ctrl+Shift+G` |
| JSON 编辑器 JSON Editor | JSON 语法校验 / 格式化展开 / 树状折叠 / Python 字典转合法 JSON / 单行压缩 / 快速转义 / 一键去注释 | `Ctrl+Shift+J` |
| 剪贴板历史 Clip History | 剪贴板多条历史记录与置顶收藏，一键回填、搜索与图片预览 | `Ctrl+Shift+V` |
| 镜像源切换 Mirror Hub | npm / pip / docker / maven / rust 常见开发工具国内镜像源一键测速与切换 | — |
| 端口与进程 Port Scope | 查 TCP/UDP 监听端口 + 进程名 + PID，过滤排序，一键结束进程 | — |
| 编码转换 Codec Lab | Base64 / URL / Hex / Unicode / JWT / 时间戳双向互转 | — |

工具箱本身的呼出热键默认 `Alt+Shift+Space`，可在设置里自定义。

**热键智能检测与防冲突**：
- 应用内所有热键（呼出键 + 各插件动作键）共享注册表，应用内重复分配会被拒绝并提示「与『XX』冲突」。
- 严格校验系统与外部程序占用：当热键被外部软件（如 QQ、uTools、系统热键等）独占时，准确捕获失败状态并在设置页标黄提示「注册失败，可能被占用」，杜绝假成功。
- 启动时自动降级 fallback：若配置的呼出键被外部占用，自动尝试备用热键注册，确保任何环境下主窗口始终可通过热键唤醒。

## 快速开始

```bash
npm install
npm start
```

## 打包与发布

- 本地打包：`npm run dist:win` / `npm run dist:mac` / `npm run dist:linux`（基于 `electron-builder`）。
- 自动发布：已配置 GitHub Actions 跨平台 CI/CD 工作流（`.github/workflows/release.yml`）。
  - 推送 `v*` tag（例如 `git tag v1.0.0 && git push origin v1.0.0`）会自动并行在 Windows / macOS / Linux 三端 runner 上编译打包所有产物，并自动汇总创建 GitHub Release 挂载附件。
  - 也可在 GitHub Actions 界面通过 `workflow_dispatch` 手动触发构建或发布。

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
    ├── antigravity-launcher/# 反重力代理启动器（探测 / 诊断 / 终端 / 代理拉起）
    ├── clip-history/        # 剪贴板历史（多条历史、置顶收藏与图片预览）
    ├── codec-lab/           # 编码转换（纯面板插件，无后端）
    ├── draw-board/          # 屏幕画板（全屏透明画布 + 屏幕底图快照）
    ├── json-editor/         # JSON 编辑器（语法校验 / 树状折叠 / Python转JSON / 压缩转义）
    ├── mirror-hub/          # 镜像源切换（npm/pip/docker 等国内镜像源测速与切换）
    ├── port-scope/          # 端口进程（后端拆分 ports.js 平台层 + backend.js IPC 层）
    └── screenshot-pin/      # 截图悬浮（选区覆盖窗口 + 贴图窗口，各自独立 preload）
```

测试：`node tools/test-port-parsers.js`（解析器单测）、`electron tools/smoke-plugins.js`（插件系统冒烟）、`electron tools/uitest.js`（真实窗口 UI 回归，含热键冲突，截图输出到 dist/）。

安全边界：插件面板脚本运行在宿主渲染进程（contextIsolation、无 Node），只能通过 `Toolbox` 上下文调用宿主能力；插件后端模块运行在主进程，通过 `ctx` 拿到受控的窗口创建 / IPC / 持久化 API。插件自有窗口通过 `plugin://<id>/...` 协议加载资源，路径越界直接 403。

## 开源协议与商业授权 (License & Commercial Support)

本项目采用 **双重许可模式（Dual-Licensing）**：

- **开源使用（GNU AGPLv3）**：
  - 遵循 [GNU Affero General Public License v3.0](LICENSE) 开源协议。
  - **强制开源义务**：任何个人或组织可免费使用、修改和分发本项目。但根据 AGPLv3 条款，若您基于本项目进行二次开发、修改、打包集成或通过网络提供服务，**其衍生系统及相关代码必须全部以相同的 AGPLv3 协议开源**。
- **商业闭源授权（Commercial License）**：
  - 若您或您的组织希望将本项目用于闭源商业产品中、进行专有分发、不愿公开自身系统的源代码、或无法遵守 AGPLv3 的强传染性开源义务，**必须向版权所有者购买商业闭源授权**。
  - 商业授权、企业定制或商务合作请联系：
    - 邮箱：`327209194@qq.com`
    - 版权所有者：`Ikaros-521`
