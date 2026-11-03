/* Unit tests for Playwright MCP Integration and MCP Market Catalog
   Run with: node tools/test-ai-mcp-playwright.js */

const assert = require('assert');
const {
  DEFAULT_MCP_SERVERS,
  MARKET_CATEGORIES,
  MCP_MARKET_CATALOG,
  searchMcpMarket
} = require('../src/plugins/ai-chat/mcp-market');
const { toOpenAiTool, formatToolResult, buildMcpToolName } = require('../src/plugins/ai-chat/mcp-client');

function testPlaywrightPreset() {
  console.log('Testing Playwright MCP Preset...');
  assert(Array.isArray(DEFAULT_MCP_SERVERS), 'DEFAULT_MCP_SERVERS must be an array');
  const pw = DEFAULT_MCP_SERVERS.find(s => s.id === 'preset-playwright');
  assert(pw, 'Playwright preset server must exist in DEFAULT_MCP_SERVERS');
  assert.strictEqual(pw.name, 'Playwright');
  assert.strictEqual(pw.transport, 'stdio');
  assert.strictEqual(pw.command, 'npx');
  assert(Array.isArray(pw.args), 'Playwright args must be an array');
  assert(pw.args.includes('@playwright/mcp@latest'), 'Playwright args must use @playwright/mcp@latest');
  assert(pw.args.includes('--headless'), 'Playwright args should include --headless by default');
  assert.strictEqual(pw.enabled, true, 'Playwright preset should be enabled by default');
  assert.strictEqual(pw.isPreset, true, 'Playwright should be marked as isPreset');
  console.log('PASS: Playwright MCP Preset configuration');
}

function testMarketCatalogAndCategories() {
  console.log('Testing MCP Market Catalog & Categories...');
  assert(Array.isArray(MARKET_CATEGORIES), 'MARKET_CATEGORIES must be an array');
  assert(MARKET_CATEGORIES.some(c => c.id === 'browser'), 'Must contain browser category');
  assert(MARKET_CATEGORIES.some(c => c.id === 'dev'), 'Must contain dev category');
  assert(MARKET_CATEGORIES.some(c => c.id === 'search'), 'Must contain search category');

  assert(Array.isArray(MCP_MARKET_CATALOG), 'MCP_MARKET_CATALOG must be an array');
  assert(MCP_MARKET_CATALOG.length >= 8, 'Market should have at least 8 curated MCP servers');

  for (const item of MCP_MARKET_CATALOG) {
    assert(item.id, 'Market item must have id');
    assert(item.name, `Market item ${item.id} must have name`);
    assert(item.packageName, `Market item ${item.id} must have packageName`);
    assert(item.category, `Market item ${item.id} must have category`);
    assert(item.command, `Market item ${item.id} must have command`);
    assert(Array.isArray(item.args), `Market item ${item.id} must have args array`);
    assert(item.desc, `Market item ${item.id} must have description`);
  }

  const pwMarket = MCP_MARKET_CATALOG.find(x => x.id === 'preset-playwright');
  assert(pwMarket, 'Playwright must be listed in MCP_MARKET_CATALOG');
  assert.strictEqual(pwMarket.category, 'browser');
  assert.strictEqual(pwMarket.official, true);

  console.log(`PASS: MCP Market Catalog has ${MCP_MARKET_CATALOG.length} valid verified entries`);
}

function testSearchMcpMarket() {
  console.log('Testing searchMcpMarket...');
  // 1. Search by name
  const resPw = searchMcpMarket('playwright');
  assert(resPw.length > 0, 'Searching "playwright" should return results');
  assert(resPw.some(x => x.id === 'preset-playwright'));

  // 2. Search by Chinese keyword
  const resBrowser = searchMcpMarket('浏览器');
  assert(resBrowser.length > 0, 'Searching "浏览器" should return results');

  // 3. Filter by category
  const resCat = searchMcpMarket('', 'browser');
  assert(resCat.length > 0, 'Filtering by "browser" should return items');
  assert(resCat.every(x => x.category === 'browser'));

  // 4. Combined search + category
  const resCombined = searchMcpMarket('playwright', 'browser');
  assert.strictEqual(resCombined.length, 1);
  assert.strictEqual(resCombined[0].id, 'preset-playwright');

  // 5. Non-existent query
  const resNone = searchMcpMarket('non_existent_xyz_404');
  assert.strictEqual(resNone.length, 0);

  console.log('PASS: searchMcpMarket queries and category filters');
}

function testPlaywrightMcpToolConversion() {
  console.log('Testing Playwright MCP tool mapping to OpenAI format...');

  const mockPlaywrightTools = [
    {
      name: 'browser_navigate',
      description: 'Navigate the browser to the given URL',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'The URL to navigate to' }
        },
        required: ['url']
      }
    },
    {
      name: 'page_screenshot',
      description: 'Take a screenshot of the current page',
      inputSchema: {
        type: 'object',
        properties: {
          fullPage: { type: 'boolean' }
        }
      }
    },
    {
      name: 'browser_click',
      description: 'Click an element identified by selector',
      inputSchema: {
        type: 'object',
        properties: {
          selector: { type: 'string' }
        },
        required: ['selector']
      }
    }
  ];

  for (const tool of mockPlaywrightTools) {
    const openAiDef = toOpenAiTool('Playwright', tool);
    assert.strictEqual(openAiDef.type, 'function');
    assert(openAiDef.function.name.startsWith('mcp__Playwright__'));
    assert(openAiDef.function.name.length <= 64, 'OpenAI tool name must be <= 64 chars');
    assert(openAiDef.function.description.includes(tool.description));
    assert.deepStrictEqual(openAiDef.function.parameters, tool.inputSchema);
  }

  // Test formatToolResult
  const mockResult = {
    content: [
      { type: 'text', text: 'Navigated to https://example.com. Title: Example Domain' }
    ]
  };
  const formatted = formatToolResult(mockResult);
  assert.strictEqual(formatted.ok, true);
  assert(formatted.result.includes('Example Domain'));

  console.log('PASS: Playwright MCP Tool schema conversion and result formatting');
}

function runAll() {
  testPlaywrightPreset();
  testMarketCatalogAndCategories();
  testSearchMcpMarket();
  testPlaywrightMcpToolConversion();
  console.log('\nALL PLAYWRIGHT MCP & MARKET TESTS PASSED!\n');
}

runAll();
