/**
 * Juice Journal - Desktop App JavaScript
 * Renderer process logic
 */

// Global app state for i18n
window._appState = { language: 'en' };

// Durum yonetimi
const state = {
  currentUser: null,
  currentSession: null,
  settings: {},
  detectedGameVersion: null,
  activeLeagueOptions: {},
  leagueOptionsLoaded: false,
  sessions: [],
  recentLoot: [],
  poeLink: null,
  account: null,
  runtimeSession: null,
  overlay: null,
  capabilities: null,
  selectedSession: null,
  pendingLootCount: 0,
  pendingSyncEntries: [],
  auditTrail: []
};

const ERROR_MESSAGE_KEY_MAP = {
  FORBIDDEN: 'errors.forbidden',
  PRICE_SYNC_IN_PROGRESS: 'errors.priceSyncInProgress',
  PRICE_SYNC_COOLDOWN: 'errors.priceSyncCooldown',
  SESSION_NOT_FOUND: 'errors.sessionNotFound',
  ACTIVE_SESSION_NOT_FOUND: 'errors.activeSessionNotFound',
  SESSION_ALREADY_ACTIVE: 'errors.sessionStart',
  SESSION_START_FAILED: 'errors.sessionStart',
  SESSION_END_FAILED: 'errors.sessionEnd',
  SESSION_LIST_LOAD_FAILED: 'errors.sessionListLoad',
  SESSION_LOAD_FAILED: 'errors.sessionLoad',
  SESSION_UPDATE_FAILED: 'errors.sessionUpdate',
  LOOT_NOT_FOUND: 'errors.lootAdd',
  LOOT_ADD_FAILED: 'errors.lootAdd',
  LOOT_BULK_ADD_FAILED: 'errors.lootAdd',
  RECENT_LOOT_LOAD_FAILED: 'errors.lootRecent',
  STATS_PERSONAL_LOAD_FAILED: 'errors.unexpected',
  STATS_LEADERBOARD_LOAD_FAILED: 'errors.unexpected',
  STATS_SUMMARY_LOAD_FAILED: 'errors.unexpected',
  'Kullanici adi veya sifre hatali': 'errors.invalidCredentials',
  'Invalid username or password': 'errors.invalidCredentials',
  'Kullanici adi veya e-posta gereklidir': 'errors.usernameOrEmailRequired',
  'Username or email is required': 'errors.usernameOrEmailRequired',
  'Sifre gereklidir': 'errors.passwordRequired',
  'Password is required': 'errors.passwordRequired',
  'Kullanici adi 3-50 karakter arasinda olmalidir': 'errors.usernameLength',
  'Username must be between 3 and 50 characters': 'errors.usernameLength',
  'Kullanici adi sadece harf ve rakam icerebilir': 'errors.usernameAlphanumeric',
  'Username may only contain letters and numbers': 'errors.usernameAlphanumeric',
  'Gecerli bir e-posta adresi giriniz': 'errors.emailInvalid',
  'Enter a valid email address': 'errors.emailInvalid',
  'Sifre en az 6 karakter olmalidir': 'errors.passwordMinLength',
  'Password must be at least 6 characters': 'errors.passwordMinLength',
  'Bu kullanici adi zaten kullaniliyor': 'errors.usernameTaken',
  'That username is already in use': 'errors.usernameTaken',
  'Bu e-posta adresi zaten kullaniliyor': 'errors.emailTaken',
  'That email address is already in use': 'errors.emailTaken',
  'Kayit sirasinda bir hata olustu': 'errors.registerFailed',
  'An error occurred during registration': 'errors.registerFailed',
  'Giris sirasinda bir hata olustu': 'errors.loginFailed',
  'An error occurred during sign in': 'errors.loginFailed',
  'Profil bilgileri alinirken hata olustu': 'errors.profileLoad',
  'Failed to load profile details': 'errors.profileLoad',
  'Profil guncellenirken hata olustu': 'errors.profileUpdate',
  'Failed to update profile': 'errors.profileUpdate',
  'Session bulunamadi': 'errors.sessionNotFound',
  'Session not found': 'errors.sessionNotFound',
  'Aktif session bulunamadi': 'errors.activeSessionNotFound',
  'Active session not found': 'errors.activeSessionNotFound',
  'Session detaylari alinamadi': 'errors.sessionLoad',
  'Failed to load session details': 'errors.sessionLoad',
  'Session listesi yuklenemedi': 'errors.sessionListLoad',
  'Failed to load sessions': 'errors.sessionListLoad',
  'Session detaylari guncellenemedi': 'errors.sessionUpdate',
  'Failed to update session details': 'errors.sessionUpdate',
  'Session baslatilamadi': 'errors.sessionStart',
  'Failed to start the session': 'errors.sessionStart',
  'Session bitirilemedi': 'errors.sessionEnd',
  'Failed to end the session': 'errors.sessionEnd',
  'Aktif session yok': 'errors.noActiveSession',
  'No active session': 'errors.noActiveSession',
  'Loot eklenemedi': 'errors.lootAdd',
  'Failed to add loot': 'errors.lootAdd',
  'Son loot verileri alinamadi': 'errors.lootRecent',
  'Failed to load recent loot': 'errors.lootRecent',
  'Path of Exile OAuth is not configured': 'errors.poeOAuthNotConfigured',
  'Path of Exile OAuth yapilandirilmamis': 'errors.poeOAuthNotConfigured',
  'Invalid redirect URI': 'errors.invalidRedirectUri',
  'Gecersiz yonlendirme adresi': 'errors.invalidRedirectUri',
  'Authorization code and PKCE verifier are required': 'errors.authorizationCodeRequired',
  'Yetkilendirme kodu ve PKCE verifier gereklidir': 'errors.authorizationCodeRequired',
  'Failed to start Path of Exile linking': 'errors.poeStart',
  'Path of Exile baglantisi baslatilamadi': 'errors.poeStart',
  'Failed to complete Path of Exile linking': 'errors.poeComplete',
  'Path of Exile baglantisi tamamlanamadi': 'errors.poeComplete',
  'Failed to get Path of Exile link status': 'errors.poeStatus',
  'Path of Exile baglanti durumu alinamadi': 'errors.poeStatus',
  'Failed to disconnect Path of Exile account': 'errors.poeDisconnect',
  'Path of Exile baglantisi kaldirilamadi': 'errors.poeDisconnect',
  'Unable to reach the server': 'errors.serverUnavailable',
  'Sunucuya ulasilamadi': 'errors.serverUnavailable',
  'The request timed out': 'errors.requestTimeout',
  'Sunucu yanit vermekte gecikti': 'errors.requestTimeout',
  'An unexpected error occurred': 'errors.unexpected',
  'Beklenmeyen bir hata olustu': 'errors.unexpected',
  'Unauthorized request': 'errors.loginFailed'
};

let sessionClockInterval = null;

// DOM Elementleri
const elements = {
  // Modals
  loginModal: document.getElementById('login-modal'),
  registerModal: document.getElementById('register-modal'),

  // Forms
  loginForm: document.getElementById('login-form'),
  registerForm: document.getElementById('register-form'),

  // Navigation
  navButtons: document.querySelectorAll('.nav-btn'),
  pages: document.querySelectorAll('.page'),

  // Dashboard
  characterSummaryCard: document.getElementById('character-summary-card'),
  characterPortrait: document.getElementById('character-portrait'),
  characterPortraitImage: document.getElementById('character-portrait-image'),
  characterPortraitBadge: document.getElementById('character-portrait-badge'),
  characterName: document.getElementById('character-name'),
  characterClass: document.getElementById('character-class'),
  characterLevel: document.getElementById('character-level'),
  characterLeague: document.getElementById('character-league'),
  characterAccount: document.getElementById('character-account'),
  characterStatus: document.getElementById('character-status'),
  characterGameVersion: document.getElementById('character-game-version'),
  activeSession: document.getElementById('active-session'),
  startSessionBtn: document.getElementById('start-session-btn'),
  endSessionBtn: document.getElementById('end-session-btn'),
  scanScreenBtn: document.getElementById('scan-screen-btn'),
  todaySessions: document.getElementById('today-sessions'),
  todayProfit: document.getElementById('today-profit'),
  todayAvg: document.getElementById('today-avg'),
  recentLootList: document.getElementById('recent-loot-list'),

  // Sessions
  sessionsList: document.getElementById('sessions-list'),
  sessionFilter: document.getElementById('session-filter'),
  sessionDrawer: document.getElementById('session-detail-drawer'),
  sessionDrawerBackdrop: document.getElementById('session-drawer-backdrop'),
  sessionDrawerClose: document.getElementById('session-drawer-close'),
  sessionDrawerTitle: document.getElementById('session-drawer-title'),
  sessionDrawerSummary: document.getElementById('session-drawer-summary'),
  sessionDrawerStrategy: document.getElementById('session-drawer-strategy'),
  strategyPresetsList: document.getElementById('strategy-presets'),
  sessionDrawerNotes: document.getElementById('session-drawer-notes'),
  sessionDrawerSave: document.getElementById('session-drawer-save'),
  sessionDrawerAnalytics: document.getElementById('session-drawer-analytics'),
  sessionDrawerLoot: document.getElementById('session-drawer-loot'),
  sessionDrawerLootCount: document.getElementById('session-drawer-loot-count'),

  // Settings
  apiUrl: document.getElementById('api-url'),
  poePath: document.getElementById('poe-path'),
  autoStartSession: document.getElementById('auto-start-session'),
  enableNotifications: document.getElementById('enable-notifications'),
  soundNotifications: document.getElementById('sound-notifications'),
  defaultLeague: document.getElementById('default-league'),
  defaultLeagueSelect: document.getElementById('default-league-select'),
  activeLeagueContext: document.getElementById('active-league-context'),
  scanHotkey: document.getElementById('scan-hotkey'),
  scanHotkeyDisplay: document.getElementById('scan-hotkey-display'),
  stashScanHotkey: document.getElementById('stash-scan-hotkey'),
  stashScanHotkeyDisplay: document.getElementById('stash-scan-hotkey-display'),
  testConnection: document.getElementById('test-connection'),
  connectionDot: document.getElementById('connection-dot'),
  connectionText: document.getElementById('connection-text'),
  pendingSyncCount: document.getElementById('pending-sync-count'),
  pendingSyncMeta: document.getElementById('pending-sync-meta'),
  pendingSyncList: document.getElementById('pending-sync-list'),
  auditTrailList: document.getElementById('audit-trail-list'),
  retryPendingSyncBtn: document.getElementById('retry-pending-sync'),
  diagnosticsMode: document.getElementById('diagnostics-mode'),
  exportDiagnosticsBtn: document.getElementById('export-diagnostics'),
  saveSettingsBtn: document.getElementById('save-settings'),
  resetSettingsBtn: document.getElementById('reset-settings'),
  settingsNavBtns: document.querySelectorAll('.settings-nav-btn'),
  settingsTabs: document.querySelectorAll('.settings-tab'),
  globalLanguage: document.getElementById('global-language'),
  versionBtns: document.querySelectorAll('.version-btn'),
  poeLinkStatus: document.getElementById('poe-link-status'),
  poeAccountName: document.getElementById('poe-account-name'),
  poeLinkMode: document.getElementById('poe-link-mode'),
  poeConnectBtn: document.getElementById('poe-connect-btn'),
  poeDisconnectBtn: document.getElementById('poe-disconnect-btn'),

  // User
  username: document.getElementById('username'),
  userAvatar: document.getElementById('user-avatar'),
  logoutBtn: document.getElementById('logout-btn'),
  sessionBadge: document.getElementById('session-badge'),

  // Toast
  toastContainer: document.getElementById('toast-container'),

  // Stash Profit Tracker
  stashTrackerCard: document.getElementById('stash-tracker-card'),
  stashCapabilityUnavailable: document.getElementById('stash-capability-unavailable'),
  syncPricesBtn: document.getElementById('sync-prices-btn'),
  priceItemCount: document.getElementById('price-item-count'),
  takeBeforeSnapshotBtn: document.getElementById('take-before-snapshot-btn'),
  takeAfterSnapshotBtn: document.getElementById('take-after-snapshot-btn'),
  calculateProfitBtn: document.getElementById('calculate-profit-btn'),
  resetSnapshotsBtn: document.getElementById('reset-snapshots-btn'),
  beforeSnapshotInfo: document.getElementById('before-snapshot-info'),
  afterSnapshotInfo: document.getElementById('after-snapshot-info'),
  stashTrackerStatus: document.getElementById('stash-tracker-status'),
  stashProfitResult: document.getElementById('stash-profit-result'),
  profitChaosValue: document.getElementById('profit-chaos-value'),
  profitDivineValue: document.getElementById('profit-divine-value'),
  profitGainedValue: document.getElementById('profit-gained-value'),
  profitLostValue: document.getElementById('profit-lost-value'),
  profitItemsList: document.getElementById('profit-items-list'),
  snapshotStepBefore: document.getElementById('snapshot-step-before'),
  snapshotStepAfter: document.getElementById('snapshot-step-after')
};

const activeLeagueInputState = {
  dirty: false,
  version: null
};

let settingsModelPromise = null;
let accountStateModelPromise = null;
let runtimeSessionModelPromise = null;
let capabilityModelPromise = null;
let overlayStateModelPromise = null;
let characterVisualModelPromise = null;

function ensureSettingsModelLoaded() {
  if (window.settingsModel) {
    return Promise.resolve(window.settingsModel);
  }

  if (settingsModelPromise) {
    return settingsModelPromise;
  }

  settingsModelPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'modules/settingsModel.js';
    script.async = true;
    script.onload = () => {
      if (window.settingsModel) {
        resolve(window.settingsModel);
        return;
      }

      reject(new Error('settingsModel loaded without exposing window.settingsModel'));
    };
    script.onerror = () => reject(new Error('Failed to load settings model script'));
    document.head.appendChild(script);
  });

  return settingsModelPromise;
}

function ensureAccountStateModelLoaded() {
  if (window.accountStateModel) {
    return Promise.resolve(window.accountStateModel);
  }

  if (accountStateModelPromise) {
    return accountStateModelPromise;
  }

  accountStateModelPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'modules/accountStateModel.js';
    script.async = true;
    script.onload = () => {
      if (window.accountStateModel) {
        resolve(window.accountStateModel);
        return;
      }

      reject(new Error('accountStateModel loaded without exposing window.accountStateModel'));
    };
    script.onerror = () => reject(new Error('Failed to load account state model script'));
    document.head.appendChild(script);
  });

  return accountStateModelPromise;
}

function ensureRuntimeSessionModelLoaded() {
  if (window.runtimeSessionModel) {
    return Promise.resolve(window.runtimeSessionModel);
  }

  if (runtimeSessionModelPromise) {
    return runtimeSessionModelPromise;
  }

  runtimeSessionModelPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'modules/runtimeSessionModel.js';
    script.async = true;
    script.onload = () => {
      if (window.runtimeSessionModel) {
        resolve(window.runtimeSessionModel);
        return;
      }

      reject(new Error('runtimeSessionModel loaded without exposing window.runtimeSessionModel'));
    };
    script.onerror = () => reject(new Error('Failed to load runtime session model script'));
    document.head.appendChild(script);
  });

  return runtimeSessionModelPromise;
}

function ensureCapabilityModelLoaded() {
  if (window.capabilityModel) {
    return Promise.resolve(window.capabilityModel);
  }

  if (capabilityModelPromise) {
    return capabilityModelPromise;
  }

  capabilityModelPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'modules/capabilityModel.js';
    script.async = true;
    script.onload = () => {
      if (window.capabilityModel) {
        resolve(window.capabilityModel);
        return;
      }

      reject(new Error('capabilityModel loaded without exposing window.capabilityModel'));
    };
    script.onerror = () => reject(new Error('Failed to load capability model script'));
    document.head.appendChild(script);
  });

  return capabilityModelPromise;
}

