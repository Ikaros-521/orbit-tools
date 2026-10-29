/* Skill import helpers (pure functions, unit-testable):
   - parseSkillMarkdown: extract name/description from SKILL.md style frontmatter
   - resolveSkillSourceUrl: classify a pasted URL into a file or folder import task */

/* Frontmatter format understood (flat key: value only, no nested YAML):
   ---
   name: 技能名称
   description: 一句话简介
   ---                                    */
function parseSkillMarkdown(sourceLabel, text) {
  let name = '';
  let desc = '';
  let body = String(text || '');

  const fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(body);
  if (fm) {
    for (const line of fm[1].split(/\r?\n/)) {
      const m = /^\s*([a-zA-Z_-]+)\s*:\s*(.*)$/.exec(line);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const val = m[2].trim().replace(/^["']|["']$/g, '');
      if (key === 'name' && !name) name = val;
      if (key === 'description' && !desc) desc = val;
    }
    body = body.slice(fm[0].length);
  }

  if (!name) {
    const h = /^#\s+(.+)$/m.exec(body);
    if (h) name = h[1].trim().replace(/^["']|["']$/g, '');
  }
  if (!name) {
    name = String(sourceLabel || '')
      .replace(/\.(md|markdown|txt)$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim() || '未命名技能';
  }
  if (!desc) {
    const firstPara = body.split(/\n\s*\n/)
      .map(s => s.trim())
      .find(s => s && !s.startsWith('#') && !s.startsWith('---') && !s.startsWith('!['));
    desc = firstPara ? firstPara.replace(/\s+/g, ' ').slice(0, 80) : '';
  }

  const content = body.trim() || String(text || '').trim();
  return { name: name.slice(0, 60), desc: desc.slice(0, 120), content };
}

/* Resolve a pasted URL into an import task:
   - raw.githubusercontent.com/...              -> { kind:'file', rawUrl, filename }
   - github.com/o/r/blob/<branch>/<path>        -> { kind:'file', rawUrl, filename }
   - github.com/o/r/tree/<branch>/<path> | o/r  -> { kind:'folder', owner, repo, branch, path }
   - any other http(s) URL ending in .md/.txt   -> { kind:'file', rawUrl, filename }
   Otherwise -> { kind:'invalid', error } */
function resolveSkillSourceUrl(rawUrl) {
  const u = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(u)) return { kind: 'invalid', error: '请输入 http(s) 开头的链接' };
  let parsed;
  try { parsed = new URL(u); } catch { return { kind: 'invalid', error: 'URL 无法解析' }; }

  const isRawGh = /^raw\.githubusercontent\.com$/i.test(parsed.hostname);
  const isGh = /^github\.com$/i.test(parsed.hostname);

  if (isRawGh) {
    const parts = parsed.pathname.split('/').filter(Boolean); // o/r/branch/path...
    if (parts.length < 4) return { kind: 'invalid', error: 'raw 链接缺少文件路径' };
    return { kind: 'file', rawUrl: u, filename: parts[parts.length - 1] };
  }

  if (isGh) {
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length >= 4 && parts[2] === 'blob') {
      return {
        kind: 'file',
        rawUrl: `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${parts.slice(3).join('/')}`,
        filename: parts[parts.length - 1]
      };
    }
    if (parts.length >= 4 && parts[2] === 'tree') {
      return { kind: 'folder', owner: parts[0], repo: parts[1], branch: parts[3], path: parts.slice(4).join('/') };
    }
    if (parts.length === 2) {
      return { kind: 'folder', owner: parts[0], repo: parts[1], branch: '', path: '' };
    }
    return { kind: 'invalid', error: '不支持的 GitHub 链接 (支持 blob 文件 / tree 目录 / 仓库主页)' };
  }

  if (/\.(md|markdown|txt)$/i.test(parsed.pathname)) {
    return { kind: 'file', rawUrl: u, filename: parsed.pathname.split('/').pop() };
  }
  return { kind: 'invalid', error: '非 GitHub 链接需以 .md / .markdown / .txt 结尾' };
}

module.exports = { parseSkillMarkdown, resolveSkillSourceUrl };
