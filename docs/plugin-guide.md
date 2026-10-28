# Orbit Toolbox 插件开发完全指南

Orbit Toolbox 采用现代化的**微核插拔架构**。无论是纯前端界面小工具、具有底层系统访问权限的后台工具，还是包含全屏辅助窗口的桌面交互组件，均可作为独立插件轻松开发与分发。

---

## 目录
1. [插件架构全景](#一插件架构全景)
2. [插件目录与安装位置](#二插件目录与安装位置)
3. [清单规范 (plugin.json)](#三清单规范-pluginjson)
4. [前端面板开发 (Renderer API)](#四前端面板开发-renderer-api)
5. [后端模块开发 (Main Process API)](#五后端模块开发-main-process-api)
6. [设计系统与主题适配](#六设计系统与主题适配)
7. [典型开发场景示例](#七典型开发场景示例)
8. [调试与测试最佳实践](#八调试与测试最佳实践)
9. [使用 AI Skills 快速生成插件](#九使用-ai-skills-快速生成插件)

---

## 一、插件架构全景

每个插件在文件系统中表现为一个独立的文件夹，核心由以下模块组成：

```
my-plugin/
├── plugin.json                 # 必需：插件元数据清单
├── icon.svg                    # 推荐：矢量图标 (24x24)
├── panel.js                    # 必需：主面板挂载脚本
├── panel.css                   # 可选：主面板专用样式
├── backend.js                  # 可选：主进程后端代码 (仅在需要 Node/Electron API 时)
├── <custom-window>.html        # 可选：辅助独立窗口 HTML
└── <custom-window>-preload.js  # 可选：辅助窗口的安全隔离脚本
```

- **安全沙箱隔离**：插件主面板运行在宿主渲染进程中，受 Context Isolation 与 CSP 保护，无直接 Node.js 原生权限，确保安全；
- **IPC 桥接通信**：若插件需读取文件、执行系统命令或监听端口，编写 `backend.js`，通过宿主提供的 `ctx.call()` 与 `ctx.ipc.handle()` 建立双向高效通信；
- **生命周期追踪**：宿主自动管理插件启用、禁用与重新加载。禁用插件时，其注册的所有 IPC 处理程序、定时器与辅助窗口将被彻底回收。

---

## 二、插件目录与安装位置

Orbit Toolbox 支持两类插件目录（用户插件在 ID 冲突时具有更高优先级，可覆盖内置同名插件）：

1. **内置插件目录**：项目仓库内的 `src/plugins/<id>/`；
2. **用户插件目录**：
   - 默认路径：操作系统 `userData/plugins`（如 Windows 下 `%APPDATA%\orbit-tools\plugins`）；
   - **自定义路径**：支持在 **「设置」** 或 **「插件中心」** 自定义指定任意文件夹（支持选择外部硬盘、云盘或 Git 仓库同步目录）。

只需将插件文件夹复制到用户插件目录，点击「重新扫描插件」，即可立即加载并使用！

---

## 三、清单规范 (plugin.json)

清单文件必须命名为 `plugin.json`，编码为 UTF-8：

```json
{
  "id": "codec-lab",
  "name": {
    "zh": "编码转换",
    "en": "Codec Lab"
  },
  "desc": {
    "zh": "Base64 / URL / Hex / Unicode / JWT / 时间戳 互转",
    "en": "Base64, URL, Hex, Unicode, JWT & Timestamp converter"
  },
  "version": "1.0.0",
  "category": "dev",
  "author": "YourName",
  "keywords": ["base64", "url", "hex", "jwt", "timestamp", "decode", "encode", "编码", "转换"],
  "icon": "icon.svg",
  "defaultEnabled": true,
  "panel": {
    "script": "panel.js",
    "style": "panel.css"
  },
  "backend": "backend.js",
  "actions": [
    {
      "id": "quick-run",
      "label": { "zh": "打开编码工具", "en": "Open Codec" },
      "method": "start",
      "hotkey": "Ctrl+Shift+C"
    }
  ]
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | ✓ | 插件全局唯一标识，小写字母开头，仅允许字母、数字和连字符，正则 `^[a-z][a-z0-9-]*$` |
| `name` | string / object | ✓ | 插件名称。支持中英多语言对象 `{ "zh": "...", "en": "..." }` |
| `desc` | string / object | ✓ | 插件一句话简介，同样支持 `{ "zh": "...", "en": "..." }` |
| `version` | string | | 语义化版本号，例如 `"1.0.0"` |
| `category` | string | | 插件分类胶囊标签：`"media"` (图像标注)、`"system"` (系统网络)、`"dev"` (开发辅助) 或自定义分类 |
| `author` | string | | 作者信息 |
| `keywords` | string[] | | 搜索关键词列表，宿主搜索框会同时匹配 ID、名称、描述和关键词 |
| `icon` | string | | 图标文件路径（相对插件根目录，如 `"icon.svg"`）或直接写 inline SVG 字符串 |
| `defaultEnabled` | boolean | | 首次扫描安装时是否默认启用，缺省为 `true` |
| `panel` | object | ✓ | 主界面点击进入的面板配置：`{ "script": "panel.js", "style": "panel.css" }` |
| `backend` | string | | 主进程入口文件（如 `"backend.js"`），若无需后台逻辑可省略 |
| `actions` | array | | 全局热键动作配置项数组，定义用户可在后台直接快捷触发的动作 |

---

## 四、前端面板开发 (Renderer API)

面板脚本运行在宿主窗口的面板视图区域（通过 `plugin://<id>/<script>` 隔离协议加载）。

### 注册与挂载

```javascript
// panel.js
(function () {
  function mount(el, ctx) {
    el.innerHTML = `
      <div class="tool-bar">
        <button type="button" class="btn" id="btnAction">执行操作</button>
      </div>
      <div class="my-content">
        <textarea id="myInput" class="input" placeholder="请输入内容..."></textarea>
      </div>
    `;

    const btn = el.querySelector('#btnAction');
    const input = el.querySelector('#myInput');

    btn.addEventListener('click', async () => {
      if (ctx.plugin.hasBackend) {
        // 调用后端暴露的方法
        const res = await ctx.call('doSomething', { text: input.value });
        alert('结果: ' + res);
      }
    });

    // 订阅后端主动推送的事件
    ctx.onEvent('data-updated', (payload) => {
      console.log('收到后端更新:', payload);
    });
  }

  function unmount() {
    // 可选：执行清理工作（如销毁定时器或释放重型资源）
  }

  window.Toolbox.panel({ mount, unmount });
})();
```

### `ctx` 上下文对象方法

| 属性 / 方法 | 类型 | 说明 |
|---|---|---|
| `ctx.plugin` | object | 插件元数据（包含 id, name, version, category, hasBackend 等） |
| `ctx.lang` | string | 当前宿主语言（`'zh'` 或 `'en'`） |
| `ctx.platform` | string | 当前运行平台操作系统（`'win32'`, `'darwin'`, `'linux'`） |
| `ctx.call(method, args)` | Promise<any> | 调用本插件 `backend.js` 中通过 `ctx.ipc.handle(method)` 注册的处理函数 |
| `ctx.onEvent(channel, fn)` | Function | 监听本插件后端发送的广播事件，返回解除订阅的取消函数 |
| `ctx.openExternal(url)` | Promise<void> | 唤起系统默认浏览器安全打开网页链接（必须为 `http://` 或 `https://`） |
| `ctx.savePng()` | Promise<string\|null> | 唤起系统文件保存对话框，选择 PNG 存储路径 |

---

## 五、后端模块开发 (Main Process API)

当插件需要执行系统命令、探测本地网络、操作文件系统或管理多窗口时，在 `plugin.json` 中配置 `"backend": "backend.js"`。

```javascript
// backend.js
module.exports = {
  activate(ctx) {
    // 1. 注册供给前端调用的 IPC 接口
    ctx.ipc.handle('doSomething', async (args) => {
      return `处理完成: ${args.text}`;
    });

    // 2. 本地持久化配置读取与存储
    const currentData = ctx.data.get();
    ctx.data.set({ lastActive: Date.now() });

    // 3. 广播事件至前端面板
    // ctx.send('data-updated', { status: 'ready' });
  },

  deactivate() {
    // 插件被禁用或重新扫描前执行清理（注销定时器、销毁自定义资源等）
  }
};
```

### 后端 `ctx` API 说明

- `ctx.ipc.handle(method, async (args, event) => ...)`：注册供前端 `ctx.call(method)` 调用的方法；
- `ctx.send(channel, payload)`：向当前插件的前端面板及所有自建窗口广播事件；
- `ctx.data.get()` / `ctx.data.set(patch)`：插件独立配置持久化存储（存放于 `<userData>/plugin-data/<id>.json`）；
- `ctx.windows.create(options)`：创建由宿主集中跟踪生命周期的辅助 `BrowserWindow`。插件禁用时会自动安全销毁；
- `ctx.url(relativePath)`：将相对路径转换为 `plugin://<id>/<relativePath>` 协议 URL；
- `ctx.root`：插件根目录绝对物理路径；
- `ctx.getHostWindow()`：获取主宿主窗口实例。

---

## 六、设计系统与主题适配

宿主环境提供了一套优雅的 CSS 变量，插件可直接使用以完美契合深色/浅色主题：

```css
/* panel.css */
.my-container {
  background: var(--bg);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  padding: 12px;
}

/* 按钮与交互元素可直接复用宿主公共类名 */
/* .btn, .btn.ghost, .btn.small, .input, .mono, .chip */
```

### 常用设计 Token

- 背景：`var(--bg)`、`var(--bg-card)`、`var(--bg-glass)`
- 文本：`var(--ink)` (主要文字)、`var(--ink-dim)` (次要说明)、`var(--ink-faint)` (弱提示)
- 强调色：`var(--amber)` (#ffab2e 系列高质感琥珀金)、`var(--amber-soft)`
- 边框：`var(--line)`、`var(--line-strong)`、`var(--line-subtle)`
- 圆角：`var(--r-sm)` (6px)、`var(--r-md)` (10px)、`var(--r-lg)` (14px)

---

## 七、典型开发场景示例

### 场景 1：纯前端便签小工具
无 `backend.js`，纯在 `panel.js` 中利用 `localStorage` 缓存便签文本。

### 场景 2：系统资源与进程管理
在 `backend.js` 中使用 Node.js 的 `child_process.exec` 执行系统命令（如 `netstat` 或 `ps`），清洗为 JSON 后通过 `ctx.ipc.handle('list')` 提供给 `panel.js` 的表格展示。

### 场景 3：全屏截图与全局取色
在 `plugin.json` 中配置 `actions`（绑定快捷键 `Ctrl+Alt+A`）。用户按下快捷键时触发 `backend.js` 的对应方法，利用 `ctx.windows.create()` 创建无边框、置顶的全屏透明窗口进行交互绘制。

---

## 八、调试与测试最佳实践

1. **实时生效**：
   - 处于开发阶段时，将插件目录软链接或复制到用户插件目录中；
   - 修改前端代码后，切换一下 Tab 即可重新挂载；修改后端代码后，在插件管理中心点击 **「重新扫描」** 即可完成热重载。
2. **自动化测试**：
   - 项目提供 `npm test`（冒烟测试）与 `npx electron tools/uitest.js`（完整端到端测试）；
   - 可在 `tools/smoke-plugins.js` 中将自己的插件加入断言进行验证。

---

## 九、使用 AI Skills 快速生成插件

为了让开发者能够结合 AI 编程助手（如 Antigravity、Cursor、Claude Code、Windsurf 等）瞬间构建出符合规范的高质量插件，本项目配套推出了专用的 Agentic AI Skill：

👉 **[Orbit Plugin Developer Skill 独立仓库规范](../skills/orbit-plugin-developer/README.md)**

您只需对 AI 说：
> "帮我开发一个用于 Orbit Toolbox 的 JSON 格式化与美化插件，支持高亮和一键压缩"

AI 即可自动调取该技能，生成规范齐全的 `plugin.json`、`panel.js` 和 `panel.css`！