function ensureOverlayStateModelLoaded() {
  if (window.overlayStateModel) {
    return Promise.resolve(window.overlayStateModel);
  }

  if (overlayStateModelPromise) {
    return overlayStateModelPromise;
  }

  overlayStateModelPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'modules/overlayStateModel.js';
    script.async = true;
    script.onload = () => {
      if (window.overlayStateModel) {
        resolve(window.overlayStateModel);
        return;
      }

      reject(new Error('overlayStateModel loaded without exposing window.overlayStateModel'));
    };
    script.onerror = () => reject(new Error('Failed to load overlay state model script'));
    document.head.appendChild(script);
  });

  return overlayStateModelPromise;
}

function ensureCharacterVisualModelLoaded() {
  if (window.characterVisualModel) {
    return Promise.resolve(window.characterVisualModel);
  }

  if (characterVisualModelPromise) {
    return characterVisualModelPromise;
  }

  characterVisualModelPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'modules/characterVisualModel.js';
    script.async = true;
    script.onload = () => {
      if (window.characterVisualModel) {
        resolve(window.characterVisualModel);
        return;
      }

      reject(new Error('characterVisualModel loaded without exposing window.characterVisualModel'));
    };
    script.onerror = () => reject(new Error('Failed to load character visual model script'));
    document.head.appendChild(script);
  });

  return characterVisualModelPromise;
}

function getSettingsModel() {
  if (!window.settingsModel) {
    throw new Error('settingsModel is not loaded');
  }

  return window.settingsModel;
}

function getAccountStateModel() {
  if (!window.accountStateModel) {
    throw new Error('accountStateModel is not loaded');
  }

  return window.accountStateModel;
}

function getRuntimeSessionModel() {
  if (!window.runtimeSessionModel) {
    throw new Error('runtimeSessionModel is not loaded');
  }

  return window.runtimeSessionModel;
}

function getCapabilityModel() {
  if (!window.capabilityModel) {
    throw new Error('capabilityModel is not loaded');
  }

  return window.capabilityModel;
}

function getOverlayStateModel() {
  if (!window.overlayStateModel) {
    throw new Error('overlayStateModel is not loaded');
  }

  return window.overlayStateModel;
}

function getCharacterVisualModel() {
  if (!window.characterVisualModel) {
    throw new Error('characterVisualModel is not loaded');
  }

  return window.characterVisualModel;
}

function getHotkeyModel() {
  if (!window.hotkeyModel) {
    throw new Error('hotkeyModel is not loaded');
  }

  return window.hotkeyModel;
}

function getDefaultHotkeySettings() {
  const {
    DEFAULT_SCAN_HOTKEY,
    DEFAULT_STASH_SCAN_HOTKEY
  } = getHotkeyModel();

  return {
    scanHotkey: DEFAULT_SCAN_HOTKEY,
    stashScanHotkey: DEFAULT_STASH_SCAN_HOTKEY
  };
}

function getCompleteHotkeySettings(settingsDraft = {}) {
  const defaults = getDefaultHotkeySettings();
  const { validateHotkeys } = getHotkeyModel();

  try {
    return {
      ...settingsDraft,
      ...validateHotkeys({
        scanHotkey: settingsDraft.scanHotkey || defaults.scanHotkey,
        stashScanHotkey: settingsDraft.stashScanHotkey || defaults.stashScanHotkey
      })
    };
  } catch {
    return {
      ...settingsDraft,
      ...defaults
    };
  }
}

function getHotkeyDisplayPlatform() {
  if (typeof navigator !== 'undefined' && typeof navigator.platform === 'string' && navigator.platform) {
    return navigator.platform;
  }

  return 'win32';
}

function syncHotkeyFieldDisplay(inputElement, displayElement) {
  if (!inputElement || !displayElement) {
    return;
  }

  const { formatAcceleratorForDisplay } = getHotkeyModel();
  const rawValue = String(inputElement.value || '').trim();

  if (!rawValue) {
    inputElement.value = '';
    displayElement.textContent = '-';
    return;
  }

  try {
    const formattedValue = formatAcceleratorForDisplay(rawValue, {
      platform: getHotkeyDisplayPlatform()
    });
    inputElement.value = formattedValue;
    displayElement.textContent = formattedValue;
  } catch {
    displayElement.textContent = rawValue;
  }
}

function syncHotkeyDisplays() {
  syncHotkeyFieldDisplay(elements.scanHotkey, elements.scanHotkeyDisplay);
  syncHotkeyFieldDisplay(elements.stashScanHotkey, elements.stashScanHotkeyDisplay);
}

function normalizePoeVersion(version) {
  return version === 'poe1' || version === 'poe2' ? version : null;
}

function applySettingsVersionSelection(version) {
  const normalizedVersion = normalizePoeVersion(version) || 'poe1';
  state.settings.poeVersion = normalizedVersion;
  elements.versionBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.version === normalizedVersion);
  });
  return normalizedVersion;
}

function getSelectedSettingsVersion() {
  return normalizePoeVersion(document.querySelector('.version-btn.active')?.dataset.version)
    || normalizePoeVersion(state.settings.poeVersion);
}

function getSettingsLeagueVersion() {
  return getSelectedSettingsVersion() || 'poe1';
}

function getLeagueValueForVersion(version = getResolvedLeagueVersion()) {
  return getLeagueFieldStateForVersion(version).value;
}

function getResolvedLeagueVersion() {
  return normalizePoeVersion(state.detectedGameVersion)
    || getSelectedSettingsVersion()
    || 'poe1';
}

function getLeagueSettingKey(version = getResolvedLeagueVersion()) {
  return version === 'poe2' ? 'defaultLeaguePoe2' : 'defaultLeaguePoe1';
}

function getResolvedActiveLeague() {
  return getLeagueValueForVersion(getResolvedLeagueVersion());
}

function getDisplayedActiveLeague() {
  return getLeagueValueForVersion(getSettingsLeagueVersion());
}

function getStoredLeagueValueForVersion(version = getSettingsLeagueVersion()) {
  const leagueKey = getLeagueSettingKey(version);
  const storedLeague = state.settings[leagueKey];
  const legacyLeague = typeof state.settings.defaultLeague === 'string'
    ? state.settings.defaultLeague.trim()
    : '';

  return String(storedLeague ?? legacyLeague ?? '').trim();
}

function getLeagueFieldStateForVersion(version = getSettingsLeagueVersion()) {
  const { deriveLeagueFieldState } = getSettingsModel();

  return deriveLeagueFieldState({
    settingsVersion: version,
    storedLeague: getStoredLeagueValueForVersion(version),
    activeLeagues: state.activeLeagueOptions?.[version] || [],
    apiReachable: state.leagueOptionsLoaded
  });
}

function getActiveLeagueControlType(preferredControlType = null) {
  if (preferredControlType === 'select' && elements.defaultLeagueSelect) {
    return 'select';
  }

  return 'input';
}

function getActiveLeagueFieldElement(preferredControlType = null) {
  const controlType = getActiveLeagueControlType(preferredControlType);

  if (controlType === 'select') {
    return elements.defaultLeagueSelect;
  }

  return elements.defaultLeague;
}

function getActiveLeagueFieldValue(preferredControlType = null) {
  const controlType = preferredControlType
    || (elements.defaultLeagueSelect && !elements.defaultLeagueSelect.hidden ? 'select' : 'input');
  const fieldElement = getActiveLeagueFieldElement(controlType);
  const rawValue = typeof fieldElement?.value === 'string' ? fieldElement.value.trim() : '';

  return rawValue || 'Standard';
}

function setActiveLeagueFieldValue(leagueValue) {
  const normalizedLeagueValue = String(leagueValue ?? '').trim() || 'Standard';

  if (elements.defaultLeague) {
    elements.defaultLeague.value = normalizedLeagueValue;
  }

  if (elements.defaultLeagueSelect) {
    elements.defaultLeagueSelect.value = normalizedLeagueValue;
  }
}

function extractUsableActiveLeagues(activeLeagueEntries) {
  if (!Array.isArray(activeLeagueEntries)) {
    return [];
  }

  const usableLeagues = [];

  activeLeagueEntries.forEach((entry) => {
    if (typeof entry === 'string') {
      const leagueName = entry.trim();
      if (leagueName) {
        usableLeagues.push(leagueName);
      }
      return;
    }

    if (!entry || typeof entry !== 'object') {
      return;
    }

    const status = typeof entry.status === 'string'
      ? entry.status.trim().toLowerCase()
      : '';
    const isExplicitlyInactive = entry.active === false
      || entry.isActive === false
      || entry.current === false
      || entry.isCurrent === false
      || status === 'inactive';

    if (isExplicitlyInactive) {
      return;
    }

    const displayName = String(entry.displayName ?? '').trim();
    const fallbackName = String(entry.name ?? '').trim();
    const preferredLabel = displayName || fallbackName;
    if (preferredLabel) {
      usableLeagues.push(preferredLabel);
    }
  });

  return Array.from(new Set(usableLeagues));
}

function refreshActiveLeagueDirtyState() {
  if (!elements.defaultLeague && !elements.defaultLeagueSelect) {
    activeLeagueInputState.dirty = false;
    activeLeagueInputState.version = null;
    return;
  }

  const settingsVersion = getSettingsLeagueVersion();
  const currentValue = getActiveLeagueFieldValue();
  activeLeagueInputState.dirty = currentValue !== getLeagueFieldStateForVersion(settingsVersion).value;
  activeLeagueInputState.version = settingsVersion;
}

function updateActiveLeagueFieldContext(options = {}) {
  const { syncValue = false, forceValueSync = false } = options;
  const uiVersion = getSettingsLeagueVersion();
  const leagueFieldState = getLeagueFieldStateForVersion(uiVersion);
  const placeholderKey = uiVersion === 'poe2'
    ? 'settings.leaguePlaceholderPoe2'
    : (uiVersion === 'poe1' ? 'settings.leaguePlaceholderPoe1' : 'settings.leaguePlaceholder');
  const gameLabel = uiVersion === 'poe2'
    ? window.t('settings.leagueContextPoe2')
    : (uiVersion === 'poe1'
      ? window.t('settings.leagueContextPoe1')
      : `${window.t('settings.leagueContextPoe1')} / ${window.t('settings.leagueContextPoe2')}`);
  const syncedLeagueValue = leagueFieldState.value;
  const gameKey = uiVersion === 'poe2'
    ? 'settings.leagueContextPoe2'
    : 'settings.leagueContextPoe1';
  const controlType = getActiveLeagueControlType(leagueFieldState.controlType);
  const currentDraftValue = getActiveLeagueFieldValue(controlType);
  const canPreserveDraft = activeLeagueInputState.dirty && activeLeagueInputState.version === uiVersion;
  const nextLeagueValue = canPreserveDraft ? currentDraftValue : syncedLeagueValue;

  if (elements.defaultLeague) {
    elements.defaultLeague.placeholder = window.t(placeholderKey);
    elements.defaultLeague.hidden = controlType !== 'input';
    elements.defaultLeague.disabled = controlType !== 'input';
  }

  if (elements.defaultLeagueSelect) {
    elements.defaultLeagueSelect.hidden = controlType !== 'select';
    elements.defaultLeagueSelect.disabled = controlType !== 'select';
    if (controlType === 'select') {
      elements.defaultLeagueSelect.innerHTML = leagueFieldState.options
        .map((option) => `<option value="${escapeHTML(option)}">${escapeHTML(option)}</option>`)
        .join('');
    }
  }

  if (syncValue && (forceValueSync || !canPreserveDraft)) {
    setActiveLeagueFieldValue(nextLeagueValue);
    activeLeagueInputState.dirty = false;
    activeLeagueInputState.version = uiVersion;
  } else if (controlType === 'select' && elements.defaultLeagueSelect) {
    elements.defaultLeagueSelect.value = leagueFieldState.options.includes(nextLeagueValue)
      ? nextLeagueValue
      : syncedLeagueValue;
  }

  if (elements.activeLeagueContext) {
    elements.activeLeagueContext.textContent = window.t('settings.leagueContextHint', {
      game: uiVersion ? window.t(gameKey) : gameLabel
    });
  }
}

function syncRendererGameContext(version, options = {}) {
  const normalizedDetectedVersion = normalizePoeVersion(version);
  const normalizedSettingsVersion = normalizePoeVersion(options.settingsVersion)
    || normalizePoeVersion(state.settings.poeVersion);
  const normalizedLastDetectedVersion = normalizePoeVersion(options.lastDetectedVersion)
    || normalizedDetectedVersion
    || normalizePoeVersion(state.settings.lastDetectedPoeVersion);

  state.detectedGameVersion = normalizedDetectedVersion;
  state.settings.lastDetectedPoeVersion = normalizedLastDetectedVersion;

  if (normalizedSettingsVersion) {
    state.settings.poeVersion = normalizedSettingsVersion;
    elements.versionBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.version === normalizedSettingsVersion);
    });
    syncDesktopCurrencyIcons();
    void loadSettingsLeagueOptions(normalizedSettingsVersion);
  }

  if (options.logPath) {
    state.settings.poePath = options.logPath;
  }

  updateGameStatusIndicator(normalizedDetectedVersion);
  updateActiveLeagueFieldContext({ syncValue: true });
  if (typeof applyDashboardCapabilities === 'function') {
    applyDashboardCapabilities();
  }
}

function getResolvedCapabilityGameVersion(preferredVersion = null) {
  return normalizePoeVersion(state.detectedGameVersion)
    || normalizePoeVersion(preferredVersion)
    || normalizePoeVersion(state.settings?.poeVersion)
    || 'poe1';
}

function getStashCapabilityUnavailableKey(reason, poeVersion) {
  if (reason === 'poe2_not_supported_yet' || poeVersion === 'poe2') {
    return 'stash.capabilityUnavailable.poe2';
  }

  return 'stash.capabilityUnavailable.generic';
}

function getStashCapabilityUnavailableText(reason, poeVersion) {
  const translationKey = getStashCapabilityUnavailableKey(reason, poeVersion);
  return typeof window !== 'undefined' && typeof window.t === 'function'
    ? window.t(translationKey)
    : translationKey;
}

function applyDashboardCapabilities(version = null) {
  const capabilityVersion = getResolvedCapabilityGameVersion(version);
  const capabilities = getCapabilityModel().getCapabilitiesForGame(capabilityVersion);
  const stashCapability = capabilities.stashTracking || { enabled: true, reason: null };
  const stashUnavailable = !stashCapability.enabled;
  const unavailableText = stashUnavailable
    ? getStashCapabilityUnavailableText(stashCapability.reason, capabilityVersion)
    : '';

  state.capabilities = capabilities;

  if (elements.stashTrackerCard) {
    elements.stashTrackerCard.dataset.stashCapability = stashUnavailable ? 'unavailable' : 'enabled';
    elements.stashTrackerCard.classList.toggle('capability-unavailable', stashUnavailable);
  }

  if (elements.stashCapabilityUnavailable) {
    elements.stashCapabilityUnavailable.hidden = !stashUnavailable;
    elements.stashCapabilityUnavailable.textContent = unavailableText;
    if (elements.stashCapabilityUnavailable.classList) {
      elements.stashCapabilityUnavailable.classList.toggle('hidden', !stashUnavailable);
    }
  }

  if (stashUnavailable) {
    [
      elements.syncPricesBtn,
      elements.takeBeforeSnapshotBtn,
      elements.takeAfterSnapshotBtn,
      elements.calculateProfitBtn,
      elements.resetSnapshotsBtn
    ].forEach((button) => {
      if (button) {
        button.disabled = true;
      }
    });
    if (elements.stashProfitResult?.classList) {
      elements.stashProfitResult.classList.add('hidden');
    }
  } else {
    if (elements.syncPricesBtn) {
      elements.syncPricesBtn.disabled = false;
    }
    if (elements.takeBeforeSnapshotBtn) {
      elements.takeBeforeSnapshotBtn.disabled = false;
    }
    if (elements.takeAfterSnapshotBtn) {
      const hasBeforeSnapshot = typeof stashState !== 'undefined' && Boolean(stashState.beforeSnapshotId);
      elements.takeAfterSnapshotBtn.disabled = !hasBeforeSnapshot;
    }
    if (elements.calculateProfitBtn) {
      elements.calculateProfitBtn.disabled = false;
    }
    if (elements.resetSnapshotsBtn) {
      elements.resetSnapshotsBtn.disabled = false;
    }
  }

  if (elements.stashTrackerStatus && stashUnavailable) {
    elements.stashTrackerStatus.textContent = unavailableText;
    elements.stashTrackerStatus.style.color = '';
  }

  if (!stashUnavailable) {
    updateStashTrackerStatus();
  }

  return capabilities;
}

