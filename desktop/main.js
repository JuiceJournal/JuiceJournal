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

const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, screen, shell, nativeImage, safeStorage } = require('electron');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Store = require('electron-store');

// Modul importlari
const LogParser = require('./src/modules/logParser');
const OCRScanner = require('./src/modules/ocrScanner');
const APIClient = require('./src/modules/apiClient');
const PoeApiClient = require('./src/modules/poeApiClient');
const PriceService = require('./src/modules/priceService');
const StashAnalyzer = require('./src/modules/stashAnalyzer');
const GameDetector = require('./src/modules/gameDetector');

const APP_NAME = 'PoE Farm Tracker';
const APP_ID = 'PoeFarmTracker.Desktop';
const DEFAULT_STRATEGY_PRESETS = ['Strongbox', 'Legion', 'Ritual', 'Expedition', 'Harvest', 'Boss Rush'];
const MAX_PENDING_LOOT_ACTIONS = 100;
const MAX_PENDING_SESSION_ACTIONS = 20;
const MAX_AUDIT_TRAIL_ENTRIES = 200;
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
    lootQueuedBody: '{count} item baglanti gelince senkronize edilecek.',
    auditLogin: 'Yerel kullanici girisi basarili',
    auditLogout: 'Kullanici cikis yapti',
    auditSessionStarted: '{mapName} session baslatildi',
    auditSessionQueued: '{mapName} session senkron kuyruguna alindi',
    auditSessionEnded: '{mapName} session tamamlandi',
    auditSessionEndQueued: '{mapName} session bitisi kuyruga alindi',
    auditLootQueued: '{count} loot senkron kuyruguna alindi',
    auditPendingSyncFlushed: 'Bekleyen senkron islemleri denendi. Session: {sessions}, Loot: {loot}',
    auditDiagnosticsExported: 'Diagnostik dosyasi disa aktarildi',
    stashSnapshotTaken: 'Stash goruntusu alindi ({count} item)',
    stashSnapshotFailed: 'Stash goruntusu alinamadi',
    pricesSynced: 'Fiyatlar guncellendi ({count} item)',
    pricesSyncFailed: 'Fiyat guncelleme basarisiz',
    poeNotLinked: 'PoE hesabi bagli degil. Ayarlardan baglayabilirsiniz.',
    profitCalculated: 'Kar hesaplandi: {value}c',
    gameDetected: '{game} algilandi',
    gameClosed: '{game} kapatildi',
    gameSwitched: '{from} → {to} gecis yapildi'
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
    lootQueuedBody: '{count} items will sync when the connection returns.',
    auditLogin: 'Local user login succeeded',
    auditLogout: 'User logged out',
    auditSessionStarted: '{mapName} session started',
    auditSessionQueued: '{mapName} session queued for sync',
    auditSessionEnded: '{mapName} session completed',
    auditSessionEndQueued: '{mapName} session end queued for sync',
    auditLootQueued: '{count} loot actions queued for sync',
    auditPendingSyncFlushed: 'Pending sync processed. Sessions: {sessions}, Loot: {loot}',
    auditDiagnosticsExported: 'Diagnostics file exported',
    stashSnapshotTaken: 'Stash snapshot taken ({count} items)',
    stashSnapshotFailed: 'Failed to take stash snapshot',
    pricesSynced: 'Prices updated ({count} items)',
    pricesSyncFailed: 'Price sync failed',
    poeNotLinked: 'PoE account not linked. Connect it in Settings.',
    profitCalculated: 'Profit calculated: {value}c',
    gameDetected: '{game} detected',
    gameClosed: '{game} closed',
    gameSwitched: 'Switched {from} → {to}'
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
    pendingSessionActions: [],
    pendingLootActions: [],
    queuedCurrentSession: null,
    auditTrail: [],
    strategyPresets: DEFAULT_STRATEGY_PRESETS,
    poeOAuthTokens: null
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
let poeApiClient = null;
let priceService = null;
let stashAnalyzer = null;
let gameDetector = null;
let currentSession = null;
let poeAuthServer = null;
let trayHintShown = false;
let pendingLootFlushInProgress = false;
let pendingLootFlushInterval = null;
let pendingSessionFlushInProgress = false;

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

function serializeSecurePayload(value) {
  const payload = JSON.stringify(value);
  if (!safeStorage.isEncryptionAvailable()) {
    return null;
  }

  return safeStorage.encryptString(payload).toString('base64');
}

function deserializeSecurePayload(serialized) {
  if (!serialized || !safeStorage.isEncryptionAvailable()) {
    return null;
  }

  try {
    const decrypted = safeStorage.decryptString(Buffer.from(serialized, 'base64'));
    return JSON.parse(decrypted);
  } catch {
    return null;
  }
}

