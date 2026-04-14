/**
 * Juice Journal - Desktop App
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
const {
  createRuntimeSessionState,
  applyRuntimeEvent,
  clearRuntimeSessionState,
  cloneRuntimeSessionState
} = require('./src/modules/runtimeSessionModel');
const { appendMapResult } = require('./src/modules/mapResultStoreModel');
const { deriveMapResultOverlayState } = require('./src/modules/mapResultOverlayModel');
const { deriveOverlayState } = require('./src/modules/overlayStateModel');
const {
  DEFAULT_SCAN_HOTKEY,
  DEFAULT_STASH_SCAN_HOTKEY,
  validateHotkeys
} = require('./src/modules/hotkeyModel');
const { createNativeGameInfoProducer } = require('./src/modules/nativeGameInfoProducer');
const DEFAULT_POE_LOG_PATH = GameDetector.DEFAULT_POE_LOG_PATH;

const APP_NAME = 'Juice Journal';
const APP_ID = 'JuiceJournal.Desktop';
const DEFAULT_STRATEGY_PRESETS = ['Strongbox', 'Legion', 'Ritual', 'Expedition', 'Harvest', 'Boss Rush'];
const MAP_RESULT_OVERLAY_DURATION_MS = 10_000;
const MAX_PENDING_LOOT_ACTIONS = 100;
const MAX_PENDING_SESSION_ACTIONS = 20;
const MAX_AUDIT_TRAIL_ENTRIES = 200;
const WINDOWS_APP_ICON_PATH = path.join(__dirname, 'src', 'assets', 'icon.ico');
const APP_ICON_PATH = process.platform === 'win32'
  ? WINDOWS_APP_ICON_PATH
  : path.join(__dirname, 'src', 'assets', 'icon.png');
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
    trayAddLoot: 'Loot Ekle',
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
    trayAddLoot: 'Add Loot',
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
    authTokenEncrypted: null,
    poePath: DEFAULT_POE_LOG_PATH,
    autoStartSession: true,
    notifications: true,
    language: 'en',
    soundNotifications: false,
    poeVersion: 'poe1',
    scanHotkey: DEFAULT_SCAN_HOTKEY,
    stashScanHotkey: DEFAULT_STASH_SCAN_HOTKEY,
    overlayEnabled: false,
    currentUserId: null,
    pendingSessionActions: [],
    pendingLootActions: [],
    activeFarmTypeId: null,
    queuedCurrentSession: null,
    auditTrail: [],
    strategyPresets: DEFAULT_STRATEGY_PRESETS,
    poeOAuthTokens: null
  },
});

// Migrate old 'tr' default to 'en' (one-time)
function migrateLanguageSetting() {
  if (store.get('_langMigrated')) {
    return;
  }

  const savedLanguage = store.get('language');
  if (typeof savedLanguage !== 'string' || !savedLanguage.trim()) {
    store.set('language', 'en');
  }

  store.set('_langMigrated', true);
}

migrateLanguageSetting();

function normalizePoeVersion(version) {
  return version === 'poe1' || version === 'poe2' ? version : null;
}

function getLeagueKeyForVersion(version) {
  return version === 'poe2' ? 'defaultLeaguePoe2' : 'defaultLeaguePoe1';
}

function getLegacyDefaultLeagueForVersion(version) {
  const legacyLeague = store.get('defaultLeague');
  if (typeof legacyLeague !== 'string' || !legacyLeague.trim()) {
    return null;
  }

  const legacyVersion = normalizePoeVersion(store.get('lastDetectedPoeVersion'))
    || normalizePoeVersion(store.get('poeVersion'))
    || 'poe1';

  return legacyVersion === version ? legacyLeague.trim() : null;
}

function migrateLegacyDefaultLeagueSetting() {
  const targetVersion = normalizePoeVersion(store.get('lastDetectedPoeVersion'))
    || normalizePoeVersion(store.get('poeVersion'))
    || 'poe1';
  const legacyLeague = getLegacyDefaultLeagueForVersion(targetVersion);
  if (!legacyLeague) {
    return;
  }

  const targetKey = getLeagueKeyForVersion(targetVersion);
  const storedLeague = store.get(targetKey);
  if (typeof storedLeague === 'string' && storedLeague.trim()) {
    return;
  }

  store.set(targetKey, legacyLeague);
}

migrateLegacyDefaultLeagueSetting();

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
let runtimeSessionState = createRuntimeSessionState();
let overlayWindow = null;
let overlayCharacterState = null;
let overlayRuntimeState = null;
let overlayMapResultState = null;
let overlayMapResultDismissTimer = null;
let lastActiveCharacterHint = null;
let nativeGameInfoProducer = null;
let nativeGameInfoProducerBinding = null;
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

// ─── URL validation for SSRF prevention ───────────────────────────────

const INTERNAL_IP_PREFIXES = ['10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.', '192.168.', '169.254.'];

function isValidApiUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return false;
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
      const port = url.port ? parseInt(url.port, 10) : (url.protocol === 'https:' ? 443 : 80);
      if (port !== 3000 && port !== 3001 && port !== 80 && port !== 443) return false;
    }
    for (const prefix of INTERNAL_IP_PREFIXES) {
      if (hostname.startsWith(prefix)) return false;
    }
    return true;
  } catch {
    return false;
  }
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

function encryptAuthToken(token) {
  if (!token || !safeStorage.isEncryptionAvailable()) {
    return null;
  }
  try {
    return safeStorage.encryptString(Buffer.from(token)).toString('base64');
  } catch {
    return null;
  }
}

function getDecryptedAuthToken() {
  if (!safeStorage.isEncryptionAvailable()) {
    return store.get('authToken') || null;
  }
  const encrypted = store.get('authTokenEncrypted');
  if (!encrypted) {
    // Fallback to legacy plaintext token if available
    const legacy = store.get('authToken');
    if (legacy) return legacy;
    return null;
  }
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))?.toString() || null;
  } catch {
    // Decryption failed (e.g., key changed) — require re-login
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
  if (!currentUserId) {
    return null;
  }

  if (session.ownerUserId && session.ownerUserId !== currentUserId) {
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
  if (!getDecryptedAuthToken() || !getCurrentUserId()) {
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
    farmTypeId: input.farmTypeId || input.mapType || null,
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

function normalizeStoredFarmTypeId(farmTypeId) {
  const normalized = typeof farmTypeId === 'string' ? farmTypeId.trim() : '';
  return normalized || null;
}

function getActiveFarmTypeId() {
  return normalizeStoredFarmTypeId(store.get('activeFarmTypeId'));
}

function setActiveFarmTypeId(farmTypeId) {
  const normalized = normalizeStoredFarmTypeId(farmTypeId);
  store.set('activeFarmTypeId', normalized);
  return normalized;
}

function getMapResultsStoreKey(userId = getCurrentUserId()) {
  return userId ? `mapResults:${userId}` : null;
}

function getStoredMapResults() {
  const storeKey = getMapResultsStoreKey();
  if (!storeKey) {
    return [];
  }

  const results = store.get(storeKey);
  return Array.isArray(results) ? results : [];
}

function saveMapResultHistory(result) {
  const storeKey = getMapResultsStoreKey();
  if (!storeKey) {
    return [];
  }

  const nextResults = appendMapResult(getStoredMapResults(), result, { maxResults: 100 });
  store.set(storeKey, nextResults);
  return nextResults;
}

function emitPendingSyncState() {
  if (!mainWindow) return;
  mainWindow.webContents.send('pending-sync-updated', {
    ...getPendingSyncSnapshot(),
    entries: getPendingSyncEntriesForView()
  });
}

function emitActiveCharacterHint(payload) {
  lastActiveCharacterHint = payload || null;

  if (!mainWindow || !mainWindow.webContents) {
    return;
  }

  mainWindow.webContents.send('active-character-hint', payload);
}

function clearNativeActiveCharacterHint() {
  emitActiveCharacterHint(null);
}

function getNativeGameInfoGameId(version) {
  if (version === 'poe2') {
    return 24886;
  }

  return null;
}

function getNativeGameInfoProducer() {
  if (!nativeGameInfoProducer) {
    const gep = app?.overwolf?.packages?.gep || null;
    nativeGameInfoProducer = createNativeGameInfoProducer({
      gep,
      emitHint: emitActiveCharacterHint,
      logger: console
    });
  }

  return nativeGameInfoProducer;
}

function stopNativeGameInfoProducer() {
  nativeGameInfoProducerBinding = null;
  clearNativeActiveCharacterHint();

  if (!nativeGameInfoProducer || typeof nativeGameInfoProducer.stop !== 'function') {
    return Promise.resolve(false);
  }

  try {
    return Promise.resolve(nativeGameInfoProducer.stop()).catch((error) => {
      console.warn('[NativeGameInfoProducer] Failed to stop producer', error);
      return false;
    });
  } catch (error) {
    console.warn('[NativeGameInfoProducer] Failed to stop producer', error);
    return Promise.resolve(false);
  }
}

function syncNativeGameInfoProducer(input = {}) {
  const detectedVersion = input.detectedVersion;
  const gameId = input.gameId || getNativeGameInfoGameId(detectedVersion);

  if (!detectedVersion || !gameId) {
    return stopNativeGameInfoProducer();
  }

  if (
    nativeGameInfoProducerBinding
    && nativeGameInfoProducerBinding.detectedVersion === detectedVersion
    && nativeGameInfoProducerBinding.gameId === gameId
  ) {
    return Promise.resolve(true);
  }

  const producer = getNativeGameInfoProducer();
  if (!producer || typeof producer.start !== 'function') {
    return Promise.resolve(false);
  }

  try {
    const startPromise = producer.start({
      poeVersion: detectedVersion,
      gameId
    });

    return Promise.resolve(startPromise).then((started) => {
      if (started) {
        nativeGameInfoProducerBinding = {
          detectedVersion,
          gameId
        };
      } else {
        nativeGameInfoProducerBinding = null;
      }

      return started;
    }).catch((error) => {
      nativeGameInfoProducerBinding = null;
      console.warn('[NativeGameInfoProducer] Failed to start producer', error);
      return false;
    });
  } catch (error) {
    nativeGameInfoProducerBinding = null;
    console.warn('[NativeGameInfoProducer] Failed to start producer', error);
    return Promise.resolve(false);
  }
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

  // Always persist the queued state so loot is preserved even for non-local sessions.
  setQueuedCurrentSession(currentSession);
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
        if (!sessionIdMap.has(action.sessionId)) {
          console.log('[flushPendingLootActions] Skipping loot item — unresolved local session ID:', action.sessionId);
        }
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
  let sessionResult = { processed: 0, remaining: 0, sessionIdMap: new Map() };
  try {
    sessionResult = await flushPendingSessionActions(forceBlocked);
  } catch (error) {
    console.warn('[flushPendingActions] Session flush error (continuing with loot flush):', error?.message || error);
  }

  // Always run loot flush even if session flush partially failed.
  // Loot flush will skip items with unresolved local session IDs gracefully.
  let lootResult = { processed: 0, remaining: 0 };
  try {
    lootResult = await flushPendingLootActions(sessionResult.sessionIdMap, forceBlocked);
  } catch (error) {
    console.warn('[flushPendingActions] Loot flush error:', error?.message || error);
  }

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

function buildSafeSettingsSnapshot() {
  const settings = { ...store.store };
  delete settings.authToken;
  delete settings.auditTrail;
  delete settings.poeOAuthTokens;
  delete settings.poeOAuthTokensEncrypted;
  delete settings.pendingLootActions;
  delete settings.pendingSessionActions;
  delete settings.queuedCurrentSession;

  return {
    language: settings.language || 'en',
    notifications: Boolean(settings.notifications),
    soundNotifications: Boolean(settings.soundNotifications),
    autoStartSession: Boolean(settings.autoStartSession),
    poeVersion: settings.poeVersion || 'poe1',
    lastDetectedPoeVersion: normalizePoeVersion(settings.lastDetectedPoeVersion),
    defaultLeaguePoe1: typeof settings.defaultLeaguePoe1 === 'string' ? settings.defaultLeaguePoe1 : null,
    defaultLeaguePoe2: typeof settings.defaultLeaguePoe2 === 'string' ? settings.defaultLeaguePoe2 : null,
    hasCustomApiUrl: Boolean(settings.apiUrl),
    hasPoePath: Boolean(settings.poePath),
    scanHotkey: settings.scanHotkey || 'F9'
  };
}

function buildSensitiveSettingsSnapshot() {
  const settings = { ...store.store };
  delete settings.authToken;
  delete settings.authTokenEncrypted;
  delete settings.auditTrail;
  delete settings.poeOAuthTokens;
  delete settings.poeOAuthTokensEncrypted;
  delete settings.pendingLootActions;
  delete settings.pendingSessionActions;
  delete settings.queuedCurrentSession;
  return settings;
}

async function buildDiagnosticsPayload(mode = 'safe') {
  const exportMode = mode === 'sensitive' ? 'sensitive' : 'safe';

  const apiSnapshot = {
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

  const basePayload = {
    generatedAt: new Date().toISOString(),
    exportMode,
    appVersion: app.getVersion(),
    platform: process.platform,
    release: os.release(),
    pendingSync: {
      snapshot: getPendingSyncSnapshot(),
      hasQueuedCurrentSession: Boolean(getQueuedCurrentSession())
    },
    currentSession: currentSession ? {
      status: currentSession.status,
      localOnly: Boolean(currentSession.localOnly),
      queued: Boolean(currentSession.queued)
    } : null,
    api: {
      authenticated: apiSnapshot.authenticated,
      status: apiSnapshot.status,
      latencyMs: apiSnapshot.latencyMs
    },
    settings: buildSafeSettingsSnapshot()
  };

  if (exportMode === 'safe') {
    return basePayload;
  }

  return {
    ...basePayload,
    currentUserId: getCurrentUserId(),
    pendingSync: {
      ...basePayload.pendingSync,
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
    api: {
      ...apiSnapshot,
      baseURL: apiClient?.baseURL || store.get('apiUrl')
    },
    auditTrail: getAuditTrail(),
    settings: buildSensitiveSettingsSnapshot()
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

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderBrowserCallbackPage(title, message) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
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
        <h1>${safeTitle}</h1>
        <p>${safeMessage}</p>
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
    // Reset hint so it can be shown again on next minimize.
    trayHintShown = false;
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
      label: `${t('trayAddLoot')} (${getValidatedHotkeySettings().scanHotkey})`,
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
  const { activeVersion, league } = resolveLeagueContext(overrides);

  return {
    poeVersion: activeVersion,
    league
  };
}

function resolveLeagueContext(overrides = {}) {
  const overrideVersion = overrides.activeVersion || overrides.poeVersion;
  const detectedVersion = gameDetector ? gameDetector.getDetectedGame() : null;
  const lastDetectedVersion = normalizePoeVersion(store.get('lastDetectedPoeVersion'));
  const storedVersion = normalizePoeVersion(store.get('poeVersion'));
  const activeVersion = normalizePoeVersion(overrideVersion)
    || normalizePoeVersion(detectedVersion)
    || lastDetectedVersion
    || storedVersion
    || 'poe1';
  const leagueKey = getLeagueKeyForVersion(activeVersion);
  const storedLeague = store.get(leagueKey);
  const legacyLeague = getLegacyDefaultLeagueForVersion(activeVersion);
  const league = String(overrides.league ?? storedLeague ?? legacyLeague ?? 'Standard').trim() || 'Standard';

  return {
    activeVersion,
    leagueKey,
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
  if (!poeAuthServer || !poeAuthServer.listening) {
    poeAuthServer = null;
    return;
  }

  await new Promise((resolve) => {
    poeAuthServer.close(() => resolve());
  });
  poeAuthServer = null;
}

const POE_AUTH_FALLBACK_PORTS = [34128, 34129, 34130, 34131];

async function openPoeLoginFlow(startResponse, { redirectUrl, redirectUri, expectedState, codeVerifier }) {
  await closePoeAuthServer();

  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(async () => {
      await closePoeAuthServer();
      reject(new Error('Path of Exile sign-in timed out'));
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
        res.end(renderBrowserCallbackPage('Sign-in Failed', 'Return to Juice Journal and try again.'));
        await closePoeAuthServer();
        reject(new Error(error));
        return;
      }

      if (!code || state !== expectedState) {
        clearTimeout(timeout);
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(renderBrowserCallbackPage('Sign-in Failed', 'The browser callback could not be validated. Return to the app and try again.'));
        await closePoeAuthServer();
        reject(new Error('Invalid callback state'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(renderBrowserCallbackPage('Signed In', 'You can close this window and return to Juice Journal.'));

      try {
        const result = await apiClient.completePoeLogin({
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
        reject(new Error(requestError.message || 'Failed to complete Path of Exile sign-in'));
      }
    });

    poeAuthServer.on('error', async (error) => {
      clearTimeout(timeout);
      await closePoeAuthServer();
      reject(error);
    });

    const tryListen = (server, port) => {
      return new Promise((resolveListen, rejectListen) => {
        const handleError = (err) => {
          server.removeListener('listening', handleListening);
          rejectListen(err);
        };
        const handleListening = () => {
          server.removeListener('error', handleError);
          resolveListen();
        };
        server.once('error', handleError);
        server.once('listening', handleListening);
        server.listen(port, redirectUrl.hostname);
      });
    };

    const primaryPort = Number(redirectUrl.port);
    const tryListenWithFallbacks = async () => {
      try {
        await tryListen(poeAuthServer, primaryPort);
      } catch (err) {
        if (err.code !== 'EADDRINUSE') throw err;
        for (const fallbackPort of POE_AUTH_FALLBACK_PORTS) {
          try {
            await tryListen(poeAuthServer, fallbackPort);
            return; // Success
          } catch (fallbackErr) {
            if (fallbackErr.code !== 'EADDRINUSE') throw fallbackErr;
          }
        }
        throw err; // Re-throw original EADDRINUSE if all ports failed
      }
    };

    tryListenWithFallbacks()
      .then(async () => {
        try {
          const parsedAuthUrl = new URL(startResponse.authUrl);
          if (parsedAuthUrl.protocol !== 'https:' && parsedAuthUrl.protocol !== 'http:') {
            throw new Error('Invalid auth URL scheme — only https/http allowed');
          }
          await openAuthUrlInBrowser(startResponse.authUrl);
        } catch (error) {
          clearTimeout(timeout);
          await closePoeAuthServer();
          reject(error);
        }
      })
      .catch(async (error) => {
        clearTimeout(timeout);
        await closePoeAuthServer();
        reject(error);
      });
  });
}

function openAuthUrlInBrowser(authUrl) {
  return shell.openExternal(authUrl).catch((error) => {
    if (process.platform !== 'win32') {
      throw error;
    }

    return new Promise((resolve, reject) => {
      execFile('cmd', ['/c', 'start', '', authUrl], (fallbackError) => {
        if (fallbackError) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });
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
        res.end(renderBrowserCallbackPage('Linking Failed', 'Return to Juice Journal and try the connection again.'));
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
      res.end(renderBrowserCallbackPage('Account Linked', 'You can close this window and continue in Juice Journal.'));

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

    const tryListen = (server, port) => {
      return new Promise((resolveListen, rejectListen) => {
        const handleError = (err) => {
          server.removeListener('listening', handleListening);
          rejectListen(err);
        };
        const handleListening = () => {
          server.removeListener('error', handleError);
          resolveListen();
        };
        server.once('error', handleError);
        server.once('listening', handleListening);
        server.listen(port, redirectUrl.hostname);
      });
    };

    const primaryPort = Number(redirectUrl.port);
    const tryListenWithFallbacks = async () => {
      try {
        await tryListen(poeAuthServer, primaryPort);
      } catch (err) {
        if (err.code !== 'EADDRINUSE') throw err;
        for (const fallbackPort of POE_AUTH_FALLBACK_PORTS) {
          try {
            await tryListen(poeAuthServer, fallbackPort);
            return;
          } catch (fallbackErr) {
            if (fallbackErr.code !== 'EADDRINUSE') throw fallbackErr;
          }
        }
        throw err;
      }
    };

    tryListenWithFallbacks()
      .then(async () => {
        try {
          const parsedAuthUrl = new URL(startResponse.authUrl);
          if (parsedAuthUrl.protocol !== 'https:' && parsedAuthUrl.protocol !== 'http:') {
            throw new Error('Invalid auth URL scheme — only https/http allowed');
          }
          await openAuthUrlInBrowser(startResponse.authUrl);
        } catch (error) {
          clearTimeout(timeout);
          await closePoeAuthServer();
          reject(error);
        }
      })
      .catch(async (error) => {
        clearTimeout(timeout);
        await closePoeAuthServer();
        reject(error);
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
    width: 1440,
    height: 960,
    minWidth: 1180,
    minHeight: 820,
    show: false,
    frame: false,
    backgroundColor: '#0d0e12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    icon: APP_ICON_PATH,
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

function getOverlayWindowBounds() {
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea || display.bounds;
  const width = 360;
  const height = 112;

  return {
    width,
    height,
    x: Math.round(workArea.x + workArea.width - width - 24),
    y: Math.round(workArea.y + 24)
  };
}

function createOverlayWindow() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  overlayWindow = new BrowserWindow({
    ...getOverlayWindowBounds(),
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    title: `${APP_NAME} Overlay`
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.loadFile(path.join(__dirname, 'src', 'overlay.html'));
  overlayWindow.webContents.once('did-finish-load', () => {
    updateOverlayWindow();
  });
  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

function extractOverlayCharacterFromUser(user) {
  if (!user || typeof user !== 'object') {
    return null;
  }

  const poePayload = user.poe || {};
  const characters = Array.isArray(user.characters)
    ? user.characters
    : (Array.isArray(user.poeCharacters)
      ? user.poeCharacters
      : (Array.isArray(poePayload.characters) ? poePayload.characters : []));
  const selectedCharacterId = user.selectedCharacterId
    || user.selectedCharacter?.id
    || poePayload.selectedCharacterId
    || poePayload.selectedCharacter?.id
    || null;
  const selectedCharacter = user.selectedCharacter
    || poePayload.selectedCharacter
    || characters.find((character) => character?.id && character.id === selectedCharacterId)
    || characters[0]
    || null;

  if (selectedCharacter) {
    return selectedCharacter;
  }

  const fallbackName = user.accountName
    || user.poeAccountName
    || poePayload.accountName
    || poePayload.account?.name
    || user.username
    || null;
  const fallbackLeague = user.league
    || user.defaultLeague
    || store.get(getLeagueKeyForVersion(normalizePoeVersion(store.get('poeVersion')) || 'poe1'))
    || null;

  return fallbackName
    ? { name: fallbackName, league: fallbackLeague }
    : null;
}

function isOverlayEnabled() {
  return store.get('overlayEnabled') === true;
}

function clearOverlayMapResultDismissTimer() {
  if (overlayMapResultDismissTimer) {
    clearTimeout(overlayMapResultDismissTimer);
    overlayMapResultDismissTimer = null;
  }
}

function scheduleOverlayMapResultDismiss() {
  clearOverlayMapResultDismissTimer();

  if (!overlayMapResultState?.result || overlayMapResultState?.pinned || !overlayMapResultState?.dismissAt) {
    return;
  }

  const delay = Math.max(0, overlayMapResultState.dismissAt - Date.now());
  overlayMapResultDismissTimer = setTimeout(() => {
    overlayMapResultDismissTimer = null;
    overlayMapResultState = deriveMapResultOverlayState({
      overlayEnabled: isOverlayEnabled(),
      currentOverlayState: overlayMapResultState,
      now: Date.now()
    });

    if (!overlayMapResultState?.visible) {
      overlayMapResultState = null;
    }

    updateOverlayWindow();
  }, delay);
}

function showMapResultOverlay(result, options = {}) {
  overlayMapResultState = deriveMapResultOverlayState({
    overlayEnabled: isOverlayEnabled(),
    completedResult: result,
    currentOverlayState: overlayMapResultState,
    now: options.now ?? Date.now(),
    durationMs: options.durationMs ?? MAP_RESULT_OVERLAY_DURATION_MS
  });

  scheduleOverlayMapResultDismiss();
  return updateOverlayWindow();
}

function toggleMapResultOverlayPin() {
  if (!overlayMapResultState?.result) {
    return updateOverlayWindow();
  }

  overlayMapResultState = {
    ...overlayMapResultState,
    visible: true,
    pinned: !overlayMapResultState.pinned
  };

  if (!overlayMapResultState.pinned && overlayMapResultState.dismissAt && overlayMapResultState.dismissAt <= Date.now()) {
    overlayMapResultState = null;
  }

  scheduleOverlayMapResultDismiss();
  return updateOverlayWindow();
}

function dismissMapResultOverlay() {
  overlayMapResultState = null;
  clearOverlayMapResultDismissTimer();
  return updateOverlayWindow();
}

function buildOverlayState({ character = overlayCharacterState, runtimeSession = overlayRuntimeState } = {}) {
  const mapResultState = deriveMapResultOverlayState({
    overlayEnabled: isOverlayEnabled(),
    currentOverlayState: overlayMapResultState,
    now: Date.now()
  });

  if (mapResultState.visible && mapResultState.result) {
    overlayMapResultState = mapResultState;
    return {
      visibility: 'visible',
      mode: 'map-result',
      mapResult: mapResultState
    };
  }

  if (!mapResultState.visible) {
    overlayMapResultState = null;
  }

  return deriveOverlayState({
    enabled: isOverlayEnabled(),
    character,
    runtime: runtimeSession
  });
}

function ensureOverlayWindowForSettings() {
  if (isOverlayEnabled() && app.isReady()) {
    createOverlayWindow();
  }

  updateOverlayWindow();
}

function applyOverlayWindowVisibility(overlayState) {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return;
  }

  if (overlayState.visibility === 'hidden') {
    if (overlayWindow.isVisible()) {
      overlayWindow.hide();
    }
    return;
  }

  overlayWindow.setBounds(getOverlayWindowBounds());
  if (!overlayWindow.isVisible()) {
    overlayWindow.showInactive();
  }
}

function updateOverlayWindow({ character, runtimeSession } = {}) {
  const options = arguments.length > 0 ? (arguments[0] || {}) : null;

  if (options) {
    if (Object.prototype.hasOwnProperty.call(options, 'character')) {
      overlayCharacterState = character || null;
    }

    if (Object.prototype.hasOwnProperty.call(options, 'runtimeSession')) {
      overlayRuntimeState = runtimeSession || null;
    }
  }

  const overlayState = buildOverlayState();
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return overlayState;
  }

  applyOverlayWindowVisibility(overlayState);

  const serializedState = JSON.stringify(overlayState).replace(/</g, '\\u003c');
  overlayWindow.webContents.executeJavaScript(
    `window.JuiceOverlay && window.JuiceOverlay.renderState(${serializedState});`,
    true
  ).catch(() => { });

  return overlayState;
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
function getValidatedHotkeySettings(overrides = {}) {
  const requestedScanHotkey = Object.prototype.hasOwnProperty.call(overrides, 'scanHotkey')
    ? overrides.scanHotkey
    : store.get('scanHotkey');
  const requestedStashScanHotkey = Object.prototype.hasOwnProperty.call(overrides, 'stashScanHotkey')
    ? overrides.stashScanHotkey
    : store.get('stashScanHotkey');

  try {
    return validateHotkeys({
      scanHotkey: requestedScanHotkey || DEFAULT_SCAN_HOTKEY,
      stashScanHotkey: requestedStashScanHotkey || DEFAULT_STASH_SCAN_HOTKEY
    });
  } catch (error) {
    if (Object.prototype.hasOwnProperty.call(overrides, 'scanHotkey')
      || Object.prototype.hasOwnProperty.call(overrides, 'stashScanHotkey')) {
      throw error;
    }

    return {
      scanHotkey: DEFAULT_SCAN_HOTKEY,
      stashScanHotkey: DEFAULT_STASH_SCAN_HOTKEY
    };
  }
}

function registerHotkeySet({ scanHotkey, stashScanHotkey }) {
  globalShortcut.unregisterAll();

  if (!globalShortcut.register(scanHotkey, () => {
    captureAndScan();
  })) {
    globalShortcut.unregisterAll();
    throw new Error(`Unable to register global shortcut: ${scanHotkey}`);
  }

  if (!globalShortcut.register(stashScanHotkey, () => {
    captureAndScan();
  })) {
    globalShortcut.unregisterAll();
    throw new Error(`Unable to register global shortcut: ${stashScanHotkey}`);
  }

  return {
    scanHotkey,
    stashScanHotkey
  };
}

function registerGlobalShortcuts(overrides = {}) {
  const nextHotkeys = getValidatedHotkeySettings(overrides);
  const hasOverrides = Object.keys(overrides).length > 0;
  const previousHotkeys = hasOverrides ? getValidatedHotkeySettings() : null;

  try {
    return registerHotkeySet(nextHotkeys);
  } catch (error) {
    if (previousHotkeys) {
      try {
        registerHotkeySet(previousHotkeys);
      } catch {
        // Keep the original registration error as the one surfaced to the caller.
      }
    }

    throw error;
  }
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

    const { activeVersion: poeVersion, league } = resolveLeagueContext(input);
    const farmTypeId = normalizeStoredFarmTypeId(input.farmTypeId || input.mapType || getActiveFarmTypeId());

    // Map adi al
    const mapName = input.mapName || await promptMapName();
    if (!mapName) return;

    // Session olustur
    let session;
    try {
      session = await apiClient.startSession({
        mapName,
        mapTier: input.mapTier || null,
        mapType: farmTypeId,
        farmTypeId,
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
        mapType: farmTypeId,
        farmTypeId,
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
          mapType: farmTypeId,
          farmTypeId,
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

async function handleMapEntered(data) {
  if (store.get('autoStartSession') && !currentSession) {
    const session = await startNewSession({
      mapName: data.mapName,
      mapTier: data.mapTier,
      farmTypeId: getActiveFarmTypeId(),
      ...getTrackerContextDefaults()
    });
    showNotification(t('notificationAutoSession'), t('autoSessionBody', { mapName: data.mapName }));
    if (mainWindow) {
      mainWindow.webContents.send('session-started', session);
    }
  }

  publishRuntimeSessionEvent('area_entered', data);
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
  // showMessageBox cannot accept text input; return a default descriptive name.
  // The user can edit it later in the session drawer.
  const defaultName = `${t('unknownMap')} ${new Date().toLocaleString()}`;
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: [t('promptStart'), t('promptCancel')],
    defaultId: 0,
    title: t('promptTitle'),
    message: t('promptMessage'),
    detail: `${t('promptDetail')}\n\n${defaultName}`
  });

  if (response === 0) {
    return defaultName;
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
    icon: APP_ICON_PATH
  });

  notification.show();
}

/**
 * Log parser olaylarini dinle
 */
