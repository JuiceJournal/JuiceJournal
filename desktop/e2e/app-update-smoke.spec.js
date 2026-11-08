const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { once } = require('events');
const { test, expect } = require('playwright/test');
const { _electron: electron } = require('playwright');

const POE_ACCOUNT = {
  sub: 'app-update-smoke-ggg',
  username: 'UpdateAccount',
  characters: {
    poe1: [
      { id: 'poe1-update', name: 'UpdateRanger', level: 90, class: 'Ranger', ascendancy: 'Deadeye', league: 'Standard', current: true }
    ],
    poe2: []
  }
};

const IDLE_UPDATE = {
  enabled: true,
  supported: true,
  checking: false,
  available: false,
  currentVersion: '1.0.0',
  nextVersion: null,
  downloading: false,
  downloadPercent: null,
  verifying: false,
  readyToInstall: false,
  error: null,
  errorKind: null
};

async function startSmokeBackend() {
  const server = http.createServer((request, response) => {
    response.writeHead(404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ success: false, data: null, error: 'Unhandled smoke endpoint', errorCode: 'NOT_FOUND' }));
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

function createIsolatedProfile(apiUrl) {
  const tempRoot = path.join(os.tmpdir(), 'juice-journal-playwright');
  fs.mkdirSync(tempRoot, { recursive: true });
  const rootDir = fs.mkdtempSync(path.join(tempRoot, 'app-update-smoke-'));
  const appDataDir = path.join(rootDir, 'app-data');
  const userDataDir = path.join(rootDir, 'user-data');
  const tempDir = path.join(rootDir, 'temp');
  for (const dir of [appDataDir, userDataDir, tempDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(path.join(userDataDir, 'config.json'), JSON.stringify({
    apiUrl,
    language: 'en',
    poeVersion: 'poe1',
    autoStartSession: false,
    authToken: null,
    authTokenEncrypted: null,
    currentUserId: null
  }, null, '\t'));

  const bootstrapPath = path.join(rootDir, 'bootstrap.cjs');
  fs.writeFileSync(bootstrapPath, `
const path = require('path');
const { app } = require('electron');
require(${JSON.stringify(path.join(__dirname, 'network-stub.cjs'))});
const win32Probe = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'modules', 'win32Probe.js'))});

// The game detector finds no game, so the real process list and game log are never read.
win32Probe.scanProcesses = () => [];
win32Probe.findProcessWindow = () => null;

app.setPath('appData', process.env.JUICE_JOURNAL_E2E_APP_DATA_DIR);
app.setPath('userData', process.env.JUICE_JOURNAL_E2E_USER_DATA_DIR);
app.setPath('sessionData', path.join(process.env.JUICE_JOURNAL_E2E_USER_DATA_DIR, 'session-data'));
`, 'utf8');

  return {
    rootDir,
    bootstrapPath,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      JUICE_JOURNAL_FORCE_LIVE_AUTH: '1',
      JUICE_JOURNAL_E2E_APP_DATA_DIR: appDataDir,
      JUICE_JOURNAL_E2E_USER_DATA_DIR: userDataDir,
      JUICE_JOURNAL_E2E_POE_ACCOUNT: JSON.stringify(POE_ACCOUNT),
      TMP: tempDir,
      TEMP: tempDir
    }
  };
}

async function waitForAppWindow(electronApp) {
  await expect.poll(async () => {
    for (const page of electronApp.windows()) {
      if (/^Juice Journal$/i.test(await page.title().catch(() => ''))) {
        return true;
      }
    }
    return false;
  }, { timeout: 30000 }).toBe(true);

  for (const page of electronApp.windows()) {
    if (/^Juice Journal$/i.test(await page.title())) {
      return page;
    }
  }
  throw new Error('App window disappeared');
}

async function shutdownElectronApp(electronApp) {
  const childProcess = electronApp.process();
  const exited = childProcess.exitCode === null ? once(childProcess, 'exit') : Promise.resolve();
  await electronApp.evaluate(({ app, BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.destroy();
    }
    app.exit(0);
  }).catch(() => {});
  await exited;
}

// A dev build has no update flow, so the state the main process would broadcast is applied directly.
const applyUpdate = (page, patch) => page.evaluate(
  (update) => applyAppUpdateState(update),
  { ...IDLE_UPDATE, ...patch }
);

test('app update smoke: the About tab and toasts follow download, verify, ready and failure', async ({}, testInfo) => {
  test.setTimeout(90000);
  const backend = await startSmokeBackend();
  const profile = createIsolatedProfile(backend.baseUrl);
  let electronApp;

  try {
    electronApp = await electron.launch({
      args: ['-r', profile.bootstrapPath, path.join(__dirname, '..')],
      cwd: path.join(__dirname, '..'),
      env: profile.env
    });
    const page = await waitForAppWindow(electronApp);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#poe-oauth-login')).toBeEnabled();
    await page.locator('#poe-oauth-login').click();
    await expect(page.locator('#login-modal')).toBeHidden();

    await page.locator('.nav-btn[data-page="settings"]').click();
    await page.locator('.settings-nav-btn[data-settings-tab="about"]').click();

    const status = page.locator('#app-update-status');
    const action = page.locator('#app-update-action-btn');
    const downloadPage = page.locator('#open-update-page-btn');
    const check = page.locator('#check-updates-btn');
    const toasts = page.locator('.toast');

    // Up to date: nothing to act on.
    await applyUpdate(page, {});
    await expect(status).toHaveText('This app is up to date.');
    await expect(action).toBeHidden();
    await expect(downloadPage).toBeHidden();

    // Available: the toast and the tab both offer the download, and the release page stays as the manual way.
    await applyUpdate(page, { available: true, nextVersion: '1.0.1' });
    await expect(status).toHaveText('Update available: 1.0.1');
    await expect(action).toBeEnabled();
    await expect(action).toHaveText('Download Update');
    await expect(downloadPage).toBeVisible();
    await expect(toasts.filter({ hasText: 'Update available' }).getByRole('button', { name: 'Download Update' })).toBeVisible();

    // Clicking the tab's button confirms the download has started.
    await action.click();
    await expect(toasts.filter({ hasText: 'Downloading update' })).toBeVisible();

    // Downloading and verifying: the buttons wait.
    await applyUpdate(page, { available: true, nextVersion: '1.0.1', downloading: true, downloadPercent: 42 });
    await expect(action).toBeDisabled();
    await expect(action).toHaveText('Downloading... 42%');
    await expect(check).toBeDisabled();

    await applyUpdate(page, { available: true, nextVersion: '1.0.1', verifying: true });
    await expect(action).toBeDisabled();
    await expect(action).toHaveText('Verifying...');

    // Ready: only now does the app offer to install, and the manual route is gone.
    await applyUpdate(page, { available: true, nextVersion: '1.0.1', readyToInstall: true });
    await expect(status).toHaveText('Version 1.0.1 is verified and ready to install.');
    await expect(action).toBeEnabled();
    await expect(action).toHaveText('Restart and Install');
    await expect(downloadPage).toBeHidden();
    await expect(check).toBeEnabled();
    await expect(toasts.filter({ hasText: 'Update ready' }).getByRole('button', { name: 'Restart and Install' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('ready.png') });

    // Failed signature: no button offers that release again, and the user is told why.
    await applyUpdate(page, {
      available: true,
      nextVersion: '1.0.1',
      error: 'The update failed its signature check.',
      errorKind: 'signature'
    });
    const signatureFailure = 'This update failed its signature check and was not installed.';
    await expect(status).toHaveText(signatureFailure);
    await expect(page.locator('#app-update-detail')).toHaveText('');
    await expect(action).toBeHidden();
    await expect(downloadPage).toBeHidden();
    await expect(toasts.filter({ hasText: signatureFailure })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('signature-failed.png') });

    // Failed download: it can be retried, and the release page is still offered.
    await applyUpdate(page, {
      available: true,
      nextVersion: '1.0.1',
      error: 'network down',
      errorKind: 'download'
    });
    await expect(status).toHaveText('Update download failed.');
    await expect(page.locator('#app-update-detail')).toHaveText('network down');
    await expect(action).toBeEnabled();
    await expect(action).toHaveText('Download Update');
    await expect(downloadPage).toBeVisible();

    // A failed check stays on the tab, so a machine without a connection gets no error toast at each launch.
    const errorToasts = await toasts.filter({ hasText: 'Update check failed.' }).count();
    await applyUpdate(page, { error: 'offline', errorKind: 'check' });
    await expect(status).toHaveText('Update check failed.');
    await expect(toasts.filter({ hasText: 'Update check failed.' })).toHaveCount(errorToasts);
  } finally {
    if (electronApp) {
      await shutdownElectronApp(electronApp);
    }
    backend.server.close();
    fs.rmSync(profile.rootDir, { recursive: true, force: true });
  }
});
