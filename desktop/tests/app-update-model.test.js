const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getAppUpdateSupportState,
  createAppUpdateState,
  applyAppUpdatePatch
} = require('../src/modules/appUpdateModel');

test('packaged windows runtime enables app updates while development mode stays disabled', () => {
  assert.deepEqual(
    getAppUpdateSupportState({ isPackaged: true, platform: 'win32' }),
    { enabled: true, supported: true }
  );

  assert.deepEqual(
    getAppUpdateSupportState({ isPackaged: false, platform: 'win32' }),
    { enabled: false, supported: false }
  );

  assert.deepEqual(
    getAppUpdateSupportState({ isPackaged: true, platform: 'darwin' }),
    { enabled: false, supported: false }
  );
});

test('update state tracks checking and availability', () => {
  const state = createAppUpdateState({
    currentVersion: '1.0.0',
    isPackaged: true,
    platform: 'win32'
  });

  applyAppUpdatePatch(state, {
    checking: true,
    available: true,
    nextVersion: '1.1.0'
  });

  applyAppUpdatePatch(state, {
    checking: false
  });

  assert.equal(state.enabled, true);
  assert.equal(state.supported, true);
  assert.equal(state.currentVersion, '1.0.0');
  assert.equal(state.nextVersion, '1.1.0');
  assert.equal(state.available, true);
  assert.equal(state.checking, false);
  assert.equal('downloaded' in state, false);
});