function isStashTrackingEnabled() {
  const capabilities = state.capabilities || applyDashboardCapabilities();
  return capabilities.stashTracking?.enabled !== false;
}

function isStashTrackingUnavailable() {
  return state.capabilities?.stashTracking?.enabled === false;
}

function getCurrentStashUnavailableText() {
  return getStashCapabilityUnavailableText(
    state.capabilities?.stashTracking?.reason,
    getResolvedCapabilityGameVersion()
  );
}

function showStashUnavailableToast() {
  showToast(window.t('toast.error'), getCurrentStashUnavailableText(), 'warning');
}

function renderRuntimeSessionState() {
  refreshRendererOverlayState();
}

function refreshRendererOverlayState() {
  if (!window.overlayStateModel) {
    return null;
  }

  const { deriveOverlayState } = getOverlayStateModel();
  state.overlay = deriveOverlayState({
    enabled: state.settings?.overlayEnabled === true,
    character: state.account,
    runtime: state.runtimeSession
  });

  return state.overlay;
}

function setRuntimeSessionState(runtimeSession) {
  state.runtimeSession = runtimeSession || null;
  renderRuntimeSessionState();
}

function renderCharacterSummaryCard() {
  if (!elements.characterSummaryCard) {
    return;
  }

  const account = state.account || null;
  const summary = account?.summary || { status: 'no_character_selected' };
  const isReady = summary.status === 'ready';
  const visual = isReady
    ? getCharacterVisualModel().deriveCharacterVisual(summary)
    : getCharacterVisualModel().deriveCharacterVisual({});

  elements.characterSummaryCard.dataset.characterState = isReady ? 'ready' : 'empty';

  if (elements.characterPortrait) {
    elements.characterPortrait.dataset.characterPortrait = visual.portraitKey;
    elements.characterPortrait.dataset.characterTone = visual.tone;
  }
  if (elements.characterPortraitImage) {
    elements.characterPortraitImage.hidden = !visual.portraitPath;
    elements.characterPortraitImage.src = visual.portraitPath || '';
    elements.characterPortraitImage.alt = isReady ? `${summary.name} portrait` : 'Character portrait';
  }
  if (elements.characterPortraitBadge) {
    elements.characterPortraitBadge.textContent = visual.badgeText;
    if (elements.characterPortraitBadge.style) {
      elements.characterPortraitBadge.style.display = visual.portraitPath ? 'none' : '';
    }
  }
  if (elements.characterName) {
    elements.characterName.textContent = isReady ? summary.name : 'No character selected';
  }
  if (elements.characterClass) {
    elements.characterClass.textContent = isReady ? visual.classLabel : 'Unknown Class';
  }
  if (elements.characterLevel) {
    elements.characterLevel.textContent = isReady && summary.level ? String(summary.level) : '—';
  }
  if (elements.characterLeague) {
    elements.characterLeague.textContent = isReady ? (summary.league || 'Unknown League') : '—';
  }
  if (elements.characterAccount) {
    elements.characterAccount.textContent = account?.accountName || state.currentUser?.username || '—';
  }
  if (elements.characterStatus) {
    elements.characterStatus.textContent = isReady ? 'Synced from Path of Exile' : 'Character sync needed';
  }
  if (elements.characterGameVersion) {
    const version = normalizePoeVersion(state.detectedGameVersion)
      || normalizePoeVersion(state.settings?.poeVersion)
      || 'poe1';
    elements.characterGameVersion.textContent = version === 'poe2' ? 'PoE 2' : 'PoE 1';
  }
}

/**
 * Uygulamayi baslat
 */
async function init() {
  await ensureSettingsModelLoaded();
  await ensureAccountStateModelLoaded();
  await ensureRuntimeSessionModelLoaded();
  await ensureCapabilityModelLoaded();
  await ensureOverlayStateModelLoaded();
  await ensureCharacterVisualModelLoaded();
  populateLanguageOptions();

  // Ayarlari yukle
  await loadSettings();
  populateStrategyPresets();

  // Set language from settings and apply translations
  window._appState.language = state.settings.language || 'en';
  applyLocalizedChrome();
  if (typeof renderCharacterSummaryCard === 'function') {
    renderCharacterSummaryCard();
  }
  updateActiveLeagueFieldContext();
  syncDesktopCurrencyIcons();
  applyDashboardCapabilities();

  // Event listener'lari kur
  setupEventListeners();
  setupCurrencyListeners();
  setupIPCListeners();

  // Mevcut kullaniciyi kontrol et
  const hasToken = await window.electronAPI.hasAuthToken();
  if (hasToken) {
    try {
      const me = await window.electronAPI.getCurrentUser();
      if (me?.user) {
        setCurrentUser({
          ...me.user,
          capabilities: me.capabilities || {}
        });
        await loadPoeLinkStatus();
      }
    } catch (error) {
      showLoginModal();
    }
  } else {
    showLoginModal();
  }

  // Aktif session ve dashboard verilerini senkronize et
  await refreshTrackerData();
  await loadPendingLootState();
  await loadAuditTrailState();
  renderPendingSyncState();
  renderAuditTrail();
  loadPriceStatus();
  checkInitialGameStatus();

}

function populateLanguageOptions() {
  if (!elements.globalLanguage || typeof window.getSupportedLocales !== 'function') {
    return;
  }

  const locales = window.getSupportedLocales();
  elements.globalLanguage.innerHTML = locales
    .map((locale) => `<option value="${locale.code}">${locale.label}</option>`)
    .join('');
}

async function loadSettingsLeagueOptions(version = getSettingsLeagueVersion()) {
  const normalizedVersion = normalizePoeVersion(version) || 'poe1';

  try {
    const response = await window.electronAPI.getCurrencyLeagues(normalizedVersion);
    const leagueData = response?.data || response || {};
    const activeLeagues = extractUsableActiveLeagues(leagueData.activeLeagues);

    state.activeLeagueOptions = {
      ...state.activeLeagueOptions,
      [normalizedVersion]: activeLeagues
    };
  } catch {
    state.activeLeagueOptions = {
      ...state.activeLeagueOptions,
      [normalizedVersion]: []
    };
  } finally {
    state.leagueOptionsLoaded = true;
    updateActiveLeagueFieldContext({ syncValue: true });
  }
}

function applySettingsDraftToDom(settingsDraft = {}) {
  const completeSettingsDraft = getCompleteHotkeySettings(settingsDraft);

  if (elements.apiUrl) elements.apiUrl.value = completeSettingsDraft.apiUrl || '';
  if (elements.poePath) elements.poePath.value = completeSettingsDraft.poePath || '';
  if (elements.autoStartSession) elements.autoStartSession.checked = Boolean(completeSettingsDraft.autoStartSession);
  if (elements.enableNotifications) elements.enableNotifications.checked = completeSettingsDraft.notifications !== false;
  if (elements.soundNotifications) elements.soundNotifications.checked = Boolean(completeSettingsDraft.soundNotifications);
  if (elements.scanHotkey) elements.scanHotkey.value = completeSettingsDraft.scanHotkey;
  if (elements.stashScanHotkey) elements.stashScanHotkey.value = completeSettingsDraft.stashScanHotkey;
  syncHotkeyDisplays();
  if (elements.globalLanguage) elements.globalLanguage.value = completeSettingsDraft.language || 'en';
  if (elements.defaultLeague || elements.defaultLeagueSelect) {
    const leagueKey = getLeagueSettingKey(getSettingsLeagueVersion());
    const leagueValue = completeSettingsDraft[leagueKey] ?? completeSettingsDraft.defaultLeague;
    setActiveLeagueFieldValue(leagueValue);
  }
}

function setupHotkeyCaptureFields() {
  const { formatKeyboardEventToAccelerator } = getHotkeyModel();

  [elements.scanHotkey, elements.stashScanHotkey]
    .filter(Boolean)
    .forEach((field) => {
      field.addEventListener('keydown', (event) => {
        if (event.key === 'Tab') {
          return;
        }

        if (event.key === 'Escape') {
          field.blur();
          return;
        }

        event.preventDefault();

        try {
          field.value = formatKeyboardEventToAccelerator(event);
          syncHotkeyDisplays();
        } catch {
          // Ignore modifier-only input while the capture field is focused.
        }
      });

      field.addEventListener('focus', () => {
        if (typeof field.select === 'function') {
          field.select();
        }
      });
    });
}

function populateStrategyPresets() {
  if (!elements.strategyPresetsList) {
    return;
  }

  const presets = Array.isArray(state.settings.strategyPresets) && state.settings.strategyPresets.length
    ? state.settings.strategyPresets
    : ['Strongbox', 'Legion', 'Ritual', 'Expedition', 'Harvest', 'Boss Rush'];

  elements.strategyPresetsList.innerHTML = presets
    .map((preset) => `<option value="${preset}"></option>`)
    .join('');
}

async function loadPendingLootState() {
  try {
    const response = await window.electronAPI.getSyncStatus();
    state.pendingLootCount = response?.total || 0;
    state.pendingSyncEntries = response?.entries || [];
  } catch {
    state.pendingLootCount = 0;
    state.pendingSyncEntries = [];
  }
}

async function loadAuditTrailState() {
  try {
    const response = await window.electronAPI.getAuditTrail();
    state.auditTrail = response?.entries || [];
  } catch {
    state.auditTrail = [];
  }
}

function renderPendingSyncState() {
  if (!elements.pendingSyncCount || !elements.pendingSyncMeta) {
    return;
  }

  elements.pendingSyncCount.textContent = String(state.pendingLootCount || 0);
  elements.pendingSyncMeta.textContent = state.pendingLootCount > 0
    ? window.t('settings.syncQueuePending', { count: state.pendingLootCount })
    : window.t('settings.syncQueueEmpty');

  if (!elements.pendingSyncList) {
    return;
  }

  if (!state.pendingSyncEntries?.length) {
    elements.pendingSyncList.innerHTML = `<p class="text-muted">${window.t('settings.syncQueueEmpty')}</p>`;
    return;
  }

  elements.pendingSyncList.innerHTML = state.pendingSyncEntries.slice(0, 10).map((entry) => {
    const titleKey = entry.queueType === 'session'
      ? (entry.type === 'sessionStart' ? 'settings.pendingSessionStart' : 'settings.pendingSessionEnd')
      : 'settings.pendingLootSync';
    const statusLabel = entry.blocked
      ? window.t('settings.syncBlocked')
      : (entry.lastError ? window.t('settings.syncRetrying') : window.t('settings.syncQueued'));
    const attemptLabel = entry.attempts ? `${window.t('settings.syncAttempts')}: ${entry.attempts}` : '';
    const reason = entry.lastError ? escapeHTML(entry.lastError) : window.t('settings.syncNoErrors');
    return `
      <article class="sync-action-item ${entry.blocked ? 'blocked' : (entry.lastError ? 'warning' : '')}">
        <div class="sync-action-row">
          <span class="sync-action-title">${window.t(titleKey)}</span>
          <span class="sync-action-subtle">${statusLabel}</span>
        </div>
        <div class="sync-action-subtle">${attemptLabel}</div>
        <div class="sync-action-subtle">${reason}</div>
      </article>
    `;
  }).join('');
}

function renderAuditTrail() {
  if (!elements.auditTrailList) {
    return;
  }

  if (!state.auditTrail.length) {
    elements.auditTrailList.innerHTML = `<p class="text-muted">${window.t('settings.auditTrailEmpty')}</p>`;
    return;
  }

  elements.auditTrailList.innerHTML = state.auditTrail.slice(0, 12).map((entry) => {
    const message = escapeHTML(window.t(entry.key, entry.values || {}));
    const timestamp = entry.createdAt ? timeAgo(entry.createdAt) : '-';
    return `
      <article class="audit-entry ${entry.level || 'info'}">
        <div class="audit-entry-header">
          <span class="audit-entry-title">${message}</span>
          <span class="audit-entry-time">${timestamp}</span>
        </div>
      </article>
    `;
  }).join('');
}

function startSessionClock() {
  if (sessionClockInterval) return; // Already running
  sessionClockInterval = setInterval(() => {
    if (state.currentSession && !document.hidden) {
      updateActiveSessionUI();
    }
  }, 1000);
}

function stopSessionClock() {
  if (sessionClockInterval) {
    clearInterval(sessionClockInterval);
    sessionClockInterval = null;
  }
}

function ensureSessionClock() {
  stopSessionClock();
  if (state.currentSession && !document.hidden) {
    startSessionClock();
  }
}

// Pause/resume session clock on visibility changes
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopSessionClock();
  } else if (state.currentSession) {
    startSessionClock();
  }
});

/**
 * Ayarlari yukle
 */
async function loadSettings() {
  try {
    state.settings = getCompleteHotkeySettings(await window.electronAPI.getSettings());
    const ver = applySettingsVersionSelection(state.settings.poeVersion || 'poe1');
    applySettingsDraftToDom(state.settings);
    updateActiveLeagueFieldContext({ syncValue: true, forceValueSync: true });
    await loadSettingsLeagueOptions(ver);
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'toast.settingsError'), 'error');
  }
}

/**
 * PoE currency icon image paths
 */
const CURRENCY_IMAGE_VARIANTS = {
  poe1: {
    chaos: 'assets/currency/poe1/chaos.png',
    divine: 'assets/currency/poe1/divine.png',
  },
  poe2: {
    chaos: 'assets/currency/poe2/chaos.png',
    divine: 'assets/currency/poe2/divine.webp',
  }
};

const CURRENCY_IMAGES = {
  chaos: 'assets/currency/poe1/chaos.png',
  divine: 'assets/currency/poe1/divine.png',
  exalted: 'assets/currency/poe1/exalted.png',
  mirror: 'assets/currency/poe1/mirror.png',
  vaal: 'assets/currency/poe1/vaal.png',
  alchemy: 'assets/currency/poe1/alchemy.png',
  fusing: 'assets/currency/poe1/fusing.png',
  chromatic: 'assets/currency/poe1/chromatic.png',
  alteration: 'assets/currency/poe1/alteration.png',
  jewellers: 'assets/currency/poe1/jewellers.png',
  scouring: 'assets/currency/poe1/scouring.png',
  blessed: 'assets/currency/poe1/blessed.png',
  regal: 'assets/currency/poe1/regal.png',
  regret: 'assets/currency/poe1/regret.png',
  gcp: 'assets/currency/poe1/gcp.png',
  chance: 'assets/currency/poe1/chance.png'
};

function getCurrencyAssetPath(type = 'chaos', poeVersion = state.settings.poeVersion || 'poe1') {
  return CURRENCY_IMAGE_VARIANTS[poeVersion]?.[type] || CURRENCY_IMAGES[type] || CURRENCY_IMAGES.chaos;
}

function syncDesktopCurrencyIcons() {
  const poeVersion = state.settings.poeVersion || 'poe1';
  const statProfitIcon = document.getElementById('stat-profit-icon');
  const statAvgIcon = document.getElementById('stat-avg-icon');

  if (statProfitIcon) {
    statProfitIcon.src = getCurrencyAssetPath('chaos', poeVersion);
  }

  if (statAvgIcon) {
    statAvgIcon.src = getCurrencyAssetPath('chaos', poeVersion);
  }
}

function currencyHTML(value, type = 'chaos', iconSize = 18, poeVersion = state.settings.poeVersion || 'poe1') {
  const num = parseFloat(value);
  const imgPath = getCurrencyAssetPath(type, poeVersion);
  const formatted = isNaN(num) ? '0' : (type === 'divine' ? num.toFixed(2) : num.toFixed(1));
  return `<span class="currency-value">${formatted} <img src="${imgPath}" class="currency-icon" width="${iconSize}" height="${iconSize}" alt="${type}" draggable="false"></span>`;
}

/**
 * Event listener'lari kur
 */
