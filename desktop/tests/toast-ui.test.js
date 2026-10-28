const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const srcDir = path.join(__dirname, '..', 'src');
const appJs = fs.readFileSync(path.join(srcDir, 'app.js'), 'utf8');
const stylesCss = fs.readFileSync(path.join(srcDir, 'styles.css'), 'utf8');
const indexHtml = fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');
const iconsSvg = fs.readFileSync(path.join(srcDir, 'assets', 'icons.svg'), 'utf8');

// The toast constants, the plate builders, showToast, showMapResultToast, mountToast and dismissToast sit in one
// block, so the real durations load with them.
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

// Just enough DOM for the toasts: parent links make contains() and isConnected work, and focus() moves
// document.activeElement. Events do not bubble; a test fires them on the element that owns the handler.
function createDocument({ focused = true } = {}) {
  const doc = { activeElement: null, hasFocus: () => focused };
  doc.createElement = (tag) => {
    const classes = new Set();
    const attributes = {};
    const handlers = {};
    const element = {
      tag,
      parent: null,
      children: [],
      textContent: '',
      innerHTML: '',
      adjacent: [],
      dataset: {},
      handlers,
      set className(value) {
        classes.clear();
        value.split(/\s+/).filter(Boolean).forEach((name) => classes.add(name));
      },
      get className() {
        return [...classes].join(' ');
      },
      classList: {
        add: (name) => classes.add(name),
        contains: (name) => classes.has(name)
      },
      setAttribute: (name, value) => { attributes[name] = String(value); },
      getAttribute: (name) => (name in attributes ? attributes[name] : null),
      append: (...nodes) => nodes.forEach((node) => {
        node.parent = element;
        element.children.push(node);
      }),
      appendChild: (node) => element.append(node),
      insertAdjacentHTML: (where, html) => element.adjacent.push([where, html]),
      addEventListener: (type, handler) => { (handlers[type] ||= []).push(handler); },
      // The passed event object records a stopPropagation call.
      fire: (type, event = {}) => (handlers[type] || []).slice().forEach((handler) => handler({
        type,
        ...event,
        stopPropagation() { event.stopped = true; }
      })),
      contains(node) {
        for (let current = node; current; current = current.parent) {
          if (current === element) return true;
        }
        return false;
      },
      focus() { doc.activeElement = element; },
      remove() {
        if (element.parent) {
          element.parent.children.splice(element.parent.children.indexOf(element), 1);
          element.parent = null;
        }
      },
      get isConnected() {
        let current = element;
        while (current.parent) current = current.parent;
        return current.root === true;
      }
    };
    return element;
  };
  return doc;
}

