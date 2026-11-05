/* AI Chat - Live Open-Source Skills Search & Fetch Engine.
   Provides real-time search across live GitHub repositories, open-source skill hubs
   (e.g. anthropics/skills, addyosmani/agent-skills, mattpocock/skills),
   live Markdown preview, one-click installation, and template-based creation. */

const { parseSkillMarkdown, resolveSkillSourceUrl } = require('../skills-util');
const { SKILL_MARKET_CATALOG, searchSkillMarket } = require('../skills-market');

const GH_API_BASE = process.env.ORBIT_GH_API_BASE || 'https://api.github.com';
const GH_RAW_BASE = process.env.ORBIT_GH_RAW_BASE || 'https://raw.githubusercontent.com';

/* Curated authority open-source agent skill repositories */
const FEATURED_SKILL_REPOS = [
  {
    owner: 'anthropics',
    repo: 'skills',
    branch: 'main',
    stars: 188000,
    desc: 'Anthropic 官方开源 Agent 技能库，包含前端设计、API 编排、文档合写等官方方法论'
  },
  {
    owner: 'addyosmani',
    repo: 'agent-skills',
    branch: 'main',
    stars: 114000,
    desc: 'Google Chrome 团队技术负责人 Addy Osmani 维护的生产级 AI Agent 架构与编码规范'
  },
  {
    owner: 'mattpocock',
    repo: 'skills',
    branch: 'main',
    stars: 314000,
    desc: '知名 TypeScript 架构师 Matt Pocock 的个人生产力与重构 Agent 技能库'
  },
  {
    owner: 'vercel-labs',
    repo: 'skills',
    branch: 'main',
    stars: 38000,
    desc: 'Vercel Labs 出品的开放 Agent 技能工具包与现代化 Web 全栈开发技能'
  }
];

class LiveSkillsEngine {
  constructor(options = {}) {
    this.ghToken = options.ghToken || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
    this.repoTreeCache = new Map(); // repoKey -> { timestamp, skills: [...] }
    this.cacheTtlMs = 15 * 60 * 1000; // 15 mins cache
  }

  getHeaders(extra = {}) {
    const headers = {
      'User-Agent': 'Orbit-Toolbox-AI/1.0',
      'Accept': 'application/vnd.github+json',
      ...extra
    };
    if (this.ghToken) {
      headers['Authorization'] = `Bearer ${this.ghToken}`;
    }
    return headers;
  }

