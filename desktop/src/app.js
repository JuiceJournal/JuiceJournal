/**
 * Juice Journal - Desktop App JavaScript
 * Renderer process logic
 */

// Global app state for i18n
window._appState = { language: 'en' };

// State management
const state = {
  currentUser: null,
  currentSession: null,
  settings: {},
  detectedGameVersion: null,
  activeLeagueOptions: {},
  leagueOptionsLoaded: false,
  sessions: [],
  farmingHubRuns: [],
  // The newest Hub load; an older reply cannot cover the off panel or newer filters.
  farmingHubLoadId: 0,
  // Saved online setting and whether the app holds a server session; the Farming Hub and sharing need both.
  onlineAccount: { enabled: false, signedIn: false },
  mapResults: [],
  // Id of the map result persistMapResultHistory just saved; the next latest-result render lands it once.
  landingMapResultKey: null,
  // The last id persistMapResultHistory handed over, so a result saved twice (session-ended and the end call) lands once.
  landedMapResultKey: null,
  // The Last Map Result profit markup last written, so a repeat render leaves a running count-up alone.
  latestMapResultProfitHTML: null,
  recentLoot: [],
  account: null,
  characterSession: null,
  deviceCharactersByGame: {},
  poeDeviceConnected: false,
  // Whether the device sign-in may read stashes (account:stashes); the built-in sign-in does not ask for it.
  poeStashAccess: false,
  runtimeSession: null,
  overlay: null,
  profitCurrencyRates: {},
  appUpdate: null,
  capabilities: null,
  selectedSession: null,
  auditTrail: [],
  mapSessionPromptActive: false,
  farmType: window.farmTypeModel
    ? window.farmTypeModel.createFarmTypeState()
    : { selectedFarmTypeId: null }
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
  'Invalid username or password': 'errors.invalidCredentials',
  'Username or email is required': 'errors.usernameOrEmailRequired',
  'Password is required': 'errors.passwordRequired',
  'Username must be between 3 and 50 characters': 'errors.usernameLength',
  'Username may only contain letters and numbers': 'errors.usernameAlphanumeric',
  'Enter a valid email address': 'errors.emailInvalid',
  'Password must be at least 6 characters': 'errors.passwordMinLength',
  'That username is already in use': 'errors.usernameTaken',
  'That email address is already in use': 'errors.emailTaken',
  'An error occurred during registration': 'errors.registerFailed',
  'An error occurred during sign in': 'errors.loginFailed',
  'Failed to load profile details': 'errors.profileLoad',
  'Failed to update profile': 'errors.profileUpdate',
  'Session not found': 'errors.sessionNotFound',
  'Active session not found': 'errors.activeSessionNotFound',
  'Failed to load session details': 'errors.sessionLoad',
  'Failed to load sessions': 'errors.sessionListLoad',
  'Failed to update session details': 'errors.sessionUpdate',
  'Failed to start the session': 'errors.sessionStart',
  'Failed to end the session': 'errors.sessionEnd',
  'Failed to publish farm run': 'errors.farmPublish',
  'No active session': 'errors.noActiveSession',
  'Failed to add loot': 'errors.lootAdd',
  'Failed to load recent loot': 'errors.lootRecent',
  'Path of Exile OAuth is not configured': 'errors.poeOAuthNotConfigured',
  'Invalid redirect URI': 'errors.invalidRedirectUri',
  'Authorization code and PKCE verifier are required': 'errors.authorizationCodeRequired',
  'Failed to start Path of Exile linking': 'errors.poeStart',
  'Failed to complete Path of Exile linking': 'errors.poeComplete',
  'Failed to get Path of Exile link status': 'errors.poeStatus',
  'Failed to disconnect Path of Exile account': 'errors.poeDisconnect',
  'Unable to reach the server': 'errors.serverUnavailable',
  'Online features are turned off': 'errors.onlineDisabled',
  'Turn on online features to share farm runs': 'errors.onlineDisabled',
  'The request timed out': 'errors.requestTimeout',
  'An unexpected error occurred': 'errors.unexpected',
  'Unauthorized request': 'errors.loginFailed'
};

let sessionClockInterval = null;

// DOM elements
const elements = {
  // Modals
  loginModal: document.getElementById('login-modal'),
  registerModal: document.getElementById('register-modal'),
  mapSessionModal: document.getElementById('map-session-modal'),
  mapSessionForm: document.getElementById('map-session-form'),
  mapSessionNameInput: document.getElementById('map-session-name-input'),
  mapSessionFarmTypeSelect: document.getElementById('map-session-farm-type-select'),
  mapSessionDefaultName: document.getElementById('map-session-default-name'),
  mapSessionContext: document.getElementById('map-session-context'),
  mapSessionConfirmBtn: document.getElementById('map-session-confirm-btn'),
  mapSessionCancelBtn: document.getElementById('map-session-cancel-btn'),
  farmPublishModal: document.getElementById('farm-publish-modal'),
  farmPublishForm: document.getElementById('farm-publish-form'),
  farmPublishSummary: document.getElementById('farm-publish-summary'),
  farmPublishVisibility: document.getElementById('farm-publish-visibility'),
  farmPublishDescription: document.getElementById('farm-publish-description'),
  farmPublishInvestmentKnown: document.getElementById('farm-publish-investment-known'),
  farmPublishConfirmBtn: document.getElementById('farm-publish-confirm-btn'),
  farmPublishCancelBtn: document.getElementById('farm-publish-cancel-btn'),

  // Forms
  loginForm: document.getElementById('login-form'),
  registerForm: document.getElementById('register-form'),

  // Navigation
  navButtons: document.querySelectorAll('.nav-btn'),
  pages: document.querySelectorAll('.page'),

  // Dashboard
  characterSummaryCard: document.getElementById('character-summary-card'),
  characterBanner: document.getElementById('character-banner'),
  characterBannerImage: document.getElementById('character-banner-image'),
  characterPortrait: document.getElementById('character-portrait'),
  characterPortraitImage: document.getElementById('character-portrait-image'),
  characterPortraitBadge: document.getElementById('character-portrait-badge'),
  characterName: document.getElementById('character-name'),
  characterClass: document.getElementById('character-class'),
  characterLevel: document.getElementById('character-level'),
  characterLeague: document.getElementById('character-league'),
  characterStatus: document.getElementById('character-status'),
  characterGameVersion: document.getElementById('character-game-version'),
  characterPickerField: document.getElementById('character-picker-field'),
  characterPicker: document.getElementById('character-picker'),
  characterConnectBtn: document.getElementById('character-connect-btn'),
  activeSession: document.getElementById('active-session'),
  sessionFarmTypeSelect: document.getElementById('session-farm-type-select'),
  clearFarmTypeBtn: document.getElementById('clear-farm-type-btn'),
  startSessionBtn: document.getElementById('start-session-btn'),
  endSessionBtn: document.getElementById('end-session-btn'),
  scanScreenBtn: document.getElementById('scan-screen-btn'),
  scanScreenLabel: document.getElementById('scan-screen-label'),
  scanHotkeyBadge: document.getElementById('scan-hotkey-badge'),
  todaySessions: document.getElementById('today-sessions'),
  todayProfit: document.getElementById('today-profit'),
  todayAvg: document.getElementById('today-avg'),
  todayPerHour: document.getElementById('today-per-hour'),
  todayTime: document.getElementById('today-time'),
  lastMapResultCard: document.getElementById('last-map-result-card'),
  lastMapResultFarmType: document.getElementById('last-map-result-farm-type'),
  lastMapResultDuration: document.getElementById('last-map-result-duration'),
  lastMapResultProfit: document.getElementById('last-map-result-profit'),
  lastMapResultMeme: document.getElementById('last-map-result-meme'),
  mapResultFilter: document.getElementById('map-result-filter'),
  mapResultHistory: document.getElementById('map-result-history'),
  mapResultHistoryCard: document.getElementById('map-result-history-card'),
  recentLootList: document.getElementById('recent-loot-list'),

  // Sessions
  sessionsSummary: document.getElementById('sessions-summary'),
  sessionsList: document.getElementById('sessions-list'),
  sessionFilter: document.getElementById('session-filter'),
  sessionVersionFilter: document.getElementById('session-version-filter'),
  sessionLeagueFilter: document.getElementById('session-league-filter'),
  sessionFarmFilter: document.getElementById('session-farm-filter'),
  sessionSearchFilter: document.getElementById('session-search-filter'),
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

  // Farming Hub
  farmingHubList: document.getElementById('farming-hub-list'),
  farmingHubVersionFilter: document.getElementById('farming-hub-version-filter'),
  farmingHubLeagueFilter: document.getElementById('farming-hub-league-filter'),
  farmingHubFarmFilter: document.getElementById('farming-hub-farm-filter'),
  farmingHubMinProfitFilter: document.getElementById('farming-hub-min-profit-filter'),
  farmingHubRefreshBtn: document.getElementById('farming-hub-refresh-btn'),
  farmingHubFilters: document.querySelector('#farming-hub-page .farming-hub-filters'),

  // Settings
  apiUrl: document.getElementById('api-url'),
  poePath: document.getElementById('poe-path'),
  autoStartSession: document.getElementById('auto-start-session'),
  overlayEnabled: document.getElementById('overlay-enabled'),
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
  connectionStatus: document.querySelector('#settings-api .connection-status'),
  onlineEnabled: document.getElementById('online-enabled'),
  onlineAccountStatus: document.getElementById('online-account-status'),
  onlineSignIn: document.getElementById('online-sign-in'),
  onlineSignOut: document.getElementById('online-sign-out'),
  auditTrailList: document.getElementById('audit-trail-list'),
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
  appVersionValue: document.getElementById('app-version-value'),
  appUpdateStatus: document.getElementById('app-update-status'),
  appUpdateDetail: document.getElementById('app-update-detail'),
  checkUpdatesBtn: document.getElementById('check-updates-btn'),
  installUpdateBtn: document.getElementById('install-update-btn'),

  // User
  username: document.getElementById('username'),
  userAvatar: document.getElementById('user-avatar'),
  logoutBtn: document.getElementById('logout-btn'),
  sessionBadge: document.getElementById('session-badge'),
  sessionCard: document.getElementById('session-card'),

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
let mapResultModelPromise = null;
let capabilityModelPromise = null;
let overlayStateModelPromise = null;
let characterVisualModelPromise = null;
let activeCharacterRefreshTimer = null;
let activeCharacterRefreshRetryTimer = null;
let activeCharacterRefreshRequestId = 0;
let characterReconcileTimer = null;
// GGG moved the `current` flag about 10 minutes after Play in a live PoE2 test (2026-10-21).
const CHARACTER_RECONCILE_DELAY_MS = 11 * 60 * 1000;

function renderAppUpdateState() {
  const update = state.appUpdate;
  if (!elements.appVersionValue || !update) {
    return;
  }

  elements.appVersionValue.textContent = update.currentVersion || '—';

  if (!update.enabled) {
    if (elements.appUpdateStatus) {
      elements.appUpdateStatus.textContent = window.t('settings.updateDisabled');
    }
    if (elements.appUpdateDetail) {
      elements.appUpdateDetail.textContent = '';
    }
    if (elements.checkUpdatesBtn) {
      elements.checkUpdatesBtn.disabled = true;
      setButtonLabel(elements.checkUpdatesBtn, window.t('settings.checkForUpdates'));
    }
    if (elements.installUpdateBtn) {
      elements.installUpdateBtn.hidden = true;
      elements.installUpdateBtn.disabled = true;
      setButtonLabel(elements.installUpdateBtn, window.t('settings.installUpdate'));
      elements.installUpdateBtn.classList?.add('hidden');
    }
    return;
  }

  if (update.error) {
    if (elements.appUpdateStatus) {
      elements.appUpdateStatus.textContent = window.t('settings.updateError');
    }
    if (elements.appUpdateDetail) {
      elements.appUpdateDetail.textContent = update.error;
    }
  } else if (update.downloaded) {
    if (elements.appUpdateStatus) {
      elements.appUpdateStatus.textContent = window.t('settings.updateReady');
    }
    if (elements.appUpdateDetail) {
      elements.appUpdateDetail.textContent = update.nextVersion || '';
    }
  } else if (update.downloading) {
    if (elements.appUpdateStatus) {
      elements.appUpdateStatus.textContent = window.t('settings.updateDownloading', {
        percent: update.progressPercent || 0
      });
    }
    if (elements.appUpdateDetail) {
      elements.appUpdateDetail.textContent = update.nextVersion || '';
    }
  } else if (update.checking) {
    if (elements.appUpdateStatus) {
      elements.appUpdateStatus.textContent = window.t('settings.checkingForUpdates');
    }
    if (elements.appUpdateDetail) {
      elements.appUpdateDetail.textContent = '';
    }
  } else if (update.available) {
    if (elements.appUpdateStatus) {
      elements.appUpdateStatus.textContent = window.t('settings.updateAvailable', {
        version: update.nextVersion || '?'
      });
    }
    if (elements.appUpdateDetail) {
      elements.appUpdateDetail.textContent = '';
    }
  } else {
    if (elements.appUpdateStatus) {
      elements.appUpdateStatus.textContent = window.t('settings.updateUpToDate');
    }
    if (elements.appUpdateDetail) {
      elements.appUpdateDetail.textContent = '';
    }
  }

  if (elements.checkUpdatesBtn) {
    elements.checkUpdatesBtn.disabled = Boolean(update.checking || update.downloading);
    setButtonLabel(elements.checkUpdatesBtn, update.checking
      ? window.t('settings.checkingForUpdates')
      : window.t('settings.checkForUpdates'));
  }

  if (elements.installUpdateBtn) {
    elements.installUpdateBtn.hidden = !update.downloaded;
    elements.installUpdateBtn.disabled = !update.downloaded;
    setButtonLabel(elements.installUpdateBtn, window.t('settings.installUpdate'));
    elements.installUpdateBtn.classList?.toggle('hidden', !update.downloaded);
  }
}

function clearActiveCharacterRefreshTimers() {
  if (activeCharacterRefreshTimer) {
    clearTimeout(activeCharacterRefreshTimer);
    activeCharacterRefreshTimer = null;
  }
  if (activeCharacterRefreshRetryTimer) {
    clearTimeout(activeCharacterRefreshRetryTimer);
    activeCharacterRefreshRetryTimer = null;
  }
  activeCharacterRefreshRequestId += 1;
}

async function runActiveCharacterRefresh({ requestId, version } = {}) {
  const expectedRequestId = typeof requestId === 'number'
    ? requestId
    : (typeof activeCharacterRefreshRequestId === 'number' ? activeCharacterRefreshRequestId : 0);

  if (expectedRequestId !== activeCharacterRefreshRequestId || !state.currentUser) {
    return false;
  }

  return refreshDeviceCharacters(version);
}

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

function ensureMapResultModelLoaded() {
  if (window.mapResultModel) {
    return Promise.resolve(window.mapResultModel);
  }

  if (mapResultModelPromise) {
    return mapResultModelPromise;
  }

  mapResultModelPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'modules/mapResultModel.js';
    script.async = true;
    script.onload = () => {
      if (window.mapResultModel) {
        resolve(window.mapResultModel);
        return;
      }

      reject(new Error('mapResultModel loaded without exposing window.mapResultModel'));
    };
    script.onerror = () => reject(new Error('Failed to load map result model script'));
    document.head.appendChild(script);
  });

  return mapResultModelPromise;
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
    const loadCharacterVisualScript = () => {
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
    };

    if (window.characterSupportMatrix) {
      loadCharacterVisualScript();
      return;
    }

    const dependency = document.createElement('script');
    dependency.src = 'modules/characterSupportMatrix.js';
    dependency.async = true;
    dependency.onload = loadCharacterVisualScript;
    dependency.onerror = () => reject(new Error('Failed to load character support matrix script'));
    document.head.appendChild(dependency);
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

function getMapResultModel() {
  if (!window.mapResultModel) {
    throw new Error('mapResultModel is not loaded');
  }

  return window.mapResultModel;
}

function getMapResultStoreModel() {
  if (!window.mapResultStoreModel) {
    throw new Error('mapResultStoreModel is not loaded');
  }

  return window.mapResultStoreModel;
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

function getFarmTypeModel() {
  if (!window.farmTypeModel) {
    throw new Error('farmTypeModel is not loaded');
  }

  return window.farmTypeModel;
}

// Farm names carry their league content colour through data-farm-type (stored as an id or a label).
function getFarmTypeIdFor(value) {
  const resolveFarmTypeId = window.farmTypeModel?.resolveFarmTypeId;
  return typeof resolveFarmTypeId === 'function' ? resolveFarmTypeId(value) : null;
}

function farmTypeAttr(value) {
  const farmTypeId = getFarmTypeIdFor(value);
  return farmTypeId ? ` data-farm-type="${farmTypeId}"` : '';
}

function applyFarmType(element, value) {
  if (!element?.dataset) {
    return;
  }

  const farmTypeId = getFarmTypeIdFor(value);
  if (farmTypeId) {
    element.dataset.farmType = farmTypeId;
  } else {
    delete element.dataset.farmType;
  }
}

function getFarmTypePoeVersion(version = null) {
  const normalizedVersion = normalizePoeVersion(version);
  if (normalizedVersion) {
    return normalizedVersion;
  }

  if (typeof getResolvedLeagueVersion === 'function') {
    return normalizePoeVersion(getResolvedLeagueVersion()) || 'poe1';
  }

  return normalizePoeVersion(state.settings?.poeVersion) || 'poe1';
}

function listFarmTypesForVersion(version = null) {
  const { listFarmTypes } = getFarmTypeModel();
  return listFarmTypes({ poeVersion: getFarmTypePoeVersion(version) });
}

async function syncFarmTypeSelectionForVersion(version = null) {
  if (!state.farmType?.selectedFarmTypeId) {
    return null;
  }

  const poeVersion = typeof getFarmTypePoeVersion === 'function'
    ? getFarmTypePoeVersion(version)
    : (normalizePoeVersion(version)
      || (typeof getResolvedLeagueVersion === 'function' ? getResolvedLeagueVersion() : 'poe1'));
  const { isFarmTypeSupported, clearFarmType } = getFarmTypeModel();
  if (isFarmTypeSupported(state.farmType.selectedFarmTypeId, { poeVersion })) {
    return state.farmType.selectedFarmTypeId;
  }

  clearFarmType(state.farmType);
  if (window.electronAPI?.setActiveFarmType) {
    await window.electronAPI.setActiveFarmType(null);
  }
  renderFarmTypeSelector();

  return null;
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
    setToggleButtonPressed(btn, btn.dataset.version === normalizedVersion);
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
      setToggleButtonPressed(btn, btn.dataset.version === normalizedSettingsVersion);
    });
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
  if (typeof syncFarmTypeSelectionForVersion === 'function') {
    void syncFarmTypeSelectionForVersion(normalizedSettingsVersion || normalizedDetectedVersion);
  }
  if (typeof renderFarmTypeSelector === 'function') {
    renderFarmTypeSelector();
  }
  if (typeof scheduleActiveCharacterRefresh === 'function') {
    scheduleActiveCharacterRefresh({ version: normalizedDetectedVersion });
  }
}

