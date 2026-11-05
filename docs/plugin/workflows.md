# 工作流与能力

工作流引擎让插件能力可以被**编排**：剪贴板一变就触发、多个工具串成管道、中间结果变量传递 —— 把"打开 A、复制、打开 B、粘贴"变成一次回车。

## 数据信封（Envelope）

工作流中流动的数据统一为信封结构：

```ts
{ type: string, value: string }
```

`type` 是 MIME 风格的内容类型。宿主内置 11 种嗅探器（`src/core/capabilities.js`），对任意文本自动判定类型：

| 类型 | 判定内容 |
|---|---|
| `application/json` | 合法 JSON |
| `text/url` | URL 链接 |
| `text/base64` | Base64 串 |
| `text/hex` | 十六进制串 |
| `text/unicode` | Unicode 转义序列 |
| `text/jwt` | JWT 令牌 |
| `text/timestamp` | 毫秒/秒级时间戳 |
| `color/css` | CSS 颜色值（`#fff` / `rgb()` …） |
| `math/expression` | 数学算式 |
| `system/port` | 端口号 |
| `text/plain` | 兜底纯文本 |

这套嗅探同时驱动命令面板的"划选 > 剪贴板 > 其他"三级动作推荐（配合插件 `consumes` 声明）。

## capabilities：把插件能力挂上画布

在 `plugin.json` 里声明 `capabilities`，该能力就会出现在工作流画布的「插件能力」节点库：

```json
"capabilities": [
  {
    "id": "shout",
    "type": "text/plain",
    "method": "makeLoud",
    "title": { "zh": "文本大喊", "en": "Shout" }
  }
]
```

| 字段 | 说明 |
|---|---|
| `id` | 能力标识，工作流节点保存为 `capabilityId` |
| `type` | 匹配 / 消费的信封类型；属于上表内置类型时即使没有 backend 也有内置转换 |
| `method` | 后端处理方法名，缺省等于 `id` |
| `title` | 节点库双语标题 |

执行 `action/plugin` 节点时按顺序解析：

1. **后端处理器**：`ctx.ipc.handle(method, ...)` 收到 `{ value, type, config }` 信封，返回字符串、`{ value, type }` 信封或任意 JSON 均可；
2. **内置转换**：无 backend 处理器时按 `type` 走宿主内置转换（如 JWT 自动解码、时间戳自动转日期）；
3. 都没有则明确报错。

同一能力同时服务于面板、全局热键与工作流，无需重复实现 —— 这是"一份能力，多个入口"的核心设计。

## 节点类型

| 类型 | 作用 | 关键配置 |
|---|---|---|
| `trigger/manual` | 手动 / 快捷键触发入口 | — |
| `trigger/clipboard` | 剪贴板内容匹配即触发 | `config.type`：信封类型（如 `application/json`） |
| `source/text` | 注入固定文本 | `config.text`、`config.type` |
| `util/delay` | 延时 | `config.ms` |
| `util/text-template` | 文本模板 | `config.template`，见下方变量 |
| `util/code-run` | 受限 JS 沙箱执行（5 秒超时） | `config.code`、`config.outputVariable` |
| `action/plugin` | 调用插件能力 | `pluginId`、`capabilityId` |

`util/text-template` 支持的占位符：

| 占位符 | 含义 |
|---|---|
| <span v-pre>`{{value}}`</span> / <span v-pre>`{{type}}`</span> | 上一步信封的值与类型 |
| <span v-pre>`{{date}}`</span> | 本地日期时间 |
| <span v-pre>`{{variables.x}}`</span> | 执行上下文变量 |
| <span v-pre>`{{nodes.<id>.value}}`</span> | 指定节点的输出值 |

`util/code-run` 的沙箱里可访问 `input` / `value` / `type` / `variables` / `nodes` 与 `context.get/set`，只能用纯计算 API（JSON / Math / Date / RegExp 等），无文件与网络。

## 执行语义

- **变量与节点上下文按次执行隔离**：`variables` / `nodes` 是每次执行的局部对象，并发触发（手动运行 × 剪贴板触发同时发生）互不污染；
- **超时保护**：步骤执行具备超时与错误阻断，防止死循环阻塞主线程；
- **剪贴板防自触发**：工作流自身写剪贴板不会再次触发 `trigger/clipboard`（避免环）；显然无法匹配 `config.type` 的剪贴板内容也会被预检跳过。

## API 入口

面板侧（宿主渲染进程）：

```javascript
window.host.listWorkflows()                      // 工作流列表
window.host.saveWorkflow(wf)                     // 保存（含节点/边/画布坐标）
window.host.deleteWorkflow(id)
window.host.runWorkflow(id, input)               // 手动执行，input 为初始信封
window.host.onWorkflowEvent(fn)                  // run-start / run-finish 等执行事件
```

后端侧：`ctx.workflows`（WorkflowManager 实例）可编程化加载 / 执行工作流。

完整字段以 `src/core/workflows.js` 与工作流编辑画布 UI 为准。
