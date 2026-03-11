/**
 * PoE Farm Tracker - Desktop App
 * Electron main process
 * 
 * Ozellikler:
 * - System tray entegrasyonu
 * - Global hotkey destegi (F9)
 * - PoE Client.txt log izleme
 * - OCR ile stash tarama
 */

const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, screen, shell, nativeImage } = require('electron');
const crypto = require('crypto');
const http = require('http');
const path = require('path');
const Store = require('electron-store');

// Modul importlari
const LogParser = require('./src/modules/logParser');
const OCRScanner = require('./src/modules/ocrScanner');
const APIClient = require('./src/modules/apiClient');

const APP_NAME = 'PoE Farm Tracker';
const APP_ID = 'PoeFarmTracker.Desktop';
const DEFAULT_STRATEGY_PRESETS = ['Strongbox', 'Legion', 'Ritual', 'Expedition', 'Harvest', 'Boss Rush'];
const MAX_PENDING_LOOT_ACTIONS = 100;
const MAIN_PROCESS_TRANSLATIONS = {
  tr: {
    trayStillRunning: 'Uygulama sistem tepsisinde calismaya devam ediyor.',
    trayHide: 'Pencereyi Gizle',
    trayOpen: 'Ana Pencereyi Ac',
    trayDashboard: 'Dashboard',
    traySessions: 'Sessionlar',
    trayCurrency: 'Currency',
    traySettings: 'Ayarlar',
    trayNewSession: 'Yeni Map Session',
    trayAddLoot: 'Loot Ekle (F9)',
    trayQuit: 'Cikis',
    notificationError: 'Hata',
    notificationInfo: 'Bilgi',
    notificationLootAdded: 'Loot Eklendi',
    notificationMapStarted: 'Map Basladi',
    notificationMapCompleted: 'Map Tamamlandi',
    notificationAutoSession: 'Otomatik Session',
    noActiveSession: 'Aktif map session bulunmuyor. Once yeni bir map baslatin.',
    screenCaptureFailed: 'Ekran goruntusu alinamadi',
    stashNoItems: 'Stash icinde tanimlanabilir item bulunamadi',
    lootScanFailed: 'Loot tarama sirasinda hata olustu',
    sessionStartFailed: 'Session baslatilamadi',
    sessionEndFailed: 'Session bitirilemedi',
    mapStartedBody: '{mapName} mapi baslatildi',
    lootAddedBody: '{count} item eklendi. Toplam: {value}c',
    mapProfitBody: '{label}: {value}c',
    mapProfit: 'Kar',
    mapLoss: 'Zarar',
    autoSessionBody: '{mapName} mapi baslatildi',
    promptStart: 'Baslat',
    promptCancel: 'Iptal',
    promptTitle: 'Yeni Map Session',
    promptMessage: 'Map adini girin:',
    promptDetail: 'Ornegin: Dunes Map, City Square Map',
    unknownMap: 'Bilinmeyen Map',
    lootQueuedTitle: 'Loot Kuyruga Alindi',
    lootQueuedBody: '{count} item baglanti gelince senkronize edilecek.'
  },
  en: {
    trayStillRunning: 'The app is still running in the system tray.',
    trayHide: 'Hide Window',
    trayOpen: 'Open Window',
    trayDashboard: 'Dashboard',
    traySessions: 'Sessions',
    trayCurrency: 'Currency',
    traySettings: 'Settings',
    trayNewSession: 'Start New Map',
    trayAddLoot: 'Add Loot (F9)',
    trayQuit: 'Quit',
    notificationError: 'Error',
    notificationInfo: 'Info',
    notificationLootAdded: 'Loot Added',
    notificationMapStarted: 'Map Started',
    notificationMapCompleted: 'Map Completed',
    notificationAutoSession: 'Auto Session',
    noActiveSession: 'No active map session. Start a new map first.',
    screenCaptureFailed: 'Failed to capture the screen',
    stashNoItems: 'No recognizable items were found in the stash',
    lootScanFailed: 'An error occurred while scanning loot',
    sessionStartFailed: 'Failed to start the session',
    sessionEndFailed: 'Failed to end the session',
    mapStartedBody: '{mapName} map started',
    lootAddedBody: '{count} items added. Total: {value}c',
    mapProfitBody: '{label}: {value}c',
    mapProfit: 'Profit',
    mapLoss: 'Loss',
    autoSessionBody: '{mapName} map started',
    promptStart: 'Start',
    promptCancel: 'Cancel',
    promptTitle: 'New Map Session',
    promptMessage: 'Enter the map name:',
    promptDetail: 'For example: Dunes Map, City Square Map',
    unknownMap: 'Unknown Map',
    lootQueuedTitle: 'Loot Queued',
    lootQueuedBody: '{count} items will sync when the connection returns.'
  }
};

