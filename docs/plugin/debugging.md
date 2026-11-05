# 调试与测试

## 开发迭代循环

推荐开发布局：把开发中的插件目录**软链接 / junction 到用户插件目录**，宿主直接加载真实源码：

```bash
# Windows（在用户插件目录 %APPDATA%\orbit-tools\plugins 内建 junction）
mklink /J "%APPDATA%\orbit-tools\plugins\my-plugin" "E:\dev\my-plugin"
```

| 你改了什么 | 如何生效 |
|---|---|
| `panel.css` | 重开面板（样式随挂载注入） |
| `panel.js` | **重启应用** —— 面板脚本在渲染层有会话级缓存，切换视图只会重新挂载同一份脚本 |
| `backend.js`（含其 require 的子模块） | 插件中心点「重新扫描」，整目录模块缓存被清空，热重载 |
| `plugin.json` | 重新扫描 |

## DevTools

宿主窗口可直接开 DevTools 调试面板 DOM / 网络 / 控制台；主进程日志看启动终端。注意生产构建同样可用 DevTools 排查用户问题。

## 测试体系

仓库的测试都在 `tools/` 下，按运行时分两类：

**纯 Node 单测**（直接 `node` 运行）：

| 脚本 | 覆盖 |
|---|---|
| `test-color-math.js` | 颜色空间转换数学 |
| `test-updater-flow.js` | 版本比较 / 平台 Asset 匹配 |
| `test-ai-*.js` | AI 对话插件：协议适配、Markdown/流式渲染、MCP、任务生命周期等十余个专项 |

**Electron 环境测试**（必须 `npx electron tools/xxx.js` 运行）：

| 脚本 | 覆盖 |
|---|---|
| `smoke-plugins.js` | 全部插件清单 / 资源 / 加载与跨插件路由冒烟 |
| `test-renderer-boot.js` | 渲染进程启动初始化端到端 |
| `test-deck-sort.js` | 插件卡片排序持久化 |
| `test-workflows.js` / `test-workflow-ui.js` | 工作流引擎与编辑 UI |
| `test-card-responsive.js` | 窄窗口自适应 |
| `uitest.js` | 真实窗口全流程 UI 回归（含热键冲突，截图输出到 dist/） |
| `workflow-scenarios/*.js` | 工作流场景用例（剪贴板触发 / 插件能力 / 内置工具链 / AI 辅助） |

入口脚本：`npm test`（冒烟）、`npm run test:ui`、`npm run test:all`（全量链）、`npm run test:ai`（AI 插件专项链）。

::: tip 项目约定
新增 ai-chat 相关测试脚本时，须同步挂入 `test:ai` 链与 `test:all` 链（`package.json`），保持一条命令跑全量。
:::

## 给自己的插件写测试

1. **纯函数拆出来**：像 `color-lab/color-math.js`、`port-scope/ports.js` 那样把算法 / 解析器拆成独立模块，`node` 直测，无需 Electron；
2. **接入冒烟**：在 `smoke-plugins.js` 里为自己的插件补断言（清单加载、资源可达、IPC 往返）；
3. **UI 断言**：复杂面板参考 `uitest.js` 的真实窗口驱动方式。

## CI

- `.github/workflows/release.yml`：`v*` 标签 → 三平台打包 + GitHub Release；
- `.github/workflows/docs.yml`：`docs/**` 变更 → 构建文档站发布 GitHub Pages。

测试当前在本地运行为主，CI 聚焦打包发布。
