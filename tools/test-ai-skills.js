/* Tests for skill import: frontmatter parsing, GitHub URL resolution,
   SKILL.md selection (repo tree + local folder grouping), bulk import dedupe,
   and URL download against a local HTTP source (GitHub API mocked on it too).
   Run with: node tools/test-ai-skills.js */

const assert = require('assert');
const http = require('http');
const path = require('path');

const PLUGIN = path.join(__dirname, '..', 'src', 'plugins', 'ai-chat');

async function main() {
  const { parseSkillMarkdown, resolveSkillSourceUrl, pickSkillEntries, pickLocalSkillFiles } = require(path.join(PLUGIN, 'skills-util.js'));

  /* --- 1. frontmatter / fallback parsing ---------------------------------- */
  {
    const a = parseSkillMarkdown('whatever.md', '---\nname: SQL 优化指南\ndescription: "数据库查询优化方法论"\n---\n\n# SQL 优化\n\n第一步…');
    assert.strictEqual(a.name, 'SQL 优化指南');
    assert.strictEqual(a.desc, '数据库查询优化方法论');
    assert.ok(a.content.startsWith('# SQL 优化'), 'frontmatter stripped from content');

    const b = parseSkillMarkdown('api-doc-guide.md', '# API 文档撰写规范\n\n本文档规定…');
    assert.strictEqual(b.name, 'API 文档撰写规范');
    assert.strictEqual(b.desc, '本文档规定…');

    const c = parseSkillMarkdown('sub/dir/my_cool_skill.md', '直接以正文开始的技能内容。\n\n第二段。');
    assert.strictEqual(c.name, 'my cool skill', 'name fallback uses the path basename');
    assert.ok(c.desc.startsWith('直接以正文开始的技能内容'));

    const d = parseSkillMarkdown('x.md', '---\nname: 带引号\n---\n正文');
    assert.strictEqual(d.name, '带引号');

    // README-style noise must not become the description
    const e = parseSkillMarkdown('repo.md', '# Repo Name\n\n<p align="left"><img src="https://img.shields.io/badge/x"></p>\n\n| 表 | 格 |\n|---|---|\n\n> 真正的简介在这里。\n\n# 正文');
    assert.strictEqual(e.desc, '真正的简介在这里。', 'html/table/heading paragraphs are skipped for desc');

    console.log('PASS: parseSkillMarkdown (frontmatter / fallbacks / README noise skipped)');
  }

  /* --- 2. GitHub URL resolution ------------------------------------------- */
  {
    const blob = resolveSkillSourceUrl('https://github.com/anthropics/skills/blob/main/docs/skills/sql.md');
    assert.strictEqual(blob.kind, 'file');
    assert.strictEqual(blob.rawUrl, 'https://raw.githubusercontent.com/anthropics/skills/main/docs/skills/sql.md');
    assert.strictEqual(blob.filename, 'sql.md');
    assert.deepStrictEqual(blob.gh, { owner: 'anthropics', repo: 'skills', branch: 'main', path: 'docs/skills/sql.md' });

    const tree = resolveSkillSourceUrl('https://github.com/anthropics/skills/tree/main/docs/skills');
    assert.deepStrictEqual(tree, { kind: 'folder', owner: 'anthropics', repo: 'skills', branch: 'main', path: 'docs/skills' });

    const root = resolveSkillSourceUrl('https://github.com/anthropics/skills');
    assert.deepStrictEqual(root, { kind: 'folder', owner: 'anthropics', repo: 'skills', branch: '', path: '' });

    const raw = resolveSkillSourceUrl('https://raw.githubusercontent.com/o/r/main/a/skill.md');
    assert.strictEqual(raw.kind, 'file');
    assert.strictEqual(raw.filename, 'skill.md');
    assert.deepStrictEqual(raw.gh, { owner: 'o', repo: 'r', branch: 'main', path: 'a/skill.md' });

    const direct = resolveSkillSourceUrl('https://example.com/prompt-library/java-master.md');
    assert.strictEqual(direct.kind, 'file');

    assert.strictEqual(resolveSkillSourceUrl('https://github.com/o').kind, 'invalid');
    assert.strictEqual(resolveSkillSourceUrl('https://example.com/page').kind, 'invalid');
    assert.strictEqual(resolveSkillSourceUrl('not a url').kind, 'invalid');
    console.log('PASS: resolveSkillSourceUrl (blob/tree/root/raw/direct/invalid)');
  }

  /* --- 3. SKILL.md selection ------------------------------------------------ */
  {
    const picked = pickSkillEntries([
      'README.md', 'SKILL.md', 'skills/sql-tuning/SKILL.md', 'skills/sql-tuning/README.md',
      'skills/api-writer/skill.md', 'docs/guide.md', 'assets/logo.png'
    ]);
    assert.deepStrictEqual(picked, [
      { path: 'SKILL.md', label: '' },
      { path: 'skills/api-writer/skill.md', label: 'api-writer' },
      { path: 'skills/sql-tuning/SKILL.md', label: 'sql-tuning' }
    ], 'only SKILL.md (case-insensitive match, original path kept) with parent-dir labels');

    const grouped = pickLocalSkillFiles([
      { path: 'my-skills/README.md' },
      { path: 'my-skills/sql-tune/SKILL.md' },
      { path: 'my-skills/sql-tune/README.md' },
      { path: 'my-skills/api-writer/SKILL.md' },
      { path: 'my-skills/assets/logo.png' },
      { path: 'my-skills/notes.txt' }
    ]);
    assert.deepStrictEqual(grouped, {
      skills: ['my-skills/api-writer/SKILL.md', 'my-skills/sql-tune/SKILL.md'],
      fallback: []
    }, 'skill folders contribute SKILL.md only, docs never imported');

    const fallback = pickLocalSkillFiles(['docs/README.md', 'docs/guide.md', 'docs/CHANGELOG.md', 'docs/prompt.md']);
    assert.deepStrictEqual(fallback, { skills: [], fallback: ['docs/guide.md', 'docs/prompt.md'] },
      'without SKILL.md: plain docs import, repo noise excluded');

    console.log('PASS: pickSkillEntries + pickLocalSkillFiles (SKILL.md selection / noise exclusion)');
  }

  /* --- 4. backend import: bulk dedupe + URL file + recursive GitHub folder -- */
  const SKILL_BODIES = {
    'sql-tuning': '---\nname: SQL 调优手册\ndescription: 慢查询定位与索引设计\n---\n\n# SQL 调优\n\n步骤…',
    'api-writer': '---\nname: API 写作技能\ndescription: 面向开发者的接口文档写法\n---\n\n# API 写作\n\n规范…'
  };
  const TREE = [
    { path: 'README.md', type: 'blob' },
    { path: 'notes.txt', type: 'blob' },
    { path: 'assets', type: 'tree' },
    { path: 'assets/logo.png', type: 'blob' },
    { path: 'skills', type: 'tree' },
    { path: 'skills/sql-tuning', type: 'tree' },
    { path: 'skills/sql-tuning/SKILL.md', type: 'blob' },
    { path: 'skills/sql-tuning/README.md', type: 'blob' },
    { path: 'skills/api-writer', type: 'tree' },
    { path: 'skills/api-writer/SKILL.md', type: 'blob' },
    { path: 'skills/api-writer/README.md', type: 'blob' },
    { path: 'skills/broken', type: 'tree' },
    { path: 'skills/broken/SKILL.md', type: 'blob' }
  ];
  const srv = http.createServer((req, res) => {
    const u = req.url || '';
    const json = obj => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };
    if (u === '/good-skill.md') {
      res.setHeader('Content-Type', 'text/markdown');
      res.end('---\nname: GitHub 精选技能\ndescription: 从远端下载的技能\n---\n\n# 内容\n\n步骤一…');
    } else if (u === '/broken.md') {
      res.statusCode = 404;
      res.end('not found');
    } else if (u === '/repos/o/r') {
      json({ default_branch: 'main' });
    } else if (u.startsWith('/repos/o/r/git/trees/main')) {
      json({ truncated: false, tree: TREE });
    } else if (u === '/repos/e/f') {
      json({ default_branch: 'main' });
    } else if (u.startsWith('/repos/e/f/git/trees/main')) {
      json({ truncated: false, tree: [{ path: 'README.md', type: 'blob' }, { path: 'docs', type: 'tree' }] });
    } else if (/^\/o\/r\/main\/skills\/([^/]+)\/SKILL\.md$/.test(u)) {
      // raw CDN: api-writer + broken are unreachable here (fallback territory)
      const name = u.match(/^\/o\/r\/main\/skills\/([^/]+)\/SKILL\.md$/)[1];
      if (name !== 'sql-tuning') { res.statusCode = 404; res.end('nope'); return; }
      res.setHeader('Content-Type', 'text/markdown');
      res.end(SKILL_BODIES[name]);
    } else if (u.startsWith('/repos/o/r/contents/')) {
      // contents API fallback (Accept: raw -> file body)
      const p = u.slice('/repos/o/r/contents/'.length).split('?')[0];
      if (p === 'skills/broken/SKILL.md') { res.statusCode = 404; res.end('nope'); return; }
      const m = /^skills\/([^/]+)\/SKILL\.md$/.exec(p) || (/^docs\/hero\.md$/.test(p) ? [, 'hero'] : null);
      if (m && (SKILL_BODIES[m[1]] || m[1] === 'hero')) {
        res.setHeader('Content-Type', 'text/markdown');
        res.end(m[1] === 'hero'
          ? '---\nname: Blob 直链技能\ndescription: 经 contents API 回退下载\n---\n\n# Hero\n\n内容'
          : SKILL_BODIES[m[1]]);
        return;
      }
      res.statusCode = 404;
      res.end('nope');
    } else {
      res.statusCode = 404;
      res.end('not found');
    }
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;

  // backend reads these inside activate(); point the GitHub API at the mock
  process.env.ORBIT_GH_API_BASE = base;
  process.env.ORBIT_GH_RAW_BASE = base;

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
  assert.strictEqual(imported.source, `${base}/good-skill.md`, 'source recorded');

  const again = await ctx.call('importSkillFromUrl', { url: `${base}/good-skill.md` });
  assert.ok(again.ok && again.imported === 0 && again.skipped === 1, 're-import same name skips');

  const bad = await ctx.call('importSkillFromUrl', { url: `${base}/broken.md` });
  assert.ok(!bad.ok && /404|下载失败/.test(bad.error));

  const nonMd = await ctx.call('importSkillFromUrl', { url: 'https://example.com/page' });
  assert.ok(!nonMd.ok);
  console.log('PASS: importSkillFromUrl file mode (download / dedupe / 404 / non-md rejection)');

  // recursive folder import: only SKILL.md counts, README/txt/png ignored,
  // unreachable single file counted as failed
  const ghImp = await ctx.call('importSkillFromUrl', { url: 'https://github.com/o/r' });
  assert.ok(ghImp.ok, JSON.stringify(ghImp));
  assert.strictEqual(ghImp.total, 3, 'three SKILL.md found in tree');
  assert.strictEqual(ghImp.imported, 2, 'two downloaded ok (one via contents fallback)');
  assert.strictEqual(ghImp.failed, 1, 'broken/SKILL.md unreachable via raw AND contents');
  assert.deepStrictEqual(ghImp.names.sort(), ['API 写作技能', 'SQL 调优手册']);
  const sqlSkill = ghImp.skills.find(s => s.name === 'SQL 调优手册');
  assert.strictEqual(sqlSkill.source, 'https://github.com/o/r/blob/main/skills/sql-tuning/SKILL.md');
  assert.ok(!ghImp.skills.some(s => /readme|notes/i.test(s.name)), 'README/notes must never become skills');

  const ghAgain = await ctx.call('importSkillFromUrl', { url: 'https://github.com/o/r' });
  assert.ok(ghAgain.ok && ghAgain.imported === 0 && ghAgain.skipped === 2 && ghAgain.failed === 1, 're-import dedupes');

  const subTree = await ctx.call('importSkillFromUrl', { url: 'https://github.com/o/r/tree/main/skills/api-writer' });
  assert.ok(subTree.ok && subTree.total === 1 && subTree.imported === 0 && subTree.skipped === 1, 'tree URL scoped to subpath');

  const noSkill = await ctx.call('importSkillFromUrl', { url: 'https://github.com/e/f' });
  assert.ok(!noSkill.ok && /没有找到 SKILL\.md/.test(noSkill.error), JSON.stringify(noSkill));
  console.log('PASS: importSkillFromUrl folder mode (recursive SKILL.md / raw->contents fallback / subtree scope / no-skill error)');

  // single blob link where the raw CDN is unreachable -> contents fallback
  const blobImp = await ctx.call('importSkillFromUrl', { url: 'https://github.com/o/r/blob/main/docs/hero.md' });
  assert.ok(blobImp.ok && blobImp.imported === 1, JSON.stringify(blobImp));
  assert.ok(blobImp.names.includes('Blob 直链技能'));
  const hero = blobImp.skills.find(s => s.name === 'Blob 直链技能');
  assert.strictEqual(hero.source, 'https://github.com/o/r/blob/main/docs/hero.md');
  console.log('PASS: importSkillFromUrl blob mode via contents fallback');

  // local folder grouping IPC
  const pk = await ctx.call('pickLocalSkillFiles', { paths: ['pkg/a/SKILL.md', 'pkg/a/README.md', 'pkg/b/SKILL.md', 'loose.md', 'README.md'] });
  assert.ok(pk.ok && pk.skills.length === 2 && pk.fallback.length === 0, JSON.stringify(pk));
  console.log('PASS: pickLocalSkillFiles IPC');

  backend.deactivate();
  srv.close();
  delete process.env.ORBIT_GH_API_BASE;
  delete process.env.ORBIT_GH_RAW_BASE;
  console.log('ALL SKILLS IMPORT TESTS PASSED');
}

main().catch(err => {
  console.error('FAIL:', err && (err.stack || err.message));
  process.exit(1);
});