function setupEventListeners() {
  // Navigation
  elements.navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      navigateTo(page);
    });
  });

  // Auth
  if (elements.loginForm) {
    elements.loginForm.addEventListener('submit', handleLogin);
  }
  if (elements.registerForm) {
    elements.registerForm.addEventListener('submit', handleRegister);
  }
  const showRegisterButton = document.getElementById('show-register');
  if (showRegisterButton) {
    showRegisterButton.addEventListener('click', showRegisterModal);
  }
  const showLoginButton = document.getElementById('show-login');
  if (showLoginButton) {
    showLoginButton.addEventListener('click', showLoginModal);
  }
  const poeOAuthBtn = document.getElementById('poe-oauth-login');
  if (poeOAuthBtn) poeOAuthBtn.addEventListener('click', handlePoeOAuthLogin);
  if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener('click', handleLogout);
  }

  // Session
  elements.startSessionBtn.addEventListener('click', handleStartSession);
  elements.endSessionBtn.addEventListener('click', handleEndSession);

  // Loot
  elements.scanScreenBtn.addEventListener('click', handleScanScreen);

  // Sessions filter
  elements.sessionFilter.addEventListener('change', loadSessions);
  if (elements.sessionDrawerClose) elements.sessionDrawerClose.addEventListener('click', closeSessionDrawer);
  if (elements.sessionDrawerBackdrop) elements.sessionDrawerBackdrop.addEventListener('click', closeSessionDrawer);
  if (elements.sessionDrawerSave) elements.sessionDrawerSave.addEventListener('click', handleSessionMetadataSave);

  // Settings
  elements.saveSettingsBtn.addEventListener('click', handleSaveSettings);
  elements.resetSettingsBtn.addEventListener('click', handleResetSettings);
  if (elements.poeConnectBtn) elements.poeConnectBtn.addEventListener('click', handlePoeConnect);
  if (elements.poeDisconnectBtn) elements.poeDisconnectBtn.addEventListener('click', handlePoeDisconnect);

  // Settings tab navigation
  elements.settingsNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.settingsTab;
      elements.settingsNavBtns.forEach(b => {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
      elements.settingsTabs.forEach(t => {
        t.classList.toggle('active', t.id === 'settings-' + tab);
      });
    });
  });

  // Global language selector
  if (elements.globalLanguage) {
    elements.globalLanguage.addEventListener('change', () => {
      const lang = elements.globalLanguage.value || 'en';
      state.settings.language = lang;
      window._appState.language = lang;
      applyLocalizedChrome();
      updateActiveLeagueFieldContext();
    });
  }

  if (elements.defaultLeague) {
    elements.defaultLeague.addEventListener('input', () => {
      refreshActiveLeagueDirtyState();
    });
  }
  if (elements.defaultLeagueSelect) {
    elements.defaultLeagueSelect.addEventListener('change', () => {
      refreshActiveLeagueDirtyState();
    });
  }
  setupHotkeyCaptureFields();

  // PoE version switching
  elements.versionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.versionBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.settings.poeVersion = btn.dataset.version;
      syncDesktopCurrencyIcons();
      updateActiveLeagueFieldContext({ syncValue: true });
      applyDashboardCapabilities();
      void loadSettingsLeagueOptions(btn.dataset.version);
    });
  });

  // Browse Client.txt path
  const browseBtn = document.getElementById('browse-poe-path');
  if (browseBtn) {
    browseBtn.addEventListener('click', async () => {
      const filePath = await window.electronAPI.browsePoePath();
      if (filePath && elements.poePath) {
        elements.poePath.value = filePath;
      }
    });
  }

  // Test connection
  if (elements.testConnection) {
    elements.testConnection.addEventListener('click', handleTestConnection);
  }
  if (elements.retryPendingSyncBtn) {
    elements.retryPendingSyncBtn.addEventListener('click', handleRetryPendingSync);
  }
  if (elements.exportDiagnosticsBtn) {
    elements.exportDiagnosticsBtn.addEventListener('click', handleExportDiagnostics);
  }

  // Stash Profit Tracker
  if (elements.syncPricesBtn) {
    elements.syncPricesBtn.addEventListener('click', handleSyncPrices);
  }
  if (elements.takeBeforeSnapshotBtn) {
    elements.takeBeforeSnapshotBtn.addEventListener('click', () => handleTakeSnapshot('before'));
  }
  if (elements.takeAfterSnapshotBtn) {
    elements.takeAfterSnapshotBtn.addEventListener('click', () => handleTakeSnapshot('after'));
  }
  if (elements.calculateProfitBtn) {
    elements.calculateProfitBtn.addEventListener('click', handleCalculateProfit);
  }
  if (elements.resetSnapshotsBtn) {
    elements.resetSnapshotsBtn.addEventListener('click', handleResetSnapshots);
  }

  // Session list — event delegation (single listener instead of per-card)
  if (elements.sessionsList) {
    elements.sessionsList.addEventListener('click', (event) => {
      const sessionBtn = event.target.closest('[data-session-id]');
      if (sessionBtn) {
        openSessionDrawer(sessionBtn.dataset.sessionId);
      }
    });
  }

  // Window controls
  const winMin = document.getElementById('win-minimize');
  const winMax = document.getElementById('win-maximize');
  const winClose = document.getElementById('win-close');
  if (winMin) winMin.addEventListener('click', () => window.electronAPI.windowMinimize());
  if (winMax) winMax.addEventListener('click', () => window.electronAPI.windowMaximize());
  if (winClose) winClose.addEventListener('click', () => window.electronAPI.windowClose());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.selectedSession) {
      closeSessionDrawer();
    }
  });
}

/**
 * IPC event listener'lari
 */
function setupIPCListeners() {
  // Map olaylari
  window.electronAPI.onMapEntered((data) => {
    if (data?.runtimeSession) {
      setRuntimeSessionState(data.runtimeSession);
    }
    showToast(window.t('toast.mapEnteredTitle'), window.t('toast.mapEnteredBody', { mapName: data.mapName }));
  });

  window.electronAPI.onMapExited((data) => {
    if (data?.runtimeSession) {
      setRuntimeSessionState(data.runtimeSession);
    }
    showToast(window.t('toast.mapExitedTitle'), window.t('toast.mapExitedBody', {
      mapName: data.mapName,
      duration: formatDuration(data.duration)
    }));
    refreshTrackerData({ includeSessions: true });
  });

  // Session olaylari
  window.electronAPI.onSessionStarted((session) => {
    state.currentSession = session;
    updateActiveSessionUI();
    ensureSessionClock();
    showToast(window.t('toast.sessionStartedTitle'), window.t('toast.sessionStartedBody', { mapName: session.mapName }));
    refreshTrackerData({ includeSessions: true });
  });

  window.electronAPI.onSessionEnded((session) => {
    state.currentSession = null;
    updateActiveSessionUI();
    stopSessionClock();
    const profit = parseFloat(session.profitChaos);
    const message = profit >= 0
      ? window.t('toast.sessionProfitBody', { value: profit.toFixed(1) })
      : window.t('toast.sessionLossBody', { value: Math.abs(profit).toFixed(1) });
    showToast(window.t('toast.sessionCompletedTitle'), message, profit >= 0 ? 'success' : 'warning');
    refreshTrackerData({ includeSessions: true });
  });

  // Loot olaylari
  window.electronAPI.onLootAdded((data) => {
    const itemCount = Array.isArray(data.items) ? data.items.length : 1;
    showToast(window.t('toast.lootAddedTitle'), window.t('toast.lootAddedBody', { count: itemCount }));
    refreshTrackerData({ includeSessions: isPageActive('sessions') });
  });

  if (window.electronAPI.onPendingLootUpdated) {
    window.electronAPI.onPendingLootUpdated((data) => {
      state.pendingLootCount = data?.count || 0;
      renderPendingSyncState();
    });
  }

  if (window.electronAPI.onPendingSyncUpdated) {
    window.electronAPI.onPendingSyncUpdated((data) => {
      state.pendingLootCount = data?.total || 0;
      state.pendingSyncEntries = data?.entries || [];
      renderPendingSyncState();
    });
  }

  if (window.electronAPI.onAuditTrailUpdated) {
    window.electronAPI.onAuditTrailUpdated((data) => {
      state.auditTrail = data?.entries || [];
      renderAuditTrail();
    });
  }

  // Stash events
  if (window.electronAPI.onStashSnapshotTaken) {
    window.electronAPI.onStashSnapshotTaken((data) => {
      showToast(window.t('stash.profitTracker'), window.t('stash.snapshotTaken', { count: data.itemCount }), 'success');
    });
  }

  if (window.electronAPI.onProfitCalculated) {
    window.electronAPI.onProfitCalculated((report) => {
      renderProfitReport(report);
    });
  }

  // Game detection
  if (window.electronAPI.onGameVersionChanged) {
    window.electronAPI.onGameVersionChanged(({ version, logPath, runtimeSession }) => {
      const gameLabel = version === 'poe2' ? 'Path of Exile 2' : 'Path of Exile';
      showToast(window.t('stash.profitTracker'), window.t('game.detected', { game: gameLabel }), 'info');

      if (runtimeSession) {
        setRuntimeSessionState(runtimeSession);
      }
      syncRendererGameContext(version, { logPath });
      refreshAccountStateFromCurrentUser();
      renderCharacterSummaryCard();

      // Clear cached prices (they're version-specific)
      stashState.pricesSynced = false;
      if (elements.priceItemCount) {
        elements.priceItemCount.textContent = '—';
      }

      // Auto-refresh currency page if it's currently visible
      if (currencyState.poeVersion !== version) {
        currencyState.poeVersion = version;
        currencyState.type = '';
        // Update poe-toggle buttons on currency page
        document.querySelectorAll('.poe-toggle-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.poe === version);
        });
        updateTypeFilterDropdown();
        loadCurrencyLeagues();
        loadCurrencyPrices();
      }
    });
  }

  if (window.electronAPI.onGameClosed) {
    window.electronAPI.onGameClosed((data) => {
      if (data?.runtimeSession) {
        setRuntimeSessionState(data.runtimeSession);
      }
      syncRendererGameContext(null);
    });
  }

  // Navigation
  window.electronAPI.onNavigate((page) => {
    navigateTo(page);
  });
}

/**
 * Sayfa navigasyonu
 */
function navigateTo(page) {
  if (page !== 'sessions') {
    closeSessionDrawer();
  }

  // Nav butonlarini guncelle
  elements.navButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  // Sayfalari guncelle
  elements.pages.forEach(p => {
    p.classList.toggle('active', p.id === `${page}-page`);
  });

  // Sayfa ozel yuklemeler
  if (page === 'sessions') {
    loadSessions();
  } else if (page === 'dashboard') {
    refreshTrackerData();
  } else if (page === 'currency') {
    loadCurrencyPage();
  }
}

/**
 * Login modal'i goster
 */
function showLoginModal() {
  if (elements.loginModal) {
    elements.loginModal.classList.remove('hidden');
  }

  if (elements.registerModal) {
    elements.registerModal.classList.add('hidden');
  }
}

/**
 * Register modal'i goster
 */
function showRegisterModal() {
  if (elements.loginModal) {
    elements.loginModal.classList.add('hidden');
  }

  if (elements.registerModal) {
    elements.registerModal.classList.remove('hidden');
  }
}

/**
 * Giris islemi
 */
async function handleLogin(e) {
  e.preventDefault();

  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;

  try {
    const result = await window.electronAPI.login({ username, password });

    if (result.success) {
      setCurrentUser({
        ...result.data.user,
        capabilities: result.data.capabilities || {}
      });
      elements.loginModal.classList.add('hidden');
      await loadPoeLinkStatus();
      await refreshTrackerData();
      showToast(window.t('login.title'), window.t('toast.loginSuccess'));
    } else {
      showToast(window.t('toast.loginFailed'), getUserFacingErrorMessage({ error: result.error }, 'errors.loginFailed'), 'error');
    }
  } catch (error) {
    showToast(window.t('toast.loginFailed'), getUserFacingErrorMessage(error, 'errors.loginFailed'), 'error');
  }
}

/**
 * Path of Exile OAuth login.
 * Opens the GGG consent page in the user's browser, waits for the local
 * loopback callback, and signs the user in (creating an account on first use).
 */
async function handlePoeOAuthLogin() {
  const button = document.getElementById('poe-oauth-login');
  if (button) {
    button.disabled = true;
    button.classList.add('is-loading');
  }

  try {
    const startResult = await window.electronAPI.startPoeLogin();
    const canCompleteLogin = typeof window.electronAPI.completePoeLogin === 'function';
    const result = !startResult?.success && canCompleteLogin
      ? await window.electronAPI.completePoeLogin({
        code: startResult?.mockCode || startResult?.code || null,
        state: startResult?.state || null,
        codeVerifier: startResult?.codeVerifier || null,
        redirectUri: startResult?.redirectUri || null
      })
      : startResult;

    if (result?.success) {
      setCurrentUser({
        ...result.data.user,
        capabilities: result.data.capabilities || {}
      });
      if (elements.loginModal) {
        elements.loginModal.classList.add('hidden');
      }
      await loadPoeLinkStatus();
      await refreshTrackerData();
      showToast(window.t('login.title'), window.t('toast.loginSuccess'));
    } else {
      showToast(
        window.t('toast.loginFailed'),
        getUserFacingErrorMessage({ error: result?.error }, 'errors.loginFailed'),
        'error'
      );
    }
  } catch (error) {
    showToast(window.t('toast.loginFailed'), getUserFacingErrorMessage(error, 'errors.loginFailed'), 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.classList.remove('is-loading');
    }
  }
}

/**
 * Kayit islemi
 */
async function handleRegister(e) {
  e.preventDefault();

  const username = document.getElementById('register-username').value;
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;

  try {
    const result = await window.electronAPI.register({ username, email, password });

    if (result.success) {
      setCurrentUser({
        ...result.data.user,
        capabilities: result.data.capabilities || {}
      });
      elements.registerModal.classList.add('hidden');
      await loadPoeLinkStatus();
      await refreshTrackerData();
      showToast(window.t('register.title'), window.t('toast.registerSuccess'));
    } else {
      showToast(window.t('toast.registerFailed'), getUserFacingErrorMessage({ error: result.error }, 'errors.registerFailed'), 'error');
    }
  } catch (error) {
    showToast(window.t('toast.registerFailed'), getUserFacingErrorMessage(error, 'errors.registerFailed'), 'error');
  }
}

/**
 * Cikis islemi
 */
async function handleLogout() {
  await window.electronAPI.logout();
  state.currentUser = null;
  state.currentSession = null;
  state.sessions = [];
  state.recentLoot = [];
  state.poeLink = null;
  state.account = null;
  state.runtimeSession = null;
  state.overlay = null;
  closeSessionDrawer();
  renderUserIdentity();
  if (typeof renderCharacterSummaryCard === 'function') {
    renderCharacterSummaryCard();
  }
  resetDashboardSummary();
  updateActiveSessionUI();
  renderSessionsList();
  renderRecentLoot();
  renderPoeLinkStatus();
  showLoginModal();
}

/**
 * Kullanici kimligini guncel duruma gore goster
 */
function renderUserIdentity() {
  if (!elements.username) {
    return;
  }

  const username = typeof state.currentUser?.username === 'string'
    ? state.currentUser.username.trim()
    : '';
  const hasUserIdentity = Boolean(username);
  const headerUsername = hasUserIdentity ? username : window.t('user.guest');

  elements.username.textContent = headerUsername;

  if (elements.userAvatar) {
    elements.userAvatar.textContent = hasUserIdentity
      ? headerUsername.charAt(0).toUpperCase()
      : '?';
  }
}

function applyLocalizedChrome() {
  if (window.applyTranslations) {
    window.applyTranslations();
  }

  renderUserIdentity();
  renderPoeLinkStatus();
}

/**
 * Mevcut kullaniciyi ayarla
 */
function setCurrentUser(user) {
  state.currentUser = user;
  refreshAccountStateFromCurrentUser();
  renderUserIdentity();
  if (typeof renderCharacterSummaryCard === 'function') {
    renderCharacterSummaryCard();
  }
  if (typeof refreshRendererOverlayState === 'function') {
    refreshRendererOverlayState();
  }
}