function scheduleActiveCharacterRefresh({ version } = {}) {
  if (!version) {
    clearActiveCharacterRefreshTimers();
    return;
  }

  if (!state.currentUser) {
    return;
  }

  clearActiveCharacterRefreshTimers();
  const requestId = activeCharacterRefreshRequestId;

  activeCharacterRefreshTimer = setTimeout(async () => {
    activeCharacterRefreshTimer = null;
    const refreshed = await runActiveCharacterRefresh({ requestId, version });

    if (!refreshed && requestId === activeCharacterRefreshRequestId && state.currentUser) {
      activeCharacterRefreshRetryTimer = setTimeout(async () => {
        activeCharacterRefreshRetryTimer = null;
        await runActiveCharacterRefresh({ requestId, version });
      }, 5000);
    }
  }, 3000);
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

  if (reason === 'stash_scope_missing') {
    return 'stash.capabilityUnavailable.scope';
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
  const capabilities = getCapabilityModel().getCapabilitiesForGame(capabilityVersion, {
    stashAccess: state.poeStashAccess
  });
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

  // The card body already explains why; the header badge only says the tracker is off.
  if (elements.stashTrackerStatus && stashUnavailable) {
    elements.stashTrackerStatus.textContent = window.t('stash.off');
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

  if (elements.characterBanner) {
    elements.characterBanner.dataset.characterBanner = visual.bannerKey || 'unknown';
    elements.characterBanner.dataset.characterTone = visual.tone || 'neutral';
  }
  if (elements.characterBannerImage) {
    let bannerSource = visual.bannerPath || '';
    if (bannerSource && typeof URL === 'function' && window?.location?.href) {
      try {
        bannerSource = new URL(bannerSource, window.location.href).toString();
      } catch (error) {
        bannerSource = visual.bannerPath;
      }
    }
    elements.characterBannerImage.hidden = !visual.bannerPath;
    elements.characterBannerImage.src = bannerSource;
    elements.characterBannerImage.alt = isReady ? `${summary.name} banner` : 'Character banner';
  }
  if (elements.characterPortrait) {
    elements.characterPortrait.dataset.characterPortrait = visual.portraitKey || 'unknown';
    elements.characterPortrait.dataset.characterTone = visual.tone || 'neutral';
  }
  if (elements.characterPortraitImage) {
    let portraitSource = visual.portraitPath || '';
    if (portraitSource && typeof URL === 'function' && window?.location?.href) {
      try {
        portraitSource = new URL(portraitSource, window.location.href).toString();
      } catch (error) {
        portraitSource = visual.portraitPath;
      }
    }
    elements.characterPortraitImage.hidden = !visual.portraitPath;
    elements.characterPortraitImage.src = portraitSource;
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
    // Ascended characters keep their base class in the chip: 'Deadeye · Ranger'.
    const classChip = visual.classLabel && visual.baseClassLabel && visual.classLabel !== visual.baseClassLabel
      ? `${visual.classLabel} · ${visual.baseClassLabel}`
      : visual.classLabel;
    elements.characterClass.textContent = isReady ? classChip : 'Unknown Class';
  }
  if (elements.characterLevel) {
    elements.characterLevel.textContent = isReady && summary.level ? String(summary.level) : '—';
  }
  if (elements.characterLeague) {
    elements.characterLeague.textContent = isReady ? (summary.league || 'Unknown League') : '—';
  }
  if (elements.characterStatus) {
    const session = state.characterSession?.poeVersion === account?.activePoeVersion ? state.characterSession : null;
    elements.characterStatus.textContent = !isReady
      ? 'Character sync needed'
      : session
        ? window.t(session.confirmed ? 'dashboard.characterConfirmed' : 'dashboard.characterUnconfirmed')
        : 'Synced from Path of Exile';
  }
  if (elements.characterPicker && elements.characterPickerField) {
    const characters = isReady ? account.charactersByGame?.[account.activePoeVersion] || [] : [];
    elements.characterPickerField.hidden = characters.length < 2;
    elements.characterPicker.replaceChildren(...characters.map((character) => {
      const option = document.createElement('option');
      option.value = character.id;
      option.textContent = character.level ? `${character.name} (${character.level})` : character.name;
      return option;
    }));
    elements.characterPicker.value = isReady ? summary.id : '';
  }
  if (elements.characterConnectBtn) {
    elements.characterConnectBtn.hidden = !state.currentUser || state.poeDeviceConnected === true;
  }
  if (elements.characterGameVersion) {
    const version = normalizePoeVersion(summary.poeVersion)
      || normalizePoeVersion(account?.selectedCharacter?.poeVersion)
      || normalizePoeVersion(account?.activePoeVersion)
      || normalizePoeVersion(state.detectedGameVersion)
      || normalizePoeVersion(state.settings?.lastDetectedPoeVersion)
      || normalizePoeVersion(state.settings?.poeVersion)
      || 'poe1';
    elements.characterGameVersion.textContent = version === 'poe2' ? 'PoE 2' : 'PoE 1';
  }
}

function renderFarmTypeSelector() {
  if (!elements.sessionFarmTypeSelect || !elements.clearFarmTypeBtn) {
    return;
  }

  const { listFarmTypes } = getFarmTypeModel();
  const poeVersion = typeof getFarmTypePoeVersion === 'function'
    ? getFarmTypePoeVersion()
    : (typeof getResolvedLeagueVersion === 'function' ? getResolvedLeagueVersion() : 'poe1');
  const farmTypes = typeof listFarmTypesForVersion === 'function'
    ? listFarmTypesForVersion(poeVersion)
    : listFarmTypes({ poeVersion });
  const currentFarmTypeId = state.farmType?.selectedFarmTypeId || '';
  const selectedFarmTypeId = farmTypes.some((farmType) => farmType.id === currentFarmTypeId)
    ? currentFarmTypeId
    : '';
  const hasActiveSession = Boolean(state.currentSession);

  elements.sessionFarmTypeSelect.innerHTML = [
    '<option value="">No farm type</option>',
    ...farmTypes.map((farmType) => `<option value="${escapeHTML(farmType.id)}"${typeof farmTypeAttr === 'function' ? farmTypeAttr(farmType.id) : ''}>${escapeHTML(farmType.label)}</option>`)
  ].join('');
  elements.sessionFarmTypeSelect.value = selectedFarmTypeId;
  elements.sessionFarmTypeSelect.disabled = hasActiveSession;
  elements.clearFarmTypeBtn.disabled = hasActiveSession || !selectedFarmTypeId;
}

async function handleFarmTypeSelectionChange() {
  const { selectFarmType } = getFarmTypeModel();
  const poeVersion = typeof getFarmTypePoeVersion === 'function'
    ? getFarmTypePoeVersion()
    : (typeof getResolvedLeagueVersion === 'function' ? getResolvedLeagueVersion() : 'poe1');
  const selectedFarmTypeId = selectFarmType(state.farmType, elements.sessionFarmTypeSelect?.value || '', {
    poeVersion
  });
  if (window.electronAPI?.setActiveFarmType) {
    await window.electronAPI.setActiveFarmType(selectedFarmTypeId);
  }
  renderFarmTypeSelector();
}

async function handleFarmTypeSelectionClear() {
  const { clearFarmType } = getFarmTypeModel();
  clearFarmType(state.farmType);
  if (window.electronAPI?.setActiveFarmType) {
    await window.electronAPI.setActiveFarmType(null);
  }
  renderFarmTypeSelector();
}

async function loadActiveFarmTypeSelection() {
  if (!window.electronAPI?.getActiveFarmType) {
    return;
  }

  const { selectFarmType, clearFarmType } = getFarmTypeModel();
  const activeFarmTypeId = await window.electronAPI.getActiveFarmType();

  if (activeFarmTypeId) {
    const poeVersion = typeof getFarmTypePoeVersion === 'function'
      ? getFarmTypePoeVersion()
      : (typeof getResolvedLeagueVersion === 'function' ? getResolvedLeagueVersion() : 'poe1');
    const selectedFarmTypeId = selectFarmType(state.farmType, activeFarmTypeId, {
      poeVersion
    });
    if (!selectedFarmTypeId && window.electronAPI?.setActiveFarmType) {
      await window.electronAPI.setActiveFarmType(null);
    }
    return;
  }

  clearFarmType(state.farmType);
}

/**
 * Start the application
 */
async function init() {
  await ensureSettingsModelLoaded();
  await ensureAccountStateModelLoaded();
  await ensureRuntimeSessionModelLoaded();
  await ensureMapResultModelLoaded();
  await ensureCapabilityModelLoaded();
  await ensureOverlayStateModelLoaded();
  await ensureCharacterVisualModelLoaded();
  populateLanguageOptions();

  // Ayarlari yukle
  await loadSettings();
  await refreshOnlineAccount();
  await loadActiveFarmTypeSelection();
  populateStrategyPresets();

  // Set language from settings and apply translations
  window._appState.language = state.settings.language || 'en';
  applyLocalizedChrome();
  if (typeof renderCharacterSummaryCard === 'function') {
    renderCharacterSummaryCard();
  }
  renderFarmTypeSelector();
  renderMapResultHistory();
  updateActiveLeagueFieldContext();
  applyDashboardCapabilities();
  if (window.electronAPI?.getAppUpdateState) {
    state.appUpdate = await window.electronAPI.getAppUpdateState();
    renderAppUpdateState();
  }

  // Event listener'lari kur
  setupEventListeners();
  setupCurrencyListeners();
  setupIPCListeners();

  await bootstrapCurrentUserSession();

  // Aktif session ve dashboard verilerini senkronize et
  await refreshTrackerData();
  await loadAuditTrailState();
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
  if (elements.onlineEnabled) elements.onlineEnabled.checked = completeSettingsDraft.onlineEnabled === true;
  if (elements.poePath) elements.poePath.value = completeSettingsDraft.poePath || '';
  if (elements.autoStartSession) elements.autoStartSession.checked = Boolean(completeSettingsDraft.autoStartSession);
  if (elements.overlayEnabled) elements.overlayEnabled.checked = completeSettingsDraft.overlayEnabled === true;
  if (elements.enableNotifications) elements.enableNotifications.checked = completeSettingsDraft.notifications !== false;
  if (elements.soundNotifications) elements.soundNotifications.checked = Boolean(completeSettingsDraft.soundNotifications);
  if (elements.scanHotkey) elements.scanHotkey.value = completeSettingsDraft.scanHotkey;
  if (elements.stashScanHotkey) elements.stashScanHotkey.value = completeSettingsDraft.stashScanHotkey;
  syncHotkeyDisplays();
  // The dashboard badge follows the applied scan hotkey, not captures that are not saved yet.
  syncHotkeyFieldDisplay(elements.scanHotkey, elements.scanHotkeyBadge);
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

async function loadAuditTrailState() {
  try {
    const response = await window.electronAPI.getAuditTrail();
    state.auditTrail = response?.entries || [];
  } catch {
    state.auditTrail = [];
  }
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
      updateActiveSessionClock();
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
    mirror: 'assets/currency/poe2/mirror.png',
    exalted: 'assets/currency/poe2/exalted.png',
    regal: 'assets/currency/poe2/regal.png',
    transmute: 'assets/currency/poe2/transmute.png',
    fragment: 'assets/currency/poe2/fragment.png',
    essence: 'assets/currency/poe2/essence.png',
    rune: 'assets/currency/poe2/rune.png',
    'uncut-gem': 'assets/currency/poe2/uncut-gem.png',
    'soul-core': 'assets/currency/poe2/soul-core.png',
    expedition: 'assets/currency/poe2/expedition.png',
  }
};

const CURRENCY_NAMES = {
  chaos: 'Chaos Orb',
  divine: 'Divine Orb',
  mirror: 'Mirror of Kalandra'
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

// Loot rows show bundled art for the core currencies; anything else gets our chest icon, and nothing is fetched.
const LOCAL_ITEM_ICON_KEYS = {
  'Chaos Orb': 'chaos',
  'Divine Orb': 'divine',
  'Exalted Orb': 'exalted',
  'Mirror of Kalandra': 'mirror',
  'Vaal Orb': 'vaal',
  'Orb of Alchemy': 'alchemy',
  'Orb of Fusing': 'fusing',
  'Chromatic Orb': 'chromatic',
  'Orb of Alteration': 'alteration',
  "Jeweller's Orb": 'jewellers',
  'Orb of Scouring': 'scouring',
  'Blessed Orb': 'blessed',
  'Regal Orb': 'regal',
  'Orb of Regret': 'regret',
  "Gemcutter's Prism": 'gcp',
  'Orb of Chance': 'chance',
  'Orb of Transmutation': 'transmute'
};

function getLocalItemIconPath(itemName, poeVersion = 'poe1') {
  // OCR keeps the casing it read ("Divine orb"), and prices match names case-insensitively, so icons do too.
  const wanted = String(itemName || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const name = Object.keys(LOCAL_ITEM_ICON_KEYS).find((candidate) => candidate.toLowerCase() === wanted);
  const key = name ? LOCAL_ITEM_ICON_KEYS[name] : null;
  if (!key) {
    return '';
  }

  // Never across games: a PoE 2 drop shows PoE 2 art or none.
  return poeVersion === 'poe2'
    ? CURRENCY_IMAGE_VARIANTS.poe2[key] || ''
    : CURRENCY_IMAGE_VARIANTS.poe1[key] || CURRENCY_IMAGES[key] || '';
}

// An in-game style item slot: the art as content (never recoloured), the stack count in its corner.
function itemSlotHTML(itemName, poeVersion, { small = false, quantity = 1, fallback = 'chest' } = {}) {
  const src = getLocalItemIconPath(itemName, poeVersion);
  let art = '';
  if (src) {
    art = `<img src="${src}" alt="" draggable="false">`;
  } else if (fallback === 'chest') {
    art = '<svg class="icon" width="16" height="16" aria-hidden="true"><use href="assets/icons.svg#chest"/></svg>';
  }
  // Five digits no longer fit a slot corner, so big merged stacks read as thousands.
  const count = quantity >= 10000 ? `${Math.floor(quantity / 1000)}k` : String(quantity);
  const stack = quantity > 1 ? `<span class="stack">${count}</span>` : '';
  return `<span class="item-slot${small ? ' item-slot--sm' : ''}">${art}${stack}</span>`;
}

// An empty state shows our own art (the flask mark, the chest sprite in a slot, or a UI sprite glyph), a title and the next step.
// `panel` puts a page-wide off state on its own plate, and `action` is the one button that leads out of it. Never game art.
function emptyStateHTML({ art = 'mascot', title = '', hint = '', action = '', panel = false } = {}) {
  const artHTML = art === 'chest'
    ? '<span class="item-slot empty-state-art"><svg class="icon" width="24" height="24" aria-hidden="true"><use href="assets/icons.svg#chest"/></svg></span>'
    : art === 'publish'
      ? '<svg class="icon empty-state-glyph" width="28" height="28" aria-hidden="true"><use href="assets/icons.svg#publish"/></svg>'
      : '<img class="empty-state-art" src="assets/brand/mark.svg" width="48" height="48" alt="" draggable="false">';
  const hintHTML = hint ? `<span class="empty-state-hint">${hint}</span>` : '';
  return `<div class="empty-state empty-state--rich${panel ? ' empty-state--panel' : ''}">${artHTML}<strong class="empty-state-title">${title}</strong>${hintHTML}${action}</div>`;
}

// The amount format is shared with the overlay through profitCurrencyModel.
function formatCurrencyAmount(value, type = 'chaos', options = {}) {
  const model = getProfitCurrencyModel();
  return model ? model.formatCurrencyAmount(value, type, options) : String(Math.round(Number(value) || 0));
}

function currencyHTML(value, type = 'chaos', iconSize = 18, poeVersion = state.settings.poeVersion || 'poe1', options = {}) {
  const imgPath = getCurrencyAssetPath(type, poeVersion);
  const formatted = formatCurrencyAmount(value, type, options);
  const name = CURRENCY_NAMES[type] || type;
  return `<span class="value-chip">${formatted} <img src="${imgPath}" class="value-chip-icon" width="${iconSize}" height="${iconSize}" alt="${name}" title="${name}" draggable="false"></span>`;
}

// Writes the final chip at once, then rolls only the number in its .value-chip from the value shown before (or `from`),
// so the currency icon is never re-created. It stays still under reduced motion, in a hidden window and when the currency
// changed. Frames keep the final value's decimals, sign rule and en-US grouping, as formatCurrencyAmount does.
function countUp(element, html, { from } = {}) {
  if (!element) {
    return;
  }

  const readChip = () => {
    const chip = element.querySelector?.('.value-chip');
    const node = chip?.firstChild;
    const match = node?.nodeType === 3 ? node.nodeValue.match(/^([+-]?)([\d,]+)(?:\.(\d+))?(\s*)$/) : null;
    if (!match) {
      return null;
    }
    return {
      node,
      text: node.nodeValue,
      value: Number(`${match[1] === '-' ? '-' : ''}${match[2].replace(/,/g, '')}.${match[3] || '0'}`),
      decimals: (match[3] || '').length,
      signed: match[1] === '+',
      trailing: match[4],
      icon: chip.querySelector('.value-chip-icon')?.getAttribute('src') || ''
    };
  };

  const before = from === undefined ? readChip() : null;
  element.innerHTML = html;
  const after = readChip();
  const start = from !== undefined ? Number(from) : (before && after && before.icon === after.icon ? before.value : NaN);
  if (
    !after || !Number.isFinite(start) || start === after.value
    || typeof requestAnimationFrame !== 'function' || typeof matchMedia !== 'function'
    || matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden
  ) {
    return;
  }

  const signed = after.signed || Boolean(before?.signed);
  const format = (value) => {
    const rounded = Number(value.toFixed(after.decimals));
    const sign = rounded < 0 ? '-' : (signed && rounded > 0 ? '+' : '');
    return `${sign}${Math.abs(rounded).toLocaleString('en-US', { minimumFractionDigits: after.decimals, maximumFractionDigits: after.decimals })}${after.trailing}`;
  };
  let startedAt = null;
  const frame = (now) => {
    // A newer render replaced the chip, so this roll stops; a newer countUp carries on from the number on screen.
    if (!after.node.isConnected) {
      return;
    }
    if (startedAt === null) {
      startedAt = now;
    }
    const progress = Math.min(1, (now - startedAt) / 450);
    after.node.nodeValue = progress < 1 ? format(start + (after.value - start) * (1 - (1 - progress) ** 3)) : after.text;
    if (progress < 1) {
      requestAnimationFrame(frame);
    }
  };
  after.node.nodeValue = format(start);
  requestAnimationFrame(frame);
}

function normalizeSafeImageSrc(src) {
  if (typeof src !== 'string') {
    return '';
  }

  const trimmed = src.trim();
  if (!trimmed) {
    return '';
  }

  if (/^assets\/[a-z0-9/_ .-]+\.(png|jpg|jpeg|webp|svg)$/i.test(trimmed)) {
    return trimmed;
  }

  try {
    const candidate = trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
    const parsed = new URL(candidate, window.location.href);
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

// Points each <img data-icon-url> at its local icon-cache copy when there is one, else at the remote art.
async function applyCachedItemIcons(container) {
  const images = [...container.querySelectorAll('img[data-icon-url]')];
  const urls = [...new Set(images.map((img) => img.dataset.iconUrl))];
  let cached = {};
  if (urls.length > 0 && typeof window.electronAPI?.resolveCachedIcons === 'function') {
    cached = await window.electronAPI.resolveCachedIcons(urls).catch(() => ({})) || {};
  }

  images.forEach((img) => {
    const cachedSrc = String(cached[img.dataset.iconUrl] || '');
    img.src = cachedSrc.startsWith('file:') ? cachedSrc : normalizeSafeImageSrc(img.dataset.iconUrl);
  });
}

function createCurrencyValueElement(value, type = 'chaos', iconSize = 18, poeVersion = state.settings.poeVersion || 'poe1') {
  const formatted = formatCurrencyAmount(value, type);
  const span = document.createElement('span');
  span.className = 'value-chip';
  span.append(`${formatted} `);

  const img = document.createElement('img');
  img.src = normalizeSafeImageSrc(getCurrencyAssetPath(type, poeVersion)) || getCurrencyAssetPath(type, poeVersion);
  img.className = 'value-chip-icon';
  img.width = iconSize;
  img.height = iconSize;
  img.alt = CURRENCY_NAMES[type] || type;
  img.title = img.alt;
  img.draggable = false;
  span.appendChild(img);

  return span;
}

function normalizeProfitPoeVersion(poeVersion) {
  if (typeof normalizePoeVersion === 'function') {
    return normalizePoeVersion(poeVersion) || 'poe1';
  }

  return poeVersion === 'poe2' ? 'poe2' : 'poe1';
}

function getProfitCurrencyModel() {
  return window.profitCurrencyModel || null;
}

function getProfitCurrencyLeague(fallback = 'Standard') {
  try {
    const trackerContext = typeof getSelectedTrackerContext === 'function'
      ? getSelectedTrackerContext()
      : null;
    if (typeof trackerContext?.league === 'string' && trackerContext.league.trim()) {
      return trackerContext.league.trim();
    }
  } catch { }

  try {
    if (typeof getResolvedActiveLeague === 'function') {
      const league = getResolvedActiveLeague();
      if (typeof league === 'string' && league.trim()) {
        return league.trim();
      }
    }
  } catch { }

  return fallback;
}

function getProfitCurrencyRateKey(poeVersion, league) {
  return `${normalizeProfitPoeVersion(poeVersion)}:${String(league || 'Standard').trim() || 'Standard'}`;
}

function getProfitCurrencyRates(poeVersion = state.settings.poeVersion || 'poe1', league = null) {
  const normalizedVersion = normalizeProfitPoeVersion(poeVersion);
  const resolvedLeague = league || (typeof getProfitCurrencyLeague === 'function'
    ? getProfitCurrencyLeague()
    : 'Standard');
  const key = getProfitCurrencyRateKey(normalizedVersion, resolvedLeague);
  return state.profitCurrencyRates?.[key]
    || state.profitCurrencyRates?.[normalizedVersion]
    || null;
}

function setProfitCurrencyRates(poeVersion, rates = {}, league = null) {
  const model = getProfitCurrencyModel();
  const normalizedVersion = normalizeProfitPoeVersion(poeVersion);
  const normalizedRates = model?.normalizeProfitCurrencyRates
    ? model.normalizeProfitCurrencyRates(rates)
    : {
      divineChaos: Number(rates.divineChaos) > 0 ? Number(rates.divineChaos) : null,
      mirrorChaos: Number(rates.mirrorChaos) > 0 ? Number(rates.mirrorChaos) : null
    };
  const resolvedLeague = league || rates.league || getProfitCurrencyLeague();
  const payload = {
    ...normalizedRates,
    poeVersion: normalizedVersion,
    league: resolvedLeague,
    sources: rates.sources || null
  };

  state.profitCurrencyRates[getProfitCurrencyRateKey(normalizedVersion, resolvedLeague)] = payload;
  state.profitCurrencyRates[normalizedVersion] = payload;
  return payload;
}

// `cacheOnly` reads the rates main already holds and never starts a poe.ninja sync.
async function refreshProfitCurrencyRates(poeVersion = state.settings.poeVersion || 'poe1', league = null, { cacheOnly = false } = {}) {
  const normalizedVersion = normalizeProfitPoeVersion(poeVersion);
  const resolvedLeague = league || getProfitCurrencyLeague();

  if (typeof window.electronAPI?.getProfitCurrencyRates !== 'function') {
    return getProfitCurrencyRates(normalizedVersion, resolvedLeague);
  }

  try {
    const rates = await window.electronAPI.getProfitCurrencyRates({
      poeVersion: normalizedVersion,
      league: resolvedLeague,
      cacheOnly
    });
    return setProfitCurrencyRates(normalizedVersion, rates || {}, resolvedLeague);
  } catch {
    return getProfitCurrencyRates(normalizedVersion, resolvedLeague);
  }
}

function profitCurrencyHTML(value, iconSize = 18, poeVersion = state.settings.poeVersion || 'poe1', options = {}) {
  const normalizedVersion = normalizeProfitPoeVersion(poeVersion);
  const model = getProfitCurrencyModel();
  const rates = options.rates || getProfitCurrencyRates(normalizedVersion, options.league) || {};

  const chipOptions = { signed: Boolean(options.signed) };

  if (!model || typeof model.selectProfitCurrency !== 'function') {
    return currencyHTML(value, 'chaos', iconSize, normalizedVersion, chipOptions);
  }

  const selected = model.selectProfitCurrency(value, rates);
  return currencyHTML(selected.value, selected.type, iconSize, normalizedVersion, chipOptions);
}

function formatAdaptiveProfitText(value, poeVersion = state.settings.poeVersion || 'poe1', options = {}) {
  const normalizedVersion = normalizeProfitPoeVersion(poeVersion);
  const model = getProfitCurrencyModel();
  const rates = options.rates || getProfitCurrencyRates(normalizedVersion, options.league) || {};

  if (model && typeof model.formatProfitCurrencyText === 'function') {
    return model.formatProfitCurrencyText(value, rates, options);
  }

  const normalizedValue = Math.round(Number(value) || 0);
  const sign = options.signed && normalizedValue > 0 ? '+' : normalizedValue < 0 ? '-' : '';
  return `${sign}${Math.abs(normalizedValue)}c`;
}

function getProfitTierFor(value, poeVersion = state.settings.poeVersion || 'poe1', options = {}) {
  const model = window.profitTierModel;
  if (!model || typeof model.getProfitTier !== 'function') {
    return Number(value) < 0 ? 'loss' : 'normal';
  }

  const rates = options.rates || getProfitCurrencyRates(normalizeProfitPoeVersion(poeVersion), options.league) || {};
  return model.getProfitTier(value, rates);
}

function applyProfitTier(element, tier) {
  if (!element?.dataset) {
    return;
  }

  if (tier) {
    element.dataset.profitTier = tier;
  } else {
    delete element.dataset.profitTier;
  }
}

const PROFIT_MEME_LABELS = {
  bricked: 'Bricked',
  pog: 'Pog',
  juiced: 'Juiced',
  mirror: 'Mirror tier'
};

function profitMemeHTML(tier) {
  const meme = window.profitTierModel?.getProfitTierMeme?.(tier);
  if (!meme) {
    return '';
  }

  const label = PROFIT_MEME_LABELS[meme];
  return `<div class="meme-badge" data-meme="${meme}" title="${label}"><img src="assets/brand/reactions/${meme}.svg" width="18" height="18" alt="" draggable="false">${label}</div>`;
}

function farmRunReactionsHTML(reactions = {}, poeVersion = 'poe1') {
  const items = [
    { id: 'divine', label: 'Divine', icon: getCurrencyAssetPath('divine', poeVersion) },
    { id: 'holy', label: 'Holy', icon: 'assets/brand/reactions/holy.svg' },
    { id: 'pog', label: 'Pog', icon: 'assets/brand/reactions/pog.svg' }
  ];

  return `<div class="hub-reactions">${items.map(({ id, label, icon }) => {
    const count = Number(reactions?.[id]) || 0;
    return `<span class="hub-reaction${count ? '' : ' is-empty'}" title="${label}"><img src="${icon}" width="18" height="18" alt="${label}" draggable="false">${count}</span>`;
  }).join('')}</div>`;
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

  if (elements.characterConnectBtn) {
    elements.characterConnectBtn.addEventListener('click', handleConnectPoeDevice);
  }
  if (elements.characterPicker) {
    elements.characterPicker.addEventListener('change', () => {
      handleCharacterChosen({ poeVersion: state.account?.activePoeVersion, characterId: elements.characterPicker.value });
    });
  }

  // Session
  elements.startSessionBtn.addEventListener('click', handleStartSession);
  elements.endSessionBtn.addEventListener('click', handleEndSession);
  if (elements.sessionFarmTypeSelect) {
    elements.sessionFarmTypeSelect.addEventListener('change', handleFarmTypeSelectionChange);
  }
  if (elements.clearFarmTypeBtn) {
    elements.clearFarmTypeBtn.addEventListener('click', handleFarmTypeSelectionClear);
  }

  // Loot
  elements.scanScreenBtn.addEventListener('click', handleScanScreen);

  // Sessions filter
  elements.sessionFilter.addEventListener('change', loadSessions);
  if (elements.sessionVersionFilter) elements.sessionVersionFilter.addEventListener('change', renderSessionsList);
  if (elements.sessionLeagueFilter) elements.sessionLeagueFilter.addEventListener('change', renderSessionsList);
  if (elements.sessionFarmFilter) elements.sessionFarmFilter.addEventListener('change', renderSessionsList);
  if (elements.sessionSearchFilter) elements.sessionSearchFilter.addEventListener('input', renderSessionsList);
  if (elements.sessionDrawerClose) elements.sessionDrawerClose.addEventListener('click', closeSessionDrawer);
  if (elements.sessionDrawerBackdrop) elements.sessionDrawerBackdrop.addEventListener('click', closeSessionDrawer);
  if (elements.sessionDrawerSave) elements.sessionDrawerSave.addEventListener('click', handleSessionMetadataSave);
  if (elements.farmingHubVersionFilter) elements.farmingHubVersionFilter.addEventListener('change', loadFarmingHubRuns);
  if (elements.farmingHubLeagueFilter) elements.farmingHubLeagueFilter.addEventListener('change', loadFarmingHubRuns);
  if (elements.farmingHubFarmFilter) elements.farmingHubFarmFilter.addEventListener('change', loadFarmingHubRuns);
  if (elements.farmingHubMinProfitFilter) elements.farmingHubMinProfitFilter.addEventListener('change', loadFarmingHubRuns);
  if (elements.farmingHubRefreshBtn) elements.farmingHubRefreshBtn.addEventListener('click', loadFarmingHubRuns);
  // The off panel's button is written with innerHTML, and CSP blocks inline onclick.
  if (elements.farmingHubList) elements.farmingHubList.addEventListener('click', (event) => {
    if (event.target.closest('[data-hub-action="open-online-settings"]')) openOnlineSettings();
  });

  // Settings
  elements.saveSettingsBtn.addEventListener('click', handleSaveSettings);
  elements.resetSettingsBtn.addEventListener('click', handleResetSettings);
  if (elements.poeConnectBtn) elements.poeConnectBtn.addEventListener('click', handleConnectPoeDevice);
  if (elements.poeDisconnectBtn) elements.poeDisconnectBtn.addEventListener('click', handlePoeDisconnect);

  // Settings tab navigation
  elements.settingsNavBtns.forEach(btn => {
    btn.addEventListener('click', () => showSettingsTab(btn.dataset.settingsTab));
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
  if (elements.mapResultFilter) {
    elements.mapResultFilter.addEventListener('change', renderMapResultHistory);
  }
  if (elements.mapResultHistory) {
    elements.mapResultHistory.addEventListener('click', handleMapResultHistoryClick);
  }
  setupHotkeyCaptureFields();

  // PoE version switching
  elements.versionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.versionBtns.forEach(b => setToggleButtonPressed(b, b === btn));
      state.settings.poeVersion = btn.dataset.version;
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
  if (elements.onlineSignIn) {
    elements.onlineSignIn.addEventListener('click', handleOnlineSignIn);
  }
  if (elements.onlineSignOut) {
    elements.onlineSignOut.addEventListener('click', handleOnlineSignOut);
  }
  if (elements.exportDiagnosticsBtn) {
    elements.exportDiagnosticsBtn.addEventListener('click', handleExportDiagnostics);
  }
  if (elements.checkUpdatesBtn) {
    elements.checkUpdatesBtn.addEventListener('click', handleCheckForAppUpdate);
  }
  if (elements.installUpdateBtn) {
    elements.installUpdateBtn.addEventListener('click', handleInstallAppUpdate);
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
    handleMapEnteredEvent(data).catch((error) => {
      showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'errors.sessionStart'), 'error');
    });
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

  window.electronAPI.onSessionEnded(async (session) => {
    state.currentSession = null;
    updateActiveSessionUI();
    stopSessionClock();
    const mapResult = await persistCompletedSessionMapResult(session);
    if (mapResult && typeof window.electronAPI.showMapResultOverlay === 'function') {
      try {
        await window.electronAPI.showMapResultOverlay(mapResult);
      } catch (error) {
        console.warn('Failed to show map result overlay', error);
      }
    }
    const rawProfit = parseFloat(session?.profitChaos);
    const profit = Number.isFinite(rawProfit) ? rawProfit : 0;
    const message = profit >= 0
      ? window.t('toast.sessionProfitBody', { value: profit.toFixed(1) })
      : window.t('toast.sessionLossBody', { value: Math.abs(profit).toFixed(1) });
    showToast(window.t('toast.sessionCompletedTitle'), message, profit >= 0 ? 'success' : 'warning');
    await refreshTrackerData({ includeSessions: true });
  });

  // Loot olaylari
  window.electronAPI.onLootAdded((data) => {
    const itemCount = Array.isArray(data.items) ? data.items.length : 1;
    const bodyKey = itemCount === 1 ? 'toast.lootAddedBodyOne' : 'toast.lootAddedBody';
    showToast(window.t('toast.lootAddedTitle'), window.t(bodyKey, { count: itemCount }));
    refreshTrackerData({ includeSessions: isPageActive('sessions') });
  });

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

  if (window.electronAPI.onPricesUpdated) {
    window.electronAPI.onPricesUpdated(handlePricesUpdated);
  }

  if (window.electronAPI.onAppUpdateStateChanged) {
    window.electronAPI.onAppUpdateStateChanged((data) => {
      const wasDownloaded = Boolean(state.appUpdate?.downloaded);
      state.appUpdate = data || null;
      renderAppUpdateState();
      if (!wasDownloaded && data?.downloaded) {
        showToast(window.t('toast.updateReadyTitle'), window.t('toast.updateReadyBody'), 'success');
      }
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
          setToggleButtonPressed(b, b.dataset.poe === version);
        });
        updateTypeFilterDropdown();
        loadCurrencyLeagues();
        loadCurrencyPrices();
      }
    });
  }

  if (window.electronAPI.onGameSessionEntered) {
    window.electronAPI.onGameSessionEntered(handleGameSessionEntered);
  }

  if (window.electronAPI.onCharacterLogLine) {
    window.electronAPI.onCharacterLogLine(handleCharacterLogLine);
  }

  if (window.electronAPI.onCharacterPromptOverlayResult) {
    window.electronAPI.onCharacterPromptOverlayResult(handleCharacterChosen);
  }

  if (window.electronAPI.onGameClosed) {
    window.electronAPI.onGameClosed((data) => {
      if (data?.runtimeSession) {
        setRuntimeSessionState(data.runtimeSession);
      }
      clearActiveCharacterRefreshTimers();
      syncRendererGameContext(null);
      refreshAccountStateFromCurrentUser();
      renderCharacterSummaryCard();
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

  // Update the navigation buttons.
  elements.navButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });

  // Update the pages.
  elements.pages.forEach(p => {
    p.classList.toggle('active', p.id === `${page}-page`);
  });

  // Sayfa ozel yuklemeler
  if (page === 'sessions') {
    loadSessions();
  } else if (page === 'farming-hub') {
    loadFarmingHubRuns();
  } else if (page === 'dashboard') {
    refreshTrackerData();
  } else if (page === 'currency') {
    loadCurrencyPage();
  }
}

// Marks one Settings tab and its panel as selected.
function showSettingsTab(tab) {
  elements.settingsNavBtns.forEach((b) => {
    const selected = b.dataset.settingsTab === tab;
    b.classList.toggle('active', selected);
    b.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
  elements.settingsTabs.forEach((t) => {
    t.classList.toggle('active', t.id === 'settings-' + tab);
  });
}

// The Hub's off panel leads straight to the Online switch.
function openOnlineSettings() {
  navigateTo('settings');
  showSettingsTab('api');
  elements.onlineEnabled?.focus();
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

// The overlay start prompt is mouse-only, so the player gets the spec'd 7 s once it is on screen.
const START_MAP_PROMPT_OVERLAY_MS = 7000;

async function handleMapEnteredEvent(data = {}) {
  if (data?.runtimeSession) {
    setRuntimeSessionState(data.runtimeSession);
  }

  const shouldPromptForSession = Boolean(state.settings?.autoStartSession)
    && !state.currentSession
    && !state.mapSessionPromptActive;

  // A start prompt (overlay or desktop modal) names the map itself, so only toast when none follows.
  if (!shouldPromptForSession) {
    showToast(window.t('toast.mapEnteredTitle'), window.t('toast.mapEnteredBody', { mapName: data.mapName }));
    return;
  }

  const detectedMapName = typeof data.mapName === 'string' && data.mapName.trim()
    ? data.mapName.trim()
    : null;

  state.mapSessionPromptActive = true;
  let startPromptOverlayShown = false;
  try {
    if (window.electronAPI?.showStartMapPromptOverlay) {
      let stopWaitingForOverlayResult = () => {};
      let startOverlayResultTimeout = () => {};
      try {
        const trackerContext = typeof getSelectedTrackerContext === 'function'
          ? getSelectedTrackerContext()
          : {};
        const farmTypeId = trackerContext?.farmTypeId || null;
        let farmType = null;
        let farmTypeOptions = [];

        if (farmTypeId && typeof getFarmTypeModel === 'function') {
          const farmTypeModel = getFarmTypeModel();
          if (typeof farmTypeModel.getFarmTypeById === 'function') {
            farmType = farmTypeModel.getFarmTypeById(farmTypeId, {
              poeVersion: trackerContext?.poeVersion
            })?.label || null;
          } else if (typeof farmTypeModel.listFarmTypes === 'function') {
            farmType = farmTypeModel.listFarmTypes({
              poeVersion: trackerContext?.poeVersion
            }).find((entry) => entry.id === farmTypeId)?.label || null;
          }
        }

        if (typeof getFarmTypeModel === 'function') {
          const farmTypeModel = getFarmTypeModel();
          if (typeof farmTypeModel.listFarmTypes === 'function') {
            farmTypeOptions = farmTypeModel.listFarmTypes({
              poeVersion: trackerContext?.poeVersion
            }).map((entry) => ({
              id: entry.id,
              label: entry.label
            }));
          }
        }

        const overlayResultPromise = typeof window.electronAPI?.onStartMapPromptOverlayResult === 'function'
          ? new Promise((resolve) => {
            let settled = false;
            let timeoutId = null;
            let unsubscribe = () => {};

            const settle = (value) => {
              if (settled) {
                return;
              }

              settled = true;
              if (timeoutId) {
                clearTimeout(timeoutId);
              }
              unsubscribe();
              resolve(value || null);
            };

            stopWaitingForOverlayResult = () => settle(null);
            unsubscribe = window.electronAPI.onStartMapPromptOverlayResult((result) => {
              settle(result);
            }) || (() => {});

            startOverlayResultTimeout = () => {
              if (!settled && typeof setTimeout === 'function') {
                timeoutId = setTimeout(() => settle(null), START_MAP_PROMPT_OVERLAY_MS);
              }
            };
          })
          : null;

        const overlayState = await window.electronAPI.showStartMapPromptOverlay({
          mapName: detectedMapName || data.mapName || null,
          poeVersion: trackerContext?.poeVersion || null,
          league: trackerContext?.league || null,
          farmTypeId,
          farmType,
          farmTypeOptions,
          source: 'map-detected'
        }, { expiresInMs: START_MAP_PROMPT_OVERLAY_MS });
        startPromptOverlayShown = true;
        const canUseInteractiveOverlay = overlayState?.visibility === 'visible'
          && overlayState?.mode === 'start-map-prompt'
          && typeof window.electronAPI?.onStartMapPromptOverlayResult === 'function';

        if (canUseInteractiveOverlay) {
          startOverlayResultTimeout();
          const overlayResult = await overlayResultPromise;

          if (overlayResult?.action === 'confirm') {
            const overlayMapName = typeof overlayResult.mapName === 'string' && overlayResult.mapName.trim()
              ? overlayResult.mapName.trim()
              : detectedMapName;
            await handleStartSession({
              defaultMapName: detectedMapName,
              source: 'map-detected-overlay',
              sessionDetails: {
                mapName: overlayMapName,
                farmTypeId: overlayResult.farmTypeId || null
              }
            });
            return;
          }

          if (overlayResult?.action === 'cancel') {
            return;
          }
        } else {
          stopWaitingForOverlayResult();
        }

        // Unanswered, or not shown yet (e.g. behind a map-result card): take the prompt down before the
        // desktop modal opens so it cannot surface later and swallow clicks nobody is listening for.
        if (window.electronAPI?.hideStartMapPromptOverlay) {
          await window.electronAPI.hideStartMapPromptOverlay();
          startPromptOverlayShown = false;
        }
      } catch (error) {
        stopWaitingForOverlayResult();
        console.warn('Failed to show start-map overlay prompt', error);
      }
    }

    await handleStartSession({
      defaultMapName: detectedMapName,
      source: 'map-detected'
    });
  } finally {
    if (startPromptOverlayShown && window.electronAPI?.hideStartMapPromptOverlay) {
      try {
        await window.electronAPI.hideStartMapPromptOverlay();
      } catch (error) {
        console.warn('Failed to hide start-map overlay prompt', error);
      }
    }
    state.mapSessionPromptActive = false;
  }
}

function hideLoginModal() {
  if (elements.loginModal) {
    elements.loginModal.classList.add('hidden');
  }

  if (elements.registerModal) {
    elements.registerModal.classList.add('hidden');
  }
}

function isServerUnavailableError(error) {
  const rawMessage = typeof error === 'string'
    ? error
    : (typeof error?.message === 'string' ? error.message : (typeof error?.error === 'string' ? error.error : ''));

  return /unable to reach the server|sunucuya ulasilamadi|request timed out|yanit vermekte gecikti|econnrefused|network/i.test(rawMessage);
}

// The local profile outlives the 10-hour Path of Exile sign-in, so the app opens straight to the dashboard.
async function bootstrapCurrentUserSession() {
  const profile = await window.electronAPI.getLocalProfile().catch(() => null);

  if (!profile) {
    state.mapResults = [];
    showLoginModal();
    return { mode: 'login-required' };
  }

  setCurrentUser(toProfileUser(profile));
  hideLoginModal();
  await loadMapResultHistory();
  void syncPoeDeviceConnection();
  return { mode: 'authenticated' };
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
      void syncPoeDeviceConnection();
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
  setButtonBusy(button, true, window.t('login.waitingBrowser'));

  try {
    const result = await window.electronAPI.signInWithPoe();

    if (result?.success) {
      await loadProfileAccountStateCache();
      setCurrentUser(toProfileUser(result.profile));
      if (elements.loginModal) {
        elements.loginModal.classList.add('hidden');
      }
      await loadMapResultHistory();
      void syncPoeDeviceConnection();
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
    setButtonBusy(button, false);
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
  clearActiveCharacterRefreshTimers();
  clearTimeout(characterReconcileTimer);
  await window.electronAPI.logout();
  state.currentUser = null;
  state.deviceCharactersByGame = {};
  state.poeDeviceConnected = false;
  state.poeStashAccess = false;
  state.currentSession = null;
  state.sessions = [];
  state.mapResults = [];
  state.recentLoot = [];
  state.account = null;
  state.runtimeSession = null;
  state.overlay = null;
  // Signing out locally also ends the server session.
  state.onlineAccount = { ...state.onlineAccount, signedIn: false };
  stashState.beforeSnapshotId = null;
  stashState.afterSnapshotId = null;
  stashState.beforeSnapshot = null;
  stashState.afterSnapshot = null;
  stashState.mapResultContext = null;
  stashState.lastMapResult = null;
  stashState.pricesSynced = false;
  closeSessionDrawer();
  renderUserIdentity();
  renderOnlineSettings();
  if (typeof renderCharacterSummaryCard === 'function') {
    renderCharacterSummaryCard();
  }
  resetDashboardSummary();
  if (typeof renderLatestMapResult === 'function') {
    renderLatestMapResult();
  }
  if (typeof renderMapResultHistory === 'function') {
    renderMapResultHistory();
  }
  updateActiveSessionUI();
  renderSessionsList();
  renderRecentLoot();
  renderPoeLinkStatus();
  showLoginModal();
}

/**
 * Show the current user identity state
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
  // The active map card is written by JS (its badge too), so it follows the new language here.
  if (typeof updateActiveSessionUI === 'function') {
    updateActiveSessionUI();
  }
  // So is Recent Loot's empty state; it redraws from state, with no IPC.
  if (typeof renderRecentLoot === 'function') {
    renderRecentLoot();
  }
}

// The renderer reads the local profile through the fields the server account used to fill.
function toProfileUser(profile) {
  return {
    id: profile.id,
    username: profile.accountName,
    accountName: profile.accountName,
    // Prices come from poe.ninja on this machine, so every profile may sync them.
    capabilities: { canSyncPrices: true }
  };
}

/**
 * Set the current user
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

  const { deriveAccountState, withDeviceCharacters } = getAccountStateModel();
  const poePayload = user?.poe || {};
  state.account = deriveAccountState({
    activePoeVersion: normalizePoeVersion(state.detectedGameVersion)
      || normalizePoeVersion(state.settings?.lastDetectedPoeVersion)
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
    characters: withDeviceCharacters(
      user?.characters
        || user?.poeCharacters
        || poePayload.characters
        || [],
      state.deviceCharactersByGame
    ),
    cachedAccountState: state.settings?.lastKnownAccountState || null
  });
  persistLastKnownAccountState();
  if (typeof syncOverlayCharacter === 'function') {
    syncOverlayCharacter();
  }
}

// The in-game overlay shows the same character as the card.
function syncOverlayCharacter() {
  const account = state.account;
  const character = account?.summary?.status === 'ready'
    ? account.summary
    : (account?.accountName ? { name: account.accountName } : null);

  window.electronAPI?.setOverlayCharacter?.(character)?.catch(() => {});
}

// Play: until a log line confirms this session's character, the card keeps the one last confirmed for this game.
function handleGameSessionEntered({ poeVersion } = {}) {
  const version = normalizePoeVersion(poeVersion);
  if (!version) {
    return;
  }

  state.characterSession = { poeVersion: version, confirmed: false };
  refreshAccountStateFromCurrentUser();
  renderCharacterSummaryCard();
  refreshRendererOverlayState();

  // If nothing confirms this Play, GGG's `current` flag settles it once it has caught up.
  clearTimeout(characterReconcileTimer);
  const session = state.characterSession;
  characterReconcileTimer = setTimeout(() => {
    if (state.characterSession === session && !session.confirmed) {
      void refreshDeviceCharacters(version);
    }
  }, CHARACTER_RECONCILE_DELAY_MS);

  // Ask in the overlay only when there is a choice to make.
  const characters = state.account?.activePoeVersion === version ? state.account.charactersByGame?.[version] || [] : [];
  const selectedId = state.account?.selectedCharacter?.id;
  if (characters.length > 1 && selectedId) {
    window.electronAPI?.showCharacterPromptOverlay?.({
      poeVersion: version,
      selectedId,
      characters: [...characters]
        .sort((a, b) => (b.level || 0) - (a.level || 0))
        .map(({ id, name, className, level }) => ({ id, name, className, level }))
    })?.catch(() => {});
  }
}

// The player picked a character in the overlay prompt or on the card.
function handleCharacterChosen({ poeVersion, characterId } = {}) {
  const version = normalizePoeVersion(poeVersion);
  const known = (state.account?.charactersByGame?.[version] || []).some((character) => character.id === characterId);
  if (known) {
    confirmActiveCharacter(version, characterId);
  }
}

// Level-up, death and reward lines also name party members, so only the account's own characters count.
async function handleCharacterLogLine({ poeVersion, name, kind, level } = {}) {
  const version = normalizePoeVersion(poeVersion);
  const { findCharacterByName } = getAccountStateModel();
  let character = findCharacterByName(state.account, version, name);

  // A brand-new character reaches level 2 before it is in any list we hold; fetch once to pick it up.
  if (!character && kind === 'level_up' && level <= 2 && await refreshDeviceCharacters(version)) {
    character = findCharacterByName(state.account, version, name);
  }

  if (character) {
    confirmActiveCharacter(version, character.id);
  }
}

// Reads this realm's characters straight from GGG (device connection). A `current` flag that moved since the
// last fetch means a Play newer than anything the cache knows, unless this Play is already confirmed.
async function refreshDeviceCharacters(poeVersion) {
  const version = normalizePoeVersion(poeVersion);
  if (!version || !state.currentUser || !state.poeDeviceConnected) {
    return false;
  }

  const profileId = state.currentUser.id;
  const result = await window.electronAPI.getPoeDeviceCharacters(version).catch(() => null);
  // Signed out (or another profile) while GGG answered: the result belongs to nobody now.
  if (state.currentUser?.id !== profileId) {
    return false;
  }
  state.poeDeviceConnected = Boolean(result?.connected);
  renderPoeLinkStatus();
  if (!Array.isArray(result?.characters)) {
    renderCharacterSummaryCard();
    return false;
  }

  state.deviceCharactersByGame = { ...state.deviceCharactersByGame, [version]: result.characters };
  const currentId = result.characters.find((character) => character.current)?.id || null;
  const cache = state.settings.lastKnownAccountState || {};
  const previousCurrentId = cache.apiCurrentByGame?.[version] || null;
  state.settings.lastKnownAccountState = {
    ...cache,
    apiCurrentByGame: { ...cache.apiCurrentByGame, [version]: currentId }
  };

  const sessionConfirmed = state.characterSession?.poeVersion === version && state.characterSession.confirmed;
  if (currentId && currentId !== previousCurrentId && !sessionConfirmed) {
    confirmActiveCharacter(version, currentId);
  } else {
    refreshAccountStateFromCurrentUser();
    renderCharacterSummaryCard();
    refreshRendererOverlayState();
  }
  return true;
}

async function syncPoeDeviceConnection() {
  const status = await window.electronAPI.getPoeAuthStatus().catch(() => null);
  state.poeDeviceConnected = Boolean(status?.authenticated);
  state.poeStashAccess = status?.stashAccess === true;
  applyDashboardCapabilities();
  renderPoeLinkStatus();
  renderCharacterSummaryCard();
  if (state.poeDeviceConnected) {
    await refreshDeviceCharacters(state.account?.activePoeVersion);
  }
}

// The card and Settings both connect; one sign-in at a time, since a second loopback flow would wait for nothing.
async function handleConnectPoeDevice() {
  const buttons = [elements.characterConnectBtn, elements.poeConnectBtn].filter(Boolean);
  if (buttons.some((button) => button.disabled)) {
    return;
  }
  buttons.forEach((button) => setButtonBusy(button, true, window.t('login.waitingBrowser')));

  try {
    const result = await window.electronAPI.connectPoeDevice();
    if (!result?.success) {
      showToast(window.t('toast.error'), result?.error || window.t('errors.loginFailed'), 'error');
      return;
    }
    state.poeDeviceConnected = true;
    await refreshDeviceCharacters(state.account?.activePoeVersion);
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'errors.loginFailed'), 'error');
  } finally {
    buttons.forEach((button) => setButtonBusy(button, false));
    renderPoeLinkStatus();
    renderCharacterSummaryCard();
  }
}

function confirmActiveCharacter(poeVersion, characterId) {
  const cache = state.settings.lastKnownAccountState || {};
  state.settings.lastKnownAccountState = {
    ...cache,
    confirmedCharacterByGame: { ...cache.confirmedCharacterByGame, [poeVersion]: characterId }
  };
  if (state.characterSession?.poeVersion === poeVersion) {
    state.characterSession.confirmed = true;
  }

  refreshAccountStateFromCurrentUser();
  renderCharacterSummaryCard();
  refreshRendererOverlayState();
}

// Main keeps one character cache per profile and hands out the signed-in profile's one.
async function loadProfileAccountStateCache() {
  const settings = await window.electronAPI.getSettings().catch(() => null);
  state.settings.lastKnownAccountState = settings?.lastKnownAccountState || null;
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

// Settings shows this device's Path of Exile connection for the signed-in profile.
function renderPoeLinkStatus() {
  if (!elements.poeLinkStatus || !elements.poeAccountName || !elements.poeLinkMode) return;

  if (!state.currentUser) {
    elements.poeLinkStatus.textContent = window.t('settings.poeSignInRequired');
    elements.poeAccountName.textContent = window.t('settings.poeSignInHint');
    elements.poeLinkMode.textContent = window.t('settings.poeSignedOutMode');
    if (elements.poeConnectBtn) elements.poeConnectBtn.classList.remove('hidden');
    if (elements.poeDisconnectBtn) elements.poeDisconnectBtn.classList.add('hidden');
    return;
  }

  if (state.poeDeviceConnected) {
    elements.poeLinkStatus.textContent = window.t('settings.poeLinked');
    elements.poeAccountName.textContent = state.currentUser.accountName || window.t('settings.poeLinked');
    elements.poeLinkMode.textContent = window.t('settings.poeLiveMode');
    if (elements.poeConnectBtn) elements.poeConnectBtn.classList.add('hidden');
    if (elements.poeDisconnectBtn) elements.poeDisconnectBtn.classList.remove('hidden');
    return;
  }

  elements.poeLinkStatus.textContent = window.t('settings.poeNotLinked');
  elements.poeAccountName.textContent = state.currentUser.accountName || window.t('settings.poeNoAccount');
  elements.poeLinkMode.textContent = window.t('settings.poeReconnectHint');
  if (elements.poeConnectBtn) elements.poeConnectBtn.classList.remove('hidden');
  if (elements.poeDisconnectBtn) elements.poeDisconnectBtn.classList.add('hidden');
}

async function handlePoeDisconnect() {
  if (!state.currentUser) return;

  setButtonBusy(elements.poeDisconnectBtn, true);

  try {
    await window.electronAPI.disconnectPoeDevice();
    state.poeDeviceConnected = false;
    renderPoeLinkStatus();
    renderCharacterSummaryCard();
    showToast(window.t('toast.poeTitle'), window.t('toast.poeDisconnected'), 'success');
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'toast.poeDisconnectError'), 'error');
  } finally {
    setButtonBusy(elements.poeDisconnectBtn, false);
  }
}

function getSelectedTrackerContext() {
  const poeVersion = getResolvedLeagueVersion();
  const characterSummary = state.account?.summary || null;
  const characterLeague = characterSummary?.status === 'ready'
    && typeof characterSummary.league === 'string'
    && characterSummary.league.trim()
    && (!characterSummary.poeVersion || characterSummary.poeVersion === poeVersion)
    ? characterSummary.league.trim()
    : null;
  const league = characterLeague || getResolvedActiveLeague();
  const farmTypeId = state.farmType?.selectedFarmTypeId || null;

  return {
    poeVersion,
    league,
    farmTypeId,
    label: `${poeVersion === 'poe2' ? 'PoE 2' : 'PoE 1'} • ${league}`
  };
}

function deriveCurrentMapResult(profitReport = null) {
  const { deriveMapResult } = getMapResultModel();
  const { listFarmTypes } = getFarmTypeModel();
  const capturedContext = stashState.mapResultContext || {};
  const hasCapturedContext = Boolean(stashState.mapResultContext);
  const selectedFarmTypeId = capturedContext.farmTypeId
    || state.currentSession?.farmTypeId
    || state.currentSession?.mapType
    || state.farmType?.selectedFarmTypeId
    || null;
  const farmType = listFarmTypes().find((entry) => entry.id === selectedFarmTypeId) || null;
  const trackerContext = getSelectedTrackerContext();
  const characterSummary = hasCapturedContext
    ? (capturedContext.characterSummary || (capturedContext.league ? { league: capturedContext.league } : null))
    : (state.account?.summary || null);
  const accountName = hasCapturedContext
    ? (capturedContext.accountName || null)
    : (state.account?.accountName || null);
  const poeVersion = capturedContext.poeVersion
    || state.currentSession?.poeVersion
    || trackerContext.poeVersion;
  const runtimeSession = capturedContext.runtimeSession || state.runtimeSession;

  return deriveMapResult({
    farmType,
    runtimeSession,
    beforeSnapshot: stashState.beforeSnapshot,
    afterSnapshot: stashState.afterSnapshot,
    profitReport,
    characterSummary,
    accountName,
    poeVersion
  });
}

function getSessionNumber(value, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function getSessionTimestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getCompletedSessionDurationSeconds(session = {}) {
  const directDuration = getSessionNumber(
    session.durationSeconds ?? session.durationSec ?? session.duration_sec,
    NaN
  );
  if (Number.isFinite(directDuration) && directDuration > 0) {
    return Math.round(directDuration);
  }

  const startedAt = getSessionTimestampMs(session.startedAt ?? session.started_at);
  const endedAt = getSessionTimestampMs(session.endedAt ?? session.ended_at ?? session.completedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) {
    return 0;
  }

  return Math.max(1, Math.round((endedAt - startedAt) / 1000));
}

function getCompletedSessionFarmTypeLabel(session = {}) {
  const farmTypeId = session.farmTypeId
    || session.mapType
    || state.farmType?.selectedFarmTypeId
    || getSelectedTrackerContext().farmTypeId
    || null;
  const poeVersion = normalizePoeVersion(session.poeVersion ?? session.poe_version)
    || getSelectedTrackerContext().poeVersion
    || state.settings?.poeVersion
    || 'poe1';
  const farmTypeModel = getFarmTypeModel();
  const farmType = typeof farmTypeModel.getFarmTypeById === 'function'
    ? (farmTypeModel.getFarmTypeById(farmTypeId, { poeVersion }) || farmTypeModel.getFarmTypeById(farmTypeId))
    : farmTypeModel.listFarmTypes().find((entry) => entry.id === farmTypeId);

  return farmType?.label || farmTypeId || 'No farm type';
}

function createCompletedSessionMapResult(session = {}) {
  const sessionId = session.id || session.sessionId;
  const durationSeconds = getCompletedSessionDurationSeconds(session);
  if (!sessionId || durationSeconds <= 0) {
    return null;
  }

  const trackerContext = getSelectedTrackerContext();
  const characterSummary = state.account?.summary || {};
  const totalLootChaos = getSessionNumber(session.totalLootChaos ?? session.total_loot_chaos, 0);
  const costChaos = getSessionNumber(session.costChaos ?? session.cost_chaos, 0);
  const netProfit = getSessionNumber(session.profitChaos ?? session.profit_chaos, totalLootChaos - costChaos);
  const poeVersion = normalizePoeVersion(session.poeVersion ?? session.poe_version)
    || trackerContext.poeVersion
    || state.settings?.poeVersion
    || 'poe1';
  const createdAt = session.endedAt
    || session.ended_at
    || session.completedAt
    || new Date().toISOString();
  const league = session.league || trackerContext.league || characterSummary.league || null;
  const lootEntries = Array.isArray(session.lootEntries) ? session.lootEntries : [];

  return {
    // The end time keeps ids unique per run, as stash-diff results are; main's shutdown result uses the same id.
    id: `map-result-${sessionId}-${Date.parse(createdAt)}`,
    sessionId,
    characterId: characterSummary.id || null,
    characterName: characterSummary.name || null,
    accountName: state.account?.accountName || null,
    poeVersion,
    league,
    mapName: session.mapName || session.map_name || 'Unknown Map',
    farmType: getCompletedSessionFarmTypeLabel(session),
    durationSeconds,
    inputValue: costChaos,
    outputValue: totalLootChaos,
    netProfit,
    profitState: netProfit > 0 ? 'positive' : netProfit < 0 ? 'negative' : 'neutral',
    topInputs: [],
    topOutputs: getScannedTopOutputs(lootEntries),
    lootItemCount: lootEntries.reduce((sum, loot) => sum + (parseInt(loot.quantity || 1, 10) || 1), 0),
    // The run's Divine and Mirror rates, as stash-diff results keep them: the overlay tiers the run by them.
    profitCurrencyRates: typeof getProfitCurrencyRates === 'function'
      ? getProfitCurrencyRates(poeVersion, league)
      : null,
    createdAt
  };
}

// An OCR run's most valuable drops, grouped by item, in the shape stash-diff results use. OCR keeps the casing it
// read, so "Divine orb" and "Divine Orb" are one item, named as first seen.
function getScannedTopOutputs(lootEntries = []) {
  const byItem = new Map();
  for (const loot of lootEntries) {
    const label = String(loot?.itemName || '').trim().replace(/\s+/g, ' ');
    if (!label) continue;
    const key = label.toLowerCase();
    const quantity = parseInt(loot.quantity || 1, 10) || 1;
    const entry = byItem.get(key) || { label, quantityDelta: 0, valueDelta: 0, currencyCode: 'chaos' };
    entry.quantityDelta += quantity;
    entry.valueDelta += (parseFloat(loot.chaosValue || 0) || 0) * quantity;
    byItem.set(key, entry);
  }

  return [...byItem.values()]
    .filter((entry) => entry.valueDelta > 0)
    .sort((a, b) => b.valueDelta - a.valueDelta)
    .slice(0, 3);
}

function normalizeCompletedSessionPoeVersion(value) {
  const normalized = String(value ?? '').toLowerCase();
  return normalized === 'poe1' || normalized === 'poe2' ? normalized : null;
}

function shouldPersistCompletedSessionMapResult(session = {}) {
  // A PoE1 stash diff records and shows its own, itemised result before it ends the session.
  const stashResultSessionId = typeof stashState !== 'undefined' ? stashState.lastMapResult?.sessionId : null;
  return !stashResultSessionId || stashResultSessionId !== (session.id || session.sessionId);
}

async function persistCompletedSessionMapResult(session = {}) {
  if (!shouldPersistCompletedSessionMapResult(session)) {
    return null;
  }

  const completedMapResult = createCompletedSessionMapResult(session);
  if (!completedMapResult) {
    return null;
  }

  try {
    await persistMapResultHistory(completedMapResult);
    return completedMapResult;
  } catch (error) {
    console.warn('Failed to persist completed map session result', error);
    return null;
  }
}

function shouldEndSessionAfterStashProfit(mapResult = {}) {
  if (!state.currentSession) {
    return false;
  }

  const poeVersion = normalizeCompletedSessionPoeVersion(mapResult?.poeVersion)
    || normalizeCompletedSessionPoeVersion(state.currentSession?.poeVersion ?? state.currentSession?.poe_version)
    || getSelectedTrackerContext().poeVersion;

  return poeVersion === 'poe1';
}

async function completeCurrentSessionAfterStashProfit(mapResult = {}) {
  if (!shouldEndSessionAfterStashProfit(mapResult)) {
    return null;
  }

  try {
    return await window.electronAPI.endSession(buildSessionCompletionPayloadFromMapResult(mapResult));
  } catch (error) {
    console.warn('Failed to end PoE1 session after stash profit calculation', error);
    return null;
  }
}

function buildSessionCompletionPayloadFromMapResult(mapResult = {}) {
  const totalLootChaos = getSessionNumber(
    mapResult.totalLootChaos ?? mapResult.outputValue ?? mapResult.totalLootValue,
    0
  );
  const profitChaos = getSessionNumber(
    mapResult.profitChaos ?? mapResult.netProfit,
    totalLootChaos
  );
  let durationSeconds = getSessionNumber(mapResult.durationSeconds, NaN);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    durationSeconds = state.currentSession ? getLiveDuration(state.currentSession) : 0;
  }
  const payload = {
    sessionId: mapResult.sessionId || state.currentSession?.id || null,
    mapName: state.currentSession?.mapName || mapResult.mapName || null,
    startedAt: state.currentSession?.startedAt || state.currentSession?.started_at || null,
    totalLootChaos,
    profitChaos
  };

  if (durationSeconds > 0) {
    payload.durationSeconds = Math.round(durationSeconds);
  }

  return payload;
}

async function loadMapResultHistory() {
  if (!state.currentUser) {
    state.mapResults = [];
    if (typeof renderLatestMapResult === 'function') {
      renderLatestMapResult();
    }
    if (typeof renderMapResultHistory === 'function') {
      renderMapResultHistory();
    }
    return state.mapResults;
  }

  try {
    const results = await window.electronAPI.getMapResults();
    state.mapResults = Array.isArray(results) ? results : [];
  } catch {
    state.mapResults = [];
  }

  if (typeof renderLatestMapResult === 'function') {
    renderLatestMapResult();
  }
  if (typeof renderMapResultHistory === 'function') {
    renderMapResultHistory();
  }
  return state.mapResults;
}

async function persistMapResultHistory(result) {
  const results = await window.electronAPI.saveMapResult(result);
  state.mapResults = Array.isArray(results) ? results : [];
  // The result just saved leads the list (appendMapResult prepends it); the next latest-result render lands it,
  // unless it was handed over already.
  const savedKey = state.mapResults[0]?.id || state.mapResults[0]?.localRunId || null;
  if (savedKey && savedKey !== state.landedMapResultKey) {
    state.landingMapResultKey = savedKey;
    state.landedMapResultKey = savedKey;
  }
  if (typeof renderLatestMapResult === 'function') {
    renderLatestMapResult();
  }
  if (typeof renderMapResultHistory === 'function') {
    renderMapResultHistory();
  }
  return state.mapResults;
}

function isPageActive(page) {
  const pageElement = document.getElementById(`${page}-page`);
  return Boolean(pageElement?.classList.contains('active'));
}

function resetDashboardSummary() {
  const formatProfit = typeof profitCurrencyHTML === 'function'
    ? profitCurrencyHTML
    : (value, iconSize, poeVersion) => currencyHTML(value, 'chaos', iconSize, poeVersion);
  elements.todaySessions.textContent = '0';
  elements.todayProfit.innerHTML = formatProfit(0, 18, state.settings.poeVersion || 'poe1');
  elements.todayAvg.innerHTML = formatProfit(0, 18, state.settings.poeVersion || 'poe1');
  if (elements.todayPerHour) {
    elements.todayPerHour.innerHTML = formatProfit(0, 18, state.settings.poeVersion || 'poe1');
  }
  if (elements.todayTime) {
    elements.todayTime.textContent = formatHoursMinutes(0);
  }
  if (typeof applyProfitTier === 'function') {
    applyProfitTier(elements.todayProfit, '');
    applyProfitTier(elements.todayAvg, '');
  }
}

// Time mapped reads as h:mm, like a clock.
function formatHoursMinutes(seconds) {
  const totalMinutes = Math.max(0, Math.floor((Number(seconds) || 0) / 60));
  return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function formatMapResultProfitHTML(result = {}, iconSize = 16, options = {}) {
  if (result?.profitUnavailable) {
    return '<span class="profit-unavailable">Not calculated</span>';
  }

  const formatProfit = typeof profitCurrencyHTML === 'function'
    ? profitCurrencyHTML
    : (value, size, poeVersion) => currencyHTML(value, 'chaos', size, poeVersion);

  return formatProfit(
    result?.netProfit || 0,
    iconSize,
    result?.poeVersion || state.settings?.poeVersion || 'poe1',
    options
  );
}

function getMapResultProfitTier(result = {}) {
  if (result?.profitUnavailable || typeof getProfitTierFor !== 'function') {
    return '';
  }

  return getProfitTierFor(result?.netProfit || 0, result?.poeVersion || state.settings?.poeVersion || 'poe1');
}

function renderLatestMapResult() {
  if (
    !elements.lastMapResultCard
    || !elements.lastMapResultFarmType
    || !elements.lastMapResultDuration
    || !elements.lastMapResultProfit
  ) {
    return;
  }

  // Only the result persistMapResultHistory just saved lands; a render for prices, the language or a refresh draws it without a roll.
  const landingKey = state.landingMapResultKey;
  state.landingMapResultKey = null;

  const canDisplayMapResult = typeof isDisplayableMapResult === 'function'
    ? isDisplayableMapResult
    : (result) => Number(result?.durationSeconds || 0) > 0;
  const latest = Array.isArray(state.mapResults)
    ? state.mapResults.find((result) => canDisplayMapResult(result)) || null
    : null;
  const hasCompletedResult = Boolean(latest);

  if (!hasCompletedResult) {
    elements.lastMapResultCard.dataset.resultState = 'empty';
    elements.lastMapResultFarmType.textContent = 'No completed map yet';
    if (typeof applyFarmType === 'function') {
      applyFarmType(elements.lastMapResultFarmType, '');
    }
    elements.lastMapResultDuration.textContent = '—';
    elements.lastMapResultProfit.innerHTML = '—';
    state.latestMapResultProfitHTML = null;
    if (typeof applyProfitTier === 'function') {
      applyProfitTier(elements.lastMapResultProfit, '');
    }
    if (elements.lastMapResultMeme) {
      elements.lastMapResultMeme.innerHTML = '';
    }
    return;
  }

  elements.lastMapResultCard.dataset.resultState = 'ready';
  elements.lastMapResultFarmType.textContent = latest.farmType || 'Unknown farm type';
  if (typeof applyFarmType === 'function') {
    applyFarmType(elements.lastMapResultFarmType, latest.farmType);
  }
  elements.lastMapResultDuration.textContent = formatDuration(latest.durationSeconds || 0);
  // The latest result is the biggest number on the dashboard: signed, in its tier colour, with the tier's meme badge.
  const resultKey = latest.id || latest.localRunId || null;
  const isLanding = Boolean(resultKey) && resultKey === landingKey;
  const profitHTML = formatMapResultProfitHTML(latest, 22, { signed: true });
  // A landing result counts up from 0. Any other render writes the number as it is, and only when it changed,
  // so the second save of an End Map does not cut the count-up short.
  if (isLanding && typeof countUp === 'function') {
    countUp(elements.lastMapResultProfit, profitHTML, { from: 0 });
  } else if (isLanding || profitHTML !== state.latestMapResultProfitHTML) {
    elements.lastMapResultProfit.innerHTML = profitHTML;
  }
  state.latestMapResultProfitHTML = profitHTML;
  const tier = typeof getMapResultProfitTier === 'function' ? getMapResultProfitTier(latest) : '';
  if (typeof applyProfitTier === 'function') {
    applyProfitTier(elements.lastMapResultProfit, tier);
  }
  if (elements.lastMapResultMeme) {
    elements.lastMapResultMeme.innerHTML = typeof profitMemeHTML === 'function' ? profitMemeHTML(tier) : '';
  }
  if (isLanding && typeof landLatestMapResult === 'function') {
    landLatestMapResult();
  }
}

let resultLandTimer = null;

// The result just saved lands once: data-fresh plays resultLand on its profit (styles.css), then goes so the next one can.
function landLatestMapResult() {
  const card = elements.lastMapResultCard;
  delete card.dataset.fresh;
  void card.offsetWidth; // restarts the animation when two results land within its 700ms
  card.dataset.fresh = '';
  clearTimeout(resultLandTimer);
  resultLandTimer = setTimeout(() => {
    delete card.dataset.fresh;
  }, 900);
}

function isPoe1ZeroLifecycleResult(result = {}) {
  const poeVersion = normalizeCompletedSessionPoeVersion(result.poeVersion)
    || state.settings?.poeVersion
    || 'poe1';
  const inputValue = getSessionNumber(result.inputValue, 0);
  const outputValue = getSessionNumber(result.outputValue, 0);
  const netProfit = getSessionNumber(result.netProfit, 0);
  const id = String(result.id || '');
  const hasSnapshotTimestampSuffix = /-\d{10,}$/.test(id);
  const hasTopItems = (
    Array.isArray(result.topInputs) && result.topInputs.length > 0
  ) || (
    Array.isArray(result.topOutputs) && result.topOutputs.length > 0
  );

  return poeVersion === 'poe1'
    && inputValue === 0
    && outputValue === 0
    && netProfit === 0
    && !hasTopItems
    && !hasSnapshotTimestampSuffix;
}

function isDisplayableMapResult(result = {}) {
  return Number(result?.durationSeconds || 0) > 0 && !isPoe1ZeroLifecycleResult(result);
}

function getMapResultPublishLabel(result = {}) {
  if (result.publishState === 'published') {
    return 'Published';
  }

  if (result.publishState === 'draft') {
    return 'Draft';
  }

  return 'Local';
}

function canPublishMapResult(result = {}) {
  return state.onlineAccount?.enabled === true
    && state.onlineAccount?.signedIn === true
    && isDisplayableMapResult(result)
    && result.publishState !== 'published';
}

function renderMapResultHistory() {
  if (!elements.mapResultFilter || !elements.mapResultHistory) {
    return;
  }

  const canDisplayMapResult = typeof isDisplayableMapResult === 'function'
    ? isDisplayableMapResult
    : (result) => Number(result?.durationSeconds || 0) > 0;
  const results = Array.isArray(state.mapResults)
    ? state.mapResults.filter((result) => canDisplayMapResult(result))
    : [];
  // The card appears with the first result; a filter never hides it, so the filter stays reachable.
  if (elements.mapResultHistoryCard) {
    elements.mapResultHistoryCard.hidden = results.length === 0;
  }
  const availableFarmTypes = [];
  const seenFarmTypes = new Set();

  results.forEach((result) => {
    const farmType = typeof result?.farmType === 'string' ? result.farmType.trim() : '';
    if (!farmType || seenFarmTypes.has(farmType)) {
      return;
    }

    seenFarmTypes.add(farmType);
    availableFarmTypes.push(farmType);
  });

  const selectedFarmType = availableFarmTypes.includes(elements.mapResultFilter.value)
    ? elements.mapResultFilter.value
    : '';

  elements.mapResultFilter.innerHTML = [
    '<option value="">All farms</option>',
    ...availableFarmTypes.map((farmType) => `<option value="${escapeHTML(farmType)}"${typeof farmTypeAttr === 'function' ? farmTypeAttr(farmType) : ''}>${escapeHTML(farmType)}</option>`)
  ].join('');
  elements.mapResultFilter.value = selectedFarmType;

  const filteredResults = getMapResultStoreModel().filterMapResults(results, { farmType: selectedFarmType });

  if (!filteredResults.length) {
    elements.mapResultHistory.innerHTML = '<p class="empty-state">No map results recorded yet.</p>';
    return;
  }

  elements.mapResultHistory.innerHTML = filteredResults.map((result) => {
    const publishLabel = typeof getMapResultPublishLabel === 'function'
      ? getMapResultPublishLabel(result)
      : (result?.publishState || 'local');
    const publishable = typeof canPublishMapResult === 'function'
      ? canPublishMapResult(result)
      : canDisplayMapResult(result);
    const profitTier = typeof getMapResultProfitTier === 'function' ? getMapResultProfitTier(result) : '';

    return `
      <article class="map-result-history-item" data-result-id="${escapeHTML(result?.id || '')}">
        <div class="map-result-history-main">
          <strong${typeof farmTypeAttr === 'function' ? farmTypeAttr(result?.farmType) : ''}>${escapeHTML(result?.farmType || 'Unknown farm type')}</strong>
          <span>${formatDuration(Number(result?.durationSeconds || 0))}</span>
          <span class="map-result-publish-state" data-publish-state="${escapeHTML(result?.publishState || 'local')}">${escapeHTML(publishLabel)}</span>
          ${typeof profitMemeHTML === 'function' ? profitMemeHTML(profitTier) : ''}
        </div>
        <div class="map-result-history-meta">
          <span class="map-result-history-profit"${profitTier ? ` data-profit-tier="${profitTier}"` : ''}>${formatMapResultProfitHTML(result, 14)}</span>
          <span>${escapeHTML(result?.createdAt ? timeAgo(result.createdAt) : 'Just now')}</span>
          <button type="button" class="map-result-publish-btn" data-result-id="${escapeHTML(result?.id || result?.localRunId || '')}" ${publishable ? '' : 'disabled'}>
            ${escapeHTML(result?.publishState === 'published' ? 'Shared' : 'Share')}
          </button>
        </div>
      </article>
    `;
  }).join('');
}

function findMapResultById(resultId) {
  const normalizedId = typeof resultId === 'string' ? resultId.trim() : '';
  if (!normalizedId || !Array.isArray(state.mapResults)) {
    return null;
  }

  return state.mapResults.find((result) => result?.id === normalizedId || result?.localRunId === normalizedId) || null;
}

function requestFarmPublishDetails(result = {}) {
  if (
    !elements.farmPublishModal
    || !elements.farmPublishForm
    || !elements.farmPublishVisibility
    || !elements.farmPublishDescription
  ) {
    return Promise.resolve({
      visibility: 'public',
      setupDescription: '',
      investmentKnown: false,
      farmType: result.farmType || null,
      publisherDisplayName: state.currentUser?.username || null
    });
  }

  const farmType = result.farmType || 'Unknown farm';
  const mapName = result.mapName || 'Unknown Map';
  if (elements.farmPublishSummary) {
    elements.farmPublishSummary.textContent = `${farmType} · ${mapName}`;
  }
  elements.farmPublishVisibility.value = result.publishedVisibility || 'public';
  elements.farmPublishDescription.value = result.setupDescription || '';
  if (elements.farmPublishInvestmentKnown) {
    elements.farmPublishInvestmentKnown.checked = result.investmentKnown === true;
  }
  elements.farmPublishModal.classList.remove('hidden');

  return new Promise((resolve) => {
    let settled = false;

    const cleanup = () => {
      elements.farmPublishModal.classList.add('hidden');
      elements.farmPublishForm.removeEventListener('submit', handleSubmit);
      elements.farmPublishCancelBtn?.removeEventListener('click', handleCancel);
      elements.farmPublishModal.removeEventListener('click', handleBackdropClick);
      document.removeEventListener('keydown', handleKeydown);
    };

    const settle = (value) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(value);
    };

    function handleSubmit(event) {
      event.preventDefault();
      settle({
        visibility: elements.farmPublishVisibility.value || 'public',
        setupDescription: elements.farmPublishDescription.value || '',
        investmentKnown: elements.farmPublishInvestmentKnown?.checked === true,
        farmType: result.farmType || null,
        publisherDisplayName: state.currentUser?.username || null
      });
    }

    function handleCancel() {
      settle(null);
    }

    function handleBackdropClick(event) {
      if (event.target === elements.farmPublishModal) {
        settle(null);
      }
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        settle(null);
      }
    }

    elements.farmPublishForm.addEventListener('submit', handleSubmit);
    elements.farmPublishCancelBtn?.addEventListener('click', handleCancel);
    elements.farmPublishModal.addEventListener('click', handleBackdropClick);
    document.addEventListener('keydown', handleKeydown);
    requestAnimationFrame(() => elements.farmPublishVisibility.focus());
  });
}

async function handleMapResultPublish(resultId) {
  const result = findMapResultById(resultId);
  if (!result || !canPublishMapResult(result)) {
    return;
  }

  const options = await requestFarmPublishDetails(result);
  if (!options) {
    return;
  }

  try {
    setButtonBusy(elements.farmPublishConfirmBtn, true);

    const response = await window.electronAPI.publishMapResults({
      resultIds: [result.id || result.localRunId],
      options
    });

    if (Array.isArray(response?.history)) {
      state.mapResults = response.history;
    }

    renderLatestMapResult();
    renderMapResultHistory();
    showToast('Farming Hub', 'Farm result published.', 'success');
  } catch (error) {
    showToast('Farming Hub', getUserFacingErrorMessage(error, 'errors.farmPublish'), 'error');
  } finally {
    setButtonBusy(elements.farmPublishConfirmBtn, false);
  }
}

function handleMapResultHistoryClick(event) {
  const button = event.target?.closest?.('.map-result-publish-btn');
  if (!button || button.disabled) {
    return;
  }

  void handleMapResultPublish(button.dataset.resultId);
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
      state.mapResults = [];
      resetDashboardSummary();
      renderLatestMapResult();
      renderMapResultHistory();
      renderRecentLoot();
      renderSessionsList();
      updateActiveSessionUI();
      return;
    }

    const tasks = [
      loadCurrentSession(),
      loadDashboardStats(),
      loadRecentLoot(),
      loadMapResultHistory()
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
 * Start a session
 */
function normalizeSessionMapName(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function getRuntimeSessionMapName() {
  return normalizeSessionMapName(
    state.runtimeSession?.currentInstance?.areaName
      || state.runtimeSession?.summary?.currentAreaName
      || state.runtimeSession?.currentArea
  );
}

function setMapSessionConfirmButton(label = 'Start Map') {
  if (!elements.mapSessionConfirmBtn) {
    return;
  }

  elements.mapSessionConfirmBtn.innerHTML = `
    <svg class="icon" width="14" height="14" aria-hidden="true"><use href="assets/icons.svg#play"/></svg>
    <span>${escapeHTML(label)}</span>
  `;
}

function populateMapSessionFarmTypes(selectedFarmTypeId = '', options = {}) {
  if (!elements.mapSessionFarmTypeSelect) {
    return null;
  }

  const { listFarmTypes } = getFarmTypeModel();
  const poeVersion = options.poeVersion
    || (typeof getFarmTypePoeVersion === 'function'
      ? getFarmTypePoeVersion()
      : (typeof getResolvedLeagueVersion === 'function' ? getResolvedLeagueVersion() : 'poe1'));
  const farmTypes = listFarmTypes({ poeVersion });
  const normalizedSelection = farmTypes.some((farmType) => farmType.id === selectedFarmTypeId)
    ? selectedFarmTypeId
    : '';

  elements.mapSessionFarmTypeSelect.innerHTML = [
    '<option value="">No farm type</option>',
    ...farmTypes.map((farmType) => `<option value="${escapeHTML(farmType.id)}"${typeof farmTypeAttr === 'function' ? farmTypeAttr(farmType.id) : ''}>${escapeHTML(farmType.label)}</option>`)
  ].join('');
  elements.mapSessionFarmTypeSelect.value = normalizedSelection;

  return normalizedSelection || null;
}

function requestMapSessionDetails({ defaultName, trackerContext } = {}) {
  const fallbackName = normalizeSessionMapName(defaultName)
    || `${window.t ? window.t('misc.unknownMap') : 'Unknown Map'} ${new Date().toLocaleString()}`;

  if (!elements.mapSessionModal || !elements.mapSessionNameInput || !elements.mapSessionForm) {
    return Promise.resolve({
      mapName: fallbackName,
      farmTypeId: trackerContext?.farmTypeId || null
    });
  }

  const title = elements.mapSessionModal.querySelector('#map-session-title');
  const subtitle = elements.mapSessionModal.querySelector('.modal-subtitle.compact');
  const label = elements.mapSessionModal.querySelector('.map-session-label');
  const farmTypeLabel = elements.mapSessionFarmTypeSelect?.previousElementSibling;

  if (title) title.textContent = 'Start New Map';
  if (subtitle) subtitle.textContent = 'Confirm the detected map and choose the farm type before tracking starts.';
  if (label) label.hidden = false;
  if (farmTypeLabel) farmTypeLabel.hidden = false;
  if (elements.mapSessionFarmTypeSelect) elements.mapSessionFarmTypeSelect.hidden = false;
  setMapSessionConfirmButton('Start Map');

  elements.mapSessionDefaultName.textContent = fallbackName;
  if (elements.mapSessionContext) {
    elements.mapSessionContext.textContent = trackerContext?.label || 'PoE Session';
  }
  elements.mapSessionNameInput.value = fallbackName;
  elements.mapSessionNameInput.hidden = false;
  elements.mapSessionNameInput.select();
  populateMapSessionFarmTypes(trackerContext?.farmTypeId || '', {
    poeVersion: trackerContext?.poeVersion
  });
  if (elements.mapSessionCancelBtn) elements.mapSessionCancelBtn.textContent = 'Cancel';
  elements.mapSessionModal.dataset.modalPurpose = 'new-map-session';
  elements.mapSessionModal.classList.remove('hidden');

  return new Promise((resolve) => {
    let settled = false;

    const cleanup = () => {
      elements.mapSessionModal.classList.add('hidden');
      elements.mapSessionForm.removeEventListener('submit', handleSubmit);
      elements.mapSessionCancelBtn?.removeEventListener('click', handleCancel);
      elements.mapSessionModal.removeEventListener('click', handleBackdropClick);
      document.removeEventListener('keydown', handleKeydown);
    };

    const settle = (value) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(value);
    };

    function handleSubmit(event) {
      event.preventDefault();
      const selectedName = normalizeSessionMapName(elements.mapSessionNameInput.value) || fallbackName;
      settle({
        mapName: selectedName,
        farmTypeId: elements.mapSessionFarmTypeSelect?.value || null
      });
    }

    function handleCancel() {
      settle(null);
    }

    function handleBackdropClick(event) {
      if (event.target === elements.mapSessionModal) {
        settle(null);
      }
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        settle(null);
      }
    }

    elements.mapSessionForm.addEventListener('submit', handleSubmit);
    elements.mapSessionCancelBtn?.addEventListener('click', handleCancel);
    elements.mapSessionModal.addEventListener('click', handleBackdropClick);
    document.addEventListener('keydown', handleKeydown);
    requestAnimationFrame(() => {
      elements.mapSessionNameInput.focus();
    });
  });
}

async function requestMapSessionName(options = {}) {
  const result = await requestMapSessionDetails(options);
  return result?.mapName || null;
}

function requestEndSessionConfirmation(session = state.currentSession) {
  if (!elements.mapSessionModal || !elements.mapSessionForm) {
    return Promise.resolve(true);
  }

  const title = elements.mapSessionModal.querySelector('#map-session-title');
  const subtitle = elements.mapSessionModal.querySelector('.modal-subtitle.compact');
  const label = elements.mapSessionModal.querySelector('.map-session-label');
  const farmTypeLabel = elements.mapSessionFarmTypeSelect?.previousElementSibling;
  const previous = {
    purpose: elements.mapSessionModal.dataset.modalPurpose,
    title: title?.textContent || '',
    subtitle: subtitle?.textContent || '',
    context: elements.mapSessionContext?.textContent || '',
    defaultName: elements.mapSessionDefaultName?.textContent || '',
    inputValue: elements.mapSessionNameInput?.value || '',
    inputHidden: elements.mapSessionNameInput?.hidden === true,
    labelHidden: label?.hidden === true,
    farmTypeValue: elements.mapSessionFarmTypeSelect?.value || '',
    farmTypeHidden: elements.mapSessionFarmTypeSelect?.hidden === true,
    farmTypeLabelHidden: farmTypeLabel?.hidden === true,
    confirmHTML: elements.mapSessionConfirmBtn?.innerHTML || '',
    cancelText: elements.mapSessionCancelBtn?.textContent || ''
  };

  if (title) title.textContent = 'End Map Session';
  if (subtitle) subtitle.textContent = 'Finish this run and save the completed map result.';
  if (elements.mapSessionContext) elements.mapSessionContext.textContent = 'Active run';
  if (elements.mapSessionDefaultName) elements.mapSessionDefaultName.textContent = session?.mapName || 'Unknown Map';
  if (elements.mapSessionNameInput) elements.mapSessionNameInput.hidden = true;
  if (label) label.hidden = true;
  if (farmTypeLabel) farmTypeLabel.hidden = true;
  if (elements.mapSessionFarmTypeSelect) elements.mapSessionFarmTypeSelect.hidden = true;
  if (elements.mapSessionConfirmBtn) elements.mapSessionConfirmBtn.textContent = 'End Map';
  if (elements.mapSessionCancelBtn) elements.mapSessionCancelBtn.textContent = 'Keep Tracking';
  elements.mapSessionModal.dataset.modalPurpose = 'end-map-session';
  elements.mapSessionModal.classList.remove('hidden');

  return new Promise((resolve) => {
    let settled = false;

    const restore = () => {
      elements.mapSessionModal.classList.add('hidden');
      elements.mapSessionModal.dataset.modalPurpose = previous.purpose || 'new-map-session';
      if (title) title.textContent = previous.title;
      if (subtitle) subtitle.textContent = previous.subtitle;
      if (elements.mapSessionContext) elements.mapSessionContext.textContent = previous.context;
      if (elements.mapSessionDefaultName) elements.mapSessionDefaultName.textContent = previous.defaultName;
      if (elements.mapSessionNameInput) {
        elements.mapSessionNameInput.hidden = previous.inputHidden;
        elements.mapSessionNameInput.value = previous.inputValue;
      }
      if (label) label.hidden = previous.labelHidden;
      if (farmTypeLabel) farmTypeLabel.hidden = previous.farmTypeLabelHidden;
      if (elements.mapSessionFarmTypeSelect) {
        elements.mapSessionFarmTypeSelect.hidden = previous.farmTypeHidden;
        elements.mapSessionFarmTypeSelect.value = previous.farmTypeValue;
      }
      if (elements.mapSessionConfirmBtn) elements.mapSessionConfirmBtn.innerHTML = previous.confirmHTML;
      if (elements.mapSessionCancelBtn) elements.mapSessionCancelBtn.textContent = previous.cancelText;
      elements.mapSessionForm.removeEventListener('submit', handleSubmit);
      elements.mapSessionCancelBtn?.removeEventListener('click', handleCancel);
      elements.mapSessionModal.removeEventListener('click', handleBackdropClick);
      document.removeEventListener('keydown', handleKeydown);
    };

    const settle = (value) => {
      if (settled) return;
      settled = true;
      restore();
      resolve(value);
    };

    function handleSubmit(event) {
      event.preventDefault();
      settle(true);
    }

    function handleCancel() {
      settle(false);
    }

    function handleBackdropClick(event) {
      if (event.target === elements.mapSessionModal) {
        settle(false);
      }
    }

    function handleKeydown(event) {
      if (event.key === 'Escape') {
        settle(false);
      }
    }

    elements.mapSessionForm.addEventListener('submit', handleSubmit);
    elements.mapSessionCancelBtn?.addEventListener('click', handleCancel);
    elements.mapSessionModal.addEventListener('click', handleBackdropClick);
    document.addEventListener('keydown', handleKeydown);
    requestAnimationFrame(() => {
      elements.mapSessionConfirmBtn?.focus();
    });
  });
}

async function handleStartSession(options = {}) {
  const trackerContext = getSelectedTrackerContext();
  const runtimeMapName = normalizeSessionMapName(options.defaultMapName) || getRuntimeSessionMapName();
  const trustedSessionDetails = options.sessionDetails && typeof options.sessionDetails === 'object'
    ? options.sessionDetails
    : null;
  const requestedSession = trustedSessionDetails || await requestMapSessionDetails({
    defaultName: runtimeMapName,
    trackerContext
  });
  const requestedMapName = typeof requestedSession === 'string'
    ? requestedSession
    : requestedSession?.mapName;
  const mapName = normalizeSessionMapName(requestedMapName);
  if (!mapName) {
    return;
  }

  const farmTypeId = typeof requestedSession === 'string'
    ? trackerContext.farmTypeId
    : (requestedSession?.farmTypeId || null);
  const sessionPayload = {
    mapName,
    poeVersion: trackerContext.poeVersion,
    league: trackerContext.league
  };

  if (farmTypeId) {
    sessionPayload.farmTypeId = farmTypeId;
  }

  try {
    if (farmTypeId !== trackerContext.farmTypeId && window.electronAPI?.setActiveFarmType) {
      await window.electronAPI.setActiveFarmType(farmTypeId);
      if (state.farmType && typeof getFarmTypeModel === 'function') {
        const { selectFarmType, clearFarmType } = getFarmTypeModel();
        if (farmTypeId) {
          selectFarmType(state.farmType, farmTypeId, {
            poeVersion: trackerContext.poeVersion
          });
        } else {
          clearFarmType(state.farmType);
        }
        renderFarmTypeSelector();
      }
    }

    const session = await window.electronAPI.startSession(sessionPayload);
    if (session) {
      state.currentSession = session;
      updateActiveSessionUI();
      if (typeof scheduleAutomaticBeforeSnapshotForSession === 'function') {
        scheduleAutomaticBeforeSnapshotForSession(session);
      }
      await refreshTrackerData({ includeSessions: true });
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

  if (!await requestEndSessionConfirmation(state.currentSession)) return;

  if (typeof completePoe1SessionWithStashProfit === 'function' && isActiveSessionPoe1(state.currentSession)) {
    await completePoe1SessionWithStashProfit();
    return;
  }

  const previousSession = state.currentSession;
  const completedAt = new Date().toISOString();

  try {
    const result = await window.electronAPI.endSession();
    const completedSession = {
      ...previousSession,
      ...(result || {}),
      endedAt: result?.endedAt || result?.ended_at || completedAt,
      status: result?.status || 'completed'
    };
    await persistCompletedSessionMapResult(completedSession);

    state.currentSession = null;
    updateActiveSessionUI();
    await refreshTrackerData({ includeSessions: true });
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'errors.sessionEnd'), 'error');
  }
}

/**
 * Update the active session UI
 */
async function loadCurrentSession() {
  try {
    const session = await window.electronAPI.getCurrentSession();
    state.currentSession = session;
    updateActiveSessionUI();
    return session;
  } catch (error) {
    if (state.currentSession) {
      console.warn('Keeping the active session visible after current-session refresh failed', error);
      updateActiveSessionUI();
      return state.currentSession;
    }

    state.currentSession = null;
    updateActiveSessionUI();
    return null;
  }
}

// m:ss under an hour, h:mm:ss after, so a running map reads like a clock.
function formatElapsedClock(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

let renderedActiveSessionHTML = null;
let renderedActiveSessionItems = null;

// The active map card. Its markup is rebuilt only when the run, its loot or its prices change, so the
// 1 s clock (updateActiveSessionClock) rewrites only the elapsed time.
function updateActiveSessionUI() {
  const session = state.currentSession;
  if (elements.sessionCard?.dataset) {
    elements.sessionCard.dataset.sessionState = session ? 'active' : 'idle';
  }
  elements.startSessionBtn.classList.toggle('hidden', Boolean(session));
  elements.endSessionBtn.classList.toggle('hidden', !session);
  elements.scanScreenBtn?.classList.toggle('hidden', !session);
  if (elements.sessionBadge) {
    elements.sessionBadge.textContent = window.t(session ? 'dashboard.active' : 'dashboard.waiting');
    elements.sessionBadge.classList.toggle('is-active', Boolean(session));
  }

  if (!session) {
    stopSessionClock();
    renderedActiveSessionHTML = null;
    renderedActiveSessionItems = null;
    // Auto-start opens the start prompt on map entry, so the hint mentions it only while that setting is on.
    const idleHint = state.settings?.autoStartSession
      ? `${window.t('dashboard.idleHint')} ${window.t('dashboard.idleHintAutoStart')}`
      : window.t('dashboard.idleHint');
    elements.activeSession.innerHTML = emptyStateHTML({ art: 'mascot', title: window.t('dashboard.noActiveMap'), hint: idleHint });
    renderFarmTypeSelector();
    return;
  }

  const lootEntries = Array.isArray(session.lootEntries) ? session.lootEntries : [];
  const totalLootChaos = parseFloat(session.totalLootChaos || 0);
  const costChaos = parseFloat(session.costChaos || 0);
  const profitChaos = parseFloat(session.profitChaos || 0);
  const itemCount = lootEntries.reduce((sum, loot) => sum + (parseInt(loot.quantity || 1, 10) || 1), 0);
  const poeVersion = session.poeVersion || state.settings.poeVersion || 'poe1';
  const rateOptions = { league: session.league };
  const profitTier = typeof getProfitTierFor === 'function'
    ? getProfitTierFor(profitChaos, poeVersion, rateOptions)
    : (profitChaos < 0 ? 'loss' : 'normal');
  const formatProfit = typeof profitCurrencyHTML === 'function'
    ? profitCurrencyHTML
    : (value, iconSize, version) => currencyHTML(value, 'chaos', iconSize, version);
  const memeFor = typeof profitMemeHTML === 'function' ? profitMemeHTML : () => '';
  const farmTypeId = getSessionFarmTypeId(session);
  const metaParts = [
    poeVersion === 'poe2' ? 'PoE 2' : 'PoE 1',
    escapeHTML(session.league || 'Standard'),
    window.t('dashboard.startedAt', {
      time: escapeHTML(new Date(session.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    }),
    window.t(itemCount === 1 ? 'dashboard.itemCountOne' : 'dashboard.itemCount', { count: itemCount })
  ];
  // Loot and cost differ only when the run had a cost.
  if (costChaos > 0) {
    metaParts.push(`${window.t('dashboard.liveLoot')} ${formatProfit(totalLootChaos, 14, poeVersion, rateOptions)}`);
    metaParts.push(`${window.t('sessions.cost')} ${formatProfit(costChaos, 14, poeVersion, rateOptions)}`);
  }

  const html = `
    <div class="session-live">
      <div class="session-live-title">
        <span class="session-live-dot" aria-hidden="true"></span>
        <strong class="session-live-map">${escapeHTML(session.mapName || 'Unknown Map')}</strong>
        ${session.mapTier ? `<span class="session-live-chip">T${escapeHTML(session.mapTier)}</span>` : ''}
        ${farmTypeId ? `<span class="session-live-farm"${farmTypeAttr(farmTypeId)}>${escapeHTML(getSessionFarmTypeLabel(session))}</span>` : ''}
      </div>
      <div class="session-live-tiles">
        <div class="session-live-tile">
          <span class="session-live-label">${window.t('dashboard.elapsed')}</span>
          <strong class="session-live-value" data-live="elapsed"></strong>
        </div>
        <div class="session-live-tile" data-live="profit">
          <span class="session-live-label">${window.t('dashboard.liveProfit')}</span>
          <div class="session-live-profit">
            <strong class="session-live-value" data-profit-tier="${profitTier}">${formatProfit(profitChaos, 20, poeVersion, { ...rateOptions, signed: true })}</strong>
            ${memeFor(profitTier)}
          </div>
        </div>
      </div>
      <p class="session-live-meta">${metaParts.join(' · ')}</p>
    </div>
  `;

  if (html !== renderedActiveSessionHTML) {
    renderedActiveSessionHTML = html;
    elements.activeSession.innerHTML = html;
    // New loot gets one short bump on the profit tile, so a scan is seen landing.
    if (renderedActiveSessionItems !== null && itemCount > renderedActiveSessionItems) {
      elements.activeSession.querySelector('[data-live="profit"]')?.classList.add('is-bumped');
    }
  }
  renderedActiveSessionItems = itemCount;
  updateActiveSessionClock();
  if (!document.hidden) {
    startSessionClock();
  }
  renderFarmTypeSelector();
}

function updateActiveSessionClock() {
  const elapsed = elements.activeSession?.querySelector?.('[data-live="elapsed"]');
  if (elapsed && state.currentSession) {
    elapsed.textContent = formatElapsedClock(getLiveDuration(state.currentSession));
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

  // Only the label changes; setting the button's textContent would drop its icon.
  elements.scanScreenBtn.disabled = true;
  elements.scanScreenLabel.textContent = window.t('dashboard.scanning');

  try {
    await window.electronAPI.scanScreen();
    showToast(window.t('dashboard.scanScreen'), window.t('toast.scanComplete'));
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'toast.scanError'), 'error');
  } finally {
    elements.scanScreenBtn.disabled = false;
    elements.scanScreenLabel.textContent = window.t('dashboard.scanScreen');
  }
}

/**
 * Session'lari yukle
 */
async function loadSessions() {
  const filter = elements.sessionFilter.value;
  if (!state.currentUser) {
    state.sessions = [];
    populateSessionFilterOptions([]);
    renderSessionsList();
    return;
  }

  elements.sessionsList.innerHTML = `<p class="empty-state">${window.t('sessions.loading')}</p>`;

  try {
    const params = { limit: 50, includeAllContexts: true };
    if (filter && filter !== 'all') {
      params.status = filter;
    }

    const response = await window.electronAPI.getSessions(params);
    state.sessions = response?.sessions || [];
    populateSessionFilterOptions(state.sessions);
    renderSessionsList();
  } catch (error) {
    elements.sessionsList.innerHTML = `<p class="empty-state">${getUserFacingErrorMessage(error, 'sessions.loadError')}</p>`;
    renderSessionsSummary([]);
  }
}

function getFilterValue(element) {
  return element?.value || 'all';
}

function getSearchFilterValue(element) {
  return String(element?.value || '').trim().toLowerCase();
}

function getSessionFarmTypeId(session = {}) {
  return session.farmTypeId || session.mapType || null;
}

function getSessionPoeVersion(session = {}) {
  return normalizePoeVersion(session.poeVersion ?? session.poe_version) || 'poe1';
}

function getSessionFarmTypeLabel(session = {}) {
  const farmTypeId = getSessionFarmTypeId(session);
  if (!farmTypeId) {
    return 'No farm type';
  }

  const poeVersion = getSessionPoeVersion(session);
  const farmTypeModel = getFarmTypeModel();
  const farmType = typeof farmTypeModel.getFarmTypeById === 'function'
    ? (farmTypeModel.getFarmTypeById(farmTypeId, { poeVersion }) || farmTypeModel.getFarmTypeById(farmTypeId))
    : farmTypeModel.listFarmTypes().find((entry) => entry.id === farmTypeId);

  return farmType?.label || farmTypeId;
}

function populateSelectOptions(select, values, defaultValue, defaultLabel) {
  if (!select) return;

  const previousValue = select.value || defaultValue;
  const uniqueValues = [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  select.innerHTML = [
    `<option value="${escapeHTML(defaultValue)}">${escapeHTML(defaultLabel)}</option>`,
    ...uniqueValues.map((value) => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`)
  ].join('');
  select.value = uniqueValues.includes(previousValue) ? previousValue : defaultValue;
}

function populateSessionFilterOptions(sessions = []) {
  populateSelectOptions(
    elements.sessionLeagueFilter,
    sessions.map((session) => session.league || 'Standard'),
    'all',
    'All leagues'
  );

  populateSelectOptions(
    elements.sessionFarmFilter,
    sessions.map(getSessionFarmTypeLabel),
    'all',
    'All farms'
  );
}

function getFilteredSessions() {
  const versionFilter = getFilterValue(elements.sessionVersionFilter);
  const leagueFilter = getFilterValue(elements.sessionLeagueFilter);
  const farmFilter = getFilterValue(elements.sessionFarmFilter);
  const searchFilter = getSearchFilterValue(elements.sessionSearchFilter);

  return state.sessions.filter((session) => {
    const poeVersion = getSessionPoeVersion(session);
    const league = session.league || 'Standard';
    const farmTypeLabel = getSessionFarmTypeLabel(session);
    const searchableText = [
      session.mapName,
      league,
      farmTypeLabel,
      session.strategyTag,
      session.notes
    ].filter(Boolean).join(' ').toLowerCase();

    if (versionFilter !== 'all' && poeVersion !== versionFilter) {
      return false;
    }
    if (leagueFilter !== 'all' && league !== leagueFilter) {
      return false;
    }
    if (farmFilter !== 'all' && farmTypeLabel !== farmFilter) {
      return false;
    }

    return !searchFilter || searchableText.includes(searchFilter);
  });
}

function populateFarmingHubFarmOptions() {
  const select = elements.farmingHubFarmFilter;
  if (!select) return;

  const previousValue = select.value || 'all';
  const versionFilter = getFilterValue(elements.farmingHubVersionFilter);
  const farmTypes = getFarmTypeModel().listFarmTypes(versionFilter === 'all' ? {} : { poeVersion: versionFilter });
  const runFarmTypes = state.farmingHubRuns.map((run) => run.farmType).filter(Boolean);
  const optionLabels = [...new Set([...farmTypes.map((farmType) => farmType.label), ...runFarmTypes])];

  populateSelectOptions(select, optionLabels, 'all', 'All farms');
  select.value = optionLabels.includes(previousValue) ? previousValue : 'all';
}

function getFarmingHubFilters() {
  const versionFilter = getFilterValue(elements.farmingHubVersionFilter);
  const farmFilter = getFilterValue(elements.farmingHubFarmFilter);
  const league = String(elements.farmingHubLeagueFilter?.value || '').trim();
  const minProfitChaos = String(elements.farmingHubMinProfitFilter?.value || '').trim();
  const params = { limit: 50 };

  if (versionFilter !== 'all') {
    params.poeVersion = versionFilter;
  }
  if (farmFilter !== 'all') {
    params.farmType = farmFilter;
  }
  if (league) {
    params.league = league;
  }
  if (minProfitChaos) {
    params.minProfitChaos = minProfitChaos;
  }

  return params;
}

async function loadFarmingHubRuns() {
  if (!elements.farmingHubList) return;

  const online = Boolean(state.onlineAccount?.enabled);
  const loadId = (state.farmingHubLoadId || 0) + 1;
  state.farmingHubLoadId = loadId;
  if (elements.farmingHubFilters) elements.farmingHubFilters.hidden = !online;
  if (elements.farmingHubRefreshBtn) elements.farmingHubRefreshBtn.disabled = !online;

  if (!online) {
    state.farmingHubRuns = [];
    const action = `<button type="button" class="btn btn-secondary btn-small" data-hub-action="open-online-settings"><svg class="icon icon-sm" width="12" height="12" aria-hidden="true"><use href="assets/icons.svg#link"/></svg><span class="btn-label">${escapeHTML(window.t('farmingHub.openOnlineSettings'))}</span></button>`;
    elements.farmingHubList.innerHTML = emptyStateHTML({
      art: 'publish',
      panel: true,
      title: escapeHTML(window.t('farmingHub.offTitle')),
      hint: escapeHTML(window.t('farmingHub.onlineOff')),
      action
    });
    return;
  }

  populateFarmingHubFarmOptions();
  elements.farmingHubList.innerHTML = `<p class="empty-state">${escapeHTML(window.t('farmingHub.loading'))}</p>`;

  try {
    if (!window.electronAPI?.getFarmingHubRuns) {
      throw new Error('Farming Hub desktop bridge is unavailable');
    }

    const response = await window.electronAPI.getFarmingHubRuns(getFarmingHubFilters());
    if (loadId !== state.farmingHubLoadId) return;
    state.farmingHubRuns = response?.runs || [];
    populateFarmingHubFarmOptions();
    renderFarmingHubRuns();
  } catch (error) {
    if (loadId !== state.farmingHubLoadId) return;
    state.farmingHubRuns = [];
    elements.farmingHubList.innerHTML = `<p class="empty-state">${escapeHTML(getUserFacingErrorMessage(error, 'toast.unexpectedError'))}</p>`;
  }
}

function renderFarmingHubRuns() {
  if (!elements.farmingHubList) return;

  if (!state.farmingHubRuns.length) {
    elements.farmingHubList.innerHTML = `<p class="empty-state">${escapeHTML(window.t('farmingHub.noMatch'))}</p>`;
    return;
  }

  const formatProfit = typeof profitCurrencyHTML === 'function'
    ? profitCurrencyHTML
    : (value, iconSize, poeVersion) => currencyHTML(value, 'chaos', iconSize, poeVersion);
  const profitTierFor = typeof getProfitTierFor === 'function'
    ? getProfitTierFor
    : (value) => (Number(value) < 0 ? 'loss' : 'normal');
  const memeFor = typeof profitMemeHTML === 'function' ? profitMemeHTML : () => '';
  const reactionsFor = typeof farmRunReactionsHTML === 'function' ? farmRunReactionsHTML : () => '';

  elements.farmingHubList.innerHTML = state.farmingHubRuns.map((run) => {
    const poeVersion = normalizePoeVersion(run.poeVersion) || 'poe1';
    const profit = Number(run.profitChaos || 0);
    const duration = run.durationSeconds ? formatDuration(run.durationSeconds) : '-';
    const author = run.publisherDisplayName || run.author?.username || 'Unknown exile';
    const profitTier = profitTierFor(profit, poeVersion);

    return `
      <article class="farming-hub-run">
        <div class="farming-hub-run-main">
          <div class="farming-hub-run-kicker">${poeVersion === 'poe2' ? 'PoE 2' : 'PoE 1'} / ${escapeHTML(run.league || 'Standard')} / ${escapeHTML(author)}</div>
          <h3${typeof farmTypeAttr === 'function' ? farmTypeAttr(run.farmType) : ''}>${escapeHTML(run.farmType || 'Unknown farm')}</h3>
          <p>${escapeHTML(run.setupDescription || 'No setup notes shared.')}</p>
        </div>
        <div class="farming-hub-run-metrics">
          <span><strong>${escapeHTML(String(run.runCount || 1))}</strong> maps</span>
          <span><strong>${duration}</strong> duration</span>
          <span data-profit-tier="${profitTier}">${formatProfit(profit, 16, poeVersion)}</span>
          ${memeFor(profitTier)}
          ${reactionsFor(run.reactions, poeVersion)}
        </div>
      </article>
    `;
  }).join('');
}

/**
 * Dashboard istatistiklerini yukle
 */
async function loadDashboardStats() {
  if (!state.currentUser) {
    resetDashboardSummary();
    return;
  }

  // A refresh keeps the numbers and tiers on screen, dimmed (styles.css), until the new ones are written.
  const statValues = [elements.todaySessions, elements.todayProfit, elements.todayAvg, elements.todayPerHour, elements.todayTime]
    .filter(Boolean);
  statValues.forEach((element) => element.setAttribute?.('aria-busy', 'true'));
  const writeAmount = typeof countUp === 'function'
    ? countUp
    : (element, html) => { element.innerHTML = html; };

  try {
    const trackerContext = typeof getSelectedTrackerContext === 'function'
      ? getSelectedTrackerContext()
      : {};
    // Price and tier the numbers with the same game and league the stats were read for.
    const poeVersion = trackerContext.poeVersion || state.settings.poeVersion || 'poe1';
    const rateOptions = { league: trackerContext.league };
    const response = await window.electronAPI.getDashboardStats({
      poeVersion: trackerContext.poeVersion,
      league: trackerContext.league
    });
    const summary = response?.summary || {};
    const totalSessions = parseInt(summary.totalSessions || 0, 10);
    const totalProfit = parseFloat(summary.totalProfit || 0);
    const avgProfitPerMap = parseFloat(summary.avgProfitPerMap || 0);
    const avgProfitPerHour = parseFloat(summary.avgProfitPerHour || 0);
    const formatProfit = typeof profitCurrencyHTML === 'function'
      ? profitCurrencyHTML
      : (value, iconSize, version) => currencyHTML(value, 'chaos', iconSize, version);

    elements.todaySessions.textContent = String(totalSessions);
    // The amounts count up from the numbers on screen when they stay in the same currency (countUp).
    writeAmount(elements.todayProfit, formatProfit(totalProfit, 18, poeVersion, { ...rateOptions, signed: true }));
    writeAmount(elements.todayAvg, formatProfit(avgProfitPerMap, 18, poeVersion, rateOptions));
    if (elements.todayPerHour) {
      writeAmount(elements.todayPerHour, formatProfit(avgProfitPerHour, 18, poeVersion, rateOptions));
    }
    if (elements.todayTime) {
      elements.todayTime.textContent = formatHoursMinutes(summary.totalDuration);
    }
    // Tiers measure one run, so the per-map average carries one (none before the first map); the day's total only shows a loss.
    if (typeof applyProfitTier === 'function') {
      applyProfitTier(elements.todayProfit, totalProfit < 0 ? 'loss' : '');
      applyProfitTier(elements.todayAvg, totalSessions > 0 && typeof getProfitTierFor === 'function'
        ? getProfitTierFor(avgProfitPerMap, poeVersion, rateOptions)
        : '');
    }
  } catch (error) {
    resetDashboardSummary();
  } finally {
    statValues.forEach((element) => element.removeAttribute?.('aria-busy'));
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

  // A refresh keeps the list on screen, dimmed (styles.css), instead of flashing a loading line over it.
  elements.recentLootList.setAttribute('aria-busy', 'true');

  try {
    const response = await window.electronAPI.getRecentLoot({ limit: 6 });
    state.recentLoot = response?.lootEntries || [];
    renderRecentLoot();
  } catch (error) {
    state.recentLoot = [];
    elements.recentLootList.innerHTML = `<p class="empty-state">${getUserFacingErrorMessage(error, 'dashboard.noLoot')}</p>`;
  } finally {
    elements.recentLootList.removeAttribute('aria-busy');
  }
}

function renderSessionsList() {
  if (!elements.sessionsList) return;

  if (!state.currentUser) {
    elements.sessionsList.innerHTML = `<p class="empty-state">${window.t('sessions.empty')}</p>`;
    renderSessionsSummary([]);
    closeSessionDrawer();
    return;
  }

  if (!state.sessions.length) {
    elements.sessionsList.innerHTML = `<p class="empty-state">${window.t('sessions.empty')}</p>`;
    renderSessionsSummary([]);
    closeSessionDrawer();
    return;
  }

  const filteredSessions = getFilteredSessions();
  renderSessionsSummary(filteredSessions);
  if (!filteredSessions.length) {
    elements.sessionsList.innerHTML = `<p class="empty-state">${window.t('sessions.noMatch')}</p>`;
    closeSessionDrawer();
    return;
  }

  const formatProfit = typeof profitCurrencyHTML === 'function'
    ? profitCurrencyHTML
    : (value, iconSize, poeVersion) => currencyHTML(value, 'chaos', iconSize, poeVersion);
  const profitTierFor = typeof getProfitTierFor === 'function'
    ? getProfitTierFor
    : (value) => (Number(value) < 0 ? 'loss' : 'normal');
  const memeFor = typeof profitMemeHTML === 'function' ? profitMemeHTML : () => '';
  // Sighted users get the column names once; screen readers get them inside each row instead.
  const head = `
    <div class="sessions-list-head" aria-hidden="true">
      <span>${window.t('sessions.headMap')}</span>
      <span>${window.t('sessions.duration')}</span>
      <span>${window.t('sessions.headItems')}</span>
      <span class="is-end">${window.t('sessions.headProfit')}</span>
    </div>
  `;
  elements.sessionsList.innerHTML = head + filteredSessions.map((session) => {
    const profit = parseFloat(session.profitChaos || 0);
    const lootCount = Number.isFinite(session.lootCount)
      ? session.lootCount
      : (Array.isArray(session.lootEntries)
        ? session.lootEntries.reduce((sum, loot) => sum + parseInt(loot.quantity || 0, 10), 0)
        : 0);
    const poeVersion = getSessionPoeVersion(session);
    const farmTypeId = getSessionFarmTypeId(session);
    const contextLabel = `${poeVersion === 'poe2' ? 'PoE 2' : 'PoE 1'} / ${escapeHTML(session.league || 'Standard')} / <span${typeof farmTypeAttr === 'function' ? farmTypeAttr(farmTypeId) : ''}>${escapeHTML(getSessionFarmTypeLabel(session))}</span>`;
    // The farm colour reaches only the row's edge; data-farm-type on the row would tint all of its text.
    const farmEdgeId = typeof getFarmTypeIdFor === 'function' ? getFarmTypeIdFor(farmTypeId) : null;
    const farmEdgeStyle = farmEdgeId ? ` style="--farm-color: var(--farm-${farmEdgeId})"` : '';
    const isActive = session.status === 'active';
    const duration = isActive
      ? formatDuration(getLiveDuration(session))
      : (session.durationSec ? formatDuration(session.durationSec) : '-');
    const tierChip = session.mapTier ? `<span class="session-tier-chip">T${escapeHTML(session.mapTier)}</span>` : '';
    const startedAt = session.startedAt ? timeAgo(session.startedAt) : '-';
    const profitTier = profitTierFor(profit, poeVersion);
    // Completed is the normal case, so only active and abandoned runs get a status chip.
    const statusChip = isActive || session.status === 'abandoned'
      ? `<div class="session-status ${session.status}">${window.t(isActive ? 'sessions.active' : 'sessions.abandoned')}</div>`
      : '';

    return `
      <button class="session-item${isActive ? ' is-active' : ''}" type="button" data-session-id="${escapeHTML(session.id)}"${farmEdgeStyle}>
        <div class="session-primary">
          <div class="session-title">${tierChip}<span class="session-name" lang="en">${escapeHTML(session.mapName || 'Unknown Map')}</span></div>
          <div class="session-meta">${contextLabel} / ${startedAt}</div>
        </div>
        <span class="session-stat"><span class="visually-hidden">${window.t('sessions.duration')} </span>${duration}</span>
        <span class="session-stat"><span class="visually-hidden">${window.t('sessions.headItems')} </span>${lootCount}</span>
        <div class="session-profit" data-profit-tier="${profitTier}">${formatProfit(profit, 16, poeVersion)}${memeFor(profitTier)}</div>
        ${statusChip}
      </button>
    `;
  }).join('');

}

// The summary covers one game and league so it never adds up chaos from different economies: each half comes from
// its filter when that is set, else from the tracker's context. With no completed runs there, the summary hides.
function getSessionsSummaryContext() {
  const versionFilter = getFilterValue(elements.sessionVersionFilter);
  const leagueFilter = getFilterValue(elements.sessionLeagueFilter);
  const tracker = getSelectedTrackerContext();
  return {
    poeVersion: versionFilter !== 'all' ? versionFilter : tracker.poeVersion,
    league: leagueFilter !== 'all' ? leagueFilter : tracker.league
  };
}

function isSessionInContext(session, context) {
  return getSessionPoeVersion(session) === context.poeVersion && (session.league || 'Standard') === context.league;
}

function renderSessionsSummary(sessions = []) {
  const summary = elements.sessionsSummary;
  if (!summary) return;

  const completed = sessions.filter((session) => session.status === 'completed');
  const context = completed.length ? getSessionsSummaryContext() : null;
  const runs = context ? completed.filter((session) => isSessionInContext(session, context)) : [];
  if (!runs.length) {
    summary.hidden = true;
    summary.innerHTML = '';
    return;
  }

  const { poeVersion, league } = context;
  const profitOf = (session) => parseFloat(session.profitChaos || 0) || 0;
  const tierFor = (value) => getProfitTierFor(value, poeVersion, { league });
  // Tiers measure one run, so the average and the best run carry one; the total only shows a loss, as on the dashboard.
  const valueHTML = (value, tier) => `<span class="sessions-summary-value"${tier ? ` data-profit-tier="${tier}"` : ''}>${profitCurrencyHTML(value, 18, poeVersion, { league, signed: true })}</span>`;
  const total = runs.reduce((sum, session) => sum + profitOf(session), 0);
  const best = runs.reduce((top, session) => (profitOf(session) > profitOf(top) ? session : top), runs[0]);
  const runsLabel = runs.length === 1
    ? window.t('sessions.summaryRunsOne')
    : window.t('sessions.summaryRuns', { count: runs.length });

  // Static bars for the last 30 runs, oldest on the left. Heights are log-scaled so one big drop does not flatten
  // the rest; gains rise from the baseline and losses hang below it. When nothing gained, the baseline is the top
  // edge, so a break-even run hangs below it too instead of leaving the strip. When both sides have runs, each keeps
  // at least 5% of the 44px strip, room for the 2px minimum bar next to a big swing on the other side.
  const bars = runs.slice(0, 30).reverse();
  const magnitude = (value) => Math.log10(Math.abs(value) + 1);
  const maxGain = Math.max(0, ...bars.filter((session) => profitOf(session) >= 0).map((session) => magnitude(profitOf(session))));
  const maxLoss = Math.max(0, ...bars.filter((session) => profitOf(session) < 0).map((session) => magnitude(profitOf(session))));
  const minSide = 5;
  const baseline = !maxLoss ? 100 : !maxGain ? 0 : Math.min(100 - minSide, Math.max(minSide, (maxGain / (maxGain + maxLoss)) * 100));
  const barsHTML = bars.map((session) => {
    const profit = profitOf(session);
    const below = profit < 0 || (profit === 0 && baseline === 0);
    const peak = profit < 0 ? maxLoss : maxGain;
    const size = peak ? (magnitude(profit) / peak) * (below ? 100 - baseline : baseline) : 0;
    const title = `${session.mapName || 'Unknown Map'} ${formatAdaptiveProfitText(profit, poeVersion, { league, signed: true })}`;
    return `<span class="sessions-summary-run${below ? ' is-below' : ''}" data-profit-tier="${tierFor(profit)}" title="${escapeHTML(title).replace(/"/g, '&quot;')}" style="--run-size: ${size.toFixed(1)}%"></span>`;
  }).join('');

  summary.innerHTML = `
    <div class="sessions-summary-kicker">${poeVersion === 'poe2' ? 'PoE 2' : 'PoE 1'} / <span lang="en">${escapeHTML(league)}</span> · ${runsLabel}</div>
    <div class="sessions-summary-stats">
      <div class="sessions-summary-stat">
        <span class="sessions-summary-label">${window.t('sessions.summaryMaps')}</span>
        <span class="sessions-summary-value">${runs.length}</span>
      </div>
      <div class="sessions-summary-stat">
        <span class="sessions-summary-label">${window.t('sessions.summaryTotal')}</span>
        ${valueHTML(total, total < 0 ? 'loss' : '')}
      </div>
      <div class="sessions-summary-stat">
        <span class="sessions-summary-label">${window.t('sessions.summaryAverage')}</span>
        ${valueHTML(total / runs.length, tierFor(total / runs.length))}
      </div>
      <div class="sessions-summary-stat">
        <span class="sessions-summary-label">${window.t('sessions.summaryBest')}</span>
        <span class="sessions-summary-best"><span class="sessions-summary-best-name" lang="en">${escapeHTML(best.mapName || 'Unknown Map')}</span>${valueHTML(profitOf(best), tierFor(profitOf(best)))}${profitMemeHTML(tierFor(profitOf(best)))}</span>
      </div>
    </div>
    <div class="sessions-summary-runs" role="img" aria-label="${window.t('sessions.summaryBarsLabel', { count: bars.length })}" style="--baseline: ${baseline.toFixed(1)}%">${barsHTML}</div>
  `;
  summary.hidden = false;
}

function renderRecentLoot() {
  if (!elements.recentLootList) return;

  if (!state.currentUser || !state.recentLoot.length) {
    elements.recentLootList.innerHTML = emptyStateHTML({ art: 'chest', title: window.t('dashboard.noLoot'), hint: window.t('dashboard.noLootHint') });
    return;
  }

  // Loot uses the adaptive currency too, so a divine drop reads as divines.
  const formatLootValue = typeof profitCurrencyHTML === 'function'
    ? profitCurrencyHTML
    : (value, iconSize, poeVersion) => currencyHTML(value, 'chaos', iconSize, poeVersion);
  const lootTierFor = typeof getProfitTierFor === 'function'
    ? getProfitTierFor
    : (value) => (Number(value) < 0 ? 'loss' : 'normal');
  elements.recentLootList.innerHTML = state.recentLoot.map((loot) => {
    const session = loot.session || {};
    const quantity = parseInt(loot.quantity || 1, 10) || 1;
    const totalValue = (parseFloat(loot.chaosValue || 0) * quantity) || 0;
    const poeVersion = session.poeVersion || state.settings.poeVersion || 'poe1';
    const rateOptions = { league: session.league };

    return `
      <article class="recent-loot-item">
        ${itemSlotHTML(loot.itemName, poeVersion, { quantity })}
        <div class="recent-loot-main">
          <span class="recent-loot-name">${escapeHTML(loot.itemName || 'Unknown Item')}</span>
          <div class="recent-loot-meta">${escapeHTML(session.mapName || 'Unknown Map')} · ${timeAgo(loot.createdAt)}</div>
        </div>
        <div class="recent-loot-value" data-profit-tier="${lootTierFor(totalValue, poeVersion, rateOptions)}">${formatLootValue(totalValue, 14, poeVersion, rateOptions)}</div>
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
    onlineEnabled: elements.onlineEnabled ? elements.onlineEnabled.checked : false,
    poePath: elements.poePath.value,
    autoStartSession: elements.autoStartSession.checked,
    overlayEnabled: elements.overlayEnabled ? elements.overlayEnabled.checked : false,
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
    // The idle map card mentions auto-start only while it is on.
    if (typeof updateActiveSessionUI === 'function') {
      updateActiveSessionUI();
    }
    await refreshOnlineAccount();
    activeLeagueInputState.dirty = false;
    updateActiveLeagueFieldContext({ syncValue: true, forceValueSync: true });

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
    await refreshOnlineAccount();
    window._appState.language = resetDraft.settings.language || 'en';
    applyLocalizedChrome();
    activeLeagueInputState.dirty = false;
    updateActiveLeagueFieldContext({ syncValue: true, forceValueSync: true });
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
 * Test the API connection
 */
async function handleTestConnection() {
  const btn = elements.testConnection;
  setButtonBusy(btn, true, window.t('settings.testing'));

  try {
    // The main process sends the check, and only while online features are on.
    await window.electronAPI.testOnlineConnection(elements.apiUrl.value);
    elements.connectionDot.classList.add('connected');
    elements.connectionText.textContent = window.t('settings.connected');
    showToast(window.t('settings.api'), window.t('toast.connectionSuccess'), 'success');
  } catch {
    elements.connectionDot.classList.remove('connected');
    elements.connectionText.textContent = window.t('settings.disconnected');
    showToast(window.t('settings.api'), window.t('toast.connectionFailed'), 'error');
  } finally {
    setButtonBusy(btn, false);
    renderOnlineSettings();
  }
}

async function refreshOnlineAccount() {
  try {
    state.onlineAccount = await window.electronAPI.getOnlineAccount();
  } catch {
    state.onlineAccount = { enabled: false, signedIn: false };
  }
  renderOnlineSettings();
  renderMapResultHistory();
}

function renderOnlineSettings() {
  const { enabled, signedIn } = state.onlineAccount;
  let statusKey = 'settings.onlineAccountOff';
  if (enabled) {
    statusKey = signedIn ? 'settings.onlineAccountSignedIn' : 'settings.onlineAccountSignedOut';
  }

  if (elements.onlineAccountStatus) {
    elements.onlineAccountStatus.dataset.i18n = statusKey;
    elements.onlineAccountStatus.textContent = window.t(statusKey);
  }
  if (elements.testConnection) elements.testConnection.disabled = !enabled;
  // A sign-in still waiting on the browser stays disabled, so a second click cannot start a second flow.
  if (elements.onlineSignIn) {
    elements.onlineSignIn.disabled = !enabled || signedIn || elements.onlineSignIn.getAttribute?.('aria-busy') === 'true';
  }
  if (elements.onlineSignOut) elements.onlineSignOut.disabled = !signedIn;

  // Online off by choice is not a failure, so the status reads a grey 'Off', not a red 'Disconnected'.
  if (elements.connectionStatus && elements.connectionText) {
    const wasOff = elements.connectionStatus.classList.contains('is-off');
    elements.connectionStatus.classList.toggle('is-off', !enabled);
    // While online stays on, a connection test result is kept; only leaving the off state resets it.
    if (!enabled || wasOff) {
      const connectionKey = enabled ? 'settings.disconnected' : 'settings.onlineOffShort';
      elements.connectionDot?.classList.remove('connected');
      elements.connectionText.dataset.i18n = connectionKey;
      elements.connectionText.textContent = window.t(connectionKey);
    }
  }
}

// Signs in to Juice Journal's server for the Farming Hub; the local profile is not touched.
async function handleOnlineSignIn() {
  setButtonBusy(elements.onlineSignIn, true, window.t('login.waitingBrowser'));
  try {
    const result = await window.electronAPI.startPoeLogin();
    if (result?.success) {
      showToast(window.t('settings.onlineAccount'), window.t('toast.onlineSignedIn'), 'success');
    } else {
      showToast(window.t('toast.loginFailed'), getUserFacingErrorMessage({ error: result?.error }, 'errors.loginFailed'), 'error');
    }
  } catch (error) {
    showToast(window.t('toast.loginFailed'), getUserFacingErrorMessage(error, 'errors.loginFailed'), 'error');
  } finally {
    // Read the new account state first, so the button goes straight from busy to its final state.
    await refreshOnlineAccount();
    setButtonBusy(elements.onlineSignIn, false);
    renderOnlineSettings();
  }
}

async function handleOnlineSignOut() {
  try {
    await window.electronAPI.signOutOnline();
  } finally {
    await refreshOnlineAccount();
  }
}

// Writes a button's label without erasing its icon.
function setButtonLabel(button, text) {
  (button.querySelector('.btn-label') || button).textContent = text;
}

// Toggle buttons keep the .active class for styling and tell assistive tech with aria-pressed.
function setToggleButtonPressed(button, pressed) {
  button.classList.toggle('active', pressed);
  button.setAttribute('aria-pressed', String(pressed));
}

// A busy button shows a spinner and, when given one, a busy label; only the label text changes, so icons survive.
function setButtonBusy(button, busy, busyLabel) {
  if (!button) return;
  const label = button.querySelector('.btn-label') || button;
  button.disabled = busy;

  if (busy) {
    button.setAttribute('aria-busy', 'true');
    if (busyLabel) {
      // A second busy call must not take the busy text for the idle one.
      if (button.dataset.idleLabel === undefined) {
        button.dataset.idleLabel = label.textContent;
      }
      label.textContent = busyLabel;
    }
    return;
  }

  button.removeAttribute('aria-busy');
  if (button.dataset.idleLabel !== undefined) {
    // Translate again on the way back, in case the language changed while the button was busy.
    const key = label.getAttribute('data-i18n');
    label.textContent = key ? window.t(key) : button.dataset.idleLabel;
    delete button.dataset.idleLabel;
  }
}

// Errors and warnings stay long enough to read; info and success get out of the way.
const TOAST_DURATION_MS = { info: 4000, success: 5000, warning: 8000, error: 8000 };
const TOAST_STACK_LIMIT = 3;
// Removes a leaving toast even when its exit animation never reports an end (hidden window, reduced motion).
const TOAST_EXIT_FALLBACK_MS = 300;

function showToast(title, message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  if (type === 'error') {
    toast.setAttribute('role', 'alert');
  }

  const titleElement = document.createElement('div');
  titleElement.className = 'toast-title';
  titleElement.textContent = title == null ? '' : String(title);

  const messageElement = document.createElement('div');
  messageElement.className = 'toast-message';
  messageElement.textContent = message == null ? '' : String(message);

  toast.append(titleElement, messageElement);

  // The oldest steps aside so at most TOAST_STACK_LIMIT stay on screen.
  const visibleToasts = Array.from(elements.toastContainer.querySelectorAll('.toast:not(.leaving)'));
  visibleToasts.slice(0, Math.max(0, visibleToasts.length - TOAST_STACK_LIMIT + 1)).forEach((oldToast) => dismissToast(oldToast));
  elements.toastContainer.appendChild(toast);

  // Hovering holds the toast and leaving resumes the time it had left; a click dismisses it.
  let remainingMs = TOAST_DURATION_MS[type] || TOAST_DURATION_MS.info;
  let startedAt = Date.now();
  let timerId = setTimeout(() => dismissToast(toast), remainingMs);
  toast.addEventListener('mouseenter', () => {
    clearTimeout(timerId);
    remainingMs -= Date.now() - startedAt;
  });
  toast.addEventListener('mouseleave', () => {
    startedAt = Date.now();
    timerId = setTimeout(() => dismissToast(toast), remainingMs);
  });
  toast.addEventListener('click', () => dismissToast(toast));
}

function dismissToast(toast) {
  if (!toast.isConnected || toast.classList.contains('leaving')) {
    return;
  }

  toast.classList.add('leaving');
  const remove = () => toast.remove();
  toast.addEventListener('animationend', remove, { once: true });
  setTimeout(remove, TOAST_EXIT_FALLBACK_MS);
}

async function handleCheckForAppUpdate() {
  try {
    state.appUpdate = await window.electronAPI.checkForAppUpdate();
    renderAppUpdateState();
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'settings.updateError'), 'error');
  }
}

function isActiveSessionPoe1(session = state.currentSession) {
  const poeVersion = normalizeCompletedSessionPoeVersion(session?.poeVersion ?? session?.poe_version)
    || getSelectedTrackerContext().poeVersion
    || state.settings?.poeVersion
    || 'poe1';
  return poeVersion === 'poe1';
}

function hasActivePoe1StashBaseline() {
  if (!state.currentSession || !stashState.beforeSnapshotId || !stashState.beforeSnapshot) {
    return false;
  }

  const baselineSessionId = stashState.mapResultContext?.runtimeSession?.sessionId || null;
  return !baselineSessionId || baselineSessionId === state.currentSession.id;
}

async function syncPricesForCurrentStashRun(session = state.currentSession) {
  if (stashState.pricesSynced) {
    return true;
  }

  if (typeof window.electronAPI?.syncPrices !== 'function') {
    return false;
  }

  const league = session?.league || getResolvedActiveLeague();
  const result = await window.electronAPI.syncPrices({ league });
  stashState.pricesSynced = true;
  if (elements.priceItemCount && Number(result?.itemCount || 0) > 0) {
    renderPriceItemCount(result.itemCount);
  }
  if (typeof refreshProfitCurrencyRates === 'function') {
    await refreshProfitCurrencyRates(session?.poeVersion || getSelectedTrackerContext().poeVersion, league);
  }

  return true;
}

async function takeStashSnapshotForCurrentRun(type, session = state.currentSession) {
  if (!session || !isStashTrackingEnabled()) {
    return null;
  }

  try {
    await syncPricesForCurrentStashRun(session);
  } catch (error) {
    console.warn('Proceeding with stash snapshot after price sync failed', error);
  }

  const snapshotId = `${type}:${session.id}:${Date.now()}`;
  const result = await window.electronAPI.takeStashSnapshot({
    snapshotId,
    kind: type,
    sessionId: session.id,
    league: session.league,
    poeVersion: session.poeVersion
  });
  const nextContext = buildCurrentMapResultContext();

  if (type === 'before') {
    stashState.beforeSnapshotId = snapshotId;
    stashState.beforeSnapshot = result;
    stashState.afterSnapshotId = null;
    stashState.afterSnapshot = null;
    stashState.lastMapResult = null;
    stashState.mapResultContext = nextContext;
    if (elements.takeAfterSnapshotBtn) {
      elements.takeAfterSnapshotBtn.disabled = false;
    }
  } else {
    stashState.afterSnapshotId = snapshotId;
    stashState.afterSnapshot = result;
    stashState.mapResultContext = {
      ...(stashState.mapResultContext || nextContext),
      runtimeSession: mergeMapResultRuntimeSession(
        stashState.mapResultContext?.runtimeSession || null,
        nextContext.runtimeSession || null
      )
    };
  }

  updateStashTrackerStatus();
  return result;
}

async function takeAutomaticBeforeSnapshotForSession(session = state.currentSession) {
  if (!session || !isActiveSessionPoe1(session) || !isStashTrackingEnabled()) {
    return false;
  }

  if (stashState.beforeSnapshotId && stashState.mapResultContext?.runtimeSession?.sessionId === session.id) {
    return true;
  }

  try {
    await takeStashSnapshotForCurrentRun('before', session);
    return true;
  } catch (error) {
    console.warn('Failed to create automatic PoE1 before-stash baseline', error);
    showToast(
      window.t('stash.profitTracker'),
      'Unable to create the before-stash baseline for this PoE 1 map. Profit cannot be calculated until a baseline exists.',
      'warning'
    );
    return false;
  }
}

function scheduleAutomaticBeforeSnapshotForSession(session = state.currentSession) {
  if (!session || !isActiveSessionPoe1(session) || !isStashTrackingEnabled()) {
    return Promise.resolve(false);
  }

  if (stashState.beforeSnapshotId && stashState.mapResultContext?.runtimeSession?.sessionId === session.id) {
    return Promise.resolve(true);
  }

  if (stashState.beforeSnapshotPromise && stashState.beforeSnapshotSessionId === session.id) {
    return stashState.beforeSnapshotPromise;
  }

  const baselinePromise = takeAutomaticBeforeSnapshotForSession(session);
  stashState.beforeSnapshotPromise = baselinePromise;
  stashState.beforeSnapshotSessionId = session.id;

  baselinePromise.finally(() => {
    if (stashState.beforeSnapshotPromise === baselinePromise) {
      stashState.beforeSnapshotPromise = null;
      stashState.beforeSnapshotSessionId = null;
    }
  });

  return baselinePromise;
}

async function waitForPendingBeforeSnapshotForSession(session = state.currentSession) {
  if (
    session
    && stashState.beforeSnapshotPromise
    && stashState.beforeSnapshotSessionId === session.id
  ) {
    await stashState.beforeSnapshotPromise;
  }

  return hasActivePoe1StashBaseline();
}

function isEmptyProfitReport(report) {
  const summary = report?.summary || {};
  const totalItemChanges = Number(summary.totalItemChanges
    ?? ((Array.isArray(report?.gained) ? report.gained.length : 0)
      + (Array.isArray(report?.lost) ? report.lost.length : 0)));
  const netProfitChaos = Number(summary.netProfitChaos || 0);

  return totalItemChanges === 0 && netProfitChaos === 0;
}

function waitForStashSnapshotRetryDelay(delayMs = 3500) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, Number(delayMs) || 0));
  });
}

async function takeStashSnapshotForCurrentRunWithRetry(type, session = state.currentSession, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts) || 1);
  const delayMs = Math.max(0, Number(options.delayMs) || 0);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await takeStashSnapshotForCurrentRun(type, session);
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts) {
        error.stashSnapshotFailed = true;
        throw error;
      }

      showToast(
        window.t('stash.profitTracker'),
        'Stash snapshot is not ready yet. Retrying before completing the map...',
        'info'
      );
      await waitForStashSnapshotRetryDelay(delayMs);
    }
  }

  throw lastError || new Error('Failed to take stash snapshot');
}

async function takeAfterSnapshotWithStashRefreshRetry(session = state.currentSession) {
  const maxAttempts = 3;
  let report = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await takeStashSnapshotForCurrentRunWithRetry('after', session, {
        maxAttempts: 2,
        delayMs: 2500
      });
    } catch (error) {
      if (!stashState.afterSnapshotId) {
        throw error;
      }

      console.warn('Using the last available after-stash snapshot after refresh failed', error);
      showToast(
        window.t('stash.profitTracker'),
        'Stash refresh timed out. Using the latest available snapshot to complete the map.',
        'warning'
      );
    }

    report = await window.electronAPI.calculateProfit(
      stashState.beforeSnapshotId,
      stashState.afterSnapshotId
    );

    if (!isEmptyProfitReport(report) || attempt >= maxAttempts) {
      return report;
    }

    showToast(
      window.t('stash.profitTracker'),
      'No stash changes detected yet. Waiting for the Path of Exile stash API to refresh...',
      'info'
    );
    await waitForStashSnapshotRetryDelay();
  }

  return report;
}

async function hydratePoe1StashSnapshotsForSession(session = state.currentSession) {
  if (
    !session
    || !isActiveSessionPoe1(session)
    || typeof window.electronAPI?.calculateSessionProfitFromSnapshots !== 'function'
  ) {
    return null;
  }

  try {
    const result = await window.electronAPI.calculateSessionProfitFromSnapshots({
      sessionId: session.id,
      league: session.league,
      poeVersion: session.poeVersion
    });

    if (!result?.beforeSnapshotId || !result?.afterSnapshotId || !result?.beforeSnapshot || !result?.afterSnapshot) {
      return null;
    }

    stashState.beforeSnapshotId = result.beforeSnapshotId;
    stashState.beforeSnapshot = result.beforeSnapshot;
    stashState.afterSnapshotId = result.afterSnapshotId;
    stashState.afterSnapshot = result.afterSnapshot;
    stashState.mapResultContext = buildCurrentMapResultContext();
    updateStashTrackerStatus();

    return result.report || null;
  } catch (error) {
    console.warn('Unable to hydrate persisted PoE1 stash snapshots for session completion', error);
    return null;
  }
}

// Without stash totals the journal values the session from the loot recorded in it (OCR scan or manual), and
// the session-ended event records and shows that result.
async function completePoe1SessionWithoutStashProfit(session = state.currentSession, error = null) {
  if (!session || !isActiveSessionPoe1(session)) {
    return false;
  }

  if (error) {
    console.warn('Completing PoE1 session without stash profit after snapshot failure', error);
  }

  try {
    await window.electronAPI.endSession({
      sessionId: session.id,
      mapName: session.mapName || null,
      startedAt: session.startedAt || session.started_at || null,
      durationSeconds: Math.max(1, Math.round(getLiveDuration(session)))
    });

    state.currentSession = null;
    updateActiveSessionUI();
    await refreshTrackerData({ includeSessions: true });
    if (error) {
      showToast(
        window.t('stash.profitTracker'),
        'Stash refresh failed, so the map was completed with the loot recorded during it.',
        'warning'
      );
    }

    return true;
  } catch (completionError) {
    console.warn('Failed to complete PoE1 session without stash profit', completionError);
    return false;
  }
}

async function completePoe1SessionWithStashProfit() {
  if (!state.currentSession || !isActiveSessionPoe1(state.currentSession)) {
    return false;
  }

  if (!isStashTrackingEnabled()) {
    return completePoe1SessionWithoutStashProfit(state.currentSession);
  }

  await waitForPendingBeforeSnapshotForSession(state.currentSession);

  if (!hasActivePoe1StashBaseline()) {
    await hydratePoe1StashSnapshotsForSession(state.currentSession);
  }

  if (!hasActivePoe1StashBaseline()) {
    const completedWithoutProfit = await completePoe1SessionWithoutStashProfit(
      state.currentSession,
      new Error('Missing before-stash baseline')
    );

    if (completedWithoutProfit) {
      return true;
    }

    showToast(window.t('toast.error'), window.t('stash.profitFailed'), 'error');
    return false;
  }

  const previousSession = state.currentSession;

  try {
    let report = await takeAfterSnapshotWithStashRefreshRetry(previousSession);
    if (isEmptyProfitReport(report)) {
      report = await hydratePoe1StashSnapshotsForSession(previousSession) || report;
    }
    stashState.lastMapResult = deriveCurrentMapResult(report);

    if (stashState.lastMapResult) {
      const trackerContext = typeof getSelectedTrackerContext === 'function'
        ? getSelectedTrackerContext()
        : {};
      const liveDuration = getLiveDuration(previousSession);
      const rates = typeof refreshProfitCurrencyRates === 'function'
        ? await refreshProfitCurrencyRates(
          stashState.lastMapResult.poeVersion || trackerContext.poeVersion,
          stashState.lastMapResult.league || trackerContext.league
        )
        : null;
      stashState.lastMapResult = {
        ...stashState.lastMapResult,
        durationSeconds: Number(stashState.lastMapResult.durationSeconds || 0) > 0
          ? stashState.lastMapResult.durationSeconds
          : liveDuration,
        profitCurrencyRates: rates
      };
    }

    renderProfitReport(report);

    if (!stashState.lastMapResult || Number(stashState.lastMapResult.durationSeconds || 0) <= 0) {
      throw new Error('Unable to derive a completed map result from the stash diff');
    }

    if (typeof window.electronAPI?.showMapResultOverlay === 'function') {
      try {
        await window.electronAPI.showMapResultOverlay(stashState.lastMapResult);
      } catch (error) {
        console.warn('Failed to show map result overlay', error);
      }
    }

    await persistMapResultHistory(stashState.lastMapResult);
    await window.electronAPI.endSession(
      buildSessionCompletionPayloadFromMapResult(stashState.lastMapResult)
    );

    state.currentSession = null;
    updateActiveSessionUI();
    await refreshTrackerData({ includeSessions: true });

    return true;
  } catch (error) {
    if (error?.stashSnapshotFailed) {
      const completedWithoutProfit = await completePoe1SessionWithoutStashProfit(previousSession, error);
      if (completedWithoutProfit) {
        return true;
      }
    }

    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'stash.profitFailed'), 'error');
    return false;
  }
}

async function handleInstallAppUpdate() {
  try {
    await window.electronAPI.installAppUpdate();
  } catch (error) {
    showToast(window.t('toast.error'), getUserFacingErrorMessage(error, 'settings.updateError'), 'error');
  }
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

async function handleExportDiagnostics() {
  if (!elements.exportDiagnosticsBtn) return;

  setButtonBusy(elements.exportDiagnosticsBtn, true, window.t('settings.exportingDiagnostics'));

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
    setButtonBusy(elements.exportDiagnosticsBtn, false);
  }
}

// ==================== STASH PROFIT TRACKER ====================

// Track snapshot state locally
const stashState = {
  beforeSnapshotId: null,
  afterSnapshotId: null,
  beforeSnapshot: null,
  afterSnapshot: null,
  mapResultContext: null,
  lastMapResult: null,
  pricesSynced: false,
  beforeSnapshotPromise: null,
  beforeSnapshotSessionId: null
};

function buildCurrentMapResultContext() {
  const trackerContext = getSelectedTrackerContext();
  const runtimeSession = state.runtimeSession
    ? {
      ...JSON.parse(JSON.stringify(state.runtimeSession)),
      sessionId: state.currentSession?.id || state.runtimeSession.sessionId || null
    }
    : null;

  return {
    farmTypeId: state.currentSession?.farmTypeId
      || state.currentSession?.mapType
      || state.farmType?.selectedFarmTypeId
      || null,
    poeVersion: state.currentSession?.poeVersion || trackerContext.poeVersion || null,
    league: state.currentSession?.league || state.account?.summary?.league || null,
    accountName: state.account?.accountName || null,
    characterSummary: state.account?.summary || null,
    runtimeSession
  };
}

function mergeMapResultRuntimeSession(previousRuntimeSession, nextRuntimeSession) {
  if (!previousRuntimeSession) {
    return nextRuntimeSession || null;
  }

  if (!nextRuntimeSession) {
    return previousRuntimeSession;
  }

  return {
    ...previousRuntimeSession,
    ...nextRuntimeSession,
    sessionId: nextRuntimeSession.sessionId || previousRuntimeSession.sessionId || null
  };
}

async function handleSyncPrices() {
  if (!elements.syncPricesBtn) return;
  if (!isStashTrackingEnabled()) {
    showStashUnavailableToast();
    return;
  }

  const btn = elements.syncPricesBtn;
  btn.disabled = true;
  const origHTML = btn.innerHTML;
  btn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border:2px solid rgb(var(--ink-rgb) / 0.2);border-top-color:var(--gold);border-radius:50%;corner-shape:round;animation:spin .6s linear infinite;display:inline-block;"></span> ' + window.t('stash.syncing');

  try {
    const league = getResolvedActiveLeague();
    const result = await window.electronAPI.syncPrices({ league });
    if (!isStashTrackingEnabled()) {
      return;
    }

    stashState.pricesSynced = true;
    renderPriceItemCount(result.itemCount);
    await refreshProfitCurrencyRates(result.poeVersion || state.settings.poeVersion || 'poe1', league);
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
  btn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border:2px solid rgb(var(--ink-rgb) / 0.2);border-top-color:var(--gold);border-radius:50%;corner-shape:round;animation:spin .6s linear infinite;display:inline-block;"></span> ' + window.t('stash.scanning');

  try {
    const snapshotId = type;
    const result = await window.electronAPI.takeStashSnapshot({ snapshotId });
    if (!isStashTrackingEnabled()) {
      return;
    }

    if (isAfter) {
      stashState.afterSnapshotId = snapshotId;
      stashState.afterSnapshot = result;
      const nextContext = buildCurrentMapResultContext();
      stashState.mapResultContext = {
        ...(stashState.mapResultContext || nextContext),
        runtimeSession: mergeMapResultRuntimeSession(
          stashState.mapResultContext?.runtimeSession || null,
          nextContext.runtimeSession || null
        )
      };
    } else {
      stashState.beforeSnapshotId = snapshotId;
      stashState.beforeSnapshot = result;
      stashState.mapResultContext = buildCurrentMapResultContext();
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

    stashState.lastMapResult = deriveCurrentMapResult(report);
    if (stashState.lastMapResult) {
      const trackerContext = typeof getSelectedTrackerContext === 'function'
        ? getSelectedTrackerContext()
        : {};
      const rates = typeof refreshProfitCurrencyRates === 'function'
        ? await refreshProfitCurrencyRates(
          stashState.lastMapResult.poeVersion || trackerContext.poeVersion,
          stashState.lastMapResult.league || trackerContext.league
        )
        : null;
      stashState.lastMapResult = {
        ...stashState.lastMapResult,
        profitCurrencyRates: rates
      };
    }
    renderProfitReport(report);
    if (stashState.lastMapResult && Number(stashState.lastMapResult.durationSeconds || 0) > 0) {
      let mapResultPersisted = false;
      if (typeof window.electronAPI?.showMapResultOverlay === 'function') {
        try {
          await window.electronAPI.showMapResultOverlay(stashState.lastMapResult);
        } catch (error) {
          console.warn('Failed to show map result overlay', error);
        }
      }

      try {
        await persistMapResultHistory(stashState.lastMapResult);
        mapResultPersisted = true;
      } catch (error) {
        console.warn('Failed to persist map result history', error);
      }

      if (mapResultPersisted) {
        await completeCurrentSessionAfterStashProfit(stashState.lastMapResult);
      }
    }
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
    const val = Number(summary.netProfitChaos || 0);
    const poeVersion = stashState.lastMapResult?.poeVersion || getSelectedTrackerContext().poeVersion;
    const rates = {
      ...(getProfitCurrencyRates(poeVersion, stashState.lastMapResult?.league || getSelectedTrackerContext().league) || {}),
      divineChaos: Number(summary.divinePrice || 0) > 0
        ? Number(summary.divinePrice)
        : getProfitCurrencyRates(poeVersion)?.divineChaos
    };
    elements.profitChaosValue.textContent = formatAdaptiveProfitText(val, poeVersion, {
      signed: true,
      rates
    });
    if (typeof applyProfitTier === 'function' && typeof getProfitTierFor === 'function') {
      applyProfitTier(elements.profitChaosValue, getProfitTierFor(val, poeVersion, { rates }));
    }
  }

  if (elements.profitDivineValue) {
    const divineValue = Number(summary.netProfitDivine || 0);
    elements.profitDivineValue.textContent = `${divineValue.toFixed(1)} div`;
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
        ? `<span class="item-slot item-slot--sm"><img data-icon-url="${escapeHTML(item.icon)}" alt=""></span>`
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
    applyCachedItemIcons(elements.profitItemsList);
  }

  // Update status badge
  if (elements.stashTrackerStatus) {
    const val = Number(summary.netProfitChaos || 0);
    const poeVersion = stashState.lastMapResult?.poeVersion || getSelectedTrackerContext().poeVersion;
    const rates = {
      ...(getProfitCurrencyRates(poeVersion, stashState.lastMapResult?.league || getSelectedTrackerContext().league) || {}),
      divineChaos: Number(summary.divinePrice || 0) > 0
        ? Number(summary.divinePrice)
        : getProfitCurrencyRates(poeVersion)?.divineChaos
    };
    elements.stashTrackerStatus.textContent = formatAdaptiveProfitText(val, poeVersion, {
      signed: true,
      rates
    });
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
  stashState.beforeSnapshot = null;
  stashState.afterSnapshot = null;
  stashState.mapResultContext = null;
  stashState.lastMapResult = null;

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
    elements.stashTrackerStatus.textContent = window.t('stash.off');
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
    refreshAccountStateFromCurrentUser();
    renderCharacterSummaryCard();
  } catch {
    // Ignore
  }
}

async function loadPriceStatus() {
  try {
    const status = await window.electronAPI.getPriceStatus();
    if (elements.priceItemCount && status.itemCount > 0) {
      renderPriceItemCount(status.itemCount);
      stashState.pricesSynced = true;
      await refreshProfitCurrencyRates(status.poeVersion || state.settings.poeVersion || 'poe1');
      renderLatestMapResult();
      renderMapResultHistory();
      renderSessionsList();
      updateActiveSessionUI();
      if (state.currentUser) {
        await loadDashboardStats();
      }
    }
  } catch {
    // Ignore
  }
}

// Main loaded a league's poe.ninja prices (for a session, a stash run or the Currency page). Views drawn before
// that had no Divine price, so they showed no profit tiers; they get the cached rates and are drawn again.
// Today's Summary shows how many prices are loaded; "—" until the first load.
function renderPriceItemCount(count) {
  const itemCount = Number(count);
  if (elements.priceItemCount && itemCount > 0) {
    elements.priceItemCount.textContent = window.t('dashboard.itemCount', { count: itemCount.toLocaleString('en-US') });
  }
}

async function handlePricesUpdated({ poeVersion, league, itemCount } = {}) {
  renderPriceItemCount(itemCount);
  await refreshProfitCurrencyRates(poeVersion || state.settings.poeVersion || 'poe1', league, { cacheOnly: true });
  renderLatestMapResult();
  renderMapResultHistory();
  renderSessionsList();
  updateActiveSessionUI();
  renderRecentLoot();
  if (state.selectedSession) {
    renderSessionDrawer({ keepForm: true });
  }
  // An open Currency page lists the new prices. The reload is cache-only: when another sync has replaced main's list
  // since this event, it keeps the table as it is rather than start a poe.ninja sync. After the page's own Sync this
  // runs next to handleCurrencySync's reload; both answer from the loaded list.
  if (isPageActive('currency') && poeVersion === currencyState.poeVersion && league === currencyState.league) {
    loadCurrencyPrices({ cacheOnly: true });
  }
  if (state.currentUser) {
    await loadDashboardStats();
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

// `keepForm` redraws the numbers only, so notes being typed survive a price update.
function renderSessionDrawer({ keepForm = false } = {}) {
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
  const formatProfit = typeof profitCurrencyHTML === 'function'
    ? profitCurrencyHTML
    : (value, iconSize, version) => currencyHTML(value, 'chaos', iconSize, version);
  const profitTier = typeof getProfitTierFor === 'function'
    ? getProfitTierFor(profit, poeVersion, { league: session.league })
    : (profit < 0 ? 'loss' : 'normal');

  const duration = session.status === 'active'
    ? formatDuration(getLiveDuration(session))
    : (session.durationSec ? formatDuration(session.durationSec) : '-');

  const lootQuantity = lootEntries.reduce((sum, loot) => sum + (parseInt(loot.quantity || 0, 10) || 0), 0);
  const profitLabel = session.status === 'active' ? 'dashboard.liveProfit' : 'dashboard.profit';
  const memeFor = typeof profitMemeHTML === 'function' ? profitMemeHTML : () => '';
  const rateOptions = { league: session.league };
  const fact = (labelKey, value) => `<div><dt>${window.t(labelKey)}</dt><dd>${value}</dd></div>`;

  elements.sessionDrawerTitle.textContent = session.mapName || 'Session';
  elements.sessionDrawerLootCount.textContent = String(lootQuantity);
  // Profit leads the run; the rest is a compact fact list, so the loot stays above the fold.
  elements.sessionDrawerSummary.innerHTML = `
    <div class="session-drawer-hero">
      <div class="session-drawer-hero-main">
        <span class="session-drawer-label">${window.t(profitLabel)}</span>
        <div class="session-drawer-profit-row">
          <span class="session-drawer-profit" data-profit-tier="${profitTier}">${formatProfit(profit, 18, poeVersion, { ...rateOptions, signed: true })}</span>
          ${memeFor(profitTier)}
        </div>
      </div>
      <div class="session-drawer-hero-side">
        ${session.mapTier ? `<span class="session-drawer-chip">T${session.mapTier}</span>` : ''}
        <span class="session-status ${safeStatus}">${window.t(`sessions.${safeStatus}`)}</span>
        <span class="session-drawer-duration" title="${window.t('sessions.duration')}">${duration}</span>
      </div>
    </div>
    <dl class="session-drawer-facts">
      ${fact('sessions.game', contextLabel)}
      ${fact('sessions.cost', formatProfit(cost, 14, poeVersion, rateOptions))}
      ${fact('sessions.totalLoot', formatProfit(totalLoot, 14, poeVersion, rateOptions))}
      ${fact('sessions.startedAt', session.startedAt ? new Date(session.startedAt).toLocaleString() : '-')}
      ${fact('sessions.endedAt', session.endedAt ? new Date(session.endedAt).toLocaleString() : '-')}
    </dl>
  `;

  if (!keepForm) {
    if (elements.sessionDrawerStrategy) {
      elements.sessionDrawerStrategy.value = session.strategyTag || '';
    }
    if (elements.sessionDrawerNotes) {
      elements.sessionDrawerNotes.value = session.notes || '';
    }
    if (elements.sessionDrawerSave) {
      elements.sessionDrawerSave.disabled = false;
    }
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
                <span class="session-analytics-value">${formatProfit(entry.totalValue, 14, poeVersion, rateOptions)}</span>
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
      const quantity = parseInt(loot.quantity || 1, 10) || 1;
      const totalValue = (parseFloat(loot.chaosValue || 0) * quantity) || 0;
      const typeLabel = loot.itemType ? escapeHTML(loot.itemType.replace(/_/g, ' ')) : '-';
      const lootTier = typeof getProfitTierFor === 'function' ? getProfitTierFor(totalValue, poeVersion, rateOptions) : 'normal';
      return `
        <article class="session-drawer-loot-item">
          ${itemSlotHTML(loot.itemName, poeVersion, { small: true, quantity, fallback: 'empty' })}
          <div class="session-drawer-loot-main">
            <span class="session-drawer-loot-name">${escapeHTML(loot.itemName || 'Unknown Item')}</span>
            <div class="session-drawer-loot-meta">${typeLabel} · ${loot.createdAt ? timeAgo(loot.createdAt) : '-'}</div>
          </div>
          <div class="session-drawer-loot-value" data-profit-tier="${lootTier}">${formatProfit(totalValue, 14, poeVersion, rateOptions)}</div>
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

  setButtonBusy(elements.sessionDrawerSave, true);

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
    setButtonBusy(elements.sessionDrawerSave, false);
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

// Category art is game content, so in both games a tab without its own bundled category art shows no icon,
// never a stand-in orb. Currency keeps the real Chaos Orb.

// PoE 1 item category types — includes PoE1-exclusive mechanics
const POE1_CATEGORY_TYPES = [
  { value: '', labelKey: 'category.all', label: 'All', icon: null },
  { value: 'currency', labelKey: 'category.currency', label: 'Currency', icon: 'chaos' },
  { value: 'fragment', labelKey: 'category.fragment', label: 'Fragment', icon: null },
  { value: 'scarab', labelKey: 'category.scarab', label: 'Scarab', icon: null },
  { value: 'essence', labelKey: 'category.essence', label: 'Essence', icon: null },
  { value: 'fossil', labelKey: 'category.fossil', label: 'Fossil', icon: null, poe1Only: true },
  { value: 'map', labelKey: 'category.map', label: 'Map', icon: null },
  { value: 'divination_card', labelKey: 'category.divCard', label: 'Div Card', icon: null },
  { value: 'gem', labelKey: 'category.gem', label: 'Gem', icon: null },
  { value: 'unique', labelKey: 'category.unique', label: 'Unique', icon: null },
  { value: 'oil', labelKey: 'category.oil', label: 'Oil', icon: null, poe1Only: true },
  { value: 'beast', labelKey: 'category.beast', label: 'Beast', icon: null, poe1Only: true },
  { value: 'incubator', labelKey: 'category.incubator', label: 'Incubator', icon: null, poe1Only: true },
  { value: 'delirium_orb', labelKey: 'category.deliriumOrb', label: 'Delirium Orb', icon: null, poe1Only: true },
  { value: 'catalyst', labelKey: 'category.catalyst', label: 'Catalyst', icon: null },
  { value: 'omen', labelKey: 'category.omen', label: 'Omen', icon: null, poe1Only: true },
  { value: 'tattoo', labelKey: 'category.tattoo', label: 'Tattoo', icon: null, poe1Only: true },
  { value: 'base_type', labelKey: 'category.baseType', label: 'Base Type', icon: null, poe1Only: true },
  { value: 'other', labelKey: 'category.other', label: 'Other', icon: null },
];

// PoE 2 item category types — exchange API categories
const POE2_CATEGORY_TYPES = [
  { value: '', labelKey: 'category.all', label: 'All', icon: null },
  { value: 'currency', labelKey: 'category.currency', label: 'Currency', icon: 'chaos' },
  { value: 'fragment', labelKey: 'category.fragment', label: 'Fragment', icon: 'fragment', poe2Only: true },
  { value: 'essence', labelKey: 'category.essence', label: 'Essence', icon: 'essence' },
  { value: 'rune', labelKey: 'category.rune', label: 'Rune', icon: 'rune', poe2Only: true },
  { value: 'gem', labelKey: 'category.gem', label: 'Gem', icon: 'uncut-gem' },
  { value: 'soul_core', labelKey: 'category.soulCore', label: 'Soul Core', icon: 'soul-core', poe2Only: true },
  { value: 'idol', labelKey: 'category.idol', label: 'Idol', icon: null, poe2Only: true },
  { value: 'expedition', labelKey: 'category.expedition', label: 'Expedition', icon: 'expedition', poe2Only: true },
  { value: 'ultimatum', labelKey: 'category.ultimatum', label: 'Ultimatum', icon: null, poe2Only: true },
  { value: 'other', labelKey: 'category.other', label: 'Other', icon: null },
];

const currencyState = {
  poeVersion: 'poe1',
  league: '',
  type: '',
  search: '',
  sortField: 'chaosValue',
  sortDir: 'desc',
  prices: [],
  pricesRequest: 0,
  // The 'game:league' the table lists now, and that list's Divine and Mirror prices.
  listedKey: null,
  rates: {},
  syncing: false,
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

  container.innerHTML = types.map(t => {
    const active = currencyState.type === t.value ? ' active' : '';
    const label = window.t ? (window.t(t.labelKey) || t.label) : t.label;
    const exclusiveClass = t.poe1Only ? ' poe1-exclusive' : (t.poe2Only ? ' poe2-exclusive' : '');
    // The art sits next to its label, so it is decorative; a tab without art keeps an empty slot so labels line up.
    const iconHTML = t.icon
      ? `<img src="${getCurrencyAssetPath(t.icon, currencyState.poeVersion)}" class="currency-tab-icon" width="14" height="14" alt="" draggable="false">`
      : '<span class="currency-tab-icon" aria-hidden="true"></span>';
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
      document.querySelectorAll('.poe-toggle-btn').forEach(b => setToggleButtonPressed(b, b === btn));
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
    setToggleButtonPressed(btn, btn.dataset.poe === currencyState.poeVersion);
  });
  updateTypeFilterDropdown();
  await loadCurrencyLeagues();
  await loadCurrencyPrices();

  const syncBtn = document.getElementById('currency-sync-btn');
  if (syncBtn) {
    // A sync started on an earlier visit keeps the button busy; handleCurrencySync frees it when that sync ends.
    syncBtn.disabled = currencyState.syncing || !canCurrentUserSyncPrices();
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
    // res = { activeLeagues: [...] } from poe.ninja
    const res = await window.electronAPI.getCurrencyLeagues(currencyState.poeVersion);
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

// Still rows in the table's shape while main waits for a poe.ninja sync, with nothing animated.
function currencyLoadingRowsHTML() {
  const placeholderRow = '<tr class="currency-row--placeholder" aria-hidden="true">'
    + '<td class="currency-td-num"></td>'
    + '<td class="currency-td-icon"><span class="item-slot"></span></td>'
    + '<td class="currency-td-name"><span class="currency-bar"></span></td>'
    + '<td class="currency-td-type"></td>'
    + '<td class="currency-td-chaos"><span class="currency-bar currency-bar--value"></span></td>'
    + '<td class="currency-td-divine"></td>'
    + '<td class="currency-td-trend"></td>'
    + '</tr>';
  return `<tr class="currency-loading-row"><td colspan="7" class="currency-loading-label">${window.t('currency.waitingForSync')}</td></tr>`
    + placeholderRow.repeat(8);
}

// `cacheOnly` (the reload after prices-updated) lists only what main already holds and never starts a sync. When
// main holds another game or league by then, it answers prices null and the table keeps its rows.
async function loadCurrencyPrices({ cacheOnly = false } = {}) {
  const tbody = document.getElementById('currency-table-body');
  if (!tbody) return;
  // A request queued behind a running sync can answer after a later one that main answered at once, so only the
  // latest request renders. A cache-only reload takes the latest request's turn, so it never drops an answer still
  // waiting for a sync.
  const request = cacheOnly ? currencyState.pricesRequest : ++currencyState.pricesRequest;
  const poeVersion = currencyState.poeVersion;
  const showLoadingRows = () => {
    tbody.innerHTML = currencyLoadingRowsHTML();
    const footer = document.getElementById('currency-footer');
    if (footer) footer.textContent = '';
  };
  // A filter, search or reload of the listed game and league keeps its rows, because main usually answers those at
  // once from the loaded list. Another game or league shows still rows, because main may first wait for a sync.
  // Another league's sync can unload the listed one, and then main waits too, so kept rows that get no answer within
  // 300 ms give way to still rows.
  let slowAnswer = null;
  if (!cacheOnly) {
    if (currencyState.listedKey !== `${poeVersion}:${currencyState.league}`) {
      showLoadingRows();
    } else {
      slowAnswer = setTimeout(() => {
        if (request === currencyState.pricesRequest) showLoadingRows();
      }, 300);
    }
  }

  try {
    const params = { poeVersion, limit: '500' };
    if (currencyState.league) params.league = currencyState.league;
    if (currencyState.type) params.type = currencyState.type;
    if (currencyState.search) params.search = currencyState.search;
    if (cacheOnly) params.cacheOnly = true;

    // json = { prices: [...], count, league, updatedAt, rates } from the local poe.ninja cache
    const json = await window.electronAPI.getCurrencyPrices(params);
    if (request !== currencyState.pricesRequest) return;
    if (cacheOnly && json?.prices === null) return;
    currencyState.prices = json?.prices || json?.data?.prices || [];
    currencyState.rates = json?.rates || {};
    currencyState.listedKey = `${poeVersion}:${json?.league || currencyState.league}`;
    renderCurrencyTable();

    const footer = document.getElementById('currency-footer');
    if (footer) {
      const count = json?.count || json?.data?.count || 0;
      const updated = json?.updatedAt || json?.data?.updatedAt;
      footer.textContent = `${count} items` + (updated ? ` · Last synced: ${timeAgo(updated)}` : '');
    }
  } catch (error) {
    // A failed cache-only reload leaves the listed rows as they are.
    if (request !== currencyState.pricesRequest || cacheOnly) return;
    currencyState.listedKey = null;
    renderCurrencyEmptyRow(tbody, getUserFacingErrorMessage(error, 'currency.loadError'));
  } finally {
    clearTimeout(slowAnswer);
  }
}

function renderCurrencyEmptyRow(tbody, message, { syncAction = false } = {}) {
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = 7;
  cell.className = 'currency-empty';
  cell.textContent = message == null ? '' : String(message);
  if (syncAction) {
    const action = document.createElement('div');
    action.className = 'currency-empty-action';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-secondary btn-small';
    button.insertAdjacentHTML('afterbegin', '<svg class="icon icon-sm" width="12" height="12" aria-hidden="true"><use href="assets/icons.svg#sync"/></svg>');
    const label = document.createElement('span');
    label.className = 'btn-label';
    label.setAttribute('data-i18n', 'currency.syncNow');
    label.textContent = window.t('currency.syncNow');
    button.appendChild(label);
    button.addEventListener('click', handleCurrencySync);
    action.appendChild(button);
    cell.appendChild(action);
    // A row drawn while a sync runs shows that sync.
    if (currencyState.syncing) setButtonBusy(button, true, window.t('currency.syncing'));
  }
  row.appendChild(cell);
  tbody.replaceChildren(row);
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
    // Sync can fill a league or category the quick sync skipped, but not a search that matches nothing.
    if (currencyState.search) {
      renderCurrencyEmptyRow(tbody, window.t('currency.noMatch'));
    } else {
      renderCurrencyEmptyRow(tbody, window.t('currency.noData'), { syncAction: canCurrentUserSyncPrices() });
    }
    return;
  }

  const fragment = document.createDocumentFragment();
  sorted.forEach((item, i) => {
    const chaos = parseFloat(item.chaosValue) || 0;
    const divine = parseFloat(item.divineValue);

    const row = document.createElement('tr');

    const numberCell = document.createElement('td');
    numberCell.className = 'currency-td-num';
    numberCell.textContent = String(i + 1);

    const iconCell = document.createElement('td');
    iconCell.className = 'currency-td-icon';
    const safeIconUrl = normalizeSafeImageSrc(item.iconUrl);
    const slot = document.createElement('span');
    slot.className = 'item-slot';
    if (safeIconUrl) {
      const icon = document.createElement('img');
      icon.dataset.iconUrl = safeIconUrl;
      icon.loading = 'lazy';
      icon.alt = item.itemName ? `${item.itemName} icon` : 'Currency icon';
      slot.appendChild(icon);
    }
    iconCell.appendChild(slot);

    const nameCell = document.createElement('td');
    nameCell.className = 'currency-td-name';
    nameCell.textContent = item.itemName || '';

    const typeCell = document.createElement('td');
    typeCell.className = 'currency-td-type';
    const typeBadge = document.createElement('span');
    typeBadge.className = 'currency-type-badge';
    typeBadge.textContent = item.itemType || '-';
    typeCell.appendChild(typeBadge);

    const chaosCell = document.createElement('td');
    chaosCell.className = 'currency-td-chaos';
    chaosCell.appendChild(createCurrencyValueElement(chaos, 'chaos', 18, currencyState.poeVersion));
    // A loot-filter colour for the item's own value, measured against this list's Divine and Mirror prices.
    applyProfitTier(chaosCell, getProfitTierFor(chaos, currencyState.poeVersion, { rates: currencyState.rates || {} }));

    const divineCell = document.createElement('td');
    divineCell.className = 'currency-td-divine';
    if (Number.isFinite(divine) && divine > 0) {
      divineCell.appendChild(createCurrencyValueElement(divine, 'divine', 18, currencyState.poeVersion));
    } else {
      const muted = document.createElement('span');
      muted.className = 'text-muted';
      muted.textContent = '-';
      divineCell.appendChild(muted);
    }

    const trendCell = document.createElement('td');
    trendCell.className = 'currency-td-trend';
    const spark = createSparklineElement(item.sparklineData);
    if (spark) {
      trendCell.appendChild(spark);
    }

    row.append(numberCell, iconCell, nameCell, typeCell, chaosCell, divineCell, trendCell);
    fragment.appendChild(row);
  });

  tbody.replaceChildren(fragment);
  applyCachedItemIcons(tbody);
}

function createSparklineElement(sparkData) {
  if (!sparkData || !Array.isArray(sparkData.data) || sparkData.data.length < 2) return null;
  const values = sparkData.data.map((value) => Number(value)).filter(Number.isFinite);
  if (values.length < 2) return null;

  const w = 70, h = 20, pad = 2;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = pad + (h - pad * 2) - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  }).join(' ');

  const color = values[values.length - 1] >= values[0] ? 'var(--green)' : 'var(--red)';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));

  const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  polyline.setAttribute('points', points);
  polyline.setAttribute('fill', 'none');
  polyline.style.stroke = color;
  polyline.setAttribute('stroke-width', '1.5');
  polyline.setAttribute('stroke-linecap', 'round');
  polyline.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(polyline);

  return svg;
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
  // The header Sync and the table's Sync now start one sync between them.
  if (currencyState.syncing) return;
  if (!canCurrentUserSyncPrices()) {
    showToast(window.t('toast.currencyTitle'), window.t('currency.syncRestricted'), 'warning');
    return;
  }

  currencyState.syncing = true;
  const syncButtons = () => [document.getElementById('currency-sync-btn'), ...document.querySelectorAll('.currency-empty-action .btn')];
  const startedFromSyncButton = syncButtons().includes(document.activeElement);
  syncButtons().forEach((button) => setButtonBusy(button, true, window.t('currency.syncing')));

  try {
    const result = await window.electronAPI.syncCurrencyPrices({
      league: currencyState.league,
      poeVersion: currencyState.poeVersion
    });
    showToast(window.t('toast.currencyTitle'), window.t('currency.syncSuccess'), 'success');
    await refreshProfitCurrencyRates(currencyState.poeVersion, currencyState.league);
    await loadCurrencyLeagues();
    await loadCurrencyPrices();
  } catch (e) {
    showToast(window.t('toast.currencyTitle'), getUserFacingErrorMessage(e, 'currency.syncFailed'), 'error');
  } finally {
    currencyState.syncing = false;
    // Asked again, so a Sync now drawn during the sync goes idle too.
    syncButtons().forEach((button) => setButtonBusy(button, false));
    // The busy buttons were disabled and the table drawn again, so a keyboard user's focus may have dropped to the
    // page. It goes back to a Sync control, unless the user moved it somewhere else meanwhile.
    const focused = document.activeElement;
    if (startedFromSyncButton && (!focused || focused === document.body || syncButtons().includes(focused))) {
      (document.querySelector('.currency-empty-action .btn') || document.getElementById('currency-sync-btn'))?.focus();
    }
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

// Start the application
document.addEventListener('DOMContentLoaded', () => {
  ensureSessionClock();
  init();
});
