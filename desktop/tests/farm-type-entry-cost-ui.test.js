const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const desktopDir = path.resolve(__dirname, '..');
const appJsPath = path.join(desktopDir, 'src', 'app.js');
const indexHtmlPath = path.join(desktopDir, 'src', 'index.html');
const stylesCssPath = path.join(desktopDir, 'src', 'styles.css');
const translationsJsPath = path.join(desktopDir, 'src', 'modules', 'translations.js');

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

const COST_FUNCTIONS = [
  'parseCostAmount',
  'setFarmTypeCostError',
  'renderFarmTypeCost',
  'loadFarmTypeCosts',
  'handleFarmTypeCostCommit',
  'handleFarmTypeCostKeydown'
];

const plain = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise((resolve) => setImmediate(resolve));

const FARM_TYPES = { ritual: { id: 'ritual', label: 'Ritual' }, 'custom-abc': { id: 'custom-abc', label: 'My <Farm>' } };

function createDashboard({ selected = '', costs = {}, setFarmTypeCost, getFarmTypeCosts } = {}) {
  const calls = [];
  const documentStub = { activeElement: null };
  const attributes = {};
  const input = {
    value: '',
    disabled: true,
    setAttribute: (name, value) => { attributes[name] = value; }
  };
  const unit = { value: 'chaos', disabled: true };
  const elements = {
    entryCostInput: input,
    entryCostUnit: unit,
    entryCostHint: { textContent: '' },
    entryCostError: { hidden: true, textContent: '' }
  };
  const state = {
    farmType: { selectedFarmTypeId: selected || null },
    farmTypeCosts: costs,
    farmTypeCostBusy: false,
    renderedFarmTypeCostId: null
  };
  const context = loadFunctions(COST_FUNCTIONS, {
    state,
    elements,
    document: documentStub,
    getFarmTypeModel: () => ({ getFarmTypeById: (id) => FARM_TYPES[id] || null }),
    window: {
      t: (key, values = {}) => `${key}${values.farmType !== undefined ? `|${values.farmType}` : ''}`,
      electronAPI: {
        setFarmTypeCost: setFarmTypeCost || (async (...args) => { calls.push(['setFarmTypeCost', ...args]); return { ok: true, costs: { ...state.farmTypeCosts, [args[0]]: args[1] } }; }),
        getFarmTypeCosts: getFarmTypeCosts || (async () => ({ ritual: { amount: 2, unit: 'divine' } }))
      }
    }
  });
  return { context, state, elements, input, unit, attributes, calls, documentStub };
}

test('the amount accepts a comma or a dot, reads an empty box as no cost and refuses anything else', () => {
  const { context } = createDashboard();
  assert.equal(context.parseCostAmount('2,5', 10000), 2.5);
  assert.equal(context.parseCostAmount(' 2.5 ', 10000), 2.5);
  assert.equal(context.parseCostAmount('.5', 10000), 0.5);
  assert.equal(context.parseCostAmount('5.', 10000), 5);
  assert.equal(context.parseCostAmount('10000', 10000), 10000);
  assert.equal(context.parseCostAmount('', 10000), 0);
  assert.equal(context.parseCostAmount('   ', 10000), 0);
  for (const bad of ['abc', '-1', '1e3', '1.2.3', '1,2,3', '1,000.5', '10000.01', '+4', '0x10']) {
    assert.equal(context.parseCostAmount(bad, 10000), null, bad);
  }
});

test('with no farm type the boxes are off and the hint says to pick one', () => {
  const { context, input, unit, elements } = createDashboard({ costs: { ritual: { amount: 2, unit: 'divine' } } });

  context.renderFarmTypeCost('');

  assert.equal(input.disabled, true);
  assert.equal(unit.disabled, true);
  assert.equal(input.value, '');
  assert.equal(elements.entryCostHint.textContent, 'dashboard.entryCostPick');
});