function persistPoeTokens(tokens) {
  const encrypted = serializeSecurePayload(tokens);
  if (encrypted) {
    store.set('poeOAuthTokensEncrypted', encrypted);
  } else {
    store.delete('poeOAuthTokensEncrypted');
  }
  store.delete('poeOAuthTokens');
}

function loadPersistedPoeTokens() {
  return deserializeSecurePayload(store.get('poeOAuthTokensEncrypted'));
}

function getPendingLootActions() {
  return store.get('pendingLootActions') || [];
}

function setPendingLootActions(actions) {
  const normalizedActions = actions.slice(-MAX_PENDING_LOOT_ACTIONS);
  store.set('pendingLootActions', normalizedActions);
  emitPendingSyncState();
}

function getPendingSessionActions() {
  return store.get('pendingSessionActions') || [];
}

function setPendingSessionActions(actions) {
  store.set('pendingSessionActions', actions.slice(-MAX_PENDING_SESSION_ACTIONS));
  emitPendingSyncState();
}

function getQueuedCurrentSession() {
  const session = store.get('queuedCurrentSession') || null;
  if (!session) return null;

  const currentUserId = getCurrentUserId();
  if (session.ownerUserId && currentUserId && session.ownerUserId !== currentUserId) {
    return null;
  }

  return session;
}

function setQueuedCurrentSession(session) {
  store.set('queuedCurrentSession', session || null);
  emitPendingSyncState();
}

function getAuditTrail() {
  return store.get('auditTrail') || [];
}

function setAuditTrail(entries) {
  const normalizedEntries = entries.slice(-MAX_AUDIT_TRAIL_ENTRIES);
  store.set('auditTrail', normalizedEntries);

  if (mainWindow) {
    mainWindow.webContents.send('audit-trail-updated', {
      entries: normalizedEntries.slice().reverse().slice(0, 20)
    });
  }
}

function appendAuditTrail(key, values = {}, level = 'info') {
  const entries = getAuditTrail();
  entries.push({
    id: crypto.randomUUID(),
    key,
    values,
    level,
    createdAt: new Date().toISOString()
  });
  setAuditTrail(entries);
}

function getCurrentUserId() {
  return store.get('currentUserId') || null;
}

