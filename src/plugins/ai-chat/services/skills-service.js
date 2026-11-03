/* AI Chat - Skills Service
   Manages skills inventory, SKILL.md parsing, local file and directory scanning,
   and GitHub repository/directory recursive downloading. */

const { parseSkillMarkdown, resolveSkillSourceUrl, pickSkillEntries, pickLocalSkillFiles } = require('../skills-util');

const DEFAULT_SKILLS = [
  {
    id: 'skill-workflow-design',
    name: '工作流设计规范',
    desc: '设计 Orbit 工作流时的节点编排、命名与连线约束',
    content: `# 工作流设计规范\n\n为 Orbit Toolbox 设计工作流时遵循：\n\n1. **入口用触发器**：clipboard 监听或 manual 手动触发，二选一；不要用触发器连触发器。\n2. **节点命名**：title 使用「动词+对象」中文短语，如「正则提取 SKU」「格式化 JSON」。\n3. **布局**：x 每列间隔 280，y 同层对齐 120，避免交叉连线。\n4. **数据处理**：优先使用 util/regex-extract、util/replace、util/text-template 等专用节点；仅当无法表达时才用 util/code-run 写 JS。\n5. **出口**：结果用 output/clipboard 写回剪贴板，必要时加 output/notification 提示。\n6. **条件分支**：util/condition 只连真/假两条边，不要留悬空出口。\n\n创建完成后，用一句话告诉用户节点数量与执行路径。`
  },
  {
    id: 'skill-code-review',
    name: '代码评审清单',
    desc: '逐维度审查代码的结构、边界与可维护性',
    content: `# 代码评审清单\n\n按以下维度逐项检查并给出结论（通过/风险/建议）：\n\n- **正确性**：边界条件、空值、类型、并发/时序问题。\n- **安全性**：注入、越权、敏感信息泄漏、不可信输入。\n- **可读性**：命名达意、函数单一职责、注释只写约束不写流水账。\n- **性能**：明显冗余计算、O(n²) 可优化点、不必要的同步 IO。\n- **一致性**：与周边代码的风格、错误处理、日志约定是否一致。\n\n输出格式：每维度一行结论，最后给「阻塞项 / 建议项」两个列表。`
  }
];

class SkillsService {
  constructor() {
    this.ghRawUnavailable = false;
  }

  saveSkill(s, skills, genId) {
    if (!String(s.name || '').trim()) return { ok: false, error: '技能名称不能为空' };
    if (!String(s.content || '').trim()) return { ok: false, error: '技能内容不能为空' };
    const id = s.id ? String(s.id) : genId('skill');
    const idx = skills.findIndex(x => x.id === id);
    const rec = { id, name: String(s.name).trim(), desc: String(s.desc || '').trim(), content: String(s.content) };
    if (idx >= 0) skills[idx] = rec; else skills.push(rec);
    return { ok: true, skill: rec, skills };
  }

  deleteSkill(id, skills) {
    if (!id) return { ok: false, error: '缺少技能 ID' };
    const filtered = skills.filter(s => s.id !== id);
    return { ok: true, skills: filtered };
  }

  resetSkills() {
    return [...DEFAULT_SKILLS];
  }

  upsertImportedSkills(items, skills, genId) {
    let imported = 0;
    let skipped = 0;
    const names = [];
    for (const it of items) {
      const parsed = parseSkillMarkdown((it && it.filename) || (it && it.name) || '', (it && it.content) || '');
      if (!parsed.content || parsed.content.length > 512 * 1024) continue;
      if (skills.some(s => s.name === parsed.name)) { skipped++; continue; }
      const rec = { id: genId('skill'), name: parsed.name, desc: parsed.desc, content: parsed.content };
      if (it && it.source) rec.source = it.source;
      skills.push(rec);
      names.push(parsed.name);
      imported++;
    }
    return { imported, skipped, names };
  }

  importSkills(items, skills, genId) {
    if (!Array.isArray(items) || !items.length) {
      return { ok: false, error: '没有可导入的技能内容' };
    }
    const { imported, skipped, names } = this.upsertImportedSkills(items, skills, genId);
    return { ok: true, imported, skipped, names, skills };
  }

  pickLocalSkillFiles(paths) {
    const p = Array.isArray(paths) ? paths : [];
    return { ok: true, ...pickLocalSkillFiles(p) };
  }

