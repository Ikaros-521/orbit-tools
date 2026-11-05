/* Automated tests for Live Open-Source Skills & MCP Search Engines
   Run with: node tools/test-ai-live-market.js */

const assert = require('assert');
const path = require('path');

const PLUGIN_DIR = path.join(__dirname, '..', 'src', 'plugins', 'ai-chat');

const { LiveSkillsEngine, liveSkillsEngine } = require(path.join(PLUGIN_DIR, 'services', 'live-skills-engine'));
const { LiveMcpEngine, liveMcpEngine } = require(path.join(PLUGIN_DIR, 'services', 'live-mcp-engine'));
const { SkillsService, DEFAULT_SKILLS } = require(path.join(PLUGIN_DIR, 'services', 'skills-service'));
const McpService = require(path.join(PLUGIN_DIR, 'services', 'mcp-service'));
const { ChatService } = require(path.join(PLUGIN_DIR, 'services', 'chat-service'));

async function main() {
  console.log('--- 1. Testing LiveSkillsEngine In-Memory & Fallback Capabilities ---');
  {
    const engine = new LiveSkillsEngine();

    // Search without query returns both curated and featured hub entries
    const resAll = await engine.searchLiveSkills({ query: '', category: 'all', limit: 20 }, []);
    assert.strictEqual(resAll.ok, true, 'searchLiveSkills should return ok: true');
    assert.ok(resAll.items.length >= 8, 'Must return at least 8 items');
    assert.ok(resAll.items.some(i => i.sourceType === 'curated'), 'Contains curated presets');

    // Search with category filter
    const resDev = await engine.searchLiveSkills({ query: '', category: 'dev', limit: 20 }, []);
    assert.strictEqual(resDev.ok, true);
    assert.ok(resDev.items.every(i => i.category === 'dev'), 'All items should match dev category');

    // Search with query keyword
    const resReview = await engine.searchLiveSkills({ query: 'review', category: 'all', limit: 10 }, []);
    assert.strictEqual(resReview.ok, true);
    assert.ok(resReview.items.length >= 1, 'Should find review skills');

    // Fetch local curated content directly
    const curatedItem = resAll.items.find(i => i.sourceType === 'curated');
    assert.ok(curatedItem, 'Curated item exists');
    const contentRes = await engine.fetchRemoteSkillContent(curatedItem);
    assert.strictEqual(contentRes.ok, true);
    assert.ok(contentRes.content.includes('#'), 'Contains markdown body');

    console.log('PASS: LiveSkillsEngine search and content resolution verified');
  }

  console.log('--- 2. Testing LiveMcpEngine npm & GitHub Real-time Search ---');
  {
    const mcpEngine = new LiveMcpEngine();

    // Default search returns curated catalog
    const defaultRes = await mcpEngine.searchLiveMcp({ query: '', category: 'all' }, []);
    assert.strictEqual(defaultRes.ok, true);
    assert.ok(defaultRes.items.length >= 10, 'Curated MCP catalog included');
    assert.ok(defaultRes.items.some(i => i.packageName === '@playwright/mcp'), 'Playwright present');

    // Filter by category
    const browserRes = await mcpEngine.searchLiveMcp({ query: '', category: 'browser' }, []);
    assert.strictEqual(browserRes.ok, true);
    assert.ok(browserRes.items.every(i => i.category === 'browser'));

    console.log('PASS: LiveMcpEngine search verified');
  }

  console.log('--- 3. Testing SkillsService Remote Installation & Creation ---');
  {
    const svc = new SkillsService();
    let genCount = 1;
    const genId = prefix => `${prefix}_live_${genCount++}`;
    let skills = [...DEFAULT_SKILLS];

    // searchLiveSkills integrates with installed status
    const liveSearch = await svc.searchLiveSkills({ query: '代码评审', category: 'all' }, skills);
    assert.strictEqual(liveSearch.ok, true);
    assert.ok(liveSearch.items.length >= 1);

    // Install a target from remote / curated
    const target = liveSearch.items[0];
    const installRes = await svc.installRemoteSkill(target, skills, genId);
    assert.strictEqual(installRes.ok, true);
    assert.ok(skills.some(s => s.name === target.name), 'Installed into local skills');

    // Prevent duplicate installation
    const dupRes = await svc.installRemoteSkill(target, skills, genId);
    assert.strictEqual(dupRes.ok, false);
    assert.ok(dupRes.error.includes('已存在'));

    // Create a new customized skill based on remote template
    const createRes = await svc.createSkillFromRemote(
      target,
      {
        name: '项目专项代码评审规范',
        desc: '针对本项目的评审标准'
      },
      skills,
      genId
    );
    assert.strictEqual(createRes.ok, true);
    assert.strictEqual(createRes.skill.name, '项目专项代码评审规范');
    assert.ok(createRes.skill.content.includes('#'), 'Preserves markdown body');
    assert.ok(createRes.skill.source.startsWith('template:'), 'Marked with template source');

    console.log('PASS: SkillsService live search, remote install & template creation verified');
  }

  console.log('--- 4. Testing McpService Live npm MCP Installation ---');
  {
    const mcpService = new McpService();
    const servers = [];

    // Install an npm package directly from live search result
    const npmInstallRes = mcpService.installMarketMcp('npm:mcp-server-sqlite', servers);
    assert.strictEqual(npmInstallRes.ok, true);
    assert.strictEqual(servers.length, 1);
    assert.strictEqual(servers[0].name, 'mcp-server-sqlite');
    assert.strictEqual(servers[0].command, 'npx');
    assert.deepStrictEqual(servers[0].args, ['-y', 'mcp-server-sqlite@latest']);

    console.log('PASS: McpService live npm package install verified');
  }

  console.log('--- 5. Testing ChatService Agent Tool Real-time Discovery ---');
  {
    const chatService = new ChatService();
    const skills = [...DEFAULT_SKILLS];
    const skillsService = new SkillsService();
    let saved = false;
    const save = () => { saved = true; };
    const genId = prefix => `${prefix}_agent_${Math.random().toString(36).slice(2, 6)}`;
    const rt = {
      streamId: 'stream-live',
      session: { id: 's-live' },
      emit: () => {}
    };

    // Agent executes list_open_source_skills with online search
    const toolRes = await chatService.dispatchAgentTool(
      'list_open_source_skills',
      JSON.stringify({ query: 'review', online: true }),
      rt,
      { skills, skillsService, memories: [], save, ctx: {}, config: {}, genId }
    );

    assert.strictEqual(toolRes.ok, true);
    assert.ok(toolRes.total >= 1);
    assert.ok(toolRes.skills.length >= 1);
    assert.ok(toolRes.skills.some(s => (s.name || '').toLowerCase().includes('review') || (s.desc || '').includes('评审')));

    console.log('PASS: ChatService Agent Tool real-time discovery verified');
  }

  console.log('\n========================================');
  console.log('🎉 ALL LIVE MARKET TESTS PASSED!');
  console.log('========================================');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
