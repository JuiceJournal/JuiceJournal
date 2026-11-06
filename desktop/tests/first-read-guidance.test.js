const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const mainJs = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

// The source of one top-level function, found by its signature and matched braces.
function extractFunction(source, name) {
  const start = Math.max(source.indexOf(`async function ${name}(`), source.indexOf(`\nfunction ${name}(`) + 1);
  assert.ok(start > 0, `${name}() not found`);
  const open = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return assert.fail(`${name}() is not closed`);
}

function loadFunctions(names, globals) {
  const context = vm.createContext({ console, ...globals });
  for (const name of names) {
    vm.runInContext(`${extractFunction(mainJs, name)}\nthis.${name} = ${name};`, context);
  }
  return context;
}

const STRINGS = {
  inventoryStatus_firstRead: 'Open your inventory once. Press I, so your next map counts.',
  inventoryStatus_saved: 'Inventory noted. Your next map counts from here.',
  inventoryStatus_noGain: 'No new loot found.',
  inventoryStatusTitle: 'Inventory'
};

function load(overrides = {}) {
  const log = { notifications: [], overlayUpdates: 0, timers: [], cleared: [], notes: [] };
  const context = loadFunctions(['maybeShowFirstReadNudge', 'showInventoryStatus', 'handleMapEntered', 'createInventoryWatcher'], {
    INVENTORY_READING_CARD_MS: 1200,
    INVENTORY_STATUS_CARD_MS: 4000,
    INVENTORY_FIRST_READ_CARD_MS: 20000,
    FIRST_READ_NUDGE_DEBOUNCE_MS: 3000,
    firstReadNudge: { characterKey: null, firstAt: 0, lastAt: 0 },
    firstReadNudgeShown: new Set(),
    overlayInventoryStatus: null,
    overlayInventoryStatusTimer: null,
    overlayStartMapPromptState: null,
    overlayCharacterPromptState: null,
    overlayMapResultState: null,
    overlayEnabled: true,
    isOverlayEnabled: () => context.overlayEnabled,
    t: (key) => STRINGS[key],
    showNotification: (title, body) => log.notifications.push([title, body]),
    updateOverlayWindow: () => { log.overlayUpdates += 1; },
    setTimeout: (fn, ms) => { log.timers.push({ fn, ms }); return log.timers.length; },
    clearTimeout: (id) => log.cleared.push(id),
    inventoryWatcher: { mapEntered() {} },
    publishRuntimeSessionEvent() {},
    InventoryWatcher: class { constructor(deps) { log.deps = deps; } },
    isGameWindowInFront: () => true,
    gameDetector: null,
    logParser: null,
    getGameWindowRect: () => null,
    win32Probe: {},
    overlayCharacterState: null,
    listPricedInventoryItems: () => ({ complete: true, items: [] }),
    getInventoryIconPath: () => null,
    loadInventoryArt: () => null,
    addInventoryLoot: async () => {},
    store: { get: () => undefined },
    getActiveProfile: () => ({ id: 'p1' }),
    noteInventoryRead: (kind) => log.notes.push(kind),
    setInventoryReadBlocked() {},
    ...overrides
  });
  return { context, log };
}

// Reports once a second, as the watcher's timer does.
function report(context, characterKey, fromMs, toMs) {
  for (let at = fromMs; at <= toMs; at += 1000) context.maybeShowFirstReadNudge(characterKey, at);
}

test('the hint shows only after the condition has held for 3 seconds', () => {
  const { context } = load();

  report(context, 'poe2:c1', 0, 2000);
  assert.equal(context.overlayInventoryStatus, null);
  context.maybeShowFirstReadNudge('poe2:c1', 3000);
  assert.equal(context.overlayInventoryStatus.kind, 'firstRead');
  assert.equal(context.overlayInventoryStatus.primaryLine, 'Open your inventory once');
  assert.equal(context.overlayInventoryStatus.secondaryLine, 'Press I, so your next map counts.');
});

test('the hint stays up for 20 seconds and sends no notification, with the overlay on or off', () => {
  const { context, log } = load();
  report(context, 'poe2:c1', 0, 3000);

  assert.equal(log.timers.at(-1).ms, 20000);
  log.timers.at(-1).fn();
  assert.equal(context.overlayInventoryStatus, null);

  context.showInventoryStatus('firstRead');
  assert.deepEqual(log.notifications, []);
  context.overlayEnabled = false;
  context.showInventoryStatus('firstRead');
  assert.deepEqual(log.notifications, []);
  context.showInventoryStatus('noGain');
  assert.equal(log.notifications.length, 1, 'other kinds still notify when the overlay is off');
});

