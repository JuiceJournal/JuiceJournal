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

const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, screen, shell } = require('electron');
const crypto = require('crypto');
const http = require('http');
const path = require('path');
const Store = require('electron-store');

// Modul importlari
const LogParser = require('./src/modules/logParser');
const OCRScanner = require('./src/modules/ocrScanner');
const APIClient = require('./src/modules/apiClient');

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
    scanHotkey: 'F9'
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
        res.end('<h1>Path of Exile linking failed.</h1><p>You can close this window.</p>');
        await closePoeAuthServer();
        reject(new Error(error));
        return;
      }

      if (!code || state !== expectedState) {
        clearTimeout(timeout);
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Invalid callback.</h1><p>You can close this window.</p>');
        await closePoeAuthServer();
        reject(new Error('Invalid callback state'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Path of Exile account linked.</h1><p>You can close this window and return to the app.</p>');

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
    title: 'PoE Farm Tracker'
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
      mainWindow.hide();
    }
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
  const iconPath = path.join(__dirname, 'src', 'assets', 'tray-icon.png');
  
  // Icon dosyasi yoksa varsayilan bir sey kullan
  let trayIcon;
  try {
    if (require('fs').existsSync(iconPath)) {
      trayIcon = iconPath;
    } else {
      // Electron'un varsayilan ikonu veya bos
      trayIcon = null;
    }
  } catch (e) {
    trayIcon = null;
  }
  
  tray = new Tray(trayIcon || path.join(__dirname, 'src', 'index.html')); // Gecici cozum

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Ana Pencereyi Ac',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Yeni Map Session',
      click: () => {
        startNewSession();
      }
    },
    {
      label: 'Loot Ekle (F9)',
      click: () => {
        captureAndScan();
      }
    },
    { type: 'separator' },
    {
      label: 'Ayarlar',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.webContents.send('navigate', 'settings');
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Cikis',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('PoE Farm Tracker');
  tray.setContextMenu(contextMenu);

  // Tray'e tiklandiginda pencereyi goster/gizle
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
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
      showNotification('Hata', 'Aktif map session bulunmuyor. Once yeni bir map baslatin.');
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
      showNotification('Hata', 'Ekran goruntusu alinamadi');
      return;
    }

    const screenshot = sources[0].thumbnail.toPNG();

    // OCR tara
    const items = await ocrScanner.scanImage(screenshot);

    if (items.length === 0) {
      showNotification('Bilgi', 'Stash\'te tanimlanabilir item bulunamadi');
      return;
    }

    // API'ye gonder
    const result = await apiClient.addLootBulk(currentSession.id, items);

    // Bildirim goster
    const totalValue = items.reduce((sum, item) => sum + (item.chaosValue * item.quantity), 0);
    showNotification(
      'Loot Eklendi',
      `${items.length} item eklendi. Toplam: ${totalValue.toFixed(1)}c`
    );

    // Renderer'a bilgi gonder
    if (mainWindow) {
      mainWindow.webContents.send('loot-added', { items, totalValue });
    }

    return result;
  } catch (error) {
    console.error('Loot tarama hatasi:', error);
    showNotification('Hata', 'Loot tarama sirasinda hata olustu');
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
    showNotification('Map Basladi', `${mapName} map'i baslatildi`);

    // Renderer'a bilgi gonder
    if (mainWindow) {
      mainWindow.webContents.send('session-started', session);
    }

    return session;
  } catch (error) {
    console.error('Session baslatma hatasi:', error);
    showNotification('Hata', 'Session baslatilamadi');
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
      ? `Kâr: ${profit.toFixed(1)}c` 
      : `Zarar: ${Math.abs(profit).toFixed(1)}c`;

    showNotification('Map Tamamlandi', message);

    // Renderer'a bilgi gonder
    if (mainWindow) {
      mainWindow.webContents.send('session-ended', session);
    }

    currentSession = null;

    return session;
  } catch (error) {
    console.error('Session bitirme hatasi:', error);
    showNotification('Hata', 'Session bitirilemedi');
  }
}

/**
 * Map adi icin prompt goster
 */
async function promptMapName() {
  // Basit input dialog
  const { value } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Baslat', 'Iptal'],
    defaultId: 0,
    title: 'Yeni Map Session',
    message: 'Map adini girin:',
    detail: 'Ornegin: Dunes Map, City Square Map'
  });

  if (value === 0) {
    // Basit bir input - gercek implementasyonda custom dialog kullanilabilir
    return 'Unknown Map'; // Varsayilan deger
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
        showNotification('Otomatik Session', `${data.mapName} map'i baslatildi`);
        if (mainWindow) {
          mainWindow.webContents.send('session-started', session);
        }
      }).catch(err => {
        console.error('Otomatik session hatasi:', err);
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
    if (mainWindow) mainWindow.close();
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
      }
      return result;
    } catch (error) {
      console.error('Login hatasi:', error);
      throw toRendererError(error, 'Giris yapilamadi');
    }
  });

  ipcMain.handle('register', async (event, payload) => {
    try {
      const result = await apiClient.register(payload);
      const token = result?.token;
      if (token) {
        store.set('authToken', token);
        apiClient.setToken(token);
      }
      return {
        success: true,
        data: result,
        error: null
      };
    } catch (error) {
      throw toRendererError(error, 'Kayit islemi basarisiz');
    }
  });

  ipcMain.handle('get-current-user', async () => {
    try {
      return await apiClient.getMe();
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
    apiClient.setToken(null);
    currentSession = null;
    return true;
  });
}

/**
 * Uygulama hazir
 */
app.whenReady().then(() => {
  // API client'i baslat
  apiClient = new APIClient(store.get('apiUrl'), store.get('authToken'));
  ocrScanner = new OCRScanner();

  // IPC handler'lari once kaydet (pencere acilmadan)
  setupIPC();
  
  createMainWindow();
  mainWindow.show(); // Pencereyi goster
  mainWindow.focus();
  
  // Tray devre disi - icon sorunu cozulene kadar
  // createTray();
  registerGlobalShortcuts();
  setupLogParser();
  getCurrentSessionFromBackend().catch((error) => {
    console.error('Aktif session backend senkron hatasi:', error.message);
  });

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
  }
});

app.on('will-quit', () => {
  // Global kisayolleri temizle
  globalShortcut.unregisterAll();

  // Log parser'i durdur
  if (logParser) {
    logParser.stop();
  }

});