function refreshAccountStateFromCurrentUser() {
  const user = state.currentUser;
  if (!user) {
    state.account = null;
    return;
  }

  const { deriveAccountState } = getAccountStateModel();
  const poePayload = user?.poe || {};
  state.account = deriveAccountState({
    activePoeVersion: normalizePoeVersion(state.detectedGameVersion)
      || normalizePoeVersion(state.settings?.poeVersion),
    accountName: user?.accountName
      || user?.poeAccountName
      || poePayload.accountName
      || poePayload.account?.name
      || user?.username
      || null,
    selectedCharacterByGame: user?.selectedCharacterByGame
      || poePayload.selectedCharacterByGame
      || {},
    selectedCharacterId: user?.selectedCharacterId
      || user?.selectedCharacter?.id
      || poePayload.selectedCharacterId
      || poePayload.selectedCharacter?.id
      || null,
    selectedCharacter: user?.selectedCharacter || poePayload.selectedCharacter || null,
    characters: user?.characters
      || user?.poeCharacters
      || poePayload.characters
      || [],
    cachedAccountState: state.settings?.lastKnownAccountState || null
  });
  persistLastKnownAccountState();
}

function persistLastKnownAccountState() {
  if (!state.account || state.account.summary?.status !== 'ready') {
    return;
  }

  const accountModel = getAccountStateModel();
  if (typeof accountModel.createAccountStateCache !== 'function') {
    return;
  }

  const lastKnownAccountState = accountModel.createAccountStateCache(state.account);
  state.settings.lastKnownAccountState = lastKnownAccountState;

  if (window.electronAPI?.setSettings) {
    window.electronAPI.setSettings({ lastKnownAccountState }).catch(() => {});
  }
}

function canCurrentUserSyncPrices() {
  return Boolean(state.currentUser?.capabilities?.canSyncPrices);
}

function renderPoeLinkStatus() {
  const status = state.poeLink;

  if (!elements.poeLinkStatus || !elements.poeAccountName || !elements.poeLinkMode) return;

  if (!state.currentUser) {
    elements.poeLinkStatus.textContent = window.t('settings.poeSignInRequired');
    elements.poeAccountName.textContent = window.t('settings.poeSignInHint');
    elements.poeLinkMode.textContent = window.t('settings.poeSignedOutMode');
    if (elements.poeConnectBtn) elements.poeConnectBtn.classList.remove('hidden');
    if (elements.poeDisconnectBtn) elements.poeDisconnectBtn.classList.add('hidden');
    return;
  }

  if (status?.linked) {
    elements.poeLinkStatus.textContent = status.mock ? window.t('settings.poeLinkedMock') : window.t('settings.poeLinked');
    elements.poeAccountName.textContent = status.accountName || window.t('settings.poeLinked');
    elements.poeLinkMode.textContent = status.mock
      ? window.t('settings.poeMockMode')
      : window.t('settings.poeLiveMode');
    if (elements.poeConnectBtn) elements.poeConnectBtn.classList.add('hidden');
    if (elements.poeDisconnectBtn) elements.poeDisconnectBtn.classList.remove('hidden');
    return;
  }

  elements.poeLinkStatus.textContent = window.t('settings.poeNotLinked');
  elements.poeAccountName.textContent = window.t('settings.poeNoAccount');
  elements.poeLinkMode.textContent = window.t('settings.poeMockMode');
  if (elements.poeConnectBtn) elements.poeConnectBtn.classList.remove('hidden');
  if (elements.poeDisconnectBtn) elements.poeDisconnectBtn.classList.add('hidden');
}

async function loadPoeLinkStatus() {
  if (!state.currentUser) {
    renderPoeLinkStatus();
    return;
  }

  try {
    const response = await window.electronAPI.getPoeLinkStatus();
    state.poeLink = response?.poe || null;
  } catch (error) {
    state.poeLink = null;
  } finally {
    renderPoeLinkStatus();
  }
}

async function handlePoeConnect() {
  if (!state.currentUser) {
    showToast(window.t('toast.error'), window.t('toast.poeSignInFirst'), 'warning');
    return;
  }

  if (elements.poeConnectBtn) {
    elements.poeConnectBtn.disabled = true;
    elements.poeConnectBtn.textContent = `${window.t('settings.connectPoe')}...`;
  }

  try {
    const response = await window.electronAPI.startPoeConnect();
    state.poeLink = response?.poe || null;
    renderPoeLinkStatus();
    showToast(window.t('toast.poeTitle'), state.poeLink?.mock ? window.t('toast.poeLinkedMock') : window.t('toast.poeLinked'), 'success');
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'toast.poeConnectError'), 'error');
  } finally {
    if (elements.poeConnectBtn) {
      elements.poeConnectBtn.disabled = false;
      elements.poeConnectBtn.textContent = window.t('settings.connectPoe');
    }
  }
}

async function handlePoeDisconnect() {
  if (!state.currentUser) return;

  if (elements.poeDisconnectBtn) {
    elements.poeDisconnectBtn.disabled = true;
    elements.poeDisconnectBtn.textContent = `${window.t('settings.disconnectPoe')}...`;
  }

  try {
    const response = await window.electronAPI.disconnectPoeAccount();
    state.poeLink = response?.poe || null;
    renderPoeLinkStatus();
    showToast(window.t('toast.poeTitle'), window.t('toast.poeDisconnected'), 'success');
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'toast.poeDisconnectError'), 'error');
  } finally {
    if (elements.poeDisconnectBtn) {
      elements.poeDisconnectBtn.disabled = false;
      elements.poeDisconnectBtn.textContent = window.t('settings.disconnectPoe');
    }
  }
}

function getSelectedTrackerContext() {
  const poeVersion = getResolvedLeagueVersion();
  const league = getResolvedActiveLeague();

  return {
    poeVersion,
    league,
    label: `${poeVersion === 'poe2' ? 'PoE 2' : 'PoE 1'} • ${league}`
  };
}

function isPageActive(page) {
  const pageElement = document.getElementById(`${page}-page`);
  return Boolean(pageElement?.classList.contains('active'));
}

function resetDashboardSummary() {
  elements.todaySessions.textContent = '0';
  elements.todayProfit.innerHTML = currencyHTML(0, 'chaos', 18, state.settings.poeVersion || 'poe1');
  elements.todayAvg.innerHTML = currencyHTML(0, 'chaos', 18, state.settings.poeVersion || 'poe1');
}

let _refreshPending = null;
let _refreshOptions = {};

async function refreshTrackerData({ includeSessions = false, includeCurrency = false } = {}) {
  // Coalesce rapid calls within 300ms
  _refreshOptions.includeSessions = _refreshOptions.includeSessions || includeSessions;
  _refreshOptions.includeCurrency = _refreshOptions.includeCurrency || includeCurrency;

  if (_refreshPending) return _refreshPending;

  _refreshPending = new Promise(resolve => setTimeout(resolve, 300)).then(async () => {
    const opts = { ..._refreshOptions };
    _refreshOptions = {};
    _refreshPending = null;

    if (!state.currentUser) {
      resetDashboardSummary();
      renderRecentLoot();
      renderSessionsList();
      updateActiveSessionUI();
      return;
    }

    const tasks = [
      loadCurrentSession(),
      loadDashboardStats(),
      loadRecentLoot()
    ];

    if (opts.includeSessions || isPageActive('sessions')) {
      tasks.push(loadSessions());
    }

    if (opts.includeCurrency || isPageActive('currency')) {
      tasks.push(loadCurrencyPage());
    }

    await Promise.allSettled(tasks);
  }).catch(() => {
    // Swallow unhandled rejections to prevent console noise from race conditions
    _refreshPending = null;
    _refreshOptions = {};
  });

  return _refreshPending;
}

/**
 * Session baslat
 */
async function handleStartSession() {
  const mapName = prompt(window.t('misc.mapPrompt'), 'Dunes Map');
  if (!mapName) return;

  const trackerContext = getSelectedTrackerContext();

  try {
    const session = await window.electronAPI.startSession({
      mapName,
      poeVersion: trackerContext.poeVersion,
      league: trackerContext.league
    });
    if (session) {
      state.currentSession = session;
      updateActiveSessionUI();
      await refreshTrackerData({ includeSessions: true });
      showToast(
        window.t('dashboard.activeSession'),
        session.queued
          ? `${window.t('toast.sessionQueued')} (${trackerContext.label})`
          : `${mapName} ${window.t('toast.sessionStarted')} (${trackerContext.label})`
      );
    }
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'errors.sessionStart'), 'error');
  }
}

/**
 * Session bitir
 */
async function handleEndSession() {
  if (!state.currentSession) return;

  if (!confirm(window.t('misc.endSessionConfirm'))) return;

  try {
    const result = await window.electronAPI.endSession();
    state.currentSession = null;
    updateActiveSessionUI();
    await refreshTrackerData({ includeSessions: true });
    if (result?.queued) {
      showToast(window.t('dashboard.activeSession'), window.t('toast.sessionEndQueued'), 'warning');
    }
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'errors.sessionEnd'), 'error');
  }
}

/**
 * Aktif session UI'ini guncelle
 */
async function loadCurrentSession() {
  try {
    const session = await window.electronAPI.getCurrentSession();
    state.currentSession = session;
    updateActiveSessionUI();
  } catch (error) {
    state.currentSession = null;
    updateActiveSessionUI();
  }
}

function updateActiveSessionUI() {
  const lootEntries = Array.isArray(state.currentSession?.lootEntries) ? state.currentSession.lootEntries : [];
  const totalLootChaos = parseFloat(state.currentSession?.totalLootChaos || 0);
  const profitChaos = parseFloat(state.currentSession?.profitChaos || 0);
  const itemCount = lootEntries.reduce((sum, loot) => sum + parseInt(loot.quantity || 0, 10), 0);
  const liveDuration = getLiveDuration(state.currentSession);
  const profitClass = profitChaos >= 0 ? 'session-info-value positive' : 'session-info-value negative';
  if (state.currentSession) {
    const contextLabel = `${state.currentSession.poeVersion === 'poe2' ? 'PoE 2' : 'PoE 1'} • ${escapeHTML(state.currentSession.league || 'Standard')}`;
    elements.activeSession.innerHTML = `
      <div class="session-info">
        <div class="session-info-item">
          <span class="session-info-label">${window.t('session.map')}</span>
          <span class="session-info-value">${escapeHTML(state.currentSession.mapName)}</span>
        </div>
        <div class="session-info-item">
          <span class="session-info-label">${window.t('session.tier')}</span>
          <span class="session-info-value">${state.currentSession.mapTier || '-'}</span>
        </div>
        <div class="session-info-item">
          <span class="session-info-label">${window.t('session.start')}</span>
          <span class="session-info-value">${new Date(state.currentSession.startedAt).toLocaleTimeString()}</span>
        </div>
        <div class="session-info-item">
          <span class="session-info-label">${window.t('session.status')}</span>
          <span class="session-info-value" style="color: #2196f3;">${window.t('dashboard.active')}</span>
        </div>
        <div class="session-info-item">
          <span class="session-info-label">Game</span>
          <span class="session-info-value">${contextLabel}</span>
        </div>
        <div class="session-info-item">
          <span class="session-info-label">${window.t('dashboard.elapsed')}</span>
          <span class="session-info-value">${formatDuration(liveDuration)}</span>
        </div>
        <div class="session-info-item session-info-item--metric">
          <span class="session-info-label">${window.t('dashboard.liveLoot')}</span>
          <span class="session-info-value">${currencyHTML(totalLootChaos, 'chaos', 16, state.currentSession.poeVersion || state.settings.poeVersion || 'poe1')}</span>
        </div>
        <div class="session-info-item session-info-item--metric">
          <span class="session-info-label">${window.t('dashboard.liveProfit')}</span>
          <span class="${profitClass}">${currencyHTML(profitChaos, 'chaos', 16, state.currentSession.poeVersion || state.settings.poeVersion || 'poe1')}</span>
        </div>
        <div class="session-info-item">
          <span class="session-info-label">${window.t('dashboard.itemsCollected')}</span>
          <span class="session-info-value">${itemCount}</span>
        </div>
      </div>
    `;
    elements.startSessionBtn.classList.add('hidden');
    elements.endSessionBtn.classList.remove('hidden');
    if (elements.sessionBadge) {
      elements.sessionBadge.textContent = window.t('dashboard.active');
      elements.sessionBadge.style.background = 'rgba(61,220,132,0.12)';
      elements.sessionBadge.style.color = '#3ddc84';
    }
  } else {
    elements.activeSession.innerHTML = `<p class="empty-state"><span class="empty-state-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg></span>${window.t('dashboard.noActiveMap')}</p>`;
    elements.startSessionBtn.classList.remove('hidden');
    elements.endSessionBtn.classList.add('hidden');
    if (elements.sessionBadge) {
      elements.sessionBadge.textContent = window.t('dashboard.waiting');
      elements.sessionBadge.style.background = '';
      elements.sessionBadge.style.color = '';
    }
  }
}

/**
 * Ekrani tara
 */
async function handleScanScreen() {
  if (!state.currentSession) {
    showToast(window.t('toast.error'), window.t('toast.noSession'), 'warning');
    return;
  }

  elements.scanScreenBtn.disabled = true;
  elements.scanScreenBtn.textContent = window.t('dashboard.scanning');

  try {
    const result = await window.electronAPI.scanScreen();
    if (result?.queued) {
      state.pendingLootCount += result.count || 0;
      showToast(window.t('toast.currencyTitle'), window.t('toast.lootQueued', { count: result.count || 0 }), 'warning');
    } else {
      showToast(window.t('dashboard.scanScreen'), window.t('toast.scanComplete'));
    }
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'toast.scanError'), 'error');
  } finally {
    elements.scanScreenBtn.disabled = false;
    elements.scanScreenBtn.textContent = window.t('dashboard.scanScreen');
  }
}

/**
 * Session'lari yukle
 */
async function loadSessions() {
  const filter = elements.sessionFilter.value;
  if (!state.currentUser) {
    state.sessions = [];
    renderSessionsList();
    return;
  }

  elements.sessionsList.innerHTML = `<p class="empty-state">${window.t('sessions.loading')}</p>`;

  try {
    const params = { limit: 50 };
    if (filter && filter !== 'all') {
      params.status = filter;
    }

    const response = await window.electronAPI.getSessions(params);
    state.sessions = response?.sessions || [];
    renderSessionsList();
  } catch (error) {
    elements.sessionsList.innerHTML = `<p class="empty-state">${getUserFacingErrorMessage(error, 'sessions.loadError')}</p>`;
  }
}

/**
 * Dashboard istatistiklerini yukle
 */
async function loadDashboardStats() {
  if (!state.currentUser) {
    resetDashboardSummary();
    return;
  }

  const poeVersion = state.settings.poeVersion || 'poe1';
  elements.todaySessions.textContent = '...';
  elements.todayProfit.textContent = '...';
  elements.todayAvg.textContent = '...';

  try {
    const response = await window.electronAPI.getDashboardStats();
    const summary = response?.summary || {};
    const totalSessions = parseInt(summary.totalSessions || 0, 10);
    const totalProfit = parseFloat(summary.totalProfit || 0);
    const avgProfitPerMap = parseFloat(summary.avgProfitPerMap || 0);

    elements.todaySessions.textContent = String(totalSessions);
    elements.todayProfit.innerHTML = currencyHTML(totalProfit, 'chaos', 18, poeVersion);
    elements.todayAvg.innerHTML = currencyHTML(avgProfitPerMap, 'chaos', 18, poeVersion);
  } catch (error) {
    resetDashboardSummary();
  }
}

/**
 * Son loot'lari yukle
 */
async function loadRecentLoot() {
  if (!state.currentUser) {
    state.recentLoot = [];
    renderRecentLoot();
    return;
  }

  elements.recentLootList.innerHTML = `<p class="empty-state">${window.t('sessions.loading')}</p>`;

  try {
    const response = await window.electronAPI.getRecentLoot({ limit: 6 });
    state.recentLoot = response?.lootEntries || [];
    renderRecentLoot();
  } catch (error) {
    state.recentLoot = [];
    elements.recentLootList.innerHTML = `<p class="empty-state">${getUserFacingErrorMessage(error, 'dashboard.noLoot')}</p>`;
  }
}

