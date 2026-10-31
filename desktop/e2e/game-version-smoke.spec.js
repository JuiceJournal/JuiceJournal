const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { once } = require('events');
const { test, expect } = require('playwright/test');
const { _electron: electron } = require('playwright');

// The game detector polls the process list every 5 seconds.
const DETECTION_TIMEOUT_MS = 15000;

const POE_ACCOUNT = {
  sub: 'game-version-smoke-ggg',
  username: 'GameVersionAccount',
  characters: {
    poe1: [{ id: 'poe1-legion', name: 'LegionRanger', level: 95, class: 'Ranger', ascendancy: 'Deadeye', league: 'Standard', current: true }],
    poe2: [{ id: 'poe2-monk', name: 'MonkTwo', level: 80, class: 'Monk', ascendancy: 'Invoker', league: 'Standard', current: true }]
  }
};

function toSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'game-version-smoke';
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
}

async function startSmokeBackend() {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    requests.push(`${request.method} ${url.pathname}`);

    writeJson(response, 404, {
      success: false,
      data: null,
      error: `Unhandled smoke endpoint: ${request.method} ${url.pathname}`,
      errorCode: 'NOT_FOUND',
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Smoke backend did not expose a TCP port');
  }

  return {
    server,
    requests,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

function createIsolatedProfile(testInfo, apiUrl) {
  const tempRoot = path.join(os.tmpdir(), 'juice-journal-playwright');
  fs.mkdirSync(tempRoot, { recursive: true });
  const rootDir = fs.mkdtempSync(path.join(tempRoot, `${toSlug(testInfo.title)}-`));
  const appDataDir = path.join(rootDir, 'app-data');
  const userDataDir = path.join(rootDir, 'user-data');
  const tempDir = path.join(rootDir, 'temp');
  // Fake PoE 1 and PoE 2 installs: the detector finds Client.txt next to the process, so the real ones are never read.
  const gameDir = path.join(rootDir, 'Path of Exile');
  const clientLogPath = path.join(gameDir, 'logs', 'Client.txt');
  const poe2GameDir = path.join(rootDir, 'Path of Exile 2');
  const poe2ClientLogPath = path.join(poe2GameDir, 'logs', 'Client.txt');
  const processesPath = path.join(rootDir, 'processes.json');

  fs.rmSync(rootDir, { recursive: true, force: true });
  fs.mkdirSync(appDataDir, { recursive: true });
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });
  for (const logPath of [clientLogPath, poe2ClientLogPath]) {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.writeFileSync(logPath, '');
  }
  fs.writeFileSync(processesPath, '[]');

  // The store has to survive the relaunch, so the spec writes it once here instead of in the bootstrap.
  fs.writeFileSync(path.join(userDataDir, 'config.json'), JSON.stringify({
    apiUrl,
    language: 'en',
    poeVersion: 'poe2',
    lastDetectedPoeVersion: 'poe2',
    poePath: clientLogPath,
    autoStartSession: false,
    authToken: null,
    authTokenEncrypted: null,
    currentUserId: null
  }, null, '\t'));

  return {
    rootDir,
    userDataDir,
    processesPath,
    poe1Process: { Name: 'PathOfExile.exe', ProcessId: 999901, ExecutablePath: path.join(gameDir, 'PathOfExile.exe') },
    poe2Process: { Name: 'PathOfExile2.exe', ProcessId: 999902, ExecutablePath: path.join(poe2GameDir, 'PathOfExile2.exe') },
    env: {
      ...process.env,
      NODE_ENV: 'test',
      JUICE_JOURNAL_FORCE_LIVE_AUTH: '1',
      JUICE_JOURNAL_E2E_APP_DATA_DIR: appDataDir,
      JUICE_JOURNAL_E2E_USER_DATA_DIR: userDataDir,
      JUICE_JOURNAL_E2E_PROCESSES_PATH: processesPath,
      JUICE_JOURNAL_E2E_POE_ACCOUNT: JSON.stringify(POE_ACCOUNT),
      TMP: tempDir,
      TEMP: tempDir,
    },
  };
}

function createBootstrapScript(testInfo) {
  const bootstrapRoot = path.join(os.tmpdir(), 'juice-journal-playwright');
  fs.mkdirSync(bootstrapRoot, { recursive: true });
  const bootstrapDir = fs.mkdtempSync(path.join(bootstrapRoot, `${toSlug(testInfo.title)}-bootstrap-`));
  const bootstrapPath = path.join(bootstrapDir, 'bootstrap.cjs');
  fs.writeFileSync(bootstrapPath, `
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
require(${JSON.stringify(path.join(__dirname, 'network-stub.cjs'))});
const win32Probe = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'modules', 'win32Probe.js'))});

const appDataDir = process.env.JUICE_JOURNAL_E2E_APP_DATA_DIR;
const userDataDir = process.env.JUICE_JOURNAL_E2E_USER_DATA_DIR;
const processesPath = process.env.JUICE_JOURNAL_E2E_PROCESSES_PATH;

if (!appDataDir || !userDataDir || !processesPath) {
  throw new Error('Missing smoke harness path overrides');
}

// The game detector sees the process list the spec writes, never the real one, and finds no game window.
let lastProcesses = [];
win32Probe.scanProcesses = () => {
  try {
    lastProcesses = JSON.parse(fs.readFileSync(processesPath, 'utf8'));
  } catch {
    // A read that races the spec's write keeps the last list.
  }
  return lastProcesses;
};
win32Probe.findProcessWindow = () => null;

app.setPath('appData', appDataDir);
app.setPath('userData', userDataDir);
app.setPath('sessionData', path.join(userDataDir, 'session-data'));
`, 'utf8');

  return {
    bootstrapDir,
    bootstrapPath,
  };
}

async function waitForAppWindow(electronApp, expectedTitle) {
  const timeoutAt = Date.now() + 30000;

  while (Date.now() < timeoutAt) {
    const windows = electronApp.windows();
    for (const page of windows) {
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

  throw new Error(`Timed out waiting for app window matching ${expectedTitle}`);
}

async function waitForGuestReady(page) {
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#login-modal')).toBeVisible();
  await expect(page.locator('#poe-oauth-login')).toBeVisible();
  await expect(page.locator('#poe-oauth-login')).toBeEnabled();
  await expect(page.locator('#username')).toHaveText('Guest');
}

async function signIn(page) {
  await page.locator('#poe-oauth-login').click();
  await expect(page.locator('#login-modal')).toBeHidden();
  await expect(page.locator('#username')).toHaveText(POE_ACCOUNT.username);
}

async function closeServer(server) {
  if (!server?.listening) {
    return;
  }

  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function waitForProcessExit(childProcess, timeoutMs) {
  if (!childProcess) {
    return { exitCode: null, signal: null };
  }

  if (childProcess.exitCode !== null) {
    return {
      exitCode: childProcess.exitCode,
      signal: childProcess.signalCode,
    };
  }

  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      childProcess.off('exit', handleExit);
      childProcess.off('error', handleError);
      reject(new Error(`Electron process did not exit within ${timeoutMs}ms`));
    }, timeoutMs);

    function handleExit(exitCode, signal) {
      clearTimeout(timeout);
      childProcess.off('error', handleError);
      resolve({ exitCode, signal });
    }

    function handleError(error) {
      clearTimeout(timeout);
      childProcess.off('exit', handleExit);
      reject(error);
    }

    childProcess.once('exit', handleExit);
    childProcess.once('error', handleError);
  });
}

