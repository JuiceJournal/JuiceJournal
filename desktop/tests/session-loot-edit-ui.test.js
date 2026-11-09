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
  const context = vm.createContext({
    console,
    // Loot art lookups are tested on their own; these tests draw without them.
    lootArtUrl: () => '',
    ensureLootArt() {},
    ensureLootArtForRows() {},
    clearLootArtMisses() {},
    applyCachedItemIcons() {},
    ...contextOverrides
  });
  for (const functionName of functionNames) {
    vm.runInContext(`${extractFunctionSource(source, functionName)};\nthis.${functionName} = ${functionName};`, context);
  }
  return context;
}

const DRAWER_FUNCTIONS = [
  'renderSessionDrawer',
  'sessionLootAddHTML',
  'handleSessionLootAddSubmit',
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
  'closeSessionDrawer',
  'parseCostAmount',
  'getSessionCostDivineRate',
  'sessionCostEditHTML',
  'getSessionCostControls',
  'handleSessionCostKeydown',
  'handleSessionCostChange',
  'handleSessionCostUnitChange',
  'changeSessionCost'
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
function createDrawer({ session, editing = false, armedId = null, overrides = {} } = {}) {
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
  // The cost boxes are parsed out of the summary the same way, and rebuilding it fires focusout on the one in focus.
  const costNodes = { input: null, unit: null };
  const attribute = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
  const summary = {
    _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(html) {
      const active = documentStub.activeElement;
      if (harness && active && (active === costNodes.input || active === costNodes.unit)) {
        harness.handleSessionCostChange({ type: 'focusout', target: active, relatedTarget: null });
      }
      this._html = html;
      const inputTag = html.match(/<input[^>]*session-drawer-cost-input[^>]*>/)?.[0];
      const selectMatch = html.match(/<select([^>]*session-drawer-cost-unit[^>]*)>([\s\S]*?)<\/select>/);
      costNodes.input = inputTag
        ? Object.assign(fakeNode({ className: 'session-drawer-cost-input', value: attribute(inputTag, 'value'), disabled: / disabled(?=[\s>])/.test(inputTag) }), {
          dataset: { baseline: attribute(inputTag, 'data-baseline'), unit: attribute(inputTag, 'data-unit') }
        })
        : null;
      costNodes.unit = selectMatch
        ? Object.assign(fakeNode({
          className: 'session-drawer-cost-unit',
          value: selectMatch[2].match(/<option value="([^"]+)" selected>/)?.[1],
          disabled: / disabled(?=[\s>])/.test(selectMatch[1])
        }), { options: [...selectMatch[2].matchAll(/<option value="([^"]+)"/g)].map(([, value]) => value) })
        : null;
    },
    contains: (node) => Boolean(node) && (node === costNodes.input || node === costNodes.unit),
    querySelector: (selector) => (selector.includes('input') ? costNodes.input : costNodes.unit)
  };
  const elements = {
    sessionDrawerTitle: { textContent: '' },
    sessionDrawerLootCount: { textContent: '' },
    sessionDrawerLootEdit: toggle,
    sessionDrawerSummary: summary,
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
      t: (key, values = {}) => `${key}${values.item !== undefined ? `|${values.item}` : ''}${values.count !== undefined ? `|${values.count}` : ''}${values.cost !== undefined ? `|${values.cost}` : ''}`,
      electronAPI: {
        updateLoot: async (...args) => { calls.push(['updateLoot', ...args]); return context.nextSession; },
        deleteLoot: async (...args) => { calls.push(['deleteLoot', ...args]); return context.nextSession; },
        updateSessionCost: async (...args) => { calls.push(['updateSessionCost', ...args]); return context.nextSession; }
      }
    },
    getProfitCurrencyRates: () => null,
    formatAdaptiveProfitText: (value) => `${value}c`,
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
    nextSession: null,
    ...overrides
  });
  harness = context;
  return { context, state, elements, nodes, costNodes, toggle, calls, timers };
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

test('a run whose loot has no ids keeps Edit for its cost, with the loot rows read-only', () => {
  const { context, state, toggle, elements } = createDrawer({ session: sessionWith([LOOT[3]]), editing: true });

  context.renderSessionDrawer();

  assert.equal(toggle.classList.contains('hidden'), false);
  assert.equal(state.sessionLootEditing, true);
  assert.equal(toggle.textContent, 'sessions.lootEditDone');
  assert.doesNotMatch(elements.sessionDrawerLoot.innerHTML, /session-drawer-loot-qty|session-drawer-loot-remove/);
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
  // The run's cost can still be changed, so editing stays on and focus goes to the toggle, not the close button.
  assert.equal(only.state.sessionLootEditing, true);
  assert.equal(only.toggle.classList.contains('hidden'), false);
  assert.equal(only.toggle.focused, true);
  assert.equal(only.elements.sessionDrawerClose.focused, false);
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

test('drawer rows pass the stored art, else the looked-up art, to the item slot, and ask for the art of rows with none', () => {
  const slots = [];
  const asks = [];
  const art = { 'Old Entry': 'https://web.poecdn.com/gen/image/old.png' };
  const session = sessionWith([
    { id: 'a', itemName: 'Divine Orb', quantity: 1, chaosValue: 1, icon: 'https://web.poecdn.com/gen/image/stored.png', createdAt: '2026-10-21T12:03:00.000Z' },
    { id: 'b', itemName: 'Old Entry', quantity: 1, chaosValue: 1, createdAt: '2026-10-21T12:02:00.000Z' },
    { id: 'c', itemName: 'Nothing Known', quantity: 1, chaosValue: 1, createdAt: '2026-10-21T12:01:00.000Z' }
  ]);
  const { context, elements } = createDrawer({
    session,
    overrides: {
      lootArtUrl: (loot) => loot.icon || art[loot.itemName] || '',
      itemSlotHTML: (itemName, poeVersion, options) => { slots.push([itemName, poeVersion, options.iconUrl]); return '<span class="item-slot"></span>'; },
      applyCachedItemIcons: (container) => asks.push(['icons', container]),
      ensureLootArt: (names, poeVersion, redraw) => asks.push(['art', names, poeVersion, redraw])
    }
  });

  context.renderSessionDrawer();

  assert.deepEqual(slots, [
    ['Divine Orb', 'poe1', 'https://web.poecdn.com/gen/image/stored.png'],
    ['Old Entry', 'poe1', 'https://web.poecdn.com/gen/image/old.png'],
    ['Nothing Known', 'poe1', '']
  ]);
  assert.equal(asks[0][0], 'icons');
  assert.equal(asks[0][1], elements.sessionDrawerLoot);
  assert.deepEqual(plain(asks[1].slice(0, 3)), ['art', ['Old Entry', 'Nothing Known'], 'poe1']);
});

test('art that arrives later redraws the drawer through redrawSessionLoot, and only for the session still open', () => {
  let redraw = null;
  const { context, state } = createDrawer({
    session: sessionWith(LOOT),
    overrides: { ensureLootArt: (names, poeVersion, callback) => { redraw = callback; } }
  });
  context.renderSessionDrawer();
  const renders = [];
  context.renderSessionDrawer = (options) => renders.push(options);

  redraw();
  assert.deepEqual(plain(renders), [{ keepForm: true }]);

  // A loot edit replaces the session object; it is still the same run.
  state.selectedSession = { ...state.selectedSession };
  redraw();
  assert.equal(renders.length, 2);

  state.selectedSession = { ...state.selectedSession, id: 'another-run' };
  redraw();
  state.selectedSession = null;
  redraw();
  assert.equal(renders.length, 2);
});

const withCost = (costChaos, extra = {}) => ({ ...sessionWith(LOOT), costChaos, ...extra });
const withRate = (divineChaos) => ({ getProfitCurrencyRates: () => ({ divineChaos }) });
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('edit mode turns the Cost fact into an amount box with a unit, and the Divine option needs a known rate', () => {
  const normal = createDrawer({ session: withCost(150) });
  normal.context.renderSessionDrawer();
  assert.doesNotMatch(normal.elements.sessionDrawerSummary.innerHTML, /session-drawer-cost-input/);
  assert.match(normal.elements.sessionDrawerSummary.innerHTML, /<dt>sessions\.cost<\/dt><dd>chaos:150<\/dd>/);

  const known = createDrawer({ session: withCost(150), editing: true, overrides: withRate(150) });
  known.context.renderSessionDrawer();
  assert.match(known.elements.sessionDrawerSummary.innerHTML, /value="150" data-baseline="150" data-unit="chaos" aria-label="sessions\.costAria"/);
  assert.match(known.elements.sessionDrawerSummary.innerHTML, /aria-label="sessions\.costUnitAria"/);
  assert.deepEqual(known.costNodes.unit.options, ['chaos', 'divine']);
  assert.equal(known.costNodes.unit.value, 'chaos');

  const unknown = createDrawer({ session: withCost(150), editing: true });
  unknown.context.renderSessionDrawer();
  assert.deepEqual(unknown.costNodes.unit.options, ['chaos'], 'no Divine option while the rate is unknown');

  known.context.handleSessionLootEditToggle();
  assert.equal(known.costNodes.input, null, 'Done puts the plain value back');
});

test('a run whose Divine cost found no price says what was not counted, until a cost is set', () => {
  const pending = { costPending: { amount: 2, unit: 'divine' } };
  const finished = createDrawer({ session: withCost(0, pending) });
  finished.context.renderSessionDrawer();
  assert.match(finished.elements.sessionDrawerSummary.innerHTML, /<dd>chaos:0<span class="session-drawer-cost-note">sessions\.costNotCounted<\/span><\/dd>/);

  const running = createDrawer({ session: withCost(0, { ...pending, status: 'active', startedAt: '2026-11-09T10:00:00.000Z' }) });
  running.context.renderSessionDrawer();
  assert.match(running.elements.sessionDrawerSummary.innerHTML, /session-drawer-cost-note">dashboard\.costPendingDivine</);

  // Edit swaps the note for the cost box, and a cost set by hand needs no note.
  const editing = createDrawer({ session: withCost(0, pending), editing: true });
  editing.context.renderSessionDrawer();
  assert.doesNotMatch(editing.elements.sessionDrawerSummary.innerHTML, /session-drawer-cost-note/);
  const settled = createDrawer({ session: withCost(150, pending) });
  settled.context.renderSessionDrawer();
  assert.doesNotMatch(settled.elements.sessionDrawerSummary.innerHTML, /session-drawer-cost-note/);
});

test('the box shows the cost in the unit picked, to four decimals for Divine', () => {
  const { context, state, costNodes } = createDrawer({ session: withCost(100), editing: true, overrides: withRate(150) });
  state.sessionCostUnit = 'divine';
  context.renderSessionDrawer();
  assert.equal(costNodes.input.value, '0.6667');
  assert.equal(costNodes.input.dataset.unit, 'divine');
  assert.equal(costNodes.unit.value, 'divine');

  // Without a rate the stored Divine pick cannot apply.
  const noRate = createDrawer({ session: withCost(100), editing: true });
  noRate.state.sessionCostUnit = 'divine';
  noRate.context.renderSessionDrawer();
  assert.equal(noRate.costNodes.input.value, '100');
  assert.equal(noRate.costNodes.unit.value, 'chaos');
});

test('a cost box that loses focus saves the cost in chaos, the drawer follows and the app refreshes', async () => {
  const { context, state, costNodes, calls } = createDrawer({ session: withCost(50), editing: true });
  context.renderSessionDrawer();
  context.nextSession = withCost(200.5);
  context.document.activeElement = costNodes.input;

  costNodes.input.value = ' 200,5 ';
  context.handleSessionCostChange({ type: 'focusout', target: costNodes.input, relatedTarget: null });
  assert.equal(state.sessionCostBusy, true);
  assert.equal(costNodes.input.disabled, true, 'the box locks while main writes');
  await tick();

  assert.deepEqual(plain(calls), [
    ['updateSessionCost', 'run-1', 200.5],
    ['announce', 'sessions.costChanged|200.5c'],
    ['refresh', { includeSessions: true, immediate: true }]
  ]);
  assert.equal(state.selectedSession, context.nextSession);
  assert.equal(state.sessionCostBusy, false);
  assert.equal(costNodes.input.value, '200.5');
  assert.equal(costNodes.input.disabled, false);
  assert.equal(costNodes.input.focused, true, 'focus stays on the box');
});

test('Enter commits the cost and keeps focus on the box; other keys do nothing', async () => {
  const { context, costNodes, calls } = createDrawer({ session: withCost(50), editing: true });
  context.renderSessionDrawer();
  context.nextSession = withCost(75);
  context.document.activeElement = costNodes.input;
  costNodes.input.value = '75';

  let prevented = false;
  context.handleSessionCostKeydown({ key: 'Tab', target: costNodes.input, preventDefault() { prevented = true; } });
  assert.deepEqual(plain(calls), []);
  context.handleSessionCostKeydown({ key: 'Enter', target: costNodes.input, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  await tick();

  assert.deepEqual(plain(calls)[0], ['updateSessionCost', 'run-1', 75]);
  assert.equal(costNodes.input.focused, true);
});

test('an amount read in Divine is converted with the rate and saved in chaos', async () => {
  const { context, costNodes, calls } = createDrawer({ session: withCost(50), editing: true, overrides: withRate(150) });
  context.renderSessionDrawer();
  context.nextSession = withCost(300);
  costNodes.unit.value = 'divine';
  costNodes.input.value = '2';

  context.handleSessionCostChange({ type: 'focusout', target: costNodes.unit, relatedTarget: null });
  await tick();

  assert.deepEqual(plain(calls)[0], ['updateSessionCost', 'run-1', 300]);
});

test('a cost that is not a number from 0 to 10000000, or is unchanged, goes back and makes no call', () => {
  const { context, costNodes, calls } = createDrawer({ session: withCost(150), editing: true, overrides: withRate(150) });
  context.renderSessionDrawer();

  for (const typed of ['abc', '-5', '1e3', '1.2.3', '10000001', '150', '150.00', '150,0']) {
    costNodes.input.value = typed;
    context.handleSessionCostChange({ type: 'focusout', target: costNodes.input, relatedTarget: null });
    assert.equal(costNodes.input.value, '150', `"${typed}" shows the stored cost again`);
  }
  // In Divine the cap follows the rate: 10000000 chaos is 66666.6667 Divine.
  costNodes.unit.value = 'divine';
  costNodes.input.value = '66667';
  context.handleSessionCostChange({ type: 'focusout', target: costNodes.input, relatedTarget: null });
  assert.equal(costNodes.input.value, '150');
  assert.deepEqual(plain(calls), []);
});

test('an empty box saves no cost, as zero', async () => {
  const { context, costNodes, calls } = createDrawer({ session: withCost(150), editing: true });
  context.renderSessionDrawer();
  context.nextSession = withCost(0);
  costNodes.input.value = '';
  context.handleSessionCostChange({ type: 'focusout', target: costNodes.input, relatedTarget: null });
  await tick();
  // An empty box is the stored cost's own value being cleared, which main takes as zero.
  assert.deepEqual(plain(calls)[0], ['updateSessionCost', 'run-1', 0]);
});

test('moving from the amount to its unit does not commit, and leaving the unit does', async () => {
  const { context, costNodes, calls } = createDrawer({ session: withCost(50), editing: true, overrides: withRate(150) });
  context.renderSessionDrawer();
  context.nextSession = withCost(150);
  costNodes.input.value = '1';
  costNodes.unit.value = 'divine';

  context.handleSessionCostChange({ type: 'focusout', target: costNodes.input, relatedTarget: costNodes.unit });
  assert.deepEqual(plain(calls), []);
  context.handleSessionCostChange({ type: 'focusout', target: costNodes.unit, relatedTarget: null });
  await tick();
  assert.deepEqual(plain(calls)[0], ['updateSessionCost', 'run-1', 150]);
});

test('switching the unit of an untouched box shows the same cost in it, and a typed amount stays as typed', () => {
  const { context, state, costNodes, calls } = createDrawer({ session: withCost(150), editing: true, overrides: withRate(150) });
  context.renderSessionDrawer();
  context.document.activeElement = costNodes.unit;

  costNodes.unit.value = 'divine';
  context.handleSessionCostUnitChange({ target: costNodes.unit });
  assert.equal(state.sessionCostUnit, 'divine');
  assert.equal(costNodes.input.value, '1');
  assert.equal(costNodes.unit.value, 'divine');
  assert.equal(costNodes.unit.focused, true, 'focus stays on the unit');
  assert.deepEqual(plain(calls), [], 'a unit switch alone saves nothing');

  costNodes.input.value = '3';
  const typed = costNodes.input;
  costNodes.unit.value = 'chaos';
  context.handleSessionCostUnitChange({ target: costNodes.unit });
  assert.equal(state.sessionCostUnit, 'chaos');
  assert.equal(costNodes.input, typed, 'the drawer is not redrawn');
  assert.equal(costNodes.input.value, '3');
});

test('a redraw keeps the cost being typed and the focus on its box, and saves nothing', () => {
  const { context, costNodes, calls } = createDrawer({ session: withCost(50), editing: true });
  context.renderSessionDrawer();
  context.document.activeElement = costNodes.input;
  costNodes.input.value = '77';

  context.redrawSessionLoot();

  assert.equal(costNodes.input.value, '77');
  assert.equal(costNodes.input.focused, true);
  assert.deepEqual(plain(calls), []);
});

test('a failed cost change shows the error toast and puts the stored cost back', async () => {
  const { context, state, costNodes, calls } = createDrawer({ session: withCost(50), editing: true });
  context.renderSessionDrawer();
  context.window.electronAPI.updateSessionCost = async () => { throw new Error('Cost must be a number from 0 to 10000000'); };
  context.document.activeElement = costNodes.input;
  costNodes.input.value = '99';

  context.handleSessionCostChange({ type: 'focusout', target: costNodes.input, relatedTarget: null });
  await tick();

  assert.deepEqual(plain(calls), [['toast', 'toast.costUpdateError', 'friendly:Cost must be a number from 0 to 10000000:toast.tryAgain', 'error']]);
  assert.equal(state.sessionCostBusy, false);
  assert.equal(state.selectedSession.costChaos, 50);
  assert.equal(costNodes.input.value, '50');
  assert.equal(costNodes.input.disabled, false);
});

test('a cost change and a loot change do not run at the same time', async () => {
  const { context, state, costNodes, nodes, calls } = createDrawer({ session: withCost(50), editing: true });
  context.renderSessionDrawer();
  let finish;
  context.window.electronAPI.updateSessionCost = (...args) => {
    calls.push(['updateSessionCost', ...args]);
    return new Promise((resolve) => { finish = resolve; });
  };
  costNodes.input.value = '60';
  context.handleSessionCostChange({ type: 'focusout', target: costNodes.input, relatedTarget: null });
  assert.equal(state.sessionCostBusy, true);

  // A loot box committed meanwhile is ignored, and so is a second cost commit.
  const box = nodes.qty[0];
  box.value = '9';
  context.handleSessionLootChange({ type: 'focusout', target: box, relatedTarget: null });
  context.handleSessionCostChange({ type: 'focusout', target: costNodes.input, relatedTarget: null });
  assert.deepEqual(plain(calls), [['updateSessionCost', 'run-1', 60]]);

  context.nextSession = withCost(60);
  finish(context.nextSession);
  await tick();
  assert.equal(state.sessionCostBusy, false);

  // And while a loot row saves, a cost commit shows the stored cost again.
  state.sessionLootBusyId = 'a';
  costNodes.input.value = '70';
  context.handleSessionCostChange({ type: 'focusout', target: costNodes.input, relatedTarget: null });
  assert.equal(costNodes.input.value, '60');
});

test('the cost of the running map reaches the Dashboard card too', async () => {
  const running = withCost(50, { status: 'active' });
  const updates = [];
  const { context, state, costNodes } = createDrawer({
    session: running,
    editing: true,
    overrides: { updateActiveSessionUI: () => updates.push('card') }
  });
  state.currentSession = { ...running, lootPending: true };
  context.renderSessionDrawer();
  context.nextSession = withCost(80, { status: 'active' });
  costNodes.input.value = '80';

  context.handleSessionCostChange({ type: 'focusout', target: costNodes.input, relatedTarget: null });
  await tick();

  assert.equal(state.currentSession.costChaos, 80);
  assert.equal(state.currentSession.lootPending, true, 'what only the renderer knows stays');
  assert.deepEqual(updates, ['card']);
});

test('the cost boxes are wired once on the drawer summary, and use the app strings', () => {
  const source = fs.readFileSync(appJsPath, 'utf8');
  assert.match(source, /sessionDrawerSummary\.addEventListener\('keydown', handleSessionCostKeydown\)/);
  assert.match(source, /sessionDrawerSummary\.addEventListener\('focusout', handleSessionCostChange\)/);
  assert.match(source, /sessionDrawerSummary\.addEventListener\('change', handleSessionCostUnitChange\)/);
  assert.match(source, /onSessionCostUpdated\(\(session\) =>/);
  const stringsSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'translations.js'), 'utf8');
  for (const key of ['sessions.costAria', 'sessions.costUnitAria', 'sessions.costChanged', 'sessions.costNotCounted', 'toast.costUpdateError']) {
    assert.equal(stringsSource.split(`'${key}'`).length - 1, 2, `${key} has an en and a tr string`);
  }
});

test('a run with unread loot says so, and edit mode adds a row for adding an item by hand', () => {
  const unread = { ...sessionWith(LOOT), lootUnread: true };
  const viewing = createDrawer({ session: unread });
  viewing.context.renderSessionDrawer();
  assert.match(viewing.elements.sessionDrawerLoot.innerHTML, /<p class="session-drawer-loot-note">sessions\.lootUnread<\/p>/);
  assert.doesNotMatch(viewing.elements.sessionDrawerLoot.innerHTML, /data-session-loot-add/);

  const editing = createDrawer({ session: unread, editing: true });
  editing.state.sessionLootAddDraft = { name: 'Essence <of> Ruin', quantity: '2' };
  editing.context.renderSessionDrawer();
  const html = editing.elements.sessionDrawerLoot.innerHTML;
  assert.match(html, /data-session-loot-add/);
  assert.match(html, /name="itemName"[^>]*value="Essence &lt;of&gt; Ruin"/);
  assert.match(html, /name="quantity"[^>]*value="2"/);

  // A run without loot can still get some.
  const empty = createDrawer({ session: { ...sessionWith([]), lootUnread: true }, editing: true });
  empty.context.renderSessionDrawer();
  assert.match(empty.elements.sessionDrawerLoot.innerHTML, /data-session-loot-add[\s\S]*sessions\.detailEmptyLoot/);
});

test('adding an item by hand sends it to main, clears the row and says it was added; a bad row says why', async () => {
  const run = sessionWith(LOOT);
  const drawer = createDrawer({ session: run, editing: true });
  drawer.elements.sessionDrawerLoot.querySelector = () => null;
  const form = (name, quantity) => ({ elements: { itemName: { value: name }, quantity: { value: quantity } } });
  const submit = (target) => drawer.context.handleSessionLootAddSubmit({ target: { closest: () => target }, preventDefault() {} });
  const added = [];
  drawer.context.window.electronAPI.addSessionLoot = async (sessionId, item) => {
    added.push([sessionId, item]);
    return { ...run, lootEntries: [{ id: 'hand-1', itemName: item.itemName, quantity: item.quantity, chaosValue: 30 }, ...run.lootEntries] };
  };

  await submit(form('', '1'));
  assert.equal(drawer.state.sessionLootAddError, 'sessions.lootAddInvalid');
  assert.deepEqual(added, []);

  await submit(form('Essence of Ruin', '2'));
  assert.deepEqual(JSON.parse(JSON.stringify(added)), [['run-1', { itemName: 'Essence of Ruin', quantity: 2 }]]);
  assert.equal(drawer.state.selectedSession.lootEntries[0].id, 'hand-1');
  assert.deepEqual(JSON.parse(JSON.stringify(drawer.state.sessionLootAddDraft)), { name: '', quantity: '1' });
  assert.equal(drawer.state.sessionLootAddError, null);
  assert.ok(drawer.calls.some(([kind, text]) => kind === 'announce' && text === 'sessions.lootAdded|Essence of Ruin'));

  drawer.context.window.electronAPI.addSessionLoot = async () => { throw new Error('nope'); };
  await submit(form('Essence of Ruin', '1'));
  assert.equal(drawer.state.sessionLootAddError, 'toast.lootAddError');
  assert.equal(drawer.state.sessionLootAddBusy, false);
});