function renderSessionsList() {
  if (!elements.sessionsList) return;

  if (!state.currentUser) {
    elements.sessionsList.innerHTML = `<p class="empty-state">${window.t('sessions.empty')}</p>`;
    closeSessionDrawer();
    return;
  }

  if (!state.sessions.length) {
    elements.sessionsList.innerHTML = `<p class="empty-state">${window.t('sessions.empty')}</p>`;
    closeSessionDrawer();
    return;
  }

  elements.sessionsList.innerHTML = state.sessions.map((session) => {
    const profit = parseFloat(session.profitChaos || 0);
    const lootCount = Array.isArray(session.lootEntries)
      ? session.lootEntries.reduce((sum, loot) => sum + parseInt(loot.quantity || 0, 10), 0)
      : 0;
    const contextLabel = `${session.poeVersion === 'poe2' ? 'PoE 2' : 'PoE 1'} / ${escapeHTML(session.league || 'Standard')}`;
    const duration = session.durationSec ? formatDuration(session.durationSec) : '-';
    const tier = session.mapTier ? `T${session.mapTier}` : '-';
    const startedAt = session.startedAt ? timeAgo(session.startedAt) : '-';
    const safeStatus = ['active', 'completed', 'abandoned'].includes(session.status) ? session.status : 'unknown';

    return `
      <button class="session-item" type="button" data-session-id="${escapeHTML(session.id)}">
        <div class="session-primary">
          <div class="session-name">${escapeHTML(session.mapName || 'Unknown Map')}</div>
          <div class="session-tier">${tier} / ${contextLabel} / ${startedAt}</div>
        </div>
        <div class="session-secondary">
          <span class="session-secondary-label">${window.t('sessions.duration')}</span>
          <span class="session-secondary-value">${duration}</span>
        </div>
        <div class="session-secondary">
          <span class="session-secondary-label">${window.t('sessions.lootCount')}</span>
          <span class="session-secondary-value">${lootCount}</span>
        </div>
        <div class="session-profit ${profit >= 0 ? 'positive' : 'negative'}">${currencyHTML(profit, 'chaos', 16, session.poeVersion || state.settings.poeVersion || 'poe1')}</div>
        <div class="session-status ${safeStatus}">${window.t(`sessions.${safeStatus}`)}</div>
      </button>
    `;
  }).join('');

}

function renderRecentLoot() {
  if (!elements.recentLootList) return;

  if (!state.currentUser || !state.recentLoot.length) {
    elements.recentLootList.innerHTML = `<p class="empty-state">${window.t('dashboard.noLoot')}</p>`;
    return;
  }

  elements.recentLootList.innerHTML = state.recentLoot.map((loot) => {
    const session = loot.session || {};
    const totalValue = (parseFloat(loot.chaosValue || 0) * parseInt(loot.quantity || 1, 10)) || 0;
    const contextLabel = `${session.poeVersion === 'poe2' ? 'PoE 2' : 'PoE 1'} / ${escapeHTML(session.league || 'Standard')}`;

    return `
      <article class="recent-loot-item">
        <div class="recent-loot-main">
          <div class="recent-loot-name-row">
            <span class="recent-loot-quantity">x${parseInt(loot.quantity || 1, 10)}</span>
            <span class="recent-loot-name">${escapeHTML(loot.itemName || 'Unknown Item')}</span>
          </div>
          <div class="recent-loot-meta">${escapeHTML(session.mapName || 'Unknown Map')} / ${contextLabel}</div>
        </div>
        <div class="recent-loot-side">
          <div class="recent-loot-value">${currencyHTML(totalValue, 'chaos', 14, session.poeVersion || state.settings.poeVersion || 'poe1')}</div>
          <div class="recent-loot-time">${timeAgo(loot.createdAt)}</div>
        </div>
      </article>
    `;
  }).join('');
}

/**
 * Ayarlari kaydet
 */
async function handleSaveSettings() {
  const activeVersion = document.querySelector('.version-btn.active');
  const previousContext = getSelectedTrackerContext();
  const settingsVersion = normalizePoeVersion(activeVersion?.dataset.version)
    || getSettingsLeagueVersion();
  const leagueSettingKey = getLeagueSettingKey(settingsVersion);
  const visibleLeague = getActiveLeagueFieldValue();
  let hotkeys;

  try {
    const { validateHotkeys } = getHotkeyModel();
    hotkeys = validateHotkeys({
      scanHotkey: elements.scanHotkey ? elements.scanHotkey.value : undefined,
      stashScanHotkey: elements.stashScanHotkey ? elements.stashScanHotkey.value : undefined
    });
  } catch (error) {
    showToast(window.t('toast.error'), error.message || 'Invalid hotkeys', 'error');
    return;
  }

  const settings = {
    apiUrl: elements.apiUrl.value,
    poePath: elements.poePath.value,
    autoStartSession: elements.autoStartSession.checked,
    notifications: elements.enableNotifications.checked,
    soundNotifications: elements.soundNotifications ? elements.soundNotifications.checked : false,
    language: elements.globalLanguage ? elements.globalLanguage.value : 'en',
    poeVersion: activeVersion ? activeVersion.dataset.version : 'poe1',
    [leagueSettingKey]: visibleLeague,
    scanHotkey: hotkeys.scanHotkey,
    stashScanHotkey: hotkeys.stashScanHotkey
  };

  try {
    await window.electronAPI.setSettings(settings);
    state.settings = { ...state.settings, ...settings };
    applySettingsDraftToDom(state.settings);
    activeLeagueInputState.dirty = false;
    updateActiveLeagueFieldContext({ syncValue: true, forceValueSync: true });
    syncDesktopCurrencyIcons();

    const contextChanged =
      previousContext.poeVersion !== settings.poeVersion ||
      previousContext.league !== visibleLeague;

    if (contextChanged && state.currentUser) {
      await refreshTrackerData({ includeSessions: true, includeCurrency: true });
    }
    showToast(window.t('nav.settings'), window.t('toast.settingsSaved'));
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'toast.settingsError'), 'error');
  }
}

/**
 * Ayarlari sifirla
 */
async function handleResetSettings() {
  if (!confirm(window.t('settings.resetConfirm'))) return;

  const { buildResetSettingsDraft } = getSettingsModel();
  const previousContext = getSelectedTrackerContext();
  const resetDraft = buildResetSettingsDraft({
    settings: state.settings,
    currentUser: state.currentUser
  });
  resetDraft.settings = {
    ...resetDraft.settings,
    ...getDefaultHotkeySettings()
  };

  try {
    await window.electronAPI.setSettings(resetDraft.settings);

    state.settings = { ...state.settings, ...resetDraft.settings };
    const resetVersion = applySettingsVersionSelection(resetDraft.settings.poeVersion);
    applySettingsDraftToDom(resetDraft.settings);
    window._appState.language = resetDraft.settings.language || 'en';
    applyLocalizedChrome();
    activeLeagueInputState.dirty = false;
    updateActiveLeagueFieldContext({ syncValue: true, forceValueSync: true });
    syncDesktopCurrencyIcons();
    applyDashboardCapabilities();
    await loadSettingsLeagueOptions(resetVersion);

    const nextContext = getSelectedTrackerContext();
    const contextChanged =
      previousContext.poeVersion !== nextContext.poeVersion ||
      previousContext.league !== nextContext.league;

    if (contextChanged && state.currentUser) {
      try {
        await refreshTrackerData({ includeSessions: true, includeCurrency: true });
      } catch { }
    }

    showToast(window.t('nav.settings'), window.t('toast.settingsSaved'));
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'toast.settingsError'), 'error');
  }
}

/**
 * API baglantisini test et
 */
async function handleTestConnection() {
  const btn = elements.testConnection;
  const origText = btn.textContent;
  btn.textContent = window.t('settings.testing');
  btn.disabled = true;

  try {
    const response = await fetch(elements.apiUrl.value + '/api/health');
    if (response.ok) {
      elements.connectionDot.classList.add('connected');
      elements.connectionText.textContent = window.t('settings.connected');
      showToast(window.t('settings.api'), window.t('toast.connectionSuccess'), 'success');
    } else {
      throw new Error('Not OK');
    }
  } catch {
    elements.connectionDot.classList.remove('connected');
    elements.connectionText.textContent = window.t('settings.disconnected');
    showToast(window.t('settings.api'), window.t('toast.connectionFailed'), 'error');
  } finally {
    btn.textContent = origText;
    btn.disabled = false;
  }
}

/**
 * Toast bildirimi goster
 */
