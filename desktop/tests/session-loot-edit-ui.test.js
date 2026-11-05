const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appJsPath = path.join(__dirname, '..', 'src', 'app.js');

function extractFunctionSource(source, functionName) {
  const asyncStart = source.indexOf(`async function ${functionName}(`);
  const start = asyncStart !== -1 ? asyncStart : source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `Expected app.js to define ${functionName}()`);
  const open = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  return assert.fail(`Could not find the end of ${functionName}()`);
}

function loadFunctions(functionNames, contextOverrides = {}) {
  const source = fs.readFileSync(appJsPath, 'utf8');
  const context = vm.createContext({ console, ...contextOverrides });
  for (const functionName of functionNames) {
    vm.runInContext(`${extractFunctionSource(source, functionName)};\nthis.${functionName} = ${functionName};`, context);
  }
  return context;
}

const DRAWER_FUNCTIONS = [
  'renderSessionDrawer',
  'sortSessionLoot',
  'clearSessionLootArm',
  'resetSessionLootEditing',
  'getFocusedSessionLootControl',
  'focusSessionLootControl',
  'redrawSessionLoot',
  'parseSessionLootQuantity',
  'handleSessionLootEditToggle',
  'handleSessionDrawerKeydown',
  'armSessionLootRemove',
  'handleSessionLootClick',
  'lockSessionLootRow',
  'handleSessionLootKeydown',
  'handleSessionLootChange',
  'changeSessionLoot',
  'closeSessionDrawer'
];

const plain = (value) => JSON.parse(JSON.stringify(value));

const LOOT = [
  { id: 'a', itemName: 'Divine Orb', quantity: 3, chaosValue: 100, itemType: 'currency', createdAt: '2026-10-21T12:03:00.000Z' },
  { id: 'b', itemName: 'Scarab "of" <Rust>', quantity: 2, chaosValue: 5, itemType: 'scarab', createdAt: '2026-10-21T12:02:00.000Z' },
  { id: 'c', itemName: 'Exalted Orb', quantity: 1, chaosValue: 10, itemType: 'currency', createdAt: '2026-10-21T12:01:00.000Z' },
  { itemName: 'Old Entry', quantity: 4, chaosValue: 1, itemType: 'other', createdAt: '2026-10-21T12:00:00.000Z' }
];

function fakeNode(attributes = {}) {
  const classes = new Set((attributes.className || '').split(' ').filter(Boolean));
  const node = {
    dataset: { lootId: attributes.lootId },
    disabled: Boolean(attributes.disabled),
    value: attributes.value,
    focused: false,
    classList: { contains: (name) => classes.has(name) },
    focus() { node.focused = true; },
    closest(selector) { return selector.split(',').some((part) => classes.has(part.trim().replace(/^\./, ''))) ? node : null; }
  };
  return node;
}

