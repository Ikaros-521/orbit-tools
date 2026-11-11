<h1 align="center">Orbit Toolbox · 轨道工具箱</h1>

<p align="center">
  <a href="https://github.com/Ikaros-521/orbit-tools/stargazers"><img src="https://img.shields.io/github/stars/Ikaros-521/orbit-tools?style=flat-square&logo=github&label=stars" alt="GitHub Stars"></a>
  <a href="https://github.com/Ikaros-521/orbit-tools/network/members"><img src="https://img.shields.io/github/forks/Ikaros-521/orbit-tools?style=flat-square&logo=github&label=forks" alt="GitHub Forks"></a>
  <a href="https://github.com/Ikaros-521/orbit-tools/issues"><img src="https://img.shields.io/github/issues/Ikaros-521/orbit-tools?style=flat-square&label=issues" alt="GitHub Issues"></a>
  <a href="https://github.com/Ikaros-521/orbit-tools/releases"><img src="https://img.shields.io/github/v/release/Ikaros-521/orbit-tools?style=flat-square&label=release" alt="Latest Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Ikaros-521/orbit-tools?style=flat-square&label=license" alt="License"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-33-2f3241?style=flat-square&logo=electron&logoColor=47848F" alt="Electron">
  <img src="https://img.shields.io/badge/JavaScript-ES2024-f7df1e?style=flat-square&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/Node.js-crypto_/_net-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/HTML5-原生-e34f26?style=flat-square&logo=html5&logoColor=white" alt="HTML5">
  <img src="https://img.shields.io/badge/CSS3-原生-1572b6?style=flat-square&logo=css3&logoColor=white" alt="CSS3">
  <img src="https://img.shields.io/badge/无框架×无打包器-contextIsolation%20%2B%20sandbox-8A2BE2?style=flat-square" alt="No Framework / No Bundler">
</p>

<p align="center">
  uTools 风格的<b>插件化开发工具箱</b>：常用小工具封装成可插拔的插件 —— 按需启用 / 禁用，全局热键一键呼出，往目录里丢一个文件夹就是安装。<br>
  A uTools-style pluggable developer toolbox. Every tool is a plugin — enable or disable it on demand, summon anything with a global hotkey, and install a new tool by dropping a folder into a directory.
</p>

<p align="center">
  基于 <a href="https://github.com/Ikaros-521/antigravity-launcher">antigravity-launcher</a> 的架构经验重写：纯 Electron、无前端框架、无打包器，<code>contextIsolation + sandbox</code> 全开。
</p>

<p align="center">
  <img width="2810" height="1653" alt="Orbit Toolbox 界面截图" src="https://github.com/user-attachments/assets/2eeb16a2-a9ed-4de0-815a-d08721a8f7af" />
</p>

## 下载安装