// Store yapilandirmasi
const store = new Store({
  defaults: {
    apiUrl: 'http://localhost:3001',
    authToken: null,
    poePath: 'E:\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt',
    autoStartSession: true,
    notifications: true,
    language: 'en',
    soundNotifications: false,
    poeVersion: 'poe1',
    defaultLeague: 'Standard',
    scanHotkey: 'F9',
    currentUserId: null,
    pendingLootActions: [],
    strategyPresets: DEFAULT_STRATEGY_PRESETS
  },
});

// Migrate old 'tr' default to 'en' (one-time)
if (!store.get('_langMigrated')) {
  store.set('language', 'en');
  store.set('_langMigrated', true);
}

// Global degiskenler
let mainWindow = null;
let tray = null;
let logParser = null;
let ocrScanner = null;
let apiClient = null;
let currentSession = null;
let poeAuthServer = null;
let trayHintShown = false;
let pendingLootFlushInProgress = false;
let pendingLootFlushInterval = null;

function getLanguage() {
  const lang = store.get('language');
  return lang === 'tr' ? 'tr' : 'en';
}

function t(key, values = {}) {
  const language = getLanguage();
  const dictionary = MAIN_PROCESS_TRANSLATIONS[language] || MAIN_PROCESS_TRANSLATIONS.en;
  const fallback = MAIN_PROCESS_TRANSLATIONS.en[key] || key;
  const template = dictionary[key] || fallback;
  return template.replace(/\{(\w+)\}/g, (match, token) => {
    if (Object.prototype.hasOwnProperty.call(values, token)) {
      return String(values[token]);
    }
    return match;
  });
}

function normalizeErrorMessage(error, fallback = 'Unexpected error') {
  if (!error) return fallback;
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error instanceof Error && error.message?.trim()) return error.message.trim();
  if (typeof error.message === 'string' && error.message.trim() && error.message !== '[object Object]') {
    return error.message.trim();
  }
  if (typeof error.error === 'string' && error.error.trim()) return error.error.trim();
  if (typeof error.data?.error === 'string' && error.data.error.trim()) return error.data.error.trim();
  return fallback;
}

function toRendererError(error, fallback) {
  return new Error(normalizeErrorMessage(error, fallback));
}

function getPendingLootActions() {
  return store.get('pendingLootActions') || [];
}

function setPendingLootActions(actions) {
  const normalizedActions = actions.slice(-MAX_PENDING_LOOT_ACTIONS);
  store.set('pendingLootActions', normalizedActions);

  if (mainWindow) {
    mainWindow.webContents.send('pending-loot-updated', {
      count: normalizedActions.length
    });
  }
}

function getCurrentUserId() {
  return store.get('currentUserId') || null;
}

function isRetryableApiError(error) {
  const code = error?.code || error?.data?.code || null;
  const status = error?.status || null;
  return code === 'SERVER_UNAVAILABLE'
    || code === 'REQUEST_TIMEOUT'
    || status === null
    || status >= 500;
}

function queuePendingLootAction(action) {
  const queuedActions = getPendingLootActions();
  queuedActions.push({
    id: crypto.randomUUID(),
    ownerUserId: getCurrentUserId(),
    queuedAt: new Date().toISOString(),
    ...action
  });
  setPendingLootActions(queuedActions);
}

async function flushPendingLootActions() {
  if (pendingLootFlushInProgress || !apiClient?.token) {
    return { processed: 0, remaining: getPendingLootActions().length };
  }

  const currentUserId = getCurrentUserId();
  const queuedActions = getPendingLootActions();
  if (!queuedActions.length || !currentUserId) {
    return { processed: 0, remaining: queuedActions.length };
  }

  pendingLootFlushInProgress = true;
  const remainingActions = [];
  let processed = 0;

  try {
    for (const action of queuedActions) {
      if (action.ownerUserId && action.ownerUserId !== currentUserId) {
        remainingActions.push(action);
        continue;
      }

      try {
        if (action.type === 'bulkLoot') {
          await apiClient.addLootBulk(action.sessionId, action.items);
        } else if (action.type === 'singleLoot') {
          await apiClient.addLoot(action.sessionId, action.data);
        } else {
          continue;
        }

        processed += 1;
      } catch (error) {
        if (isRetryableApiError(error)) {
          remainingActions.push(action);
          break;
        }
      }
    }
  } finally {
    setPendingLootActions(remainingActions);
    pendingLootFlushInProgress = false;
  }

  return {
    processed,
    remaining: remainingActions.length
  };
}