function normalizeRuntimeLogEvent(type, data = {}) {
  const areaName = data.areaName || data.mapName || data.location || 'Unknown Area';
  const rawTimestamp = data.at ?? data.timestamp ?? 0;
  const parsedTimestamp = rawTimestamp instanceof Date ? rawTimestamp : new Date(rawTimestamp);
  const at = Number.isNaN(parsedTimestamp.getTime())
    ? new Date(0).toISOString()
    : parsedTimestamp.toISOString();

  return {
    type,
    areaName,
    at,
    mapTier: data.mapTier ?? null,
    source: 'logParser',
    exitLocation: data.location || null
  };
}

function getRuntimeSessionSnapshot(options = {}) {
  return cloneRuntimeSessionState(runtimeSessionState, {
    now: options.now ?? new Date()
  });
}

function clearRuntimeSession(reason, options = {}) {
  clearRuntimeSessionState(runtimeSessionState, {
    reason,
    at: options.at ?? options.now ?? new Date()
  });
  const runtimeSession = getRuntimeSessionSnapshot({
    now: options.at ?? options.now
  });
  if (typeof updateOverlayWindow === 'function') {
    updateOverlayWindow({ runtimeSession });
  }
  return runtimeSession;
}

function publishRuntimeSessionEvent(type, data = {}) {
  const runtimeEvent = normalizeRuntimeLogEvent(type, data);
  applyRuntimeEvent(runtimeSessionState, runtimeEvent);

  const payload = {
    ...data,
    runtimeSession: getRuntimeSessionSnapshot({ now: runtimeEvent.at })
  };
  const channel = type === 'area_exited' ? 'map-exited' : 'map-entered';

  if (mainWindow) {
    mainWindow.webContents.send(channel, payload);
  }

  if (typeof updateOverlayWindow === 'function') {
    updateOverlayWindow({ runtimeSession: payload.runtimeSession });
  }

  return payload;
}

