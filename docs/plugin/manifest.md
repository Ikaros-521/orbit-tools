# 清单规范 plugin.json

`plugin.json` 是插件唯一必需的文件，UTF-8 编码，放在插件根目录。下面是一份真实内置插件（编码转换 codec-lab）的完整清单：

```json
{
  "id": "codec-lab",
  "name": { "zh": "编码转换", "en": "Codec Lab" },
  "desc": { "zh": "Base64 / URL / Hex / Unicode / JWT / 时间戳 互转", "en": "Base64, URL, Hex, Unicode, JWT & Timestamp converter" },
  "version": "1.0.0",
  "category": "dev",
  "author": "YourName",
  "keywords": ["base64", "url", "hex", "jwt", "编码", "转换"],
  "icon": "icon.svg",
  "defaultEnabled": true,
  "panel": { "script": "panel.js", "style": "panel.css" },
  "backend": "backend.js",
  "actions": [
    {
      "id": "open",
      "label": { "zh": "打开编码转换", "en": "Open Codec Lab" },
      "method": "openPanel",
      "hotkey": "Ctrl+Shift+C"
    }
  ],
  "consumes": ["text/plain", "application/json"],
  "capabilities": [
    {
      "id": "timestamp",
      "type": "text/timestamp",
      "title": { "zh": "时间戳转换", "en": "Timestamp convert" }
    }
  ]
}
```

## 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | ✓ | 全局唯一标识，须匹配 `^[a-z][a-z0-9-]*$`；也是数据文件名、IPC 命名空间与 `plugin://` 域名 |
| `name` | string / object | ✓ | 插件名，支持 `{ "zh": "...", "en": "..." }` 双语 |
| `desc` | string / object | ✓ | 一句话简介，同样支持双语对象；会显示在插件卡片与命令面板 |
| `version` | string | | 语义化版本号 |
| `category` | string | | 分类胶囊：`dev`（开发辅助）、`system`（系统网络）、`media`（图像标注）或自定义 |
| `author` | string | | 作者 |
| `keywords` | string[] | | 搜索关键词，宿主搜索同时匹配 id / 名称 / 描述 / 关键词（含拼音首字母） |
| `icon` | string | | 图标：相对路径（如 `"icon.svg"`）或 inline SVG 字符串 |
| `defaultEnabled` | boolean | | 首次扫描时是否默认启用，缺省 `true` |
| `panel` | object | ✓ | 面板配置：`{ "script": "panel.js", "style": "panel.css" }`，`style` 可省 |
| `backend` | string | | 后端入口文件，无系统需求可省 |
| `actions` | array | | 动作声明，见下节 |
| `consumes` | string[] | | 声明可接收的输入信封类型，驱动跨插件管道推荐 |
| `capabilities` | array | | 工作流能力节点声明，见[工作流与能力](/plugin/workflows) |

## actions：动作与热键

`actions` 定义"用户可以在后台直接触发的动作"，每个动作出现在命令面板与热键设置里：

| 字段 | 说明 |
|---|---|
| `id` | 动作标识，热键配置键为 `<插件id>:<动作id>` |
| `label` | 动作名（双语） |
| `method` | 触发时调用的后端方法名；特殊值 `openPanel` 表示打开主面板（纯前端插件也能用） |
| `hotkey` | 默认全局热键（如 `"Ctrl+Shift+C"`），用户可在设置中改绑或清空 |

触发链路：热键 / 命令面板 → `plugin-call` 路由到该插件后端的 `method`；若 `method` 为 `openPanel` 则由宿主直接唤起主窗口并打开面板。

::: tip 热键冲突
应用内所有热键共享注册表，重复分配会被拒绝并提示冲突；默认热键被外部软件独占时会在设置页标黄提示「注册失败，可能被占用」。给插件选默认热键时请尽量避开常见软件占用。
:::

## consumes：输入信封推荐

`consumes` 声明插件"吃得下"哪种数据信封（envelope）。宿主检测到划选文本 / 剪贴板内容属于某种类型（JSON、URL、颜色……完整类型表见[工作流与能力](/plugin/workflows)）时，命令面板会把这些插件顶到推荐位：

```
推荐优先级：划选文本类型匹配 > 剪贴板类型匹配 > 其他动作
```

典型声明：`"consumes": ["application/json", "text/plain"]`。

## 校验与加载失败的呈现

- `id` 不合法、`name` 缺失、`plugin.json` 无法解析 → 该文件夹以 ⚠️ 禁用占位卡呈现并注明原因，不影响其他插件；
- 声明了 `backend` 但文件不存在 → 激活失败，loadError 标注 `backend file missing`；
- 面板插件未写 `actions` → 自动注入 `{ id: "open", method: "openPanel" }` 动作。

## 图标建议

- 首选 24×24 SVG（跟随宿主明暗主题可用 `currentColor`）；
- PNG 亦可但无法自适应主题；
- 缺省时显示 🧩 占位。
