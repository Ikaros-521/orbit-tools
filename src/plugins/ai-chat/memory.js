/* Persistent memory for the AI Chat agent (harness-style, file-backed via
   ctx.data). Records survive across sessions; retrieval is keyword scoring
   over mixed Chinese/English text (CJK bigrams + latin words) — no external
   embedding service. Two scopes:
   - 'global': applies to every session
   - '<absolute dir>': project memory, only recalled/injected for sessions
     whose working directory matches. */

const MEMORY_LIMIT = 300; // hard cap; oldest touched records are pruned on overflow
const MEMORY_MAX_CHARS = 2000;
const MEMORY_TYPES = new Set(['fact', 'preference', 'project']);
const MEMORY_SCOPES = new Set(['global']);

const genId = () => `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/* Tokenize for recall scoring: latin/digit words (>=2 chars) plus bigrams of
   contiguous CJK runs. Single han chars are too noisy, so runs of length 1
   contribute nothing. */
function tokenizeText(s) {
  const t = String(s || '').toLowerCase();
  const tokens = new Set(t.match(/[a-z0-9_]{2,}/g) || []);
  for (const run of t.match(/[\u4e00-\u9fff]+/g) || []) {
    for (let i = 0; i + 2 <= run.length; i++) tokens.add(run.slice(i, i + 2));
  }
  return tokens;
}

/* Sanitize a raw stored record (migration-safe: legacy/partial rows become
   valid or are dropped by the caller's filter). */
function normalizeMemoryRecord(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const content = String(rec.content || '').trim();
  if (!content) return null;
  return {
    id: String(rec.id || genId()),
    content: content.slice(0, MEMORY_MAX_CHARS),
    type: MEMORY_TYPES.has(rec.type) ? rec.type : 'fact',
    scope: (typeof rec.scope === 'string' && rec.scope.trim()) ? rec.scope.trim() : 'global',
    source: rec.source === 'user' ? 'user' : 'agent',
    createdAt: Number(rec.createdAt) || Date.now(),
    updatedAt: Number(rec.updatedAt) || Number(rec.createdAt) || Date.now()
  };
}

function createMemoryRecord({ content, type, scope, source }) {
  return normalizeMemoryRecord({
    id: genId(),
    content: String(content || '').trim().slice(0, MEMORY_MAX_CHARS),
    type,
    scope,
    source,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
}

/* Score records against a free-text query. Only records whose scope is
   'global' or matches `scope` are candidates. Score = token overlap count;
   ties break by recency. Returns [{ record, score }], score > 0 only. */
function searchMemories(list, query, { scope = 'global', limit = 8 } = {}) {
  const qTokens = tokenizeText(query);
  if (qTokens.size === 0) return [];
  const scored = [];
  for (const raw of list || []) {
    const rec = raw && raw.id ? raw : normalizeMemoryRecord(raw); // already-normalized lists skip re-wrap
    if (!rec) continue;
    if (rec.scope !== 'global' && rec.scope !== scope) continue;
    const rTokens = tokenizeText(`${rec.content} ${rec.type}`);
    let score = 0;
    for (const t of qTokens) if (rTokens.has(t)) score++;
    if (score > 0) scored.push({ record: rec, score });
  }
  scored.sort((a, b) => (b.score - a.score) || (b.record.updatedAt - a.record.updatedAt));
  return scored.slice(0, Math.max(1, limit));
}

/* Render recalled records as a compact system-prompt block. */
function formatMemoriesForPrompt(scored) {
  const rows = (scored || []).filter(Boolean).map(({ record }) => {
    const tag = record.scope === 'global' ? '全局' : '项目';
    return `- (${tag}/${record.type}) ${record.content}`;
  });
  if (rows.length === 0) return '';
  return `[长期记忆] 以下是与本次请求可能相关的跨会话记忆（自动召回，请自行判断是否采信）：\n${rows.join('\n')}`;
}

/* --- Agent tool surface -------------------------------------------------- */

const MEMORY_TOOLS_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'memory_write',
      description: '将一条值得跨会话长期记住的信息写入记忆库。适用：用户偏好与习惯、项目约定（路径/命令/规范）、用户给出的纠正与反馈、反复用到的领域事实。不适用：仅本次会话有意义的临时细节。',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '记忆内容，一句话自包含（脱离原对话也能读懂）' },
          type: { type: 'string', enum: ['fact', 'preference', 'project'], description: 'fact=领域事实 / preference=用户偏好 / project=项目约定' },
          scope: { type: 'string', description: 'global=全部会话生效（默认）；project=仅当前工作目录的项目记忆' }
        },
        required: ['content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'memory_search',
      description: '按关键词检索记忆库，返回最相关的记忆条目。在需要回忆用户偏好、项目约定或既往结论时调用。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '检索关键词（中英文均可）' },
          limit: { type: 'number', description: '最多返回条数 (默认 8)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'memory_list',
      description: '列出记忆库中与当前作用域（全局 + 当前项目）相关的全部记忆（ID 与内容摘要）。',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'memory_delete',
      description: '按 ID 删除一条记忆（记忆过时或用户要求遗忘时使用）。',
      parameters: {
        type: 'object',
        properties: {
          memory_id: { type: 'string', description: '来自 memory_list / memory_write 返回的记忆 ID' }
        },
        required: ['memory_id']
      }
    }
  }
];

/* Execute a memory tool against the live array; mutations call `save()`.
   runtime = { memories: Array, save: () => void, scope: string } */
function executeMemoryTool(name, args, runtime) {
  const list = runtime.memories;
  const scope = runtime.scope || 'global';
  const argsObj = args && typeof args === 'object' ? args : {};

  if (name === 'memory_write') {
    const content = String(argsObj.content || '').trim();
    if (!content) return { ok: false, error: 'content 不能为空' };
    if (content.length > MEMORY_MAX_CHARS) return { ok: false, error: `记忆过长 (>${MEMORY_MAX_CHARS} 字符)，请拆分或精简` };
    const rec = createMemoryRecord({
      content,
      type: argsObj.type,
      scope: argsObj.scope === 'project' ? scope : 'global', // 'project' keyword maps to the session work dir
      source: 'agent'
    });
    let pruned = 0;
    list.push(rec);
    if (list.length > MEMORY_LIMIT) {
      // Oldest-touched first; never prune the record we just added
      const sortedIdx = list.map((r, i) => ({ i, t: Number(r.updatedAt) || 0 }))
        .sort((a, b) => a.t - b.t)
        .map(x => x.i);
      let excess = list.length - MEMORY_LIMIT;
      const drop = new Set();
      for (const i of sortedIdx) {
        if (excess <= 0) break;
        if (list[i] === rec) continue;
        drop.add(i);
        excess--;
      }
      pruned = drop.size;
      runtime.memories.length = 0;
      runtime.memories.push(...list.filter((_, i) => !drop.has(i)));
    }
    runtime.save();
    return { ok: true, memoryId: rec.id, scope: rec.scope, pruned, message: pruned > 0 ? `已保存（并自动清理了 ${pruned} 条最久未用的记忆）` : '已保存' };
  }

  if (name === 'memory_search') {
    const query = String(argsObj.query || '').trim();
    if (!query) return { ok: false, error: 'query 不能为空' };
    const hits = searchMemories(list, query, { scope, limit: Math.min(20, Math.max(1, Number(argsObj.limit) || 8)) });
    return { ok: true, matched: hits.length, memories: hits.map(h => ({ id: h.record.id, content: h.record.content, type: h.record.type, scope: h.record.scope === 'global' ? '全局' : '项目', score: h.score })) };
  }

  if (name === 'memory_list') {
    const rows = list
      .filter(r => r.scope === 'global' || r.scope === scope)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .map(r => ({ id: r.id, content: r.content.length > 120 ? r.content.slice(0, 120) + '…' : r.content, type: r.type, scope: r.scope === 'global' ? '全局' : '项目', updatedAt: r.updatedAt }));
    return { ok: true, count: rows.length, memories: rows };
  }

  if (name === 'memory_delete') {
    const id = String(argsObj.memory_id || '').trim();
    const idx = list.findIndex(r => r.id === id);
    if (idx < 0) return { ok: false, error: `记忆 ${id} 不存在（可用 memory_list 查询 ID）` };
    list.splice(idx, 1);
    runtime.save();
    return { ok: true, deleted: id };
  }

  return { ok: false, error: `未知记忆工具 "${name}"` };
}

module.exports = {
  MEMORY_LIMIT,
  MEMORY_MAX_CHARS,
  MEMORY_TOOLS_DEFINITIONS,
  MEMORY_SCOPES,
  tokenizeText,
  normalizeMemoryRecord,
  createMemoryRecord,
  searchMemories,
  formatMemoriesForPrompt,
  executeMemoryTool
};