// Rows are parsed back out of the drawer's HTML, so the fake list finds controls the way the real one does. As in
// Electron, rebuilding the rows fires focusout on the control that had focus.
function createDrawer({ session, editing = false, armedId = null } = {}) {
  const calls = [];
  const documentStub = { activeElement: null };
  let harness = null;
  const toggleClasses = new Set(['hidden']);
  const toggle = {
    textContent: '',
    attributes: {},
    focused: false,
    classList: {
      toggle: (name, on) => { if (on) toggleClasses.add(name); else toggleClasses.delete(name); },
      contains: (name) => toggleClasses.has(name)
    },
    setAttribute(name, value) { this.attributes[name] = value; },
    focus() { this.focused = true; }
  };
  const nodes = { qty: [], remove: [] };
  const lootList = {
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(html) {
      const active = documentStub.activeElement;
      if (harness && [...nodes.qty, ...nodes.remove].includes(active)) {
        harness.handleSessionLootChange({ type: 'focusout', target: active, relatedTarget: null });
      }
      this._html = html;
      nodes.qty = [...html.matchAll(/<input[^>]*session-drawer-loot-qty[^>]*data-loot-id="([^"]+)"[^>]*?(disabled)?>/g)]
        .map(([, lootId, disabled]) => fakeNode({ className: 'session-drawer-loot-qty', lootId, disabled }));
      nodes.remove = [...html.matchAll(/<button[^>]*session-drawer-loot-remove[^>]*data-loot-id="([^"]+)"[^>]*?(disabled)?>/g)]
        .map(([, lootId, disabled]) => fakeNode({ className: 'session-drawer-loot-remove', lootId, disabled }));
    },
    contains: (node) => [...nodes.qty, ...nodes.remove].includes(node),
    querySelectorAll: (selector) => (selector === '.session-drawer-loot-remove' ? nodes.remove : nodes.qty)
  };
  const elements = {
    sessionDrawerTitle: { textContent: '' },
    sessionDrawerLootCount: { textContent: '' },
    sessionDrawerLootEdit: toggle,
    sessionDrawerSummary: { innerHTML: '' },
    sessionDrawerAnalytics: { innerHTML: '' },
    sessionDrawerLoot: lootList,
    sessionDrawerClose: { focused: false, focus() { this.focused = true; } },
    sessionDrawer: { classList: { add() {}, remove() {} }, setAttribute() {} }
  };
  const timers = [];
  const state = {
    settings: { poeVersion: 'poe1' },
    profitCurrencyRates: {},
    selectedSession: session,
    sessionLootEditing: editing,
    sessionLootArmedId: armedId,
    sessionLootArmTimer: null,
    sessionLootBusyId: null,
    sessionLootRedrawing: false
  };
  const context = loadFunctions(DRAWER_FUNCTIONS, {
    state,
    elements,
    document: documentStub,
    window: {
      t: (key, values = {}) => `${key}${values.item !== undefined ? `|${values.item}` : ''}${values.count !== undefined ? `|${values.count}` : ''}`,
      electronAPI: {
        updateLoot: async (...args) => { calls.push(['updateLoot', ...args]); return context.nextSession; },
        deleteLoot: async (...args) => { calls.push(['deleteLoot', ...args]); return context.nextSession; }
      }
    },
    escapeHTML: (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    itemSlotHTML: () => '<span class="item-slot"></span>',
    timeAgo: () => 'now',
    formatDuration: () => '1m',
    getLiveDuration: () => 60,
    buildSessionAnalytics: () => [],
    profitCurrencyHTML: (value) => `chaos:${value}`,
    getProfitTierFor: () => 'normal',
    profitMemeHTML: () => '',
    showToast: (...args) => calls.push(['toast', ...args]),
    getUserFacingErrorMessage: (error, fallbackKey) => `friendly:${error.message}:${fallbackKey}`,
    announceStatus: (text) => calls.push(['announce', text]),
    refreshTrackerData: async (options) => calls.push(['refresh', options]),
    setTimeout: (callback, ms) => { timers.push({ callback, ms }); return timers.length; },
    clearTimeout: (id) => { if (id) timers[id - 1] = null; },
    nextSession: null
  });
  harness = context;
  return { context, state, elements, nodes, toggle, calls, timers };
}

function sessionWith(lootEntries) {
  return {
    id: 'run-1',
    mapName: 'Crimson Temple',
    status: 'completed',
    poeVersion: 'poe1',
    league: 'Mirage',
    durationSec: 60,
    profitChaos: 0,
    totalLootChaos: 0,
    costChaos: 0,
    lootEntries
  };
}

const rowHtml = (html) => html.split('<article ').slice(1);

test('normal mode shows the loot with row ids and no controls, and the toggle offers Edit', () => {
  const { context, elements, toggle } = createDrawer({ session: sessionWith(LOOT) });

  context.renderSessionDrawer();

  const html = elements.sessionDrawerLoot.innerHTML;
  assert.doesNotMatch(html, /session-drawer-loot-qty|session-drawer-loot-remove/);
  assert.match(html, /<article class="session-drawer-loot-item" data-loot-id="a">/);
  assert.equal(rowHtml(html).length, 4);
  assert.equal(toggle.textContent, 'sessions.lootEdit');
  assert.equal(toggle.attributes['aria-pressed'], undefined, 'the label alone says what the button does');
  assert.equal(toggle.classList.contains('hidden'), false);
});

test('edit mode adds a quantity box and a remove button to each row with an id, escaping the item name', () => {
  const { context, elements, toggle } = createDrawer({ session: sessionWith(LOOT), editing: true });

  context.renderSessionDrawer();

  const rows = rowHtml(elements.sessionDrawerLoot.innerHTML);
  assert.equal(rows.length, 4);
  const [divine, scarab, , oldEntry] = rows;
  assert.match(divine, /<input type="number" class="session-drawer-loot-qty" min="1" max="1000000" step="1" inputmode="numeric" value="3" data-loot-id="a" aria-label="sessions\.lootQuantityAria\|Divine Orb">/);
  assert.match(divine, /<button type="button" class="btn-icon session-drawer-loot-remove" data-loot-id="a" aria-label="sessions\.lootRemoveAria\|Divine Orb"><svg[^>]*><use href="assets\/icons\.svg#trash"\/><\/svg><\/button>/);
  assert.ok(divine.indexOf('session-drawer-loot-qty') < divine.indexOf('session-drawer-loot-value'));
  assert.ok(divine.indexOf('session-drawer-loot-value') < divine.indexOf('session-drawer-loot-remove'));
  assert.match(scarab, /aria-label="sessions\.lootRemoveAria\|Scarab &quot;of&quot; &lt;Rust&gt;"/);
  // A row from before entries had ids is shown but not editable.
  assert.doesNotMatch(oldEntry, /data-loot-id|session-drawer-loot-qty|session-drawer-loot-remove/);
  assert.equal(toggle.textContent, 'sessions.lootEditDone');
});

test('the toggle is hidden when no entry has an id, and editing switches off with the last one', () => {
  const { context, state, toggle } = createDrawer({ session: sessionWith([LOOT[3]]), editing: true });

  context.renderSessionDrawer();

  assert.equal(toggle.classList.contains('hidden'), true);
  assert.equal(state.sessionLootEditing, false);
  assert.equal(toggle.textContent, 'sessions.lootEdit');
});

test('an armed row shows the confirm text in place of the trash icon', () => {
  const { context, elements } = createDrawer({ session: sessionWith(LOOT), editing: true, armedId: 'b' });

  context.renderSessionDrawer();

  const [divine, scarab] = rowHtml(elements.sessionDrawerLoot.innerHTML);
  assert.match(scarab, /class="btn-icon session-drawer-loot-remove is-armed"[^>]*>sessions\.lootRemoveConfirm<\/button>/);
  assert.match(scarab, /aria-label="sessions\.lootRemoveConfirmAria\|Scarab &quot;of&quot; &lt;Rust&gt;"/);
  assert.doesNotMatch(divine, /is-armed/);
});

test('a quantity that is not a whole number from 1 to 1000000, or is unchanged, goes back and makes no call', () => {
  const { context, calls } = createDrawer({ session: sessionWith(LOOT), editing: true });

  for (const typed of ['', '0', '-2', '2.5', 'abc', '1000001', '3']) {
    const input = fakeNode({ className: 'session-drawer-loot-qty', lootId: 'a', value: typed });
    context.handleSessionLootChange({ target: input });
    assert.equal(input.value, '3', `"${typed}" should put the old quantity back`);
  }

  assert.deepEqual(plain(calls), []);
});

test('a box that loses focus saves its quantity, the drawer follows and the rest of the app refreshes', async () => {
  const { context, state, nodes, calls, elements } = createDrawer({ session: sessionWith(LOOT), editing: true });
  context.renderSessionDrawer();
  context.nextSession = sessionWith(LOOT.map((loot) => (loot.id === 'a' ? { ...loot, quantity: 7 } : loot)));
  // Enter commits the box, so focus is still on it.
  context.document.activeElement = nodes.qty.find((node) => node.dataset.lootId === 'a');

  const box = context.document.activeElement;
  box.value = ' 7 ';
  context.handleSessionLootChange({ type: 'focusout', target: box, relatedTarget: null });
  assert.equal(state.sessionLootBusyId, 'a', 'the row is locked while the call runs');
  assert.equal(box.disabled, true);
  assert.equal(nodes.remove.find((node) => node.dataset.lootId === 'a').disabled, true);
  assert.equal(nodes.qty.find((node) => node.dataset.lootId === 'b').disabled, false, 'other rows stay usable');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(plain(calls), [
    ['updateLoot', 'run-1', 'a', { quantity: 7 }],
    ['announce', 'sessions.lootQuantityChanged|Divine Orb|7'],
    ['refresh', { includeSessions: true, immediate: true }]
  ]);
  assert.equal(state.selectedSession, context.nextSession);
  assert.equal(state.sessionLootBusyId, null);
  assert.match(elements.sessionDrawerLoot.innerHTML, /value="7" data-loot-id="a"/);
  assert.equal(nodes.qty.find((node) => node.dataset.lootId === 'a').focused, true);
});

test('a box committed by Tab leaves focus on the control the player tabbed to', async () => {
  const { context, nodes, calls } = createDrawer({ session: sessionWith(LOOT), editing: true });
  context.renderSessionDrawer();
  context.nextSession = sessionWith(LOOT.map((loot) => (loot.id === 'a' ? { ...loot, quantity: 7 } : loot)));
  const box = nodes.qty.find((node) => node.dataset.lootId === 'a');
  box.value = '7';

  // During focusout, focus has not reached the next control yet; relatedTarget names it.
  context.handleSessionLootChange({ type: 'focusout', target: box, relatedTarget: nodes.qty.find((node) => node.dataset.lootId === 'b') });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(plain(calls)[0], ['updateLoot', 'run-1', 'a', { quantity: 7 }]);
  assert.equal(nodes.qty.find((node) => node.dataset.lootId === 'b').focused, true);
  assert.equal(nodes.qty.find((node) => node.dataset.lootId === 'a').focused, false);
});

test('Enter commits a box and keeps focus on it; other keys do nothing', async () => {
  const { context, nodes, calls } = createDrawer({ session: sessionWith(LOOT), editing: true });
  context.renderSessionDrawer();
  context.nextSession = sessionWith(LOOT.map((loot) => (loot.id === 'a' ? { ...loot, quantity: 8 } : loot)));
  const box = nodes.qty.find((node) => node.dataset.lootId === 'a');
  box.value = '8';
  let prevented = 0;

  context.handleSessionLootKeydown({ key: 'ArrowUp', target: box, preventDefault: () => { prevented += 1; } });
  assert.deepEqual(plain(calls), []);
  context.document.activeElement = box;
  context.handleSessionLootKeydown({ key: 'Enter', target: box, preventDefault: () => { prevented += 1; } });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(prevented, 1);
  assert.deepEqual(plain(calls)[0], ['updateLoot', 'run-1', 'a', { quantity: 8 }]);
  assert.equal(nodes.qty.find((node) => node.dataset.lootId === 'a').focused, true);
});

test('a box committed while another row saves shows its stored quantity again', async () => {
  const { context, state, nodes, calls } = createDrawer({ session: sessionWith(LOOT), editing: true });
  context.renderSessionDrawer();
  state.sessionLootBusyId = 'a';
  const other = nodes.qty.find((node) => node.dataset.lootId === 'b');
  other.value = '9';

  context.handleSessionLootChange({ type: 'focusout', target: other, relatedTarget: null });

  assert.equal(other.value, '2');
  assert.deepEqual(plain(calls), []);
});

test('a price update redraw keeps the number being typed and the focus on its box', () => {
  const { context, state, nodes, calls } = createDrawer({ session: sessionWith(LOOT), editing: true });
  context.renderSessionDrawer();
  const box = nodes.qty.find((node) => node.dataset.lootId === 'b');
  box.value = '25';
  context.document.activeElement = box;

  context.redrawSessionLoot();

  const redrawn = nodes.qty.find((node) => node.dataset.lootId === 'b');
  assert.notEqual(redrawn, box, 'the rows were rebuilt');
  assert.equal(redrawn.value, '25');
  assert.equal(redrawn.focused, true);
  // The rebuild's focusout on the old box is not a commit of the half-typed number.
  assert.deepEqual(plain(calls), []);
  assert.equal(state.sessionLootRedrawing, false);
});

test('a rebuild from the disarm timer, Escape or the toggle does not save a half-typed number', () => {
  const { context, state, nodes, calls, timers } = createDrawer({ session: sessionWith(LOOT), editing: true });
  context.renderSessionDrawer();
  context.handleSessionLootClick({ target: fakeNode({ className: 'session-drawer-loot-remove', lootId: 'a' }) });
  const typeInto = (lootId, value) => {
    const box = nodes.qty.find((node) => node.dataset.lootId === lootId);
    box.value = value;
    context.document.activeElement = box;
  };

  typeInto('b', '1');
  timers.at(-1).callback();
  context.handleSessionLootClick({ target: fakeNode({ className: 'session-drawer-loot-remove', lootId: 'a' }) });
  typeInto('b', '1');
  context.handleSessionDrawerKeydown({ key: 'Escape' });
  typeInto('b', '1');
  context.handleSessionLootEditToggle();

  assert.deepEqual(plain(calls), []);
  assert.equal(state.sessionLootEditing, false);
});

test('a remove confirm while another row saves waits, keeping the row armed', async () => {
  const { context, state, calls } = createDrawer({ session: sessionWith(LOOT), editing: true, armedId: 'b' });
  context.renderSessionDrawer();
  state.sessionLootBusyId = 'a';

  context.handleSessionLootClick({ target: fakeNode({ className: 'session-drawer-loot-remove', lootId: 'b' }) });

  assert.equal(state.sessionLootArmedId, 'b');
  assert.deepEqual(plain(calls), []);
});

test('a second change is ignored while one is running', async () => {
  const { context, state, calls } = createDrawer({ session: sessionWith(LOOT), editing: true });
  context.nextSession = sessionWith(LOOT);

  context.handleSessionLootChange({ target: fakeNode({ className: 'session-drawer-loot-qty', lootId: 'a', value: '5' }) });
  context.handleSessionLootChange({ target: fakeNode({ className: 'session-drawer-loot-qty', lootId: 'b', value: '9' }) });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(calls.filter(([name]) => name === 'updateLoot').length, 1);
  assert.equal(state.sessionLootBusyId, null);
});

test('the first click on remove arms the row and the second one removes it', async () => {
  const { context, state, nodes, calls, timers, elements } = createDrawer({ session: sessionWith(LOOT), editing: true });
  context.renderSessionDrawer();
  context.nextSession = sessionWith(LOOT.filter((loot) => loot.id !== 'a'));

  const remove = () => fakeNode({ className: 'session-drawer-loot-remove', lootId: 'a' });
  context.handleSessionLootClick({ target: remove() });

  assert.equal(state.sessionLootArmedId, 'a');
  assert.equal(timers.at(-1).ms, 4000);
  assert.match(elements.sessionDrawerLoot.innerHTML, /session-drawer-loot-remove is-armed"[^>]*data-loot-id="a"/);
  assert.equal(nodes.remove.find((node) => node.dataset.lootId === 'a').focused, true);
  assert.deepEqual(plain(calls), []);

  context.handleSessionLootClick({ target: remove() });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(plain(calls), [
    ['deleteLoot', 'run-1', 'a'],
    ['announce', 'sessions.lootRemoved|Divine Orb'],
    ['refresh', { includeSessions: true, immediate: true }]
  ]);
  assert.equal(state.sessionLootArmedId, null);
  assert.equal(state.selectedSession, context.nextSession);
  assert.doesNotMatch(elements.sessionDrawerLoot.innerHTML, /data-loot-id="a"/);
  // Focus moves to the next row's remove button.
  assert.equal(nodes.remove.find((node) => node.dataset.lootId === 'b').focused, true);
});

test('after removing the last row focus goes to the previous row, and with no editable row left to the close button', async () => {
  const { context, nodes, toggle } = createDrawer({ session: sessionWith(LOOT), editing: true });
  context.nextSession = sessionWith(LOOT.filter((loot) => loot.id !== 'c'));
  context.state.sessionLootArmedId = 'c';
  context.handleSessionLootClick({ target: fakeNode({ className: 'session-drawer-loot-remove', lootId: 'c' }) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(nodes.remove.find((node) => node.dataset.lootId === 'b').focused, true);

  const only = createDrawer({ session: sessionWith([LOOT[0], LOOT[3]]), editing: true });
  only.context.nextSession = sessionWith([LOOT[3]]);
  only.state.sessionLootArmedId = 'a';
  only.context.handleSessionLootClick({ target: fakeNode({ className: 'session-drawer-loot-remove', lootId: 'a' }) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(only.state.sessionLootEditing, false, 'no editable entry is left');
  // The toggle is hidden with nothing left to edit, so focus lands on the close button instead.
  assert.equal(only.toggle.classList.contains('hidden'), true);
  assert.equal(only.toggle.focused, false);
  assert.equal(only.elements.sessionDrawerClose.focused, true);
  assert.equal(toggle.focused, false);
});

test('an armed remove disarms by itself after four seconds', () => {
  const { context, state, timers, elements } = createDrawer({ session: sessionWith(LOOT), editing: true });
  context.renderSessionDrawer();

  context.handleSessionLootClick({ target: fakeNode({ className: 'session-drawer-loot-remove', lootId: 'a' }) });
  assert.equal(state.sessionLootArmedId, 'a');
  timers.at(-1).callback();

  assert.equal(state.sessionLootArmedId, null);
  assert.doesNotMatch(elements.sessionDrawerLoot.innerHTML, /is-armed/);
});

test('arming another row disarms the first', () => {
  const { context, state, timers, elements } = createDrawer({ session: sessionWith(LOOT), editing: true });
  context.renderSessionDrawer();

  context.handleSessionLootClick({ target: fakeNode({ className: 'session-drawer-loot-remove', lootId: 'a' }) });
  context.handleSessionLootClick({ target: fakeNode({ className: 'session-drawer-loot-remove', lootId: 'b' }) });

  assert.equal(state.sessionLootArmedId, 'b');
  assert.equal(elements.sessionDrawerLoot.innerHTML.match(/is-armed/g).length, 1);
  assert.equal(timers[0], null, 'the first row timer is cancelled');
});

test('Escape disarms an armed remove without closing the drawer, and closes it otherwise', () => {
  const { context, state, elements } = createDrawer({ session: sessionWith(LOOT), editing: true });
  context.renderSessionDrawer();
  context.handleSessionLootClick({ target: fakeNode({ className: 'session-drawer-loot-remove', lootId: 'a' }) });

  context.handleSessionDrawerKeydown({ key: 'Escape' });

  assert.equal(state.sessionLootArmedId, null);
  assert.ok(state.selectedSession, 'the drawer stays open');
  assert.doesNotMatch(elements.sessionDrawerLoot.innerHTML, /is-armed/);

  context.handleSessionDrawerKeydown({ key: 'Escape' });

  assert.equal(state.selectedSession, null);
  assert.equal(state.sessionLootEditing, false, 'closing leaves edit mode');
});

test('a failed change shows the error toast and puts the stored values back', async () => {
  const { context, state, calls, elements } = createDrawer({ session: sessionWith(LOOT), editing: true });
  context.window.electronAPI.updateLoot = async () => { throw new Error('disk full'); };
  context.renderSessionDrawer();

  context.handleSessionLootChange({ target: fakeNode({ className: 'session-drawer-loot-qty', lootId: 'a', value: '7' }) });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(plain(calls), [['toast', 'toast.lootUpdateError', 'friendly:disk full:toast.tryAgain', 'error']]);
  assert.equal(state.sessionLootBusyId, null);
  assert.equal(state.selectedSession.lootEntries[0].quantity, 3);
  assert.match(elements.sessionDrawerLoot.innerHTML, /value="3" data-loot-id="a"/);
  assert.doesNotMatch(elements.sessionDrawerLoot.innerHTML, /disabled/);
});

test('the toggle switches edit mode and drops an armed remove', () => {
  const { context, state, toggle } = createDrawer({ session: sessionWith(LOOT), armedId: 'a' });

  context.handleSessionLootEditToggle();
  assert.equal(state.sessionLootEditing, true);
  assert.equal(state.sessionLootArmedId, null);
  assert.equal(toggle.textContent, 'sessions.lootEditDone');

  context.handleSessionLootEditToggle();
  assert.equal(state.sessionLootEditing, false);
  assert.equal(toggle.textContent, 'sessions.lootEdit');
});

test('the drawer markup carries the toggle, and the listeners are wired once on the loot list', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
  const source = fs.readFileSync(appJsPath, 'utf8');

  assert.match(html, /<button type="button" id="session-drawer-loot-edit" class="btn btn-secondary btn-small hidden">/);
  assert.match(source, /sessionDrawerLoot\.addEventListener\('click', handleSessionLootClick\)/);
  assert.match(source, /sessionDrawerLoot\.addEventListener\('keydown', handleSessionLootKeydown\)/);
  assert.match(source, /sessionDrawerLoot\.addEventListener\('focusout', handleSessionLootChange\)/);
  assert.doesNotMatch(source, /sessionDrawerLoot\.addEventListener\('change'/, 'a spinner or arrow step must not save');
  assert.match(source, /if \(state\.selectedSession\) \{\s+redrawSessionLoot\(\);/);
});
