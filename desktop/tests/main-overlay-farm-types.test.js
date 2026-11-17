const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const farmTypeModel = require('../src/modules/farmTypeModel');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
const CUSTOM_ID = 'custom-11111111-aaaa';

// A top-level function of main.js up to its closing brace in column zero.
function loadFunctions(functionNames, contextOverrides = {}) {
  const context = vm.createContext({ console: { log() {} }, ...contextOverrides });
  for (const functionName of functionNames) {
    const start = mainSource.indexOf(`\nfunction ${functionName}(`);
    assert.notEqual(start, -1, `main.js should define ${functionName}()`);
    const end = mainSource.indexOf('\n}\n', start);
    vm.runInContext(`${mainSource.slice(start, end + 2)};\nthis.${functionName} = ${functionName};`, context);
  }
  return context;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

// main's store over a plain object: two local profiles, the first one signed in.
function loadStore(initial = {}) {
  const data = {
    localProfiles: { 'profile-1': { id: 'profile-1' }, 'profile-2': { id: 'profile-2' } },
    activeProfileId: 'profile-1',
    'customFarmTypes:profile-1': [{ id: CUSTOM_ID, label: 'Boss Tablets', color: 'amber', icon: 'farm-tablet', poeVersions: ['poe1'] }],
    ...initial
  };
  const context = loadFunctions([
    'getActiveProfile',
    'getCustomFarmTypesStoreKey',
    'getStoredCustomFarmTypes',
    'isKnownFarmTypeCostId',
    'getOverlayHiddenFarmTypesStoreKey',
    'getStoredOverlayHiddenFarmTypes',
    'setStoredOverlayFarmTypeHidden'
  ], {
    store: { get: (key) => data[key], set(key, value) { data[key] = value; } },
    normalizeCustomFarmTypes: farmTypeModel.normalizeCustomFarmTypes,
    isCustomFarmTypeId: farmTypeModel.isCustomFarmTypeId,
    getFarmTypeById: farmTypeModel.getFarmTypeById
  });
  return { data, context };
}

test('a profile hides farm types from the overlay and shows them again, one profile at a time', () => {
  const { data, context } = loadStore();
  assert.deepEqual(plain(context.getStoredOverlayHiddenFarmTypes()), []);

  assert.deepEqual(plain(context.setStoredOverlayFarmTypeHidden('legion', true)), { ok: true, hidden: ['legion'] });
  assert.deepEqual(plain(context.setStoredOverlayFarmTypeHidden(CUSTOM_ID, true)), { ok: true, hidden: ['legion', CUSTOM_ID] });
  // Hiding twice keeps one entry.
  assert.deepEqual(plain(context.setStoredOverlayFarmTypeHidden('legion', true)), { ok: true, hidden: [CUSTOM_ID, 'legion'] });
  assert.deepEqual(plain(context.setStoredOverlayFarmTypeHidden('legion', false)), { ok: true, hidden: [CUSTOM_ID] });
  assert.deepEqual(plain(data['overlayHiddenFarmTypes:profile-1']), [CUSTOM_ID]);

  data.activeProfileId = 'profile-2';
  assert.deepEqual(plain(context.getStoredOverlayHiddenFarmTypes()), []);
});

test('an unknown farm type, a signed-out window and a damaged list change nothing', () => {
  const { data, context } = loadStore({ 'overlayHiddenFarmTypes:profile-1': ['breach', 7, '', 'breach', null] });
  assert.deepEqual(plain(context.getStoredOverlayHiddenFarmTypes()), ['breach']);
  assert.deepEqual(plain(context.setStoredOverlayFarmTypeHidden('no-such-type', true)), { ok: false, error: 'FARM_TYPE_NOT_FOUND' });

  data['overlayHiddenFarmTypes:profile-1'] = 'breach';
  assert.deepEqual(plain(context.getStoredOverlayHiddenFarmTypes()), []);

  data.activeProfileId = null;
  assert.deepEqual(plain(context.setStoredOverlayFarmTypeHidden('breach', true)), { ok: false, error: 'FARM_TYPE_NOT_FOUND' });
});

test('the start card leaves out hidden farm types but keeps the one selected on the Dashboard', () => {
  const context = loadFunctions(['normalizeStartMapPromptText', 'normalizeStartMapPromptFarmTypeOptions', 'showStartMapPromptOverlay'], {
    overlayStartMapPromptState: null,
    START_MAP_PROMPT_OVERLAY_GRACE_MS: 3000,
    getStoredFarmTypeCosts: () => ({}),
    getStoredOverlayHiddenFarmTypes: () => ['breach', 'ritual'],
    setTimeout() {},
    updateOverlayWindow() {}
  });
  const farmTypeOptions = [{ id: 'breach', label: 'Breach' }, { id: 'expedition', label: 'Expedition' }, { id: 'ritual', label: 'Ritual' }];

  context.showStartMapPromptOverlay({ mapName: 'Dunes', farmTypeId: 'expedition', farmTypeOptions });
  assert.deepEqual(plain(context.overlayStartMapPromptState.farmTypeOptions), [{ id: 'expedition', label: 'Expedition' }]);

  context.showStartMapPromptOverlay({ mapName: 'Dunes', farmTypeId: 'ritual', farmTypeOptions });
  assert.deepEqual(plain(context.overlayStartMapPromptState.farmTypeOptions.map((option) => option.id)), ['expedition', 'ritual']);
});

test('the hidden list is wired to the window and stays out of the settings it reads', () => {
  // The start card's builder is run on its own by other tests, so it must not need the store reader to exist.
  assert.match(mainSource, /typeof getStoredOverlayHiddenFarmTypes === 'function' \? getStoredOverlayHiddenFarmTypes\(\) : \[\]/);
  assert.match(mainSource, /ipcMain\.handle\('get-overlay-hidden-farm-types', \(\) => getStoredOverlayHiddenFarmTypes\(\)\);/);
  assert.match(mainSource, /ipcMain\.handle\('set-overlay-farm-type-hidden', \(event, farmTypeId, hidden\) => \{\n    assertDesktopUserAuthenticated\(\);\n    return setStoredOverlayFarmTypeHidden\(farmTypeId, hidden === true\);/);
  assert.match(mainSource, /key\.startsWith\('overlayHiddenFarmTypes:'\)/);
  assert.match(preloadSource, /getOverlayHiddenFarmTypes: \(\) => ipcRenderer\.invoke\('get-overlay-hidden-farm-types'\)/);
  assert.match(preloadSource, /setOverlayFarmTypeHidden: \(farmTypeId, hidden\) => ipcRenderer\.invoke\('set-overlay-farm-type-hidden', farmTypeId, hidden\)/);
});
