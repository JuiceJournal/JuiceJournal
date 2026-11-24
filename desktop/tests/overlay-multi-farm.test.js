const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const farmTypeModel = require('../src/modules/farmTypeModel');
const overlayStateModel = require('../src/modules/overlayStateModel');

const desktopDir = path.join(__dirname, '..');
const mainSource = fs.readFileSync(path.join(desktopDir, 'main.js'), 'utf8').replace(/\r\n/g, '\n');
const MAX = farmTypeModel.FARM_COMBO_MAX_PARTS;

function plainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

/* ── The overlay's start card ── */

function createElement() {
  const attributes = {};
  const element = {
    textContent: '',
    hidden: false,
    disabled: false,
    value: '',
    dataset: {},
    children: [],
    listeners: {},
    setAttribute(name, value) { attributes[name] = String(value); },
    removeAttribute(name) { delete attributes[name]; },
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null; },
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name); },
    addEventListener(type, listener) { element.listeners[type] = listener; },
    replaceChildren(...nodes) { element.children = nodes; },
    append(...nodes) { element.children.push(...nodes); },
    appendChild(node) { element.children.push(node); return node; },
    insertAdjacentHTML() {},
    querySelectorAll: () => [],
    focus() {},
    blur() {}
  };
  return element;
}

const SELECTORS = [
  '[data-overlay-state]', '[data-overlay-kicker-label]', '[data-overlay-pin]', '[data-overlay-dismiss]', '[data-overlay-primary]',
  '[data-overlay-drops]', '[data-overlay-secondary]', '[data-overlay-meta]', '[data-overlay-start-form]', '[data-overlay-start-farm-types]',
  '[data-overlay-start-cost-note]', '[data-overlay-start-cost-input]', '[data-overlay-start-cost-units]', '[data-overlay-start-submit]',
  '[data-overlay-start-cancel]'
];

const COMBO_ID = 'custom-00000000-combo';
const OWN_ID = 'custom-00000000-temple';
const CUSTOM_FARM_TYPES = [
  { id: OWN_ID, label: 'Temple', color: 'red', icon: 'farm-crown', poeVersions: ['poe2'] },
  { id: COMBO_ID, label: 'Abyss + Breach', color: 'silver', icon: 'farm-star', poeVersions: ['poe2'], parts: ['abyss', 'breach'] }
];
const OPTIONS = [
  { id: COMBO_ID, label: 'Abyss + Breach', cost: '7c', costAmount: 7, costUnit: 'chaos' },
  { id: OWN_ID, label: 'Temple' },
  { id: 'abyss', label: 'Abyss', cost: '2c', costAmount: 2, costUnit: 'chaos' },
  { id: 'breach', label: 'Breach' },
  { id: 'ritual', label: 'Ritual' },
  { id: 'delirium', label: 'Delirium' }
];