前往 **[GitHub Releases](https://github.com/Ikaros-521/orbit-tools/releases/latest)** 下载最新版安装包（免费开源，无需账号）：

- **Windows**：Setup 安装程序 / Portable 免安装便携版（x64）
- **macOS**：dmg（Intel / Apple Silicon）
- **Linux**：AppImage / deb（x64 / arm64）

应用内置更新器会自动检查新版本并断点续传升级。文档站：<https://ikaros-521.github.io/orbit-tools/>

## 内置插件

| 插件 | 功能 | 默认热键 |
|---|---|---|
| AI 对话 AI Chat | 本地 Agent 助手：多轮工具循环、运行中插话 Steering、工具卡审批、计划模式、MCP 市场与技能库、子代理派生、长期记忆；兼容 OpenAI / Claude 协议，多渠道多密钥 | `Ctrl+Shift+I` |
| 截图悬浮 Screenshot Pin | 框选截图 → 钉在屏幕上置顶悬浮；滚轮缩放、透明度、复制、保存、OCR 文字提取 | `Ctrl+Shift+A` |
| 屏幕画板 Draw Board | 全屏透明画板：画笔 / 荧光笔 / 直线 / 箭头 / 矩形 / 椭圆 / 橡皮，撤销重做，导出 PNG | `Ctrl+Shift+D` |
| 录屏聚焦 Screen Cue | 默认实时标注，可选冻结当前画面；画笔 / 荧光笔 / 矩形 / 圆形 / 箭头，笔迹保留 / 淡出 / 退出清除；圆形 / 矩形 / 大范围放大镜，中心十字和倍率标签可分别开关，退出后点击穿透 | `Ctrl+Shift+S` / `Ctrl+Shift+X` / `Ctrl+Shift+F` |
| 剪贴板历史 Clip History | 剪贴板多条历史记录与置顶收藏，一键回填、搜索与图片预览 | `Ctrl+Shift+V` |
| JSON 编辑器 JSON Editor | JSON 语法校验 / 格式化展开 / 树状折叠 / Python 字典转合法 JSON / 单行压缩 / 快速转义 / 一键去注释 | `Ctrl+Shift+J` |
| 编码转换 Codec Lab | Base64 / URL / Hex / Unicode / JWT / 时间戳双向互转，哈希与对称加密 | `Ctrl+Shift+C` |
| 色彩工坊 Color Lab | RGBA 调色板 + 屏幕吸管取色（像素放大镜 / 冻结与动态双模式），HEX / RGB / HSL / HSV / ARGB 多格式互转 | `Ctrl+Shift+E` |
| 备忘录 Memo Notes | Markdown 分屏实时预览、笔记 / 待办 / 日历三视图、到期系统提醒、自动保存 | `Ctrl+Shift+N` |
| 端口与进程 Port Scope | 查 TCP/UDP 监听端口 + 进程名 + PID，过滤排序，一键结束进程 | `Ctrl+Shift+P` |
| 镜像源切换 Mirror Hub | npm / pip / docker / maven / rust 常见开发工具国内镜像源一键测速与切换（自动备份原配置） | `Ctrl+Shift+M` |
| 计算器 Calculator | 科学算式安全求值（AST 解析非 eval）、实时预览、历史记录、剪贴板算式智能求值 | `Ctrl+Shift+L` |
| 反重力代理启动器 Antigravity Launcher | Google Antigravity 进程级代理启动器：握手探测、网络诊断、终端代理与一键拉起 | `Ctrl+Shift+G` |

工具箱本身的呼出热键默认 `Alt+Shift+Space`，可在设置里自定义。

## 生态插件

更多工具以独立开源仓库分发，安装方式同样是复制 / clone 到用户插件目录：

- [orbit-plugin-pet](https://github.com/Ikaros-521/orbit-plugin-pet) — 桌面宠物：聊天审批卡片、工作流通知、AI 碎碎念
- [orbit-plugin-dsh-pet](https://github.com/Ikaros-521/orbit-plugin-dsh-pet) — DSH 伴随类桌宠桥接

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

📖 **官方开发文档**：<https://ikaros-521.github.io/orbit-tools/> —— 架构总览 / 插件开发 / 工作流编排 / API 参考，由 GitHub Actions 自动构建发布（源码在 [docs/](docs/)，VitePress）。

插件开发指南单页版见 [docs/plugin-guide.md](docs/plugin-guide.md)。

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
    ├── ai-chat/             # AI 对话（本地 Agent：工具循环 / MCP / 技能 / 子代理 / 记忆）
    ├── antigravity-launcher/# 反重力代理启动器（探测 / 诊断 / 终端 / 代理拉起）
    ├── calculator/          # 计算器（科学算式 + 实时预览 + 历史；剪贴板算式智能求值）
    ├── clip-history/        # 剪贴板历史（多条历史、置顶收藏与图片预览）
    ├── codec-lab/           # 编码转换（编解码 / 进制 / 哈希 / 对称加密，crypto 后端）
    ├── color-lab/           # 色彩工坊（RGBA 调色板 + 全屏吸管取色 + 像素放大镜）
    ├── draw-board/          # 屏幕画板（全屏透明画布 + 屏幕底图快照）
    ├── json-editor/         # JSON 编辑器（语法校验 / 树状折叠 / Python转JSON / 压缩转义）
    ├── memo/                # 备忘录（Markdown 分屏实时预览 + 行/字/词统计 + 自动保存）
    ├── mirror-hub/          # 镜像源切换（npm/pip/docker 等国内镜像源测速与切换）
    ├── port-scope/          # 端口进程（后端拆分 ports.js 平台层 + backend.js IPC 层）
    └── screenshot-pin/      # 截图悬浮（选区覆盖窗口 + 贴图窗口，各自独立 preload）
```

测试：`node tools/test-color-math.js`（颜色解析 / 转换单测）、`node tools/test-port-parsers.js`（解析器单测）、`electron tools/smoke-plugins.js`（插件系统冒烟）、`electron tools/uitest.js`（真实窗口 UI 回归，含热键冲突，截图输出到 dist/）。

安全边界：插件面板脚本运行在宿主渲染进程（contextIsolation、无 Node），只能通过 `Toolbox` 上下文调用宿主能力；插件后端模块运行在主进程，通过 `ctx` 拿到受控的窗口创建 / IPC / 持久化 API。插件自有窗口通过 `plugin://<id>/...` 协议加载资源，路径越界直接 403。

## 常见问题 (FAQ)

**Orbit Toolbox 是什么？**

Orbit Toolbox（轨道工具箱）是一款免费开源、uTools 风格的插件化开发者工具箱，基于 Electron 构建，支持 Windows / macOS / Linux。截图悬浮、剪贴板历史、JSON 编辑器、AI Agent 对话等常用小工具全部以插件形态内置，全局热键一键呼出，即开即用。

**和 uTools 有什么区别？**

- **完全开源**：AGPLv3 双重许可，源码可审计，无会员制、无功能付费墙；
- **插件即文件夹**：一个 `plugin.json` 清单 + 面板脚本就是插件，复制进目录即安装，无需打包、上架与审核；同 id 用户插件可直接覆盖升级内置插件；
- **无账号体系**：配置与插件数据全部保存在本地，不依赖云端；
- **内置本地 AI Agent**：多轮工具循环、MCP 市场与技能库、子代理派生，兼容 OpenAI / Claude 协议，可接入 DeepSeek 等任意兼容端点；
- **轻量技术栈**：无前端框架、无打包器，生产文件只有 `src/`，冷启动快。

**免费吗？可以商用吗？**

个人与组织均可免费使用、修改和分发，但须遵循 AGPLv3：基于本项目的衍生系统及相关代码必须同样以 AGPLv3 开源。闭源商业集成需购买商业授权，详见下方「开源协议与商业授权」。

**支持哪些操作系统？在哪里下载？**

Windows（x64）、macOS（Intel / Apple Silicon）、Linux（x64 / arm64）三平台，由 GitHub Actions 自动打包。安装包在 [GitHub Releases](https://github.com/Ikaros-521/orbit-tools/releases/latest) 下载。

**如何开发自己的插件？**

阅读[插件开发文档](https://ikaros-521.github.io/orbit-tools/plugin/overview.html)：一个文件夹 + `plugin.json` 清单即可起步；配套 `orbit-plugin-developer` AI Skill，对 AI 编程助手说一句话即可生成规范齐全的插件骨架。

更多问题（热键占用、插件数据位置、macOS 安装放行等）见[文档站 FAQ](https://ikaros-521.github.io/orbit-tools/reference/faq.html)。

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
