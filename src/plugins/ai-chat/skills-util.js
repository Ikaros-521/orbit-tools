/* Skill import helpers (pure functions, unit-testable):
   - parseSkillMarkdown: extract name/description from SKILL.md style frontmatter
   - resolveSkillSourceUrl: classify a pasted URL into a file or folder import task
   - pickSkillEntries: select SKILL.md paths out of a repo tree listing
   - pickLocalSkillFiles: group locally picked files into skill vs doc sets

   A "skill" is a SKILL.md (agent-skill convention: one skill per directory).
   Documents like README/CHANGELOG are support material and never import as skills. */

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
    const base = String(sourceLabel || '').split(/[\\/]/).pop()
      .replace(/\.(md|markdown|txt)$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    name = base || '未命名技能';
  }
  if (!desc) {
    const paras = body.split(/\n\s*\n/).map(s => s.trim());
    const candidate = paras.find(s => {
      if (!s) return false;
      const t = s.replace(/^[>\s]+/, ''); // blockquote text is fine once unquoted
      if (/^[<|!\[#]/.test(t)) return false; // html / tables / images / badge links / headings
      if (/shields\.io|<img\b|<p\b|<div\b|<a\b/i.test(t)) return false;
      return true;
    });
    desc = candidate ? candidate.replace(/^[>\s]+/, '').replace(/\s+/g, ' ').slice(0, 200) : '';
  }

  const content = body.trim() || String(text || '').trim();
  return { name: name.slice(0, 60), desc: desc.slice(0, 200), content };
}

const SKILL_MD_RE = /(^|\/)skill\.md$/i;
const isSkillMdPath = p => SKILL_MD_RE.test(String(p || '').replace(/\\/g, '/'));

/* Select SKILL.md paths out of a repo tree listing (git trees API, recursive).
   Returns [{ path, label }] sorted; label is the parent directory's own name
   (the skill's identity), or '' for a repo-root SKILL.md. */
function pickSkillEntries(paths) {
  return (paths || [])
    .map(p => String(p || '').replace(/\\/g, '/'))
    .filter(isSkillMdPath)
    .sort()
    .map(p => ({
      path: p,
      label: p.includes('/') ? p.slice(0, p.lastIndexOf('/')).split('/').pop() : ''
    }));
}

/* Group locally picked files (webkitRelativePath style paths) into import sets:
   - skills: every directory that contains a SKILL.md contributes exactly that
     file (its README and other docs are support material, never imported);
   - fallback: with no SKILL.md anywhere, import plain .md/.txt docs except
     repository noise (README / CHANGELOG / LICENSE / CONTRIBUTING / …). */
function pickLocalSkillFiles(entries) {
  const files = (entries || [])
    .map(e => String((e && e.path) || e || '').replace(/\\/g, '/'))
    .filter(p => /\.(md|markdown|txt)$/i.test(p));

  const skillSet = new Set(files.filter(isSkillMdPath));
  if (skillSet.size > 0) return { skills: [...skillSet].sort(), fallback: [] };

  const noise = /^(readme|changelog|license|contributing|code_of_conduct|notice)([.\-_ ]|$)/i;
  const fallback = files.filter(p => !noise.test(p.split('/').pop()));
  return { skills: [], fallback: [...new Set(fallback)].sort() };
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
    return {
      kind: 'file',
      rawUrl: u,
      filename: parts[parts.length - 1],
      gh: { owner: parts[0], repo: parts[1], branch: parts[2], path: parts.slice(3).join('/') }
    };
  }

  if (isGh) {
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length >= 4 && parts[2] === 'blob') {
      return {
        kind: 'file',
        rawUrl: `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${parts.slice(3).join('/')}`,
        filename: parts[parts.length - 1],
        gh: { owner: parts[0], repo: parts[1], branch: parts[3], path: parts.slice(4).join('/') }
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

module.exports = { parseSkillMarkdown, resolveSkillSourceUrl, pickSkillEntries, pickLocalSkillFiles, isSkillMdPath };
