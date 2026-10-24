/**
 * Juice Journal - Desktop App
 * Electron main process
 *
 * Features:
 * - System tray integration
 * - Global hotkey support (F9)
 * - PoE Client.txt log monitoring
 * - OCR-based stash scanning
 */

const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, screen, shell, nativeImage, safeStorage } = require('electron');
const { autoUpdater } = require('electron-updater');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { execFile } = require('child_process');
const Store = require('electron-store');

// Module imports
const LogParser = require('./src/modules/logParser');
const OCRScanner = require('./src/modules/ocrScanner');
const APIClient = require('./src/modules/apiClient');
const PoeApiClient = require('./src/modules/poeApiClient');
const PriceService = require('./src/modules/priceService');
const { IconCache } = require('./src/modules/iconCache');
const StashAnalyzer = require('./src/modules/stashAnalyzer');
const GameDetector = require('./src/modules/gameDetector');
const win32Probe = require('./src/modules/win32Probe');
const {
  createRuntimeSessionState,
  applyRuntimeEvent,
  clearRuntimeSessionState,
  cloneRuntimeSessionState
} = require('./src/modules/runtimeSessionModel');
const { appendMapResult, normalizeMapResultForLedger } = require('./src/modules/mapResultStoreModel');
const localJournal = require('./src/modules/localJournalModel');
const { deriveMapResultOverlayState } = require('./src/modules/mapResultOverlayModel');
const { buildFarmPublishPayload } = require('./src/modules/farmPublishPayloadModel');
const { deriveOverlayState } = require('./src/modules/overlayStateModel');
const { listFarmTypes } = require('./src/modules/farmTypeModel');
const {
  DEFAULT_SCAN_HOTKEY,
  DEFAULT_STASH_SCAN_HOTKEY,
  shouldEnableScanHotkeys,
  validateHotkeys
} = require('./src/modules/hotkeyModel');
const {
  getAppUpdateSupportState,
  createAppUpdateState,
  applyAppUpdatePatch
} = require('./src/modules/appUpdateModel');
const DEFAULT_POE_LOG_PATH = GameDetector.DEFAULT_POE_LOG_PATH;

const APP_NAME = 'Juice Journal';
const APP_ID = 'JuiceJournal.Desktop';
const DEFAULT_STRATEGY_PRESETS = ['Strongbox', 'Legion', 'Ritual', 'Expedition', 'Harvest', 'Boss Rush'];
const MAP_RESULT_OVERLAY_DURATION_MS = 10_000;
// An OCR scan waits this long for poe.ninja prices; loot without a price counts as 0.
const SESSION_PRICES_WAIT_MS = 5_000;
const SESSION_PRICES_RETRY_MS = 5 * 60_000;
const CHARACTER_PROMPT_OVERLAY_DURATION_MS = 8_000;
const OVERLAY_CLICKABLE_MODES = new Set(['start-map-prompt', 'map-result', 'character-prompt']);
const MAX_AUDIT_TRAIL_ENTRIES = 200;
const WINDOWS_APP_ICON_PATH = path.join(__dirname, 'src', 'assets', 'icon.ico');
const APP_ICON_PATH = process.platform === 'win32'
  ? WINDOWS_APP_ICON_PATH
  : path.join(__dirname, 'src', 'assets', 'icon.png');
const TRUSTED_RENDERER_FILES = Object.freeze({
  main: 'index.html',
  overlay: 'overlay.html'
});
const IPC_RENDERER_SCOPES = Object.freeze({
  'toggle-map-result-overlay-pin': ['main', 'overlay'],
  'dismiss-map-result-overlay': ['main', 'overlay'],
  'get-overlay-cursor-position': ['main', 'overlay'],
  'confirm-start-map-prompt-overlay': ['overlay'],
  'cancel-start-map-prompt-overlay': ['overlay'],
  'choose-character-prompt-overlay': ['overlay'],
  'get-cached-icon': ['overlay']
});
let validatedIpcHandleInstalled = false;

function applyWindowsAppIdentity() {
  if (process.platform === 'win32') {
    app.setAppUserModelId(APP_ID);
  }

  app.setName(APP_NAME);
}

applyWindowsAppIdentity();

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
    gameSwitched: '{from} → {to} gecis yapildi',
    poeNoAccountId: 'Path of Exile hesap kimligini gondermedi.',
    poeDifferentAccount: 'Bu farkli bir Path of Exile hesabi. Hesap degistirmek icin cikis yap.'
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
    gameSwitched: 'Switched {from} → {to}',
    poeNoAccountId: 'Path of Exile did not return an account id.',
    poeDifferentAccount: 'That is a different Path of Exile account. Sign out to switch accounts.'
  }
};

// Store configuration
const store = new Store({
  defaults: {
    apiUrl: 'http://localhost:3001',
    onlineEnabled: false,
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
    localProfiles: {},
    activeProfileId: null,
    activeFarmTypeId: null,
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

// The character cache used to be one entry for the whole machine. It moves to the profile of the account it was
// saved for; without one it is dropped and fills again at the next character fetch.
function migrateSharedAccountStateCache() {
  const sharedCache = store.get('lastKnownAccountState');
  if (sharedCache === undefined) {
    return;
  }

  const accountName = sharedCache?.accountName;
  const owner = accountName
    ? Object.values(store.get('localProfiles') || {}).find((profile) => profile.accountName === accountName)
    : null;
  const ownerKey = owner ? getAccountStateStoreKey(owner.id) : null;
  if (ownerKey && store.get(ownerKey) === undefined) {
    store.set(ownerKey, sharedCache);
  }
  store.delete('lastKnownAccountState');
}

migrateSharedAccountStateCache();

// Older versions queued sessions and loot for the server while it was unreachable. Sessions and loot live in the
// local journal now, so whatever such a version left in the queue is removed.
function removeLegacySyncQueue() {
  ['pendingSessionActions', 'pendingLootActions', 'queuedCurrentSession']
    .filter((key) => store.get(key) !== undefined)
    .forEach((key) => store.delete(key));
}

removeLegacySyncQueue();

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

// Global state
let mainWindow = null;
let tray = null;
let logParser = null;
let ocrScanner = null;
let apiClient = null;
let poeApiClient = null;
let priceService = null;
let iconCache = null;
let stashAnalyzer = null;
let gameDetector = null;
let currentSession = null;
let sessionPrices = null;
let journalStore = null;
let runtimeSessionState = createRuntimeSessionState();
let overlayWindow = null;
let overlayWindowIgnoresMouse = null;
let overlayCharacterState = null;
let overlayRuntimeState = null;
let overlayMapResultState = null;
let overlayStartMapPromptState = null;
let overlayCharacterPromptState = null;
let overlayCharacterPromptTimer = null;
let overlayMapResultDismissTimer = null;
let poeAuthServer = null;
let trayHintShown = false;
const SCAN_HOTKEY_GATE_INTERVAL_MS = 500;
let scanHotkeyGateInterval = null;
let scanHotkeysActive = false;
let appUpdateState = null;
let appUpdateInitialized = false;

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

function broadcastAppUpdateState() {
  if (!mainWindow?.webContents || !appUpdateState) {
    return;
  }

  mainWindow.webContents.send('app-update-state-changed', { ...appUpdateState });
}

function initializeAppUpdater() {
  if (appUpdateInitialized) {
    return appUpdateState;
  }

  appUpdateState = createAppUpdateState({
    currentVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    platform: process.platform
  });

  if (!appUpdateState.enabled) {
    appUpdateInitialized = true;
    return appUpdateState;
  }

  // IMPORTANT: runtime update checks only work after the release pipeline
  // publishes installer artifacts together with latest.yml metadata to
  // GitHub Releases. Keep this in sync with the release workflow.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    applyAppUpdatePatch(appUpdateState, {
      checking: true,
      error: null,
      lastCheckedAt: new Date().toISOString()
    });
    broadcastAppUpdateState();
  });

  autoUpdater.on('update-available', (info) => {
    applyAppUpdatePatch(appUpdateState, {
      checking: false,
      available: true,
      downloading: true,
      downloaded: false,
      nextVersion: info?.version || null,
      releaseName: info?.releaseName || null,
      releaseNotes: info?.releaseNotes || null,
      error: null
    });
    broadcastAppUpdateState();
  });

  autoUpdater.on('download-progress', (progress) => {
    applyAppUpdatePatch(appUpdateState, {
      checking: false,
      downloading: true,
      progressPercent: Math.round(progress?.percent || 0)
    });
    broadcastAppUpdateState();
  });

  autoUpdater.on('update-downloaded', (info) => {
    applyAppUpdatePatch(appUpdateState, {
      checking: false,
      available: true,
      downloading: false,
      downloaded: true,
      progressPercent: 100,
      nextVersion: info?.version || appUpdateState.nextVersion || null,
      releaseName: info?.releaseName || appUpdateState.releaseName || null,
      releaseNotes: info?.releaseNotes || appUpdateState.releaseNotes || null,
      error: null
    });
    broadcastAppUpdateState();
  });

  autoUpdater.on('update-not-available', () => {
    applyAppUpdatePatch(appUpdateState, {
      checking: false,
      available: false,
      downloading: false,
      downloaded: false,
      progressPercent: 0,
      nextVersion: null,
      releaseName: null,
      releaseNotes: null,
      error: null,
      lastCheckedAt: new Date().toISOString()
    });
    broadcastAppUpdateState();
  });

  autoUpdater.on('error', (error) => {
    applyAppUpdatePatch(appUpdateState, {
      checking: false,
      downloading: false,
      error: normalizeErrorMessage(error, 'Failed to check for updates')
    });
    broadcastAppUpdateState();
  });

  appUpdateInitialized = true;
  return appUpdateState;
}

// ─── URL validation for SSRF prevention ───────────────────────────────

const LOCAL_API_PORTS = new Set([80, 443, 3000, 3001]);

function normalizeHostname(hostname) {
  return String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
}

function getUrlPort(url) {
  if (url.port) {
    return parseInt(url.port, 10);
  }
  return url.protocol === 'https:' ? 443 : 80;
}

function isLoopbackHost(hostname) {
  const normalized = normalizeHostname(hostname);
  return normalized === 'localhost'
    || normalized === '::1'
    || normalized === '0:0:0:0:0:0:0:1'
    || normalized === '127.0.0.1'
    || normalized.startsWith('127.');
}