test('a gap of more than 3 seconds between reports restarts the wait', () => {
  const { context } = load();

  report(context, 'poe2:c1', 0, 2000);
  context.maybeShowFirstReadNudge('poe2:c1', 5500);
  context.maybeShowFirstReadNudge('poe2:c1', 7000);
  assert.equal(context.overlayInventoryStatus, null, 'the wait restarted at 5500');
  context.maybeShowFirstReadNudge('poe2:c1', 8500);
  assert.equal(context.overlayInventoryStatus.kind, 'firstRead');
});

test('the hint shows once per character, and a second character gets its own', () => {
  const { context } = load();

  report(context, 'poe2:c1', 0, 3000);
  context.overlayInventoryStatus = null;
  report(context, 'poe2:c1', 4000, 12000);
  assert.equal(context.overlayInventoryStatus, null);

  report(context, 'poe2:c2', 13000, 16000);
  assert.equal(context.overlayInventoryStatus.kind, 'firstRead');
});

test('the hint waits while the overlay is off or a prompt or a result card is showing', () => {
  for (const blocker of [
    { overlayEnabled: false },
    { overlayStartMapPromptState: { mapName: 'Strand' } },
    { overlayCharacterPromptState: { characters: [] } },
    { overlayMapResultState: { visible: true, result: { netProfit: 1 } } }
  ]) {
    const { context } = load();
    Object.assign(context, blocker);
    report(context, 'poe2:c1', 0, 6000);
    assert.equal(context.overlayInventoryStatus, null, JSON.stringify(blocker));

    // Once the blocker is gone the wait still has to run its 3 seconds.
    for (const key of Object.keys(blocker)) context[key] = key === 'overlayEnabled' ? true : null;
    context.maybeShowFirstReadNudge('poe2:c1', 7000);
    context.maybeShowFirstReadNudge('poe2:c1', 9000);
    assert.equal(context.overlayInventoryStatus, null, JSON.stringify(blocker));
    context.maybeShowFirstReadNudge('poe2:c1', 10000);
    assert.equal(context.overlayInventoryStatus?.kind, 'firstRead', JSON.stringify(blocker));
  }

  // A result card that is not visible or has no result does not block.
  const { context } = load({ overlayMapResultState: { visible: false, result: null } });
  report(context, 'poe2:c1', 0, 3000);
  assert.equal(context.overlayInventoryStatus?.kind, 'firstRead');
});

test('watcher reports reach the hint, and a saved read replaces it without needsBaseline reaching the Dashboard line', () => {
  const { context, log } = load();
  context.createInventoryWatcher();
  const { onRead } = log.deps;

  onRead('needsBaseline', { characterKey: 'poe2:c1' });
  assert.deepEqual(log.notes, [], 'needsBaseline never reaches the Dashboard line');
  assert.equal(context.firstReadNudge.characterKey, 'poe2:c1');

  context.overlayInventoryStatus = { kind: 'firstRead', primaryLine: 'x', secondaryLine: 'y' };
  onRead('saved');
  assert.deepEqual(log.notes, ['saved']);
  assert.equal(context.overlayInventoryStatus.kind, 'saved');
  assert.equal(context.overlayInventoryStatus.primaryLine, 'Inventory noted');

  // A saved read with no hint showing adds no card of its own; the hotkey's own status does.
  context.overlayInventoryStatus = null;
  onRead('saved');
  assert.equal(context.overlayInventoryStatus, null);
});

test('a map starting clears the hint and leaves other cards alone', async () => {
  const { context, log } = load();
  report(context, 'poe2:c1', 0, 3000);
  assert.equal(context.overlayInventoryStatus.kind, 'firstRead');

  await context.handleMapEntered({});
  assert.equal(context.overlayInventoryStatus, null);
  assert.ok(log.cleared.length > 0);

  context.overlayInventoryStatus = { kind: 'noGain', primaryLine: 'No new loot found.', secondaryLine: '' };
  await context.handleMapEntered({});
  assert.equal(context.overlayInventoryStatus.kind, 'noGain');
});

test('the main process words the hint in both languages', () => {
  assert.match(mainJs, /inventoryStatus_firstRead: 'Open your inventory once\. Press I, so your next map counts\.'/);
  assert.match(mainJs, /inventoryStatus_firstRead: 'Envanterini bir kez ac\. I tusuna bas, sonraki map sayilsin\.'/);
});
