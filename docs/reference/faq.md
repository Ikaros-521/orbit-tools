# 常见问题

## 产品相关

**Q：Orbit Toolbox 是什么？**

Orbit Toolbox（轨道工具箱）是一款免费开源、uTools 风格的插件化开发者工具箱，基于 Electron 构建。截图悬浮、剪贴板历史、JSON 编辑器、AI Agent 对话等常用小工具全部以插件形态内置，全局热键一键呼出，即开即用。

**Q：和 uTools 是什么关系？有什么区别？**

没有隶属关系，Orbit Toolbox 是独立的开源实现，交互上致敬 uTools 的「热键呼出 + 搜索面板」范式。区别：完全开源（AGPLv3 双重许可），无会员制与功能付费墙；插件即文件夹，复制即安装，无需打包上架审核；无账号体系，配置与插件数据全部保存在本地；内置本地 AI Agent 助手；无前端框架、无打包器，生产文件只有 `src/`。

**Q：免费吗？可以商用吗？**

个人与组织均可免费使用、修改和分发，但须遵循 AGPLv3：基于本项目的衍生系统及相关代码必须同样以 AGPLv3 开源。闭源商业集成需向版权所有者 Ikaros-521 购买商业授权（邮箱 327209194@qq.com）。

**Q：支持哪些操作系统？在哪里下载？**

Windows（x64）、macOS（Intel / Apple Silicon）、Linux（x64 / arm64），安装包在 [GitHub Releases](https://github.com/Ikaros-521/orbit-tools/releases/latest) 下载，应用内更新器会自动检查新版本。

**Q：内置 AI 对话支持哪些模型？**

兼容 OpenAI（Chat Completions / Responses）与 Claude（Messages）协议，支持多渠道配置与单渠道多密钥：DeepSeek、Kimi、智谱等任意兼容端点均可接入，并支持 MCP 市场、技能库与子代理派生。

## 插件相关

**Q：放了插件文件夹进去，插件中心没出现？**

先看有没有 ⚠️ 占位卡：有的话悬停 / 详情里注明了原因（`plugin.json missing/invalid`、`bad id`、`manifest.name missing` 等）。没有占位卡则检查：文件夹是否以 `.` 开头或叫 `node_modules`（这两类不扫描）、`id` 是否与现有插件重复且被内置版本遮蔽（用户目录**优先**，正常应覆盖）、是否忘了点「重新扫描」。

**Q：改了 `panel.js` 不生效？**

面板脚本在渲染层有会话级缓存，切换视图只会重新挂载同一份脚本 —— 重启应用才会重新加载脚本本体。`backend.js` 才是热重载（重新扫描即生效）。

**Q：插件数据存在哪里？**

`<userData>/plugin-data/<插件id>.json`（Windows 默认 `%APPDATA%\orbit-tools\plugin-data\`），设置页支持整体迁移插件数据目录。数据损坏时宿主会先把原文件备份为 `<id>.json.corrupt-<时间戳>` 再兜底空对象。

**Q：怎么升级 / 替换内置插件？**

把同 id 的插件文件夹放进用户插件目录即可，用户版本优先于内置版本 —— 不需要改主程序，也不怕应用更新时被覆盖回去（内置副本一直在，删掉用户副本即回滚）。

**Q：后端 `require` 了插件目录里的子模块，重新扫描后还是旧代码？**

正常情况下重新扫描会清空**整个插件目录**的模块缓存（含子模块）。如果你的模块被缓存到了别处（如全局对象、`process.env` 注入路径），需要自行规避。

## 热键相关

**Q：设置页热键标黄「注册失败，可能被占用」？**

该热键被外部软件（QQ、uTools、输入法、系统热键等）真实独占，宿主精确捕获了失败状态而非假成功。换一个热键，或关掉占用方。主窗口呼出键在**启动时**若被占用会自动尝试备用键降级，其余热键需手动改绑。

**Q：改绑插件热键后没反应？**

热键配置键是 `<插件id>:<动作id>`，动作对应的 `method` 必须在后端有处理器（或为保留的 `openPanel`）。用命令面板触发同一动作可快速区分"热键问题"还是"动作问题"。

## 平台相关

**Q：哪些功能是 Windows 专属？**

划选捕获的 UI Automation 读取（`selection-reader.cs`）与 GDI 屏幕取色（`gdi-cap.ps1`）依赖 Windows 原生组件；其他平台划选捕获自动回退按键模拟路径，取色插件在非 Windows 下不可用。端口进程、镜像源切换等跨平台正常。

**Q：macOS 安装包打开提示无法验证开发者？**

macOS 构建未签名（`CSC_IDENTITY_AUTO_DISCOVERY: false`），首次打开需在「系统设置 → 隐私与安全性」放行。

## 构建与发布

**Q：`npm install` 卡住？**

网络问题：`npm install --registry=https://registry.npmmirror.com`，或配置代理。

**Q：怎么触发发布？**

推送 `v*` 标签（`git tag v1.0.0 && git push origin v1.0.0`）→ 三平台矩阵打包 → 产物挂到自动生成 Release Notes 的 GitHub Release。也可 Actions 页面手动触发并标记预发布。应用内更新器会自动检查 Releases 并断点续传升级。

**Q：文档站怎么发布？**

`docs/**` 有变更的 main 推送会触发 `docs.yml` 构建并发布 GitHub Pages；本地 `cd docs && npm run dev` 预览。