function isPrivateOrReservedIp(hostname) {
  const normalized = normalizeHostname(hostname);
  const version = net.isIP(normalized);

  if (version === 4) {
    const parts = normalized.split('.').map((part) => Number(part));
    const [a, b] = parts;
    return a === 0
      || a === 10
      || a === 127
      || a === 169 && b === 254
      || a === 172 && b >= 16 && b <= 31
      || a === 192 && b === 168
      || a >= 224;
  }

  if (version === 6) {
    if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') {
      return true;
    }
    if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80')) {
      return true;
    }
    const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mappedIpv4) {
      return isPrivateOrReservedIp(mappedIpv4[1]);
    }
  }

  return false;
}

function isValidApiUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return false;
  try {
    const url = new URL(urlString.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;

    const hostname = normalizeHostname(url.hostname);
    const port = getUrlPort(url);
    if (isLoopbackHost(hostname)) {
      return LOCAL_API_PORTS.has(port);
    }

    if (isPrivateOrReservedIp(hostname)) {
      return false;
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

// Juice Journal's own server (apiUrl) is used only after the player turns online features on.
function isOnlineEnabled() {
  return store.get('onlineEnabled') === true;
}

function hasOnlineAccount() {
  return isOnlineEnabled() && Boolean(apiClient?.token);
}

function getActiveProfile() {
  return (store.get('localProfiles') || {})[store.get('activeProfileId')] || null;
}

// Each Path of Exile account gets one local profile on this machine, found again by GGG's account id.
function findOrCreateLocalProfile({ sub, username }) {
  const profiles = store.get('localProfiles') || {};
  const existing = Object.values(profiles).find((profile) => profile.poeSub === sub);
  const now = new Date().toISOString();
  const profile = {
    ...(existing || { id: crypto.randomUUID(), poeSub: sub, createdAt: now }),
    accountName: username || existing?.accountName || null,
    lastSignedInAt: now
  };
  store.set('localProfiles', { ...profiles, [profile.id]: profile });
  return profile;
}

// Moves what an earlier backend sign-in kept on this machine into the first local profile, once. Throws if the
// journal folder cannot be moved; nothing is marked done then, so the next sign-in tries again.
function migrateLegacyUserData(profile) {
  const legacyUserId = getCurrentUserId();
  if (!legacyUserId || store.get('legacyUserMigratedTo')) {
    return;
  }

  const profilesDir = path.join(app.getPath('userData'), 'profiles');
  const legacyDir = path.join(profilesDir, legacyUserId);
  const profileDir = path.join(profilesDir, profile.id);
  const hasLegacyDir = /^[A-Za-z0-9_-]{1,64}$/.test(legacyUserId) && fs.existsSync(legacyDir);
  if (hasLegacyDir && !fs.existsSync(profileDir)) {
    fs.renameSync(legacyDir, profileDir);
  }

  const legacyResults = store.get(`mapResults:${legacyUserId}`);
  if (Array.isArray(legacyResults) && !store.get(`mapResults:${profile.id}`)) {
    store.set(`mapResults:${profile.id}`, legacyResults);
    store.delete(`mapResults:${legacyUserId}`);
  }

  if (!hasLegacyDir || !fs.existsSync(legacyDir)) {
    store.set('legacyUserMigratedTo', profile.id);
  }
}

function assertDesktopUserAuthenticated() {
  if (!getActiveProfile()) {
    throw new Error('Local desktop sign-in is required');
  }
}

function normalizeStoredFarmTypeId(farmTypeId) {
  const normalized = typeof farmTypeId === 'string' ? farmTypeId.trim() : '';
  return normalized || null;
}

function getActiveFarmTypeId() {
  return normalizeStoredFarmTypeId(store.get('activeFarmTypeId'));
}

function resolveFarmTypeLabel(farmTypeId) {
  const normalized = normalizeStoredFarmTypeId(farmTypeId);
  if (!normalized) {
    return null;
  }

  return listFarmTypes().find((farmType) => farmType.id === normalized)?.label || normalized;
}

function setActiveFarmTypeId(farmTypeId) {
  const normalized = normalizeStoredFarmTypeId(farmTypeId);
  store.set('activeFarmTypeId', normalized);
  return normalized;
}

function getMapResultsStoreKey(profileId = getActiveProfile()?.id) {
  return profileId ? `mapResults:${profileId}` : null;
}

// Each profile keeps its own characters, so a second account never starts from the first one's.
function getAccountStateStoreKey(profileId = getActiveProfile()?.id) {
  return profileId ? `lastKnownAccountState:${profileId}` : null;
}

// Sessions and loot stay on this machine: one journal file per local profile under userData/profiles.
function getJournalStore() {
  const profileId = getActiveProfile()?.id;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(profileId || '')) {
    throw new Error('Local desktop sign-in is required');
  }

  if (journalStore?.profileId !== profileId) {
    journalStore = {
      profileId,
      store: new Store({ name: 'journal', cwd: path.join(app.getPath('userData'), 'profiles', profileId) })
    };
  }
  return journalStore.store;
}

function readJournal() {
  return localJournal.normalizeJournal(getJournalStore().store);
}

function writeJournal(journal) {
  getJournalStore().set('sessions', journal.sessions);
}

// Restores the active session, for example after a restart.
function loadActiveSession() {
  currentSession = localJournal.getActiveSession(readJournal());
  return currentSession;
}

// Loads poe.ninja prices for the session's game and league, again when they change or the price list no longer
// holds them (a game switch cleared it, the Currency page synced another league, or poe.ninja was unreachable:
// then only after SESSION_PRICES_RETRY_MS). The load waits its turn behind other syncs of the price service.
function loadSessionPrices(session) {
  const key = `${session.poeVersion}:${session.league}`;
  const loaded = priceService.poeVersion === session.poeVersion
    && priceService.league === session.league
    && priceService.getStatus().itemCount > 0;
  if (sessionPrices?.key === key && (sessionPrices.pending || loaded || Date.now() < sessionPrices.retryAt)) {
    return sessionPrices.load;
  }

  const entry = { key, pending: true, retryAt: 0 };
  entry.load = priceService.ensureSynced(session.league, session.poeVersion, { full: true })
    .catch((error) => console.warn('Unable to load poe.ninja prices for the session', error))
    .then((result) => {
      entry.pending = false;
      if (!result?.itemCount) {
        entry.retryAt = Date.now() + SESSION_PRICES_RETRY_MS;
      }
      notifyPricesUpdated(session.poeVersion, session.league, result);
    });
  sessionPrices = entry;
  return entry.load;
}

// Tells the main window that the price list holds a league's prices, so its views can read the Divine and Mirror
// rates from it without a sync of their own.
function notifyPricesUpdated(poeVersion, league, status) {
  if (!mainWindow?.webContents || !status?.itemCount) {
    return;
  }

  mainWindow.webContents.send('prices-updated', { poeVersion, league, itemCount: status.itemCount });
}

// Loot without a value is priced from the local poe.ninja cache, as the server used to price it.
function addLootToCurrentSession(items, source) {
  const entries = items.map((item) => ({
    ...item,
    source: item.source || source,
    chaosValue: item.chaosValue || readLocalChaosPrice(item.itemName, currentSession.poeVersion) || 0
  }));
  const { journal, lootEntries, session } = localJournal.addLoot(readJournal(), currentSession.id, entries, {
    createId: () => crypto.randomUUID(),
    now: new Date()
  });
  writeJournal(journal);
  currentSession = session;
  return { lootEntries, session };
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

  const normalizedResult = normalizeMapResultForLedger(result);
  const nextResults = appendMapResult(getStoredMapResults(), normalizedResult, { maxResults: 100 });
  store.set(storeKey, nextResults);
  return nextResults;
}

function resolveMapResultsForPublish({ resultIds = [], results = [] } = {}) {
  if (Array.isArray(results) && results.length > 0) {
    return results.filter((result) => result && typeof result === 'object');
  }

  const requestedIds = new Set(
    (Array.isArray(resultIds) ? resultIds : [resultIds])
      .map((id) => (typeof id === 'string' ? id.trim() : ''))
      .filter(Boolean)
  );

  if (requestedIds.size === 0) {
    return [];
  }

  return getStoredMapResults().filter((result) => (
    requestedIds.has(result?.id) || requestedIds.has(result?.localRunId)
  ));
}

function markPublishedMapResults(sourceResults = [], publishedRun = {}) {
  const storeKey = getMapResultsStoreKey();
  if (!storeKey) {
    return [];
  }

  const publishedIds = new Set(
    sourceResults
      .flatMap((result) => [result?.id, result?.localRunId])
      .map((id) => (typeof id === 'string' ? id.trim() : ''))
      .filter(Boolean)
  );

  if (publishedIds.size === 0) {
    return getStoredMapResults();
  }

  const nextResults = getStoredMapResults().map((result) => {
    if (!publishedIds.has(result?.id) && !publishedIds.has(result?.localRunId)) {
      return result;
    }

    return {
      ...result,
      publishState: publishedRun.visibility === 'private' ? 'draft' : 'published',
      publishedRunId: publishedRun.id || result.publishedRunId || null,
      publishedAt: publishedRun.publishedAt || new Date().toISOString(),
      publishedVisibility: publishedRun.visibility || 'private'
    };
  });

  store.set(storeKey, nextResults);
  return nextResults;
}

async function publishMapResultsToFarmingHub(input = {}) {
  if (!isOnlineEnabled()) {
    const error = new Error('Turn on online features to share farm runs');
    error.code = 'ONLINE_DISABLED';
    throw error;
  }

  if (!apiClient?.token || typeof apiClient.publishFarmRun !== 'function') {
    const error = new Error('Sign in before publishing farm runs');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }

  const results = resolveMapResultsForPublish(input);
  if (results.length === 0) {
    const error = new Error('Select at least one local farm result to publish');
    error.code = 'FARM_PUBLISH_EMPTY';
    throw error;
  }

  const payload = buildFarmPublishPayload(results, input.options || {});
  if (!payload) {
    const error = new Error('Unable to build a publish payload for the selected farm results');
    error.code = 'FARM_PUBLISH_PAYLOAD_INVALID';
    throw error;
  }

  const publishedRun = await apiClient.publishFarmRun(payload);
  if (!publishedRun?.id) {
    const error = new Error('The farming hub did not return a published run id');
    error.code = 'FARM_PUBLISH_RESPONSE_INVALID';
    throw error;
  }

  const history = markPublishedMapResults(results, publishedRun || {});

  return {
    run: publishedRun,
    history
  };
}

function getSessionNumberValue(session = {}, ...fields) {
  for (const field of fields) {
    const value = session[field];
    const normalized = Number(value);
    if (Number.isFinite(normalized)) {
      return normalized;
    }
  }

  return 0;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function normalizePersistedSnapshotForDesktop(snapshot, context = {}) {
  if (!snapshot) {
    return null;
  }

  const takenAt = snapshot.takenAt || snapshot.taken_at || snapshot.createdAt || snapshot.created_at || null;
  const timestamp = takenAt ? new Date(takenAt).getTime() : Date.now();
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const totalChaos = Number(snapshot.totalChaosValue ?? snapshot.total_chaos_value ?? snapshot.totalChaos ?? 0) || 0;
  const divinePrice = Number(priceService?.getChaosValue?.('Divine Orb') || 0) || 1;

  return {
    id: snapshot.id || null,
    tabs: Array.isArray(snapshot.tabs) ? snapshot.tabs : [],
    items,
    timestamp,
    league: snapshot.league || context.league,
    poeVersion: snapshot.poeVersion || snapshot.poe_version || context.poeVersion,
    totalChaos,
    totalDivine: totalChaos / divinePrice,
    divinePrice,
    source: 'backend'
  };
}

function normalizeBackendDiffEntry(entry = {}, quantityDelta = null) {
  const quantity = Number(quantityDelta ?? entry.quantityDelta ?? entry.quantity ?? 0) || 0;
  const totalChaosValue = Number(entry.totalChaosValue ?? entry.chaosValueDelta ?? 0) || 0;

  return {
    name: entry.name || entry.typeLine || 'Unknown Item',
    category: entry.category || 'other',
    icon: entry.icon || null,
    beforeQuantity: Number(entry.quantityBefore ?? 0) || 0,
    afterQuantity: Number(entry.quantityAfter ?? entry.quantity ?? 0) || 0,
    quantityDiff: quantity,
    chaosValue: Number(entry.chaosValue ?? 0) || 0,
    totalChaosValue: Math.abs(totalChaosValue)
  };
}

function normalizeBackendSnapshotDiffReport(diff = {}) {
  const gained = [];
  const lost = [];

  (Array.isArray(diff.added) ? diff.added : []).forEach((entry) => {
    gained.push(normalizeBackendDiffEntry(entry, Number(entry.quantity || 0) || 0));
  });

  (Array.isArray(diff.removed) ? diff.removed : []).forEach((entry) => {
    lost.push(normalizeBackendDiffEntry(entry, -(Number(entry.quantity || 0) || 0)));
  });

  (Array.isArray(diff.changed) ? diff.changed : []).forEach((entry) => {
    const quantityDelta = Number(entry.quantityDelta || 0);
    if (quantityDelta > 0) {
      gained.push(normalizeBackendDiffEntry(entry, quantityDelta));
    } else if (quantityDelta < 0) {
      lost.push(normalizeBackendDiffEntry(entry, quantityDelta));
    }
  });

  const totalGained = gained.reduce((sum, entry) => sum + Number(entry.totalChaosValue || 0), 0);
  const totalLost = lost.reduce((sum, entry) => sum + Number(entry.totalChaosValue || 0), 0);
  const netProfit = Number(diff.chaosValueDelta ?? (totalGained - totalLost)) || 0;
  const divinePrice = priceService ? (priceService.getChaosValue('Divine Orb') || 1) : 1;

  return {
    gained: gained.sort((a, b) => b.totalChaosValue - a.totalChaosValue),
    lost: lost.sort((a, b) => b.totalChaosValue - a.totalChaosValue),
    summary: {
      totalGainedChaos: totalGained,
      totalLostChaos: totalLost,
      netProfitChaos: netProfit,
      netProfitDivine: netProfit / divinePrice,
      divinePrice,
      gainedItemCount: gained.length,
      lostItemCount: lost.length,
      totalItemChanges: gained.length + lost.length
    },
    categoryBreakdown: {}
  };
}

function buildSessionShutdownMapResult(session = {}, options = {}) {
  const now = new Date();
  const endedAt = options.endedAt || now.toISOString();
  const startedAt = Date.parse(session.startedAt || session.started_at);
  const endedAtMs = Date.parse(endedAt);
  const durationSeconds = Number.isFinite(Number(options.durationSeconds)) && Number(options.durationSeconds) > 0
    ? Math.round(Number(options.durationSeconds))
    : (Number.isFinite(startedAt) && Number.isFinite(endedAtMs) && endedAtMs >= startedAt
      ? Math.max(1, Math.round((endedAtMs - startedAt) / 1000))
      : 1);
  const report = options.report || {};
  const summary = report.summary || {};
  const netProfit = Number.isFinite(Number(options.profitChaos))
    ? Number(options.profitChaos)
    : (Number.isFinite(Number(summary.netProfitChaos)) ? Number(summary.netProfitChaos) : 0);
  const outputValue = Number.isFinite(Number(options.totalLootChaos))
    ? Number(options.totalLootChaos)
    : (Number.isFinite(Number(summary.totalGainedChaos)) ? Number(summary.totalGainedChaos) : Math.max(0, netProfit));
  const inputValue = Number.isFinite(Number(summary.totalLostChaos))
    ? Number(summary.totalLostChaos)
    : getSessionValueNumber(session, 'costChaos', 'cost_chaos');
  const farmTypeId = session.farmTypeId || session.mapType || session.map_type || getActiveFarmTypeId();

  return {
    // The renderer records the same session under this id when it sees the session end, so one result remains.
    id: `map-result-${session.id || 'session'}-${Date.parse(endedAt) || Date.now()}`,
    sessionId: session.id || null,
    characterId: null,
    characterName: null,
    accountName: null,
    poeVersion: normalizePoeVersion(session.poeVersion ?? session.poe_version) || 'poe1',
    league: session.league || null,
    farmType: resolveFarmTypeLabel(farmTypeId) || session.mapName || session.map_name || 'Unknown farm type',
    durationSeconds,
    inputValue,
    outputValue,
    netProfit,
    profitState: netProfit > 0 ? 'positive' : netProfit < 0 ? 'negative' : 'neutral',
    topInputs: [],
    topOutputs: [],
    profitUnavailable: Boolean(options.profitUnavailable),
    createdAt: endedAt
  };
}

function withTimeout(promise, timeoutMs, message = 'Operation timed out') {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), Math.max(1, Number(timeoutMs) || 1));
    Promise.resolve(promise)
      .then(resolve, reject)
      .finally(() => clearTimeout(timeout));
  });
}