function renderBrowserCallbackPage(title, message) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${APP_NAME}</title>
    <style>
      body { margin: 0; font-family: Segoe UI, sans-serif; background: #100c0a; color: #f1ebe2; }
      main { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      section { max-width: 420px; width: 100%; border: 1px solid rgba(198,161,91,0.18); background: rgba(20,15,12,0.92); border-radius: 18px; padding: 28px; box-shadow: 0 24px 80px rgba(0,0,0,0.45); }
      h1 { margin: 0 0 12px; font-size: 24px; letter-spacing: 0.08em; text-transform: uppercase; color: #c6a15b; }
      p { margin: 0; line-height: 1.6; color: #d3c4af; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${title}</h1>
        <p>${message}</p>
      </section>
    </main>
  </body>
</html>`;
}

function createTrayIcon() {
  const fs = require('fs');
  const trayIconPath = path.join(__dirname, 'src', 'assets', 'tray-icon.png');
  const appIconPath = path.join(__dirname, 'src', 'assets', 'icon.png');
  const fallbackIconPath = path.join(__dirname, 'src', 'assets', 'icon.ico');
  const sourcePath = fs.existsSync(trayIconPath)
    ? trayIconPath
    : (fs.existsSync(appIconPath) ? appIconPath : fallbackIconPath);
  const image = nativeImage.createFromPath(sourcePath);
  const size = process.platform === 'win32' ? 16 : 18;
  return image.resize({ width: size, height: size });
}

function showMainWindow(targetPage = null) {
  if (!mainWindow) {
    createMainWindow();
  }

  if (!mainWindow) return;

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();

  if (targetPage) {
    mainWindow.webContents.send('navigate', targetPage);
  }

  refreshTrayMenu();
}

function hideMainWindowToTray(showHint = false) {
  if (!mainWindow) return;

  mainWindow.hide();
  refreshTrayMenu();

  if (showHint && !trayHintShown) {
    trayHintShown = true;
    showNotification(APP_NAME, t('trayStillRunning'));
  }
}

function toggleMainWindowVisibility() {
  if (!mainWindow || !mainWindow.isVisible()) {
    showMainWindow();
    return;
  }

  hideMainWindowToTray(false);
}

function refreshTrayMenu() {
  if (!tray) return;

  const isVisible = Boolean(mainWindow?.isVisible());
  const contextMenu = Menu.buildFromTemplate([
    {
      label: isVisible ? t('trayHide') : t('trayOpen'),
      click: () => {
        if (isVisible) {
          hideMainWindowToTray(false);
        } else {
          showMainWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: t('trayDashboard'),
      click: () => showMainWindow('dashboard')
    },
    {
      label: t('traySessions'),
      click: () => showMainWindow('sessions')
    },
    {
      label: t('trayCurrency'),
      click: () => showMainWindow('currency')
    },
    {
      label: t('traySettings'),
      click: () => showMainWindow('settings')
    },
    { type: 'separator' },
    {
      label: t('trayNewSession'),
      click: () => {
        showMainWindow('dashboard');
        startNewSession();
      }
    },
    {
      label: t('trayAddLoot'),
      click: () => {
        showMainWindow('dashboard');
        captureAndScan();
      }
    },
    { type: 'separator' },
    {
      label: t('trayQuit'),
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip(APP_NAME);
  tray.setContextMenu(contextMenu);
}

function getTrackerContextDefaults(overrides = {}) {
  const poeVersion = overrides.poeVersion || store.get('poeVersion') || 'poe1';
  const league = (overrides.league || store.get('defaultLeague') || 'Standard').trim() || 'Standard';

  return {
    poeVersion,
    league
  };
}

async function getCurrentSessionFromBackend() {
  const session = await apiClient.getActiveSession();
  currentSession = session || null;
  return currentSession;
}

async function closePoeAuthServer() {
  if (!poeAuthServer) return;

  await new Promise((resolve) => {
    poeAuthServer.close(() => resolve());
  });
  poeAuthServer = null;
}

async function openPoeLinkFlow(startResponse, { redirectUrl, redirectUri, expectedState, codeVerifier }) {
  await closePoeAuthServer();

  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(async () => {
      await closePoeAuthServer();
      reject(new Error('Path of Exile linking timed out'));
    }, 3 * 60 * 1000);

    poeAuthServer = http.createServer(async (req, res) => {
      const url = new URL(req.url, redirectUri);

      if (url.pathname !== redirectUrl.pathname) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }

      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      if (error) {
        clearTimeout(timeout);
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(renderBrowserCallbackPage('Linking Failed', 'Return to PoE Farm Tracker and try the connection again.'));
        await closePoeAuthServer();
        reject(new Error(error));
        return;
      }

      if (!code || state !== expectedState) {
        clearTimeout(timeout);
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(renderBrowserCallbackPage('Linking Failed', 'The browser callback could not be validated. Return to the app and try again.'));
        await closePoeAuthServer();
        reject(new Error('Invalid callback state'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(renderBrowserCallbackPage('Account Linked', 'You can close this window and continue in PoE Farm Tracker.'));

      try {
        const result = await apiClient.completePoeConnect({
          code,
          codeVerifier,
          redirectUri,
          state,
        });
        clearTimeout(timeout);
        await closePoeAuthServer();
        resolve(result);
      } catch (requestError) {
        clearTimeout(timeout);
        await closePoeAuthServer();
        reject(new Error(requestError.message || 'Failed to complete Path of Exile linking'));
      }
    });

    poeAuthServer.on('error', async (error) => {
      clearTimeout(timeout);
      await closePoeAuthServer();
      reject(error);
    });

    poeAuthServer.listen(Number(redirectUrl.port), redirectUrl.hostname, async () => {
      try {
        await shell.openExternal(startResponse.authUrl);
      } catch (error) {
        clearTimeout(timeout);
        await closePoeAuthServer();
        reject(error);
      }
    });
  });
}

// Development mod kontrolu
const isDev = process.argv.includes('--dev');

/**
 * Ana pencereyi olustur
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: '#0d0e12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, 'src', 'assets', 'icon.png'),
    title: APP_NAME
  });

  // HTML dosyasini yukle
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Development modunda DevTools ac
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Pencere kapatildiginda gizle (tamamen kapatma)
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      hideMainWindowToTray(true);
    }
  });

  mainWindow.on('show', () => {
    refreshTrayMenu();
  });

  mainWindow.on('hide', () => {
    refreshTrayMenu();
  });

  // Pencere kapandiginda temizle
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * System tray'i olustur
 */
function createTray() {
  if (tray) {
    refreshTrayMenu();
    return;
  }

  tray = new Tray(createTrayIcon());
  refreshTrayMenu();

  // Tray'e tiklandiginda pencereyi goster/gizle
  tray.on('click', () => {
    toggleMainWindowVisibility();
  });

  tray.on('double-click', () => {
    showMainWindow();
  });

  tray.on('right-click', () => {
    tray.popUpContextMenu();
  });
}

/**
 * Global kisayol tanimla
 */
function registerGlobalShortcuts() {
  // F9 - Hizli loot ekle
  globalShortcut.register('F9', () => {
    captureAndScan();
  });

  // Ctrl+Shift+L - Stash tarama
  globalShortcut.register('CommandOrControl+Shift+L', () => {
    captureAndScan();
  });
}

/**
 * Ekran goruntusu al ve OCR tara
 */
async function captureAndScan() {
  try {
    if (!currentSession) {
      showNotification(t('notificationError'), t('noActiveSession'));
      return;
    }

    // Ekran goruntusu al
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;

    const sources = await require('electron').desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height }
    });

    if (sources.length === 0) {
      showNotification(t('notificationError'), t('screenCaptureFailed'));
      return;
    }

    const screenshot = sources[0].thumbnail.toPNG();

    // OCR tara
    const items = await ocrScanner.scanImage(screenshot);

    if (items.length === 0) {
      showNotification(t('notificationInfo'), t('stashNoItems'));
      return;
    }

    try {
      // API'ye gonder
      const result = await apiClient.addLootBulk(currentSession.id, items);

      // Bildirim goster
      const totalValue = items.reduce((sum, item) => sum + (item.chaosValue * item.quantity), 0);
      showNotification(
        t('notificationLootAdded'),
        t('lootAddedBody', { count: items.length, value: totalValue.toFixed(1) })
      );

      // Renderer'a bilgi gonder
      if (mainWindow) {
        mainWindow.webContents.send('loot-added', { items, totalValue });
      }

      return result;
    } catch (error) {
      if (isRetryableApiError(error)) {
        queuePendingLootAction({
          type: 'bulkLoot',
          sessionId: currentSession.id,
          items
        });
        showNotification(
          t('lootQueuedTitle'),
          t('lootQueuedBody', { count: items.length })
        );
        return { queued: true, count: items.length };
      }

      throw error;
    }
  } catch (error) {
    showNotification(t('notificationError'), t('lootScanFailed'));
  }
}

/**
 * Yeni map session baslat
 */
async function startNewSession(input = {}) {
  try {
    // Aktif session varsa bitir
    if (currentSession) {
      await endCurrentSession();
    }

    const poeVersion = input.poeVersion || store.get('poeVersion') || 'poe1';
    const league = (input.league || store.get('defaultLeague') || 'Standard').trim() || 'Standard';

    // Map adi al
    const mapName = input.mapName || await promptMapName();
    if (!mapName) return;

    // Session olustur
    const session = await apiClient.startSession({
      mapName,
      mapTier: input.mapTier || null,
      mapType: input.mapType || null,
      costChaos: input.costChaos || 0,
      poeVersion,
      league
    });

    currentSession = session;

    // Bildirim goster
    showNotification(t('notificationMapStarted'), t('mapStartedBody', { mapName }));

    // Renderer'a bilgi gonder
    if (mainWindow) {
      mainWindow.webContents.send('session-started', session);
    }

    return session;
  } catch (error) {
    showNotification(t('notificationError'), t('sessionStartFailed'));
  }
}

/**
 * Mevcut session'i bitir
 */
async function endCurrentSession() {
  try {
    if (!currentSession) return;

    const session = await apiClient.endSession(currentSession.id);

    const profit = parseFloat(session.profitChaos);
    const message = profit >= 0 
      ? t('mapProfitBody', { label: t('mapProfit'), value: profit.toFixed(1) })
      : t('mapProfitBody', { label: t('mapLoss'), value: Math.abs(profit).toFixed(1) });

    showNotification(t('notificationMapCompleted'), message);

    // Renderer'a bilgi gonder
    if (mainWindow) {
      mainWindow.webContents.send('session-ended', session);
    }

    currentSession = null;

    return session;
  } catch (error) {
    showNotification(t('notificationError'), t('sessionEndFailed'));
  }
}

/**
 * Map adi icin prompt goster
 */
async function promptMapName() {
  // Basit input dialog
  const { value } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: [t('promptStart'), t('promptCancel')],
    defaultId: 0,
    title: t('promptTitle'),
    message: t('promptMessage'),
    detail: t('promptDetail')
  });

  if (value === 0) {
    // Basit bir input - gercek implementasyonda custom dialog kullanilabilir
    return t('unknownMap'); // Varsayilan deger
  }

  return null;
}

/**
 * Bildirim goster
 */
function showNotification(title, body) {
  if (!store.get('notifications')) return;

  const notification = new (require('electron').Notification)({
    title,
    body,
    icon: path.join(__dirname, 'src', 'assets', 'icon.png')
  });

  notification.show();
}

/**
 * Log parser olaylarini dinle
 */
function setupLogParser() {
  let poePath = store.get('poePath');
  
  // Varsayilan yol
  const defaultPath = 'E:\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt';
  
  // Eger poePath bos veya dosya yoksa, varsayilani dene
  if (!poePath || !require('fs').existsSync(poePath)) {
    if (require('fs').existsSync(defaultPath)) {
      poePath = defaultPath;
      store.set('poePath', defaultPath);
    } else {
      return;
    }
  }

  logParser = new LogParser(poePath);

  logParser.on('mapEntered', (data) => {
    if (store.get('autoStartSession') && !currentSession) {
      // Otomatik session baslat
      apiClient.startSession({
        mapName: data.mapName,
        mapTier: data.mapTier,
        poeVersion: store.get('poeVersion') || 'poe1',
        league: (store.get('defaultLeague') || 'Standard').trim() || 'Standard'
      }).then(session => {
        currentSession = session;
        showNotification(t('notificationAutoSession'), t('autoSessionBody', { mapName: data.mapName }));
        if (mainWindow) {
          mainWindow.webContents.send('session-started', session);
        }
      }).catch(err => {
        showNotification(t('notificationError'), t('sessionStartFailed'));
      });
    }

    if (mainWindow) {
      mainWindow.webContents.send('map-entered', data);
    }
  });

  logParser.on('mapExited', (data) => {
    if (currentSession) {
      endCurrentSession();
    }

    if (mainWindow) {
      mainWindow.webContents.send('map-exited', data);
    }
  });

  logParser.start();
}

/**
 * IPC handler'lari tanimla
 */
function setupIPC() {
  // Window controls
  ipcMain.handle('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });
  ipcMain.handle('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    }
  });
  ipcMain.handle('window-close', () => {
    hideMainWindowToTray(true);
  });

  // Ayarlari getir
  ipcMain.handle('get-settings', () => {
    return store.store;
  });

  // Ayarlari kaydet
  ipcMain.handle('set-settings', (event, settings) => {
    for (const [key, value] of Object.entries(settings)) {
      store.set(key, value);
    }

    if (settings.apiUrl && apiClient) {
      apiClient.setBaseURL(settings.apiUrl);
    }
    return true;
  });

  // Session baslat
  ipcMain.handle('start-session', async (event, data) => {
    return await startNewSession(data || {});
  });

  // Session bitir
  ipcMain.handle('end-session', async () => {
    return await endCurrentSession();
  });

  // Aktif session'i getir
  ipcMain.handle('get-current-session', () => {
    return getCurrentSessionFromBackend();
  });

  ipcMain.handle('get-session-details', async (event, sessionId) => {
    try {
      return await apiClient.getSession(sessionId);
    } catch (error) {
      throw toRendererError(error, 'Session detaylari alinamadi');
    }
  });

  ipcMain.handle('update-session-details', async (event, sessionId, payload = {}) => {
    try {
      return await apiClient.updateSession(sessionId, payload);
    } catch (error) {
      throw toRendererError(error, 'Session detaylari guncellenemedi');
    }
  });

  ipcMain.handle('get-sessions', async (event, params = {}) => {
    const trackerContext = getTrackerContextDefaults(params);
    return await apiClient.getSessions({
      ...params,
      ...trackerContext
    });
  });

  ipcMain.handle('get-dashboard-stats', async () => {
    const trackerContext = getTrackerContextDefaults();
    return await apiClient.getPersonalStats('daily', trackerContext);
  });

  ipcMain.handle('get-recent-loot', async (event, params = {}) => {
    const trackerContext = getTrackerContextDefaults(params);
    return await apiClient.getRecentLoot({
      limit: 8,
      ...params,
      ...trackerContext
    });
  });

  ipcMain.handle('get-pending-loot-actions', () => {
    const queuedActions = getPendingLootActions();
    return {
      count: queuedActions.length
    };
  });

  ipcMain.handle('retry-pending-loot-actions', async () => {
    return await flushPendingLootActions();
  });

  // Manuel loot ekle
  ipcMain.handle('add-loot', async (event, data) => {
    if (!currentSession) {
      throw new Error('Aktif session yok');
    }
    try {
      const result = await apiClient.addLoot(currentSession.id, data);
      if (mainWindow) {
        mainWindow.webContents.send('loot-added', {
          items: [result.lootEntry],
          totalValue: parseFloat(result.lootEntry?.chaosValue || 0) * parseInt(result.lootEntry?.quantity || 1, 10)
        });
      }
      return result;
    } catch (error) {
      if (isRetryableApiError(error)) {
        queuePendingLootAction({
          type: 'singleLoot',
          sessionId: currentSession.id,
          data
        });
        return {
          queued: true
        };
      }

      throw toRendererError(error, 'Loot eklenemedi');
    }
  });

  // Ekran tara
  ipcMain.handle('scan-screen', async () => {
    return await captureAndScan();
  });

  // Login
  ipcMain.handle('login', async (event, credentials) => {
    try {
      const result = await apiClient.login(credentials);
      // API yanıt formatı: { success: true, data: { user, token }, error: null }
      const token = result?.data?.token;
      if (token) {
        store.set('authToken', token);
        apiClient.setToken(token);
        store.set('currentUserId', result?.data?.user?.id || null);
        await flushPendingLootActions();
      }
      return result;
    } catch (error) {
      return {
        success: false,
        data: null,
        error: normalizeErrorMessage(error, 'An error occurred during sign in')
      };
    }
  });

  ipcMain.handle('register', async (event, payload) => {
    try {
      const result = await apiClient.register(payload);
      const token = result?.token;
      if (token) {
        store.set('authToken', token);
        apiClient.setToken(token);
        store.set('currentUserId', result?.user?.id || null);
        await flushPendingLootActions();
      }
      return {
        success: true,
        data: result,
        error: null
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: normalizeErrorMessage(error, 'An error occurred during registration')
      };
    }
  });

  ipcMain.handle('get-current-user', async () => {
    try {
      const me = await apiClient.getMe();
      store.set('currentUserId', me?.user?.id || null);
      await flushPendingLootActions();
      return me;
    } catch (error) {
      throw toRendererError(error, 'Kullanici bilgileri alinamadi');
    }
  });

  ipcMain.handle('start-poe-connect', async () => {
    const redirectUri = process.env.POE_REDIRECT_URI || 'http://127.0.0.1:34127/oauth/poe/callback';
    const redirectUrl = new URL(redirectUri);
    const state = crypto.randomUUID();
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

    const startResponse = await apiClient.startPoeConnect({
      redirectUri,
      codeChallenge,
      codeChallengeMethod: 'S256',
      state,
    });

    if (startResponse?.mode === 'mock') {
      return await apiClient.completePoeConnect({
        code: startResponse.mockCode,
        codeVerifier,
        redirectUri,
        state,
      });
    }

    if (!startResponse?.authUrl) {
      throw new Error('Path of Exile authorization URL could not be created');
    }

    return await openPoeLinkFlow(startResponse, {
      redirectUrl,
      redirectUri,
      expectedState: state,
      codeVerifier,
    });
  });

  ipcMain.handle('complete-poe-connect', async (event, data) => {
    try {
      return await apiClient.completePoeConnect(data || {});
    } catch (error) {
      throw toRendererError(error, 'Path of Exile baglantisi tamamlanamadi');
    }
  });

  ipcMain.handle('get-poe-link-status', async () => {
    try {
      return await apiClient.getPoeLinkStatus();
    } catch (error) {
      throw toRendererError(error, 'Path of Exile baglanti durumu alinamadi');
    }
  });

  ipcMain.handle('disconnect-poe-account', async () => {
    try {
      return await apiClient.disconnectPoeAccount();
    } catch (error) {
      throw toRendererError(error, 'Path of Exile baglantisi kaldirilamadi');
    }
  });

  // Logout
  ipcMain.handle('logout', () => {
    store.set('authToken', null);
    store.set('currentUserId', null);
    apiClient.setToken(null);
    currentSession = null;
    return true;
  });
}

/**
 * Uygulama hazir
 */
app.whenReady().then(() => {
  app.setAppUserModelId(APP_ID);
  app.setName(APP_NAME);

  // API client'i baslat
  apiClient = new APIClient(store.get('apiUrl'), store.get('authToken'));
  ocrScanner = new OCRScanner();

  // IPC handler'lari once kaydet (pencere acilmadan)
  setupIPC();
  
  createMainWindow();
  mainWindow.show(); // Pencereyi goster
  mainWindow.focus();

  createTray();
  registerGlobalShortcuts();
  setupLogParser();
  getCurrentSessionFromBackend().catch(() => {});
  flushPendingLootActions().catch(() => {});
  pendingLootFlushInterval = setInterval(() => {
    flushPendingLootActions().catch(() => {});
  }, 30000);

});

/**
 * Uygulama kapaniyor
 */
app.on('window-all-closed', () => {
  // macOS'ta tum pencereler kapandiginda uygulama kapanmaz
  if (process.platform !== 'darwin') {
    // Tray aktif oldugu icin kapatma
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
    createTray();
  }
  showMainWindow();
});

app.on('will-quit', () => {
  // Global kisayolleri temizle
  globalShortcut.unregisterAll();

  // Log parser'i durdur
  if (logParser) {
    logParser.stop();
  }

  if (tray) {
    tray.destroy();
    tray = null;
  }

  if (pendingLootFlushInterval) {
    clearInterval(pendingLootFlushInterval);
    pendingLootFlushInterval = null;
  }

});
