const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const farmTypeModel = require('../src/modules/farmTypeModel');
const { filterMapResults } = require('../src/modules/mapResultStoreModel');

const desktopDir = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(desktopDir, ...parts), 'utf8').replace(/\r\n/g, '\n');
const appSource = read('src', 'app.js');
const mainSource = read('main.js');
const { FARM_COMBO_MIN_PARTS, FARM_COMBO_MAX_PARTS } = farmTypeModel;

const OWN = { id: 'custom-own', label: 'Boss Tablets', color: 'amber', icon: 'farm-tablet', poeVersions: ['poe1'] };
const COMBO = { id: 'custom-combo', label: 'Blight Tablets', color: 'green', icon: 'farm-flame', poeVersions: ['poe1'], parts: ['blight', 'custom-own'] };
const INPUT = { label: 'Blight + Legion', color: 'lime', icon: 'farm-leaf', poeVersions: ['poe1'] };

function plainJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function useCustomFarmTypes(t, farmTypes) {
  farmTypeModel.setCustomFarmTypes(farmTypes);
  t.after(() => farmTypeModel.setCustomFarmTypes([]));
}

// Top-level functions of a source file, each up to its closing brace in column zero.
function loadFunctions(source, functionNames, contextOverrides = {}) {
  const context = vm.createContext({ console, ...contextOverrides });
  for (const functionName of functionNames) {
    const start = source.indexOf(`\nfunction ${functionName}(`);
    assert.notEqual(start, -1, `expected ${functionName}()`);
    const end = source.indexOf('\n}\n', start);
    vm.runInContext(`${source.slice(start, end + 2)};\nthis.${functionName} = ${functionName};`, context);
  }
  return context;
}

// Built-in parts are the first ids of one game; enough of them to go past the most a combo takes.
function builtInParts(count) {
  return farmTypeModel.listFarmTypes({ poeVersion: 'poe1' }).slice(0, count).map((farmType) => farmType.id);
}

test('a combo takes two up to the most parts, each a distinct farm type of every chosen game', () => {
  const created = farmTypeModel.createCustomFarmType([OWN], { ...INPUT, parts: ['blight', 'legion'] }, { id: 'custom-new' });
  assert.deepEqual(plainJson(created.farmType.parts), ['blight', 'legion']);
  assert.deepEqual(
    plainJson(farmTypeModel.createCustomFarmType([OWN], { ...INPUT, parts: builtInParts(FARM_COMBO_MAX_PARTS) }, { id: 'custom-new' }).farmType.parts),
    builtInParts(FARM_COMBO_MAX_PARTS)
  );
  // One of the player's own farm types can be a part.
  assert.equal(farmTypeModel.createCustomFarmType([OWN], { ...INPUT, parts: ['blight', OWN.id] }, { id: 'custom-new' }).error, undefined);

  const errorFor = (parts, farmTypes = [OWN], extra = {}) => (
    farmTypeModel.createCustomFarmType(farmTypes, { ...INPUT, ...extra, parts }, { id: 'custom-new' }).error
  );
  assert.equal(errorFor(['blight']), 'PARTS_COUNT');
  assert.equal(errorFor(builtInParts(FARM_COMBO_MAX_PARTS + 1)), 'PARTS_COUNT');
  assert.equal(errorFor(['blight', 'blight']), 'PARTS_INVALID');
  assert.equal(errorFor(['blight', 'nope']), 'PARTS_INVALID');
  assert.equal(errorFor(['blight', 'custom-unknown']), 'PARTS_INVALID');
  assert.equal(errorFor('blight,legion'), 'PARTS_INVALID');
  // A combo is never a part, and neither is a deleted farm type.
  assert.equal(errorFor(['blight', COMBO.id], [OWN, COMBO]), 'PARTS_INVALID');
  assert.equal(errorFor(['blight', OWN.id], [{ ...OWN, deletedAt: '2026-11-20T00:00:00.000Z' }]), 'PARTS_INVALID');
  // Blight is PoE 1 only, Overseer PoE 2 only.
  assert.equal(errorFor(['blight', 'legion'], [OWN], { poeVersions: ['poe1', 'poe2'] }), 'PARTS_GAME');
  assert.equal(errorFor(['abyss', 'overseer']), 'PARTS_GAME');
  assert.equal(errorFor(['abyss', OWN.id], [OWN], { poeVersions: ['poe2'] }), 'PARTS_GAME');
});

