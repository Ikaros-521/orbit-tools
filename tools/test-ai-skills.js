/* Tests for skill import: frontmatter parsing, GitHub URL resolution,
   bulk import dedupe, and URL download against a local HTTP source.
   Run with: node tools/test-ai-skills.js */

const assert = require('assert');
const http = require('http');
const path = require('path');

const PLUGIN = path.join(__dirname, '..', 'src', 'plugins', 'ai-chat');

async function main() {
  const { parseSkillMarkdown, resolveSkillSourceUrl } = require(path.join(PLUGIN, 'skills-util.js'));

  /* --- 1. frontmatter / fallback parsing ---------------------------------- */
  {
    const a = parseSkillMarkdown('whatever.md', '---\nname: SQL 优化指南\ndescription: "数据库查询优化方法论"\n---\n\n# SQL 优化\n\n第一步…');
    assert.strictEqual(a.name, 'SQL 优化指南');
    assert.strictEqual(a.desc, '数据库查询优化方法论');
    assert.ok(a.content.startsWith('# SQL 优化'), 'frontmatter stripped from content');

    const b = parseSkillMarkdown('api-doc-guide.md', '# API 文档撰写规范\n\n本文档规定…');
    assert.strictEqual(b.name, 'API 文档撰写规范');
    assert.strictEqual(b.desc, '本文档规定…');

    const c = parseSkillMarkdown('my_cool_skill.md', '直接以正文开始的技能内容。\n\n第二段。');
    assert.strictEqual(c.name, 'my cool skill');
    assert.ok(c.desc.startsWith('直接以正文开始的技能内容'));

    const d = parseSkillMarkdown('x.md', '---\nname: 带引号\n---\n正文');
    assert.strictEqual(d.name, '带引号');
    console.log('PASS: parseSkillMarkdown (frontmatter / heading / filename fallbacks)');
  }

  /* --- 2. GitHub URL resolution ------------------------------------------- */
  {
    const blob = resolveSkillSourceUrl('https://github.com/anthropics/skills/blob/main/docs/skills/sql.md');
    assert.strictEqual(blob.kind, 'file');
    assert.strictEqual(blob.rawUrl, 'https://raw.githubusercontent.com/anthropics/skills/main/docs/skills/sql.md');
    assert.strictEqual(blob.filename, 'sql.md');

    const tree = resolveSkillSourceUrl('https://github.com/anthropics/skills/tree/main/docs/skills');
    assert.deepStrictEqual(tree, { kind: 'folder', owner: 'anthropics', repo: 'skills', branch: 'main', path: 'docs/skills' });

    const root = resolveSkillSourceUrl('https://github.com/anthropics/skills');
    assert.deepStrictEqual(root, { kind: 'folder', owner: 'anthropics', repo: 'skills', branch: '', path: '' });

    const raw = resolveSkillSourceUrl('https://raw.githubusercontent.com/o/r/main/a/skill.md');
    assert.strictEqual(raw.kind, 'file');
    assert.strictEqual(raw.filename, 'skill.md');

    const direct = resolveSkillSourceUrl('https://example.com/prompt-library/java-master.md');
    assert.strictEqual(direct.kind, 'file');

    assert.strictEqual(resolveSkillSourceUrl('https://github.com/o').kind, 'invalid');
    assert.strictEqual(resolveSkillSourceUrl('https://example.com/page').kind, 'invalid');
    assert.strictEqual(resolveSkillSourceUrl('not a url').kind, 'invalid');
    console.log('PASS: resolveSkillSourceUrl (blob/tree/root/raw/direct/invalid)');
  }

  /* --- 3. backend importSkills dedupe + importSkillFromUrl ----------------- */
  const srv = http.createServer((req, res) => {
    if (req.url === '/good-skill.md') {
      res.setHeader('Content-Type', 'text/markdown');
      res.end('---\nname: GitHub 精选技能\ndescription: 从远端下载的技能\n---\n\n# 内容\n\n步骤一…');
    } else if (req.url === '/broken.md') {
      res.statusCode = 404;
      res.end('not found');
    } else {
      res.setHeader('Content-Type', 'text/html');
      res.end('<html></html>');
    }
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;

  const backend = require(path.join(PLUGIN, 'backend.js'));
  const handlers = new Map();
  const store = { config: {}, personas: [], sessions: [{ id: 's', title: 't', messages: [] }], activeSessionId: 's' };
  const ctx = {
    ipc: { handle: (n, f) => handlers.set(n, f) },
    data: { get: () => store, set: d => Object.assign(store, d) },
    send: () => {},
    call: (n, a) => handlers.get(n)(a),
    workflows: { list: () => [], save: () => {} }
  };
  backend.activate(ctx);

  // bulk import: two new + one duplicate name
  const bulk = await ctx.call('importSkills', {
    items: [
      { filename: 'a.md', content: '# 技能甲\n\n甲的内容' },
      { filename: 'b.md', content: '---\nname: 技能乙\ndescription: 乙\n---\n乙内容' },
      { filename: 'dup.md', content: '---\nname: 工作流设计规范\n---\n与内置技能同名，应跳过' }
    ]
  });
  assert.ok(bulk.ok && bulk.imported === 2 && bulk.skipped === 1, JSON.stringify(bulk));
  assert.ok(bulk.skills.some(s => s.name === '技能甲'));
  const builtin = bulk.skills.find(s => s.id === 'skill-workflow-design');
  assert.ok(builtin && !builtin.content.includes('与内置技能同名'), 'duplicate must not clobber existing skill');
  console.log('PASS: importSkills bulk + name dedupe (existing skills untouched)');

  // URL import: good / 404 / non-markdown
  const okRes = await ctx.call('importSkillFromUrl', { url: `${base}/good-skill.md` });
  assert.ok(okRes.ok && okRes.imported === 1, JSON.stringify(okRes));
  const imported = okRes.skills.find(s => s.name === 'GitHub 精选技能');
  assert.ok(imported && imported.desc === '从远端下载的技能' && imported.content.startsWith('# 内容'));

  const again = await ctx.call('importSkillFromUrl', { url: `${base}/good-skill.md` });
  assert.ok(again.ok && again.imported === 0 && again.skipped === 1, 're-import same name skips');

  const bad = await ctx.call('importSkillFromUrl', { url: `${base}/broken.md` });
  assert.ok(!bad.ok && /404|下载失败/.test(bad.error));

  const nonMd = await ctx.call('importSkillFromUrl', { url: 'https://example.com/page' });
  assert.ok(!nonMd.ok);

  backend.deactivate();
  srv.close();
  console.log('PASS: importSkillFromUrl (download / dedupe / 404 / non-md rejection)');
  console.log('ALL SKILLS IMPORT TESTS PASSED');
}

main().catch(err => {
  console.error('FAIL:', err && (err.stack || err.message));
  process.exit(1);
});
