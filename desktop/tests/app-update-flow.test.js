const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { createAppUpdateState } = require('../src/modules/appUpdateModel');
const { createAppUpdateFlow } = require('../src/modules/appUpdateFlow');

function setup({ verify = async () => true, attemptedVersion = null, currentVersion = '1.0.0' } = {}) {
  const updater = new EventEmitter();
  updater.installerPath = 'C:/cache/installer.exe';
  updater.calls = { check: 0, download: 0, install: [] };
  updater.checkForUpdates = async () => { updater.calls.check += 1; };
  updater.downloadUpdate = async () => { updater.calls.download += 1; };
  updater.quitAndInstall = (...args) => { updater.calls.install.push(args); };

  const state = createAppUpdateState({ currentVersion, isPackaged: true, platform: 'win32' });
  const verifyCalls = [];
  const pending = { value: attemptedVersion };
  const pendingInstall = {
    read: () => pending.value,
    write: (version) => { pending.value = version; },
    clear: () => { pending.value = null; }
  };
  const flow = createAppUpdateFlow({
    updater,
    state,
    onChange: () => {},
    normalizeError: (error) => error.message,
    pendingInstall,
    verify: async (args) => {
      verifyCalls.push(args);
      return verify(args);
    }
  });
  return { updater, state, flow, verifyCalls, pending, pendingInstall };
}

async function finishDownload(updater, overrides = {}) {
  const listener = updater.listeners('update-downloaded')[0];
  await listener({
    version: overrides.version || '1.0.1',
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
  assert.equal(await flow.beginInstall(), true);
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
    assert.equal(await flow.beginInstall(), false);
  });
}

test('install is refused before any download', async () => {
  const { flow, verifyCalls } = setup();

  assert.equal(await flow.beginInstall(), false);
  assert.equal(verifyCalls.length, 0);
});

