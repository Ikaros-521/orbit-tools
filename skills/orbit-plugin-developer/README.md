# Orbit Plugin Developer Skill 🚀

> 让 AI 助手成为您的 **Orbit Toolbox (轨道工具箱)** 插件开发专家！

本仓库提供面向 Agentic AI 编程工具（如 Google Antigravity、Cursor、Claude Code、Windsurf 等）的标准化 **AI Skill**。导入该技能后，AI 将掌握 Orbit Toolbox 的微核插拔架构规范、IPC 通信协议与设计系统，助您用自然语言几秒钟内生成功能完整、开箱即用的插件。

---

## 🌟 核心特性

- 💡 **规范生成**：自动生成严格符合规范的 `plugin.json`、多语言清单、SVG 图标与目录结构。
- ⚡ **开箱即用**：支持纯前端小工具 (Frontend-Only)、前后端全功能工具 (Fullstack) 与独立窗口辅助工具。
- 🎨 **主题无缝自适应**：自动应用 Orbit Toolbox 的琥珀质感设计规范，深色/浅色模式平滑切换。
- 🛠️ **配套 CLI 脚手架**：内置一键生成命令，免去手动创建模板文件的繁琐步骤。

---

## 📦 目录结构

```
orbit-plugin-developer/
├── SKILL.md                 # 核心 AI Skill 指令规范定义文件
├── README.md                # 技能说明文档
├── scripts/
│   └── create-plugin.js     # 命令行插件初始化脚手架
└── templates/               # 标准插件模板代码
    ├── frontend-only/       # 纯前端轻量小工具模板
    ├── fullstack/           # 带主进程后端的系统工具模板
    └── standalone-window/   # 具有独立置顶/辅助窗口的模板
```

---

## 🚀 如何在 AI 工具中使用本 Skill

### 1. 在 Google Antigravity 中使用
将本文件夹放置在全局或工作区 skills 目录下：
- 全局路径：`~/.gemini/antigravity/skills/orbit-plugin-developer`
- 工作区路径：`./.gemini/skills/orbit-plugin-developer`

即可在对话中自动激活，或通过 `/skill orbit-plugin-developer` 指定激活。

### 2. 在 Cursor / Windsurf / Claude Code 中使用
将 `SKILL.md` 的内容添加到项目的 `.cursorrules`、`.windsurfrules` 或 Claude Code 的系统提示词中，AI 在面对插件开发任务时将自动遵循该规范。

---

## 💬 示例提示词 (Prompts)

导入该 Skill 后，您只需向 AI 发送日常自然语言需求即可：

- *"帮我写一个用于 Orbit Toolbox 的 JSON 格式化与校验插件，支持一键压缩与美化"*
- *"我想开发一个局域网 Ping 扫描插件，需要执行原生 ping 命令并将 IP 列表在表格里刷新"*
- *"做一个取色器插件，按快捷键呼出放大镜跟随鼠标取色，并在主面板记录色值历史"*

---

## 🛠️ 本地命令行脚手架

本仓库还提供开箱即用的 Node.js 快速创建脚本：

```bash
# 创建纯前端小工具
node scripts/create-plugin.js my-json-viewer --template=frontend --output=/path/to/user/plugins

# 创建包含后端的系统工具
node scripts/create-plugin.js my-net-ping --template=fullstack --output=/path/to/user/plugins
```

---

## 📄 独立仓库发布指南

若您希望将本 Skill 单独作为一个 GitHub 仓库开源分发：
1. 在 GitHub 上新建仓库（如 `orbit-tools-skills` 或 `orbit-plugin-developer`）；
2. 将当前目录内容初始化为 Git 仓库并推送到远程：
   ```bash
   cd skills/orbit-plugin-developer
   git init
   git add .
   git commit -m "feat: initial commit for orbit plugin developer skill"
   git remote add origin https://github.com/<your-username>/orbit-plugin-developer.git
   git push -u origin main
   ```

---

## 许可证
[MIT License](LICENSE)
