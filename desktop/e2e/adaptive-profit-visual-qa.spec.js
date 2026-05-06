const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { once } = require('events');
const { test, expect } = require('playwright/test');
const { _electron: electron } = require('playwright');

const VISUAL_USER = {
  id: 'adaptive-profit-visual-user-id',
  username: 'VisualQA',
  accountName: 'VisualAccount',
  token: 'adaptive-profit-visual-token',
  selectedCharacter: {
    id: 'char-visual-qa',
    name: 'VisualDeadeye',
    level: 99,
    class: 'Ranger',
    ascendancy: 'Deadeye',
    league: 'Standard'
  }
};

const PROFIT_RATES = {
  divineChaos: 100,
  mirrorChaos: 300000
};

function toSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'adaptive-profit-visual-qa';
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

function createVisualUserPayload() {
  return {
    id: VISUAL_USER.id,
    username: VISUAL_USER.username,
    accountName: VISUAL_USER.accountName,
    poeAccountName: VISUAL_USER.accountName,
    selectedCharacterId: VISUAL_USER.selectedCharacter.id,
    selectedCharacter: VISUAL_USER.selectedCharacter,
    characters: [VISUAL_USER.selectedCharacter],
    poe: {
      accountName: VISUAL_USER.accountName,
      selectedCharacter: VISUAL_USER.selectedCharacter,
      characters: [VISUAL_USER.selectedCharacter]
    }
  };
}

function createVisualSession() {
  return {
    id: 'adaptive-profit-session-1',
    mapName: 'Crimson Temple Map',
    mapTier: 16,
    status: 'completed',
    durationSec: 420,
    profitChaos: 600000,
    totalLootChaos: 602000,
    costChaos: 2000,
    poeVersion: 'poe1',
    league: 'Standard',
    startedAt: '2026-05-06T11:00:00.000Z',
    lootEntries: [
      { itemName: 'Mirror of Kalandra', quantity: 2, chaosValue: 300000 }
    ]
  };
}