async function getLatestPersistedStashSnapshot(sessionId, kind) {
  if (!hasOnlineAccount() || typeof apiClient.listPoeStashSnapshots !== 'function') {
    return null;
  }

  const response = await apiClient.listPoeStashSnapshots({
    sessionId,
    kind,
    limit: 1
  });
  const snapshots = Array.isArray(response?.snapshots) ? response.snapshots : [];
  return snapshots[0] || null;
}

async function loadPersistedStashSnapshot(snapshotId, context = {}) {
  if (!snapshotId || !hasOnlineAccount() || typeof apiClient.getPoeStashSnapshot !== 'function') {
    return null;
  }

  const response = await apiClient.getPoeStashSnapshot(snapshotId);
  return normalizePersistedSnapshotForDesktop(response?.snapshot || response, context);
}

async function calculateSessionProfitFromPersistedSnapshots(options = {}) {
  assertDesktopUserAuthenticated();

  const sessionId = options.sessionId || options.id || null;
  if (!isUuid(sessionId)) {
    throw new Error('A valid session ID is required to calculate persisted stash profit');
  }

  const [beforeIndex, afterIndex] = await Promise.all([
    getLatestPersistedStashSnapshot(sessionId, 'before'),
    getLatestPersistedStashSnapshot(sessionId, 'after')
  ]);

  if (!beforeIndex) {
    throw new Error('Before snapshot not found for this session');
  }
  if (!afterIndex) {
    throw new Error('After snapshot not found for this session');
  }

  const context = {
    league: afterIndex.league || beforeIndex.league || options.league,
    poeVersion: afterIndex.poeVersion || afterIndex.poe_version || beforeIndex.poeVersion || beforeIndex.poe_version || options.poeVersion
  };
  const [beforeSnapshot, afterSnapshot, diffResponse] = await Promise.all([
    loadPersistedStashSnapshot(beforeIndex.id, context),
    loadPersistedStashSnapshot(afterIndex.id, context),
    apiClient.diffPoeStashSnapshots({
      beforeSnapshotId: beforeIndex.id,
      afterSnapshotId: afterIndex.id
    })
  ]);

  if (!beforeSnapshot || !afterSnapshot) {
    throw new Error('Unable to load persisted stash snapshots for this session');
  }

  if (stashAnalyzer) {
    stashAnalyzer.saveSnapshot(beforeIndex.id, beforeSnapshot);
    stashAnalyzer.saveSnapshot(afterIndex.id, afterSnapshot);
  }

  const report = normalizeBackendSnapshotDiffReport(diffResponse?.diff || diffResponse);

  return {
    beforeSnapshotId: beforeIndex.id,
    afterSnapshotId: afterIndex.id,
    beforeSnapshot,
    afterSnapshot,
    report
  };
}

