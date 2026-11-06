const assert = require('assert');
const path = require('path');

// Setup mock electron Notification before importing backend
const notifications = [];
class MockNotification {
  constructor(opts) {
    this.opts = opts;
    this.listeners = {};
    this.shown = false;
    notifications.push(this);
  }
  static isSupported() { return true; }
  on(event, fn) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(fn);
  }
  show() {
    this.shown = true;
  }
  trigger(event, data) {
    const fns = this.listeners[event] || [];
    fns.forEach(fn => fn(data));
  }
}

try {
  const electronPath = require.resolve('electron');
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: { Notification: MockNotification }
  };
} catch { /* ignore if not present */ }

// Mock context for testing memo backend
function createMockContext(mockPlugins = {}) {
  let storedData = {};
  const events = [];
  const handlers = {};
  const openedPanels = [];

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
    callPlugin(id, method, args) {
      if (mockPlugins[id] && typeof mockPlugins[id][method] === 'function') {
        return mockPlugins[id][method](args);
      }
      return Promise.reject(new Error(`Plugin ${id} method ${method} not found`));
    },
    openPluginPanel(id, payload) {
      openedPanels.push({ id, payload });
    },
    events,
    handlers,
    openedPanels
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
    title: '项目架构评审会（更新）',
    priority: 1,
    targetTime: newTarget,
    remindStrategy: '30m',
    remindAt: newRemind
  });
  assert.ok(updated.ok, 'todoUpdate should succeed');
  assert.strictEqual(updated.todo.title, '项目架构评审会（更新）');
  assert.strictEqual(updated.todo.priority, 1);
  assert.strictEqual(updated.todo.targetTime, newTarget);
  assert.strictEqual(updated.todo.remindStrategy, '30m');
  assert.strictEqual(updated.todo.remindAt, newRemind);

  // 4b. Test clearing time and reminders
  const cleared = await ctx.call('todoUpdate', {
    id: created.todo.id,
    targetTime: null,
    dueDate: null,
    remindAt: null,
    remindStrategy: 'none'
  });
  assert.ok(cleared.ok, 'todoUpdate clear time should succeed');
  assert.strictEqual(cleared.todo.targetTime, null);
  assert.strictEqual(cleared.todo.dueDate, null);
  assert.strictEqual(cleared.todo.remindAt, null);
  assert.strictEqual(cleared.todo.remindStrategy, 'none');

  // 5. Test todoToggle
  const toggled = await ctx.call('todoToggle', { id: created.todo.id });
  assert.ok(toggled.ok, 'todoToggle should succeed');
  assert.strictEqual(toggled.todo.done, true);
  assert.ok(ctx.events.some(e => e.name === 'todo-done'), 'should broadcast todo-done');

  // 6. Test todoDelete
  const deleted = await ctx.call('todoDelete', { id: created.todo.id });
  assert.ok(deleted.ok, 'todoDelete should succeed');
  assert.ok(!deleted.todos.some(t => t.id === created.todo.id), 'todo should be removed');

  // 7. Test reminder with Desktop Pet OPEN: pet receives reminder broadcast, system notification is suppressed
  let petVisible = true;
  const mockPlugins = {
    'desktop-pet': {
      getState: async () => ({ visible: petVisible })
    }
  };
  const ctxWithPet = createMockContext(mockPlugins);
  backend.activate(ctxWithPet);

  const now = Date.now();
  const petDueTodo = await ctxWithPet.call('todoCreate', {
    title: '桌宠专属播报任务',
    dueDate: '2026-11-06',
    targetTime: now - 5000,
    remindStrategy: 'on_time',
    remindAt: now - 5000,
    priority: 1
  });

  notifications.length = 0; // reset notifications
  ctxWithPet.events.length = 0; // reset events

  assert.ok(typeof backend._checkReminders === 'function', '_checkReminders should be exposed');
  await backend._checkReminders();

  // Desktop pet should receive the reminder broadcast
  const petReminded = ctxWithPet.events.find(e => e.name === 'reminder');
  assert.ok(petReminded, 'Should broadcast reminder event when pet is active');
  assert.strictEqual(petReminded.payload.title, '桌宠专属播报任务');

  // System notification must be suppressed when pet is active!
  assert.strictEqual(notifications.length, 0, 'System notification must be suppressed when pet is visible');

  // 8. Test reminder WITHOUT Desktop Pet (or Pet hidden): system notification shown, pet broadcast suppressed
  petVisible = false;
  const sysDueTodo = await ctxWithPet.call('todoCreate', {
    title: '系统通知兜底任务',
    dueDate: '2026-11-06',
    targetTime: now - 3000,
    remindStrategy: 'on_time',
    remindAt: now - 3000,
    priority: 2
  });

  notifications.length = 0;
  ctxWithPet.events.length = 0;

  await backend._checkReminders();

  // Desktop pet broadcast should NOT be sent when pet is hidden
  const petBroadcast = ctxWithPet.events.find(e => e.name === 'reminder');
  assert.ok(!petBroadcast, 'Should NOT send pet reminder broadcast when pet is inactive/hidden');

  // System desktop notification MUST be created and shown
  assert.strictEqual(notifications.length, 1, 'System notification should be shown when pet is inactive');
  assert.strictEqual(notifications[0].shown, true, 'Notification show() should be called');
  assert.ok(notifications[0].opts.title.includes('备忘录待办提醒'), 'Notification title check');
  assert.strictEqual(notifications[0].opts.body, '系统通知兜底任务', 'Notification body check');

  // Clicking notification should open memo todos panel
  assert.strictEqual(ctxWithPet.openedPanels.length, 0);
  notifications[0].trigger('click');
  assert.strictEqual(ctxWithPet.openedPanels.length, 1);
  assert.strictEqual(ctxWithPet.openedPanels[0].id, 'memo');
  assert.deepStrictEqual(ctxWithPet.openedPanels[0].payload, { view: 'todos' });

  backend.deactivate();
  console.log('PASS: All memo backend todo & reminder tests passed!');
}

testMemoBackend().catch(err => {
  console.error('FAIL:', err);
  process.exit(1);
});