  async importSkillFromUrl(url, skills, genId) {
    const src = resolveSkillSourceUrl(url);
    if (src.kind === 'invalid') return { ok: false, error: src.error };

    const GH_API_BASE = process.env.ORBIT_GH_API_BASE || 'https://api.github.com';
    const GH_RAW_BASE = process.env.ORBIT_GH_RAW_BASE || 'https://raw.githubusercontent.com';
    const MAX_SKILL_FILES = 60;

    const ghJson = async targetUrl => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      try {
        const res = await fetch(targetUrl, {
          signal: ctrl.signal,
          headers: { 'User-Agent': 'Orbit-Toolbox-AI/1.0', 'Accept': 'application/vnd.github+json' }
        });
        if (!res.ok) {
          let t = '';
          try { t = await res.text(); } catch {}
          throw new Error(`GitHub API ${res.status}: ${t.slice(0, 200) || res.statusText}`);
        }
        return await res.json();
      } finally {
        clearTimeout(timer);
      }
    };

    const getText = async (targetUrl, headers) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      try {
        const res = await fetch(targetUrl, { signal: ctrl.signal, headers });
        if (!res.ok) throw new Error(`下载失败 [${res.status}] ${res.statusText}`);
        const text = await res.text();
        if (text.length > 512 * 1024) throw new Error('文件过大 (>512KB)，已取消导入');
        return text;
      } finally {
        clearTimeout(timer);
      }
    };

    const fetchGhFile = async (gh, p) => {
      if (!this.ghRawUnavailable) {
        try {
          return await getText(`${GH_RAW_BASE}/${gh.owner}/${gh.repo}/${gh.branch}/${p}`, { 'User-Agent': 'Orbit-Toolbox-AI/1.0' });
        } catch (err) {
          if (err.name === 'AbortError') throw err;
          this.ghRawUnavailable = true;
        }
      }
      return getText(
        `${GH_API_BASE}/repos/${gh.owner}/${gh.repo}/contents/${p}?ref=${encodeURIComponent(gh.branch)}`,
        { 'User-Agent': 'Orbit-Toolbox-AI/1.0', 'Accept': 'application/vnd.github.raw' }
      );
    };

    try {
      if (src.kind === 'file') {
        if (!/\.(md|markdown|txt)$/i.test(src.filename || '')) {
          return { ok: false, error: '仅支持导入 Markdown / 文本文件' };
        }
        let content;
        let sourceUrl = src.rawUrl;
        if (src.gh) {
          content = await fetchGhFile(src.gh, src.gh.path);
          sourceUrl = `https://github.com/${src.gh.owner}/${src.gh.repo}/blob/${src.gh.branch}/${src.gh.path}`;
        } else {
          content = await getText(src.rawUrl, { 'User-Agent': 'Orbit-Toolbox-AI/1.0' });
        }
        const { imported, skipped, names } = this.upsertImportedSkills([{ filename: src.filename, source: sourceUrl, content }], skills, genId);
        return { ok: true, imported, skipped, names, total: 1, skills };
      }

      let branch = src.branch;
      if (!branch) {
        const repo = await ghJson(`${GH_API_BASE}/repos/${src.owner}/${src.repo}`);
        branch = repo && repo.default_branch;
      }
      if (!branch) return { ok: false, error: '无法确定该仓库的默认分支' };

      const tree = await ghJson(`${GH_API_BASE}/repos/${src.owner}/${src.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
      if (!tree || !Array.isArray(tree.tree)) return { ok: false, error: 'GitHub 未返回可用的目录结构' };

      const prefix = src.path ? `${src.path.replace(/\/+$/, '')}/` : '';
      const allEntries = pickSkillEntries(tree.tree.filter(e => e && e.type === 'blob').map(e => e.path))
        .filter(e => e.path.startsWith(prefix));
      const overflow = Math.max(0, allEntries.length - MAX_SKILL_FILES);
      const selected = allEntries.slice(0, MAX_SKILL_FILES);
      if (!selected.length) {
        return {
          ok: false,
          error: `该${src.path ? '目录' : '仓库'}下没有找到 SKILL.md。标准技能仓库的每个技能位于独立子目录（<技能名>/SKILL.md）；要导入单个文档请改用 blob 文件链接`
        };
      }

      const items = [];
      let failed = 0;
      for (const e of selected) {
        try {
          items.push({
            filename: e.path,
            source: `https://github.com/${src.owner}/${src.repo}/blob/${branch}/${e.path}`,
            content: await fetchGhFile({ owner: src.owner, repo: src.repo, branch }, e.path)
          });
        } catch { failed++; }
      }
      const { imported, skipped, names } = this.upsertImportedSkills(items, skills, genId);
      return { ok: true, imported, skipped, failed, overflow, names, total: selected.length, truncated: !!tree.truncated, skills };
    } catch (err) {
      return { ok: false, error: err.name === 'AbortError' ? '下载超时，请检查网络后重试' : (err.message || String(err)) };
    }
  }
}

module.exports = {
  SkillsService,
  DEFAULT_SKILLS,
};