test('the signature is checked again before install, on the file that will run', async () => {
  const { updater, flow, verifyCalls } = setup();
  updater.emit('update-available', { version: '1.0.1' });
  flow.download();
  await finishDownload(updater, { downloadedFile: 'C:/cache/downloaded.exe' });
  updater.installerPath = 'C:/cache/other.exe';

  await flow.beginInstall();

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

  assert.equal(await flow.beginInstall(), false);
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
  assert.equal(await flow.beginInstall(), false);
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
  assert.equal(await flow.beginInstall(), false);
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

async function readyToInstall(options) {
  const context = setup(options);
  context.updater.emit('update-available', { version: '1.0.1' });
  context.flow.download();
  await finishDownload(context.updater);
  return context;
}

test('install runs silently and reopens the app, once the install has begun', async () => {
  const { updater, flow, pending } = await readyToInstall();

  assert.equal(await flow.beginInstall(), true);
  assert.equal(flow.install(), true);

  assert.deepEqual(updater.calls.install, [[true, true]]);
  assert.equal(pending.value, '1.0.1');
});

test('install refuses when no verified install has begun', async () => {
  const fresh = setup();
  assert.equal(fresh.flow.install(), false);

  const { updater, flow } = await readyToInstall();
  assert.equal(flow.install(), false);
  assert.deepEqual(updater.calls.install, []);
});

// The quit saves the running map first, and the window stays live for those seconds.
test('nothing can replace the verified installer while the quit is saving', async () => {
  const { updater, state, flow, verifyCalls } = await readyToInstall();
  assert.equal(await flow.beginInstall(), true);
  const verifiedChecks = verifyCalls.length;

  updater.emit('checking-for-update');
  updater.emit('update-available', { version: '1.0.2' });
  await flow.check();
  flow.download();
  await finishDownload(updater, { version: '1.0.2', downloadedFile: 'C:/cache/evil.exe' });
  updater.emit('update-not-available');
  updater.emit('error', new Error('offline'));

  assert.equal(updater.calls.check, 0);
  assert.equal(updater.calls.download, 1);
  assert.equal(verifyCalls.length, verifiedChecks);
  assert.equal(state.nextVersion, '1.0.1');
  assert.equal(state.installing, true);
  assert.equal(flow.install(), true);
});

test('install refuses a file other than the one it verified', async () => {
  const { updater, flow } = await readyToInstall();
  await flow.beginInstall();

  updater.installerPath = 'C:/cache/evil.exe';

  assert.equal(flow.install(), false);
  assert.deepEqual(updater.calls.install, []);
});

test('a second install request while one has begun is ignored', async () => {
  const { flow, verifyCalls } = await readyToInstall();
  await flow.beginInstall();
  const verifiedChecks = verifyCalls.length;

  assert.equal(await flow.beginInstall(), false);
  assert.equal(verifyCalls.length, verifiedChecks);
});

test('a second install request during the verify is ignored', async () => {
  const { flow } = await readyToInstall();

  const first = flow.beginInstall();
  assert.equal(await flow.beginInstall(), false);
  assert.equal(await first, true);
});

test('install is refused when the updater no longer has a file', async () => {
  const { updater, state, flow } = await readyToInstall();
  updater.installerPath = null;

  assert.equal(await flow.beginInstall(), false);
  assert.equal(state.errorKind, 'signature');
});

for (const [name, fields] of [
  ['a web installer package', { packages: { x64: { path: 'evil.7z' } } }],
  ['an elevated install request', { files: [{ url: 'setup.exe', isAdminRightsRequired: true }] }]
]) {
  test(`${name} in latest.yml is refused even with a valid signature`, async () => {
    const { updater, state, flow, verifyCalls } = setup();
    updater.emit('update-available', { version: '1.0.1' });
    flow.download();

    await finishDownload(updater, fields);

    assert.equal(verifyCalls.length, 0);
    assert.equal(state.readyToInstall, false);
    assert.equal(state.errorKind, 'signature');
  });
}

test('a download that throws at once does not stay stuck on downloading', () => {
  const { updater, state, flow } = setup();
  updater.emit('update-available', { version: '1.0.1' });
  updater.downloadUpdate = () => { throw new Error('latest.yml lists no files'); };

  flow.download();

  assert.equal(state.downloading, false);
  assert.equal(state.errorKind, 'download');
  assert.equal(state.error, 'latest.yml lists no files');
});

test('download and install wait for a running check', async () => {
  const { updater, state, flow } = await readyToInstall();
  updater.emit('checking-for-update');
  assert.equal(await flow.beginInstall(), false);
  assert.equal(state.installing, false);

  const offered = setup();
  offered.updater.emit('update-available', { version: '1.0.1' });
  offered.updater.emit('checking-for-update');
  offered.flow.download();
  assert.equal(offered.updater.calls.download, 0);
});

test('a version unchanged after an install attempt is reported, once', () => {
  const { state, pending } = setup({ attemptedVersion: '1.0.1', currentVersion: '1.0.0' });

  assert.equal(state.installFailedVersion, '1.0.1');
  assert.equal(pending.value, null);
});

test('a version installed by hand after a failed attempt reports nothing', () => {
  const { state } = setup({ attemptedVersion: '1.0.9', currentVersion: '1.0.10' });

  assert.equal(state.installFailedVersion, null);
});

test('a record that cannot be written does not stop the install', async () => {
  const { updater, flow, pendingInstall } = await readyToInstall();
  pendingInstall.write = () => { throw new Error('disk full'); };
  await flow.beginInstall();

  assert.equal(flow.install(), true);
  assert.deepEqual(updater.calls.install, [[true, true]]);
});

test('a completed update reports nothing', () => {
  const { state, pending } = setup({ attemptedVersion: '1.0.1', currentVersion: '1.0.1' });

  assert.equal(state.installFailedVersion, null);
  assert.equal(pending.value, null);
});