test('a farm type shows its stored amount and unit and names itself in the hint', () => {
  const { context, input, unit, elements } = createDashboard({ selected: 'ritual', costs: { ritual: { amount: 1.5, unit: 'divine' } } });

  context.renderFarmTypeCost('ritual');

  assert.equal(input.disabled, false);
  assert.equal(unit.disabled, false);
  assert.equal(input.value, '1.5');
  assert.equal(unit.value, 'divine');
  assert.equal(elements.entryCostHint.textContent, 'dashboard.entryCostHint|Ritual');

  // A farm type without a cost shows an empty box in Chaos.
  context.renderFarmTypeCost('custom-abc');
  assert.equal(input.value, '');
  assert.equal(unit.value, 'chaos');
  assert.equal(elements.entryCostHint.textContent, 'dashboard.entryCostHint|My <Farm>', 'the hint is text, not markup');
});

test('a redraw keeps what is typed in a box the player is in, and a switch of farm type does not', () => {
  const { context, input, unit, documentStub } = createDashboard({
    selected: 'ritual',
    costs: { ritual: { amount: 1, unit: 'chaos' }, 'custom-abc': { amount: 7, unit: 'divine' } }
  });
  context.renderFarmTypeCost('ritual');
  documentStub.activeElement = input;
  input.value = '4,';

  context.renderFarmTypeCost('ritual');
  assert.equal(input.value, '4,', 'a price update redraws the card under the cursor');

  context.renderFarmTypeCost('custom-abc');
  assert.equal(input.value, '7');
  assert.equal(unit.value, 'divine');

  documentStub.activeElement = null;
  input.value = 'stale';
  context.renderFarmTypeCost('custom-abc');
  assert.equal(input.value, '7', 'outside a box the stored cost is shown');
});