  async fetchJson(url, timeoutMs = 10000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal, headers: this.getHeaders() });
      if (!res.ok) {
        let errText = '';
        try { errText = await res.text(); } catch {}
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 150) || res.statusText}`);
      }
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchRawText(url, timeoutMs = 12000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: this.getHeaders({ 'Accept': 'text/plain, application/vnd.github.raw' })
      });
      if (!res.ok) {
        throw new Error(`下载失败 [${res.status}] ${res.statusText}`);
      }
      const text = await res.text();
      if (text.length > 512 * 1024) {
        throw new Error('技能文件过大 (>512KB)，无法导入');
      }
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  /* Fetch repository tree and index SKILL.md entries */
  async getRepoSkills(repoInfo) {
    const cacheKey = `${repoInfo.owner}/${repoInfo.repo}`;
    const cached = this.repoTreeCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < this.cacheTtlMs)) {
      return cached.skills;
    }

    try {
      const url = `${GH_API_BASE}/repos/${repoInfo.owner}/${repoInfo.repo}/git/trees/${repoInfo.branch}?recursive=1`;
      const data = await this.fetchJson(url, 12000);
      if (!data || !Array.isArray(data.tree)) return [];

      const skillFiles = data.tree.filter(e => e.type === 'blob' && /(^|\/)skill\.md$/i.test(e.path));
      const skills = skillFiles.map(e => {
        const parts = e.path.split('/');
        const folderName = parts.length > 1 ? parts[parts.length - 2] : repoInfo.repo;
        const displayName = folderName
          .replace(/[-_]+/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());

        return {
          id: `live:${repoInfo.owner}/${repoInfo.repo}:${e.path}`,
          name: displayName,
          rawName: folderName,
          repo: `${repoInfo.owner}/${repoInfo.repo}`,
          owner: repoInfo.owner,
          branch: repoInfo.branch,
          path: e.path,
          desc: `${repoInfo.desc} — 专项技能 (${folderName})`,
          stars: repoInfo.stars,
          sourceUrl: `https://github.com/${repoInfo.owner}/${repoInfo.repo}/blob/${repoInfo.branch}/${e.path}`,
          rawUrl: `${GH_RAW_BASE}/${repoInfo.owner}/${repoInfo.repo}/${repoInfo.branch}/${e.path}`,
          category: this.inferCategory(folderName, e.path),
          official: repoInfo.owner === 'anthropics',
          sourceType: 'hub'
        };
      });

      this.repoTreeCache.set(cacheKey, { timestamp: Date.now(), skills });
      return skills;
    } catch (err) {
      // Return previous cache if available or empty
      if (cached) return cached.skills;
      return [];
    }
  }

  inferCategory(name, path) {
    const s = `${name} ${path}`.toLowerCase();
    if (s.includes('test') || s.includes('tdd') || s.includes('spec') || s.includes('debug')) return 'qa';
    if (s.includes('commit') || s.includes('git') || s.includes('doc') || s.includes('adr') || s.includes('workflow')) return 'workflow';
    if (s.includes('prompt') || s.includes('architect') || s.includes('agent') || s.includes('context')) return 'prompt';
    if (s.includes('sec') || s.includes('vuln') || s.includes('audit')) return 'security';
    return 'dev';
  }

  /* Search live GitHub repositories for skills */
  async searchGitHubRepos(query) {
    if (!query || query.trim().length < 2) return [];
    try {
      const q = encodeURIComponent(`${query} in:name,description skill`);
      const url = `${GH_API_BASE}/search/repositories?q=${q}&sort=stars&order=desc&per_page=6`;
      const data = await this.fetchJson(url, 8000);
      if (!data || !Array.isArray(data.items)) return [];

      return data.items.map(item => ({
        id: `repo:${item.full_name}`,
        name: item.name.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        repo: item.full_name,
        owner: item.owner ? item.owner.login : '',
        desc: item.description || 'GitHub 开源 Agent 技能仓库',
        stars: item.stargazers_count || 0,
        sourceUrl: item.html_url,
        rawUrl: `${GH_RAW_BASE}/${item.full_name}/${item.default_branch || 'main'}/SKILL.md`,
        branch: item.default_branch || 'main',
        path: 'SKILL.md',
        category: this.inferCategory(item.name, item.description || ''),
        official: false,
        sourceType: 'github_repo'
      }));
    } catch {
      return [];
    }
  }

  /**
   * Real-time search across:
   * 1. Pre-curated verified skills catalog
   * 2. Live authority skill hubs (anthropics, addyosmani, etc.)
   * 3. Live GitHub repositories search
   */
  async searchLiveSkills({ query = '', category = 'all', limit = 30 } = {}, installedSkills = []) {
    const q = String(query || '').trim().toLowerCase();
    const cat = String(category || 'all').trim();
    const installedNames = new Set((installedSkills || []).map(s => (s.name || '').toLowerCase()));

    // 1. Curated local presets
    const curatedMatches = searchSkillMarket(q, cat).map(item => ({
      id: item.id,
      name: item.name,
      repo: 'orbit-tools/presets',
      desc: item.desc,
      stars: 9999,
      sourceUrl: item.repoUrl,
      rawUrl: '',
      content: item.content,
      category: item.category,
      official: !!item.official,
      sourceType: 'curated'
    }));

    // 2. Fetch from featured authority repos (parallel with caching)
    const hubSkillLists = await Promise.allSettled(
      FEATURED_SKILL_REPOS.map(repo => this.getRepoSkills(repo))
    );
    const allHubSkills = hubSkillLists
      .filter(r => r.status === 'fulfilled')
      .flatMap(r => r.value);

    const filteredHub = allHubSkills.filter(item => {
      if (cat !== 'all' && item.category !== cat) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.rawName.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q)
      );
    });

    // 3. Optional live GitHub repo search when user enters a specific query
    let liveRepoSkills = [];
    if (q.length >= 2) {
      liveRepoSkills = await this.searchGitHubRepos(q);
      if (cat !== 'all') {
        liveRepoSkills = liveRepoSkills.filter(s => s.category === cat);
      }
    }

    // Merge & deduplicate by name or id
    const seenNames = new Set();
    const merged = [];

    for (const item of [...curatedMatches, ...filteredHub, ...liveRepoSkills]) {
      const key = (item.name || '').toLowerCase();
      if (seenNames.has(key)) continue;
      seenNames.add(key);

      merged.push({
        ...item,
        installed: installedNames.has(key)
      });
      if (merged.length >= limit) break;
    }

    return {
      ok: true,
      query,
      category: cat,
      total: merged.length,
      items: merged
    };
  }

  /**
   * Fetches real content of a remote skill.
   * Resolves frontmatter name/description, parses body Markdown.
   */
  async fetchRemoteSkillContent(target) {
    if (!target) return { ok: false, error: '缺少目标技能标识或地址' };

    // If it's already a local curated item
    if (target.content) {
      return {
        ok: true,
        name: target.name,
        desc: target.desc,
        content: target.content,
        source: target.sourceUrl || target.id
      };
    }

    let rawUrl = target.rawUrl || (typeof target === 'string' && target) || '';
    if (!rawUrl && target.repo && target.path) {
      const branch = target.branch || 'main';
      rawUrl = `${GH_RAW_BASE}/${target.repo}/${branch}/${target.path}`;
    }

    if (!rawUrl) {
      // Try resolving if it's a URL
      const resolved = resolveSkillSourceUrl(target.sourceUrl || target);
      if (resolved && resolved.rawUrl) rawUrl = resolved.rawUrl;
    }

    if (!rawUrl) {
      return { ok: false, error: '无法解析技能的远程文件地址' };
    }

    try {
      const text = await this.fetchRawText(rawUrl);
      const parsed = parseSkillMarkdown(target.name || rawUrl, text);

      return {
        ok: true,
        name: target.name || parsed.name,
        desc: target.desc || parsed.desc,
        content: parsed.content,
        source: target.sourceUrl || rawUrl,
        rawUrl
      };
    } catch (err) {
      return { ok: false, error: `拉取远程技能失败: ${err.message || err}` };
    }
  }
}

const liveSkillsEngine = new LiveSkillsEngine();

module.exports = {
  LiveSkillsEngine,
  liveSkillsEngine,
  FEATURED_SKILL_REPOS
};
