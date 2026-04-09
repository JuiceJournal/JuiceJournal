const test = require('node:test');
const assert = require('node:assert/strict');

const SETTINGS_MODEL_REQUEST = '../src/modules/settingsModel';

function isDirectMissingModule(error, request) {
  return error?.code === 'MODULE_NOT_FOUND'
    && error.message.includes(`Cannot find module '${request}'`);
}

function loadSettingsModel() {
  try {
    return require(SETTINGS_MODEL_REQUEST);
  } catch (error) {
    if (!isDirectMissingModule(error, SETTINGS_MODEL_REQUEST)) {
      throw error;
    }

    return { __loadError: error };
  }
}

function getSettingsModelExport(exportName) {
  const settingsModel = loadSettingsModel();

  if (settingsModel.__loadError) {
    const { code, message } = settingsModel.__loadError;
    assert.fail(
      `Expected desktop/src/modules/settingsModel.js to exist and export ${exportName}. Current red state: ${code || 'LOAD_ERROR'}: ${message}`
    );
  }

  assert.equal(
    typeof settingsModel[exportName],
    'function',
    `Expected settingsModel.${exportName} to be a function`
  );

  return settingsModel[exportName];
}

test('settings model prefers active leagues over free text when options are available', () => {
  const deriveLeagueFieldState = getSettingsModelExport('deriveLeagueFieldState');

  const result = deriveLeagueFieldState({
    settingsVersion: 'poe1',
    storedLeague: 'Standard',
    activeLeagues: ['Mercenaries', 'Hardcore Mercenaries']
  });

  assert.equal(result.controlType, 'select');
  assert.deepEqual(result.options, ['Mercenaries', 'Hardcore Mercenaries']);
  assert.equal(result.value, 'Mercenaries');
});

test('reset defaults does not mutate authenticated header state', () => {
  const buildResetSettingsDraft = getSettingsModelExport('buildResetSettingsDraft');

  const result = buildResetSettingsDraft({
    settings: { language: 'tr', apiUrl: 'http://localhost:3001', poeVersion: 'poe2' },
    currentUser: { username: 'Esquetta4179' }
  });

  assert.deepEqual(result.settings, {
    apiUrl: 'http://localhost:3001',
    poePath: '',
    autoStartSession: true,
    notifications: true,
    soundNotifications: false,
    language: 'en',
    scanHotkey: 'F9',
    stashScanHotkey: 'Ctrl+Shift+L',
    defaultLeaguePoe1: 'Standard',
    defaultLeaguePoe2: 'Standard',
    poeVersion: 'poe1'
  });
  assert.equal(result.headerUsername, 'Esquetta4179');
});
