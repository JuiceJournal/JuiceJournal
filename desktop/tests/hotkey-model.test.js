const test = require('node:test');
const assert = require('node:assert/strict');

const HOTKEY_MODEL_REQUEST = '../src/modules/hotkeyModel';

function isDirectMissingModule(error, request) {
  return error?.code === 'MODULE_NOT_FOUND'
    && error.message.includes(`Cannot find module '${request}'`);
}

function loadHotkeyModel() {
  try {
    return require(HOTKEY_MODEL_REQUEST);
  } catch (error) {
    if (!isDirectMissingModule(error, HOTKEY_MODEL_REQUEST)) {
      throw error;
    }

    return { __loadError: error };
  }
}

function getHotkeyModelExport(exportName) {
  const hotkeyModel = loadHotkeyModel();

  if (hotkeyModel.__loadError) {
    const { code, message } = hotkeyModel.__loadError;
    assert.fail(
      `Expected desktop/src/modules/hotkeyModel.js to exist and export ${exportName}. Current red state: ${code || 'LOAD_ERROR'}: ${message}`
    );
  }

  assert.equal(
    typeof hotkeyModel[exportName],
    'function',
    `Expected hotkeyModel.${exportName} to be a function`
  );

  return hotkeyModel[exportName];
}

test('hotkey model rejects duplicate accelerators', () => {
  const validateHotkeys = getHotkeyModelExport('validateHotkeys');

  assert.throws(
    () => validateHotkeys({ scanHotkey: 'F9', stashScanHotkey: 'F9' }),
    /must be unique/i
  );
});

test('hotkey model normalizes accelerator casing and modifier aliases', () => {
  const normalizeAccelerator = getHotkeyModelExport('normalizeAccelerator');

  assert.equal(
    normalizeAccelerator(' ctrl + shift + l '),
    'CommandOrControl+Shift+L'
  );
  assert.equal(
    normalizeAccelerator('f9'),
    'F9'
  );
});

test('hotkey model formats keyboard events into electron accelerators', () => {
  const formatKeyboardEventToAccelerator = getHotkeyModelExport('formatKeyboardEventToAccelerator');

  assert.equal(
    formatKeyboardEventToAccelerator({
      key: 'l',
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false
    }),
    'CommandOrControl+Shift+L'
  );

  assert.equal(
    formatKeyboardEventToAccelerator({
      key: 'F9',
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false
    }),
    'F9'
  );
});

test('hotkey model formats accelerators for human-friendly display', () => {
  const formatAcceleratorForDisplay = getHotkeyModelExport('formatAcceleratorForDisplay');

  assert.equal(
    formatAcceleratorForDisplay('CommandOrControl+Shift+L'),
    'Ctrl+Shift+L'
  );
  assert.equal(
    formatAcceleratorForDisplay('Alt+F10'),
    'Alt+F10'
  );
});

test('hotkey model enables the OCR hotkeys only during a session with the game window in front', () => {
  const shouldEnableScanHotkeys = getHotkeyModelExport('shouldEnableScanHotkeys');
  const gameProcessIds = [4120, 7788];

  assert.equal(shouldEnableScanHotkeys({ hasActiveSession: true, foregroundProcessId: 7788, gameProcessIds }), true);
  assert.equal(shouldEnableScanHotkeys({ hasActiveSession: false, foregroundProcessId: 7788, gameProcessIds }), false);
  assert.equal(shouldEnableScanHotkeys({ hasActiveSession: true, foregroundProcessId: 900, gameProcessIds }), false);
  assert.equal(shouldEnableScanHotkeys({ hasActiveSession: true, foregroundProcessId: 0, gameProcessIds }), false);
  assert.equal(shouldEnableScanHotkeys({ hasActiveSession: true, foregroundProcessId: 7788, gameProcessIds: [] }), false);
  assert.equal(shouldEnableScanHotkeys({ hasActiveSession: true, foregroundProcessId: 7788, gameProcessIds: ['7788'] }), true);
});

test('hotkey model falls back to the session alone when the foreground window cannot be read', () => {
  const shouldEnableScanHotkeys = getHotkeyModelExport('shouldEnableScanHotkeys');

  assert.equal(shouldEnableScanHotkeys({ hasActiveSession: true, foregroundProcessId: null, gameProcessIds: [] }), true);
  assert.equal(shouldEnableScanHotkeys({ hasActiveSession: false, foregroundProcessId: null, gameProcessIds: [] }), false);
  assert.equal(shouldEnableScanHotkeys(), false);
});
