/* Automated tests for Open-Source Skills Market & Agent Skill Creation / Installation
   Run with: node tools/test-ai-skills-market.js */

const assert = require('assert');
const path = require('path');

const PLUGIN_DIR = path.join(__dirname, '..', 'src', 'plugins', 'ai-chat');

const {
  SKILL_MARKET_CATEGORIES,
  SKILL_MARKET_CATALOG,
  searchSkillMarket,
  getSkillMarketItem
} = require(path.join(PLUGIN_DIR, 'skills-market'));

const { SkillsService, DEFAULT_SKILLS } = require(path.join(PLUGIN_DIR, 'services', 'skills-service'));
const {
  AGENT_TOOLS_DEFINITIONS,
  AGENT_TOOL_META,
  resolveToolPermission
} = require(path.join(PLUGIN_DIR, 'agent-tools'));
const { isConcurrencySafe, CONCURRENCY_SAFE_TOOLS } = require(path.join(PLUGIN_DIR, 'services', 'tool-pipeline'));
const { ChatService } = require(path.join(PLUGIN_DIR, 'services', 'chat-service'));

async function main() {
  console.log('--- 1. Testing Open-Source Skills Catalog & Search ---');
  {
    assert.ok(Array.isArray(SKILL_MARKET_CATEGORIES) && SKILL_MARKET_CATEGORIES.length >= 5, 'Must have at least 5 categories');
    assert.ok(Array.isArray(SKILL_MARKET_CATALOG) && SKILL_MARKET_CATALOG.length >= 8, 'Must have at least 8 curated open-source skills');

    for (const item of SKILL_MARKET_CATALOG) {
      assert.ok(item.id && typeof item.id === 'string', 'Item must have valid ID');
      assert.ok(item.name && typeof item.name === 'string', 'Item must have name');
      assert.ok(item.category && typeof item.category === 'string', 'Item must have category');
      assert.ok(item.desc && typeof item.desc === 'string', 'Item must have desc');
      assert.ok(item.content && item.content.includes('#'), 'Item content must be valid Markdown');
    }

    // Test searchSkillMarket
    const devSkills = searchSkillMarket('', 'dev');
    assert.ok(devSkills.length >= 2, 'Should find dev skills');
    assert.ok(devSkills.every(s => s.category === 'dev'), 'Category filter dev');

    const searchRes = searchSkillMarket('代码评审', 'all');
    assert.ok(searchRes.length >= 1, 'Should find code review by keyword');
    assert.strictEqual(searchRes[0].id, 'market-code-review');

    // Test getSkillMarketItem
    const itemById = getSkillMarketItem('market-unit-testing');
    assert.ok(itemById, 'Found by ID');
    assert.strictEqual(itemById.id, 'market-unit-testing');

    const itemByName = getSkillMarketItem('Conventional Commits 语义化提交');
    assert.ok(itemByName, 'Found by name');
    assert.strictEqual(itemByName.id, 'market-git-commit');

    const itemMissing = getSkillMarketItem('non-existent-skill');
    assert.strictEqual(itemMissing, null, 'Non-existent returns null');

    console.log('PASS: Open-source skills catalog and search verified');
  }

  console.log('--- 2. Testing SkillsService Market & Template Operations ---');
  {
    const svc = new SkillsService();
    let genCount = 1;
    const genId = prefix => `${prefix}_test_${genCount++}`;
    let skills = [...DEFAULT_SKILLS];

    // getSkillMarket with installation state
    const marketList = svc.getSkillMarket({ query: '', category: 'all' }, skills);
    assert.strictEqual(marketList.ok, true);
    assert.ok(marketList.items.length >= 8);

    // Install an open-source skill
    const installRes = svc.installMarketSkill('market-unit-testing', skills, genId);
    assert.strictEqual(installRes.ok, true, 'installMarketSkill should succeed');
    assert.ok(skills.some(s => s.name === 'TDD 单元测试与边界用例'), 'Skill added to inventory');
    assert.strictEqual(installRes.skill.source, 'market:market-unit-testing');

    // Prevent duplicate installation
    const dupRes = svc.installMarketSkill('market-unit-testing', skills, genId);
    assert.strictEqual(dupRes.ok, false, 'Duplicate install should fail');
    assert.ok(dupRes.error.includes('已存在'), 'Duplicate error message');

    // Create skill based on open-source template
    const createFromTemplateRes = svc.createSkillFromMarket(
      'market-code-review',
      {
        name: '我的专属代码审查标准',
        desc: '针对 Orbit 项目的深度代码评审规则'
      },
      skills,
      genId
    );
    assert.strictEqual(createFromTemplateRes.ok, true, 'createSkillFromMarket succeeds');
    assert.strictEqual(createFromTemplateRes.skill.name, '我的专属代码审查标准');
    assert.strictEqual(createFromTemplateRes.skill.desc, '针对 Orbit 项目的深度代码评审规则');
    assert.ok(createFromTemplateRes.skill.content.includes('严格代码评审规范'), 'Inherits template content');
    assert.strictEqual(createFromTemplateRes.skill.source, 'template:market-code-review');

    // installSkillBySource with market ID
    const installBySourceRes = await svc.installSkillBySource('market-git-commit', skills, genId);
    assert.strictEqual(installBySourceRes.ok, true);
    assert.ok(skills.some(s => s.name === 'Conventional Commits 语义化提交'));

    // installSkillBySource with invalid source
    const invalidSourceRes = await svc.installSkillBySource('unknown-magic-skill', skills, genId);
    assert.strictEqual(invalidSourceRes.ok, false);
    assert.ok(invalidSourceRes.error.includes('未找到'));

    // createSkillFromInput with template_id
    const inputWithTemplateRes = await svc.createSkillFromInput(
      {
        template_id: 'market-security-audit',
        name: '内部安全红线规范',
        desc: '安全红线清单'
      },
      skills,
      genId
    );
    assert.strictEqual(inputWithTemplateRes.ok, true);
    assert.strictEqual(inputWithTemplateRes.skill.name, '内部安全红线规范');
    assert.ok(inputWithTemplateRes.skill.content.includes('安全审计'));

    console.log('PASS: SkillsService market install & template creation verified');
  }

  console.log('--- 3. Testing Agent Tools Definitions, Risk & Concurrency ---');
  {
    // Risk metadata
    assert.strictEqual(AGENT_TOOL_META.create_skill.risk, 'high', 'create_skill is high risk');
    assert.strictEqual(AGENT_TOOL_META.install_skill.risk, 'high', 'install_skill is high risk');
    assert.strictEqual(AGENT_TOOL_META.list_open_source_skills.risk, 'low', 'list_open_source_skills is low risk');

    // Permission resolver
    assert.strictEqual(resolveToolPermission('auto', 'list_open_source_skills'), 'auto', 'Low-risk auto executes');
    assert.strictEqual(resolveToolPermission('auto', 'create_skill'), 'ask', 'High-risk asks user in auto mode');
    assert.strictEqual(resolveToolPermission('full', 'create_skill'), 'auto', 'High-risk auto executes in full mode');

    // Concurrency whitelist
    assert.strictEqual(isConcurrencySafe('list_open_source_skills'), true, 'list_open_source_skills is concurrency-safe');
    assert.strictEqual(isConcurrencySafe('create_skill'), false, 'create_skill is mutating, not concurrency-safe');
    assert.strictEqual(isConcurrencySafe('install_skill'), false, 'install_skill is mutating, not concurrency-safe');

    // Tool schema presence
    const defNames = AGENT_TOOLS_DEFINITIONS.map(d => d.function && d.function.name);
    assert.ok(defNames.includes('create_skill'), 'create_skill declared in definitions');
    assert.ok(defNames.includes('install_skill'), 'install_skill declared in definitions');
    assert.ok(defNames.includes('list_open_source_skills'), 'list_open_source_skills declared in definitions');

    console.log('PASS: Agent Tools definitions, risk metadata, and concurrency verified');
  }

  console.log('--- 4. Testing ChatService dispatchAgentTool for Skills ---');
  {
    const chatService = new ChatService();
    const skills = [...DEFAULT_SKILLS];
    const skillsService = new SkillsService();
    let saved = false;
    const save = () => { saved = true; };
    const genId = prefix => `${prefix}_turn_${Math.random().toString(36).slice(2, 6)}`;
    const rt = {
      streamId: 'stream-1',
      session: { id: 's-1' },
      emit: () => {}
    };

    // 1. Tool call: list_open_source_skills
    const listRes = await chatService.dispatchAgentTool(
      'list_open_source_skills',
      JSON.stringify({ query: 'git', category: 'all' }),
      rt,
      { skills, skillsService, memories: [], save, ctx: {}, config: {}, genId }
    );
    assert.strictEqual(listRes.ok, true);
    assert.ok(listRes.skills.some(s => s.id === 'market-git-commit'));

    // 2. Tool call: install_skill
    saved = false;
    const installToolRes = await chatService.dispatchAgentTool(
      'install_skill',
      JSON.stringify({ source: 'market-git-commit' }),
      rt,
      { skills, skillsService, memories: [], save, ctx: {}, config: {}, genId }
    );
    assert.strictEqual(installToolRes.ok, true);
    assert.strictEqual(saved, true, 'State must be saved upon installation');
    assert.ok(skills.some(s => s.name === 'Conventional Commits 语义化提交'));

    // 3. Tool call: create_skill directly using open-source template
    saved = false;
    const createToolRes = await chatService.dispatchAgentTool(
      'create_skill',
      JSON.stringify({
        name: '自动化测试守则',
        desc: '适用于当前模块的自动化测试规则',
        template_id: 'market-unit-testing'
      }),
      rt,
      { skills, skillsService, memories: [], save, ctx: {}, config: {}, genId }
    );
    assert.strictEqual(createToolRes.ok, true);
    assert.strictEqual(saved, true, 'State must be saved upon creation');
    assert.strictEqual(createToolRes.name, '自动化测试守则');

    // 4. Verify list_skills & read_skill can read the newly created skill
    const listCurrentRes = await chatService.dispatchAgentTool(
      'list_skills',
      '{}',
      rt,
      { skills, skillsService, memories: [], save, ctx: {}, config: {}, genId }
    );
    assert.strictEqual(listCurrentRes.ok, true);
    assert.ok(listCurrentRes.skills.some(s => s.name === '自动化测试守则'));

    const readCreatedRes = await chatService.dispatchAgentTool(
      'read_skill',
      JSON.stringify({ skill_id: createToolRes.skill_id }),
      rt,
      { skills, skillsService, memories: [], save, ctx: {}, config: {}, genId }
    );
    assert.strictEqual(readCreatedRes.ok, true);
    assert.ok(readCreatedRes.content.includes('TDD 单元测试与边界用例规范'));

    console.log('PASS: ChatService dispatchAgentTool skill operations verified');
  }

  console.log('\n========================================');
  console.log('🎉 ALL OPEN-SOURCE SKILLS TESTS PASSED!');
  console.log('========================================');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