test('a farm type without parts saves as before, and an edit cannot make a type its own part', () => {
  for (const parts of [undefined, null, []]) {
    const { farmType } = farmTypeModel.createCustomFarmType([], { ...INPUT, parts }, { id: 'custom-new' });
    assert.deepEqual(plainJson(farmType), { id: 'custom-new', ...INPUT });
  }

  assert.equal(farmTypeModel.updateCustomFarmType([OWN], OWN.id, { ...OWN, parts: [OWN.id, 'blight'] }).error, 'PARTS_INVALID');
  const edited = farmTypeModel.updateCustomFarmType([OWN, COMBO], COMBO.id, { ...COMBO, parts: ['blight', 'legion', OWN.id].slice(0, FARM_COMBO_MAX_PARTS) });
  assert.deepEqual(plainJson(edited.farmType.parts), ['blight', 'legion', OWN.id].slice(0, FARM_COMBO_MAX_PARTS));
});

test('stored parts survive when well formed; broken ones leave a plain farm type', () => {
  assert.deepEqual(plainJson(farmTypeModel.normalizeCustomFarmTypes([OWN, COMBO])), [OWN, COMBO]);

  const broken = [
    'blight',
    ['blight'],
    builtInParts(FARM_COMBO_MAX_PARTS + 1),
    ['blight', 'blight'],
    ['blight', 'nope'],
    ['blight', 7],
    ['blight', COMBO.id],
    { 0: 'blight', 1: 'legion' }
  ];
  for (const parts of broken) {
    assert.deepEqual(plainJson(farmTypeModel.normalizeCustomFarmTypes([{ ...COMBO, parts }])), [{ ...COMBO, parts: undefined }].map(plainJson), JSON.stringify(parts));
  }
});

test('a combo resolves its parts for its chip, a deleted part included', (t) => {
  const deleted = farmTypeModel.deleteCustomFarmType([OWN, COMBO], OWN.id).farmTypes;
  useCustomFarmTypes(t, deleted);

  const expected = [
    { id: 'blight', label: 'Blight', colorKey: 'blight' },
    { id: OWN.id, label: OWN.label, colorKey: 'amber' }
  ];
  assert.deepEqual(plainJson(farmTypeModel.getFarmTypeParts(COMBO.id)), expected);
  assert.deepEqual(plainJson(farmTypeModel.getFarmTypeParts(COMBO.label)), expected);
  assert.deepEqual(plainJson(farmTypeModel.getFarmTypeParts('blight')), []);
  assert.deepEqual(plainJson(farmTypeModel.getFarmTypeParts(OWN.id)), []);
  assert.deepEqual(plainJson(farmTypeModel.getFarmTypeParts('')), []);
});

test('a farm type includes itself, and a combo includes each of its parts', (t) => {
  useCustomFarmTypes(t, [OWN, COMBO]);

  assert.equal(farmTypeModel.farmTypeIncludes(COMBO.id, 'blight'), true);
  assert.equal(farmTypeModel.farmTypeIncludes(COMBO.label, 'Blight'), true);
  assert.equal(farmTypeModel.farmTypeIncludes(COMBO.id, OWN.label), true);
  assert.equal(farmTypeModel.farmTypeIncludes(COMBO.id, 'legion'), false);
  assert.equal(farmTypeModel.farmTypeIncludes('blight', 'blight'), true);
  assert.equal(farmTypeModel.farmTypeIncludes('blight', COMBO.id), false);
  assert.equal(farmTypeModel.farmTypeIncludes(null, 'blight'), false);
  assert.equal(farmTypeModel.farmTypeIncludes(COMBO.id, 'Unknown farm type'), false);
});