function setupLogParser() {
  let poePath = store.get('poePath');

  // Varsayilan yol
  const defaultPath = DEFAULT_POE_LOG_PATH;

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
    handleMapEntered(data).catch(() => {
        showNotification(t('notificationError'), t('sessionStartFailed'));
    });
  });

  logParser.on('mapExited', (data) => {
    if (currentSession) {
      endCurrentSession();
    }

    publishRuntimeSessionEvent('area_exited', data);
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
    handleGameClosed(version);
  });

  gameDetector.start();
}

function handleGameClosed(version, at = new Date()) {
  const gameLabel = version === 'poe2' ? 'Path of Exile 2' : 'Path of Exile';
  const runtimeSession = clearRuntimeSession('game_closed', { at });
  const payload = {
    version,
    runtimeSession
  };

  stopNativeGameInfoProducer();

  console.log(`[GameDetector] ${gameLabel} closed`);
  if (mainWindow) {
    mainWindow.webContents.send('game-closed', payload);
  }

  return payload;
}

/**
 * Apply detected game version — update store, price service, log parser, and notify renderer
 */
function applyGameVersion(version) {
  const previousDetectedVersion = store.get('lastDetectedPoeVersion');
  const selectedSettingsVersion = store.get('poeVersion');
  store.set('lastDetectedPoeVersion', version);
  const storedPoePath = store.get('poePath');
  const versionChanged = version !== previousDetectedVersion;
  const runtimePriceVersion = priceService?.poeVersion === 'poe2'
    ? 'poe2'
    : (priceService?.poeVersion === 'poe1' ? 'poe1' : null);
  const shouldRetargetPriceService = Boolean(priceService && runtimePriceVersion !== version);
  let detectedLogPath = null;

  // Always re-check the runtime Client.txt path so same-version launches can refresh tracking.
  detectedLogPath = GameDetector.findLogPath(version);

  if (shouldRetargetPriceService) {
    // Runtime services should follow the detected game without changing the user's saved selection.
    priceService.setPoeVersion(version);
    priceService.clearCache();
  }

  const shouldUpdatePoePath = Boolean(detectedLogPath && detectedLogPath !== storedPoePath);
  const storedPoePathUsable = Boolean(storedPoePath && fs.existsSync(storedPoePath));
  const runtimeLogPath = detectedLogPath || (storedPoePathUsable ? storedPoePath : null);
  const logParserNeedsResync = !logParser || !logParser.isRunning;
  const shouldRestartLogParser = Boolean(
    runtimeLogPath && (versionChanged || shouldUpdatePoePath || logParserNeedsResync)
  );
  let runtimeSession = null;

  if (shouldUpdatePoePath) {
    store.set('poePath', detectedLogPath);
  }

  if (shouldRestartLogParser) {
    runtimeSession = clearRuntimeSession('log_parser_restarted');
    if (logParser) {
      logParser.stop();
    }
    setupLogParser();
  }

  syncNativeGameInfoProducer({
    detectedVersion: version
  });

  // Notify renderer to update UI (icons, labels, etc.)
  if (mainWindow) {
    mainWindow.webContents.send('game-version-changed', {
      version,
      settingsVersion: selectedSettingsVersion,
      lastDetectedVersion: version,
      logPath: detectedLogPath || store.get('poePath'),
      ...(runtimeSession ? { runtimeSession } : {})
    });
  }
}

