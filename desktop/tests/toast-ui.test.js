const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const srcDir = path.join(__dirname, '..', 'src');
const appJs = fs.readFileSync(path.join(srcDir, 'app.js'), 'utf8');
const stylesCss = fs.readFileSync(path.join(srcDir, 'styles.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');

// The toast constants, showToast and dismissToast sit in one block, so the real durations load with them.
function extractToastSource() {
  const start = appJs.indexOf('const TOAST_DURATION_MS');
  assert.notEqual(start, -1, 'app.js should define TOAST_DURATION_MS');
  const dismissStart = appJs.indexOf('function dismissToast(', start);
  assert.notEqual(dismissStart, -1, 'app.js should define dismissToast()');
  const bodyStart = appJs.indexOf(') {', dismissStart) + 2;
  let depth = 0;
  for (let index = bodyStart; index < appJs.length; index += 1) {
    if (appJs[index] === '{') depth += 1;
    if (appJs[index] === '}' && --depth === 0) return appJs.slice(start, index + 1);
  }
  return assert.fail('Unable to parse dismissToast()');
}

function createElement() {
  const classes = new Set();
  const attributes = {};
  const handlers = {};
  const element = {
    parent: null,
    children: [],
    textContent: '',
    handlers,
    set className(value) {
      classes.clear();
      value.split(/\s+/).filter(Boolean).forEach((name) => classes.add(name));
    },
    classList: {
      add: (name) => classes.add(name),
      contains: (name) => classes.has(name)
    },
    setAttribute: (name, value) => { attributes[name] = String(value); },
    getAttribute: (name) => (name in attributes ? attributes[name] : null),
    append: (...nodes) => element.children.push(...nodes),
    addEventListener: (type, handler) => { (handlers[type] ||= []).push(handler); },
    fire: (type) => (handlers[type] || []).slice().forEach((handler) => handler({ type })),
    remove() {
      if (element.parent) {
        element.parent.children.splice(element.parent.children.indexOf(element), 1);
        element.parent = null;
      }
    },
    get isConnected() {
      return element.parent !== null;
    }
  };
  return element;
}

function loadToasts() {
  const clock = { now: 0 };
  const timers = [];
  const cleared = [];
  const container = {
    children: [],
    appendChild(node) {
      node.parent = container;
      container.children.push(node);
    },
    querySelectorAll(selector) {
      assert.equal(selector, '.toast:not(.leaving)');
      return container.children.filter((node) => !node.classList.contains('leaving'));
    }
  };
  const context = vm.createContext({
    document: { createElement },
    elements: { toastContainer: container },
    setTimeout: (callback, delay) => {
      const id = timers.length + 1;
      timers.push({ id, delay, callback });
      return id;
    },
    clearTimeout: (id) => cleared.push(id),
    Date: { now: () => clock.now }
  });
  vm.runInContext(`${extractToastSource()}\nthis.showToast = showToast;\nthis.dismissToast = dismissToast;\nthis.TOAST_EXIT_FALLBACK_MS = TOAST_EXIT_FALLBACK_MS;`, context);
  const visible = () => container.querySelectorAll('.toast:not(.leaving)');
  return { context, clock, timers, cleared, container, visible };
}

test('toasts stay 4 s for info and unknown types, 5 s for success and 8 s for warnings and errors', () => {
  for (const [type, delay] of [[undefined, 4000], ['info', 4000], ['unknown', 4000], ['success', 5000], ['warning', 8000], ['error', 8000]]) {
    const { context, timers } = loadToasts();
    context.showToast('Title', 'Message', type);
    assert.equal(timers[0].delay, delay, `${type} toast`);
  }
});

test('only error toasts are announced as alerts', () => {
  for (const [type, role] of [['info', null], ['success', null], ['warning', null], ['error', 'alert']]) {
    const { context, container } = loadToasts();
    context.showToast('Title', 'Message', type);
    assert.equal(container.children[0].getAttribute('role'), role, `${type} toast`);
  }
});

test('a fourth toast sends the oldest out so three stay on screen', () => {
  const { context, container, visible } = loadToasts();
  for (const title of ['One', 'Two', 'Three', 'Four']) {
    context.showToast(title, 'Message');
  }

  const [first, second] = container.children;
  assert.ok(first.classList.contains('leaving'));
  assert.ok(!second.classList.contains('leaving'));
  assert.equal(visible().length, 3);

  context.showToast('Five', 'Message');
  assert.ok(second.classList.contains('leaving'));
  assert.equal(visible().length, 3);
});

test('a click sends a toast out and it leaves when its exit animation ends or the fallback fires', () => {
  const clicked = loadToasts();
  clicked.context.showToast('Title', 'Message');
  const toast = clicked.container.children[0];

  toast.fire('click');
  assert.ok(toast.classList.contains('leaving'));
  assert.equal(toast.isConnected, true);
  toast.fire('animationend');
  assert.equal(toast.isConnected, false);
  assert.equal(clicked.container.children.length, 0);
  // The fallback still fires after a normal exit and must find nothing left to do.
  assert.doesNotThrow(() => clicked.timers.at(-1).callback());

  const stalled = loadToasts();
  stalled.context.showToast('Title', 'Message');
  const stalledToast = stalled.container.children[0];
  stalledToast.fire('click');
  const exitTimer = stalled.timers.at(-1);
  assert.equal(stalled.context.TOAST_EXIT_FALLBACK_MS, 300);
  assert.equal(exitTimer.delay, 300);
  exitTimer.callback();
  assert.equal(stalledToast.isConnected, false);
});

test('dismissing a toast again, by click or by its own timer, schedules no second exit', () => {
  const { context, container, timers } = loadToasts();
  context.showToast('Title', 'Message', 'success');
  const toast = container.children[0];
  const durationTimer = timers[0];

  toast.fire('click');
  assert.doesNotThrow(() => {
    toast.fire('click');
    durationTimer.callback();
  });
  assert.equal(timers.filter((timer) => timer.delay === 300).length, 1);
  assert.equal(toast.handlers.animationend.length, 1);

  toast.fire('animationend');
  assert.doesNotThrow(() => context.dismissToast(toast));
  assert.equal(timers.filter((timer) => timer.delay === 300).length, 1);
});

test('hovering holds a toast and leaving resumes the time it had left', () => {
  const { context, clock, container, timers, cleared } = loadToasts();
  context.showToast('Title', 'Message', 'info');
  const toast = container.children[0];

  clock.now = 1500;
  toast.fire('mouseenter');
  assert.deepEqual(cleared, [timers[0].id]);

  clock.now = 9000;
  toast.fire('mouseleave');
  assert.equal(timers.length, 2);
  assert.equal(timers[1].delay, 2500);

  timers[1].callback();
  assert.ok(toast.classList.contains('leaving'));
});

test('toasts leave through the toastOut keyframes from a polite region that reads one toast at a time', () => {
  assert.match(stylesCss, /\.toast\.leaving\s*\{[^}]*animation:\s*toastOut var\(--duration-fast\)/);
  assert.match(stylesCss, /@keyframes toastOut/);
  assert.doesNotMatch(stylesCss, /fadeOut/);
  assert.doesNotMatch(extractToastSource(), /\.style\.animation/);

  const container = indexHtml.match(/<div id="toast-container"[^>]*>/)?.[0] || '';
  assert.match(container, /role="status"/);
  assert.match(container, /aria-live="polite"/);
  assert.match(container, /aria-atomic="false"/);
});
