// Test AI Chat Task List Lifecycle & Session Switching
const assert = require('assert');
const { extractTasksFromMarkdown } = require('../src/plugins/ai-chat/task-tools');
const { getActiveTasks } = require('../src/plugins/ai-chat/components/task-drawer');

async function runTests() {
  console.log('--- 开始测试任务清单生命周期与会话切换 ---');

  // Test 1: extractTasksFromMarkdown parser test
  console.log('[Test 1] 验证 Markdown 任务清单解析 (待办、进行中、已完成)...');
  const sampleMarkdown = `
一些思考内容...
## 任务执行清单 (Task List)
- [ ] 1. 分析系统瓶颈与第一性原理
- [>] 2. 重构任务管理组件 (进行中)
- [x] 3. 编写单元测试用例
- [/] 4. 执行回归测试
- [X] 5. 提交 Git
  `;
  const tasks = extractTasksFromMarkdown(sampleMarkdown);
  assert.strictEqual(tasks.length, 5, '应当解析出 5 项任务');
  assert.strictEqual(tasks[0].status, 'pending');
  assert.strictEqual(tasks[0].content, '1. 分析系统瓶颈与第一性原理');
  assert.strictEqual(tasks[1].status, 'in_progress');
  assert.strictEqual(tasks[1].content, '2. 重构任务管理组件');
  assert.strictEqual(tasks[2].status, 'completed');
  assert.strictEqual(tasks[3].status, 'in_progress');
  assert.strictEqual(tasks[4].status, 'completed');
  console.log('✓ Test 1 通过');

  // Test 2: getActiveTasks reflects newer assistant message's markdown checklist over stale list
  console.log('[Test 2] 验证最新 assistant 消息的任务清单能实时更新并覆盖旧状态...');
  const session1 = {
    id: 's1',
    taskList: [
      { content: '任务 A', status: 'pending' },
      { content: '任务 B', status: 'pending' }
    ],
    messages: [
      {
        role: 'assistant',
        id: 'm1',
        content: '- [ ] 任务 A\n- [ ] 任务 B'
      },
      {
        role: 'user',
        id: 'm2',
        content: '我完成了任务 A'
      },
      {
        role: 'assistant',
        id: 'm3',
        content: '已确认完成任务 A！\n- [x] 任务 A\n- [>] 任务 B (进行中)'
      }
    ]
  };

  const active1 = getActiveTasks(session1, extractTasksFromMarkdown);
  assert.ok(active1, '应当获取到任务数据');
  assert.strictEqual(active1.tasks[0].status, 'completed', '任务 A 状态应更新为 completed');
  assert.strictEqual(active1.tasks[1].status, 'in_progress', '任务 B 状态应更新为 in_progress');
  console.log('✓ Test 2 通过');

  // Test 3: Session switching — empty or different sessions
  console.log('[Test 3] 验证新会话与无任务会话正确切换，旧任务不残留...');
  const sessionEmpty = {
    id: 's_new',
    taskList: null,
    messages: []
  };
  const activeEmpty = getActiveTasks(sessionEmpty, extractTasksFromMarkdown);
  assert.strictEqual(activeEmpty, null, '新会话无任务清单，应当返回 null (浮窗将被移除)');

  const session2 = {
    id: 's2',
    taskList: [
      { content: '会话2任务 1', status: 'completed' },
      { content: '会话2任务 2', status: 'pending' }
    ],
    messages: []
  };
  const active2 = getActiveTasks(session2, extractTasksFromMarkdown);
  assert.ok(active2 && active2.tasks.length === 2, '会话2应当返回专属清单');
  assert.strictEqual(active2.tasks[0].content, '会话2任务 1');
  console.log('✓ Test 3 通过');

  // Test 4: Hiding / clearing tasks for current message
  console.log('[Test 4] 验证清空与关闭任务浮窗行为...');
  session1._hiddenTasksMessageId = 'm3';
  session1.taskList = null;
  const activeHidden = getActiveTasks(session1, extractTasksFromMarkdown);
  // When m3 is hidden and taskList is null, earlier m1 has task list
  session1._hideExtractedTasks = true;
  const activeCleared = getActiveTasks(session1, extractTasksFromMarkdown);
  assert.strictEqual(activeCleared, null, '手动关闭后应当返回 null');
  console.log('✓ Test 4 通过');

  console.log('\n========================================');
  console.log('🎉 所有 4 项任务清单更新与会话切换测试全部通过！');
  console.log('========================================\n');
}

runTests().catch(err => {
  console.error('❌ 测试失败:', err);
  process.exit(1);
});