async function shutdownElectronApp(electronApp) {
  const childProcess = electronApp?.process?.();
  const cleanupErrors = [];

  try {
    await electronApp.evaluate(({ app, BrowserWindow }) => {
      for (const window of BrowserWindow.getAllWindows()) {
        window.destroy();
      }

      app.exit(0);
    });
  } catch (error) {
    if (!childProcess || childProcess.exitCode === null) {
      cleanupErrors.push(`Failed to request Electron shutdown: ${error.message}`);
    }
  }

  try {
    await waitForProcessExit(childProcess, 5000);
  } catch (error) {
    cleanupErrors.push(error.message);
    if (childProcess && childProcess.exitCode === null) {
      childProcess.kill('SIGKILL');
      try {
        await waitForProcessExit(childProcess, 5000);
      } catch (forcedExitError) {
        cleanupErrors.push(`Forced Electron shutdown failed: ${forcedExitError.message}`);
      }
    }
  }

  if (cleanupErrors.length > 0) {
    throw new Error(cleanupErrors.join('; '));
  }
}

test('game version smoke: the Settings game and the farm types follow the game played, after it closes and across a relaunch', async ({}, testInfo) => {
  // Every step waits on the detector's poll, and the app starts twice.
  test.setTimeout(120000);
  const backend = await startSmokeBackend();
  const isolatedProfile = createIsolatedProfile(testInfo, backend.baseUrl);
  const bootstrap = createBootstrapScript(testInfo);
  const configPath = path.join(isolatedProfile.userDataDir, 'config.json');
  const setProcesses = (processes) => fs.writeFileSync(isolatedProfile.processesPath, JSON.stringify(processes));
  let electronApp;
  let testError = null;
  const launchApp = async () => {
    electronApp = await electron.launch({
      args: ['-r', bootstrap.bootstrapPath, path.join(__dirname, '..')],
      cwd: path.join(__dirname, '..'),
      env: isolatedProfile.env,
    });
    const page = await waitForAppWindow(electronApp, /^Juice Journal$/i);
    await page.waitForLoadState('domcontentloaded');
    return page;
  };

  try {
    let page = await launchApp();
    await waitForGuestReady(page);
    await signIn(page);

    // The saved Settings game is PoE 2, so the farm types are PoE 2's.
    const settingsToggle = (version) => page.locator(`.version-btn[data-version="${version}"]`);
    const farmTypeSelect = () => page.locator('#session-farm-type-select');
    await expect(settingsToggle('poe2')).toHaveAttribute('aria-pressed', 'true');
    await expect(farmTypeSelect().locator('option[value="legion"]')).toHaveCount(0);

    // PoE 1 starts: the Settings game and the farm types follow it.
    setProcesses([isolatedProfile.poe1Process]);
    await expect(page.locator('#game-status-indicator')).toContainText('PoE 1', { timeout: DETECTION_TIMEOUT_MS });
    await expect(settingsToggle('poe1')).toHaveAttribute('aria-pressed', 'true');
    await expect(settingsToggle('poe2')).toHaveAttribute('aria-pressed', 'false');
    await expect(farmTypeSelect().locator('option[value="legion"]')).toHaveCount(1);

    // PoE 1 closes: Settings, the farm type pick and the character card stay on PoE 1.
    await farmTypeSelect().selectOption('legion');
    await expect.poll(() => page.evaluate(() => window.electronAPI.getActiveFarmType())).toBe('legion');
    setProcesses([]);
    await expect(page.locator('#game-status-indicator')).toContainText('Not Running', { timeout: DETECTION_TIMEOUT_MS });
    await expect(settingsToggle('poe1')).toHaveAttribute('aria-pressed', 'true');
    await expect(farmTypeSelect()).toHaveValue('legion');
    await expect(page.locator('#character-game-version')).toHaveText('PoE 1');

    // A store an older build left on PoE 2 after PoE 1 was played: the first launch, before the game starts, is
    // already on PoE 1 and keeps the pick.
    await shutdownElectronApp(electronApp);
    electronApp = null;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(config.poeVersion).toBe('poe1');
    expect(config.lastDetectedPoeVersion).toBe('poe1');
    expect(config.activeFarmTypeId).toBe('legion');
    expect(config._settingsGameMigrated).toBe(true);
    delete config._settingsGameMigrated;
    fs.writeFileSync(configPath, JSON.stringify({ ...config, poeVersion: 'poe2' }, null, '\t'));
    page = await launchApp();
    await expect(page.locator('#username')).toHaveText(POE_ACCOUNT.username);
    await expect(page.locator('#game-status-indicator')).toContainText('Not Running', { timeout: DETECTION_TIMEOUT_MS });
    await expect(settingsToggle('poe1')).toHaveAttribute('aria-pressed', 'true');
    await expect(farmTypeSelect()).toHaveValue('legion');
    await expect(page.locator('#character-game-version')).toHaveText('PoE 1');
    expect(await page.evaluate(() => window.electronAPI.getActiveFarmType())).toBe('legion');

    // PoE 1 starts again: the pick is still there.
    setProcesses([isolatedProfile.poe1Process]);
    await expect(page.locator('#game-status-indicator')).toContainText('PoE 1', { timeout: DETECTION_TIMEOUT_MS });
    await expect(farmTypeSelect()).toHaveValue('legion');

    // A switch to PoE 2 drops the PoE 1-only pick, so PoE 2 maps are not tagged Legion.
    setProcesses([isolatedProfile.poe2Process]);
    await expect(page.locator('#game-status-indicator')).toContainText('PoE 2', { timeout: DETECTION_TIMEOUT_MS });
    await expect(settingsToggle('poe2')).toHaveAttribute('aria-pressed', 'true');
    await expect(farmTypeSelect()).toHaveValue('');
    await expect.poll(() => page.evaluate(() => window.electronAPI.getActiveFarmType())).toBeNull();
  } catch (error) {
    testError = error;
  } finally {
    const cleanupErrors = [];

    if (electronApp) {
      try {
        await shutdownElectronApp(electronApp);
      } catch (error) {
        cleanupErrors.push(`Electron cleanup failed: ${error.message}`);
      }
    }

    try {
      await closeServer(backend.server);
    } catch (error) {
      cleanupErrors.push(`Smoke backend cleanup failed: ${error.message}`);
    }

    for (const target of [isolatedProfile.rootDir, bootstrap.bootstrapDir]) {
      try {
        fs.rmSync(target, { recursive: true, force: true });
      } catch (error) {
        cleanupErrors.push(`Failed to remove ${target}: ${error.message}`);
      }
    }

    if (cleanupErrors.length > 0) {
      const cleanupError = new Error(cleanupErrors.join('\n'));
      if (testError) {
        throw new AggregateError([testError, cleanupError], 'Smoke test failed with cleanup errors');
      }

      throw cleanupError;
    }

    if (testError) {
      throw testError;
    }
  }
});
