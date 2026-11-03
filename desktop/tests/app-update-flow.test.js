const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { createAppUpdateState } = require('../src/modules/appUpdateModel');
const { createAppUpdateFlow } = require('../src/modules/appUpdateFlow');

function setup({ verify = async () => true } = {}) {
  const updater = new EventEmitter();
  updater.installerPath = 'C:/cache/installer.exe';
  updater.calls = { check: 0, download: 0, install: [] };
  updater.checkForUpdates = async () => { updater.calls.check += 1; };
  updater.downloadUpdate = async () => { updater.calls.download += 1; };
  updater.quitAndInstall = (...args) => { updater.calls.install.push(args); };

  const state = createAppUpdateState({ currentVersion: '1.0.0', isPackaged: true, platform: 'win32' });
  const verifyCalls = [];
  const flow = createAppUpdateFlow({
    updater,
    state,
    onChange: () => {},
    normalizeError: (error) => error.message,
    verify: async (args) => {
      verifyCalls.push(args);
      return verify(args);
    }
  });
  return { updater, state, flow, verifyCalls };
}

async function finishDownload(updater, overrides = {}) {
  const listener = updater.listeners('update-downloaded')[0];
  await listener({
    version: '1.0.1',
    juiceJournalSignature: 'signature',
    downloadedFile: 'C:/cache/installer.exe',
    ...overrides
  });
}

test('nothing downloads or installs on its own', () => {
  const { updater } = setup();

  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  assert.equal(updater.disableWebInstaller, true);
  assert.equal(updater.disableDifferentialDownload, true);
  updater.emit('update-available', { version: '1.0.1' });
  assert.equal(updater.calls.download, 0);
  assert.equal(updater.calls.install.length, 0);
});

test('download does nothing until an update is available', () => {
  const { updater, flow } = setup();

  flow.download();

  assert.equal(updater.calls.download, 0);
});

test('a second download request while one runs is ignored', () => {
  const { updater, state, flow } = setup();
  updater.emit('update-available', { version: '1.0.1' });

  flow.download();
  flow.download();

  assert.equal(updater.calls.download, 1);
  assert.equal(state.downloading, true);
});

test('progress is reported in whole percents', () => {
  const { updater, state, flow } = setup();
  updater.emit('update-available', { version: '1.0.1' });
  flow.download();

  updater.emit('download-progress', { percent: 41.7 });

  assert.equal(state.downloadPercent, 41);
});

test('a valid signature makes the update installable', async () => {
  const { updater, state, flow, verifyCalls } = setup();
  updater.emit('update-available', { version: '1.0.1' });
  flow.download();

  await finishDownload(updater);

  assert.deepEqual(verifyCalls[0], { file: 'C:/cache/installer.exe', version: '1.0.1', signature: 'signature' });
  assert.equal(state.downloading, false);
  assert.equal(state.verifying, false);
  assert.equal(state.readyToInstall, true);
  assert.equal(await flow.verifyForInstall(), true);
});

for (const [name, verify] of [
  ['an invalid signature', async () => false],
  ['a failed check', async () => { throw new Error('file is gone'); }]
]) {
  test(`${name} blocks the install`, async () => {
    const { updater, state, flow } = setup({ verify });
    updater.emit('update-available', { version: '1.0.1' });
    flow.download();

    await finishDownload(updater);

    assert.equal(state.readyToInstall, false);
    assert.equal(state.errorKind, 'signature');
    assert.equal(await flow.verifyForInstall(), false);
  });
}

test('install is refused before any download', async () => {
  const { flow, verifyCalls } = setup();

  assert.equal(await flow.verifyForInstall(), false);
  assert.equal(verifyCalls.length, 0);
});

test('the signature is checked again before install, on the file that will run', async () => {
  const { updater, flow, verifyCalls } = setup();
  updater.emit('update-available', { version: '1.0.1' });
  flow.download();
  await finishDownload(updater, { downloadedFile: 'C:/cache/downloaded.exe' });
  updater.installerPath = 'C:/cache/other.exe';

  await flow.verifyForInstall();

  assert.equal(verifyCalls.length, 2);
  assert.deepEqual(verifyCalls[1], { file: 'C:/cache/other.exe', version: '1.0.1', signature: 'signature' });
});

test('an installer changed after download is refused at install time', async () => {
  let valid = true;
  const { updater, state, flow } = setup({ verify: async () => valid });
  updater.emit('update-available', { version: '1.0.1' });
  flow.download();
  await finishDownload(updater);
  valid = false;

  assert.equal(await flow.verifyForInstall(), false);
  assert.equal(state.readyToInstall, false);
  assert.equal(state.errorKind, 'signature');
});

test('a newer version found after a verified download must be downloaded and verified itself', async () => {
  const { updater, state, flow } = setup();
  updater.emit('update-available', { version: '1.0.1' });
  flow.download();
  await finishDownload(updater);

  updater.emit('update-available', { version: '1.0.2' });

  assert.equal(state.readyToInstall, false);
  assert.equal(await flow.verifyForInstall(), false);
});

test('finding the same version again keeps a verified download', async () => {
  const { updater, state, flow } = setup();
  updater.emit('update-available', { version: '1.0.1' });
  flow.download();
  await finishDownload(updater);

  updater.emit('update-available', { version: '1.0.1' });

  assert.equal(state.readyToInstall, true);
});

test('the update being withdrawn clears a verified download', async () => {
  const { updater, state, flow } = setup();
  updater.emit('update-available', { version: '1.0.1' });
  flow.download();
  await finishDownload(updater);

  updater.emit('update-not-available');

  assert.equal(state.readyToInstall, false);
  assert.equal(await flow.verifyForInstall(), false);
});

test('a failed download can be retried', () => {
  const { updater, state, flow } = setup();
  updater.emit('update-available', { version: '1.0.1' });
  flow.download();

  updater.emit('error', new Error('network down'));

  assert.equal(state.downloading, false);
  assert.equal(state.errorKind, 'download');
  assert.equal(state.error, 'network down');

  flow.download();

  assert.equal(updater.calls.download, 2);
  assert.equal(state.error, null);
});

test('a failed check is not reported as a failed download', () => {
  const { updater, state } = setup();

  updater.emit('error', new Error('offline'));

  assert.equal(state.errorKind, 'check');
});

test('update checks wait for a running download', async () => {
  const { updater, flow } = setup();
  updater.emit('update-available', { version: '1.0.1' });
  flow.download();

  await flow.check();

  assert.equal(updater.calls.check, 0);
});

test('install runs silently and reopens the app', () => {
  const { updater, flow } = setup();

  flow.install();

  assert.deepEqual(updater.calls.install, [[true, true]]);
});
