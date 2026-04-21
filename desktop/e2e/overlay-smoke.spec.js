const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { once } = require('events');
const { test, expect } = require('playwright/test');
const { _electron: electron } = require('playwright');

const SMOKE_USER = {
  id: 'smoke-poe-user-id',
  username: 'RangerMain',
  accountName: 'SmokeAccount',
  token: 'smoke-poe-token',
  selectedCharacter: {
    id: 'char-smoke-main',
    name: 'RangerMain',
    level: 96,
    class: 'Ranger',
    ascendancy: 'Deadeye',
    league: 'Standard'
  }
};

function toSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'desktop-smoke';
}

function writeJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
}

function writeJsonWithAuthCookie(response, statusCode, payload, token) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Set-Cookie': `juice_journal_auth=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`
  });
  response.end(JSON.stringify(payload));
}

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
    });

    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });

    request.on('error', reject);
  });
}

function createSmokeUserPayload() {
  return {
    id: SMOKE_USER.id,
    username: SMOKE_USER.username,
    accountName: SMOKE_USER.accountName,
    poeAccountName: SMOKE_USER.accountName,
    selectedCharacterId: SMOKE_USER.selectedCharacter.id,
    selectedCharacter: SMOKE_USER.selectedCharacter,
    characters: [SMOKE_USER.selectedCharacter],
    poe: {
      accountName: SMOKE_USER.accountName,
      selectedCharacter: SMOKE_USER.selectedCharacter,
      characters: [SMOKE_USER.selectedCharacter]
    }
  };
}

