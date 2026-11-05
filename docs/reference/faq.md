# 常见问题

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