function loadToasts({ focused = true } = {}) {
  const clock = { now: 0 };
  const timers = [];
  const cleared = [];
  const windowHandlers = {};
  const profitCalls = [];
  const doc = createDocument({ focused });
  const container = doc.createElement('div');
  container.root = true;
  container.querySelectorAll = (selector) => {
    assert.equal(selector, '.toast:not(.leaving)');
    return container.children.filter((node) => !node.classList.contains('leaving'));
  };
  const announcer = doc.createElement('div');
  announcer.root = true;
  const context = vm.createContext({
    document: doc,
    elements: { toastContainer: container, toastAnnouncer: announcer },
    window: {
      t: (key) => key,
      addEventListener: (type, handler) => { windowHandlers[type] = handler; }
    },
    state: { settings: { poeVersion: 'poe1' } },
    getMapResultProfitTier: (result) => {
      if (result.profitUnavailable) return '';
      return result.netProfit < 0 ? 'loss' : 'rare';
    },
    formatMapResultProfitHTML: (result, iconSize, options) => {
      profitCalls.push({ result, iconSize, signed: options?.signed });
      return `<span class="value-chip">${result.netProfit}</span>`;
    },
    profitMemeHTML: (tier) => ({ rare: '<div class="meme-badge">Pog</div>', loss: '<div class="meme-badge">Bricked</div>' })[tier] || '',
    formatDuration: (seconds) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`,
    formatAdaptiveProfitText: (value, poeVersion, options) => {
      const sign = options?.signed && value > 0 ? '+' : '';
      return `${sign}${value}c`;
    },
    setTimeout: (callback, delay) => {
      const id = timers.length + 1;
      timers.push({ id, delay, callback });
      return id;
    },
    clearTimeout: (id) => cleared.push(id),
    Date: { now: () => clock.now }
  });
  vm.runInContext(`${extractToastSource()}
this.showToast = showToast;
this.showMapResultToast = showMapResultToast;
this.dismissToast = dismissToast;
this.TOAST_EXIT_FALLBACK_MS = TOAST_EXIT_FALLBACK_MS;`, context);
  const visible = () => container.querySelectorAll('.toast:not(.leaving)');
  const lines = () => announcer.children.map((line) => line.textContent);
  return { context, clock, timers, cleared, container, announcer, windowHandlers, profitCalls, doc, visible, lines };
}

function find(node, className) {
  if (node.classList?.contains(className)) return node;
  for (const child of node.children || []) {
    const hit = find(child, className);
    if (hit) return hit;
  }
  return null;
}

test('toasts stay 4 s for info and unknown types, 5 s for success and 8 s for warnings and errors', () => {
  for (const [type, delay, kind] of [
    [undefined, 4000, 'info'],
    ['info', 4000, 'info'],
    ['unknown', 4000, 'info'],
    ['success', 5000, 'success'],
    ['warning', 8000, 'warning'],
    ['error', 8000, 'error']
  ]) {
    const { context, timers, container } = loadToasts();
    context.showToast('Title', 'Message', type);
    assert.equal(timers[0].delay, delay, `${type} toast`);
    assert.equal(container.children[0].className, `toast ${kind}`, `${type} toast`);
  }
});

test('each type has its own glyph on an aria-hidden tile and a translated dismiss button', () => {
  for (const [type, glyph] of [['info', 'info'], ['success', 'check'], ['warning', 'warn'], ['error', 'alert'], ['unknown', 'info']]) {
    const { context, container } = loadToasts();
    context.showToast('Title', 'Message', type);
    const toast = container.children[0];
    const mark = find(toast, 'toast-mark');
    assert.equal(mark.getAttribute('aria-hidden'), 'true');
    assert.match(mark.innerHTML, new RegExp(`<use href="assets/icons\\.svg#${glyph}"/>`), `${type} toast`);
    const close = find(toast, 'toast-close');
    assert.equal(close.tag, 'button');
    assert.equal(close.type, 'button');
    assert.equal(close.getAttribute('aria-label'), 'toast.dismiss');
    assert.equal(close.getAttribute('data-i18n-aria'), 'toast.dismiss');
    assert.match(close.innerHTML, /<use href="assets\/icons\.svg#close"\/>/);
  }
});

test('each dismiss button is described by the title of the notice it closes', () => {
  const { context, container } = loadToasts();
  context.showToast('Could not save settings', '', 'error');
  context.showMapResultToast({ mapName: 'Dunes Map', netProfit: 412, durationSeconds: 60 });
  const ids = container.children.map((toast) => {
    const title = find(toast, 'toast-title');
    assert.match(title.id, /^toast-title-\d+$/);
    assert.equal(find(toast, 'toast-close').getAttribute('aria-describedby'), title.id);
    return title.id;
  });
  assert.equal(new Set(ids).size, 2);
});

test('an error is read out by its own alert; every other toast goes through the polite announcer', () => {
  for (const type of ['info', 'success', 'warning', 'error']) {
    const { context, container, lines } = loadToasts();
    context.showToast('Title', 'Message', type);
    const toast = container.children[0];
    assert.equal(toast.getAttribute('role'), null, `${type} toast`);
    assert.equal(find(toast, 'toast-body').getAttribute('role'), type === 'error' ? 'alert' : null, `${type} toast`);
    assert.deepEqual(lines(), type === 'error' ? [] : ['Title. Message'], `${type} toast`);
  }

  // Title and message go in as text; a title-only toast has no message element and announces the title alone.
  const { context, container, lines } = loadToasts();
  context.showToast('<img src=x>', '');
  const toast = container.children[0];
  const title = find(toast, 'toast-title');
  assert.equal(title.tag, 'p');
  assert.equal(title.textContent, '<img src=x>');
  assert.equal(title.innerHTML, '');
  assert.equal(find(toast, 'toast-message'), null);
  assert.deepEqual(lines(), ['<img src=x>']);

  const withMessage = loadToasts();
  withMessage.context.showToast('Title', '<img src=x onerror=alert(1)>', 'error');
  const message = find(withMessage.container.children[0], 'toast-message');
  assert.equal(message.textContent, '<img src=x onerror=alert(1)>');
  assert.equal(message.innerHTML, '');
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

test('a toast under the pointer or keyboard focus is not pushed out by a new one', () => {
  const { context, container, visible } = loadToasts();
  for (const title of ['One', 'Two', 'Three']) {
    context.showToast(title, '');
  }
  const [one, two, three] = container.children;
  one.fire('mouseenter');
  two.fire('focusin', { relatedTarget: null });

  context.showToast('Four', '');
  assert.ok(!one.classList.contains('leaving'));
  assert.ok(!two.classList.contains('leaving'));
  assert.ok(three.classList.contains('leaving'));
  assert.equal(visible().length, 3);
});

test('a toast with an action has no timer, is never pushed out, and its button dismisses before it acts', () => {
  const { context, container, timers, windowHandlers } = loadToasts();
  const selected = [];
  context.showToast('Update', 'Body', 'success', {
    action: { label: 'Restart now', onSelect: () => selected.push(container.children[0].classList.contains('leaving')) }
  });
  const sticky = container.children[0];
  assert.equal(timers.length, 0, 'an action toast has no timer');
  assert.equal(sticky.dataset.sticky, 'true');
  windowHandlers.blur();
  windowHandlers.focus();
  assert.equal(timers.length, 0, 'the window coming back starts no timer either');

  for (const title of ['A', 'B', 'C']) {
    context.showToast(title, '');
  }
  const [, a] = container.children;
  assert.ok(!sticky.classList.contains('leaving'));
  assert.ok(a.classList.contains('leaving'));

  const button = find(sticky, 'toast-actions').children[0];
  assert.equal(button.tag, 'button');
  assert.equal(button.type, 'button');
  assert.equal(button.className, 'btn btn-secondary btn-small');
  assert.equal(button.textContent, 'Restart now');
  const event = {};
  button.fire('click', event);
  assert.equal(event.stopped, true);
  assert.deepEqual(selected, [true]);
  assert.ok(sticky.classList.contains('leaving'));
});

test('a click sends a toast out and it leaves with its announcer line when its exit ends or the fallback fires', () => {
  const clicked = loadToasts();
  clicked.context.showToast('Title', 'Message');
  const toast = clicked.container.children[0];

  toast.fire('click');
  assert.ok(toast.classList.contains('leaving'));
  assert.equal(toast.isConnected, true);
  assert.deepEqual(clicked.lines(), ['Title. Message']);
  toast.fire('animationend');
  assert.equal(toast.isConnected, false);
  assert.equal(clicked.container.children.length, 0);
  assert.deepEqual(clicked.lines(), []);
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
  assert.deepEqual(stalled.lines(), []);
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

test('keyboard focus holds a toast until it leaves the toast', () => {
  const { context, clock, container, timers, cleared, doc } = loadToasts();
  const outside = doc.createElement('button');
  context.showToast('Title', 'Message', 'info');
  const toast = container.children[0];
  const close = find(toast, 'toast-close');

  clock.now = 500;
  toast.fire('focusin', { relatedTarget: outside });
  assert.deepEqual(cleared, [timers[0].id]);
  // Moving between the toast's own buttons keeps the hold.
  toast.fire('focusout', { relatedTarget: close });
  assert.equal(timers.length, 1);

  clock.now = 7000;
  toast.fire('focusout', { relatedTarget: outside });
  assert.equal(timers.length, 2);
  assert.equal(timers[1].delay, 3500);
});

test('the pointer, focus and a window in the background each hold; the last release resumes the time left', () => {
  const { context, clock, container, timers, cleared, windowHandlers } = loadToasts();
  context.showToast('Title', 'Message', 'info');
  const toast = container.children[0];

  clock.now = 1000;
  toast.fire('mouseenter');
  assert.deepEqual(cleared, [1]);
  windowHandlers.blur();
  toast.fire('focusin', { relatedTarget: null });
  clock.now = 5000;
  toast.fire('mouseleave');
  toast.fire('focusout', { relatedTarget: null });
  assert.equal(timers.length, 1, 'the window still holds');

  windowHandlers.focus();
  assert.equal(timers.length, 2);
  assert.equal(timers[1].delay, 3000);

  // A blur while counting down holds again from the time left.
  clock.now = 6000;
  windowHandlers.blur();
  assert.deepEqual(cleared, [1, 2]);
  clock.now = 60000;
  windowHandlers.focus();
  assert.equal(timers[2].delay, 2000);
});

test('a toast raised while the window is in the background starts only when the window comes back', () => {
  const { context, timers, windowHandlers } = loadToasts({ focused: false });
  context.showMapResultToast({ mapName: 'Dunes Map', netProfit: 412, durationSeconds: 252 });
  context.showToast('Title', 'Message', 'warning');
  assert.equal(timers.length, 0);

  windowHandlers.focus();
  assert.deepEqual(timers.map((timer) => timer.delay), [5000, 8000]);
});

test('Escape closes only the toast, focus moves to the next toast and then back to where it came from', () => {
  const { context, container, doc, lines } = loadToasts();
  const outside = doc.createElement('button');
  outside.root = true;
  context.showToast('One', '');
  context.showToast('Two', '');
  const [one, two] = container.children;
  const oneClose = find(one, 'toast-close');
  const twoClose = find(two, 'toast-close');

  doc.activeElement = oneClose;
  one.fire('focusin', { relatedTarget: outside });
  one.fire('keydown', { key: 'Enter' });
  assert.ok(!one.classList.contains('leaving'));

  const escape = { key: 'Escape' };
  one.fire('keydown', escape);
  assert.equal(escape.stopped, true, 'an open modal or drawer behind the toast stays open');
  assert.ok(one.classList.contains('leaving'));
  assert.equal(doc.activeElement, twoClose);

  two.fire('focusin', { relatedTarget: oneClose });
  two.fire('keydown', { key: 'Escape' });
  assert.equal(doc.activeElement, outside);
  one.fire('animationend');
  two.fire('animationend');
  assert.equal(container.children.length, 0);
  assert.deepEqual(lines(), []);

  // Focus that came from nowhere (a click with nothing focused) leaves nothing to go back to, so the older target
  // is not focused again.
  context.showToast('Three', '');
  const three = container.children[0];
  const threeClose = find(three, 'toast-close');
  doc.activeElement = threeClose;
  three.fire('focusin', { relatedTarget: null });
  three.fire('keydown', { key: 'Escape' });
  assert.equal(doc.activeElement, threeClose);
});

test('a pointer close sends focus back to where it was, so no other toast is left holding it', () => {
  const { context, container, doc, timers, cleared } = loadToasts();
  const outside = doc.createElement('textarea');
  outside.root = true;
  context.showToast('One', '');
  context.showToast('Two', '');
  const [one, two] = container.children;
  const oneClose = find(one, 'toast-close');
  const twoTimer = timers[1];

  // Chromium focuses a button on mousedown, so the click finds focus inside the toast it closes.
  doc.activeElement = oneClose;
  one.fire('focusin', { relatedTarget: outside, target: oneClose });
  one.fire('click', { detail: 1 });
  assert.ok(one.classList.contains('leaving'));
  assert.equal(doc.activeElement, outside);
  assert.ok(!cleared.includes(twoTimer.id), 'the other toast keeps counting down');
  twoTimer.callback();
  assert.ok(two.classList.contains('leaving'));

  // Enter or Space on the button clicks with no click count, which is the keyboard path.
  const keyboard = loadToasts();
  keyboard.context.showToast('One', '');
  keyboard.context.showToast('Two', '');
  const [first, second] = keyboard.container.children;
  keyboard.doc.activeElement = find(first, 'toast-close');
  first.fire('click', { detail: 0 });
  assert.equal(keyboard.doc.activeElement, find(second, 'toast-close'));
});

test('switching to the game and back keeps the place focus goes back to', () => {
  const { context, container, doc, windowHandlers } = loadToasts();
  const outside = doc.createElement('button');
  outside.root = true;
  context.showToast('Update ready', '', 'success', { action: { label: 'Restart now', onSelect: () => {} } });
  const toast = container.children[0];
  const close = find(toast, 'toast-close');

  doc.activeElement = close;
  toast.fire('focusin', { relatedTarget: outside, target: close });
  // Chromium blurs the focused element when the window goes to the background and focuses it again on the way back,
  // both times with no relatedTarget.
  toast.fire('focusout', { relatedTarget: null, target: close });
  windowHandlers.blur();
  windowHandlers.focus();
  toast.fire('focusin', { relatedTarget: null, target: close });

  toast.fire('keydown', { key: 'Escape' });
  assert.equal(doc.activeElement, outside);
});

test('a finished map shows its name, the signed value in its profit tier, the meme and the time', () => {
  const { context, container, lines, profitCalls } = loadToasts();
  const result = { mapName: 'Dunes Map', netProfit: 412, durationSeconds: 251.6 };
  context.showMapResultToast(result);
  const toast = container.children[0];

  assert.equal(toast.className, 'toast success toast--result');
  const mark = find(toast, 'toast-mark');
  assert.match(mark.innerHTML, /<use href="assets\/icons\.svg#map"\/>/);
  assert.equal(mark.getAttribute('data-profit-tier'), 'rare');
  const title = find(toast, 'toast-title');
  assert.equal(title.textContent, 'Dunes Map');
  assert.equal(title.innerHTML, '');
  // A name cut by the ellipsis keeps all of it in the tooltip.
  assert.equal(title.title, 'Dunes Map');
  const value = find(toast, 'toast-value');
  assert.equal(value.getAttribute('data-profit-tier'), 'rare');
  assert.equal(value.innerHTML, '<span class="value-chip">412</span>');
  assert.deepEqual(profitCalls, [{ result, iconSize: 16, signed: true }]);
  // The first row keeps its room for the name and the value; the meme badge goes on the second.
  const head = find(toast, 'toast-head');
  assert.deepEqual(head.children.map((child) => child.className), ['toast-title', 'toast-value']);
  assert.deepEqual(head.adjacent, []);
  const meta = find(toast, 'toast-meta');
  assert.deepEqual(meta.children.map((child) => child.className), ['toast-message']);
  assert.deepEqual(meta.adjacent, [['beforeend', '<div class="meme-badge">Pog</div>']]);
  assert.equal(find(toast, 'toast-message').textContent, 'toast.mapProfit · 4m 12s');
  assert.deepEqual(lines(), ['Dunes Map. toast.mapProfit +412c']);
});

test('a loss is a result in the loss tier, and a map without a name or a price still reads clearly', () => {
  const loss = loadToasts();
  loss.context.showMapResultToast({ mapName: '', netProfit: -85, durationSeconds: 0 });
  const lossToast = loss.container.children[0];
  assert.equal(lossToast.className, 'toast success toast--result');
  assert.equal(find(lossToast, 'toast-mark').getAttribute('data-profit-tier'), 'loss');
  assert.equal(find(lossToast, 'toast-value').getAttribute('data-profit-tier'), 'loss');
  assert.equal(find(lossToast, 'toast-title').textContent, 'misc.unknownMap');
  // No time is shown when the map has none.
  assert.equal(find(lossToast, 'toast-message').textContent, 'toast.mapLoss');
  assert.deepEqual(loss.lines(), ['misc.unknownMap. toast.mapLoss -85c']);

  const unpriced = loadToasts();
  unpriced.context.showMapResultToast({ mapName: 'Tower', profitUnavailable: true, durationSeconds: 61 });
  const unpricedToast = unpriced.container.children[0];
  assert.equal(find(unpricedToast, 'toast-value'), null);
  assert.equal(find(unpricedToast, 'toast-mark').getAttribute('data-profit-tier'), null);
  assert.deepEqual(find(unpricedToast, 'toast-head').adjacent, []);
  assert.deepEqual(find(unpricedToast, 'toast-meta').adjacent, []);
  assert.deepEqual(unpriced.profitCalls, []);
  assert.equal(find(unpricedToast, 'toast-message').textContent, 'toast.mapUnpriced · 1m 1s');
  assert.deepEqual(unpriced.lines(), ['Tower. toast.mapUnpriced']);
});

test('only fixed sprite markup, the value chip and the meme badge go into a toast as HTML', () => {
  const source = extractToastSource();
  const htmlWrites = [...source.matchAll(/(\w+)\.(?:innerHTML|outerHTML)\s*\+?=\s*([^;]+);/g)].map(([, target, value]) => `${target} = ${value}`);
  assert.deepEqual(htmlWrites, [
    'mark = TOAST_GLYPH_SVG[glyph]',
    'close = TOAST_CLOSE_SVG',
    'value = formatMapResultProfitHTML(result, 16, { signed: true })'
  ]);
  const htmlInserts = [...source.matchAll(/\w+\.insertAdjacentHTML\([^;]+\);/g)].map(([call]) => call);
  assert.deepEqual(htmlInserts, ["meta.insertAdjacentHTML('beforeend', profitMemeHTML(tier));"]);
  assert.doesNotMatch(source, /\.style\.animation/);
});

test('toasts are forged plates without a side stripe that slide out, or only fade with reduced motion', () => {
  const start = stylesCss.indexOf('/* ==================== TOAST ==================== */');
  const end = stylesCss.indexOf('/* ==================== SCROLLBAR ==================== */', start);
  assert.notEqual(start, -1);
  const toastCss = stylesCss.slice(start, end);

  assert.match(toastCss, /\.toast\.leaving\s*\{[^}]*animation:\s*toastOut var\(--duration-fast\)/);
  assert.match(toastCss, /@keyframes toastOut/);
  assert.match(toastCss, /@keyframes toastFadeIn/);
  assert.match(toastCss, /@keyframes toastFadeOut/);
  assert.match(
    toastCss,
    /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.toast\s*\{\s*animation-name:\s*toastFadeIn;\s*\}\s*\.toast\.leaving\s*\{\s*animation-name:\s*toastFadeOut;\s*\}/
  );
  assert.doesNotMatch(stylesCss, /fadeOut/);
  assert.doesNotMatch(toastCss, /border-left/);
  // A loss keeps its colour on the tile; the signed number stays in bright text, as on the overlay result card.
  assert.match(toastCss, /\.toast-value\[data-profit-tier="loss"\]\s*\{[^}]*color:\s*var\(--text-bright\)/);
});

test('toasts are announced from one polite region outside the stack', () => {
  const container = indexHtml.match(/<div id="toast-container"[^>]*>/)?.[0] || '';
  assert.ok(container);
  assert.doesNotMatch(container, /role=|aria-live|aria-atomic/);

  const announcer = indexHtml.match(/<div id="toast-announcer"[^>]*>/)?.[0] || '';
  assert.match(announcer, /class="visually-hidden"/);
  assert.match(announcer, /role="status"/);
  assert.match(announcer, /aria-live="polite"/);
  // role="status" is atomic by default, which would read every line still in the region again.
  assert.match(announcer, /aria-atomic="false"/);
});

test('the warning and error glyphs are in the sprite', () => {
  for (const id of ['warn', 'alert']) {
    assert.match(iconsSvg, new RegExp(`<symbol id="${id}" viewBox="0 0 24 24">`), id);
  }
});