async function startSmokeBackend() {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');

    if (request.method === 'POST' && url.pathname === '/api/auth/poe/login/start') {
      writeJson(response, 200, {
        success: true,
        data: {
          mode: 'mock',
          requiresBrowser: false,
          mockCode: 'smoke-oauth-code'
        },
        error: null
      });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/poe/login/complete') {
      const body = await parseJsonBody(request);
      if (body.code !== 'smoke-oauth-code') {
        writeJson(response, 400, {
          success: false,
          data: null,
          error: 'Unexpected OAuth code',
          errorCode: 'OAUTH_CODE_MISMATCH'
        });
        return;
      }

      writeJsonWithAuthCookie(response, 200, {
        success: true,
        data: {
          token: SMOKE_USER.token,
          user: createSmokeUserPayload(),
          capabilities: {
            canSyncPrices: true
          },
          poe: {
            accountName: SMOKE_USER.accountName,
            mock: true
          }
        },
        error: null
      }, SMOKE_USER.token);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/auth/poe/status') {
      writeJson(response, 200, {
        success: true,
        data: {
          poe: {
            linked: true,
            mock: true,
            accountName: SMOKE_USER.accountName
          }
        },
        error: null
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/prices/leagues') {
      writeJson(response, 200, {
        success: true,
        data: {
          activeLeagues: ['Standard']
        },
        error: null
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/sessions/active') {
      writeJson(response, 200, {
        success: true,
        data: {
          session: null
        },
        error: null
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/stats/personal') {
      writeJson(response, 200, {
        success: true,
        data: {
          summary: {
            totalSessions: 0,
            totalProfit: 0,
            avgProfitPerMap: 0
          },
          dailyStats: [],
          mapStats: []
        },
        error: null
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/loot/recent') {
      writeJson(response, 200, {
        success: true,
        data: {
          lootEntries: []
        },
        error: null
      });
      return;
    }

    writeJson(response, 404, {
      success: false,
      data: null,
      error: `Unhandled smoke endpoint: ${request.method} ${url.pathname}`,
      errorCode: 'NOT_FOUND'
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
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

function createIsolatedProfile(testInfo, apiUrl) {
  const tempRoot = path.join(os.tmpdir(), 'juice-journal-playwright');
  fs.mkdirSync(tempRoot, { recursive: true });
  const rootDir = fs.mkdtempSync(path.join(tempRoot, `${toSlug(testInfo.title)}-`));
  const appDataDir = path.join(rootDir, 'app-data');
  const userDataDir = path.join(rootDir, 'user-data');
  const tempDir = path.join(rootDir, 'temp');
  const poeLogPath = path.join(rootDir, 'Client.txt');

  fs.rmSync(rootDir, { recursive: true, force: true });
  fs.mkdirSync(appDataDir, { recursive: true });
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(poeLogPath, '2026/04/10 12:00:00 Client started\n', 'utf8');

  return {
    rootDir,
    appDataDir,
    userDataDir,
    tempDir,
    poeLogPath,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      JUICE_JOURNAL_FORCE_LIVE_AUTH: '1',
      JUICE_JOURNAL_E2E_APP_DATA_DIR: appDataDir,
      JUICE_JOURNAL_E2E_USER_DATA_DIR: userDataDir,
      JUICE_JOURNAL_E2E_API_URL: apiUrl,
      JUICE_JOURNAL_E2E_POE_LOG_PATH: poeLogPath,
      TMP: tempDir,
      TEMP: tempDir
    }
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

const appDataDir = process.env.JUICE_JOURNAL_E2E_APP_DATA_DIR;
const userDataDir = process.env.JUICE_JOURNAL_E2E_USER_DATA_DIR;
const apiUrl = process.env.JUICE_JOURNAL_E2E_API_URL;
const poeLogPath = process.env.JUICE_JOURNAL_E2E_POE_LOG_PATH;

if (!appDataDir || !userDataDir || !apiUrl || !poeLogPath) {
  throw new Error('Missing smoke harness path overrides');
}

fs.mkdirSync(appDataDir, { recursive: true });
fs.mkdirSync(userDataDir, { recursive: true });
fs.mkdirSync(path.dirname(poeLogPath), { recursive: true });

if (!fs.existsSync(poeLogPath)) {
  fs.writeFileSync(poeLogPath, '2026/04/10 12:00:00 Client started\\n', 'utf8');
}

app.setPath('appData', appDataDir);
app.setPath('userData', userDataDir);
app.setPath('sessionData', path.join(userDataDir, 'session-data'));

const configPath = path.join(userDataDir, 'config.json');
fs.writeFileSync(configPath, JSON.stringify({
  apiUrl,
  language: 'en',
  poeVersion: 'poe1',
  poePath: poeLogPath,
  autoStartSession: false,
  overlayEnabled: true,
  authToken: null,
  authTokenEncrypted: null,
  currentUserId: null
}, null, '\\t'));
`, 'utf8');

  return {
    bootstrapDir,
    bootstrapPath
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

async function waitForOverlayWindow(electronApp) {
  return waitForAppWindow(electronApp, /Juice Journal Overlay/i);
}

async function waitForGuestReady(page) {
  await page.waitForLoadState('domcontentloaded');
  await expect(page).toHaveTitle(/Juice Journal/i);
  await expect(page.locator('#login-modal')).toBeVisible();
  await expect(page.locator('#login-form')).toHaveCount(0);
  await expect(page.locator('#register-form')).toHaveCount(0);
  await expect(page.locator('#poe-oauth-login')).toBeVisible();
  await expect(page.locator('#poe-oauth-login')).toBeEnabled();
}

async function signInWithPoeOAuth(page) {
  await page.locator('#poe-oauth-login').click();
  await expect(page.locator('#login-modal')).toBeHidden();
  await expect(page.locator('#username')).toHaveText(SMOKE_USER.username);
}

async function showMapResultOverlay(page, result, options = {}) {
  await page.evaluate(async ({ result: nextResult, options: nextOptions }) => {
    if (!window.electronAPI?.showMapResultOverlay) {
      throw new Error('Expected window.electronAPI.showMapResultOverlay to exist');
    }

    await window.electronAPI.showMapResultOverlay(nextResult, nextOptions);
  }, { result, options });
}

async function showRuntimeOverlayPreview(page, runtimeSession) {
  await page.evaluate(async (nextRuntimeSession) => {
    if (!window.electronAPI?.showRuntimeOverlayPreview) {
      throw new Error('Expected window.electronAPI.showRuntimeOverlayPreview to exist');
    }

    await window.electronAPI.showRuntimeOverlayPreview(nextRuntimeSession);
  }, runtimeSession);
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
      signal: childProcess.signalCode
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

async function launchDesktopWithStubbedPoeAuth(testInfo) {
  const backend = await startSmokeBackend();
  const isolatedProfile = createIsolatedProfile(testInfo, backend.baseUrl);
  const bootstrap = createBootstrapScript(testInfo);
  const electronApp = await electron.launch({
    args: ['-r', bootstrap.bootstrapPath, path.join(__dirname, '..')],
    cwd: path.join(__dirname, '..'),
    env: isolatedProfile.env
  });
  const page = await waitForAppWindow(electronApp, /^Juice Journal$/i);

  return {
    backend,
    bootstrap,
    electronApp,
    isolatedProfile,
    page
  };
}

async function cleanupSmokeHarness(harness) {
  const cleanupErrors = [];

  if (harness?.electronApp) {
    try {
      await shutdownElectronApp(harness.electronApp);
    } catch (error) {
      cleanupErrors.push(`Electron cleanup failed: ${error.message}`);
    }
  }

  if (harness?.backend?.server) {
    try {
      await closeServer(harness.backend.server);
    } catch (error) {
      cleanupErrors.push(`Smoke backend cleanup failed: ${error.message}`);
    }
  }

  if (harness?.isolatedProfile?.rootDir) {
    try {
      fs.rmSync(harness.isolatedProfile.rootDir, { recursive: true, force: true });
    } catch (error) {
      cleanupErrors.push(`Isolated profile cleanup failed: ${error.message}`);
    }
  }

  if (harness?.bootstrap?.bootstrapDir) {
    try {
      fs.rmSync(harness.bootstrap.bootstrapDir, { recursive: true, force: true });
    } catch (error) {
      cleanupErrors.push(`Bootstrap cleanup failed: ${error.message}`);
    }
  }

  if (cleanupErrors.length > 0) {
    throw new Error(cleanupErrors.join('\n'));
  }
}

test('overlay smoke: launches app, signs in via poe oauth stub, and shows runtime plus post-map result overlay states', async ({}, testInfo) => {
  let harness;
  let testError = null;

  try {
    harness = await launchDesktopWithStubbedPoeAuth(testInfo);
    const { electronApp, isolatedProfile, page } = harness;

    await waitForGuestReady(page);
    await signInWithPoeOAuth(page);

    await expect(page.locator('#dashboard-page')).toHaveClass(/active/);
    await expect(page.locator('#stash-tracker-card')).toBeVisible();
    await expect(page.locator('#active-session')).toBeVisible();

    const overlayWindow = await waitForOverlayWindow(electronApp);
    await showRuntimeOverlayPreview(page, {
      summary: {
        status: 'active',
        currentAreaName: 'Overgrown Shrine Map',
        currentInstanceSeconds: 60,
        totalActiveSeconds: 60
      }
    });

    await expect(overlayWindow.locator('[data-overlay-state="visible"]')).toBeVisible();
    await expect(overlayWindow.locator('[data-overlay-primary]')).toContainText(SMOKE_USER.selectedCharacter.name);
    await expect(overlayWindow.locator('[data-overlay-secondary]')).toContainText('Overgrown Shrine Map');

    await showMapResultOverlay(page, {
      id: 'map-result-smoke-1',
      farmType: 'Ritual',
      durationSeconds: 185,
      netProfit: 127,
      profitState: 'positive',
      topOutputs: [{ label: 'Divine Orb', valueDelta: 120 }],
      createdAt: new Date().toISOString()
    }, {
      durationMs: 200
    });

    await expect(overlayWindow.locator('main[data-overlay-mode="map-result"]')).toBeVisible();
    await expect(overlayWindow.locator('[data-overlay-kicker]')).toContainText('Map Result');
    await expect(overlayWindow.locator('[data-overlay-primary]')).toContainText('Ritual');
    await expect(overlayWindow.locator('[data-overlay-secondary]')).toContainText('Divine Orb');
    await expect(overlayWindow.locator('[data-overlay-pin]')).toHaveAttribute('aria-pressed', 'false');

    await expect(overlayWindow.locator('main[data-overlay-mode="runtime"]')).toBeVisible({ timeout: 2000 });
    await expect(overlayWindow.locator('[data-overlay-kicker]')).toContainText('Juice Journal');

    await showMapResultOverlay(page, {
      id: 'map-result-smoke-2',
      farmType: 'Expedition',
      durationSeconds: 240,
      netProfit: -42,
      profitState: 'negative',
      topOutputs: [{ label: 'Ancient Orb', valueDelta: 35 }],
      createdAt: new Date().toISOString()
    }, {
      durationMs: 200
    });

    await overlayWindow.locator('[data-overlay-pin]').click();
    await expect(overlayWindow.locator('[data-overlay-pin]')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(350);
    await expect(overlayWindow.locator('main[data-overlay-mode="map-result"]')).toBeVisible();
    await expect(overlayWindow.locator('[data-overlay-primary]')).toContainText('Expedition');

    await overlayWindow.locator('[data-overlay-dismiss]').click();
    await expect(overlayWindow.locator('main[data-overlay-mode="runtime"]')).toBeVisible({ timeout: 2000 });
    await expect(overlayWindow.locator('[data-overlay-primary]')).toContainText(SMOKE_USER.selectedCharacter.name);
  } catch (error) {
    testError = error;
  } finally {
    let cleanupError = null;
    try {
      await cleanupSmokeHarness(harness);
    } catch (error) {
      cleanupError = error;
    }

    if (testError && cleanupError) {
      throw new AggregateError([testError, cleanupError], 'Overlay smoke test failed with cleanup errors');
    }

    if (testError) {
      throw testError;
    }

    if (cleanupError) {
      throw cleanupError;
    }
  }
});
