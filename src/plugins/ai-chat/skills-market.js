/* Curated Open-Source Skills Market Catalog & Presets for AI Chat.
   Provides official & popular open-source agent skills,
   allowing one-click installation and template-based creation. */

const SKILL_MARKET_CATEGORIES = [
  { id: 'all', label: '全部' },
  { id: 'dev', label: '💻 代码与重构' },
  { id: 'qa', label: '🧪 测试与质量' },
  { id: 'prompt', label: '📝 提示词与架构' },
  { id: 'workflow', label: '🚀 规范与流程' },
  { id: 'security', label: '🔍 分析与安全' }
];

const SKILL_MARKET_CATALOG = [
  {
    id: 'market-code-review',
    name: '严格代码评审规范',
    category: 'dev',
    official: true,
    repoUrl: 'https://github.com/orbit-tools/agent-skills/tree/main/code-review',
    desc: '从逻辑正确性、安全漏洞、边界分支、可读性与潜在性能瓶颈进行系统性逐项审查。',
    content: `# 严格代码评审规范 (Code Review)

为项目进行代码审查时，必须客观严谨，按以下维度逐项核对并给出明确的审查报告：

## 1. 核心审查维度
- **正确性与逻辑边界**：检查空指针/undefined、数组越界、异步时序竞态、错误捕获与资源泄漏。
- **安全性与防御**：检查输入校验、防注入、敏感配置泄露、越权与不安全的序列化/反序列化。
- **可读性与风格**：函数单一职责、变量命名见名知意、遵循 KISS 原则，拒绝过度设计与玄学写法。
- **性能与复杂度**：避免明显的循环嵌套计算、高频 DOM 操作、不必要的全量内存加载与阻塞 I/O。
- **契约与向下兼容**：公共 API、IPC 通信协议与数据持久化格式的修改必须保证向下兼容。

## 2. 输出格式要求
以 Markdown 格式输出审查报告：
1. **总体结论**：[通过] / [需修改后通过] / [拒绝]
2. **阻断性问题 (Blockers)**：列出可能导致故障或安全隐患的问题及修复建议。
3. **优化建议 (Improvements)**：代码风格或微小可优化项。
4. **验证建议**：指出测试验证重点路径。`
  },
  {
    id: 'market-unit-testing',
    name: 'TDD 单元测试与边界用例',
    category: 'qa',
    official: true,
    repoUrl: 'https://github.com/orbit-tools/agent-skills/tree/main/unit-testing',
    desc: '遵循 AAA (Arrange-Act-Assert) 模式编写高覆盖率、无外部副作用的单元测试与异常断言。',
    content: `# TDD 单元测试与边界用例规范

编写自动化测试与单元用例时遵循以下原则：

## 1. 设计原则
- **AAA 结构**：每个测试用例清晰分为 Arrange (准备数据/环境)、Act (执行目标方法)、Assert (校验预期输出)。
- **隔离性与无副作用**：用例之间独立运行，严禁依赖测试顺序；涉及文件系统或外部网络必须使用 Mock 或沙箱临时路径并在结束后严格清理。
- **确定性与幂等性**：测试结果严禁依赖机器时间戳、未排序的系统哈希或随机种子。
- **边界与异常覆盖**：除 Happy Path 外，必须覆盖 null/undefined、空字符串、极限数字范围、超时以及异常抛出路径。

## 2. 命名与断言约定
- 测试函数命名：\`should [预期行为] when [特定条件]\`。
- 断言信息明确：当断言失败时，必须能够从输出信息中清晰看出预期值与实际值的差异。`
  },
  {
    id: 'market-git-commit',
    name: 'Conventional Commits 语义化提交',
    category: 'workflow',
    official: true,
    repoUrl: 'https://github.com/orbit-tools/agent-skills/tree/main/git-commit',
    desc: '按照 Conventional Commits 规范生成精确的 Commit 消息，涵盖 feat/fix/refactor/test 等类型。',
    content: `# Conventional Commits 语义化提交规范

生成或审查 Git 提交信息时，遵循严格的语义化规范：

## 1. 提交结构
\`\`\`text
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
\`\`\`

## 2. Type 类型定义
- **feat**: 新增功能 (对外的用户可见功能或能力扩展)
- **fix**: 修复 Bug 或缺陷
- **refactor**: 代码重构 (既不增加新功能也不修改 Bug 的结构优化)
- **perf**: 性能提升
- **test**: 增加或修复测试用例
- **docs**: 文档更新
- **style**: 代码格式、标点微调 (不影响逻辑)
- **chore**: 构建系统、依赖更新或辅助工具变动

## 3. 规范要求
- 主题句 (subject) 必须使用中文动词开头，简明扼要，末尾不加句号。
- 如有重大破坏性变更，在 type 后加 \`!\` 并在正文或 footer 详细说明 BREAKING CHANGE。`
  },
  {
    id: 'market-api-spec',
    name: 'RESTful API 与契约设计',
    category: 'dev',
    official: true,
    repoUrl: 'https://github.com/orbit-tools/agent-skills/tree/main/api-spec',
    desc: '标准化 RESTful 接口设计，涵盖资源路径、HTTP 动词、统一状态码与响应体 Schema。',
    content: `# RESTful API 与契约设计规范

在设计或审查服务端 API、IPC 请求和数据交换契约时遵循：

## 1. URI 与资源路径
- URI 中使用名词复数表示资源集合，如 \`/api/v1/sessions\`、\`/api/v1/skills\`。
- 嵌套关系表示归属，如 \`/api/v1/sessions/:id/messages\`。
- 动词与动作通过标准 HTTP Method 表达：
  - \`GET\`: 获取资源（只读，保证安全与幂等）
  - \`POST\`: 创建新资源
  - \`PUT\`: 全量替换资源
  - \`PATCH\`: 部分更新资源
  - \`DELETE\`: 删除资源

## 2. 统一响应体格式
无论成功或失败，返回结构保持一致：
\`\`\`json
{
  "ok": true,
  "code": 200,
  "data": { ... },
  "message": "success",
  "requestId": "req_xxx"
}
\`\`\`
出现异常时返回统一错误结构：\`{ "ok": false, "code": 400, "error": "具体错误原因" }\`。`
  },
  {
    id: 'market-prompt-architect',
    name: 'Prompt 结构化提示词设计',
    category: 'prompt',
    official: true,
    repoUrl: 'https://github.com/orbit-tools/agent-skills/tree/main/prompt-architect',
    desc: '以角色/背景/目标/执行步骤/输入约束/输出格式等标准模块构建高质量系统级 Prompt。',
    content: `# Prompt 结构化提示词设计规范

为 AI Agent 或针对特定业务设计系统提示词 (System Prompt) 时遵循以下结构化方法：

## 1. 结构化模块拆分
提示词应按清晰的分区组织（推荐 Markdown 标题或 XML 风格标签）：
1. **[Role & Identity]**：明确助手的身份定位、专业领域与语气基调。
2. **[Context & Background]**：阐述当前系统环境、可用工具与业务背景。
3. **[Goals & Workflow]**：定义标准执行步骤与思考框架（先分析 → 列方案 → 执行 → 验证）。
4. **[Constraints & Boundaries]**：列出绝对禁止事项（安全边界、不猜测、事实为本）。
5. **[Output Format]**：规定严格的输出格式或结构示例。

## 2. 关键设计原则
- **正向具体，杜绝模糊**：用“应该做什么并举例”代替模糊的“尽量好一点”。
- **前缀缓存友好 (Prefix Caching)**：保证高频复用的静态指令块位于最前端，动态变量和临时数据放在末尾，避免破坏 KV 缓存命中。
- **少即是多**：去除冗余礼貌用语和重复说明，保持指令高信息密度。`
  },
  {
    id: 'market-clean-refactor',
    name: 'Clean Code 代码重构指南',
    category: 'dev',
    official: true,
    repoUrl: 'https://github.com/orbit-tools/agent-skills/tree/main/clean-refactor',
    desc: '消除坏味道，降低圈复杂度，提取纯函数、模块解耦与遵循单一职责设计。',
    content: `# Clean Code 代码重构指南

进行代码重构与坏味道消除时遵循：

## 1. 常见坏味道与重构手法
- **长函数与大文件**：拆分为职责专一的小函数，单函数长度建议控制在 50 行以内。
- **深层嵌套与箭头型代码**：使用 Guard Clauses (保护条件反转提前 return) 压平嵌套。
- **魔法数字与硬编码字符串**：提取具有业务语义的常量或枚举配置。
- **冗余重复代码 (DRY)**：提取通用纯函数或公共工具类，纯函数必须具备高内聚与无副作用。
- **过度复杂的布尔表达式**：将多条件组合抽取为语义化变量名（如 \`const isEligibleForDiscount = ...\`）。

## 2. 安全重构准则
- 每次重构只关注代码结构，绝不顺手修改业务行为；
- 重构前确保有完善的测试用例覆盖，重构后运行全量测试确认 100% 通过。`
  },
  {
    id: 'market-security-audit',
    name: 'Web 与应用安全审计',
    category: 'security',
    official: true,
    repoUrl: 'https://github.com/orbit-tools/agent-skills/tree/main/security-audit',
    desc: '排查 SQL/命令注入、XSS、敏感数据泄露、未授权访问与越权漏洞。',
    content: `# Web 与应用安全审计清单

审查应用程序与代码安全时，逐项核对并给出风险等级评定：

## 1. 重点安全排查项
- **注入漏洞 (Injection)**：命令执行 (child_process/exec)、SQL 查询、LDAP 等必须使用参数化或安全转义，严禁直接拼接外部字符串。
- **XSS 跨站脚本攻击**：用户输入渲染至 HTML 时必须做转义处理（如 escapeHtml）；对于 Markdown 解析器，严格禁用危险标签与 \`javascript:\` 伪协议。
- **路径遍历与文件越权**：文件读写必须通过安全函数校验目标路径是否落在允许的安全工作区内，防范 \`../\` 越权。
- **敏感信息暴露**：API Key、数据库密码、私钥不得硬编码在仓库代码中，日志打印时必须脱敏。
- **反序列化与动态执行**：避免使用危险的 \`eval\` 或不可信的动态反序列化；在沙箱环境中执行代码需设置严格资源上限与超时。

## 2. 审查产出
标明风险等级：[高危 Critical] / [中危 Moderate] / [低危 Low]，并给出具体可落地的防御修复方案。`
  },
  {
    id: 'market-tech-doc',
    name: '技术文档与 ADR 架构决策',
    category: 'workflow',
    official: true,
    repoUrl: 'https://github.com/orbit-tools/agent-skills/tree/main/tech-doc',
    desc: '编写清晰专业的技术设计文档、架构决策记录 (ADR) 与系统维护指南。',
    content: `# 技术文档与 ADR 架构决策规范

编写技术设计方案与架构决策记录时遵循以下标准结构：

## 1. ADR 架构决策记录模板
- **Title (标题)**: ADR-xxx: 决策简短说明
- **Status (状态)**: [提议中 / 已批准 / 已废弃 / 被替代]
- **Context (背景与问题)**: 阐明面临的技术挑战、限制条件与诉求。
- **Decision (决策方案)**: 明确采纳的具体架构与实现路径，阐述主要原理。
- **Consequences (影响与权衡)**:
  - 正向收益：解决了什么核心问题、提升了什么指标。
  - 潜在妥协：引入了什么额外成本或需要注意的技术约束。

## 2. 文档语言规范
- 使用客观、精确的技术中文，避免歧义用词；
- 包含清晰的调用链路或流程图（Mermaid 格式最佳）；
- 标明版本号、更新日期与相关接口契约。`
  },
  {
    id: 'market-orbit-workflow',
    name: 'Orbit 可视化工作流设计规范',
    category: 'workflow',
    official: true,
    repoUrl: 'https://github.com/orbit-tools/agent-skills/tree/main/orbit-workflow',
    desc: '设计 Orbit Toolbox 可视化工作流节点拓扑、触发器连线、数据转换与出口。',
    content: `# Orbit 可视化工作流设计规范

为 Orbit Toolbox 设计或生成工作流时遵循：

## 1. 节点设计约束
1. **入口用触发器**：\`trigger/clipboard\` (剪贴板监听) 或 \`trigger/manual\` (手动触发)，二选一；不要用触发器连触发器。
2. **节点命名**：title 使用「动词+对象」中文短语，如「正则提取订单号」「格式化 JSON」。
3. **坐标布局**：x 每列间隔 280，y 同层对齐 120，拓扑清晰，避免交叉连线。
4. **数据处理**：优先使用 \`util/regex-extract\`、\`util/replace\`、\`util/text-template\` 等专用节点；仅当逻辑复杂无法表达时才用 \`util/code-run\` 编写纯 JS 脚本。
5. **出口与通知**：处理结果通常通过 \`output/clipboard\` 写回剪贴板，必要时附加 \`output/notification\` 系统气泡提示。
6. **条件分支**：\`util/condition\` 必须明确连出真/假两条出口，避免出现悬空悬挂分支。`
  },
  {
    id: 'market-frontend-perf',
    name: '前端性能优化与响应式设计',
    category: 'dev',
    official: true,
    repoUrl: 'https://github.com/orbit-tools/agent-skills/tree/main/frontend-perf',
    desc: '优化 DOM 重绘重排、事件委托、虚拟列表以及桌面端与窄屏自适应布局。',
    content: `# 前端性能优化与响应式设计规范

针对前端 UI 渲染、交互响应与多分辨率适配遵循：

## 1. 渲染性能优化
- **减少强制重排 (Reflow)**：批量读取 DOM 几何属性与批量写入分离；频繁变动的 DOM 优先使用 DocumentFragment 或离线构建后一次性挂载。
- **事件委托**：列表项点击与高频事件尽可能在父容器上委托处理，避免成百上千个 DOM 节点重复绑定独立监听器。
- **防抖与节流**：搜索输入监听必须加入 debounce (通常 200~300ms)；滚动与 resize 监听加入 throttle。
- **长列表优化**：超大规模数据列表采用虚拟滚动或分页加载，避免单次渲染超过 100 个复杂卡片节点。

## 2. 响应式布局与主题适配
- **CSS 变量解耦**：所有颜色、间距、圆角必须使用统一的设计系统 CSS 变量，严禁在业务样式中写死十六进制色值。
- **弹性盒与网格**：优先使用 Flexbox 与 Grid 构建自适应栅格，在小窗口或分屏模式下卡片自动折行与单列堆叠。`
  }
];

function searchSkillMarket(query, category) {
  const q = String(query || '').trim().toLowerCase();
  const cat = String(category || 'all').trim();

  return SKILL_MARKET_CATALOG.filter(item => {
    if (cat !== 'all' && item.category !== cat) return false;
    if (!q) return true;
    return (
      (item.name || '').toLowerCase().includes(q) ||
      (item.desc || '').toLowerCase().includes(q) ||
      (item.content || '').toLowerCase().includes(q)
    );
  });
}

function getSkillMarketItem(id) {
  if (!id) return null;
  const targetId = String(id).trim();
  return SKILL_MARKET_CATALOG.find(item => item.id === targetId || item.name === targetId) || null;
}

module.exports = {
  SKILL_MARKET_CATEGORIES,
  SKILL_MARKET_CATALOG,
  searchSkillMarket,
  getSkillMarketItem
};