function buildSafeSettingsSnapshot() {
  const settings = { ...store.store };
  delete settings.authToken;
  delete settings.auditTrail;
  delete settings.poeOAuthTokens;
  delete settings.poeOAuthTokensEncrypted;

  return {
    language: settings.language || 'en',
    notifications: Boolean(settings.notifications),
    soundNotifications: Boolean(settings.soundNotifications),
    autoStartSession: Boolean(settings.autoStartSession),
    poeVersion: settings.poeVersion || 'poe1',
    lastDetectedPoeVersion: normalizePoeVersion(settings.lastDetectedPoeVersion),
    defaultLeaguePoe1: typeof settings.defaultLeaguePoe1 === 'string' ? settings.defaultLeaguePoe1 : null,
    defaultLeaguePoe2: typeof settings.defaultLeaguePoe2 === 'string' ? settings.defaultLeaguePoe2 : null,
    onlineEnabled: settings.onlineEnabled === true,
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
  return settings;
}

async function buildDiagnosticsPayload(mode = 'safe') {
  const exportMode = mode === 'sensitive' ? 'sensitive' : 'safe';

  const apiSnapshot = {
    authenticated: Boolean(apiClient?.token),
    status: isOnlineEnabled() ? 'unknown' : 'disabled',
    latencyMs: null,
    details: null,
    error: null
  };

  if (apiClient && isOnlineEnabled()) {
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
    currentSession: currentSession ? {
      status: currentSession.status
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
    currentSession: currentSession ? {
      id: currentSession.id,
      mapName: currentSession.mapName,
      status: currentSession.status,
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

function normalizePositiveRate(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function readLocalChaosPrice(itemName, poeVersion) {
  if (!priceService || priceService.poeVersion !== poeVersion) {
    return null;
  }

  const localPrice = priceService.getPriceInfo(itemName);
  return normalizePositiveRate(localPrice?.chaosValue);
}

// Divine and Mirror rates come from the local poe.ninja cache, synced for the league first if needed. `cacheOnly`
// reads what the cache already holds for the league and never starts a sync.
async function getProfitCurrencyRates(options = {}) {
  const { activeVersion: poeVersion, league } = resolveLeagueContext(options);
  if (!options.cacheOnly) {
    await priceService.ensureSynced(league, poeVersion).catch(() => {});
  }
  const cached = !options.cacheOnly || priceService.league === league;
  const divineChaos = cached ? readLocalChaosPrice('Divine Orb', poeVersion) : null;
  const mirrorChaos = cached ? readLocalChaosPrice('Mirror of Kalandra', poeVersion) : null;

  return {
    poeVersion,
    league,
    divineChaos,
    mirrorChaos,
    sources: {
      divine: divineChaos ? 'local-price-service' : 'unavailable',
      mirror: mirrorChaos ? 'local-price-service' : 'unavailable'
    }
  };
}

// The Currency page lists the loaded game and league at once. It waits behind the price service's sync queue (a
// session's full sync takes a while) only when the price list does not hold them yet.
async function getCurrencyPrices(params = {}) {
  const { activeVersion: poeVersion, league } = resolveLeagueContext(params);
  const loaded = priceService.poeVersion === poeVersion
    && priceService.league === league
    && priceService.getStatus().itemCount > 0;
  const status = loaded ? priceService.getStatus() : await priceService.ensureSynced(league, poeVersion);
  const prices = priceService.listPrices(params);
  return {
    prices,
    count: prices.length,
    league,
    poeVersion,
    updatedAt: status.lastSync ? new Date(status.lastSync).toISOString() : null
  };
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

function isAllowedExternalAuthUrl(authUrl) {
  try {
    const parsed = new URL(authUrl);
    if (parsed.protocol !== 'https:') {
      return false;
    }

    if (parsed.username || parsed.password) {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();
    return hostname === 'pathofexile.com' || hostname === 'www.pathofexile.com';
  } catch {
    return false;
  }
}

function openUrlWithWindowsFallback(authUrl, originalError) {
  return new Promise((resolve, reject) => {
    // -Command joins every later argument into the script text, so the URL
    // goes through the environment and PowerShell only ever reads it as a string.
    execFile(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        'Start-Process -FilePath $env:JJ_OPEN_URL'
      ],
      {
        windowsHide: true,
        env: { ...process.env, JJ_OPEN_URL: authUrl }
      },
      (fallbackError) => {
        if (fallbackError) {
          reject(originalError);
          return;
        }
        resolve();
      }
    );
  });
}

function openAuthUrlInBrowser(authUrl) {
  if (!isAllowedExternalAuthUrl(authUrl)) {
    throw new Error('Invalid external auth URL');
  }

  return shell.openExternal(authUrl).catch((error) => {
    if (process.platform !== 'win32') {
      throw error;
    }

    return openUrlWithWindowsFallback(authUrl, error);
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

// Waits on the loopback redirect for one authorization code. The redirect URI is registered with GGG, so only
// its exact port is used.
async function waitForPoeAuthorizationCode({ authUrl, redirectUri, expectedState }) {
  await closePoeAuthServer();
  const redirectUrl = new URL(redirectUri);

  return await new Promise((resolve, reject) => {
    const finish = async (error, code) => {
      clearTimeout(timeout);
      await closePoeAuthServer();
      if (error) {
        reject(error);
      } else {
        resolve(code);
      }
    };
    const timeout = setTimeout(() => finish(new Error('Path of Exile sign-in timed out')), 3 * 60 * 1000);

    poeAuthServer = http.createServer((req, res) => {
      const url = new URL(req.url, redirectUri);
      if (url.pathname !== redirectUrl.pathname) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      if (url.searchParams.get('error') || !code || url.searchParams.get('state') !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(renderBrowserCallbackPage('Sign-in Failed', 'Return to Juice Journal and try again.'));
        finish(new Error(url.searchParams.get('error') || 'Invalid callback state'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(renderBrowserCallbackPage('Connected', 'You can close this window and return to Juice Journal.'));
      finish(null, code);
    });
    poeAuthServer.on('error', (error) => finish(error));
    poeAuthServer.listen(Number(redirectUrl.port), redirectUrl.hostname, () => {
      Promise.resolve()
        .then(() => openAuthUrlInBrowser(authUrl))
        .catch((error) => finish(error));
    });
  });
}

// Signs this device in to Path of Exile with the app's public client (PKCE), so character data goes from GGG
// straight to this machine. Separate from the account sign-in; the tokens stay here, encrypted with safeStorage.
async function connectPoeDevice() {
  const redirectUri = process.env.POE_REDIRECT_URI || 'http://127.0.0.1:34127/oauth/poe/callback';
  const state = crypto.randomUUID();
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  const code = await waitForPoeAuthorizationCode({
    authUrl: poeApiClient.buildAuthorizeUrl({ redirectUri, codeChallenge, state }),
    redirectUri,
    expectedState: state
  });
  return await poeApiClient.exchangeCode({ code, codeVerifier, redirectUri });
}

function dropPoeDeviceConnection() {
  poeApiClient.clearTokens();
  persistPoeClientTokens(null);
}

// Signing in on this device opens (or creates) the account's local profile.
async function signInWithPoe() {
  const account = await connectPoeDevice();
  if (!account?.sub) {
    dropPoeDeviceConnection();
    throw new Error(t('poeNoAccountId'));
  }

  const profile = findOrCreateLocalProfile(account);
  // The profile becomes active only after the old data has moved, so a failed move is retried next time.
  migrateLegacyUserData(profile);
  store.set('activeProfileId', profile.id);
  loadActiveSession();
  appendAuditTrail('auditLogin');
  return profile;
}

// Reconnecting keeps the profile, so it must be the same Path of Exile account.
async function reconnectPoeDevice() {
  const account = await connectPoeDevice();
  if (account?.sub !== getActiveProfile()?.poeSub) {
    dropPoeDeviceConnection();
    throw new Error(t('poeDifferentAccount'));
  }
}

function normalizeDeviceCharacter(character, poeVersion) {
  return {
    id: String(character?.id || ''),
    name: String(character?.name || ''),
    level: Number(character?.level) || 0,
    class: character?.class || null,
    league: character?.league || null,
    poeVersion,
    current: character?.current === true
  };
}

async function getPoeDeviceCharacters(poeVersion) {
  const version = normalizePoeVersion(poeVersion);
  if (!version || !poeApiClient.isAuthenticated()) {
    return { connected: poeApiClient.isAuthenticated(), characters: null };
  }

  try {
    const characters = (await poeApiClient.listCharacters(version))
      .map((character) => normalizeDeviceCharacter(character, version))
      .filter((character) => character.id && character.name);
    return { connected: true, characters };
  } catch (error) {
    if (error.code === 'POE_AUTH_EXPIRED') {
      return { connected: false, characters: null, error: 'auth_expired' };
    }
    return {
      connected: true,
      characters: null,
      error: error.code === 'POE_RATE_LIMITED' ? 'rate_limited' : 'unavailable',
      retryAfter: error.retryAfter || null
    };
  }
}

function persistPoeClientTokens(tokens) {
  if (tokens?.accessToken) {
    persistPoeTokens(tokens);
    return;
  }
  store.delete('poeOAuthTokensEncrypted');
  store.delete('poeOAuthTokens');
}

// Development mode controls.
const isDev = !app.isPackaged;
const forceLiveAuth = process.env.JUICE_JOURNAL_FORCE_LIVE_AUTH === '1'
  || process.argv.includes('--force-live-auth');
const shouldOpenDevTools = process.env.JUICE_JOURNAL_OPEN_DEVTOOLS === '1'
  || process.argv.includes('--devtools');

function createWindowIcon() {
  const image = nativeImage.createFromPath(APP_ICON_PATH);
  return image.isEmpty() ? APP_ICON_PATH : image;
}

function getTrustedRendererUrl(entryFile) {
  return pathToFileURL(path.join(__dirname, 'src', entryFile)).toString();
}

function hardenWindowNavigation(windowRef, entryFile) {
  const allowedUrl = getTrustedRendererUrl(entryFile);

  windowRef.webContents.on('will-navigate', (event, url) => {
    if (url !== allowedUrl) {
      event.preventDefault();
    }
  });

  windowRef.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function getRendererWindow(kind) {
  return kind === 'overlay' ? overlayWindow : mainWindow;
}

function getAllowedIpcRendererKinds(channel) {
  return IPC_RENDERER_SCOPES[channel] || ['main'];
}

function isTrustedRenderer(event, kind) {
  const sender = event?.sender;
  const frame = event?.senderFrame;
  const windowRef = getRendererWindow(kind);
  const entryFile = TRUSTED_RENDERER_FILES[kind];

  if (!sender || !frame || !windowRef || !entryFile || windowRef.isDestroyed?.()) {
    return false;
  }

  if (sender !== windowRef.webContents || frame !== sender.mainFrame) {
    return false;
  }

  return frame.url === getTrustedRendererUrl(entryFile);
}

function assertTrustedIpcSender(event, allowedKinds, channel = 'unknown') {
  const allowed = Array.isArray(allowedKinds) ? allowedKinds : [allowedKinds];
  if (!allowed.some((kind) => isTrustedRenderer(event, kind))) {
    throw new Error(`Unauthorized IPC sender for ${channel}`);
  }
}

function createValidatedIpcHandler(channel, allowedKinds, handler) {
  return async (event, ...args) => {
    assertTrustedIpcSender(event, allowedKinds, channel);
    return await handler(event, ...args);
  };
}

function installValidatedIpcHandle() {
  if (validatedIpcHandleInstalled) {
    return;
  }

  const rawHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, handler) => rawHandle(
    channel,
    createValidatedIpcHandler(channel, getAllowedIpcRendererKinds(channel), handler)
  );
  validatedIpcHandleInstalled = true;
}

/**
 * Create the main window.
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
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    },
    icon: createWindowIcon(),
    title: APP_NAME
  });
  mainWindow.setIcon(createWindowIcon());
  hardenWindowNavigation(mainWindow, TRUSTED_RENDERER_FILES.main);

  // Load the dashboard shell.
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  if (shouldOpenDevTools) {
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

// The overlay sits on the monitor that shows the game window; primary display when the window is unknown.
function getOverlayDisplay() {
  try {
    const processes = gameDetector ? gameDetector.getDetectedProcesses() : [];
    const gameWindow = win32Probe.findProcessWindow(processes.map((entry) => entry.ProcessId));
    if (gameWindow && !gameWindow.minimized && gameWindow.width > 0 && gameWindow.height > 0) {
      const { x, y, width, height } = gameWindow;
      return screen.getDisplayMatching(screen.screenToDipRect(null, { x, y, width, height }));
    }
  } catch (error) {
    console.error('[Overlay] Game window lookup failed:', error.message);
  }
  return screen.getPrimaryDisplay();
}

function getOverlayWindowBounds(overlayState = {}) {
  const display = getOverlayDisplay();
  const workArea = display.workArea || display.bounds;
  const isInteractivePrompt = overlayState.mode === 'start-map-prompt' || overlayState.mode === 'character-prompt';
  const width = isInteractivePrompt ? 440 : 360;
  const height = isInteractivePrompt ? 286 : 112;

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
      preload: path.join(__dirname, 'overlay-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    },
    title: `${APP_NAME} Overlay`
  });

  overlayWindow.setIgnoreMouseEvents(true);
  overlayWindowIgnoresMouse = true;
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  hardenWindowNavigation(overlayWindow, TRUSTED_RENDERER_FILES.overlay);
  overlayWindow.loadFile(path.join(__dirname, 'src', 'overlay.html'));
  overlayWindow.webContents.once('did-finish-load', () => {
    updateOverlayWindow();
  });
  overlayWindow.on('closed', () => {
    overlayWindow = null;
    overlayWindowIgnoresMouse = null;
  });

  return overlayWindow;
}

// The renderer resolves the active character (account payload, Client.txt names, the player's pick) and sends it
// here, so the overlay and the main window always show the same one.
function normalizeOverlayCharacter(character) {
  if (!character || typeof character !== 'object') {
    return null;
  }

  const text = (value) => (typeof value === 'string' ? value.trim().slice(0, 64) : '') || null;
  const level = Number(character.level);
  const normalized = {
    id: text(character.id),
    name: text(character.name),
    league: text(character.league),
    className: text(character.className),
    level: Number.isInteger(level) && level > 0 && level <= 100 ? level : null
  };

  return normalized.name || normalized.league ? normalized : null;
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

function normalizeStartMapPromptText(value, fallback = null) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || fallback;
}

function normalizeStartMapPromptFarmTypeOptions(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const id = normalizeStartMapPromptText(entry.id);
      const label = normalizeStartMapPromptText(entry.label, id);
      return id ? { id, label } : null;
    })
    .filter(Boolean);
}

function showStartMapPromptOverlay(prompt = {}, options = {}) {
  overlayStartMapPromptState = {
    mapName: normalizeStartMapPromptText(prompt.mapName, 'Unknown Map'),
    farmTypeId: normalizeStartMapPromptText(prompt.farmTypeId || prompt.farm_type_id),
    farmType: normalizeStartMapPromptText(prompt.farmType),
    poeVersion: normalizeStartMapPromptText(prompt.poeVersion || prompt.gameVersion),
    league: normalizeStartMapPromptText(prompt.league),
    farmTypeOptions: normalizeStartMapPromptFarmTypeOptions(prompt.farmTypeOptions),
    source: normalizeStartMapPromptText(prompt.source, 'map-detected'),
    createdAt: options.now ?? Date.now()
  };

  return updateOverlayWindow();
}

function normalizeStartMapPromptResult(payload = {}, promptState = overlayStartMapPromptState, action = 'confirm') {
  const currentPrompt = promptState && typeof promptState === 'object' ? promptState : {};
  const mapName = normalizeStartMapPromptText(payload.mapName, currentPrompt.mapName || 'Unknown Map');
  const requestedFarmTypeId = normalizeStartMapPromptText(payload.farmTypeId || payload.farm_type_id);
  const supportedFarmTypeIds = new Set(
    normalizeStartMapPromptFarmTypeOptions(currentPrompt.farmTypeOptions).map((entry) => entry.id)
  );
  const farmTypeId = requestedFarmTypeId && (!supportedFarmTypeIds.size || supportedFarmTypeIds.has(requestedFarmTypeId))
    ? requestedFarmTypeId
    : null;

  return {
    action,
    mapName,
    farmTypeId,
    source: currentPrompt.source || 'overlay'
  };
}

function emitStartMapPromptOverlayResult(result) {
  if (mainWindow && (typeof mainWindow.isDestroyed !== 'function' || !mainWindow.isDestroyed())) {
    mainWindow.webContents.send('start-map-prompt-overlay-result', result);
  }

  return result;
}

function confirmStartMapPromptOverlay(payload = {}) {
  const result = normalizeStartMapPromptResult(payload, overlayStartMapPromptState, 'confirm');
  overlayStartMapPromptState = null;
  updateOverlayWindow();
  return emitStartMapPromptOverlayResult(result);
}

function cancelStartMapPromptOverlay() {
  const result = normalizeStartMapPromptResult({}, overlayStartMapPromptState, 'cancel');
  overlayStartMapPromptState = null;
  updateOverlayWindow();
  return emitStartMapPromptOverlayResult(result);
}

function hideStartMapPromptOverlay() {
  overlayStartMapPromptState = null;
  return updateOverlayWindow();
}

function clearCharacterPromptOverlay() {
  if (overlayCharacterPromptTimer) {
    clearTimeout(overlayCharacterPromptTimer);
    overlayCharacterPromptTimer = null;
  }
  overlayCharacterPromptState = null;
}

// "Playing as …" after Play. It closes on its own, so an unanswered prompt leaves the assumed character in place.
function showCharacterPromptOverlay(prompt = {}) {
  clearCharacterPromptOverlay();
  const characters = (Array.isArray(prompt.characters) ? prompt.characters : [])
    .slice(0, 40)
    .map(normalizeOverlayCharacter)
    .filter((character) => character?.id && character.name);

  overlayCharacterPromptState = {
    poeVersion: normalizePoeVersion(prompt.poeVersion),
    selectedId: typeof prompt.selectedId === 'string' ? prompt.selectedId.trim() || null : null,
    characters
  };
  overlayCharacterPromptTimer = setTimeout(() => {
    overlayCharacterPromptTimer = null;
    overlayCharacterPromptState = null;
    updateOverlayWindow();
  }, CHARACTER_PROMPT_OVERLAY_DURATION_MS);

  return updateOverlayWindow();
}

function chooseCharacterPromptOverlay(payload = {}) {
  const prompt = overlayCharacterPromptState;
  const character = prompt?.characters.find((entry) => entry.id === payload.characterId) || null;
  clearCharacterPromptOverlay();
  updateOverlayWindow();

  if (!character) {
    return null;
  }

  const result = { poeVersion: prompt.poeVersion, characterId: character.id };
  if (mainWindow && (typeof mainWindow.isDestroyed !== 'function' || !mainWindow.isDestroyed())) {
    mainWindow.webContents.send('character-prompt-overlay-result', result);
  }

  return result;
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

function getActiveSessionOverlayState(session = currentSession) {
  if (!session || typeof session !== 'object') {
    return null;
  }

  return {
    ...session,
    farmType: resolveFarmTypeLabel(session.farmTypeId || session.mapType),
    farmTypeLabel: resolveFarmTypeLabel(session.farmTypeId || session.mapType)
  };
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
    runtime: runtimeSession,
    session: getActiveSessionOverlayState(),
    startMapPrompt: currentSession ? null : overlayStartMapPromptState,
    characterPrompt: overlayCharacterPromptState,
    now: Date.now()
  });
}

function ensureOverlayWindowForSettings() {
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

  // The window is never focusable, so clicking the prompt or the result card leaves the game in the
  // foreground. Passive states are fully click-through.
  const ignoreMouse = !OVERLAY_CLICKABLE_MODES.has(overlayState.mode);
  if (overlayWindowIgnoresMouse !== ignoreMouse) {
    overlayWindow.setIgnoreMouseEvents(ignoreMouse);
    overlayWindowIgnoresMouse = ignoreMouse;
  }

  const bounds = getOverlayWindowBounds(overlayState);
  const current = overlayWindow.getBounds();
  if (current.x !== bounds.x || current.y !== bounds.y || current.width !== bounds.width || current.height !== bounds.height) {
    overlayWindow.setBounds(bounds);
  }
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

  if (overlayState.visibility !== 'hidden' && (!overlayWindow || overlayWindow.isDestroyed())) {
    const appReady = typeof app?.isReady === 'function' ? app.isReady() : true;
    if (appReady) {
      createOverlayWindow();
    }
  }

  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return overlayState;
  }

  applyOverlayWindowVisibility(overlayState);
  overlayWindow.webContents.send('overlay-render-state', overlayState);

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

function tryRegisterGlobalShortcuts() {
  try {
    registerGlobalShortcuts();
  } catch (error) {
    console.warn(`[Hotkeys] ${error.message}`);
  }
}

// Holds the OCR hotkeys only while a session runs and the game window has focus (see shouldEnableScanHotkeys).
function syncScanHotkeys() {
  const hasActiveSession = Boolean(currentSession);
  let foregroundProcessId = null;
  if (hasActiveSession) {
    try {
      foregroundProcessId = win32Probe.getForegroundProcessId();
    } catch {
      // Unreadable: the session alone decides.
    }
  }

  const shouldBeActive = shouldEnableScanHotkeys({
    hasActiveSession,
    foregroundProcessId,
    gameProcessIds: (gameDetector ? gameDetector.getDetectedProcesses() : []).map((entry) => entry.ProcessId)
  });
  if (shouldBeActive === scanHotkeysActive) {
    return;
  }

  scanHotkeysActive = shouldBeActive;
  if (shouldBeActive) {
    tryRegisterGlobalShortcuts();
  } else {
    globalShortcut.unregisterAll();
  }
}

function releaseInactiveScanHotkeys() {
  if (!scanHotkeysActive) {
    globalShortcut.unregisterAll();
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

    // Prices load while the screen is read; a slow or unreachable poe.ninja holds the scan for a few seconds at most.
    const scannedSession = currentSession;
    const prices = withTimeout(loadSessionPrices(scannedSession), SESSION_PRICES_WAIT_MS).catch(() => null);

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

    await prices;
    // The session may have ended (or another started) while the scan ran.
    if (currentSession?.id !== scannedSession.id) {
      showNotification(t('notificationError'), t('noActiveSession'));
      return;
    }

    const result = addLootToCurrentSession(items, 'ocr');
    const totalValue = result.lootEntries.reduce((sum, loot) => sum + (loot.chaosValue * loot.quantity), 0);
    showNotification(
      t('notificationLootAdded'),
      t('lootAddedBody', { count: result.lootEntries.length, value: totalValue.toFixed(1) })
    );

    // Renderer'a bilgi gonder
    if (mainWindow) {
      mainWindow.webContents.send('loot-added', { items: result.lootEntries, totalValue });
    }

    return result;
  } catch (error) {
    showNotification(t('notificationError'), t('lootScanFailed'));
  }
}

/**
 * Start a new map session
 */
async function startNewSession(input = {}) {
  try {
    // End the current session first when one is active.
    if (currentSession) {
      await endCurrentSession();
    }

    const { activeVersion: poeVersion, league } = resolveLeagueContext(input);
    const farmTypeId = normalizeStoredFarmTypeId(input.farmTypeId || input.mapType || getActiveFarmTypeId());

    // Resolve the map name.
    const mapName = input.mapName || await promptMapName();
    if (!mapName) return;

    // Session olustur
    const { journal, session } = localJournal.startSession(readJournal(), {
      mapName,
      mapTier: input.mapTier || null,
      farmTypeId,
      strategyTag: input.strategyTag || null,
      notes: input.notes || null,
      costChaos: input.costChaos || 0,
      poeVersion,
      league,
      startedAt: input.startedAt
    }, { id: crypto.randomUUID(), now: new Date() });
    writeJournal(journal);
    appendAuditTrail('auditSessionStarted', { mapName });

    currentSession = session;
    overlayStartMapPromptState = null;
    if (typeof updateOverlayWindow === 'function') {
      updateOverlayWindow();
    }
    // Prices for scanned loot load in the background, so the first OCR scan does not wait for them.
    if (typeof loadSessionPrices === 'function') {
      void loadSessionPrices(session);
    }

    // Bildirim goster
    showNotification(t('notificationMapStarted'), t('mapStartedBody', { mapName }));

    // Renderer'a bilgi gonder
    if (mainWindow) {
      mainWindow.webContents.send('session-started', session);
    }

    return session;
  } catch (error) {
    showNotification(t('notificationError'), t('sessionStartFailed'));
    throw error;
  }
}

async function handleMapEntered(data) {
  publishRuntimeSessionEvent('area_entered', data);
}

function getSessionValueNumber(session = {}, ...fields) {
  for (const field of fields) {
    const value = session[field];
    const normalized = Number(value);
    if (Number.isFinite(normalized)) {
      return normalized;
    }
  }

  return 0;
}

function shouldAutoEndSessionOnMapExit(session = {}) {
  const poeVersion = normalizePoeVersion(session.poeVersion ?? session.poe_version)
    || 'poe1';

  // Without account:stashes (the built-in sign-in) there is no stash diff to wait for.
  if (poeVersion !== 'poe1' || !poeApiClient?.hasScope('account:stashes')) {
    return true;
  }

  const totalLootChaos = getSessionValueNumber(session, 'totalLootChaos', 'total_loot_chaos');
  const profitChaos = getSessionValueNumber(session, 'profitChaos', 'profit_chaos');

  // With stash access, PoE1 profit is finalized by the stash before/after diff. If no
  // loot has been recorded yet, keep the session open after leaving the map so
  // the player can dump loot and calculate the stash diff first.
  return totalLootChaos !== 0 || profitChaos !== 0;
}

async function resolveShutdownSessionCompletion(session = {}) {
  const poeVersion = normalizePoeVersion(session.poeVersion ?? session.poe_version) || 'poe1';

  if (poeVersion === 'poe1') {
    try {
      const persistedProfit = await withTimeout(
        calculateSessionProfitFromPersistedSnapshots({
          sessionId: session.id,
          league: session.league,
          poeVersion
        }),
        8000,
        'Timed out while calculating shutdown stash profit'
      );
      const report = persistedProfit?.report || null;
      const summary = report?.summary || {};
      const totalLootChaos = Number(summary.totalGainedChaos);
      const profitChaos = Number(summary.netProfitChaos);

      if (report && Number.isFinite(totalLootChaos) && Number.isFinite(profitChaos)) {
        return {
          totalLootChaos: Math.max(0, totalLootChaos),
          profitChaos,
          report
        };
      }
    } catch (error) {
      console.warn('Unable to calculate PoE1 stash profit during shutdown; closing session with its recorded loot', error);
    }
  }

  // No stash totals: the journal values the session from the loot recorded in it.
  return null;
}

async function finalizeActiveSessionOnShutdown() {
  let session = currentSession || null;

  if (!session) {
    try {
      session = loadActiveSession();
    } catch (error) {
      console.warn('Unable to load active session during shutdown', error);
      session = null;
    }
  }

  if (!session?.id) {
    return null;
  }

  const endedAt = new Date().toISOString();
  const startedAtMs = Date.parse(session.startedAt || session.started_at);
  const endedAtMs = Date.parse(endedAt);
  const durationSeconds = Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs) && endedAtMs >= startedAtMs
    ? Math.max(1, Math.round((endedAtMs - startedAtMs) / 1000))
    : 1;
  const completion = await resolveShutdownSessionCompletion(session);
  const completedSession = await endCurrentSession({
    sessionId: session.id,
    mapName: session.mapName || session.map_name,
    startedAt: session.startedAt || session.started_at,
    endedAt,
    durationSeconds,
    totalLootChaos: completion?.totalLootChaos,
    profitChaos: completion?.profitChaos
  }) || { ...session, status: 'completed', endedAt, durationSeconds };

  saveMapResultHistory(buildSessionShutdownMapResult(completedSession, {
    report: completion?.report,
    endedAt,
    durationSeconds,
    totalLootChaos: completedSession.totalLootChaos,
    profitChaos: completedSession.profitChaos
  }));

  return completedSession;
}

/**
 * Mevcut session'i bitir
 */
async function endCurrentSession(options = {}) {
  try {
    const requestedSessionId = options.sessionId || options.id || null;
    const journal = readJournal();
    const activeSession = currentSession || (requestedSessionId
      ? localJournal.getSession(journal, requestedSessionId)
      : localJournal.getActiveSession(journal));
    if (!activeSession) return;

    const endedAt = options.endedAt || new Date().toISOString();
    const explicitDurationSeconds = Number(options.durationSeconds);
    const startedAtMs = Date.parse(activeSession.startedAt);
    const endedAtMs = Date.parse(endedAt);
    const durationSeconds = Number.isFinite(explicitDurationSeconds) && explicitDurationSeconds > 0
      ? Math.round(explicitDurationSeconds)
      : (Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs) && endedAtMs >= startedAtMs
        ? Math.max(1, Math.round((endedAtMs - startedAtMs) / 1000))
        : null);
    const completionPayload = {
      endedAt
    };

    if (durationSeconds !== null) {
      completionPayload.durationSeconds = durationSeconds;
    }

    const totalLootChaos = Number(options.totalLootChaos);
    const profitChaos = Number(options.profitChaos);
    if (Number.isFinite(totalLootChaos) && totalLootChaos >= 0 && Number.isFinite(profitChaos)) {
      completionPayload.totalLootChaos = totalLootChaos;
      completionPayload.profitChaos = profitChaos;
    }

    const ended = localJournal.endSession(journal, activeSession.id, completionPayload, { now: new Date() });
    writeJournal(ended.journal);
    const session = { ...ended.session, ...completionPayload };
    appendAuditTrail('auditSessionEnded', { mapName: session.mapName });

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
    if (typeof updateOverlayWindow === 'function') {
      updateOverlayWindow();
    }

    return session;
  } catch (error) {
    showNotification(t('notificationError'), t('sessionEndFailed'));
    throw toRendererError(error, t('sessionEndFailed'));
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

  logParser = new LogParser(poePath, {
    poeVersion: normalizePoeVersion(store.get('lastDetectedPoeVersion'))
      || normalizePoeVersion(store.get('poeVersion'))
      || 'poe1'
  });

  logParser.on('mapEntered', (data) => {
    handleMapEntered(data).catch(() => {
        showNotification(t('notificationError'), t('sessionStartFailed'));
    });
  });

  logParser.on('mapExited', (data) => {
    const runtimePayload = publishRuntimeSessionEvent('area_exited', data);
    if (currentSession && shouldAutoEndSessionOnMapExit(currentSession)) {
      const instances = Array.isArray(runtimePayload?.runtimeSession?.instances)
        ? runtimePayload.runtimeSession.instances
        : [];
      const lastCompletedInstance = instances[instances.length - 1] || null;
      endCurrentSession({
        endedAt: data.timestamp,
        durationSeconds: lastCompletedInstance?.durationSeconds
      });
    }
  });

  // Play, back to character select, and character names from level-up/death lines (party members included);
  // the renderer matches names against the account's own characters.
  const gameSessionChannels = {
    gameSessionEntered: 'game-session-entered',
    gameSessionLeft: 'game-session-left',
    characterLogLine: 'character-log-line'
  };
  for (const [eventName, channel] of Object.entries(gameSessionChannels)) {
    logParser.on(eventName, (data) => {
      if (mainWindow) {
        mainWindow.webContents.send(channel, data);
      }
    });
  }

  logParser.start();
  try {
    logParser.bootstrapFromTail({
      maxAgeMs: 10 * 60 * 1000
    });
  } catch (error) {
    console.warn('Failed to bootstrap map state from Client.txt tail', error);
  }
}

/**
 * Game detector - auto-detect PoE 1 / PoE 2 running
 */
function setupGameDetector() {
  gameDetector = new GameDetector();

  gameDetector.on('gameLaunched', ({ version, processes }) => {
    const gameLabel = version === 'poe2' ? 'Path of Exile 2' : 'Path of Exile';
    console.log(`[GameDetector] ${gameLabel} launched`);
    applyGameVersion(version, { processes });
    showNotification(t('notificationInfo'), t('gameDetected', { game: gameLabel }));
  });

  gameDetector.on('gameSwitched', ({ from, to, processes }) => {
    const fromLabel = from === 'poe2' ? 'PoE 2' : 'PoE 1';
    const toLabel = to === 'poe2' ? 'PoE 2' : 'PoE 1';
    console.log(`[GameDetector] Switched from ${fromLabel} to ${toLabel}`);
    applyGameVersion(to, { processes });
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

  console.log(`[GameDetector] ${gameLabel} closed`);
  if (mainWindow) {
    mainWindow.webContents.send('game-closed', payload);
  }

  return payload;
}

/**
 * Apply detected game version — update store, price service, log parser, and notify renderer
 */
function applyGameVersion(version, options = {}) {
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
  detectedLogPath = GameDetector.findLogPath(version, {
    processes: Array.isArray(options.processes) ? options.processes : []
  });

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
  'apiUrl', 'onlineEnabled', 'poePath', 'autoStartSession', 'notifications',
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
  // Every save sends both hotkeys. Only new ones are checked, so a key another app holds while the game
  // is not in front does not block unrelated settings.
  const storedHotkeys = shouldRefreshHotkeys ? getValidatedHotkeySettings() : null;
  const hotkeysChanged = shouldRefreshHotkeys && (
    normalizedHotkeys.scanHotkey !== storedHotkeys.scanHotkey
    || normalizedHotkeys.stashScanHotkey !== storedHotkeys.stashScanHotkey
  );

  if (hotkeysChanged) {
    // Registering checks that no other app holds the keys; outside the game they are released again.
    try {
      registerGlobalShortcuts(normalizedHotkeys);
    } finally {
      releaseInactiveScanHotkeys();
    }
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

    if (key === 'onlineEnabled') {
      store.set(key, value === true);
      continue;
    }

    if (key === 'lastKnownAccountState') {
      const accountStateKey = getAccountStateStoreKey();
      if (accountStateKey) {
        store.set(accountStateKey, value);
      }
      continue;
    }

    store.set(key, value);
  }

  if (hasApiUrl && apiClient) {
    apiClient.setBaseURL(normalizedApiUrl);
  }

  if (Object.prototype.hasOwnProperty.call(settings, 'onlineEnabled') && apiClient) {
    apiClient.setOnline(settings.onlineEnabled === true);
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
  store.set('authToken', null);
  store.set('authTokenEncrypted', null);
  store.set('currentUserId', null);
  store.set('activeProfileId', null);
  apiClient.setToken(null);
  currentSession = null;
  if (stashAnalyzer) {
    stashAnalyzer.clearAll();
  }
  overlayMapResultState = null;
  clearOverlayMapResultDismissTimer();
  updateOverlayWindow({ character: null });
  // The device's Path of Exile connection belongs to the signed-in player.
  if (poeApiClient) {
    poeApiClient.clearTokens();
  }
  persistPoeClientTokens(null);
  return true;
}

function getRendererSettings() {
  const allSettings = { ...store.store };
  delete allSettings.authToken;
  delete allSettings.authTokenEncrypted;
  delete allSettings.poeOAuthTokens;
  delete allSettings.poeOAuthTokensEncrypted;
  delete allSettings.currentUserId;
  delete allSettings.localProfiles;
  delete allSettings.activeProfileId;
  // The renderer sees only the signed-in profile's character cache. Map results
  // reach it per profile through their own IPC.
  Object.keys(allSettings)
    .filter((key) => key.startsWith('lastKnownAccountState:') || key.startsWith('mapResults:'))
    .forEach((key) => delete allSettings[key]);
  const accountStateKey = getAccountStateStoreKey();
  allSettings.lastKnownAccountState = (accountStateKey && store.get(accountStateKey)) || null;
  allSettings.scanHotkey = allSettings.scanHotkey || DEFAULT_SCAN_HOTKEY;
  allSettings.stashScanHotkey = allSettings.stashScanHotkey || DEFAULT_STASH_SCAN_HOTKEY;
  return allSettings;
}

function persistDesktopAuthSession(authCookie) {
  if (!authCookie) {
    return false;
  }

  const encrypted = encryptAuthToken(authCookie);
  if (encrypted) {
    store.set('authTokenEncrypted', encrypted);
    store.set('authToken', null);
  } else {
    store.set('authToken', authCookie);
  }

  apiClient.setToken(authCookie);
  return true;
}

/**
 * IPC handler'lari tanimla
 */
function setupIPC() {
  installValidatedIpcHandle();

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
  ipcMain.handle('get-settings', () => getRendererSettings());

  ipcMain.handle('set-settings', (event, settings) => {
    return applyDesktopSettings(settings);
  });

  ipcMain.handle('get-local-profile', () => getActiveProfile());

  ipcMain.handle('get-online-account', () => ({
    enabled: isOnlineEnabled(),
    signedIn: Boolean(apiClient?.token)
  }));

  // Checks the server address typed in Settings. Nothing is sent while online features are off.
  ipcMain.handle('test-online-connection', async (event, apiUrl) => {
    const url = typeof apiUrl === 'string' ? apiUrl.trim() : '';
    if (!isValidApiUrl(url)) {
      throw new Error('Invalid API URL');
    }

    try {
      await new APIClient(url, null, { online: isOnlineEnabled() }).healthCheck();
      return true;
    } catch (error) {
      throw toRendererError(error, 'Unable to reach the server');
    }
  });

  // Leaves the local profile and the device's Path of Exile connection as they are.
  ipcMain.handle('sign-out-online', () => {
    store.set('authToken', null);
    store.set('authTokenEncrypted', null);
    apiClient.setToken(null);
    return true;
  });

  ipcMain.handle('get-runtime-mode', () => ({
    isPackaged: app.isPackaged,
    isDev,
    forceLiveAuth
  }));

  ipcMain.handle('get-app-update-state', () => {
    return { ...(initializeAppUpdater() || {}) };
  });

  ipcMain.handle('check-for-app-update', async () => {
    const state = initializeAppUpdater();
    if (!state?.enabled) {
      return { ...state };
    }

    await autoUpdater.checkForUpdates();
    return { ...appUpdateState };
  });

  ipcMain.handle('install-app-update', async () => {
    const state = initializeAppUpdater();
    if (!state?.downloaded) {
      throw new Error('No downloaded update is ready to install');
    }

    setImmediate(() => autoUpdater.quitAndInstall());
    return { accepted: true };
  });

  // The Currency page reads poe.ninja through the local price service; nothing goes to a server.
  ipcMain.handle('sync-currency-prices', async (event, options = {}) => {
    try {
      const { activeVersion: poeVersion, league } = resolveLeagueContext(options);
      const status = await priceService.ensureSynced(league, poeVersion, { full: true, force: true });
      notifyPricesUpdated(poeVersion, league, status);
      return status;
    } catch (error) {
      throw toRendererError(error, 'Price sync failed');
    }
  });

  ipcMain.handle('get-currency-prices', async (event, params = {}) => {
    try {
      return await getCurrencyPrices(params);
    } catch (error) {
      throw toRendererError(error, 'Failed to load prices');
    }
  });

  ipcMain.handle('get-currency-leagues', async (event, poeVersion = 'poe1') => {
    try {
      return { activeLeagues: await priceService.getLeagues(poeVersion) };
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

  // Start a session.
  ipcMain.handle('start-session', async (event, data) => {
    return await startNewSession(data || {});
  });

  ipcMain.handle('get-active-farm-type', () => getActiveFarmTypeId());

  ipcMain.handle('set-active-farm-type', (event, farmTypeId) => {
    return setActiveFarmTypeId(farmTypeId);
  });

  // End a session.
  ipcMain.handle('end-session', async (event, options = {}) => {
    return await endCurrentSession(options);
  });

  // Get the active session.
  ipcMain.handle('get-current-session', () => {
    return loadActiveSession();
  });

  ipcMain.handle('get-session-details', async (event, sessionId) => {
    try {
      const session = localJournal.getSession(readJournal(), sessionId);
      if (!session) {
        throw new Error('Session not found');
      }
      return session;
    } catch (error) {
      throw toRendererError(error, 'Failed to load session details');
    }
  });

  ipcMain.handle('update-session-details', async (event, sessionId, payload = {}) => {
    try {
      const { journal, session } = localJournal.updateSession(readJournal(), sessionId, payload, { now: new Date() });
      writeJournal(journal);
      return session;
    } catch (error) {
      throw toRendererError(error, 'Failed to update session details');
    }
  });

  ipcMain.handle('get-sessions', async (event, params = {}) => {
    const includeAllContexts = params.includeAllContexts === true;
    const requestParams = { ...params };
    delete requestParams.includeAllContexts;
    const trackerContext = includeAllContexts ? {} : getTrackerContextDefaults(requestParams);
    return localJournal.listSessions(readJournal(), {
      ...requestParams,
      ...trackerContext
    });
  });

  ipcMain.handle('get-dashboard-stats', async (event, context = {}) => {
    return localJournal.getPersonalStats(readJournal(), {
      period: 'daily',
      ...getTrackerContextDefaults(context),
      now: new Date()
    });
  });

  ipcMain.handle('get-recent-loot', async (event, params = {}) => {
    return localJournal.listRecentLoot(readJournal(), {
      limit: 8,
      ...params,
      ...getTrackerContextDefaults(params)
    });
  });

  ipcMain.handle('get-audit-trail', () => {
    if (!getActiveProfile()) {
      return { entries: [] };
    }
    return {
      entries: getAuditTrail().slice().reverse().slice(0, 20)
    };
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
      throw new Error('No active session');
    }
    try {
      const { lootEntries: [lootEntry], session } = addLootToCurrentSession([data], 'manual');
      if (mainWindow) {
        mainWindow.webContents.send('loot-added', {
          items: [lootEntry],
          totalValue: lootEntry.chaosValue * lootEntry.quantity
        });
      }
      return { lootEntry, session };
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
      const authCookie = apiClient.getToken();
      if (result?.success && persistDesktopAuthSession(authCookie)) {
        store.set('currentUserId', result?.data?.user?.id || null);
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
      const authCookie = apiClient.getToken();
      if (persistDesktopAuthSession(authCookie)) {
        store.set('currentUserId', result?.user?.id || null);
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
      return me;
    } catch (error) {
      throw toRendererError(error, 'Failed to load current user details');
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
        const authCookie = apiClient.getToken();
        if (result?.success && persistDesktopAuthSession(authCookie)) {
          store.set('currentUserId', result.data.user?.id || null);
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
        expectedState: startResponse.state || state,
        codeVerifier,
      });

      const authCookie = apiClient.getToken();
      if (result?.success && persistDesktopAuthSession(authCookie)) {
        store.set('currentUserId', result.data.user?.id || null);
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
      expectedState: startResponse.state || state,
      codeVerifier,
    });
  });

  ipcMain.handle('complete-poe-connect', async (event, data) => {
    try {
      return await apiClient.completePoeConnect(data || {});
    } catch (error) {
      throw toRendererError(error, 'Failed to complete Path of Exile linking');
    }
  });

  ipcMain.handle('get-poe-link-status', async () => {
    try {
      return await apiClient.getPoeLinkStatus();
    } catch (error) {
      throw toRendererError(error, 'Failed to get Path of Exile link status');
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
      throw toRendererError(error, 'Failed to disconnect the Path of Exile account');
    }
  });

  // ==================== STASH & PRICES ====================

  // Sync prices from poe.ninja
  ipcMain.handle('sync-prices', async (event, options = {}) => {
    try {
      assertDesktopUserAuthenticated();
      const { activeVersion: poeVersion, league } = resolveLeagueContext(options);
      const status = await priceService.ensureSynced(league, poeVersion, { full: options.full !== false, force: true });
      notifyPricesUpdated(poeVersion, league, status);
      return status;
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
    if (!getActiveProfile()) {
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

  ipcMain.handle('get-profit-currency-rates', async (event, options = {}) => {
    assertDesktopUserAuthenticated();
    return getProfitCurrencyRates(options);
  });

  // Local copies of poe.ninja item art; misses download in the background
  ipcMain.handle('resolve-cached-icons', (event, urls) => iconCache.resolveIconUrls(urls));
  ipcMain.handle('get-cached-icon', (event, url) => iconCache.ensureIconUrl(url));

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

  function normalizeBackendSnapshotForDesktop(snapshot, context = {}) {
    if (!snapshot) {
      return null;
    }

    const takenAt = snapshot.takenAt || snapshot.taken_at || snapshot.createdAt || snapshot.created_at || null;
    const timestamp = takenAt ? new Date(takenAt).getTime() : Date.now();
    const items = Array.isArray(snapshot.items) ? snapshot.items : [];
    const totalChaos = Number(snapshot.totalChaosValue ?? snapshot.total_chaos_value ?? snapshot.totalChaos ?? 0) || 0;
    const divinePrice = Number(priceService?.getChaosValue?.('Divine Orb') || 0) || 1;

    return {
      id: snapshot.id || null,
      tabs: Array.isArray(snapshot.tabs) ? snapshot.tabs : [],
      items,
      timestamp,
      league: snapshot.league || context.league,
      poeVersion: snapshot.poeVersion || snapshot.poe_version || context.poeVersion,
      totalChaos,
      totalDivine: totalChaos / divinePrice,
      divinePrice,
      source: 'backend'
    };
  }

  async function takeBackendStashSnapshot(options = {}, context = {}) {
    if (!hasOnlineAccount() || typeof apiClient.takePoeStashSnapshot !== 'function') {
      return null;
    }

    const response = await apiClient.takePoeStashSnapshot({
      league: context.league,
      poeVersion: context.poeVersion,
      tabIds: options.tabIds,
      allTabs: options.allTabs,
      label: options.label,
      // Sessions live in the local journal now, so the server cannot link the snapshot to one.
      kind: options.kind
    });

    return normalizeBackendSnapshotForDesktop(response?.snapshot || response, context);
  }

  async function takeDesktopStashSnapshot(options = {}, context = {}) {
    if (!poeApiClient.isAuthenticated()) {
      const backendSnapshot = await takeBackendStashSnapshot(options, context);
      if (backendSnapshot) {
        return backendSnapshot;
      }

      throw new Error(t('poeNotLinked'));
    }

    const snapshot = await poeApiClient.takeStashSnapshot(context.league, {
      tabIds: options.tabIds,
      allTabs: options.allTabs
    });

    // Price the items
    const priced = priceService.priceItems(snapshot.items);
    snapshot.items = priced.items;
    snapshot.totalChaos = priced.totalChaos;
    snapshot.totalDivine = priced.totalDivine;
    snapshot.divinePrice = priced.divinePrice;
    snapshot.source = 'desktop';

    return snapshot;
  }

  // Take a stash snapshot
  ipcMain.handle('take-stash-snapshot', async (event, options = {}) => {
    try {
      assertDesktopUserAuthenticated();
      const { activeVersion: poeVersion, league } = resolveLeagueContext(options);
      const snapshot = await takeDesktopStashSnapshot(options, { poeVersion, league });

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
      let report = null;
      try {
        report = stashAnalyzer.diffSnapshots(beforeId, afterId, priceService);
      } catch (error) {
        if (!isUuid(beforeId) || !isUuid(afterId) || !hasOnlineAccount()) {
          throw error;
        }

        const response = await apiClient.diffPoeStashSnapshots({
          beforeSnapshotId: beforeId,
          afterSnapshotId: afterId
        });
        report = normalizeBackendSnapshotDiffReport(response?.diff || response);
      }

      if (mainWindow) {
        mainWindow.webContents.send('profit-calculated', report);
      }

      return report;
    } catch (error) {
      throw toRendererError(error, 'Profit calculation failed');
    }
  });

  ipcMain.handle('calculate-session-profit-from-snapshots', async (event, options = {}) => {
    try {
      return await calculateSessionProfitFromPersistedSnapshots(options);
    } catch (error) {
      throw toRendererError(error, 'Persisted stash profit calculation failed');
    }
  });

  ipcMain.handle('show-map-result-overlay', async (event, result, options = {}) => {
    assertDesktopUserAuthenticated();
    // A session closed while quitting is recorded, but the overlay is about to close.
    if (app.isQuiting) {
      return null;
    }
    return showMapResultOverlay(result, options || {});
  });

  ipcMain.handle('show-start-map-prompt-overlay', async (event, prompt, options = {}) => {
    assertDesktopUserAuthenticated();
    return showStartMapPromptOverlay(prompt || {}, options || {});
  });

  ipcMain.handle('hide-start-map-prompt-overlay', async () => {
    assertDesktopUserAuthenticated();
    return hideStartMapPromptOverlay();
  });

  ipcMain.handle('confirm-start-map-prompt-overlay', async (event, payload = {}) => {
    assertDesktopUserAuthenticated();
    return confirmStartMapPromptOverlay(payload || {});
  });

  ipcMain.handle('cancel-start-map-prompt-overlay', async () => {
    assertDesktopUserAuthenticated();
    return cancelStartMapPromptOverlay();
  });

  ipcMain.handle('set-overlay-character', async (event, character) => {
    assertDesktopUserAuthenticated();
    return updateOverlayWindow({ character: normalizeOverlayCharacter(character) });
  });

  ipcMain.handle('show-character-prompt-overlay', async (event, prompt) => {
    assertDesktopUserAuthenticated();
    return showCharacterPromptOverlay(prompt || {});
  });

  ipcMain.handle('choose-character-prompt-overlay', async (event, payload) => {
    assertDesktopUserAuthenticated();
    return chooseCharacterPromptOverlay(payload || {});
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

  ipcMain.handle('save-map-result', async (event, result) => {
    assertDesktopUserAuthenticated();
    return saveMapResultHistory(result);
  });

  ipcMain.handle('get-map-results', async () => {
    assertDesktopUserAuthenticated();
    return getStoredMapResults();
  });

  ipcMain.handle('publish-map-results', async (event, input = {}) => {
    try {
      assertDesktopUserAuthenticated();
      return await publishMapResultsToFarmingHub(input);
    } catch (error) {
      throw toRendererError(error, 'Failed to publish farm run');
    }
  });

  ipcMain.handle('get-farming-hub-runs', async (event, params = {}) => {
    try {
      const runs = await apiClient.getPublicFarmRuns(params);
      return { runs };
    } catch (error) {
      throw toRendererError(error, 'Failed to load farm runs');
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
      version: normalizePoeVersion(gameDetector ? gameDetector.getDetectedGame() : null),
      lastDetectedVersion: normalizePoeVersion(store.get('lastDetectedPoeVersion')),
      settingsVersion: normalizePoeVersion(store.get('poeVersion'))
    };
  });

  ipcMain.handle('sign-in-with-poe', async () => {
    try {
      return { success: true, profile: await signInWithPoe(), error: null };
    } catch (error) {
      return { success: false, profile: null, error: normalizeErrorMessage(error, 'Path of Exile sign-in failed') };
    }
  });

  ipcMain.handle('connect-poe-device', async () => {
    assertDesktopUserAuthenticated();
    try {
      await reconnectPoeDevice();
      return { success: true, error: null };
    } catch (error) {
      return { success: false, error: normalizeErrorMessage(error, 'Path of Exile sign-in failed') };
    }
  });

  ipcMain.handle('disconnect-poe-device', async () => {
    assertDesktopUserAuthenticated();
    dropPoeDeviceConnection();
    return true;
  });

  ipcMain.handle('get-poe-device-characters', async (event, poeVersion) => {
    assertDesktopUserAuthenticated();
    return getPoeDeviceCharacters(poeVersion);
  });

  // Check if PoE API is authenticated
  ipcMain.handle('get-poe-auth-status', async () => {
    assertDesktopUserAuthenticated();
    return {
      authenticated: poeApiClient.isAuthenticated(),
      expired: poeApiClient.isTokenExpired(),
      stashAccess: poeApiClient.hasScope('account:stashes')
    };
  });

  // Logout
  ipcMain.handle('logout', handleLogout);
}

/**
 * App ready
 */
app.whenReady().then(() => {
  // Initialize the API client.
  const resolvedToken = getDecryptedAuthToken();
  apiClient = new APIClient(store.get('apiUrl'), resolvedToken, { online: isOnlineEnabled() });
  ocrScanner = new OCRScanner({ cachePath: path.join(app.getPath('userData'), 'ocr-cache') });
  poeApiClient = new PoeApiClient();
  priceService = new PriceService();
  iconCache = new IconCache({ dir: path.join(app.getPath('userData'), 'icon-cache') });
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
  poeApiClient.setTokenListener(persistPoeClientTokens);

  // Register IPC handlers before opening the window.
  setupIPC();

  createMainWindow();
  initializeAppUpdater();
  mainWindow.show(); // Show the window.
  mainWindow.focus();
  ensureOverlayWindowForSettings();

  if (appUpdateState?.enabled) {
    autoUpdater.checkForUpdates().catch(() => {});
  }

  createTray();
  scanHotkeyGateInterval = setInterval(syncScanHotkeys, SCAN_HOTKEY_GATE_INTERVAL_MS);
  setupLogParser();
  setupGameDetector();
  try {
    loadActiveSession();
  } catch {
    // Nobody is signed in yet.
  }

});

/**
 * App shutdown
 */
app.on('window-all-closed', () => {
  // On macOS the app stays open after all windows are closed.
  if (process.platform !== 'darwin') {
    // Keep the app running while the tray icon is active.
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
  // Clear global shortcuts.
  globalShortcut.unregisterAll();

  // Stop the log parser.
  if (logParser) {
    logParser.stop();
  }

  // Stop the game detector.
  if (gameDetector) {
    gameDetector.stop();
  }

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

  if (scanHotkeyGateInterval) {
    clearInterval(scanHotkeyGateInterval);
    scanHotkeyGateInterval = null;
  }
}

let isFinalizingQuitSession = false;
let didFinalizeQuitSession = false;

app.on('before-quit', (event) => {
  app.isQuiting = true;

  if (didFinalizeQuitSession || isFinalizingQuitSession) {
    return;
  }

  event.preventDefault();
  isFinalizingQuitSession = true;

  finalizeActiveSessionOnShutdown()
    .catch((error) => {
      console.warn('Failed to finalize active session before quit', error);
    })
    .finally(() => {
      didFinalizeQuitSession = true;
      isFinalizingQuitSession = false;
      app.quit();
    });
});

app.on('will-quit', handleAppWillQuit);
