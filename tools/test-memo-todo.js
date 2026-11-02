const assert = require('assert');
const path = require('path');

// Mock context for testing memo backend
function createMockContext() {
  let storedData = {};
  const events = [];
  const handlers = {};

  const ctx = {
    data: {
      get() { return JSON.parse(JSON.stringify(storedData)); },
      set(d) { storedData = JSON.parse(JSON.stringify(d)); }
    },
    ipc: {
      handle(name, fn) {
        handlers[name] = fn;
      }
    },
    send(name, payload) {
      events.push({ name, payload });
    },
    call(name, args) {
      if (!handlers[name]) throw new Error(`Handler ${name} not registered`);
      return handlers[name](args);
    },
    events,
    handlers
  };
  return ctx;
}

async function testMemoBackend() {
  console.log('Testing memo backend todo & reminder logic...');
  const backend = require(path.resolve('src/plugins/memo/backend.js'));
  const ctx = createMockContext();

  backend.activate(ctx);

  // 1. Check initial seeded todos
  const list = await ctx.call('list');
  assert.ok(Array.isArray(list.todos), 'todos must be an array');
  assert.ok(list.todos.length >= 2, 'should have seeded sample todos');

  // 2. Test create todo with targetTime & remindStrategy
  const targetTime = new Date('2026-11-05T15:30:00').getTime();
  const remindAt = targetTime - 15 * 60000; // 15 mins before
  const created = await ctx.call('todoCreate', {
    title: '项目架构评审会',
    dueDate: '2026-11-05',
    targetTime,
    remindStrategy: '15m',
    remindAt,
    priority: 2
  });

  assert.ok(created.ok, 'todoCreate should succeed');
  assert.strictEqual(created.todo.title, '项目架构评审会');
  assert.strictEqual(created.todo.dueDate, '2026-11-05');
  assert.strictEqual(created.todo.targetTime, targetTime);
  assert.strictEqual(created.todo.remindStrategy, '15m');
  assert.strictEqual(created.todo.remindAt, remindAt);
  assert.strictEqual(created.todo.priority, 2);

  // 3. Test create todo from Calendar with just dueDate (no specific time)
  const calTodo = await ctx.call('todoCreate', {
    title: '全天待办',
    dueDate: '2026-11-06',
    targetTime: null,
    remindStrategy: 'none',
    remindAt: null,
    priority: 0
  });
  assert.ok(calTodo.ok, 'calendar todoCreate should succeed');
  assert.strictEqual(calTodo.todo.title, '全天待办');
  assert.strictEqual(calTodo.todo.dueDate, '2026-11-06');
  assert.strictEqual(calTodo.todo.remindAt, null);

  // 4. Test todoUpdate
  const newTarget = new Date('2026-11-05T16:00:00').getTime();
  const newRemind = newTarget - 30 * 60000;
  const updated = await ctx.call('todoUpdate', {
    id: created.todo.id,
    targetTime: newTarget,
    remindStrategy: '30m',
    remindAt: newRemind
  });
  assert.ok(updated.ok, 'todoUpdate should succeed');
  assert.strictEqual(updated.todo.targetTime, newTarget);
  assert.strictEqual(updated.todo.remindStrategy, '30m');
  assert.strictEqual(updated.todo.remindAt, newRemind);

  // 5. Test todoToggle
  const toggled = await ctx.call('todoToggle', { id: created.todo.id });
  assert.ok(toggled.ok, 'todoToggle should succeed');
  assert.strictEqual(toggled.todo.done, true);
  assert.ok(ctx.events.some(e => e.name === 'todo-done'), 'should broadcast todo-done');

  // 6. Test todoDelete
  const deleted = await ctx.call('todoDelete', { id: created.todo.id });
  assert.ok(deleted.ok, 'todoDelete should succeed');
  assert.ok(!deleted.todos.some(t => t.id === created.todo.id), 'todo should be removed');

  backend.deactivate();
  console.log('PASS: All memo backend todo & reminder tests passed!');
}

testMemoBackend().catch(err => {
  console.error('FAIL:', err);
  process.exit(1);
});
