const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { test, expect } = require('playwright/test');
const { _electron: electron } = require('playwright');

// The electron package's main export is the path of its binary.
const ELECTRON_BINARY = require('electron');
const APP_DIR = path.join(__dirname, '..');

function createIsolatedProfile() {
  const tempRoot = path.join(os.tmpdir(), 'juice-journal-playwright');
  fs.mkdirSync(tempRoot, { recursive: true });
  const rootDir = fs.mkdtempSync(path.join(tempRoot, 'single-instance-'));
  const appDataDir = path.join(rootDir, 'app-data');
  const userDataDir = path.join(rootDir, 'user-data');
  const tempDir = path.join(rootDir, 'temp');
  for (const dir of [appDataDir, userDataDir, tempDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(path.join(userDataDir, 'config.json'), JSON.stringify({
    apiUrl: 'http://127.0.0.1:9',
    language: 'en',
    poeVersion: 'poe2',
    autoStartSession: false,
    notifications: false,
    overlayEnabled: false,
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

const userDataDir = process.env.JUICE_JOURNAL_E2E_USER_DATA_DIR;
app.setPath('appData', process.env.JUICE_JOURNAL_E2E_APP_DATA_DIR);
app.setPath('userData', userDataDir);
app.setPath('sessionData', path.join(userDataDir, 'session-data'));
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
      TMP: tempDir,
      TEMP: tempDir
    }
  };
}

async function waitForWindow(electronApp, expectedTitle) {
  const timeoutAt = Date.now() + 30000;
  while (Date.now() < timeoutAt) {
    for (const page of electronApp.windows()) {
      try {
        if (expectedTitle.test(await page.title())) {
          return page;
        }
      } catch {
        // Ignore windows that are still initializing.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for a window matching ${expectedTitle}`);
}

async function shutdownElectronApp(electronApp) {
  const childProcess = electronApp.process();
  const exited = new Promise((resolve) => childProcess.once('exit', resolve));
  await electronApp.evaluate(({ app, BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.destroy();
    }
    app.exit(0);
  }).catch(() => {});
  await exited;
}

// A second launch of the same app with the same profile folder, as a click on the shortcut starts it.
function launchAgain(profile) {
  return new Promise((resolve, reject) => {
    const child = spawn(ELECTRON_BINARY, ['-r', profile.bootstrapPath, APP_DIR], { cwd: APP_DIR, env: profile.env, stdio: 'ignore' });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('A second launch did not exit within 20 seconds'));
    }, 20000);
    child.once('error', reject);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

const mainWindowState = (electronApp) => electronApp.evaluate(({ BrowserWindow }) => {
  const windows = BrowserWindow.getAllWindows();
  const main = windows.find((window) => window.getTitle() === 'Juice Journal');
  return { count: windows.length, visible: Boolean(main?.isVisible()) };
});

test('single instance smoke: further launches exit and bring the running window back from the tray', async () => {
  test.setTimeout(120000);
  const profile = createIsolatedProfile();
  let electronApp = null;

  try {
    electronApp = await electron.launch({ args: ['-r', profile.bootstrapPath, APP_DIR], cwd: APP_DIR, env: profile.env });
    await waitForWindow(electronApp, /^Juice Journal$/i);
    const before = await mainWindowState(electronApp);
    expect(before.visible).toBe(true);

    // In the tray, as after closing the window.
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Juice Journal').hide();
    });
    expect((await mainWindowState(electronApp)).visible).toBe(false);

    expect(await launchAgain(profile)).toBe(0);
    await expect.poll(async () => (await mainWindowState(electronApp)).visible).toBe(true);
    expect((await mainWindowState(electronApp)).count).toBe(before.count);

    // Many clicks at once: every one of them exits, and the running app stays the only one.
    const codes = await Promise.all(Array.from({ length: 5 }, () => launchAgain(profile)));
    expect(codes).toEqual([0, 0, 0, 0, 0]);
    const after = await mainWindowState(electronApp);
    expect(after).toEqual({ count: before.count, visible: true });
  } finally {
    if (electronApp) {
      await shutdownElectronApp(electronApp);
    }
    fs.rmSync(profile.rootDir, { recursive: true, force: true });
  }
});