// The real overlay.js and farm type model on a fake card whose chip row holds one button per option.
function loadStartCard({ farmTypeId = 'abyss' } = {}) {
  const elements = Object.fromEntries(SELECTORS.map((selector) => [selector, createElement()]));
  const window = { overlayStateModel, farmTypeModel };
  const context = vm.createContext({
    window,
    document: { readyState: 'complete', documentElement: {}, querySelector: (s) => elements[s] || null, querySelectorAll: () => [], createElement },
    Date: { now: () => 0 },
    setInterval: () => 1,
    clearInterval() {}
  });
  vm.runInContext(fs.readFileSync(path.join(desktopDir, 'src', 'modules', 'translations.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(desktopDir, 'src', 'overlay.js'), 'utf8'), context);

  const chipRow = elements['[data-overlay-start-farm-types]'];
  const chips = [{ id: '' }, ...OPTIONS].map((option) => {
    const button = createElement();
    button.setAttribute('data-farm-type-id', option.id);
    return button;
  });
  chipRow.querySelectorAll = () => chips;
  const calls = [];
  let answer = (payload) => ({ action: 'confirm', ...payload });
  window.electronAPI = {
    confirmStartMapPromptOverlay: async (payload) => { calls.push(plainJson(payload)); return answer(payload); },
    engageStartMapPromptOverlay: async () => true
  };
  window.JuiceOverlay.renderState({
    visibility: 'visible',
    mode: 'start-map-prompt',
    customFarmTypes: CUSTOM_FARM_TYPES,
    startMapPrompt: { mapName: 'Penitentiary', farmTypeId, poeVersion: 'poe2', createdAt: 1000, farmTypeOptions: OPTIONS }
  });
  const byId = (id) => chips.find((chip) => chip.getAttribute('data-farm-type-id') === id);
  return {
    input: elements['[data-overlay-start-cost-input]'],
    note: elements['[data-overlay-start-cost-note]'],
    calls,
    answerConfirm(next) { answer = next; },
    click(id) { chipRow.listeners.click({ target: { closest: () => byId(id) } }); },
    pressed: () => chips.filter((chip) => chip.getAttribute('aria-pressed') === 'true').map((chip) => chip.getAttribute('data-farm-type-id')),
    disabled: () => chips.filter((chip) => chip.disabled).map((chip) => chip.getAttribute('data-farm-type-id')),
    submit: () => elements['[data-overlay-start-form]'].listeners.submit({ preventDefault() {} }),
    settle: () => new Promise((resolve) => setImmediate(resolve))
  };
}

test('start card chips add up to the most a combo takes, in click order, and the extra plain chips wait', (t) => {
  t.after(() => farmTypeModel.setCustomFarmTypes([]));
  const card = loadStartCard();
  assert.deepEqual(card.pressed(), ['abyss']);
  assert.equal(card.input.value, '2', 'a single farm type keeps its own cost');

  card.click('ritual');
  assert.deepEqual(card.pressed(), ['abyss', 'ritual']);
  assert.equal(card.input.value, '', 'a new combo starts empty');
  assert.equal(card.note.textContent, 'Start Map saves these as one combined farm type.');

  const plain = ['abyss', 'ritual', OWN_ID, 'breach', 'delirium'];
  const picked = ['abyss', 'ritual'];
  while (picked.length < MAX) {
    const next = plain.find((id) => !picked.includes(id));
    card.click(next);
    picked.push(next);
  }
  assert.deepEqual(card.pressed().sort(), picked.slice().sort());
  const waiting = plain.filter((id) => !picked.includes(id));
  assert.deepEqual(card.disabled().sort(), waiting.slice().sort(), 'only the unpicked plain chips wait; a combo and No farm type stay open');

  // A click on a waiting chip changes nothing; taking one off opens them again.
  card.click(waiting[0]);
  assert.deepEqual(card.pressed().sort(), picked.slice().sort());
  card.click(picked.at(-1));
  assert.deepEqual(card.disabled(), []);
});

test('the only farm type picked stays picked, No farm type clears the pick, and a combo is picked alone', (t) => {
  t.after(() => farmTypeModel.setCustomFarmTypes([]));
  const card = loadStartCard();
  card.input.value = '9';
  card.click('abyss');
  assert.deepEqual(card.pressed(), ['abyss']);
  assert.equal(card.input.value, '9', 'clicking the only pick again keeps what was typed');

  card.click('ritual');
  card.click('abyss');
  assert.deepEqual(card.pressed(), ['ritual'], 'with two picked a click takes one off');

  card.click(COMBO_ID);
  assert.deepEqual(card.pressed(), [COMBO_ID]);
  assert.equal(card.input.value, '7');
  card.click('breach');
  assert.deepEqual(card.pressed(), ['breach'], 'the next chip replaces the combo');
  card.click('abyss');
  card.click(COMBO_ID);
  assert.deepEqual(card.pressed(), [COMBO_ID], 'a combo replaces the pick');

  card.click('');
  assert.deepEqual(card.pressed(), ['']);
  assert.equal(card.input.disabled, true);
});

test('picking the parts of an existing combo shows its cost, and Start sends the ids in click order', async (t) => {
  t.after(() => farmTypeModel.setCustomFarmTypes([]));
  const card = loadStartCard({ farmTypeId: 'breach' });
  card.click('abyss');
  assert.equal(card.input.value, '7', 'the combo of the same parts, in any order');

  card.submit();
  await card.settle();
  assert.deepEqual(card.calls.at(-1), { farmTypeIds: ['breach', 'abyss'] });

  card.input.value = '12';
  card.submit();
  await card.settle();
  assert.deepEqual(card.calls.at(-1), { farmTypeIds: ['breach', 'abyss'], cost: { amount: 12, unit: 'chaos' } });

  // A single pick sends what it always sent.
  card.click('abyss');
  card.submit();
  await card.settle();
  assert.deepEqual(card.calls.at(-1), { farmTypeId: 'breach' });
});

test('a combo main cannot make keeps the card up and says why', async (t) => {
  t.after(() => farmTypeModel.setCustomFarmTypes([]));
  const card = loadStartCard();
  card.click('ritual');

  card.answerConfirm(() => ({ ok: false, error: 'LIMIT_REACHED', combo: true }));
  card.submit();
  await card.settle();
  assert.equal(card.note.textContent, 'You have reached the limit of custom farm types. Delete one in Settings to combine these.');
  assert.equal(card.note.getAttribute('data-tone'), 'error');

  card.answerConfirm(() => ({ ok: false, error: 'LABEL_TOO_LONG', combo: true }));
  card.submit();
  await card.settle();
  assert.equal(card.note.textContent, 'Could not save the combined farm type.');
});

/* ── main's side ── */

function loadMainFunctions(names, overrides) {
  const context = vm.createContext({ console: { log() {} }, ...overrides });
  for (const name of names) {
    const start = mainSource.indexOf(`\nfunction ${name}(`);
    assert.notEqual(start, -1, `main.js should define ${name}()`);
    const end = mainSource.indexOf('\n}\n', start);
    vm.runInContext(`${mainSource.slice(start, end + 2)};\nthis.${name} = ${name};`, context);
  }
  const style = /\nconst START_MAP_PROMPT_COMBO_STYLE = [^\n]+\n/.exec(mainSource);
  assert.ok(style, 'main.js names the combo style');
  vm.runInContext(`${style[0]}this.START_MAP_PROMPT_COMBO_STYLE = START_MAP_PROMPT_COMBO_STYLE;`, context);
  return context;
}

const MAIN_FUNCTIONS = [
  'getActiveProfile', 'getCustomFarmTypesStoreKey', 'getStoredCustomFarmTypes', 'getFarmTypeCostsStoreKey',
  'normalizeFarmTypeCostEntry', 'getStoredFarmTypeCosts', 'isKnownFarmTypeCostId', 'setStoredFarmTypeCost',
  'normalizeStoredFarmTypeId', 'resolveFarmTypeLabel', 'saveCustomFarmType', 'getStartMapPromptComboLabel',
  'resolveStartMapPromptCombo', 'normalizeStartMapPromptText', 'normalizeStartMapPromptFarmTypeOptions',
  'normalizeOverlayNote', 'normalizeStartMapPromptResult', 'emitStartMapPromptOverlayResult', 'releaseStartMapPromptKeyboard',
  'confirmStartMapPromptOverlay'
];

const PROMPT_OPTIONS = ['abyss', 'breach', 'ritual', 'delirium', 'expedition', OWN_ID].map((id) => ({ id, label: id }));

function loadMain(customFarmTypes = [], { poeVersion = 'poe2' } = {}) {
  const data = {
    localProfiles: { p1: { id: 'p1' } },
    activeProfileId: 'p1',
    'customFarmTypes:p1': customFarmTypes
  };
  const sent = [];
  let uuid = 0;
  const context = loadMainFunctions(MAIN_FUNCTIONS, {
    store: { get: (key) => data[key], set: (key, value) => { data[key] = value; } },
    crypto: { randomUUID: () => `new-${++uuid}` },
    FARM_TYPE_COST_UNITS: ['chaos', 'divine'],
    MAX_FARM_TYPE_COST_AMOUNT: 10_000,
    CUSTOM_FARM_TYPE_LABEL_MAX_LENGTH: farmTypeModel.CUSTOM_FARM_TYPE_LABEL_MAX_LENGTH,
    isCustomFarmTypeId: farmTypeModel.isCustomFarmTypeId,
    normalizeCustomFarmTypes: farmTypeModel.normalizeCustomFarmTypes,
    createCustomFarmType: farmTypeModel.createCustomFarmType,
    updateCustomFarmType: farmTypeModel.updateCustomFarmType,
    getFarmTypeById: farmTypeModel.getFarmTypeById,
    listFarmTypes: farmTypeModel.listFarmTypes,
    renameFarmTypeInMapResults() {},
    overlayKeyboardLent: false,
    overlayStartMapPromptState: { mapName: 'Penitentiary', farmTypeId: 'abyss', poeVersion, farmTypeOptions: PROMPT_OPTIONS, source: 'map-detected' },
    mainWindow: { isDestroyed: () => false, webContents: { send: (channel, payload) => sent.push([channel, plainJson(payload)]) } },
    updateOverlayWindow() {}
  });
  return { context, data, sent, stored: () => data['customFarmTypes:p1'], costs: () => data['farmTypeCosts:p1'] };
}

test('main starts the map with the player\'s combo of the same parts in this game, in any order', () => {
  const combos = [
    { id: 'custom-old', label: 'Old Combo', color: 'red', icon: 'farm-key', poeVersions: ['poe2'], parts: ['ritual', 'abyss'], deletedAt: '2026-11-01T00:00:00.000Z' },
    { id: 'custom-poe1', label: 'PoE 1 Combo', color: 'red', icon: 'farm-key', poeVersions: ['poe1'], parts: ['abyss', 'ritual'] },
    { id: 'custom-mine', label: 'My Mix', color: 'blue', icon: 'farm-gem', poeVersions: ['poe1', 'poe2'], parts: ['abyss', 'ritual'] }
  ];
  const main = loadMain(combos);

  const result = main.context.confirmStartMapPromptOverlay({ farmTypeIds: ['ritual', 'abyss'], cost: { amount: 3, unit: 'chaos' } });

  assert.deepEqual(plainJson(result), { action: 'confirm', mapName: 'Penitentiary', farmTypeId: 'custom-mine', source: 'map-detected', costSaved: true });
  assert.equal(main.stored().length, 3, 'nothing new is made');
  assert.deepEqual(plainJson(main.costs()), { 'custom-mine': { amount: 3, unit: 'chaos' } });
  assert.deepEqual(main.sent, [['start-map-prompt-overlay-result', plainJson(result)]]);
});

test('main makes a new combo named after its parts for the prompt\'s game, and the result carries it to the main window', () => {
  const deleted = { id: 'custom-old', label: 'Abyss + Breach', color: 'red', icon: 'farm-key', poeVersions: ['poe2'], parts: ['abyss', 'breach'], deletedAt: '2026-11-01T00:00:00.000Z' };
  const main = loadMain([deleted]);

  const result = main.context.confirmStartMapPromptOverlay({ farmTypeIds: ['breach', 'abyss'] });

  const made = main.stored().at(-1);
  assert.notEqual(made.id, 'custom-old', 'a deleted combo is not used again');
  assert.deepEqual(plainJson(made), { id: 'custom-new-1', label: 'Breach + Abyss', color: 'silver', icon: 'farm-star', poeVersions: ['poe2'], parts: ['breach', 'abyss'] });
  assert.equal(result.farmTypeId, 'custom-new-1');
  assert.deepEqual(plainJson(result.customFarmTypes), plainJson(main.stored()));
  assert.equal(result.costSaved, undefined);
  assert.equal(main.context.overlayStartMapPromptState, null);
  assert.equal(main.sent.length, 1);
});

test('a combo name that is too long is cut evenly per part, and a taken one is numbered within the limit', () => {
  const longParts = [
    { id: 'custom-long-a', label: 'Expedition Logbooks', color: 'red', icon: 'farm-key', poeVersions: ['poe2'] },
    { id: 'custom-long-b', label: 'Temple', color: 'blue', icon: 'farm-key', poeVersions: ['poe2'] }
  ];
  const main = loadMain(longParts);
  main.context.overlayStartMapPromptState.farmTypeOptions = [...PROMPT_OPTIONS, { id: 'custom-long-a', label: 'x' }, { id: 'custom-long-b', label: 'y' }];
  const limit = farmTypeModel.CUSTOM_FARM_TYPE_LABEL_MAX_LENGTH;

  main.context.confirmStartMapPromptOverlay({ farmTypeIds: ['custom-long-a', 'delirium', 'custom-long-b'] });
  const label = main.stored().at(-1).label;
  assert.ok(label.length <= limit, label);
  assert.equal(label, 'Expedi + Deliri + Temple');

  const { context } = main;
  const taken = new Set(['abyss + breach', 'abyss + breach 2']);
  assert.equal(context.getStartMapPromptComboLabel(['Abyss', 'Breach'], taken), 'Abyss + Breach 3');
  const numbered = context.getStartMapPromptComboLabel(['Expedition', 'Delirium'], new Set(['expedition + delirium']));
  assert.ok(numbered.length <= limit && numbered.endsWith(' 2'), numbered);
  assert.equal(numbered, 'Expedition + Delirium 2');
  const tight = context.getStartMapPromptComboLabel(['Expedition', 'Delirium', 'Breach'], new Set(['expedi + deliri + breach']));
  assert.ok(tight.length <= limit && tight.endsWith(' 2'), tight);
});

test('a combo that cannot be made keeps the card up and starts nothing', () => {
  const full = Array.from({ length: farmTypeModel.CUSTOM_FARM_TYPE_LIMIT }, (unused, index) => ({
    id: `custom-full-${index}`, label: `Type ${index}`, color: 'red', icon: 'farm-key', poeVersions: ['poe2']
  }));
  const main = loadMain(full);

  const result = main.context.confirmStartMapPromptOverlay({ farmTypeIds: ['abyss', 'ritual'], cost: { amount: 3, unit: 'chaos' } });

  assert.deepEqual(plainJson(result), { ok: false, error: 'LIMIT_REACHED', combo: true });
  assert.notEqual(main.context.overlayStartMapPromptState, null);
  assert.equal(main.stored().length, full.length);
  assert.equal(main.costs(), undefined, 'no cost is saved');
  assert.deepEqual(main.sent, []);

  // A farm type the card did not offer, or one picked twice, makes nothing either.
  for (const farmTypeIds of [['abyss', 'harvest'], ['abyss', 'abyss']]) {
    const other = loadMain();
    assert.deepEqual(plainJson(other.context.confirmStartMapPromptOverlay({ farmTypeIds })), { ok: false, error: 'PARTS_INVALID', combo: true });
  }

  // A combo cannot hold a combo, and goes through the same checks as the Settings editor.
  const nested = loadMain([{ id: OWN_ID, label: 'Temple', color: 'red', icon: 'farm-key', poeVersions: ['poe2'], parts: ['abyss', 'breach'] }]);
  assert.equal(nested.context.confirmStartMapPromptOverlay({ farmTypeIds: [OWN_ID, 'ritual'] }).error, 'PARTS_INVALID');
});

test('a single farm type on the start card is confirmed as before', () => {
  const main = loadMain();

  const result = main.context.confirmStartMapPromptOverlay({ farmTypeId: 'ritual', cost: { amount: 4, unit: 'divine' } });

  assert.deepEqual(plainJson(result), { action: 'confirm', mapName: 'Penitentiary', farmTypeId: 'ritual', source: 'map-detected', costSaved: true });
  assert.deepEqual(main.stored(), []);
  assert.deepEqual(plainJson(main.costs()), { ritual: { amount: 4, unit: 'divine' } });
});

test('the main window learns a combo made on the card before it starts the map with it', () => {
  const appSource = fs.readFileSync(path.join(desktopDir, 'src', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
  const confirm = appSource.indexOf("if (overlayResult?.action === 'confirm') {");
  const apply = appSource.indexOf('await applyCustomFarmTypes(overlayResult.customFarmTypes);', confirm);
  const start = appSource.indexOf('await handleStartSession({', confirm);
  assert.ok(confirm > 0 && apply > confirm && apply < start, 'the new list is applied before the map starts');
});
