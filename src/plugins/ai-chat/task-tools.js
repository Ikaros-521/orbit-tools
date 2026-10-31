/* Task planning for the AI Chat agent: a TodoWrite-style session task list.
   The model submits the FULL list on every update (no diffs — the last write
   wins), the list persists on the session, is re-injected into the system
   prompt each turn, and streams to the UI as task_list chunks. */

const TASK_STATUSES = new Set(['pending', 'in_progress', 'completed']);
const TASK_LIMIT = 20;
const TASK_MAX_CHARS = 160;

const TASK_TOOLS_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'update_task_list',
      description: '更新当前会话的任务清单（全量覆盖：每次提交完整列表）。多步骤任务（约 3 步以上）开工前先制定计划；每开始一项将其置为 in_progress（同一时刻仅一项），完成后立即标记 completed 并同步余下进度；计划有变直接提交新列表。简单单步任务无需使用。',
      parameters: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
            description: '完整的任务列表（按执行顺序）',
            items: {
              type: 'object',
              properties: {
                content: { type: 'string', description: '任务描述（动词开头，一句话）' },
                status: { type: 'string', enum: ['pending', 'in_progress', 'completed'], description: 'pending=待办 / in_progress=进行中(至多一项) / completed=已完成' }
              },
              required: ['content']
            }
          }
        },
        required: ['tasks']
      }
    }
  }
];

/* Validate & normalize a submitted list. Returns { ok, tasks } or { ok:false, error }.
   status defaults to 'pending'; at most one in_progress is kept (extras demote
   to pending) so the UI always shows a single active step. */
function normalizeTaskList(raw) {
  if (!Array.isArray(raw)) return { ok: false, error: 'tasks 必须是数组' };
  if (raw.length > TASK_LIMIT) return { ok: false, error: `任务过多 (>${TASK_LIMIT})，请拆分为更小的清单` };
  const tasks = [];
  for (const item of raw) {
    const content = String((item && item.content) || '').trim();
    if (!content) continue; // drop empty rows instead of failing the whole update
    const status = TASK_STATUSES.has(item && item.status) ? item.status : 'pending';
    tasks.push({ content: content.slice(0, TASK_MAX_CHARS), status });
  }
  if (tasks.length === 0) return { ok: false, error: '任务列表为空（如需清空请提交含至少一项的列表，或将已完成项保留）' };
  let sawActive = false;
  for (const t of tasks) {
    if (t.status === 'in_progress') {
      if (sawActive) t.status = 'pending'; // enforce single active step
      sawActive = true;
    }
  }
  return { ok: true, tasks };
}

const summarizeTaskProgress = tasks => {
  const done = (tasks || []).filter(t => t.status === 'completed').length;
  return `${done}/${(tasks || []).length}`;
};

/* Compact block for the system prompt so the plan survives context bounding. */
function formatTaskListForPrompt(tasks) {
  const rows = (tasks || []).map(t => {
    const mark = t.status === 'completed' ? '✓' : (t.status === 'in_progress' ? '▶' : ' ');
    return `${mark} ${t.content}${t.status === 'in_progress' ? '（进行中）' : ''}`;
  });
  if (rows.length === 0) return '';
  return `[当前任务清单] ${summarizeTaskProgress(tasks)} 已完成\n${rows.join('\n')}\n（用 update_task_list 维护：开工制定、随进度更新、完成标记）`;
}

module.exports = {
  TASK_LIMIT,
  TASK_STATUSES,
  TASK_TOOLS_DEFINITIONS,
  normalizeTaskList,
  summarizeTaskProgress,
  formatTaskListForPrompt
};
