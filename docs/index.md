---
layout: home

hero:
  name: Orbit Toolbox
  text: 轨道工具箱 · 官方开发文档
  tagline: uTools 风格的插件化开发者工具箱 —— 无前端框架、无打包器，contextIsolation 与 sandbox 全开。
  image:
    src: /logo.svg
    alt: Orbit Toolbox
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 下载安装
      link: https://github.com/Ikaros-521/orbit-tools/releases/latest
    - theme: alt
      text: 开发插件
      link: /plugin/overview
    - theme: alt
      text: GitHub
      link: https://github.com/Ikaros-521/orbit-tools

features:
  - icon: ✨
    title: 内置 AI Agent
    details: 本地 AI 对话助手：多轮工具循环、运行中插话、工具卡审批、MCP 市场与技能库、子代理派生、长期记忆；兼容 OpenAI / Claude 协议，多渠道多密钥。
    link: /reference/builtin-plugins
    linkText: 内置插件一览
  - icon: 🧩
    title: 插件即文件夹
    details: plugin.json 清单 + 面板脚本 + 可选后端。复制进用户插件目录即安装，同 id 用户插件可覆盖内置插件升级工具。
    link: /plugin/overview
    linkText: 了解插件系统
  - icon: ⌨️
    title: 全局热键
    details: 应用内共享注册表防冲突，精确检测外部软件独占并标黄提示，启动时自动降级备用键。
    link: /guide/architecture
    linkText: 架构总览
  - icon: 🔗
    title: 工作流编排
    details: 剪贴板触发、多步骤动作链、插件能力节点与数据信封管道，把小工具串成自动化流水线。
    link: /plugin/workflows
    linkText: 工作流引擎
  - icon: 🛡️
    title: 安全沙箱
    details: 面板运行在 contextIsolation + sandbox 渲染进程，无 Node 权限；plugin:// 协议路径越界直接拒绝。
    link: /guide/security
    linkText: 安全模型
  - icon: 🎨
    title: 双主题设计令牌
    details: 宿主提供 light-dark() CSS 变量令牌体系，插件直接引用即可完美适配深浅主题。
    link: /plugin/theming
    linkText: 设计系统
  - icon: 🤖
    title: AI Skill 脚手架
    details: 配套 orbit-plugin-developer 技能，对 AI 编程助手说一句话即可生成规范齐全的插件骨架。
    link: /plugin/ai-skill
    linkText: 快速生成插件
---