async function startVisualBackend() {
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');

    if (request.method === 'POST' && url.pathname === '/api/auth/poe/login/start') {
      writeJson(response, 200, {
        success: true,
        data: {
          mode: 'mock',
          requiresBrowser: false,
          mockCode: 'visual-oauth-code'
        },
        error: null
      });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/auth/poe/login/complete') {
      const body = await parseJsonBody(request);
      if (body.code !== 'visual-oauth-code') {
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
          token: VISUAL_USER.token,
          user: createVisualUserPayload(),
          capabilities: {
            canSyncPrices: true
          },
          poe: {
            accountName: VISUAL_USER.accountName,
            mock: true
          }
        },
        error: null
      }, VISUAL_USER.token);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/auth/poe/status') {
      writeJson(response, 200, {
        success: true,
        data: {
          poe: {
            linked: true,
            mock: true,
            accountName: VISUAL_USER.accountName
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

    if (request.method === 'GET' && url.pathname.startsWith('/api/prices/item/')) {
      const itemName = decodeURIComponent(url.pathname.slice('/api/prices/item/'.length));
      const chaosValue = itemName === 'Mirror of Kalandra'
        ? PROFIT_RATES.mirrorChaos
        : itemName === 'Divine Orb'
          ? PROFIT_RATES.divineChaos
          : null;

      writeJson(response, 200, {
        success: true,
        data: {
          price: chaosValue ? { itemName, chaosValue } : null
        },
        error: null
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/sessions/active') {
      writeJson(response, 200, {
        success: true,
        data: { session: null },
        error: null
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/sessions') {
      writeJson(response, 200, {
        success: true,
        data: {
          sessions: [createVisualSession()],
          total: 1,
          limit: 50,
          offset: 0
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
            totalSessions: 1,
            totalProfit: 600000,
            avgProfitPerMap: 5000
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
        data: { lootEntries: [] },
        error: null
      });
      return;
    }

    writeJson(response, 404, {
      success: false,
      data: null,
      error: `Unhandled visual QA endpoint: ${request.method} ${url.pathname}`,
      errorCode: 'NOT_FOUND'
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Visual QA backend did not expose a TCP port');
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
  fs.writeFileSync(poeLogPath, '2026/05/06 12:00:00 Client started\n', 'utf8');

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
  throw new Error('Missing visual QA harness path overrides');
}

fs.mkdirSync(appDataDir, { recursive: true });
fs.mkdirSync(userDataDir, { recursive: true });
fs.mkdirSync(path.dirname(poeLogPath), { recursive: true });

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
  defaultLeagueByVersion: {
    poe1: 'Standard'
  },
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

  throw new Error(`Timed out waiting for app window matching ${expectedTitle}`);
}

async function waitForGuestReady(page) {
  await page.waitForLoadState('domcontentloaded');
  await expect(page).toHaveTitle(/Juice Journal/i);
  await expect(page.locator('#login-modal')).toBeVisible();
  await expect(page.locator('#poe-oauth-login')).toBeVisible();
}

async function signInWithPoeOAuth(page) {
  await page.locator('#poe-oauth-login').click();
  await expect(page.locator('#login-modal')).toBeHidden();
  await expect(page.locator('#username')).toHaveText(VISUAL_USER.username);
}

async function prepareAdaptiveProfitState(page) {
  await page.evaluate(async ({ rates }) => {
    setProfitCurrencyRates('poe1', rates, 'Standard');

    await window.electronAPI.saveMapResult({
      id: 'adaptive-profit-map-result',
      farmType: 'Ritual',
      mapName: 'Crimson Temple Map',
      durationSeconds: 420,
      netProfit: 600000,
      profitState: 'positive',
      poeVersion: 'poe1',
      league: 'Standard',
      createdAt: '2026-05-06T12:00:00.000Z'
    });

    setProfitCurrencyRates('poe1', rates, 'Standard');
    await loadDashboardStats();
    await loadMapResultHistory();
  }, { rates: PROFIT_RATES });
}

async function renderStashProfitVisual(page) {
  await page.evaluate(({ rates }) => {
    setProfitCurrencyRates('poe1', rates, 'Standard');
    stashState.lastMapResult = {
      id: 'adaptive-profit-stash-result',
      poeVersion: 'poe1',
      league: 'Standard',
      durationSeconds: 420
    };
    renderProfitReport({
      summary: {
        netProfitChaos: 5000,
        netProfitDivine: 50,
        totalGainedChaos: 5200,
        totalLostChaos: 200,
        divinePrice: rates.divineChaos
      },
      gained: [
        { name: 'Divine Orb', quantityDiff: 50, totalChaosValue: 5000 }
      ],
      lost: [
        { name: 'Map Device Cost', quantityDiff: -2, totalChaosValue: 200 }
      ]
    });
  }, { rates: PROFIT_RATES });
}

async function showMapResultOverlay(page, result, options = {}) {
  await page.evaluate(async ({ result: nextResult, options: nextOptions }) => {
    if (!window.electronAPI?.showMapResultOverlay) {
      throw new Error('Expected window.electronAPI.showMapResultOverlay to exist');
    }

    await window.electronAPI.showMapResultOverlay(nextResult, nextOptions);
  }, { result, options });
}

async function waitForOverlayWindow(electronApp) {
  return waitForAppWindow(electronApp, /Juice Journal Overlay/i);
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

test('adaptive profit visual QA: captures dashboard, sessions, stash result, and overlay screenshots', async ({}, testInfo) => {
  const backend = await startVisualBackend();
  const isolatedProfile = createIsolatedProfile(testInfo, backend.baseUrl);
  const bootstrap = createBootstrapScript(testInfo);
  let electronApp;
  let testError = null;

  try {
    electronApp = await electron.launch({
      args: ['-r', bootstrap.bootstrapPath, path.join(__dirname, '..')],
      cwd: path.join(__dirname, '..'),
      env: isolatedProfile.env
    });
    const page = await waitForAppWindow(electronApp, /^Juice Journal$/i);

    await waitForGuestReady(page);
    await signInWithPoeOAuth(page);
    await prepareAdaptiveProfitState(page);

    await expect(page.locator('#dashboard-page')).toHaveClass(/active/);
    await expect(page.locator('#today-profit')).toContainText('2.00');
    await expect(page.locator('#last-map-result-card')).toHaveAttribute('data-result-state', 'ready');
    await expect(page.locator('#last-map-result-profit')).toContainText('2.00');
    await page.locator('#dashboard-page').screenshot({
      path: testInfo.outputPath('adaptive-profit-dashboard.png')
    });

    await page.locator('[data-page="sessions"]').click();
    await expect(page.locator('#sessions-page')).toHaveClass(/active/);
    await expect(page.locator('.session-profit')).toContainText('2.00');
    await page.locator('#sessions-page').screenshot({
      path: testInfo.outputPath('adaptive-profit-sessions.png')
    });

    await page.locator('[data-page="dashboard"]').click();
    await renderStashProfitVisual(page);
    await expect(page.locator('#stash-profit-result')).toBeVisible();
    await expect(page.locator('#profit-chaos-value')).toContainText('+50.00 div');
    await page.locator('#stash-profit-result').screenshot({
      path: testInfo.outputPath('adaptive-profit-stash-result.png')
    });

    const overlayWindow = await waitForOverlayWindow(electronApp);
    await showMapResultOverlay(page, {
      id: 'adaptive-profit-overlay-result',
      farmType: 'Ritual',
      durationSeconds: 420,
      netProfit: 600000,
      profitState: 'positive',
      topOutputs: [{ label: 'Mirror of Kalandra', valueDelta: 600000 }],
      profitCurrencyRates: PROFIT_RATES,
      createdAt: '2026-05-06T12:00:00.000Z'
    }, {
      durationMs: 3000
    });

    await expect(overlayWindow.locator('[data-overlay-state="visible"]')).toBeVisible();
    await expect(overlayWindow.locator('[data-overlay-primary]')).toContainText('2.00 mirror');
    await overlayWindow.locator('[data-overlay-state="visible"]').screenshot({
      path: testInfo.outputPath('adaptive-profit-overlay.png')
    });
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
      cleanupErrors.push(`Visual QA backend cleanup failed: ${error.message}`);
    }

    for (const target of [isolatedProfile.rootDir, bootstrap.bootstrapDir]) {
      try {
        fs.rmSync(target, { recursive: true, force: true });
      } catch (error) {
        cleanupErrors.push(`Failed to remove ${target}: ${error.message}`);
      }
    }

    if (testError && cleanupErrors.length > 0) {
      throw new AggregateError([testError, ...cleanupErrors.map((message) => new Error(message))], 'Adaptive profit visual QA failed with cleanup errors');
    }
    if (testError) {
      throw testError;
    }
    if (cleanupErrors.length > 0) {
      throw new Error(cleanupErrors.join('\n'));
    }
  }
});
