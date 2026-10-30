/* Live smoke test: recursive SKILL.md import against the real GitHub API.
   Scoped to one skill subdirectory to conserve the unauthenticated API quota
   (60 req/h). Network-dependent — on network failure it prints SKIP instead
   of FAIL so it can never block offline runs.
   Run with: node tools/test-ai-skills-live.js */

const path = require('path');

const PLUGIN = path.join(__dirname, '..', 'src', 'plugins', 'ai-chat');

async function main() {
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

  // canonical agent-skills repo, one skill subfolder (2 API calls total)
  const res = await ctx.call('importSkillFromUrl', { url: 'https://github.com/anthropics/skills/tree/main/skills/algorithmic-art' });
  if (!res.ok && /ECONNRESET|ENOTFOUND|ETIMEDOUT| AbortError|超时|fetch failed/i.test(res.error || '')) {
    console.log('SKIP (network/GitHub unavailable):', res.error);
    return;
  }
  if (!res.ok) throw new Error(`import failed: ${res.error}`);
  console.log(`found=${res.total} imported=${res.imported} skipped=${res.skipped} failed=${res.failed || 0}`);
  console.log('names:', (res.names || []).join('、') || '(none)');

  if (res.total !== 1 || res.imported !== 1) throw new Error(`expected 1 skill imported, got total=${res.total} imported=${res.imported}`);
  const skill = res.skills.find(s => s.name === res.names[0]);
  if (!skill) throw new Error('imported skill missing from list');
  console.log('desc:', (skill.desc || '').slice(0, 80));
  console.log('content head:', JSON.stringify(skill.content.slice(0, 80)));
  if (!skill.desc || skill.desc.length < 10) throw new Error('description missing/too short');
  if (/^<!|shields\.io/.test(skill.content)) throw new Error('content looks like a web page, not a skill');
  console.log('LIVE SKILLS IMPORT SMOKE PASSED');
}

main().catch(err => {
  console.error('FAIL:', err && (err.stack || err.message));
  process.exit(1);
});
