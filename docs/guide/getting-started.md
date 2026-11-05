# 快速开始

## 环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 20 | 随附 npm |
| Git | 任意较新版本 | 拉取仓库 |
| 操作系统 | Windows / macOS / Linux | 开发调试三平台均可；截图划选、GDI 取色等原生辅助仅 Windows 提供 |

> 国内网络环境下若 `npm install` 卡住，可切换镜像源：
> `npm install --registry=https://registry.npmmirror.com`

## 获取与运行

```bash
git clone https://github.com/Ikaros-521/orbit-tools.git
cd orbit-tools
npm install
npm start
```

首次启动会创建用户数据目录（Windows 下为 `%APPDATA%\orbit-tools\`），承载全局配置、插件数据与用户插件目录。

## 常用脚本

| 命令 | 作用 |
|---|---|
| `npm start` | 启动应用（开发即用，无构建步骤） |
| `npm test` | 插件系统冒烟测试（需 Electron 环境） |
| `npm run test:ui` | 渲染进程启动初始化端到端测试 |
| `npm run test:all` | 全量测试链：单测 → 冒烟 → UI → 工作流 |
| `npm run test:ai` | AI 对话插件专项测试链（十余个脚本） |
| `npm run test:color` / `test:updater` | 纯 Node 单测，无需 Electron |
| `npm run icon` | 由源图批量生成各尺寸应用图标 |
| `npm run dist:win` / `dist:mac` / `dist:linux` | electron-builder 打包安装包 |

注意两类测试的运行方式差异：

- **纯 Node 单测**（颜色数学、更新器流程、协议解析等）直接 `node tools/test-*.js`；
- **需要真实 Electron 环境的测试**（冒烟、UI、工作流、截图快照）必须经 Electron 二进制运行：`npx electron tools/xxx.js`，plain `node` 会因 `require('electron')` 失败。

## 目录结构速览

```
orbit-tools/
├── src/
│   ├── main.js               # 主进程入口：窗口 / 托盘 / 单实例 / 热键装配
│   ├── preload.js            # 宿主 contextBridge（window.host）
│   ├── core/                 # 平台核心：插件管理 / 配置 / 热键 / IPC / 工作流 / 更新
│   ├── renderer/             # 宿主 UI：工作台 / 动作抽屉 / 插件中心 / 设置 / i18n
│   └── plugins/              # 内置插件（每个子文件夹一个插件）
├── docs/                     # 本文档站点（VitePress）
├── skills/                   # orbit-plugin-developer AI 技能与插件脚手架模板
├── tools/                    # 测试与辅助脚本
└── .github/workflows/        # CI：release.yml 发布 / docs.yml 文档站
```

架构细节见 [架构总览](/guide/architecture)。

## 打包与发布

本地打包基于 `electron-builder`：

```bash
npm run dist:win     # NSIS 安装包 + portable（x64）
npm run dist:mac     # dmg + zip（arm64 / x64，未签名）
npm run dist:linux   # AppImage + deb（x64 / arm64）
```

正式发布走 GitHub Actions（`.github/workflows/release.yml`）：

1. 推送 `v*` 标签（如 `git tag v1.0.0 && git push origin v1.0.0`）；
2. Windows / Linux / macOS 三平台 runner 矩阵并行打包全部产物；
3. 产物自动汇总挂载到自动生成 Release Notes 的 GitHub Release（也可在 Actions 页面 `workflow_dispatch` 手动触发，并可选择标记为预发布）。

应用内置的**自动更新器**会定时检查 GitHub Releases 最新版本、做语义化版本比较并支持分片断点续传下载，因此走 Release 发布的版本用户端可自动升级。

## 文档站本地预览

本文档站源码在 `docs/` 下，同样可以本地跑：

```bash
cd docs
npm install
npm run dev      # 开发热更预览
npm run build    # 构建静态站点到 docs/.vitepress/dist
npm run preview  # 本地预览构建产物
```

推送到 main 分支且 `docs/**` 有变更时，`docs.yml` 工作流会自动构建并发布到 GitHub Pages。