function assertDesktopUserAuthenticated() {
  if (!store.get('authToken') || !getCurrentUserId()) {
    throw new Error('Yerel uygulama girisi gerekli');
  }
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

function queuePendingSessionAction(action) {
  const queuedActions = getPendingSessionActions();
  queuedActions.push({
    id: crypto.randomUUID(),
    ownerUserId: getCurrentUserId(),
    queuedAt: new Date().toISOString(),
    ...action
  });
  setPendingSessionActions(queuedActions);
}

function createQueuedSession(input = {}) {
  return {
    id: input.localSessionId || `local-${crypto.randomUUID()}`,
    ownerUserId: getCurrentUserId(),
    mapName: input.mapName,
    mapTier: input.mapTier || null,
    mapType: input.mapType || null,
    strategyTag: input.strategyTag || null,
    notes: input.notes || null,
    poeVersion: input.poeVersion,
    league: input.league,
    costChaos: input.costChaos || 0,
    status: 'active',
    startedAt: input.startedAt || new Date().toISOString(),
    endedAt: null,
    totalLootChaos: 0,
    profitChaos: 0,
    lootEntries: [],
    localOnly: true,
    queued: true
  };
}

function isLocalSessionId(sessionId) {
  return typeof sessionId === 'string' && sessionId.startsWith('local-');
}

function getPendingSyncSnapshot() {
  return {
    pendingSessions: getPendingSessionActions().length,
    pendingLoot: getPendingLootActions().length,
    total: getPendingSessionActions().length + getPendingLootActions().length,
    hasQueuedCurrentSession: Boolean(getQueuedCurrentSession())
  };
}

function getPendingSyncEntriesForView() {
  return [
    ...getPendingSessionActions().map((action) => ({
      ...action,
      queueType: 'session'
    })),
    ...getPendingLootActions().map((action) => ({
      ...action,
      queueType: 'loot'
    }))
  ]
    .sort((a, b) => new Date(b.lastAttemptAt || b.queuedAt).getTime() - new Date(a.lastAttemptAt || a.queuedAt).getTime())
    .slice(0, 20);
}

function emitPendingSyncState() {
  if (!mainWindow) return;
  mainWindow.webContents.send('pending-sync-updated', {
    ...getPendingSyncSnapshot(),
    entries: getPendingSyncEntriesForView()
  });
}

function annotateSyncFailure(action, error, { blocked = false } = {}) {
  return {
    ...action,
    attempts: (action.attempts || 0) + 1,
    lastAttemptAt: new Date().toISOString(),
    lastError: normalizeErrorMessage(error, 'Unexpected sync error'),
    blocked
  };
}

function appendQueuedLootToCurrentSession(items) {
  if (!currentSession || !Array.isArray(items) || !items.length) {
    return;
  }

  const existingLoot = Array.isArray(currentSession.lootEntries) ? currentSession.lootEntries : [];
  const normalizedItems = items.map((item) => ({
    id: `queued-loot-${crypto.randomUUID()}`,
    itemName: item.itemName,
    itemType: item.itemType || 'other',
    quantity: item.quantity || 1,
    chaosValue: item.chaosValue || 0,
    divineValue: item.divineValue || null,
    createdAt: new Date().toISOString()
  }));

  currentSession.lootEntries = [...normalizedItems, ...existingLoot];
  const totalLootChaos = currentSession.lootEntries.reduce((sum, loot) => (
    sum + ((parseFloat(loot.chaosValue) || 0) * (parseInt(loot.quantity || 0, 10) || 0))
  ), 0);
  currentSession.totalLootChaos = totalLootChaos;
  currentSession.profitChaos = totalLootChaos - (parseFloat(currentSession.costChaos) || 0);
  if (currentSession.localOnly) {
    setQueuedCurrentSession(currentSession);
  }
}

async function flushPendingSessionActions(forceBlocked = false) {
  if (pendingSessionFlushInProgress || !apiClient?.token) {
    return { processed: 0, remaining: getPendingSessionActions().length, sessionIdMap: new Map() };
  }

  const currentUserId = getCurrentUserId();
  const queuedActions = getPendingSessionActions();
  if (!queuedActions.length || !currentUserId) {
    return { processed: 0, remaining: queuedActions.length, sessionIdMap: new Map() };
  }

  pendingSessionFlushInProgress = true;
  const remainingActions = [];
  const sessionIdMap = new Map();
  let processed = 0;

  try {
    for (const action of queuedActions) {
      if (action.ownerUserId && action.ownerUserId !== currentUserId) {
        remainingActions.push(action);
        continue;
      }

      if (action.blocked && !forceBlocked) {
        remainingActions.push(action);
        continue;
      }

      try {
        if (action.type === 'sessionStart') {
          const session = await apiClient.startSession({
            ...action.payload,
            startedAt: action.startedAt
          });
          sessionIdMap.set(action.localSessionId, session.id);

          const queuedCurrentSession = getQueuedCurrentSession();
          if (queuedCurrentSession?.id === action.localSessionId) {
            currentSession = session;
            setQueuedCurrentSession(null);
          }
        } else if (action.type === 'sessionEnd') {
          const resolvedSessionId = sessionIdMap.get(action.sessionId) || action.sessionId;
          if (isLocalSessionId(resolvedSessionId)) {
            remainingActions.push(action);
            continue;
          }

          await apiClient.endSession(resolvedSessionId, {
            endedAt: action.endedAt
          });

          const queuedCurrentSession = getQueuedCurrentSession();
          if (queuedCurrentSession?.id === action.sessionId) {
            currentSession = null;
            setQueuedCurrentSession(null);
          }
        }

        processed += 1;
      } catch (error) {
        if (isRetryableApiError(error)) {
          remainingActions.push(annotateSyncFailure(action, error));
          break;
        }

        remainingActions.push(annotateSyncFailure(action, error, { blocked: true }));
      }
    }
  } finally {
    setPendingSessionActions(remainingActions);
    pendingSessionFlushInProgress = false;
  }

  return {
    processed,
    remaining: remainingActions.length,
    sessionIdMap
  };
}

async function flushPendingLootActions(sessionIdMap = new Map(), forceBlocked = false) {
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

      if (action.blocked && !forceBlocked) {
        remainingActions.push(action);
        continue;
      }

      const resolvedSessionId = sessionIdMap.get(action.sessionId) || action.sessionId;
      if (isLocalSessionId(resolvedSessionId)) {
        remainingActions.push(action);
        continue;
      }

      try {
        if (action.type === 'bulkLoot') {
          await apiClient.addLootBulk(resolvedSessionId, action.items);
        } else if (action.type === 'singleLoot') {
          await apiClient.addLoot(resolvedSessionId, action.data);
        } else {
          continue;
        }

        processed += 1;
      } catch (error) {
        if (isRetryableApiError(error)) {
          remainingActions.push(annotateSyncFailure(action, error));
          break;
        }

        remainingActions.push(annotateSyncFailure(action, error, { blocked: true }));
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

async function flushPendingActions(forceBlocked = false) {
  const sessionResult = await flushPendingSessionActions(forceBlocked);
  const lootResult = await flushPendingLootActions(sessionResult.sessionIdMap, forceBlocked);

  if ((sessionResult.processed || 0) > 0 || (lootResult.processed || 0) > 0) {
    appendAuditTrail('auditPendingSyncFlushed', {
      sessions: sessionResult.processed || 0,
      loot: lootResult.processed || 0
    });
  }

  return {
    sessions: sessionResult,
    loot: lootResult
  };
}

async function buildDiagnosticsPayload() {
  const settings = { ...store.store };
  delete settings.authToken;
  delete settings.auditTrail;
  delete settings.poeOAuthTokens;
  delete settings.poeOAuthTokensEncrypted;

  const apiSnapshot = {
    baseURL: apiClient?.baseURL || store.get('apiUrl'),
    authenticated: Boolean(apiClient?.token),
    status: 'unknown',
    latencyMs: null,
    details: null,
    error: null
  };

  if (apiClient) {
    const startedAt = Date.now();
    try {
      const health = await apiClient.healthCheck();
      apiSnapshot.status = 'reachable';
      apiSnapshot.latencyMs = Date.now() - startedAt;
      apiSnapshot.details = health?.data || health || null;
    } catch (error) {
      apiSnapshot.status = 'unreachable';
      apiSnapshot.latencyMs = Date.now() - startedAt;
      apiSnapshot.error = normalizeErrorMessage(error, 'Unable to reach API');
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    platform: process.platform,
    release: os.release(),
    currentUserId: getCurrentUserId(),
    pendingSync: {
      snapshot: getPendingSyncSnapshot(),
      sessionActions: getPendingSessionActions().map((action) => ({
        id: action.id,
        type: action.type,
        sessionId: action.sessionId || action.localSessionId || null,
        queuedAt: action.queuedAt
      })),
      lootActions: getPendingLootActions().map((action) => ({
        id: action.id,
        type: action.type,
        sessionId: action.sessionId || null,
        queuedAt: action.queuedAt,
        itemCount: Array.isArray(action.items) ? action.items.length : 1
      }))
    },
    currentSession: currentSession ? {
      id: currentSession.id,
      mapName: currentSession.mapName,
      status: currentSession.status,
      localOnly: Boolean(currentSession.localOnly),
      queued: Boolean(currentSession.queued),
      startedAt: currentSession.startedAt,
      endedAt: currentSession.endedAt || null
    } : null,
    api: apiSnapshot,
    auditTrail: getAuditTrail(),
    settings
  };
}

function prepareOCRImage(imageBuffer) {
  const image = nativeImage.createFromBuffer(imageBuffer);
  const size = image.getSize();
  if (!size.width || !size.height) {
    return imageBuffer;
  }

  const cropRegion = {
    x: Math.round(size.width * 0.08),
    y: Math.round(size.height * 0.12),
    width: Math.round(size.width * 0.84),
    height: Math.round(size.height * 0.76)
  };

  const cropped = image.crop(cropRegion);
  const croppedSize = cropped.getSize();
  const resized = croppedSize.width > 1600
    ? cropped.resize({
        width: 1600,
        height: Math.round((croppedSize.height / croppedSize.width) * 1600)
      })
    : cropped;

  return resized.toPNG();
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
  try {
    const session = await apiClient.getActiveSession();
    currentSession = session || getQueuedCurrentSession() || null;
    return currentSession;
  } catch (error) {
    const queuedSession = getQueuedCurrentSession();
    if (queuedSession) {
      currentSession = queuedSession;
      return currentSession;
    }
    throw error;
  }
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
        const parsedAuthUrl = new URL(startResponse.authUrl);
        if (parsedAuthUrl.protocol !== 'https:' && parsedAuthUrl.protocol !== 'http:') {
          throw new Error('Invalid auth URL scheme — only https/http allowed');
        }
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
const isDev = !app.isPackaged;

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
      nodeIntegration: false,
      sandbox: true
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

    const screenshot = prepareOCRImage(sources[0].thumbnail.toPNG());

    // OCR tara
    const items = await ocrScanner.scanImage(screenshot);

    if (items.length === 0) {
      showNotification(t('notificationInfo'), t('stashNoItems'));
      return;
    }

    if (currentSession.localOnly) {
      appendQueuedLootToCurrentSession(items);
      queuePendingLootAction({
        type: 'bulkLoot',
        sessionId: currentSession.id,
        items
      });
      appendAuditTrail('auditLootQueued', { count: items.length }, 'warning');
      showNotification(
        t('lootQueuedTitle'),
        t('lootQueuedBody', { count: items.length })
      );
      return { queued: true, count: items.length };
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
        appendQueuedLootToCurrentSession(items);
        queuePendingLootAction({
          type: 'bulkLoot',
          sessionId: currentSession.id,
          items
        });
        appendAuditTrail('auditLootQueued', { count: items.length }, 'warning');
        const totalValue = items.reduce((sum, item) => sum + ((item.chaosValue || 0) * (item.quantity || 1)), 0);
        if (mainWindow) {
          mainWindow.webContents.send('loot-added', { items, totalValue, queued: true });
        }
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
    let session;
    try {
      session = await apiClient.startSession({
        mapName,
        mapTier: input.mapTier || null,
        mapType: input.mapType || null,
        costChaos: input.costChaos || 0,
        poeVersion,
        league
      });
      setQueuedCurrentSession(null);
      appendAuditTrail('auditSessionStarted', { mapName });
    } catch (error) {
      if (!isRetryableApiError(error)) {
        throw error;
      }

      session = createQueuedSession({
        localSessionId: input.localSessionId,
        mapName,
        mapTier: input.mapTier || null,
        mapType: input.mapType || null,
        strategyTag: input.strategyTag || null,
        notes: input.notes || null,
        costChaos: input.costChaos || 0,
        poeVersion,
        league,
        startedAt: input.startedAt || new Date().toISOString()
      });

      queuePendingSessionAction({
        type: 'sessionStart',
        localSessionId: session.id,
        startedAt: session.startedAt,
        payload: {
          mapName,
          mapTier: input.mapTier || null,
          mapType: input.mapType || null,
          strategyTag: input.strategyTag || null,
          notes: input.notes || null,
          costChaos: input.costChaos || 0,
          poeVersion,
          league
        }
      });
      setQueuedCurrentSession(session);
      appendAuditTrail('auditSessionQueued', { mapName }, 'warning');
    }

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
    let session = currentSession;
    let queued = false;

    if (currentSession.localOnly) {
      queuePendingSessionAction({
        type: 'sessionEnd',
        sessionId: currentSession.id,
        endedAt: new Date().toISOString()
      });
      setQueuedCurrentSession(null);
      queued = true;
      appendAuditTrail('auditSessionEndQueued', { mapName: currentSession.mapName }, 'warning');
    } else {
      try {
        session = await apiClient.endSession(currentSession.id);
        appendAuditTrail('auditSessionEnded', { mapName: currentSession.mapName });
      } catch (error) {
        if (!isRetryableApiError(error)) {
          throw error;
        }

        queuePendingSessionAction({
          type: 'sessionEnd',
          sessionId: currentSession.id,
          endedAt: new Date().toISOString()
        });
        queued = true;
        appendAuditTrail('auditSessionEndQueued', { mapName: currentSession.mapName }, 'warning');
      }
    }

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

    return queued ? { ...session, queued: true } : session;
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
      startNewSession({
        mapName: data.mapName,
        mapTier: data.mapTier,
        poeVersion: store.get('poeVersion') || 'poe1',
        league: (store.get('defaultLeague') || 'Standard').trim() || 'Standard'
      }).then(session => {
        showNotification(t('notificationAutoSession'), t('autoSessionBody', { mapName: data.mapName }));
        if (mainWindow) {
          mainWindow.webContents.send('session-started', session);
        }
      }).catch(() => {
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
 * Game detector - auto-detect PoE 1 / PoE 2 running
 */
function setupGameDetector() {
  gameDetector = new GameDetector();

  gameDetector.on('gameLaunched', ({ version }) => {
    const gameLabel = version === 'poe2' ? 'Path of Exile 2' : 'Path of Exile';
    console.log(`[GameDetector] ${gameLabel} launched`);
    applyGameVersion(version);
    showNotification(t('notificationInfo'), t('gameDetected', { game: gameLabel }));
  });

  gameDetector.on('gameSwitched', ({ from, to }) => {
    const fromLabel = from === 'poe2' ? 'PoE 2' : 'PoE 1';
    const toLabel = to === 'poe2' ? 'PoE 2' : 'PoE 1';
    console.log(`[GameDetector] Switched from ${fromLabel} to ${toLabel}`);
    applyGameVersion(to);
    showNotification(t('notificationInfo'), t('gameSwitched', { from: fromLabel, to: toLabel }));
  });

  gameDetector.on('gameClosed', ({ version }) => {
    const gameLabel = version === 'poe2' ? 'Path of Exile 2' : 'Path of Exile';
    console.log(`[GameDetector] ${gameLabel} closed`);
    if (mainWindow) {
      mainWindow.webContents.send('game-closed', { version });
    }
  });

  gameDetector.start();
}

/**
 * Apply detected game version — update store, price service, log parser, and notify renderer
 */
function applyGameVersion(version) {
  const currentVersion = store.get('poeVersion');
  if (version === currentVersion) return;

  // Update store
  store.set('poeVersion', version);

  // Update price service
  if (priceService) {
    priceService.setPoeVersion(version);
    priceService.clearCache();
  }

  // Try to find and switch Client.txt path for the new version
  const detectedLogPath = GameDetector.findLogPath(version);
  if (detectedLogPath) {
    store.set('poePath', detectedLogPath);

    // Restart log parser with new path
    if (logParser) {
      logParser.stop();
    }
    setupLogParser();
  }

  // Notify renderer to update UI (icons, labels, etc.)
  if (mainWindow) {
    mainWindow.webContents.send('game-version-changed', {
      version,
      logPath: detectedLogPath || store.get('poePath')
    });
  }
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

  // Ayarlari getir (secret alanlari cikar)
  ipcMain.handle('get-settings', () => {
    const allSettings = { ...store.store };
    delete allSettings.authToken;
    delete allSettings.poeOAuthTokens;
    delete allSettings.currentUserId;
    return allSettings;
  });

  // Ayarlari kaydet (sadece izin verilen anahtarlar)
  const SETTINGS_ALLOWLIST = new Set([
    'apiUrl', 'poePath', 'autoStartSession', 'notifications',
    'soundNotifications', 'language', 'poeVersion', 'defaultLeague',
    'scanHotkey', 'theme'
  ]);

  ipcMain.handle('set-settings', (event, settings) => {
    for (const [key, value] of Object.entries(settings)) {
      if (SETTINGS_ALLOWLIST.has(key)) {
        store.set(key, value);
      }
    }

    if (settings.apiUrl && apiClient) {
      apiClient.setBaseURL(settings.apiUrl);
    }
    return true;
  });

  // Auth token kontrolu (token'i aciga cikarmadan)
  ipcMain.handle('has-auth-token', () => {
    return !!store.get('authToken');
  });

  // Currency price sync (backend API uzerinden, token guvenli)
  ipcMain.handle('sync-currency-prices', async (event, { league, poeVersion } = {}) => {
    try {
      return await apiClient.syncPrices({ league, poeVersion });
    } catch (error) {
      throw toRendererError(error, 'Price sync failed');
    }
  });

  // Currency fiyatlarini getir
  ipcMain.handle('get-currency-prices', async (event, params = {}) => {
    try {
      return await apiClient.getPrices(params);
    } catch (error) {
      throw toRendererError(error, 'Failed to load prices');
    }
  });

  // Ligleri getir
  ipcMain.handle('get-currency-leagues', async (event, poeVersion = 'poe1') => {
    try {
      return await apiClient.getLeagues({ poeVersion });
    } catch (error) {
      throw toRendererError(error, 'Failed to load leagues');
    }
  });

  // Client.txt dosya secici
  ipcMain.handle('browse-poe-path', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Client.txt',
      filters: [{ name: 'Log Files', extensions: ['txt'] }],
      properties: ['openFile']
    });
    if (canceled || !filePaths.length) return null;
    return filePaths[0];
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
    try {
      return await apiClient.getSessions({
        ...params,
        ...trackerContext
      });
    } catch (error) {
      const queuedSession = getQueuedCurrentSession();
      if (queuedSession) {
        return {
          sessions: [queuedSession],
          total: 1,
          limit: params.limit || 50,
          offset: params.offset || 0
        };
      }
      throw error;
    }
  });

  ipcMain.handle('get-dashboard-stats', async () => {
    const trackerContext = getTrackerContextDefaults();
    try {
      return await apiClient.getPersonalStats('daily', trackerContext);
    } catch (error) {
      const queuedSession = getQueuedCurrentSession();
      if (queuedSession) {
        return {
          summary: {
            totalSessions: 1,
            totalCost: parseFloat(queuedSession.costChaos || 0),
            totalLoot: parseFloat(queuedSession.totalLootChaos || 0),
            totalProfit: parseFloat(queuedSession.profitChaos || 0),
            totalDuration: 0,
            avgProfitPerMap: parseFloat(queuedSession.profitChaos || 0),
            avgProfitPerHour: 0
          },
          dailyStats: [],
          mapStats: []
        };
      }
      throw error;
    }
  });

  ipcMain.handle('get-recent-loot', async (event, params = {}) => {
    const trackerContext = getTrackerContextDefaults(params);
    try {
      return await apiClient.getRecentLoot({
        limit: 8,
        ...params,
        ...trackerContext
      });
    } catch (error) {
      const queuedSession = getQueuedCurrentSession();
      return {
        lootEntries: queuedSession?.lootEntries || [],
        count: queuedSession?.lootEntries?.length || 0
      };
    }
  });

  ipcMain.handle('get-pending-loot-actions', () => {
    const queuedActions = getPendingLootActions();
    return {
      count: queuedActions.length
    };
  });

  ipcMain.handle('get-sync-status', () => {
    return {
      ...getPendingSyncSnapshot(),
      entries: getPendingSyncEntriesForView()
    };
  });

  ipcMain.handle('get-audit-trail', () => {
    return {
      entries: getAuditTrail().slice().reverse().slice(0, 20)
    };
  });

  ipcMain.handle('retry-pending-loot-actions', async () => {
    return await flushPendingActions(true);
  });

  ipcMain.handle('export-diagnostics', async () => {
    const defaultPath = path.join(app.getPath('documents'), `poe-farm-diagnostics-${Date.now()}.json`);
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Diagnostics',
      defaultPath,
      filters: [
        { name: 'JSON', extensions: ['json'] }
      ]
    });

    if (canceled || !filePath) {
      return { canceled: true };
    }

    const payload = await buildDiagnosticsPayload();
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    appendAuditTrail('auditDiagnosticsExported');
    return {
      canceled: false,
      filePath
    };
  });

  // Manuel loot ekle
  ipcMain.handle('add-loot', async (event, data) => {
    if (!currentSession) {
      throw new Error('Aktif session yok');
    }
    try {
      if (currentSession.localOnly) {
        appendQueuedLootToCurrentSession([data]);
        queuePendingLootAction({
          type: 'singleLoot',
          sessionId: currentSession.id,
          data
        });
        if (mainWindow) {
          mainWindow.webContents.send('loot-added', {
            items: [data],
            totalValue: parseFloat(data.chaosValue || 0) * parseInt(data.quantity || 1, 10),
            queued: true
          });
        }
        return {
          queued: true
        };
      }

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
        appendQueuedLootToCurrentSession([data]);
        queuePendingLootAction({
          type: 'singleLoot',
          sessionId: currentSession.id,
          data
        });
        if (mainWindow) {
          mainWindow.webContents.send('loot-added', {
            items: [data],
            totalValue: parseFloat(data.chaosValue || 0) * parseInt(data.quantity || 1, 10),
            queued: true
          });
        }
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
        await flushPendingActions();
        appendAuditTrail('auditLogin');
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
        await flushPendingActions();
        appendAuditTrail('auditLogin');
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
      await flushPendingActions();
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

  // ==================== STASH & PRICES ====================

  // Sync prices from poe.ninja
  ipcMain.handle('sync-prices', async (event, options = {}) => {
    try {
      assertDesktopUserAuthenticated();
      const league = options.league || store.get('defaultLeague') || 'Standard';
      priceService.setPoeVersion(store.get('poeVersion') || 'poe1');
      const result = await priceService.syncPrices(league, options);
      return result;
    } catch (error) {
      throw toRendererError(error, t('pricesSyncFailed'));
    }
  });

  // Get price for a specific item
  ipcMain.handle('get-item-price', async (event, itemName) => {
    assertDesktopUserAuthenticated();
    return priceService.getPriceInfo(itemName);
  });

  // Price a list of items
  ipcMain.handle('price-items', async (event, items) => {
    assertDesktopUserAuthenticated();
    return priceService.priceItems(items);
  });

  // Get price service status
  ipcMain.handle('get-price-status', async () => {
    assertDesktopUserAuthenticated();
    return priceService.getStatus();
  });

  // List stash tabs from PoE API
  ipcMain.handle('list-stash-tabs', async (event, league) => {
    try {
      assertDesktopUserAuthenticated();
      if (!poeApiClient.isAuthenticated()) {
        throw new Error(t('poeNotLinked'));
      }
      const leagueName = league || store.get('defaultLeague') || 'Standard';
      return await poeApiClient.listStashTabs(leagueName);
    } catch (error) {
      throw toRendererError(error, t('stashSnapshotFailed'));
    }
  });

  // Take a stash snapshot
  ipcMain.handle('take-stash-snapshot', async (event, options = {}) => {
    try {
      assertDesktopUserAuthenticated();
      if (!poeApiClient.isAuthenticated()) {
        throw new Error(t('poeNotLinked'));
      }
      const league = options.league || store.get('defaultLeague') || 'Standard';
      const snapshot = await poeApiClient.takeStashSnapshot(league, {
        tabIds: options.tabIds,
        allTabs: options.allTabs
      });

      // Price the items
      const priced = priceService.priceItems(snapshot.items);
      snapshot.items = priced.items;
      snapshot.totalChaos = priced.totalChaos;
      snapshot.totalDivine = priced.totalDivine;
      snapshot.divinePrice = priced.divinePrice;

      // Save the snapshot
      const snapshotId = options.snapshotId || `snap_${Date.now()}`;
      stashAnalyzer.saveSnapshot(snapshotId, snapshot);

      if (mainWindow) {
        mainWindow.webContents.send('stash-snapshot-taken', {
          snapshotId,
          itemCount: snapshot.items.length,
          totalChaos: snapshot.totalChaos,
          totalDivine: snapshot.totalDivine
        });
      }

      return {
        snapshotId,
        itemCount: snapshot.items.length,
        totalChaos: snapshot.totalChaos,
        totalDivine: snapshot.totalDivine,
        tabs: snapshot.tabs,
        items: snapshot.items
      };
    } catch (error) {
      throw toRendererError(error, t('stashSnapshotFailed'));
    }
  });

  // Calculate profit between two snapshots
  ipcMain.handle('calculate-profit', async (event, beforeId, afterId) => {
    try {
      assertDesktopUserAuthenticated();
      const report = stashAnalyzer.diffSnapshots(beforeId, afterId, priceService);

      if (mainWindow) {
        mainWindow.webContents.send('profit-calculated', report);
      }

      return report;
    } catch (error) {
      throw toRendererError(error, 'Profit calculation failed');
    }
  });

  // List stored snapshots
  ipcMain.handle('list-snapshots', async () => {
    assertDesktopUserAuthenticated();
    return stashAnalyzer.listSnapshots();
  });

  // Delete a snapshot
  ipcMain.handle('delete-snapshot', async (event, snapshotId) => {
    assertDesktopUserAuthenticated();
    stashAnalyzer.deleteSnapshot(snapshotId);
    return true;
  });

  // Set PoE OAuth tokens (called after successful OAuth flow)
  ipcMain.handle('set-poe-tokens', async (event, tokens) => {
    assertDesktopUserAuthenticated();
    poeApiClient.setTokens(tokens);
    persistPoeTokens(poeApiClient.getTokens());
    return true;
  });

  // Get detected game status
  ipcMain.handle('get-detected-game', async () => {
    return {
      version: gameDetector ? gameDetector.getDetectedGame() : null,
      settingsVersion: store.get('poeVersion') || 'poe1'
    };
  });

  // Check if PoE API is authenticated
  ipcMain.handle('get-poe-auth-status', async () => {
    assertDesktopUserAuthenticated();
    return {
      authenticated: poeApiClient.isAuthenticated(),
      expired: poeApiClient.isTokenExpired()
    };
  });

  // Logout
  ipcMain.handle('logout', () => {
    appendAuditTrail('auditLogout');
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
  poeApiClient = new PoeApiClient();
  priceService = new PriceService();
  stashAnalyzer = new StashAnalyzer();

  // Set PoE version for price service
  priceService.setPoeVersion(store.get('poeVersion') || 'poe1');

  // Restore PoE OAuth tokens if saved
  const savedPoeTokens = store.get('poeOAuthTokens');
  const securePoeTokens = loadPersistedPoeTokens() || savedPoeTokens;
  if (securePoeTokens?.accessToken) {
    poeApiClient.setTokens(securePoeTokens);
    persistPoeTokens(securePoeTokens);
  }

  // IPC handler'lari once kaydet (pencere acilmadan)
  setupIPC();
  
  createMainWindow();
  mainWindow.show(); // Pencereyi goster
  mainWindow.focus();
  emitPendingSyncState();

  createTray();
  registerGlobalShortcuts();
  setupLogParser();
  setupGameDetector();
  getCurrentSessionFromBackend().catch(() => {});
  flushPendingActions().catch(() => {});
  pendingLootFlushInterval = setInterval(() => {
    flushPendingActions().catch(() => {});
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

  // Game detector'i durdur
  if (gameDetector) {
    gameDetector.stop();
  }

  if (ocrScanner) {
    ocrScanner.terminate().catch(() => {});
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