const SETTINGS_ALLOWLIST = new Set([
  'apiUrl', 'poePath', 'autoStartSession', 'notifications',
  'soundNotifications', 'language', 'poeVersion', 'defaultLeaguePoe1', 'defaultLeaguePoe2',
  'scanHotkey', 'stashScanHotkey', 'overlayEnabled', 'lastKnownAccountState', 'theme'
]);

function applyDesktopSettings(settings = {}) {
  const hasApiUrl = Object.prototype.hasOwnProperty.call(settings, 'apiUrl');
  const normalizedApiUrl = hasApiUrl && typeof settings.apiUrl === 'string'
    ? settings.apiUrl.trim()
    : settings.apiUrl;

  if (hasApiUrl && !normalizedApiUrl) {
    throw new Error('Invalid API URL');
  }

  if (hasApiUrl && !isValidApiUrl(normalizedApiUrl)) {
    throw new Error('Invalid API URL');
  }

  const hasScanHotkey = Object.prototype.hasOwnProperty.call(settings, 'scanHotkey');
  const hasStashScanHotkey = Object.prototype.hasOwnProperty.call(settings, 'stashScanHotkey');
  const shouldRefreshHotkeys = hasScanHotkey || hasStashScanHotkey;
  const hotkeyOverrides = {};
  if (hasScanHotkey) {
    hotkeyOverrides.scanHotkey = settings.scanHotkey;
  }
  if (hasStashScanHotkey) {
    hotkeyOverrides.stashScanHotkey = settings.stashScanHotkey;
  }
  const normalizedHotkeys = shouldRefreshHotkeys
    ? getValidatedHotkeySettings(hotkeyOverrides)
    : null;

  if (shouldRefreshHotkeys) {
    registerGlobalShortcuts(normalizedHotkeys);
  }

  for (const [key, value] of Object.entries(settings)) {
    if (key === 'defaultLeague') {
      const { leagueKey } = resolveLeagueContext({
        activeVersion: settings.poeVersion,
        league: value
      });
      store.set(leagueKey, value);
      continue;
    }

    if (!SETTINGS_ALLOWLIST.has(key)) {
      continue;
    }

    if (key === 'scanHotkey' || key === 'stashScanHotkey') {
      store.set(key, normalizedHotkeys[key]);
      continue;
    }

    if (key === 'apiUrl') {
      store.set(key, normalizedApiUrl);
      continue;
    }

    store.set(key, value);
  }

  if (hasApiUrl && apiClient) {
    apiClient.setBaseURL(normalizedApiUrl);
  }

  if (shouldRefreshHotkeys) {
    refreshTrayMenu();
  }

  if (Object.prototype.hasOwnProperty.call(settings, 'overlayEnabled')) {
    ensureOverlayWindowForSettings();
  }

  return true;
}