const RENDER_HELPERS = ['getFarmTypeIdFor', 'describeFarmTypeFor', 'farmTypePartsFor', 'farmTypeAttr', 'setFarmPartsData', 'farmIconHTML', 'farmTypeIconHTML', 'applyFarmType'];

test('the shared render helpers carry a combo\'s parts and drop them for a single farm type', (t) => {
  useCustomFarmTypes(t, [OWN, COMBO]);
  const context = loadFunctions(appSource, RENDER_HELPERS, { window: { farmTypeModel } });

  assert.equal(
    context.farmTypeAttr(COMBO.id),
    ` data-farm-type="${COMBO.id}" data-farm-color="green" data-farm-parts="2" data-farm-c1="blight" data-farm-c2="amber"`
  );
  assert.equal(context.farmTypeAttr('Ritual'), ' data-farm-type="ritual"');
  assert.equal(context.farmTypeAttr(OWN.id), ` data-farm-type="${OWN.id}" data-farm-color="amber"`);

  const element = { dataset: {}, insertAdjacentHTML() {} };
  context.applyFarmType(element, COMBO.id);
  assert.deepEqual({ ...element.dataset }, { farmType: COMBO.id, farmColor: 'green', farmParts: '2', farmC1: 'blight', farmC2: 'amber' });
  context.applyFarmType(element, 'Ritual');
  assert.deepEqual({ ...element.dataset }, { farmType: 'ritual' });
});

test('a filter on one farm type also lists the combos that contain it; a combo lists only itself', (t) => {
  useCustomFarmTypes(t, [OWN, COMBO]);
  const results = [
    { id: '1', farmType: 'Blight', farmTypeId: 'blight' },
    { id: '2', farmType: COMBO.label, farmTypeId: COMBO.id },
    { id: '3', farmType: 'Legion', farmTypeId: 'legion' },
    { id: '4', farmType: OWN.label, farmTypeId: OWN.id }
  ];
  const ids = (filtered) => filtered.map((result) => result.id);
  assert.deepEqual(ids(filterMapResults(results, { farmType: 'Blight' })), ['1', '2']);
  assert.deepEqual(ids(filterMapResults(results, { farmType: OWN.label })), ['2', '4']);
  assert.deepEqual(ids(filterMapResults(results, { farmType: COMBO.label })), ['2']);
  assert.deepEqual(ids(filterMapResults(results, { farmType: 'Legion' })), ['3']);

  const elements = { sessionFarmFilter: { value: 'Blight' } };
  const state = {
    sessions: [
      { id: 'a', farmTypeId: 'blight' },
      { id: 'b', farmTypeId: COMBO.id },
      { id: 'c', farmTypeId: 'legion' },
      { id: 'd', farmTypeId: null }
    ]
  };
  const context = loadFunctions(appSource, [
    'getFilterValue', 'getSearchFilterValue', 'getSessionFarmTypeId', 'getSessionPoeVersion', 'getSessionFarmTypeLabel', 'getFilteredSessions'
  ], {
    elements,
    state,
    window: { t: (key) => key, farmTypeModel },
    getFarmTypeModel: () => farmTypeModel,
    normalizePoeVersion: (value) => value || null
  });
  const sessionIds = () => context.getFilteredSessions().map((session) => session.id);
  assert.deepEqual(sessionIds(), ['a', 'b']);
  elements.sessionFarmFilter.value = COMBO.label;
  assert.deepEqual(sessionIds(), ['b']);
  elements.sessionFarmFilter.value = 'dashboard.noFarmType';
  assert.deepEqual(sessionIds(), ['d']);
});

