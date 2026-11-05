/* AI Chat - Live MCP Search Engine.
   Provides real-time search across npm registry & GitHub for community MCP servers,
   allowing one-click installation of real-world MCP servers into Orbit Toolbox. */

const { MCP_MARKET_CATALOG } = require('../mcp-market');

const NPM_SEARCH_API = 'https://registry.npmjs.org/-/v1/search';
const GH_API_BASE = process.env.ORBIT_GH_API_BASE || 'https://api.github.com';

class LiveMcpEngine {
  constructor() {
    this.searchCache = new Map();
  }

  async searchNpmMcp(query, size = 12) {
    const q = String(query || '').trim();
    const cacheKey = `npm:${q}:${size}`;
    if (this.searchCache.has(cacheKey)) {
      return this.searchCache.get(cacheKey);
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);

    try {
      const searchText = q ? `${q} mcp` : 'mcp-server';
      const url = `${NPM_SEARCH_API}?text=${encodeURIComponent(searchText)}&size=${size}`;
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { 'User-Agent': 'Orbit-Toolbox-AI/1.0' }
      });
      if (!res.ok) return [];

      const data = await res.json();
      if (!data || !Array.isArray(data.objects)) return [];

      const items = data.objects.map(obj => {
        const pkg = obj.package || {};
        const isOfficial = (pkg.name || '').startsWith('@modelcontextprotocol/');
        const repoUrl = (pkg.links && pkg.links.repository) || (pkg.links && pkg.links.npm) || '';

        return {
          id: `npm:${pkg.name}`,
          name: pkg.name,
          packageName: pkg.name,
          version: pkg.version,
          category: this.inferMcpCategory(pkg.name, pkg.description || ''),
          official: isOfficial,
          repoUrl,
          command: 'npx',
          args: ['-y', `${pkg.name}@latest`],
          env: {},
          desc: pkg.description || '开源 Model Context Protocol (MCP) 服务',
          sourceType: 'npm_live'
        };
      });

      this.searchCache.set(cacheKey, items);
      return items;
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  inferMcpCategory(name, desc) {
    const s = `${name} ${desc}`.toLowerCase();
    if (s.includes('browser') || s.includes('playwright') || s.includes('puppeteer')) return 'browser';
    if (s.includes('search') || s.includes('fetch') || s.includes('crawl')) return 'search';
    if (s.includes('db') || s.includes('sql') || s.includes('data') || s.includes('postgres') || s.includes('sqlite') || s.includes('redis')) return 'data';
    if (s.includes('system') || s.includes('os') || s.includes('shell') || s.includes('terminal')) return 'system';
    return 'dev';
  }

  async searchLiveMcp({ query = '', category = 'all', limit = 20 } = {}, installedServers = []) {
    const q = String(query || '').trim().toLowerCase();
    const cat = String(category || 'all').trim();
    const installedNames = new Set((installedServers || []).map(s => (s.name || '').toLowerCase()));

    // 1. Matches from pre-curated catalog
    const curatedMatches = MCP_MARKET_CATALOG.filter(item => {
      if (cat !== 'all' && item.category !== cat) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        (item.desc || '').toLowerCase().includes(q) ||
        (item.packageName || '').toLowerCase().includes(q)
      );
    }).map(it => ({ ...it, sourceType: 'curated' }));

    // 2. Query npm Registry live for community packages
    let liveNpmMatches = [];
    if (q) {
      liveNpmMatches = await this.searchNpmMcp(q, 10);
      if (cat !== 'all') {
        liveNpmMatches = liveNpmMatches.filter(item => item.category === cat);
      }
    }

    // Merge & deduplicate by package name
    const seen = new Set();
    const merged = [];

    for (const it of [...curatedMatches, ...liveNpmMatches]) {
      const key = (it.packageName || it.name || '').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      merged.push({
        ...it,
        installed: installedNames.has((it.name || '').toLowerCase())
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
}

const liveMcpEngine = new LiveMcpEngine();

module.exports = {
  LiveMcpEngine,
  liveMcpEngine
};