function handleLogout() {
  appendAuditTrail('auditLogout');
  stopNativeGameInfoProducer();
  store.set('authToken', null);
  store.set('authTokenEncrypted', null);
  store.set('currentUserId', null);
  apiClient.setToken(null);
  currentSession = null;
  if (stashAnalyzer) {
    stashAnalyzer.clearAll();
  }
  overlayMapResultState = null;
  clearOverlayMapResultDismissTimer();
  updateOverlayWindow({ character: null });
  return true;
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
    delete allSettings.authTokenEncrypted;
    delete allSettings.poeOAuthTokens;
    delete allSettings.poeOAuthTokensEncrypted;
    delete allSettings.currentUserId;
    allSettings.scanHotkey = allSettings.scanHotkey || DEFAULT_SCAN_HOTKEY;
    allSettings.stashScanHotkey = allSettings.stashScanHotkey || DEFAULT_STASH_SCAN_HOTKEY;
    return allSettings;
  });

  ipcMain.handle('set-settings', (event, settings) => {
    return applyDesktopSettings(settings);
  });

  // Auth token kontrolu (token'i aciga cikarmadan)
  ipcMain.handle('has-auth-token', () => {
    return !!getDecryptedAuthToken();
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

  ipcMain.handle('get-active-farm-type', () => getActiveFarmTypeId());

  ipcMain.handle('set-active-farm-type', (event, farmTypeId) => {
    return setActiveFarmTypeId(farmTypeId);
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

  ipcMain.handle('get-sync-status', () => {
    if (!getDecryptedAuthToken() || !getCurrentUserId()) {
      return {
        pendingSession: 0,
        pendingLoot: 0,
        total: 0,
        hasQueuedSession: false,
        entries: []
      };
    }
    return {
      ...getPendingSyncSnapshot(),
      entries: getPendingSyncEntriesForView()
    };
  });

  ipcMain.handle('get-audit-trail', () => {
    if (!getDecryptedAuthToken() || !getCurrentUserId()) {
      return { entries: [] };
    }
    return {
      entries: getAuditTrail().slice().reverse().slice(0, 20)
    };
  });

  ipcMain.handle('retry-pending-loot-actions', async () => {
    assertDesktopUserAuthenticated();
    return await flushPendingActions(true);
  });

  ipcMain.handle('export-diagnostics', async (event, mode = 'safe') => {
    assertDesktopUserAuthenticated();
    const exportMode = mode === 'sensitive' ? 'sensitive' : 'safe';
    const defaultPath = path.join(app.getPath('documents'), `juice-journal-diagnostics-${exportMode}-${Date.now()}.json`);
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

    const payload = await buildDiagnosticsPayload(exportMode);
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    appendAuditTrail('auditDiagnosticsExported', { mode: exportMode });
    return {
      canceled: false,
      mode: exportMode,
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
        const encrypted = encryptAuthToken(token);
        if (encrypted) {
          store.set('authTokenEncrypted', encrypted);
        } else {
          store.set('authToken', token);
        }
        apiClient.setToken(token);
        store.set('currentUserId', result?.data?.user?.id || null);
        updateOverlayWindow({ character: extractOverlayCharacterFromUser(result?.data?.user) });
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
        const encrypted = encryptAuthToken(token);
        if (encrypted) {
          store.set('authTokenEncrypted', encrypted);
        } else {
          store.set('authToken', token);
        }
        apiClient.setToken(token);
        store.set('currentUserId', result?.user?.id || null);
        updateOverlayWindow({ character: extractOverlayCharacterFromUser(result?.user) });
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
      updateOverlayWindow({ character: extractOverlayCharacterFromUser(me?.user) });
      await flushPendingActions();
      return me;
    } catch (error) {
      throw toRendererError(error, 'Kullanici bilgileri alinamadi');
    }
  });

  ipcMain.handle('start-poe-login', async () => {
    try {
      const redirectUri = process.env.POE_REDIRECT_URI || 'http://127.0.0.1:34127/oauth/poe/callback';
      const redirectUrl = new URL(redirectUri);
      const state = crypto.randomUUID();
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

      const startResponse = await apiClient.startPoeLogin({
        redirectUri,
        codeChallenge,
        codeChallengeMethod: 'S256',
        state,
      });

      // Mock mode short-circuits the browser handshake.
      if (startResponse?.mode === 'mock') {
        const result = await apiClient.completePoeLogin({
          code: startResponse.mockCode,
          codeVerifier,
          redirectUri,
          state,
        });
        if (result?.success && result?.data?.token) {
          const encrypted = encryptAuthToken(result.data.token);
          if (encrypted) {
            store.set('authTokenEncrypted', encrypted);
          } else {
            store.set('authToken', result.data.token);
          }
          apiClient.setToken(result.data.token);
          store.set('currentUserId', result.data.user?.id || null);
          updateOverlayWindow({ character: extractOverlayCharacterFromUser(result.data.user) });
          await flushPendingActions();
          appendAuditTrail('auditLogin');
        }
        return result;
      }

      if (!startResponse?.authUrl) {
        throw new Error('Path of Exile authorization URL could not be created');
      }

      const result = await openPoeLoginFlow(startResponse, {
        redirectUrl,
        redirectUri,
        expectedState: state,
        codeVerifier,
      });

      if (result?.success && result?.data?.token) {
        const encrypted = encryptAuthToken(result.data.token);
        if (encrypted) {
          store.set('authTokenEncrypted', encrypted);
        } else {
          store.set('authToken', result.data.token);
        }
        apiClient.setToken(result.data.token);
        store.set('currentUserId', result.data.user?.id || null);
        updateOverlayWindow({ character: extractOverlayCharacterFromUser(result.data.user) });
        await flushPendingActions();
        appendAuditTrail('auditLogin');
      }

      return result;
    } catch (error) {
      return {
        success: false,
        data: null,
        error: normalizeErrorMessage(error, 'Path of Exile sign-in failed')
      };
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
      const result = await apiClient.disconnectPoeAccount();
      // Always clear local PoE tokens regardless of backend response.
      store.delete('poeOAuthTokensEncrypted');
      store.delete('poeOAuthTokens');
      if (poeApiClient) {
        poeApiClient.clearTokens();
      }
      return result;
    } catch (error) {
      // Clear local tokens even if the backend call fails.
      store.delete('poeOAuthTokensEncrypted');
      store.delete('poeOAuthTokens');
      if (poeApiClient) {
        poeApiClient.clearTokens();
      }
      throw toRendererError(error, 'Path of Exile baglantisi kaldirilamadi');
    }
  });

  // ==================== STASH & PRICES ====================

  // Sync prices from poe.ninja
  ipcMain.handle('sync-prices', async (event, options = {}) => {
    try {
      assertDesktopUserAuthenticated();
      const { activeVersion: poeVersion, league } = resolveLeagueContext(options);
      priceService.setPoeVersion(poeVersion);
      const result = await priceService.syncPrices(league, {
        ...options,
        poeVersion,
        league
      });
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
    if (!getDecryptedAuthToken() || !getCurrentUserId()) {
      return {
        itemCount: 0,
        lastSync: null,
        cacheEntries: 0,
        poeVersion: store.get('poeVersion') || 'poe1',
        authenticated: false
      };
    }
    return priceService.getStatus();
  });

  // List stash tabs from PoE API
  ipcMain.handle('list-stash-tabs', async (event, league) => {
    try {
      assertDesktopUserAuthenticated();
      if (!poeApiClient.isAuthenticated()) {
        throw new Error(t('poeNotLinked'));
      }
      const { league: leagueName } = resolveLeagueContext({ league });
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
      const { league } = resolveLeagueContext(options);
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
          timestamp: snapshot.timestamp,
          league: snapshot.league,
          itemCount: snapshot.items.length,
          totalChaos: snapshot.totalChaos,
          totalDivine: snapshot.totalDivine
        });
      }

      return {
        snapshotId,
        timestamp: snapshot.timestamp,
        league: snapshot.league,
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

  ipcMain.handle('show-map-result-overlay', async (event, result, options = {}) => {
    assertDesktopUserAuthenticated();
    return showMapResultOverlay(result, options || {});
  });

  ipcMain.handle('show-runtime-overlay-preview', async (event, runtimeSession) => {
    assertDesktopUserAuthenticated();
    return updateOverlayWindow({ runtimeSession: runtimeSession || null });
  });

  ipcMain.handle('toggle-map-result-overlay-pin', async () => {
    assertDesktopUserAuthenticated();
    return toggleMapResultOverlayPin();
  });

  ipcMain.handle('dismiss-map-result-overlay', async () => {
    assertDesktopUserAuthenticated();
    return dismissMapResultOverlay();
  });

  ipcMain.handle('get-overlay-cursor-position', async () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      return null;
    }

    const cursorPoint = screen.getCursorScreenPoint();
    const bounds = overlayWindow.getBounds();

    return {
      clientX: cursorPoint.x - bounds.x,
      clientY: cursorPoint.y - bounds.y
    };
  });

  ipcMain.handle('set-overlay-pointer-passthrough', async (event, ignore = true) => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setIgnoreMouseEvents(ignore !== false, { forward: true });
    }
    return true;
  });

  ipcMain.handle('get-last-active-character-hint', async () => {
    return lastActiveCharacterHint;
  });

  ipcMain.handle('save-map-result', async (event, result) => {
    assertDesktopUserAuthenticated();
    return saveMapResultHistory(result);
  });

  ipcMain.handle('get-map-results', async () => {
    assertDesktopUserAuthenticated();
    return getStoredMapResults();
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
      version: normalizePoeVersion(gameDetector ? gameDetector.getDetectedGame() : null),
      lastDetectedVersion: normalizePoeVersion(store.get('lastDetectedPoeVersion')),
      settingsVersion: normalizePoeVersion(store.get('poeVersion'))
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
  ipcMain.handle('logout', handleLogout);
}

/**
 * Uygulama hazir
 */
app.whenReady().then(() => {
  app.setAppUserModelId(APP_ID);
  app.setName(APP_NAME);

  // API client'i baslat
  const resolvedToken = getDecryptedAuthToken();
  apiClient = new APIClient(store.get('apiUrl'), resolvedToken);
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
  ensureOverlayWindowForSettings();

  createTray();
  registerGlobalShortcuts();
  setupLogParser();
  setupGameDetector();
  getCurrentSessionFromBackend().catch(() => { });
  flushPendingActions().catch(() => { });
  pendingLootFlushInterval = setInterval(async () => {
    const result = await flushPendingActions().catch(() => null);
    if (result && (result.sessions?.remaining || 0) === 0 && (result.loot?.remaining || 0) === 0) {
      clearInterval(pendingLootFlushInterval);
      pendingLootFlushInterval = null;
    }
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

function handleAppWillQuit() {
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

  stopNativeGameInfoProducer();

  if (ocrScanner) {
    ocrScanner.terminate().catch(() => { });
  }

  if (tray) {
    tray.destroy();
    tray = null;
  }

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy();
    overlayWindow = null;
  }

  if (pendingLootFlushInterval) {
    clearInterval(pendingLootFlushInterval);
    pendingLootFlushInterval = null;
  }
}

app.on('will-quit', handleAppWillQuit);