test('a combo survives the round trip through main and is checked there by the same model', () => {
  const data = {
    localProfiles: { 'profile-1': { id: 'profile-1' } },
    activeProfileId: 'profile-1',
    'customFarmTypes:profile-1': [OWN]
  };
  const store = {
    get: (key) => (data[key] === undefined ? undefined : JSON.parse(JSON.stringify(data[key]))),
    set(key, value) {
      data[key] = JSON.parse(JSON.stringify(value));
    }
  };
  let uuids = 0;
  const context = loadFunctions(mainSource, [
    'getActiveProfile', 'getCustomFarmTypesStoreKey', 'getStoredCustomFarmTypes', 'getMapResultsStoreKey',
    'getStoredMapResults', 'renameFarmTypeInMapResults', 'saveCustomFarmType'
  ], {
    store,
    crypto: { randomUUID: () => `combo-${uuids += 1}` },
    normalizeCustomFarmTypes: farmTypeModel.normalizeCustomFarmTypes,
    createCustomFarmType: farmTypeModel.createCustomFarmType,
    updateCustomFarmType: farmTypeModel.updateCustomFarmType,
    updateOverlayWindow() {}
  });

  const saved = context.saveCustomFarmType({ ...INPUT, parts: ['blight', OWN.id] });
  assert.equal(saved.ok, true);
  assert.deepEqual(plainJson(context.getStoredCustomFarmTypes().find((farmType) => farmType.id === 'custom-combo-1').parts), ['blight', OWN.id]);
  assert.deepEqual(plainJson(context.saveCustomFarmType({ ...INPUT, label: 'Other', parts: ['blight'] })), { ok: false, error: 'PARTS_COUNT' });
  assert.deepEqual(plainJson(context.saveCustomFarmType({ ...INPUT, label: 'Other', parts: ['blight', 'custom-combo-1'] })), { ok: false, error: 'PARTS_INVALID' });
});

// Every colour name a part can carry, with the token its single farm type uses.
function colorKeyTokens(css) {
  const tokens = farmTypeModel.FARM_TYPES.map((farmType) => [farmType.id, `--farm-${farmType.id}`]);
  for (const color of farmTypeModel.CUSTOM_FARM_TYPE_COLORS) {
    const match = css.match(new RegExp(`\\[data-farm-color="${color}"\\] \\{ --farm-color: var\\((--farm-[a-z]+)\\); \\}`));
    assert.ok(match, `expected a data-farm-color rule for ${color}`);
    tokens.push([color, match[1]]);
  }
  return tokens;
}

for (const [name, file] of [['styles.css', ['src', 'styles.css']], ['overlay.html', ['src', 'overlay.html']]]) {
  test(`${name} cuts a combo chip for every part count and colours every part slot`, () => {
    const css = read(...file);
    for (const [colorKey, token] of colorKeyTokens(css)) {
      for (let slot = 1; slot <= FARM_COMBO_MAX_PARTS; slot += 1) {
        assert.ok(
          css.includes(`[data-farm-c${slot}="${colorKey}"] { --farm-c${slot}: var(${token}); }`),
          `expected --farm-c${slot} for ${colorKey}`
        );
      }
    }

    for (let count = FARM_COMBO_MIN_PARTS; count <= FARM_COMBO_MAX_PARTS; count += 1) {
      const start = css.indexOf(`[data-farm-parts="${count}"] {`);
      assert.notEqual(start, -1, `expected a cut for ${count} parts`);
      // The gradients hold no braces, so the rule ends at the first one after its frame.
      const rule = css.slice(start, css.indexOf('}', css.indexOf('--farm-cut-frame', start)));
      assert.match(rule, /--farm-cut-fill: linear-gradient\(115deg,/);
      for (let slot = 1; slot <= FARM_COMBO_MAX_PARTS; slot += 1) {
        assert.equal(rule.includes(`var(--farm-c${slot})`), slot <= count, `${count} parts and slot ${slot}`);
      }
    }
    assert.match(css, /\[data-farm-parts\] \{\s*--farm-color: var\(--text-bright\);/);
  });
}

test('the editor offers combo parts and never names the most parts itself', () => {
  const html = read('src', 'index.html');
  assert.match(html, /<div id="custom-farm-parts" class="custom-farm-options"><\/div>/);
  assert.match(html, /data-i18n="customFarm.parts"/);

  const start = appSource.indexOf('\nfunction renderCustomFarmParts(');
  const editor = appSource.slice(start, appSource.indexOf('\nfunction setCustomFarmError(', start));
  assert.match(editor, /FARM_COMBO_MAX_PARTS/);
  assert.doesNotMatch(editor, /\b[23]\b/, 'part counts come from the model');
});