function showToast(title, message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-title">${escapeHTML(title)}</div>
    <div class="toast-message">${escapeHTML(message)}</div>
  `;

  elements.toastContainer.appendChild(toast);

  // 5 saniye sonra kaldir
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

function extractRawErrorMessage(error) {
  if (!error) return '';
  let msg = '';
  if (typeof error === 'string') msg = error;
  else if (typeof error.message === 'string' && error.message !== '[object Object]') msg = error.message;
  else if (typeof error.error === 'string') msg = error.error;
  else if (typeof error.data?.error === 'string') msg = error.data.error;
  // Strip Electron IPC wrapper: "Error invoking remote method '...': Error: <actual message>"
  msg = msg.replace(/^Error invoking remote method '[^']+': (?:Error: )?/i, '');
  return msg.trim();
}

function extractErrorCode(error) {
  if (!error) return '';
  if (typeof error.errorCode === 'string' && error.errorCode.trim()) return error.errorCode.trim();
  if (typeof error.code === 'string' && error.code.trim()) return error.code.trim();
  if (typeof error.data?.errorCode === 'string' && error.data.errorCode.trim()) return error.data.errorCode.trim();
  return '';
}

// Map known raw error substrings to translation keys
const ERROR_PATTERN_MAP = [
  { pattern: /synced recently|cooldown/i, key: 'errors.priceSyncCooldown' },
  { pattern: /sync.*(in progress|already running)/i, key: 'errors.priceSyncInProgress' },
  { pattern: /timed?\s*out/i, key: 'errors.timeout' },
  { pattern: /network|ECONNREFUSED|ENOTFOUND|fetch failed/i, key: 'errors.network' },
  { pattern: /unauthorized|401/i, key: 'errors.unauthorized' },
  { pattern: /forbidden|403/i, key: 'errors.forbidden' },
  { pattern: /not found|404/i, key: 'errors.notFound' },
  { pattern: /rate.?limit|429|too many/i, key: 'errors.rateLimit' },
  { pattern: /server error|500|502|503/i, key: 'errors.serverError' },
  { pattern: /invalid.*(username|password|credentials)/i, key: 'errors.invalidCredentials' },
];

function localizeKnownErrorMessage(message) {
  // Direct key lookup first
  const directKey = ERROR_MESSAGE_KEY_MAP[message];
  if (directKey) return window.t(directKey);
  // Pattern matching for wrapped/partial messages
  for (const { pattern, key } of ERROR_PATTERN_MAP) {
    if (pattern.test(message)) return window.t(key);
  }
  return null;
}

function getUserFacingErrorMessage(error, fallbackKey = 'toast.unexpectedError') {
  const fallback = window.t(fallbackKey);
  // Try error code first
  const errorCode = extractErrorCode(error);
  if (errorCode && ERROR_MESSAGE_KEY_MAP[errorCode]) {
    return window.t(ERROR_MESSAGE_KEY_MAP[errorCode]);
  }
  // Try raw message pattern matching
  const rawMessage = extractRawErrorMessage(error);
  if (!rawMessage) return fallback;
  return localizeKnownErrorMessage(rawMessage) || fallback;
}

async function openSessionDrawer(sessionId) {
  if (!elements.sessionDrawer || !sessionId) return;

  elements.sessionDrawer.classList.remove('hidden');
  elements.sessionDrawer.setAttribute('aria-hidden', 'false');
  elements.sessionDrawerTitle.textContent = window.t('sessions.detailKicker');
  elements.sessionDrawerSummary.innerHTML = `<p class="empty-state">${window.t('sessions.detailLoading')}</p>`;
  if (elements.sessionDrawerStrategy) elements.sessionDrawerStrategy.value = '';
  if (elements.sessionDrawerNotes) elements.sessionDrawerNotes.value = '';
  if (elements.sessionDrawerSave) elements.sessionDrawerSave.disabled = true;
  if (elements.sessionDrawerAnalytics) elements.sessionDrawerAnalytics.innerHTML = '';
  elements.sessionDrawerLoot.innerHTML = '';
  elements.sessionDrawerLootCount.textContent = '...';

  try {
    const session = await window.electronAPI.getSessionDetails(sessionId);
    state.selectedSession = session;
    renderSessionDrawer();
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'sessions.loadError'), 'error');
    closeSessionDrawer();
  }
}

async function handleRetryPendingSync() {
  if (!elements.retryPendingSyncBtn) return;

  const originalLabel = elements.retryPendingSyncBtn.textContent;
  elements.retryPendingSyncBtn.disabled = true;
  elements.retryPendingSyncBtn.textContent = window.t('settings.retryingSync');

  try {
    const result = await window.electronAPI.retryPendingLootActions();
    state.pendingLootCount = (result?.sessions?.remaining || 0) + (result?.loot?.remaining || 0);
    renderPendingSyncState();
    showToast(window.t('settings.api'), window.t('toast.syncRetryComplete', { count: state.pendingLootCount }), 'success');
    await refreshTrackerData({ includeSessions: true });
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'toast.unexpectedError'), 'error');
  } finally {
    elements.retryPendingSyncBtn.disabled = false;
    elements.retryPendingSyncBtn.textContent = originalLabel;
  }
}

async function handleExportDiagnostics() {
  if (!elements.exportDiagnosticsBtn) return;

  const originalLabel = elements.exportDiagnosticsBtn.textContent;
  elements.exportDiagnosticsBtn.disabled = true;
  elements.exportDiagnosticsBtn.textContent = window.t('settings.exportingDiagnostics');

  try {
    const mode = elements.diagnosticsMode?.value === 'sensitive' ? 'sensitive' : 'safe';
    const result = await window.electronAPI.exportDiagnostics(mode);
    if (!result?.canceled) {
      const toastKey = mode === 'sensitive'
        ? 'toast.diagnosticsExportedSensitive'
        : 'toast.diagnosticsExportedSafe';
      showToast(window.t('settings.about'), window.t(toastKey), 'success');
    }
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'toast.unexpectedError'), 'error');
  } finally {
    elements.exportDiagnosticsBtn.disabled = false;
    elements.exportDiagnosticsBtn.textContent = originalLabel;
  }
}

// ==================== STASH PROFIT TRACKER ====================

// Track snapshot state locally
const stashState = {
  beforeSnapshotId: null,
  afterSnapshotId: null,
  pricesSynced: false
};

async function handleSyncPrices() {
  if (!elements.syncPricesBtn) return;
  if (!isStashTrackingEnabled()) {
    showStashUnavailableToast();
    return;
  }

  const btn = elements.syncPricesBtn;
  btn.disabled = true;
  const origHTML = btn.innerHTML;
  btn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border:2px solid rgba(255,255,255,0.2);border-top-color:var(--gold);border-radius:50%;animation:spin .6s linear infinite;display:inline-block;"></span> ' + window.t('stash.syncing');

  try {
    const league = getResolvedActiveLeague();
    const result = await window.electronAPI.syncPrices({ league });
    if (!isStashTrackingEnabled()) {
      return;
    }

    stashState.pricesSynced = true;
    if (elements.priceItemCount) {
      elements.priceItemCount.textContent = `${result.itemCount} items`;
    }
    showToast(window.t('stash.priceData'), window.t('stash.pricesSynced', { count: result.itemCount }), 'success');
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'stash.pricesSyncFailed'), 'error');
  } finally {
    btn.disabled = !isStashTrackingEnabled();
    btn.innerHTML = origHTML;
  }
}

async function handleTakeSnapshot(type) {
  if (!isStashTrackingEnabled()) {
    showStashUnavailableToast();
    return;
  }

  const isAfter = type === 'after';
  const btn = isAfter ? elements.takeAfterSnapshotBtn : elements.takeBeforeSnapshotBtn;
  const infoEl = isAfter ? elements.afterSnapshotInfo : elements.beforeSnapshotInfo;
  const stepEl = isAfter ? elements.snapshotStepAfter : elements.snapshotStepBefore;

  if (!btn) return;

  // Check if prices are synced first
  if (!stashState.pricesSynced) {
    showToast(window.t('toast.error'), window.t('stash.syncPricesFirst'), 'warning');
    return;
  }

  btn.disabled = true;
  const origHTML = btn.innerHTML;
  btn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border:2px solid rgba(255,255,255,0.2);border-top-color:var(--gold);border-radius:50%;animation:spin .6s linear infinite;display:inline-block;"></span> ' + window.t('stash.scanning');

  try {
    const snapshotId = type;
    const result = await window.electronAPI.takeStashSnapshot({ snapshotId });
    if (!isStashTrackingEnabled()) {
      return;
    }

    if (isAfter) {
      stashState.afterSnapshotId = snapshotId;
    } else {
      stashState.beforeSnapshotId = snapshotId;
      // Enable "after" button
      if (elements.takeAfterSnapshotBtn) {
        elements.takeAfterSnapshotBtn.disabled = false;
      }
    }

    // Update step visuals
    if (stepEl) {
      stepEl.classList.add('done');
      stepEl.classList.remove('active');
    }

    if (infoEl) {
      infoEl.textContent = `${result.itemCount} items · ${Math.round(result.totalChaos)}c`;
      infoEl.classList.add('has-data');
    }

    // Update tracker status
    updateStashTrackerStatus();

    // Show calculate button if both snapshots exist
    if (stashState.beforeSnapshotId && stashState.afterSnapshotId) {
      if (elements.calculateProfitBtn) {
        elements.calculateProfitBtn.classList.remove('hidden');
      }
    }

    showToast(window.t('stash.profitTracker'), window.t('stash.snapshotTaken', { count: result.itemCount }), 'success');
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'stash.snapshotFailed'), 'error');
  } finally {
    btn.disabled = !isStashTrackingEnabled();
    btn.innerHTML = origHTML;
  }
}

async function handleCalculateProfit() {
  if (!elements.calculateProfitBtn) return;
  if (!isStashTrackingEnabled()) {
    showStashUnavailableToast();
    return;
  }

  elements.calculateProfitBtn.disabled = true;

  try {
    const report = await window.electronAPI.calculateProfit(
      stashState.beforeSnapshotId,
      stashState.afterSnapshotId
    );
    if (!isStashTrackingEnabled()) {
      return;
    }

    renderProfitReport(report);
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'stash.profitFailed'), 'error');
  } finally {
    elements.calculateProfitBtn.disabled = !isStashTrackingEnabled();
  }
}

function renderProfitReport(report) {
  if (isStashTrackingUnavailable()) return;
  if (!elements.stashProfitResult) return;

  const { summary, gained, lost } = report;

  // Show result section
  elements.stashProfitResult.classList.remove('hidden');
  if (elements.calculateProfitBtn) {
    elements.calculateProfitBtn.classList.add('hidden');
  }

  // Main profit value
  if (elements.profitChaosValue) {
    const val = Math.round(summary.netProfitChaos);
    elements.profitChaosValue.textContent = `${val >= 0 ? '+' : ''}${val}c`;
    elements.profitChaosValue.className = 'profit-value ' + (val >= 0 ? 'positive' : 'negative');
  }

  if (elements.profitDivineValue) {
    elements.profitDivineValue.textContent = `${summary.netProfitDivine.toFixed(1)} div`;
  }

  if (elements.profitGainedValue) {
    elements.profitGainedValue.textContent = `+${Math.round(summary.totalGainedChaos)}c`;
  }

  if (elements.profitLostValue) {
    elements.profitLostValue.textContent = `-${Math.round(summary.totalLostChaos)}c`;
  }

  // Render item list
  if (elements.profitItemsList) {
    const allItems = [
      ...gained.map(i => ({ ...i, changeType: 'gained' })),
      ...lost.map(i => ({ ...i, changeType: 'lost' }))
    ].sort((a, b) => b.totalChaosValue - a.totalChaosValue);

    // Show top 20 items
    const top = allItems.slice(0, 20);
    elements.profitItemsList.innerHTML = top.map(item => {
      const sign = item.changeType === 'gained' ? '+' : '-';
      const cls = item.changeType === 'gained' ? 'gained' : 'lost';
      const iconHtml = item.icon
        ? `<img class="profit-item-icon" src="${escapeHTML(item.icon)}" alt="">`
        : '';
      return `<div class="profit-item-row">
        <div class="profit-item-left">
          ${iconHtml}
          <span class="profit-item-name">${escapeHTML(item.name)}</span>
          <span class="profit-item-qty">x${Math.abs(item.quantityDiff)}</span>
        </div>
        <span class="profit-item-value ${cls}">${sign}${Math.round(item.totalChaosValue)}c</span>
      </div>`;
    }).join('');
  }

  // Update status badge
  if (elements.stashTrackerStatus) {
    const val = Math.round(summary.netProfitChaos);
    elements.stashTrackerStatus.textContent = `${val >= 0 ? '+' : ''}${val}c`;
    elements.stashTrackerStatus.style.color = val >= 0 ? 'var(--green)' : 'var(--red)';
  }
}

function handleResetSnapshots() {
  if (isStashTrackingUnavailable()) {
    showStashUnavailableToast();
    return;
  }

  stashState.beforeSnapshotId = null;
  stashState.afterSnapshotId = null;

  // Reset step visuals
  if (elements.snapshotStepBefore) {
    elements.snapshotStepBefore.classList.remove('done');
  }
  if (elements.snapshotStepAfter) {
    elements.snapshotStepAfter.classList.remove('done');
  }
  if (elements.beforeSnapshotInfo) {
    elements.beforeSnapshotInfo.textContent = '';
    elements.beforeSnapshotInfo.classList.remove('has-data');
  }
  if (elements.afterSnapshotInfo) {
    elements.afterSnapshotInfo.textContent = '';
    elements.afterSnapshotInfo.classList.remove('has-data');
  }
  if (elements.takeAfterSnapshotBtn) {
    elements.takeAfterSnapshotBtn.disabled = true;
  }
  if (elements.calculateProfitBtn) {
    elements.calculateProfitBtn.classList.add('hidden');
  }
  if (elements.stashProfitResult) {
    elements.stashProfitResult.classList.add('hidden');
  }
  if (elements.stashTrackerStatus) {
    elements.stashTrackerStatus.textContent = window.t('stash.ready');
    elements.stashTrackerStatus.style.color = '';
  }
}

function updateStashTrackerStatus() {
  if (!elements.stashTrackerStatus) return;
  if (state.capabilities?.stashTracking?.enabled === false) {
    elements.stashTrackerStatus.textContent = getCurrentStashUnavailableText();
    elements.stashTrackerStatus.style.color = '';
    return;
  }

  if (stashState.beforeSnapshotId && stashState.afterSnapshotId) {
    elements.stashTrackerStatus.textContent = window.t('stash.readyToCalc');
  } else if (stashState.beforeSnapshotId) {
    elements.stashTrackerStatus.textContent = window.t('stash.runMaps');
  } else {
    elements.stashTrackerStatus.textContent = window.t('stash.ready');
  }
}

function updateGameStatusIndicator(version) {
  const indicator = document.getElementById('game-status-indicator');
  if (!indicator) return;

  if (version) {
    const label = version === 'poe2' ? 'PoE 2' : 'PoE 1';
    indicator.innerHTML = `<span class="game-status-dot running"></span> ${label}`;
    indicator.classList.add('active');
  } else {
    indicator.innerHTML = `<span class="game-status-dot"></span> ${window.t('game.notRunning')}`;
    indicator.classList.remove('active');
  }
}

async function checkInitialGameStatus() {
  try {
    const status = await window.electronAPI.getDetectedGame();
    syncRendererGameContext(status.version, {
      settingsVersion: status.settingsVersion || state.settings.poeVersion,
      lastDetectedVersion: status.lastDetectedVersion
    });
  } catch {
    // Ignore
  }
}

async function loadPriceStatus() {
  try {
    const status = await window.electronAPI.getPriceStatus();
    if (elements.priceItemCount && status.itemCount > 0) {
      elements.priceItemCount.textContent = `${status.itemCount} items`;
      stashState.pricesSynced = true;
    }
  } catch {
    // Ignore
  }
}

function closeSessionDrawer() {
  state.selectedSession = null;
  if (!elements.sessionDrawer) return;
  elements.sessionDrawer.classList.add('hidden');
  elements.sessionDrawer.setAttribute('aria-hidden', 'true');
  if (elements.sessionDrawerStrategy) elements.sessionDrawerStrategy.value = '';
  if (elements.sessionDrawerNotes) elements.sessionDrawerNotes.value = '';
  if (elements.sessionDrawerSave) elements.sessionDrawerSave.disabled = false;
  if (elements.sessionDrawerAnalytics) elements.sessionDrawerAnalytics.innerHTML = '';
}

function renderSessionDrawer() {
  const session = state.selectedSession;
  if (!session || !elements.sessionDrawerSummary || !elements.sessionDrawerLoot || !elements.sessionDrawerAnalytics) return;

  const contextLabel = `${session.poeVersion === 'poe2' ? 'PoE 2' : 'PoE 1'} / ${escapeHTML(session.league || 'Standard')}`;
  const lootEntries = Array.isArray(session.lootEntries) ? session.lootEntries : [];
  const totalLoot = parseFloat(session.totalLootChaos || 0);
  const profit = parseFloat(session.profitChaos || 0);
  const cost = parseFloat(session.costChaos || 0);
  const poeVersion = session.poeVersion || state.settings.poeVersion || 'poe1';
  const analytics = buildSessionAnalytics(lootEntries);
  const safeStatus = ['active', 'completed', 'abandoned'].includes(session.status) ? session.status : 'unknown';

  elements.sessionDrawerTitle.textContent = session.mapName || 'Session';
  elements.sessionDrawerLootCount.textContent = String(lootEntries.length);
  elements.sessionDrawerSummary.innerHTML = `
    <div class="session-drawer-metric">
      <span class="session-drawer-label">${window.t('session.status')}</span>
      <span class="session-status ${safeStatus}">${window.t(`sessions.${safeStatus}`)}</span>
    </div>
    <div class="session-drawer-metric">
      <span class="session-drawer-label">${window.t('sessions.game')}</span>
      <span class="session-drawer-value">${contextLabel}</span>
    </div>
    <div class="session-drawer-metric">
      <span class="session-drawer-label">${window.t('session.tier')}</span>
      <span class="session-drawer-value">${session.mapTier ? `T${session.mapTier}` : '-'}</span>
    </div>
    <div class="session-drawer-metric">
      <span class="session-drawer-label">${window.t('sessions.duration')}</span>
      <span class="session-drawer-value">${session.durationSec ? formatDuration(session.durationSec) : '-'}</span>
    </div>
    <div class="session-drawer-metric">
      <span class="session-drawer-label">${window.t('sessions.cost')}</span>
      <span class="session-drawer-value">${currencyHTML(cost, 'chaos', 15, poeVersion)}</span>
    </div>
    <div class="session-drawer-metric">
      <span class="session-drawer-label">${window.t('sessions.totalLoot')}</span>
      <span class="session-drawer-value">${currencyHTML(totalLoot, 'chaos', 15, poeVersion)}</span>
    </div>
    <div class="session-drawer-metric">
      <span class="session-drawer-label">${window.t('dashboard.liveProfit')}</span>
      <span class="session-drawer-value ${profit >= 0 ? 'positive' : 'negative'}">${currencyHTML(profit, 'chaos', 15, poeVersion)}</span>
    </div>
    <div class="session-drawer-metric">
      <span class="session-drawer-label">${window.t('sessions.startedAt')}</span>
      <span class="session-drawer-value">${session.startedAt ? new Date(session.startedAt).toLocaleString() : '-'}</span>
    </div>
    <div class="session-drawer-metric">
      <span class="session-drawer-label">${window.t('sessions.endedAt')}</span>
      <span class="session-drawer-value">${session.endedAt ? new Date(session.endedAt).toLocaleString() : '-'}</span>
    </div>
  `;

  if (elements.sessionDrawerStrategy) {
    elements.sessionDrawerStrategy.value = session.strategyTag || '';
  }
  if (elements.sessionDrawerNotes) {
    elements.sessionDrawerNotes.value = session.notes || '';
  }
  if (elements.sessionDrawerSave) {
    elements.sessionDrawerSave.disabled = false;
  }

  if (!analytics.length) {
    elements.sessionDrawerAnalytics.innerHTML = `<p class="empty-state">${window.t('sessions.analyticsEmpty')}</p>`;
  } else {
    const maxValue = Math.max(...analytics.map((entry) => entry.totalValue), 1);
    elements.sessionDrawerAnalytics.innerHTML = analytics
      .map((entry) => {
        const barWidth = Math.max(12, Math.round((entry.totalValue / maxValue) * 100));
        return `
          <article class="session-analytics-item">
            <div class="session-analytics-main">
              <div class="session-analytics-row">
                <span class="session-analytics-name">${escapeHTML(entry.label)}</span>
                <span class="session-analytics-value">${currencyHTML(entry.totalValue, 'chaos', 14, poeVersion)}</span>
              </div>
              <div class="session-analytics-meta">${entry.quantity} ${window.t('sessions.analyticsItems')} / ${entry.entries} ${window.t('sessions.analyticsEntries')}</div>
              <div class="session-analytics-bar">
                <span style="width: ${barWidth}%"></span>
              </div>
            </div>
          </article>
        `;
      })
      .join('');
  }

  if (!lootEntries.length) {
    elements.sessionDrawerLoot.innerHTML = `<p class="empty-state">${window.t('sessions.detailEmptyLoot')}</p>`;
    return;
  }

  elements.sessionDrawerLoot.innerHTML = lootEntries
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((loot) => {
      const totalValue = (parseFloat(loot.chaosValue || 0) * parseInt(loot.quantity || 1, 10)) || 0;
      const typeLabel = loot.itemType ? escapeHTML(loot.itemType.replace(/_/g, ' ')) : '-';
      return `
        <article class="session-drawer-loot-item">
          <div class="session-drawer-loot-main">
            <div class="session-drawer-loot-name-row">
              <span class="recent-loot-quantity">x${parseInt(loot.quantity || 1, 10)}</span>
              <span class="session-drawer-loot-name">${escapeHTML(loot.itemName || 'Unknown Item')}</span>
            </div>
            <div class="session-drawer-loot-meta">${typeLabel} / ${loot.createdAt ? timeAgo(loot.createdAt) : '-'}</div>
          </div>
          <div class="session-drawer-loot-value">${currencyHTML(totalValue, 'chaos', 14, poeVersion)}</div>
        </article>
      `;
    })
    .join('');
}

async function handleSessionMetadataSave() {
  if (!state.selectedSession?.id || !elements.sessionDrawerSave) {
    return;
  }

  const payload = {
    strategyTag: elements.sessionDrawerStrategy ? elements.sessionDrawerStrategy.value : '',
    notes: elements.sessionDrawerNotes ? elements.sessionDrawerNotes.value : ''
  };

  const originalLabel = elements.sessionDrawerSave.textContent;
  elements.sessionDrawerSave.disabled = true;

  try {
    const updatedSession = await window.electronAPI.updateSessionDetails(state.selectedSession.id, payload);
    state.selectedSession = updatedSession;

    if (state.currentSession?.id === updatedSession.id) {
      state.currentSession = {
        ...state.currentSession,
        strategyTag: updatedSession.strategyTag,
        notes: updatedSession.notes
      };
      updateActiveSessionUI();
    }

    state.sessions = state.sessions.map((session) => (
      session.id === updatedSession.id ? { ...session, ...updatedSession } : session
    ));

    renderSessionDrawer();
    renderSessionsList();
    showToast(window.t('sessions.detailKicker'), window.t('toast.sessionUpdated'), 'success');
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'toast.sessionUpdateError'), 'error');
  } finally {
    if (elements.sessionDrawerSave) {
      elements.sessionDrawerSave.disabled = false;
      elements.sessionDrawerSave.textContent = originalLabel;
      applyLocalizedChrome();
    }
  }
}

function buildSessionAnalytics(lootEntries) {
  const grouped = new Map();

  lootEntries.forEach((loot) => {
    const key = normalizeLootCategory(loot.itemType);
    const current = grouped.get(key) || {
      key,
      label: formatLootCategoryLabel(key),
      quantity: 0,
      entries: 0,
      totalValue: 0
    };

    current.quantity += parseInt(loot.quantity || 0, 10) || 0;
    current.entries += 1;
    current.totalValue += (parseFloat(loot.chaosValue || 0) * (parseInt(loot.quantity || 1, 10) || 1)) || 0;
    grouped.set(key, current);
  });

  return Array.from(grouped.values()).sort((left, right) => {
    if (right.totalValue !== left.totalValue) {
      return right.totalValue - left.totalValue;
    }

    if (right.quantity !== left.quantity) {
      return right.quantity - left.quantity;
    }

    return left.label.localeCompare(right.label);
  });
}

function normalizeLootCategory(itemType) {
  if (typeof itemType !== 'string') {
    return 'other';
  }

  const normalized = itemType.trim().toLowerCase();
  return normalized || 'other';
}

function formatLootCategoryLabel(itemType) {
  const normalized = normalizeLootCategory(itemType);
  if (normalized === 'divination_card') return 'Divination Card';
  if (normalized === 'delirium_orb') return 'Delirium Orb';
  if (normalized === 'other') return 'Other';

  return normalized
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

// ==================== CURRENCY PAGE ====================

// PoE 1 item category types — includes PoE1-exclusive mechanics
const POE1_CATEGORY_TYPES = [
  { value: '', labelKey: 'category.all', label: 'All', icon: null },
  { value: 'currency', labelKey: 'category.currency', label: 'Currency', icon: 'chaos' },
  { value: 'fragment', labelKey: 'category.fragment', label: 'Fragment', icon: 'vaal' },
  { value: 'scarab', labelKey: 'category.scarab', label: 'Scarab', icon: 'chance' },
  { value: 'essence', labelKey: 'category.essence', label: 'Essence', icon: 'fusing' },
  { value: 'fossil', labelKey: 'category.fossil', label: 'Fossil', icon: 'chromatic', poe1Only: true },
  { value: 'map', labelKey: 'category.map', label: 'Map', icon: 'alchemy' },
  { value: 'divination_card', labelKey: 'category.divCard', label: 'Div Card', icon: 'divine' },
  { value: 'gem', labelKey: 'category.gem', label: 'Gem', icon: 'gcp' },
  { value: 'unique', labelKey: 'category.unique', label: 'Unique', icon: 'exalted' },
  { value: 'oil', labelKey: 'category.oil', label: 'Oil', icon: 'blessed', poe1Only: true },
  { value: 'beast', labelKey: 'category.beast', label: 'Beast', icon: 'chance', poe1Only: true },
  { value: 'incubator', labelKey: 'category.incubator', label: 'Incubator', icon: 'regret', poe1Only: true },
  { value: 'delirium_orb', labelKey: 'category.deliriumOrb', label: 'Delirium Orb', icon: 'chromatic', poe1Only: true },
  { value: 'catalyst', labelKey: 'category.catalyst', label: 'Catalyst', icon: 'scouring' },
  { value: 'omen', labelKey: 'category.omen', label: 'Omen', icon: 'regal', poe1Only: true },
  { value: 'tattoo', labelKey: 'category.tattoo', label: 'Tattoo', icon: 'blessed', poe1Only: true },
  { value: 'base_type', labelKey: 'category.baseType', label: 'Base Type', icon: 'alchemy', poe1Only: true },
  { value: 'other', labelKey: 'category.other', label: 'Other', icon: 'alteration' },
];

// PoE 2 item category types — exchange API categories
const POE2_CATEGORY_TYPES = [
  { value: '', labelKey: 'category.all', label: 'All', icon: null },
  { value: 'currency', labelKey: 'category.currency', label: 'Currency', icon: 'chaos' },
  { value: 'fragment', labelKey: 'category.fragment', label: 'Fragment', icon: 'vaal', poe2Only: true },
  { value: 'essence', labelKey: 'category.essence', label: 'Essence', icon: 'fusing' },
  { value: 'rune', labelKey: 'category.rune', label: 'Rune', icon: 'regal', poe2Only: true },
  { value: 'gem', labelKey: 'category.gem', label: 'Gem', icon: 'gcp' },
  { value: 'soul_core', labelKey: 'category.soulCore', label: 'Soul Core', icon: 'divine', poe2Only: true },
  { value: 'idol', labelKey: 'category.idol', label: 'Idol', icon: 'exalted', poe2Only: true },
  { value: 'expedition', labelKey: 'category.expedition', label: 'Expedition', icon: 'chance', poe2Only: true },
  { value: 'ultimatum', labelKey: 'category.ultimatum', label: 'Ultimatum', icon: 'regal', poe2Only: true },
  { value: 'other', labelKey: 'category.other', label: 'Other', icon: 'alteration' },
];

const currencyState = {
  poeVersion: 'poe1',
  league: '',
  type: '',
  search: '',
  sortField: 'chaosValue',
  sortDir: 'desc',
  prices: [],
  searchTimer: null
};

function updateTypeFilterDropdown() {
  const container = document.getElementById('currency-type-filter');
  if (!container) return;
  const isPoe2 = currencyState.poeVersion === 'poe2';
  const types = isPoe2 ? POE2_CATEGORY_TYPES : POE1_CATEGORY_TYPES;

  // If current type doesn't exist in new version, reset
  if (!types.find(t => t.value === currencyState.type)) {
    currencyState.type = '';
  }

  // Version badge before filter tabs
  const versionTag = isPoe2
    ? '<span class="currency-version-badge poe2">PoE 2</span>'
    : '<span class="currency-version-badge poe1">PoE 1</span>';

  container.innerHTML = versionTag + types.map(t => {
    const active = currencyState.type === t.value ? ' active' : '';
    const label = window.t ? (window.t(t.labelKey) || t.label) : t.label;
    const exclusiveClass = t.poe1Only ? ' poe1-exclusive' : (t.poe2Only ? ' poe2-exclusive' : '');
    const iconHTML = t.icon
      ? `<img src="${getCurrencyAssetPath(t.icon, currencyState.poeVersion)}" class="currency-tab-icon" width="14" height="14" draggable="false">`
      : '';
    return `<button class="currency-type-btn${active}${exclusiveClass}" data-type="${t.value}" title="${label}">${iconHTML}<span>${label}</span></button>`;
  }).join('');

  // Bind click events
  container.querySelectorAll('.currency-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.currency-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currencyState.type = btn.dataset.type;
      loadCurrencyPrices();
    });
  });
}

function setupCurrencyListeners() {
  // PoE version toggle
  document.querySelectorAll('.poe-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.poe-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currencyState.poeVersion = btn.dataset.poe;
      currencyState.league = '';
      currencyState.type = '';
      updateTypeFilterDropdown();
      loadCurrencyLeagues();
      loadCurrencyPrices();
    });
  });

  // League select
  const leagueSelect = document.getElementById('currency-league');
  if (leagueSelect) {
    leagueSelect.addEventListener('change', () => {
      currencyState.league = leagueSelect.value;
      loadCurrencyPrices();
    });
  }

  // Search
  const searchInput = document.getElementById('currency-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(currencyState.searchTimer);
      currencyState.searchTimer = setTimeout(() => {
        currencyState.search = searchInput.value;
        loadCurrencyPrices();
      }, 300);
    });
  }

  // Sync button
  const syncBtn = document.getElementById('currency-sync-btn');
  if (syncBtn) {
    syncBtn.addEventListener('click', handleCurrencySync);
  }

  // Sort headers
  document.querySelectorAll('.currency-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (currencyState.sortField === field) {
        currencyState.sortDir = currencyState.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        currencyState.sortField = field;
        currencyState.sortDir = 'desc';
      }
      document.querySelectorAll('.currency-table th.sortable').forEach(h => h.classList.remove('active', 'asc'));
      th.classList.add('active');
      if (currencyState.sortDir === 'asc') th.classList.add('asc');
      renderCurrencyTable();
    });
  });
}

async function loadCurrencyPage() {
  currencyState.poeVersion = state.settings.poeVersion || 'poe1';
  document.querySelectorAll('.poe-toggle-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.poe === currencyState.poeVersion);
  });
  updateTypeFilterDropdown();
  await loadCurrencyLeagues();
  await loadCurrencyPrices();

  const syncBtn = document.getElementById('currency-sync-btn');
  if (syncBtn) {
    syncBtn.disabled = !canCurrentUserSyncPrices();
    syncBtn.title = canCurrentUserSyncPrices() ? '' : window.t('currency.syncRestricted');
  }
}

// Fallback PoE leagues (used when API is unreachable)
const FALLBACK_POE1_LEAGUES = ['Mirage', 'Hardcore Mirage', 'SSF Mirage', 'HC SSF Mirage', 'Standard', 'Hardcore'];
const FALLBACK_POE2_LEAGUES = ['Fate of the Vaal', 'HC Fate of the Vaal', 'Standard', 'Hardcore'];

async function loadCurrencyLeagues() {
  const select = document.getElementById('currency-league');
  if (!select) return;

  let allLeagues = [];
  let activeLeagueNames = [];

  try {
    const res = await window.electronAPI.getCurrencyLeagues(currencyState.poeVersion);
    // apiClient unwraps: res = { leagues: [...], activeLeagues: [...] }
    const leagueData = res?.data || res || {};

    // Use active leagues from poe.ninja if available
    if (leagueData.activeLeagues && leagueData.activeLeagues.length > 0) {
      activeLeagueNames = leagueData.activeLeagues.map(l => l.name || l.displayName).filter(Boolean);
      allLeagues = [...activeLeagueNames];
    }

    // Add any DB-only leagues not in the active list
    const dbLeagues = leagueData.leagues || [];
    for (const l of dbLeagues) {
      if (!allLeagues.includes(l)) allLeagues.push(l);
    }
  } catch { }

  // Always merge fallback leagues so standard options are available
  const fallback = currencyState.poeVersion === 'poe2' ? FALLBACK_POE2_LEAGUES : FALLBACK_POE1_LEAGUES;
  for (const l of fallback) {
    if (!allLeagues.includes(l)) allLeagues.push(l);
  }

  select.innerHTML = allLeagues.map(l => `<option value="${escapeHTML(l)}">${escapeHTML(l)}</option>`).join('');

  const preferredLeague = [
    currencyState.league,
    activeLeagueNames[0],
    getResolvedActiveLeague(),
    allLeagues[0],
    'Standard'
  ].find((value) => value && allLeagues.includes(value));

  currencyState.league = preferredLeague || 'Standard';
  select.value = currencyState.league;
}

async function loadCurrencyPrices() {
  const tbody = document.getElementById('currency-table-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="currency-empty">${window.t('currency.loading')}</td></tr>`;

  try {
    const params = { poeVersion: currencyState.poeVersion, limit: '500' };
    if (currencyState.league) params.league = currencyState.league;
    if (currencyState.type) params.type = currencyState.type;
    if (currencyState.search) params.search = currencyState.search;

    const json = await window.electronAPI.getCurrencyPrices(params);
    // apiClient unwraps response.data twice: axios interceptor strips HTTP envelope,
    // then getPrices() accesses .data — so json = { prices: [...], count, league }
    currencyState.prices = json?.prices || json?.data?.prices || [];
    renderCurrencyTable();

    const footer = document.getElementById('currency-footer');
    if (footer) {
      const count = json?.count || json?.data?.count || 0;
      const updated = json?.updatedAt || json?.data?.updatedAt;
      footer.textContent = `${count} items` + (updated ? ` · Last synced: ${timeAgo(updated)}` : '');
    }
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="currency-empty">${getUserFacingErrorMessage(error, 'currency.loadError')}</td></tr>`;
  }
}

function renderCurrencyTable() {
  const tbody = document.getElementById('currency-table-body');
  if (!tbody) return;

  const sorted = [...currencyState.prices].sort((a, b) => {
    if (currencyState.sortField === 'itemName') {
      const av = (a.itemName || '').toLowerCase();
      const bv = (b.itemName || '').toLowerCase();
      return currencyState.sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    const av = parseFloat(a[currencyState.sortField]) || 0;
    const bv = parseFloat(b[currencyState.sortField]) || 0;
    return currencyState.sortDir === 'asc' ? av - bv : bv - av;
  });

  if (sorted.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="currency-empty">${window.t('currency.noData')}</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted.map((item, i) => {
    const icon = item.iconUrl
      ? `<img src="${item.iconUrl}" class="currency-row-icon" loading="lazy">`
      : '<div class="currency-row-icon-placeholder"></div>';
    const chaos = parseFloat(item.chaosValue) || 0;
    const divine = parseFloat(item.divineValue);
    const spark = renderSparklineSVG(item.sparklineData);
    return `<tr>
      <td class="currency-td-num">${i + 1}</td>
      <td class="currency-td-icon">${icon}</td>
      <td class="currency-td-name">${escapeHTML(item.itemName)}</td>
      <td class="currency-td-type"><span class="currency-type-badge">${item.itemType || '-'}</span></td>
      <td class="currency-td-chaos">${currencyHTML(chaos, 'chaos', 18, currencyState.poeVersion)}</td>
      <td class="currency-td-divine">${divine ? currencyHTML(divine, 'divine', 18, currencyState.poeVersion) : '<span class="text-muted">-</span>'}</td>
      <td class="currency-td-trend">${spark}</td>
    </tr>`;
  }).join('');
}

function renderSparklineSVG(sparkData) {
  if (!sparkData || !sparkData.data || sparkData.data.length < 2) return '';
  const values = sparkData.data.filter(v => v !== null);
  if (values.length < 2) return '';

  const w = 70, h = 20, pad = 2;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = pad + (h - pad * 2) - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  }).join(' ');

  const color = values[values.length - 1] >= values[0] ? '#3ddc84' : '#ff5252';
  return `<svg width="${w}" height="${h}"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

const _escapeDiv = document.createElement('div');
function escapeHTML(str) {
  if (str == null) return '';
  _escapeDiv.textContent = String(str);
  return _escapeDiv.innerHTML;
}

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

async function handleCurrencySync() {
  if (!canCurrentUserSyncPrices()) {
    showToast(window.t('toast.currencyTitle'), window.t('currency.syncRestricted'), 'warning');
    return;
  }

  const btn = document.getElementById('currency-sync-btn');
  if (btn) { btn.disabled = true; btn.textContent = window.t('currency.syncing'); }

  try {
    const result = await window.electronAPI.syncCurrencyPrices({
      league: currencyState.league,
      poeVersion: currencyState.poeVersion
    });
    // apiClient unwraps: result = { message, league, results } (inner .data of API response)
    // Sync succeeded if we got here without throwing
    showToast(window.t('toast.currencyTitle'), window.t('currency.syncSuccess'), 'success');
    await loadCurrencyLeagues();
    await loadCurrencyPrices();
  } catch (e) {
    showToast(window.t('toast.currencyTitle'), getUserFacingErrorMessage(e, 'currency.syncFailed'), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = window.t('currency.sync'); }
  }
}

/**
 * Sureyi formatla
 */
function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}${window.t('misc.durationMin')} ${secs}${window.t('misc.durationSec')}`;
}

function getLiveDuration(session) {
  if (!session?.startedAt) return 0;
  const endTime = session.endedAt ? new Date(session.endedAt).getTime() : Date.now();
  const startTime = new Date(session.startedAt).getTime();
  return Math.max(0, Math.floor((endTime - startTime) / 1000));
}

// Uygulamayi baslat
document.addEventListener('DOMContentLoaded', () => {
  ensureSessionClock();
  init();
});