test('Enter saves the typed amount and unit for the selected farm type and keeps what main answers', async () => {
  const { context, state, input, unit, calls } = createDashboard({ selected: 'ritual' });
  context.renderFarmTypeCost('ritual');
  input.value = '1,5';
  unit.value = 'divine';

  let prevented = false;
  context.handleFarmTypeCostKeydown({ key: 'Enter', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  await tick();

  assert.deepEqual(plain(calls), [['setFarmTypeCost', 'ritual', { amount: 1.5, unit: 'divine' }]]);
  assert.deepEqual(plain(state.farmTypeCosts), { ritual: { amount: 1.5, unit: 'divine' } });
  assert.equal(input.value, '1.5');
  assert.equal(state.farmTypeCostBusy, false);
});

test('losing focus commits, and an unchanged cost is ignored with the box back to the stored text', async () => {
  const { context, input, unit, calls } = createDashboard({ selected: 'ritual', costs: { ritual: { amount: 2, unit: 'divine' } } });
  context.renderFarmTypeCost('ritual');

  input.value = '2,0';
  await context.handleFarmTypeCostCommit();
  assert.deepEqual(plain(calls), []);
  assert.equal(input.value, '2');

  input.value = '3';
  await context.handleFarmTypeCostCommit();
  assert.deepEqual(plain(calls), [['setFarmTypeCost', 'ritual', { amount: 3, unit: 'divine' }]]);

  // Another unit with the same amount is a change.
  unit.value = 'chaos';
  await context.handleFarmTypeCostCommit();
  assert.deepEqual(plain(calls).at(-1), ['setFarmTypeCost', 'ritual', { amount: 3, unit: 'chaos' }]);
});

test('an unpicked cost with a unit chosen first keeps that unit, and a cleared box removes the stored cost', async () => {
  const { context, input, unit, calls } = createDashboard({ selected: 'ritual' });
  context.renderFarmTypeCost('ritual');

  unit.value = 'divine';
  await context.handleFarmTypeCostCommit();
  assert.deepEqual(plain(calls), [], 'no amount, nothing stored');
  assert.equal(unit.value, 'divine', 'the unit picked before typing stays');

  input.value = '2';
  await context.handleFarmTypeCostCommit();
  assert.deepEqual(plain(calls), [['setFarmTypeCost', 'ritual', { amount: 2, unit: 'divine' }]]);

  input.value = '';
  await context.handleFarmTypeCostCommit();
  assert.deepEqual(plain(calls).at(-1), ['setFarmTypeCost', 'ritual', { amount: 0, unit: 'divine' }]);
});

test('an invalid number shows an inline error, keeps the typed text and makes no call; typing clears the error', async () => {
  const { context, input, elements, attributes, calls } = createDashboard({ selected: 'ritual' });
  context.renderFarmTypeCost('ritual');

  input.value = '12abc';
  await context.handleFarmTypeCostCommit();

  assert.deepEqual(plain(calls), []);
  assert.equal(input.value, '12abc');
  assert.equal(elements.entryCostError.hidden, false);
  assert.equal(elements.entryCostError.textContent, 'dashboard.entryCostInvalid');
  assert.equal(attributes['aria-invalid'], 'true');

  context.setFarmTypeCostError(null);
  assert.equal(elements.entryCostError.hidden, true);
  assert.equal(elements.entryCostError.textContent, '');
  assert.equal(attributes['aria-invalid'], 'false');

  input.value = '10001';
  await context.handleFarmTypeCostCommit();
  assert.equal(elements.entryCostError.textContent, 'dashboard.entryCostInvalid', 'more than the cap is invalid too');
});

test('Escape puts the stored cost back and clears the error', async () => {
  const { context, input, unit, elements } = createDashboard({ selected: 'ritual', costs: { ritual: { amount: 2, unit: 'divine' } } });
  context.renderFarmTypeCost('ritual');
  input.value = 'oops';
  unit.value = 'chaos';
  await context.handleFarmTypeCostCommit();
  assert.equal(elements.entryCostError.hidden, false);

  context.handleFarmTypeCostKeydown({ key: 'Escape', preventDefault() {} });

  assert.equal(input.value, '2');
  assert.equal(unit.value, 'divine');
  assert.equal(elements.entryCostError.hidden, true);
});

test('a failed save shows an error and keeps the typed text; a second save waits for the first', async () => {
  const refused = createDashboard({
    selected: 'ritual',
    setFarmTypeCost: async () => ({ ok: false, error: 'FARM_TYPE_NOT_FOUND' })
  });
  refused.context.renderFarmTypeCost('ritual');
  refused.input.value = '5';
  await refused.context.handleFarmTypeCostCommit();
  assert.equal(refused.elements.entryCostError.textContent, 'dashboard.entryCostSaveError');
  assert.equal(refused.input.value, '5');
  assert.equal(refused.state.farmTypeCostBusy, false);

  const invalid = createDashboard({ selected: 'ritual', setFarmTypeCost: async () => ({ ok: false, error: 'COST_INVALID' }) });
  invalid.context.renderFarmTypeCost('ritual');
  invalid.input.value = '5';
  await invalid.context.handleFarmTypeCostCommit();
  assert.equal(invalid.elements.entryCostError.textContent, 'dashboard.entryCostInvalid');

  const thrown = createDashboard({ selected: 'ritual', setFarmTypeCost: async () => { throw new Error('boom'); } });
  thrown.context.renderFarmTypeCost('ritual');
  thrown.input.value = '5';
  await thrown.context.handleFarmTypeCostCommit();
  assert.equal(thrown.elements.entryCostError.textContent, 'dashboard.entryCostSaveError');
  assert.equal(thrown.state.farmTypeCostBusy, false);

  let release;
  const calls = [];
  const slow = createDashboard({
    selected: 'ritual',
    setFarmTypeCost: (...args) => { calls.push(args); return new Promise((resolve) => { release = resolve; }); }
  });
  slow.context.renderFarmTypeCost('ritual');
  slow.input.value = '5';
  const first = slow.context.handleFarmTypeCostCommit();
  await slow.context.handleFarmTypeCostCommit();
  assert.equal(calls.length, 1, 'the focusout that follows an Enter does not save twice');
  release({ ok: true, costs: { ritual: { amount: 5, unit: 'chaos' } } });
  await first;
  assert.equal(slow.input.value, '5');
});

test('with no farm type selected nothing is saved', async () => {
  const { context, input, calls } = createDashboard({ selected: '' });
  context.renderFarmTypeCost('');
  input.disabled = false;
  input.value = '5';
  await context.handleFarmTypeCostCommit();
  assert.deepEqual(plain(calls), []);
});

test('the stored costs load after sign-in and show for the selected farm type; a failed load is empty', async () => {
  const { context, state, input } = createDashboard({ selected: 'ritual' });
  await context.loadFarmTypeCosts();
  assert.deepEqual(plain(state.farmTypeCosts), { ritual: { amount: 2, unit: 'divine' } });
  assert.equal(input.value, '2');

  const failing = createDashboard({ selected: 'ritual', getFarmTypeCosts: () => Promise.reject(new Error('signed out')) });
  failing.state.farmTypeCosts = { ritual: { amount: 9, unit: 'chaos' } };
  await failing.context.loadFarmTypeCosts();
  assert.deepEqual(plain(failing.state.farmTypeCosts), {});
  assert.equal(failing.input.value, '');
});

test('the farm type selector redraws the cost boxes for the type it selects', () => {
  const source = fs.readFileSync(appJsPath, 'utf8');
  const selector = extractFunctionSource(source, 'renderFarmTypeSelector');
  assert.match(selector, /renderFarmTypeCost\(selectedFarmTypeId\)/);
  // After sign-in and at start the costs load beside the farm types; sign-out drops them.
  assert.match(source, /await loadActiveFarmTypeSelection\(\);\s+await loadFarmTypeCosts\(\);/);
  assert.match(source, /state\.farmTypeCosts = \{\};/);
});

test('the Dashboard markup puts the Entry cost field under the Farm type select, inside the card that stays on while a map runs', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const setup = html.slice(html.indexOf('<div class="session-setup">'), html.indexOf('<div id="active-session">'));
  assert.ok(setup.length > 0);
  assert.ok(setup.indexOf('id="session-farm-type-select"') < setup.indexOf('id="session-entry-cost-input"'));
  assert.match(setup, /<label for="session-entry-cost-input" data-i18n="dashboard\.entryCost">/);
  assert.match(setup, /<input id="session-entry-cost-input" type="text" inputmode="decimal"[^>]*data-i18n-aria="dashboard\.entryCostAria">/);
  assert.match(setup, /<select id="session-entry-cost-unit"[^>]*data-i18n-aria="dashboard\.entryCostUnitAria">\s*<option value="chaos">Chaos Orb<\/option>\s*<option value="divine">Divine Orb<\/option>/);
  assert.match(setup, /id="session-entry-cost-error" class="session-cost-error" role="alert" hidden/);
  // The farm picker hides while a map runs, so the cost field must not sit inside it.
  const farmField = setup.slice(setup.indexOf('session-farm-field'), setup.indexOf('session-cost-field'));
  assert.doesNotMatch(farmField, /session-entry-cost/);
});

test('the idle card lays the setup block out where the farm picker was, and a running map hides only the picker', () => {
  const css = fs.readFileSync(stylesCssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.session-card\[data-session-state="idle"\] \.session-setup \{\s*grid-area:\s*2 \/ 1;/);
  assert.match(css, /\.session-card\[data-session-state="active"\] \.session-farm-field \{\s*display:\s*none;/);
  assert.doesNotMatch(css, /data-session-state="active"\] \.session-(setup|cost-field)/);
});

test('the Entry cost strings exist in en and tr, with the tr ones in plain ASCII', () => {
  const source = fs.readFileSync(translationsJsPath, 'utf8');
  const keys = [
    'dashboard.entryCost',
    'dashboard.entryCostAria',
    'dashboard.entryCostUnitAria',
    'dashboard.entryCostHint',
    'dashboard.entryCostPick',
    'dashboard.entryCostInvalid',
    'dashboard.entryCostSaveError',
    'dashboard.costPendingDivine',
    'sessions.costNotCounted'
  ];
  for (const key of keys) {
    const lines = source.split(/\r?\n/).filter((line) => line.trimStart().startsWith(`'${key}':`));
    assert.equal(lines.length, 2, `${key} has an en and a tr string`);
    assert.notEqual(lines[0].split(': ').slice(1).join(': '), lines[1].split(': ').slice(1).join(': '));
    assert.match(lines[0], /^[\x20-\x7e]+$/);
  }
});
