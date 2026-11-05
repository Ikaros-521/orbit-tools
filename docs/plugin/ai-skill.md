# AI Skill 脚手架

仓库内置了一个 Agentic AI 技能 **orbit-plugin-developer**（位于 [`skills/orbit-plugin-developer/`](https://github.com/Ikaros-521/orbit-tools/tree/main/skills/orbit-plugin-developer)），让 AI 编程助手（Antigravity、Cursor、Claude Code、Windsurf 等）一键生成符合规范的插件骨架。

## 用法

对支持技能加载的 AI 助手说一句话即可，例如：

> "帮我开发一个用于 Orbit Toolbox 的 JSON 格式化与美化插件，支持高亮和一键压缩"

AI 会调取技能，按规范生成 `plugin.json`、`panel.js`、`panel.css`（需要时含 `backend.js` 与独立窗口四件套）。

## 手动跑脚手架

技能内置模板生成脚本 `skills/orbit-plugin-developer/scripts/create-plugin.js`，支持三种模板：

| 模板 | 产物 |
|---|---|
| `frontend-only` | 纯前端插件（panel + manifest + icon） |
| `fullstack` | 全栈插件（panel + backend，走 `window.host` IPC） |
| `standalone-window` | 独立窗口插件（含 window 四件套与专属 preload） |

```bash
node skills/orbit-plugin-developer/scripts/create-plugin.js --help
```

参数细节以 `--help` 输出为准。已知行为：

- `standalone-window` 模板复制时会自动把模板内写死的占位插件 id 替换为你的插件 id —— 避免两个同模板插件的 IPC 通道重名冲突；
- 未知模板名直接报错退出，不会静默降级；
- `--output` 支持指定输出目录。

## 技能里都有什么

- `SKILL.md`：插件开发工作流、架构规范（无框架、无打包器、主渲染 IPC 通信准则）与测试校验流程；
- `templates/`：三套可直接落地的插件模板；
- 独立 MIT 许可（技能组件本身与主仓 AGPL 分离）。

配合阅读：[插件系统概览](/plugin/overview) → [清单规范](/plugin/manifest)。
