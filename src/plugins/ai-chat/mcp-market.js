/* Curated MCP Market Catalog & Presets for AI Chat.
   Provides official & popular mature MCP servers from GitHub / npm,
   allowing one-click installation and easy retrieval. */

const DEFAULT_MCP_SERVERS = [
  {
    id: 'preset-playwright',
    name: 'Playwright',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest', '--headless'],
    env: {},
    enabled: true,
    isPreset: true,
    desc: '微软官方 Playwright 浏览器自动化：网页浏览、无障碍树提取、点击交互、表单输入与截图'
  }
];

const MARKET_CATEGORIES = [
  { id: 'all', label: '全部' },
  { id: 'browser', label: '🌐 浏览器自动化' },
  { id: 'dev', label: '💻 开发者与代码' },
  { id: 'search', label: '🔍 检索与抓取' },
  { id: 'data', label: '🗄️ 数据与存储' },
  { id: 'system', label: '⚙️ 系统与运维' }
];

const MCP_MARKET_CATALOG = [
  {
    id: 'preset-playwright',
    name: 'Playwright (浏览器自动化)',
    packageName: '@playwright/mcp',
    category: 'browser',
    official: true,
    repoUrl: 'https://github.com/microsoft/playwright-mcp',
    command: 'npx',
    args: ['-y', '@playwright/mcp@latest', '--headless'],
    env: {},
    desc: '微软官方出品，通过 Playwright 驱动真实浏览器，支持网页无障碍快照、点击交互、表单填写与截图，开箱即用。'
  },
  {
    id: 'market-puppeteer',
    name: 'Puppeteer (网页渲染)',
    packageName: '@modelcontextprotocol/server-puppeteer',
    category: 'browser',
    official: true,
    repoUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    env: {},
    desc: 'Anthropic 官方维护的 Puppeteer MCP 服务，支持在浏览器中加载网页、截图并抓取动态 JavaScript 内容。'
  },
  {
    id: 'market-fetch',
    name: 'Fetch (网页转 Markdown)',
    packageName: 'mcp-server-fetch',
    category: 'search',
    official: true,
    repoUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
    command: 'npx',
    args: ['-y', 'mcp-server-fetch'],
    env: {},
    desc: '官方网页抓取与转换服务，快速抓取网页 URL 并自动将 HTML 清洗转换为易读的 Markdown 文本供模型分析。'
  },
  {
    id: 'market-filesystem',
    name: 'Filesystem (文件系统访问)',
    packageName: '@modelcontextprotocol/server-filesystem',
    category: 'dev',
    official: true,
    repoUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
    env: {},
    desc: '官方文件系统 MCP，为 Agent 提供对指定目录的安全深度读写、目录树分析与文件搜索。'
  },
  {
    id: 'market-github',
    name: 'GitHub (仓库与 PR 管理)',
    packageName: '@modelcontextprotocol/server-github',
    category: 'dev',
    official: true,
    repoUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
    desc: '官方 GitHub 服务，支持搜索仓库、阅读提交、管理 Issue 和 PR（需在环境变量中配置 Token）。'
  },
  {
    id: 'market-git',
    name: 'Git (本地版本库操作)',
    packageName: 'mcp-server-git',
    category: 'dev',
    official: true,
    repoUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/git',
    command: 'npx',
    args: ['-y', 'mcp-server-git', '--repository', '.'],
    env: {},
    desc: '直接读取本地 Git 仓库历史、分支对比、状态分析与提交记录，助力代码重构与变更审查。'
  },
  {
    id: 'market-sqlite',
    name: 'SQLite (本地数据库分析)',
    packageName: '@modelcontextprotocol/server-sqlite',
    category: 'data',
    official: true,
    repoUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sqlite',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sqlite', '--db-path', 'data.db'],
    env: {},
    desc: '官方 SQLite 数据库服务，支持智能分析表结构、生成并安全执行 SQL 统计查询。'
  },
  {
    id: 'market-postgres',
    name: 'PostgreSQL (数据库交互)',
    packageName: '@modelcontextprotocol/server-postgres',
    category: 'data',
    official: true,
    repoUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/mydb'],
    env: {},
    desc: '官方 PostgreSQL 服务，支持通过连接串检索数据库模式并执行只读查询分析。'
  },
  {
    id: 'market-memory',
    name: 'Memory (知识图谱记忆)',
    packageName: '@modelcontextprotocol/server-memory',
    category: 'data',
    official: true,
    repoUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    env: {},
    desc: '官方基于知识图谱的持久化记忆服务，自动提取并沉淀实体及其关联网络。'
  },
  {
    id: 'market-brave-search',
    name: 'Brave Search (网络搜索)',
    packageName: '@modelcontextprotocol/server-brave-search',
    category: 'search',
    official: true,
    repoUrl: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: { BRAVE_API_KEY: '' },
    desc: '官方 Brave Search 网络搜索，支持实时互联网网页检索与信息整合（需填入 Brave API Key）。'
  },
  {
    id: 'market-docker',
    name: 'Docker (容器与镜像管理)',
    packageName: 'mcp-server-docker',
    category: 'system',
    official: false,
    repoUrl: 'https://github.com/quantfive/mcp-server-docker',
    command: 'npx',
    args: ['-y', 'mcp-server-docker'],
    env: {},
    desc: '查看、启动、重启本地 Docker 容器并检查实时日志与状态，辅助微服务调试。'
  },
  {
    id: 'market-everything',
    name: 'Everything (Windows 极速搜文件)',
    packageName: 'mcp-server-everything',
    category: 'system',
    official: false,
    repoUrl: 'https://github.com/mcp-everything/mcp-server-everything',
    command: 'npx',
    args: ['-y', 'mcp-server-everything'],
    env: {},
    desc: '通过 Everything SDK 在 Windows 上瞬间检索全盘千万级文件（需本地运行 Everything 软件）。'
  }
];

function searchMcpMarket(query, category) {
  const q = String(query || '').trim().toLowerCase();
  const cat = String(category || '').trim();
  let list = MCP_MARKET_CATALOG;
  if (cat && cat !== 'all') {
    list = list.filter(item => item.category === cat);
  }
  if (q) {
    list = list.filter(item =>
      item.name.toLowerCase().includes(q) ||
      item.desc.toLowerCase().includes(q) ||
      item.packageName.toLowerCase().includes(q)
    );
  }
  return list;
}

module.exports = {
  DEFAULT_MCP_SERVERS,
  MARKET_CATEGORIES,
  MCP_MARKET_CATALOG,
  searchMcpMarket
};
