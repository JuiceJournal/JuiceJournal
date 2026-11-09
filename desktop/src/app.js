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
  // Levels from level-up lines in Client.txt, by game and character id, newer than the character lists.
  loggedLevelsByGame: {},
  poeDeviceConnected: false,
  // When the device sign-in ends and whether GGG renews it, from main; see schedulePoeDeviceExpiry.
  poeDeviceExpiresAt: null,
  poeDeviceRenewable: false,
  // Whether the device sign-in may read stashes (account:stashes); the built-in sign-in does not ask for it.
  poeStashAccess: false,
  runtimeSession: null,
  overlay: null,
  profitCurrencyRates: {},
  appUpdate: null,
  appUpdateToast: null,
  capabilities: null,
  selectedSession: null,
  // Run drawer loot editing: the mode, the row whose remove button is armed (with its disarm timer), the row in flight,
  // and whether the rows are being rebuilt.
  sessionLootEditing: false,
  sessionLootArmedId: null,
  sessionLootArmTimer: null,
  sessionLootBusyId: null,
  sessionLootRedrawing: false,
  // Edit mode's add row: what is typed, the price list names it suggests, whether an add is running, and its error.
  sessionLootAddDraft: { name: '', quantity: '1' },
  sessionLootAddSuggestions: [],
  sessionLootAddBusy: false,
  sessionLootAddError: null,
  // The unit the Cost box of the open run reads in, and whether a cost save is running.
  sessionCostUnit: 'chaos',
  sessionCostBusy: false,
  // Entry costs of the signed-in profile by farm type id, as typed: { amount, unit }.
  farmTypeCosts: {},
  farmTypeCostBusy: false,
  renderedFarmTypeCostId: null,
  auditTrail: [],
  // True while main says the signed-in profile's journal cannot be read; Dashboard and Sessions show the notice.
  journalUnreadable: false,
  inventoryReadStatus: null,
  mapSessionPromptActive: false,
  farmType: window.farmTypeModel
    ? window.farmTypeModel.createFarmTypeState()
    : { selectedFarmTypeId: null },
  // Settings > Path of Exile: the custom farm type in the open form (null for a new one), and the row asking to confirm a delete.
  customFarmEditingId: null,
  customFarmDeletingId: null
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
  JOURNAL_UNREADABLE: 'errors.journalUnreadable',
  LOOT_NOT_FOUND: 'errors.lootAdd',
  LOOT_ADD_FAILED: 'errors.lootAdd',
  LOOT_BULK_ADD_FAILED: 'errors.lootAdd',
  RECENT_LOOT_LOAD_FAILED: 'errors.lootRecent',
  STATS_PERSONAL_LOAD_FAILED: 'errors.unexpected',
  STATS_LEADERBOARD_LOAD_FAILED: 'errors.unexpected',
  STATS_SUMMARY_LOAD_FAILED: 'errors.unexpected',
  POE_DIFFERENT_ACCOUNT: 'errors.poeDifferentAccount',
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
  'Unauthorized request': 'errors.loginFailed',
  'Invalid API URL': 'errors.invalidApiUrl',
  'Invalid Client.txt path': 'errors.invalidPoePath',
  'Hotkey is required': 'settings.hotkeyErrorRequired',
  'Hotkey must include a non-modifier key': 'settings.hotkeyErrorModifierOnly',
  'Hotkey must include only one non-modifier key': 'settings.hotkeyErrorOneKey',
  'Hotkeys must be unique': 'settings.hotkeyErrorDuplicate'
};

let sessionClockInterval = null;

// DOM elements
const elements = {
  // Modals
  loginModal: document.getElementById('login-modal'),
  loginSignInPanel: document.querySelector('#login-modal .modal-panel.oauth-only'),
  loginReportProblemBtn: document.getElementById('login-report-problem'),
  loginError: document.getElementById('login-error'),
  loginErrorText: document.getElementById('login-error-text'),
  loginBugReportPanel: document.getElementById('login-bug-report-panel'),
  loginBugReportPreview: document.getElementById('login-bug-report-preview'),
  loginOpenBugReportIssueBtn: document.getElementById('login-open-bug-report-issue'),
  loginCopyBugReportBtn: document.getElementById('login-copy-bug-report'),
  loginBugReportBackBtn: document.getElementById('login-bug-report-back'),
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
  deleteAllModal: document.getElementById('delete-all-modal'),
  deleteAllTitle: document.getElementById('delete-all-title'),
  deleteAllAck: document.getElementById('delete-all-ack'),
  deleteAllCancelBtn: document.getElementById('delete-all-cancel'),
  deleteAllConfirmBtn: document.getElementById('delete-all-confirm'),
  resetSettingsModal: document.getElementById('reset-settings-modal'),
  resetSettingsCancelBtn: document.getElementById('reset-settings-cancel'),
  resetSettingsConfirmBtn: document.getElementById('reset-settings-confirm'),

  // Navigation
  navButtons: document.querySelectorAll('.nav-btn'),
  pages: document.querySelectorAll('.page'),

  // The journal notice, once on Dashboard and once on Sessions
  journalNotices: document.querySelectorAll('.journal-notice'),

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
  characterConnectNote: document.getElementById('character-connect-note'),
  activeSession: document.getElementById('active-session'),
  sessionFarmTypeSelect: document.getElementById('session-farm-type-select'),
  clearFarmTypeBtn: document.getElementById('clear-farm-type-btn'),
  manageFarmTypesBtn: document.getElementById('manage-farm-types-btn'),
  entryCostInput: document.getElementById('session-entry-cost-input'),
  entryCostUnit: document.getElementById('session-entry-cost-unit'),
  entryCostHint: document.getElementById('session-entry-cost-hint'),
  entryCostError: document.getElementById('session-entry-cost-error'),
  customFarmGroup: document.getElementById('custom-farm-types-group'),
  customFarmList: document.getElementById('custom-farm-list'),
  customFarmAddBtn: document.getElementById('custom-farm-add-btn'),
  customFarmForm: document.getElementById('custom-farm-form'),
  customFarmFormTitle: document.getElementById('custom-farm-form-title'),
  customFarmName: document.getElementById('custom-farm-name'),
  customFarmColors: document.getElementById('custom-farm-colors'),
  customFarmIcons: document.getElementById('custom-farm-icons'),
  customFarmPreview: document.getElementById('custom-farm-preview'),
  customFarmError: document.getElementById('custom-farm-error'),
  customFarmCancelBtn: document.getElementById('custom-farm-cancel-btn'),
  startSessionBtn: document.getElementById('start-session-btn'),
  endSessionBtn: document.getElementById('end-session-btn'),
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
  inventoryReadStatus: document.getElementById('inventory-read-status'),
  inventoryReadStatusText: document.getElementById('inventory-read-status-text'),

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
  sessionDrawerLootEdit: document.getElementById('session-drawer-loot-edit'),

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
  inventoryReadEnabled: document.getElementById('inventory-read-enabled'),
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
  appUpdateActionBtn: document.getElementById('app-update-action-btn'),
  openUpdatePageBtn: document.getElementById('open-update-page-btn'),
  settingsPage: document.getElementById('settings-page'),
  settingsAboutTab: document.getElementById('settings-about'),
  settingsDataTab: document.getElementById('settings-data'),
  dataFolderPath: document.getElementById('data-folder-path'),
  dataTotalSize: document.getElementById('data-total-size'),
  openDataFolderBtn: document.getElementById('open-data-folder'),
  clearLogsBtn: document.getElementById('clear-logs'),
  deleteAllBtn: document.getElementById('delete-all-local-data'),
  bugReportPreview: document.getElementById('bug-report-preview'),
  openBugReportIssueBtn: document.getElementById('open-bug-report-issue'),
  copyBugReportBtn: document.getElementById('copy-bug-report'),

  // User
  username: document.getElementById('username'),
  userAvatar: document.getElementById('user-avatar'),
  logoutBtn: document.getElementById('logout-btn'),
  sessionBadge: document.getElementById('session-badge'),
  sessionCard: document.getElementById('session-card'),

  // Toast
  toastContainer: document.getElementById('toast-container'),
  toastAnnouncer: document.getElementById('toast-announcer'),

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

// Settings > About and the login screen show the same report with the same two buttons. reportId names the report
// a view shows, so Copy and Open can tell main which text the user saw.
const bugReportViews = {
  about: {
    preview: elements.bugReportPreview,
    openButton: elements.openBugReportIssueBtn,
    copyButton: elements.copyBugReportBtn,
    reportId: null
  },
  login: {
    preview: elements.loginBugReportPreview,
    openButton: elements.loginOpenBugReportIssueBtn,
    copyButton: elements.loginCopyBugReportBtn,
    reportId: null
  }
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
// Each Data tab load gets a number, so an older, slower answer never overwrites a newer one.
let dataSummaryRequestId = 0;
let characterReconcileTimer = null;
let poeDeviceExpiryTimer = null;
// How long before a device sign-in ends the character card starts to say so.
const POE_DEVICE_WARN_MS = 30 * 60 * 1000;
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
    if (elements.appUpdateActionBtn) {
      elements.appUpdateActionBtn.hidden = true;
      elements.appUpdateActionBtn.disabled = true;
      elements.appUpdateActionBtn.classList?.add('hidden');
    }
    if (elements.openUpdatePageBtn) {
      elements.openUpdatePageBtn.hidden = true;
      elements.openUpdatePageBtn.disabled = true;
      setButtonLabel(elements.openUpdatePageBtn, window.t('settings.openUpdatePage'));
      elements.openUpdatePageBtn.classList?.add('hidden');
    }
    return;
  }

  if (update.error) {
    if (elements.appUpdateStatus) {
      elements.appUpdateStatus.textContent = getAppUpdateErrorText(update);
    }
    if (elements.appUpdateDetail) {
      elements.appUpdateDetail.textContent = update.errorKind === 'signature' ? '' : update.error;
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
      elements.appUpdateStatus.textContent = window.t(update.readyToInstall ? 'settings.updateReady' : 'settings.updateAvailable', {
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

  // The check that opens this About tab can fail for its own reasons, and must not hide that the last install failed.
  if (update.installFailedVersion && !update.error && elements.appUpdateDetail) {
    elements.appUpdateDetail.textContent = window.t('settings.updateInstallFailed', { version: update.installFailedVersion });
  }

  const busy = Boolean(update.checking || update.downloading || update.verifying || update.installing);
  if (elements.checkUpdatesBtn) {
    elements.checkUpdatesBtn.disabled = busy;
    setButtonLabel(elements.checkUpdatesBtn, update.checking
      ? window.t('settings.checkingForUpdates')
      : window.t('settings.checkForUpdates'));
  }

  // After a failed signature check, neither button offers that release again until a new check clears the failure.
  const canAct = Boolean(update.available) && update.errorKind !== 'signature';
  if (elements.appUpdateActionBtn) {
    elements.appUpdateActionBtn.hidden = !canAct;
    elements.appUpdateActionBtn.disabled = !canAct || busy;
    setButtonLabel(elements.appUpdateActionBtn, getAppUpdateActionLabel(update));
    elements.appUpdateActionBtn.classList?.toggle('hidden', !canAct);
  }

  if (elements.openUpdatePageBtn) {
    const showPage = canAct && !update.readyToInstall;
    elements.openUpdatePageBtn.hidden = !showPage;
    elements.openUpdatePageBtn.disabled = !showPage;
    setButtonLabel(elements.openUpdatePageBtn, window.t('settings.openUpdatePage'));
    elements.openUpdatePageBtn.classList?.toggle('hidden', !showPage);
  }
}

function getAppUpdateErrorText(update) {
  if (update.errorKind === 'signature') return window.t('settings.updateSignatureFailed');
  if (update.errorKind === 'download') return window.t('settings.updateDownloadFailed');
  return window.t('settings.updateError');
}

function getAppUpdateActionLabel(update) {
  if (update.installing) return window.t('settings.updateInstalling');
  if (update.downloading) return window.t('settings.updateDownloading', { percent: update.downloadPercent ?? 0 });
  if (update.verifying) return window.t('settings.updateVerifying');
  if (update.readyToInstall) return window.t('settings.installUpdate');
  return window.t('settings.downloadUpdate');
}

function applyAppUpdateState(data) {
  const previous = state.appUpdate;
  state.appUpdate = data || null;
  renderAppUpdateState();
  const version = data?.nextVersion || '?';
  const offerWithdrawn = (previous?.available && !data?.available) || (previous?.readyToInstall && !data?.readyToInstall);
  if (offerWithdrawn && state.appUpdateToast) {
    dismissToast(state.appUpdateToast);
    state.appUpdateToast = null;
  }
  // After a failed install the launch check offers the same version again, and that must not replace the failure toast.
  if (data?.available && data.nextVersion !== previous?.nextVersion && !data.installFailedVersion) {
    showAppUpdateToast(window.t('toast.updateAvailableTitle'), window.t('toast.updateAvailableBody', { version }), 'info', {
      action: { label: window.t('settings.downloadUpdate'), onSelect: handleDownloadAppUpdate }
    });
  }
  if (!previous?.readyToInstall && data?.readyToInstall) {
    showAppUpdateToast(window.t('toast.updateReadyTitle'), window.t('toast.updateReadyBody', { version }), 'success', {
      action: { label: window.t('settings.installUpdate'), onSelect: handleInstallAppUpdate }
    });
  }
  // A failed check stays on the About tab, but a failed download started from a toast has to be seen anywhere.
  if (data?.error && data.errorKind !== 'check' && previous?.error !== data.error) {
    showAppUpdateToast(getAppUpdateErrorText(data), '', 'error');
  }
  if (!previous?.installFailedVersion && data?.installFailedVersion) {
    const failedVersion = data.installFailedVersion;
    showAppUpdateToast(window.t('toast.updateInstallFailedTitle'), window.t('settings.updateInstallFailed', { version: failedVersion }), 'error', {
      action: { label: window.t('settings.openUpdatePage'), onSelect: handleOpenAppUpdatePage }
    });
  }
}

// Update toasts are sticky, so each step takes the one before it off the screen, along with its stale button.
function showAppUpdateToast(title, message, type, options) {
  if (state.appUpdateToast) {
    dismissToast(state.appUpdateToast);
  }
  state.appUpdateToast = showToast(title, message, type, options);
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

// A player's own farm type also names its palette colour and icon. Both come from the model's fixed lists.
function describeFarmTypeFor(value) {
  const describeFarmType = window.farmTypeModel?.describeFarmType;
  return typeof describeFarmType === 'function' ? describeFarmType(value) : null;
}

function farmTypeAttr(value) {
  const farmTypeId = getFarmTypeIdFor(value);
  if (!farmTypeId) {
    return '';
  }

  const color = describeFarmTypeFor(value)?.color;
  return ` data-farm-type="${farmTypeId}"${color ? ` data-farm-color="${color}"` : ''}`;
}

function farmIconHTML(icon, { size = 14, className = 'icon farm-type-icon' } = {}) {
  return `<svg class="${className}" width="${size}" height="${size}" aria-hidden="true"><use href="assets/icons.svg#${icon}"/></svg>`;
}

function farmTypeIconHTML(value) {
  const icon = describeFarmTypeFor(value)?.icon;
  return icon ? farmIconHTML(icon) : '';
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

  const farmType = describeFarmTypeFor(value);
  if (farmType?.color) {
    element.dataset.farmColor = farmType.color;
  } else {
    delete element.dataset.farmColor;
  }
  // Callers set the text first, which also clears the icon of the previous result.
  if (farmType?.icon) {
    element.insertAdjacentHTML('afterbegin', farmTypeIconHTML(value));
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
  // The inventory read line follows the game the tracker shows.
  if (typeof renderInventoryReadStatus === 'function') {
    renderInventoryReadStatus();
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
  showToast(window.t('stash.unavailableTitle'), getCurrentStashUnavailableText(), 'info');
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
  }
  if (elements.characterPortraitBadge) {
    elements.characterPortraitBadge.textContent = visual.badgeText;
    if (elements.characterPortraitBadge.style) {
      elements.characterPortraitBadge.style.display = visual.portraitPath ? 'none' : '';
    }
  }
  if (elements.characterName) {
    elements.characterName.textContent = isReady ? summary.name : window.t('dashboard.noCharacterSelected');
  }
  if (elements.characterClass) {
    // Ascended characters keep their base class in the chip: 'Deadeye · Ranger'.
    const classChip = visual.classLabel && visual.baseClassLabel && visual.classLabel !== visual.baseClassLabel
      ? `${visual.classLabel} · ${visual.baseClassLabel}`
      : visual.classLabel;
    elements.characterClass.textContent = isReady ? classChip : window.t('dashboard.unknownClass');
  }
  if (elements.characterLevel) {
    elements.characterLevel.textContent = isReady && summary.level ? String(summary.level) : '—';
  }
  if (elements.characterLeague) {
    elements.characterLeague.textContent = isReady ? (summary.league || window.t('dashboard.unknownLeague')) : '—';
  }
  if (elements.characterStatus) {
    const session = state.characterSession?.poeVersion === account?.activePoeVersion ? state.characterSession : null;
    elements.characterStatus.textContent = !isReady
      ? window.t('dashboard.characterSyncNeeded')
      : session
        ? window.t(session.confirmed ? 'dashboard.characterConfirmed' : 'dashboard.characterUnconfirmed')
        : window.t('dashboard.characterSynced');
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
  const poeNote = getPoeDeviceNote();
  if (elements.characterConnectBtn) {
    elements.characterConnectBtn.hidden = !state.currentUser || (state.poeDeviceConnected === true && !poeNote?.endsSoon);
  }
  if (elements.characterConnectNote) {
    elements.characterConnectNote.hidden = !poeNote;
    elements.characterConnectNote.textContent = poeNote?.text || '';
    elements.characterConnectNote.dataset.tone = poeNote?.tone || '';
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
    `<option value="" data-i18n="dashboard.noFarmType">${escapeHTML(window.t('dashboard.noFarmType'))}</option>`,
    ...farmTypes.map((farmType) => `<option value="${escapeHTML(farmType.id)}"${typeof farmTypeAttr === 'function' ? farmTypeAttr(farmType.id) : ''}>${typeof farmTypeIconHTML === 'function' ? farmTypeIconHTML(farmType.id) : ''}${escapeHTML(farmType.label)}</option>`)
  ].join('');
  elements.sessionFarmTypeSelect.value = selectedFarmTypeId;
  elements.sessionFarmTypeSelect.disabled = hasActiveSession;
  elements.clearFarmTypeBtn.disabled = hasActiveSession || !selectedFarmTypeId;
  if (typeof renderFarmTypeCost === 'function') {
    renderFarmTypeCost(selectedFarmTypeId);
  }
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

// Comma or dot decimals; an empty box means no cost. Null when the text is not a number from 0 to max.
function parseCostAmount(value, max) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!text) return 0;
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const amount = Number(text);
  return amount <= max ? amount : null;
}

function setFarmTypeCostError(key) {
  if (!elements.entryCostError) return;
  elements.entryCostError.hidden = !key;
  elements.entryCostError.textContent = key ? window.t(key) : '';
  elements.entryCostInput?.setAttribute('aria-invalid', key ? 'true' : 'false');
}

// Shows the entry cost kept for the farm type. A box the player is in keeps what was typed, as the farm type
// list can redraw under the cursor; `sync` puts the stored amount and unit back instead.
function renderFarmTypeCost(farmTypeId = state.farmType?.selectedFarmTypeId || '', { sync = false } = {}) {
  const input = elements.entryCostInput;
  const unit = elements.entryCostUnit;
  if (!input || !unit) return;

  const farmType = farmTypeId ? getFarmTypeModel().getFarmTypeById(farmTypeId) : null;
  const changedType = farmTypeId !== state.renderedFarmTypeCostId;
  const inBox = document.activeElement === input || document.activeElement === unit;
  input.disabled = !farmTypeId;
  unit.disabled = !farmTypeId;
  if (elements.entryCostHint) {
    elements.entryCostHint.textContent = farmType
      ? window.t('dashboard.entryCostHint', { farmType: farmType.label })
      : window.t('dashboard.entryCostPick');
  }
  if (sync || changedType || !inBox) {
    const entry = farmTypeId ? state.farmTypeCosts?.[farmTypeId] : null;
    input.value = entry ? String(entry.amount) : '';
    unit.value = entry?.unit === 'divine' ? 'divine' : 'chaos';
  }
  if (changedType) setFarmTypeCostError(null);
  state.renderedFarmTypeCostId = farmTypeId;
}

async function loadFarmTypeCosts() {
  if (!window.electronAPI?.getFarmTypeCosts) return;
  state.farmTypeCosts = await window.electronAPI.getFarmTypeCosts().catch(() => ({})) || {};
  renderFarmTypeCost();
}

// A change updates a map that is running too, so the live card follows through the session-cost-updated event.
async function handleFarmTypeCostCommit() {
  const input = elements.entryCostInput;
  const unit = elements.entryCostUnit;
  const farmTypeId = state.farmType?.selectedFarmTypeId || '';
  if (!input || !unit || !farmTypeId || input.disabled || state.farmTypeCostBusy) return;

  // 10000 is the largest amount main keeps per farm type.
  const amount = parseCostAmount(input.value, 10000);
  if (amount === null) {
    setFarmTypeCostError('dashboard.entryCostInvalid');
    return;
  }
  const stored = state.farmTypeCosts?.[farmTypeId] || null;
  const unitValue = unit.value === 'divine' ? 'divine' : 'chaos';
  if (amount === (stored?.amount ?? 0) && (amount === 0 || unitValue === stored.unit)) {
    // Unchanged: the box goes back to the stored text. The unit stays, so a unit picked before typing is kept.
    input.value = stored ? String(stored.amount) : '';
    setFarmTypeCostError(null);
    return;
  }

  state.farmTypeCostBusy = true;
  try {
    const result = await window.electronAPI.setFarmTypeCost(farmTypeId, { amount, unit: unitValue });
    if (result?.ok) {
      state.farmTypeCosts = result.costs || {};
      setFarmTypeCostError(null);
      renderFarmTypeCost(farmTypeId, { sync: true });
    } else {
      setFarmTypeCostError(result?.error === 'COST_INVALID' ? 'dashboard.entryCostInvalid' : 'dashboard.entryCostSaveError');
    }
  } catch (error) {
    setFarmTypeCostError('dashboard.entryCostSaveError');
  } finally {
    state.farmTypeCostBusy = false;
  }
}

// The box commits on Enter or when focus leaves it; Escape puts the stored cost back.
function handleFarmTypeCostKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    handleFarmTypeCostCommit();
  } else if (event.key === 'Escape') {
    setFarmTypeCostError(null);
    renderFarmTypeCost(undefined, { sync: true });
  }
}

async function loadCustomFarmTypes() {
  if (!window.electronAPI?.getCustomFarmTypes) {
    return;
  }

  const farmTypes = await window.electronAPI.getCustomFarmTypes().catch(() => []);
  getFarmTypeModel().setCustomFarmTypes(farmTypes);
  closeCustomFarmForm();
  renderCustomFarmTypes();
}

function listOwnFarmTypes() {
  const { listFarmTypes, isCustomFarmTypeId } = getFarmTypeModel();
  return listFarmTypes().filter((farmType) => isCustomFarmTypeId(farmType.id));
}

const CUSTOM_FARM_ERROR_KEYS = {
  LABEL_REQUIRED: 'customFarm.errorNameRequired',
  LABEL_TOO_LONG: 'customFarm.errorNameTooLong',
  LABEL_TAKEN: 'customFarm.errorNameTaken',
  GAME_REQUIRED: 'customFarm.errorGameRequired',
  LIMIT_REACHED: 'customFarm.errorLimit'
};

function renderCustomFarmTypes() {
  if (!elements.customFarmList) {
    return;
  }

  const { CUSTOM_FARM_TYPE_LIMIT } = getFarmTypeModel();
  const farmTypes = listOwnFarmTypes();
  elements.customFarmList.innerHTML = farmTypes.length
    ? farmTypes.map((farmType) => {
      const games = farmType.poeVersions.map((version) => (version === 'poe2' ? 'PoE 2' : 'PoE 1')).join(' · ');
      const id = escapeHTML(farmType.id);
      const actions = state.customFarmDeletingId === farmType.id
        ? `<span class="custom-farm-confirm">${escapeHTML(window.t('customFarm.deleteConfirm', { name: farmType.label }))}</span>
           <button type="button" class="btn btn-danger btn-small" data-custom-farm-action="confirm-delete" data-custom-farm-id="${id}">${escapeHTML(window.t('customFarm.delete'))}</button>
           <button type="button" class="btn btn-ghost btn-small" data-custom-farm-action="keep" data-custom-farm-id="${id}">${escapeHTML(window.t('customFarm.keep'))}</button>`
        : `<button type="button" class="btn btn-secondary btn-small" data-custom-farm-action="edit" data-custom-farm-id="${id}">${escapeHTML(window.t('customFarm.edit'))}</button>
           <button type="button" class="btn btn-ghost btn-small" data-custom-farm-action="delete" data-custom-farm-id="${id}">${escapeHTML(window.t('customFarm.delete'))}</button>`;
      return `
        <div class="custom-farm-row">
          <span class="custom-farm-name"${farmTypeAttr(farmType.id)}>${farmTypeIconHTML(farmType.id)}${escapeHTML(farmType.label)}</span>
          <span class="custom-farm-games">${games}</span>
          <div class="custom-farm-row-actions">${actions}</div>
        </div>
      `;
    }).join('')
    : `<p class="custom-farm-empty">${escapeHTML(window.t('customFarm.empty'))}</p>`;

  if (elements.customFarmAddBtn) {
    elements.customFarmAddBtn.disabled = farmTypes.length >= CUSTOM_FARM_TYPE_LIMIT;
  }
  renderCustomFarmPicker();
}

// The radio buttons keep what is selected when the language redraws their names.
function renderCustomFarmPicker() {
  if (!elements.customFarmColors || !elements.customFarmIcons) {
    return;
  }

  const { CUSTOM_FARM_TYPE_COLORS, CUSTOM_FARM_TYPE_ICONS } = getFarmTypeModel();
  const color = getCustomFarmPickedValue('custom-farm-color') || CUSTOM_FARM_TYPE_COLORS[0];
  const icon = getCustomFarmPickedValue('custom-farm-icon') || CUSTOM_FARM_TYPE_ICONS[0];
  elements.customFarmColors.innerHTML = CUSTOM_FARM_TYPE_COLORS.map((entry) => (
    `<label class="custom-farm-option custom-farm-swatch" data-farm-color="${entry}" title="${window.t(`customFarm.color.${entry}`)}"><input type="radio" name="custom-farm-color" value="${entry}" aria-label="${window.t(`customFarm.color.${entry}`)}"${entry === color ? ' checked' : ''}><span class="custom-farm-option-face"></span></label>`
  )).join('');
  elements.customFarmIcons.innerHTML = CUSTOM_FARM_TYPE_ICONS.map((entry) => (
    `<label class="custom-farm-option" title="${window.t(`customFarm.icon.${entry}`)}"><input type="radio" name="custom-farm-icon" value="${entry}" aria-label="${window.t(`customFarm.icon.${entry}`)}"${entry === icon ? ' checked' : ''}><span class="custom-farm-option-face">${farmIconHTML(entry, { size: 18, className: 'icon' })}</span></label>`
  )).join('');
  if (elements.customFarmFormTitle) {
    elements.customFarmFormTitle.textContent = window.t(state.customFarmEditingId ? 'customFarm.editTitle' : 'customFarm.add');
  }
  renderCustomFarmPreview();
}

function getCustomFarmPickedValue(name) {
  return elements.customFarmForm?.querySelector(`input[name="${name}"]:checked`)?.value || '';
}

function renderCustomFarmPreview() {
  if (!elements.customFarmPreview) {
    return;
  }

  const name = String(elements.customFarmName?.value || '').trim() || window.t('customFarm.previewName');
  const icon = getCustomFarmPickedValue('custom-farm-icon');
  elements.customFarmPreview.dataset.farmColor = getCustomFarmPickedValue('custom-farm-color');
  elements.customFarmPreview.innerHTML = `${icon ? farmIconHTML(icon) : ''}${escapeHTML(name)}`;
}

function setCustomFarmError(key) {
  if (!elements.customFarmError) {
    return;
  }

  elements.customFarmError.hidden = !key;
  elements.customFarmError.textContent = key ? window.t(key) : '';
}

function openCustomFarmForm(farmTypeId = null) {
  if (!elements.customFarmForm) {
    return;
  }

  const { CUSTOM_FARM_TYPE_COLORS, CUSTOM_FARM_TYPE_ICONS, CUSTOM_FARM_TYPE_LABEL_MAX_LENGTH, getFarmTypeById } = getFarmTypeModel();
  const farmType = farmTypeId ? getFarmTypeById(farmTypeId) : null;
  state.customFarmEditingId = farmType?.id || null;
  state.customFarmDeletingId = null;
  renderCustomFarmTypes();

  const color = farmType?.color || CUSTOM_FARM_TYPE_COLORS[0];
  const icon = farmType?.icon || CUSTOM_FARM_TYPE_ICONS[0];
  const games = farmType?.poeVersions || [getFarmTypePoeVersion()];
  elements.customFarmForm.querySelectorAll('input[name="custom-farm-color"]').forEach((input) => { input.checked = input.value === color; });
  elements.customFarmForm.querySelectorAll('input[name="custom-farm-icon"]').forEach((input) => { input.checked = input.value === icon; });
  elements.customFarmForm.querySelectorAll('input[name="custom-farm-game"]').forEach((input) => { input.checked = games.includes(input.value); });
  elements.customFarmName.maxLength = CUSTOM_FARM_TYPE_LABEL_MAX_LENGTH;
  elements.customFarmName.value = farmType?.label || '';
  setCustomFarmError(null);
  renderCustomFarmPreview();
  elements.customFarmForm.hidden = false;
  elements.customFarmName.focus();
}

function closeCustomFarmForm() {
  state.customFarmEditingId = null;
  state.customFarmDeletingId = null;
  if (elements.customFarmForm) {
    elements.customFarmForm.hidden = true;
  }
}

// Draws everything that names a farm type again, after the list changed.
async function applyCustomFarmTypes(farmTypes) {
  getFarmTypeModel().setCustomFarmTypes(farmTypes);
  // A deleted farm type, or one taken off this game, cannot stay selected.
  await syncFarmTypeSelectionForVersion();
  renderFarmTypeSelector();
  renderCustomFarmTypes();
  updateActiveSessionUI();
  // A rename reaches the stored results too, so they are read again.
  await loadMapResultHistory();
}

async function handleCustomFarmSubmit(event) {
  event.preventDefault();
  setCustomFarmError(null);

  const input = {
    label: elements.customFarmName.value,
    color: getCustomFarmPickedValue('custom-farm-color'),
    icon: getCustomFarmPickedValue('custom-farm-icon'),
    poeVersions: [...elements.customFarmForm.querySelectorAll('input[name="custom-farm-game"]:checked')].map((box) => box.value)
  };
  if (state.customFarmEditingId) {
    input.id = state.customFarmEditingId;
  }

  let result = null;
  try {
    result = await window.electronAPI.saveCustomFarmType(input);
  } catch (error) {
    console.error('Unable to save the custom farm type', error);
  }
  if (!result?.ok) {
    setCustomFarmError(CUSTOM_FARM_ERROR_KEYS[result?.error] || 'customFarm.errorSaveFailed');
    return;
  }

  closeCustomFarmForm();
  await applyCustomFarmTypes(result.farmTypes);
}

async function handleCustomFarmListClick(event) {
  const button = event.target.closest('[data-custom-farm-action]');
  if (!button) {
    return;
  }

  const farmTypeId = button.dataset.customFarmId;
  const action = button.dataset.customFarmAction;
  if (action === 'edit') {
    openCustomFarmForm(farmTypeId);
  } else if (action === 'delete' || action === 'keep') {
    state.customFarmDeletingId = action === 'delete' ? farmTypeId : null;
    renderCustomFarmTypes();
  } else if (action === 'confirm-delete') {
    let result = null;
    try {
      result = await window.electronAPI.deleteCustomFarmType(farmTypeId);
    } catch (error) {
      console.error('Unable to delete the custom farm type', error);
    }
    if (!result?.ok) {
      showToast(window.t('customFarm.errorDeleteFailed'), '', 'error');
      return;
    }

    // The form may still be open on the farm type that just went.
    if (state.customFarmEditingId === farmTypeId) {
      closeCustomFarmForm();
    }
    state.customFarmDeletingId = null;
    await applyCustomFarmTypes(result.farmTypes);
  }
}

function openCustomFarmSettings() {
  navigateTo('settings');
  showSettingsTab('poe');
  elements.customFarmGroup?.scrollIntoView({ block: 'start' });
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
  // Before the selection: a custom farm type counts as supported only once its list has loaded.
  await loadCustomFarmTypes();
  await loadActiveFarmTypeSelection();
  await loadFarmTypeCosts();
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
    // The launch check can answer before the listener below exists.
    applyAppUpdateState(await window.electronAPI.getAppUpdateState());
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
  if (elements.inventoryReadEnabled) elements.inventoryReadEnabled.checked = completeSettingsDraft.inventoryReadEnabled !== false;
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
    showToast(window.t('toast.settingsLoadFailed'), getUserFacingErrorMessage(error, 'toast.restartHint'), 'error');
  }
}

/**
 * PoE currency icon image paths
 */
const CURRENCY_IMAGE_VARIANTS = {
  poe1: {
    chaos: 'assets/currency/poe1/chaos.png',
    divine: 'assets/currency/poe1/divine.png',
    // Category art for the Currency page: one item of each category, and the icon every divination card shares.
    fragment: 'assets/currency/poe1/fragment.png',
    scarab: 'assets/currency/poe1/scarab.png',
    essence: 'assets/currency/poe1/essence.png',
    fossil: 'assets/currency/poe1/fossil.png',
    map: 'assets/currency/poe1/map.png',
    'divination-card': 'assets/currency/poe1/divination-card.png',
    gem: 'assets/currency/poe1/gem.png',
    unique: 'assets/currency/poe1/unique.png',
    oil: 'assets/currency/poe1/oil.png',
    beast: 'assets/currency/poe1/beast.png',
    'delirium-orb': 'assets/currency/poe1/delirium-orb.png',
    catalyst: 'assets/currency/poe1/catalyst.png',
    omen: 'assets/currency/poe1/omen.png',
    tattoo: 'assets/currency/poe1/tattoo.png',
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
    idol: 'assets/currency/poe2/idol.png',
    omen: 'assets/currency/poe2/omen.png',
    'abyssal-bone': 'assets/currency/poe2/abyssal-bone.png',
    catalyst: 'assets/currency/poe2/catalyst.png',
    'liquid-emotion': 'assets/currency/poe2/liquid-emotion.png',
    verisium: 'assets/currency/poe2/verisium.png',
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
  // Prices match names case-insensitively, so icons do too.
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
function itemSlotHTML(itemName, poeVersion, { small = false, quantity = 1, fallback = 'chest', iconUrl = '' } = {}) {
  const src = getLocalItemIconPath(itemName, poeVersion);
  let art = '';
  if (src) {
    art = `<img src="${src}" alt="" draggable="false">`;
  } else if (iconUrl) {
    // applyCachedItemIcons points it at the icon-cache copy or the remote art.
    art = `<img data-icon-url="${escapeHTML(iconUrl)}" alt="" draggable="false">`;
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
    // Remote art comes from GGG's CDN only, the same rule as the icon cache's.
    return parsed.protocol === 'https:' && parsed.host === 'web.poecdn.com' && !parsed.username && !parsed.password
      ? parsed.href
      : '';
  } catch {
    return '';
  }
}

// Remote art already found in the icon cache, by URL. A list that redraws, such as the run drawer while it is edited,
// shows that art at once instead of blanking it until main answers.
const cachedItemIconSources = new Map();

// Points each <img data-icon-url> at its local icon-cache copy when there is one, else at the remote art.
async function applyCachedItemIcons(container) {
  const images = [...container.querySelectorAll('img[data-icon-url]')];
  const pending = images.filter((img) => {
    const known = cachedItemIconSources.get(img.dataset.iconUrl);
    if (known) img.src = known;
    return !known;
  });
  const urls = [...new Set(pending.map((img) => img.dataset.iconUrl))];
  let cached = {};
  if (urls.length > 0 && typeof window.electronAPI?.resolveCachedIcons === 'function') {
    cached = await window.electronAPI.resolveCachedIcons(urls).catch(() => ({})) || {};
  }

  pending.forEach((img) => {
    const cachedSrc = String(cached[img.dataset.iconUrl] || '');
    if (cachedSrc.startsWith('file:')) {
      // Only a local copy is remembered: remote art may be cached later and should then come from disk.
      cachedItemIconSources.set(img.dataset.iconUrl, cachedSrc);
      img.src = cachedSrc;
    } else {
      img.src = normalizeSafeImageSrc(img.dataset.iconUrl);
    }
  });
}

// Art main looked up for loot rows that carry none, per game and lowercase name; '' is a name main has no art for.
const lootArtCache = { poe1: new Map(), poe2: new Map() };
// Names main is being asked about, per game, with the answer to wait on.
const lootArtAsking = { poe1: new Map(), poe2: new Map() };
const LOOT_ART_ASK_SIZE = 200;
// Goes up when prices update: an answer to an ask from before then may come from the old list, so its misses are dropped.
let lootArtGeneration = 0;

function lootArtKey(itemName) {
  return String(itemName || '').trim().toLowerCase();
}

// The art a loot row shows beyond the bundled art: the one stored with it, else what main looked up, else none.
function lootArtUrl(loot, poeVersion) {
  if (loot?.icon) {
    return loot.icon;
  }
  return lootArtCache[poeVersion === 'poe2' ? 'poe2' : 'poe1'].get(lootArtKey(loot?.itemName)) || '';
}

// Asks main once for the names that have no bundled art and no answer yet, and calls redraw when it brought art.
// A name another view already asked for is waited on instead, so every view that shows it redraws.
async function ensureLootArt(names, poeVersion, redraw) {
  const game = poeVersion === 'poe2' ? 'poe2' : 'poe1';
  const cache = lootArtCache[game];
  const asking = lootArtAsking[game];
  const getItemIcons = window.electronAPI?.getItemIcons;
  if (typeof getItemIcons !== 'function') {
    return;
  }

  const wanted = new Map();
  const waiting = new Map();
  for (const name of names) {
    const key = lootArtKey(name);
    if (!key || wanted.has(key) || waiting.has(key) || cache.has(key) || getLocalItemIconPath(name, game)) {
      continue;
    }
    if (asking.has(key)) {
      waiting.set(key, asking.get(key));
    } else {
      wanted.set(key, String(name));
    }
  }

  const asks = [...wanted];
  const answers = [];
  const generation = lootArtGeneration;
  for (let start = 0; start < asks.length; start += LOOT_ART_ASK_SIZE) {
    const chunk = asks.slice(start, start + LOOT_ART_ASK_SIZE);
    // The ask starts on the next microtask, so its names are marked as asked before anything can settle it.
    const answer = Promise.resolve().then(async () => {
      let icons = null;
      try {
        icons = await getItemIcons.call(window.electronAPI, chunk.map(([, name]) => name), game);
      } catch {
        // Not cached, so a later draw asks again.
      }
      chunk.forEach(([key, name]) => {
        if (asking.get(key) === answer) {
          asking.delete(key);
        }
        const icon = icons && typeof icons[name] === 'string' ? icons[name] : '';
        if (icons && (icon || generation === lootArtGeneration)) {
          cache.set(key, icon);
        }
      });
    });
    chunk.forEach(([key]) => asking.set(key, answer));
    answers.push(answer);
  }

  await Promise.all([...answers, ...waiting.values()]);
  if ([...wanted.keys(), ...waiting.keys()].some((key) => cache.get(key)) && typeof redraw === 'function') {
    redraw();
  }
}

// For rows from different games: asks per game.
function ensureLootArtForRows(rows, redraw) {
  ['poe1', 'poe2'].forEach((game) => {
    const names = rows.filter((row) => row.poeVersion === game).map((row) => row.name);
    if (names.length) {
      ensureLootArt(names, game, redraw);
    }
  });
}

// Art found after a price sync shows, so the names main had no art for are asked again.
function clearLootArtMisses() {
  lootArtGeneration += 1;
  Object.values(lootArtCache).forEach((cache) => {
    cache.forEach((icon, key) => {
      if (!icon) cache.delete(key);
    });
  });
  // Asks already on their way answer from the old list; the next draw asks again.
  Object.values(lootArtAsking).forEach((asking) => asking.clear());
}

function createCurrencyValueElement(value, type = 'chaos', iconSize = 18, poeVersion = state.settings.poeVersion || 'poe1', options = {}) {
  const formatted = formatCurrencyAmount(value, type, options);
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
  // Stays enabled while sign-in waits in the browser: a stuck sign-in is the main reason to report.
  if (elements.loginReportProblemBtn) {
    elements.loginReportProblemBtn.addEventListener('click', showLoginBugReport);
  }
  if (elements.loginBugReportBackBtn) {
    elements.loginBugReportBackBtn.addEventListener('click', () => showLoginSignIn({ restoreFocus: true }));
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
  if (elements.manageFarmTypesBtn) {
    elements.manageFarmTypesBtn.addEventListener('click', openCustomFarmSettings);
  }
  if (elements.entryCostInput) {
    elements.entryCostInput.addEventListener('keydown', handleFarmTypeCostKeydown);
    elements.entryCostInput.addEventListener('focusout', handleFarmTypeCostCommit);
    elements.entryCostInput.addEventListener('input', () => setFarmTypeCostError(null));
  }
  if (elements.entryCostUnit) {
    elements.entryCostUnit.addEventListener('change', handleFarmTypeCostCommit);
  }
  if (elements.customFarmForm) {
    elements.customFarmAddBtn?.addEventListener('click', () => openCustomFarmForm());
    elements.customFarmCancelBtn?.addEventListener('click', () => {
      closeCustomFarmForm();
      renderCustomFarmTypes();
    });
    elements.customFarmForm.addEventListener('submit', handleCustomFarmSubmit);
    elements.customFarmForm.addEventListener('input', renderCustomFarmPreview);
    elements.customFarmList?.addEventListener('click', handleCustomFarmListClick);
  }

  // Sessions filter
  elements.sessionFilter.addEventListener('change', loadSessions);
  if (elements.sessionVersionFilter) elements.sessionVersionFilter.addEventListener('change', renderSessionsList);
  if (elements.sessionLeagueFilter) elements.sessionLeagueFilter.addEventListener('change', renderSessionsList);
  if (elements.sessionFarmFilter) elements.sessionFarmFilter.addEventListener('change', renderSessionsList);
  if (elements.sessionSearchFilter) elements.sessionSearchFilter.addEventListener('input', renderSessionsList);
  if (elements.sessionDrawerClose) elements.sessionDrawerClose.addEventListener('click', closeSessionDrawer);
  if (elements.sessionDrawerBackdrop) elements.sessionDrawerBackdrop.addEventListener('click', closeSessionDrawer);
  if (elements.sessionDrawerSave) elements.sessionDrawerSave.addEventListener('click', handleSessionMetadataSave);
  if (elements.sessionDrawerLootEdit) elements.sessionDrawerLootEdit.addEventListener('click', handleSessionLootEditToggle);
  if (elements.sessionDrawerSummary) {
    elements.sessionDrawerSummary.addEventListener('keydown', handleSessionCostKeydown);
    elements.sessionDrawerSummary.addEventListener('focusout', handleSessionCostChange);
    elements.sessionDrawerSummary.addEventListener('change', handleSessionCostUnitChange);
  }
  if (elements.sessionDrawerLoot) {
    elements.sessionDrawerLoot.addEventListener('click', handleSessionLootClick);
    elements.sessionDrawerLoot.addEventListener('keydown', handleSessionLootKeydown);
    elements.sessionDrawerLoot.addEventListener('focusout', handleSessionLootChange);
    elements.sessionDrawerLoot.addEventListener('input', handleSessionLootAddInput);
    elements.sessionDrawerLoot.addEventListener('submit', handleSessionLootAddSubmit);
  }
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
  if (elements.openDataFolderBtn) {
    elements.openDataFolderBtn.addEventListener('click', handleOpenDataFolder);
  }
  if (elements.clearLogsBtn) {
    elements.clearLogsBtn.addEventListener('click', handleClearLogs);
  }
  if (elements.deleteAllBtn) {
    elements.deleteAllBtn.addEventListener('click', handleDeleteAllLocalData);
  }
  // The journal notice on Dashboard and Sessions; Open data folder is the Data tab's handler.
  elements.journalNotices.forEach((notice) => {
    notice.querySelector('[data-journal-action="start-new"]').addEventListener('click', handleStartNewJournal);
    notice.querySelector('[data-journal-action="open-folder"]').addEventListener('click', handleOpenDataFolder);
    notice.querySelector('[data-journal-action="report"]').addEventListener('click', openAboutBugReport);
  });
  if (elements.checkUpdatesBtn) {
    elements.checkUpdatesBtn.addEventListener('click', handleCheckForAppUpdate);
  }
  if (elements.appUpdateActionBtn) {
    elements.appUpdateActionBtn.addEventListener('click', handleAppUpdateAction);
  }
  if (elements.openUpdatePageBtn) {
    elements.openUpdatePageBtn.addEventListener('click', handleOpenAppUpdatePage);
  }
  // Report a bug: the About tab and the login screen share these handlers.
  Object.values(bugReportViews).forEach((view) => {
    if (view.openButton) view.openButton.addEventListener('click', () => handleOpenBugReportIssue(view));
    if (view.copyButton) view.copyButton.addEventListener('click', () => handleCopyBugReport(view));
  });

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
  document.addEventListener('keydown', handleSessionDrawerKeydown);
  // An open dropdown gets its keys first: Escape closes only the list, not the modal or drawer behind it, and a
  // list whose options were rebuilt while open takes the focus back.
  window.addEventListener('keydown', (event) => {
    const openSelect = document.querySelector('select:open');
    if (!openSelect) return;
    if (event.key === 'Escape') {
      event.stopPropagation();
    } else if (!openSelect.contains(document.activeElement)) {
      openSelect.selectedOptions[0]?.focus();
    }
  }, true);
}

/**
 * IPC event listener'lari
 */
function setupIPCListeners() {
  // Map olaylari
  window.electronAPI.onMapEntered((data) => {
    handleMapEnteredEvent(data).catch((error) => {
      showToast(window.t('toast.mapStartFailed'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
    });
  });

  window.electronAPI.onMapExited((data) => {
    if (data?.runtimeSession) {
      setRuntimeSessionState(data.runtimeSession);
    }
    // A start prompt still waiting belongs to the map just left, so it ends at once and starts nothing.
    state.mapExitCount = (state.mapExitCount || 0) + 1;
    state.stopStartMapPrompt?.();
    refreshTrackerData({ includeSessions: true });
  });

  // Session olaylari
  window.electronAPI.onSessionStarted((session) => {
    state.currentSession = session;
    updateActiveSessionUI();
    ensureSessionClock();
    refreshTrackerData({ includeSessions: true });
  });

  window.electronAPI.onSessionEnded(async (session) => {
    state.currentSession = null;
    updateActiveSessionUI();
    stopSessionClock();
    const mapResult = await persistCompletedSessionMapResult(session);
    if (mapResult && typeof window.electronAPI.showMapResultOverlay === 'function') {
      try {
        // Only the card says loot is still to be counted: a kept result would say so for good.
        await window.electronAPI.showMapResultOverlay({ ...mapResult, lootPending: Boolean(session?.lootPending), lootUncounted: Boolean(session?.lootUncounted) });
      } catch (error) {
        console.warn('Failed to show map result overlay', error);
      }
    }
    // One notice per finished map. A PoE1 stash diff saved its own result before ending, so the session fills in.
    const rawProfit = parseFloat(session?.profitChaos);
    showMapResultToast(mapResult || {
      mapName: session?.mapName || '',
      netProfit: Number.isFinite(rawProfit) ? rawProfit : 0,
      noLoot: session?.noLoot,
      poeVersion: session?.poeVersion,
      durationSeconds: getCompletedSessionDurationSeconds(session || {})
    });
    // The journal and the map result are written by now, so the numbers need not wait out the coalescing timer.
    await refreshTrackerData({ includeSessions: true, immediate: true });
  });

  // A finished map got its loot from the first inventory read after it: the result it showed is replaced.
  window.electronAPI.onSessionLootUpdated(async (session) => {
    const mapResult = await persistCompletedSessionMapResult(session);
    if (mapResult) {
      try {
        await window.electronAPI.showMapResultOverlay(mapResult);
      } catch (error) {
        console.warn('Failed to show map result overlay', error);
      }
      showMapResultToast(mapResult);
    }
    await refreshTrackerData({ includeSessions: true, immediate: true });
  });

  // A change to the farm type's entry cost reached the map that is running.
  if (window.electronAPI.onSessionCostUpdated) {
    window.electronAPI.onSessionCostUpdated((session) => {
      if (state.currentSession?.id === session?.id) {
        state.currentSession = { ...state.currentSession, ...session };
        updateActiveSessionUI();
      }
      if (state.selectedSession?.id === session?.id) {
        state.selectedSession = session;
        redrawSessionLoot();
      }
      refreshTrackerData({ includeSessions: true });
    });
  }

  if (window.electronAPI.onInventoryReadStatus) {
    window.electronAPI.onInventoryReadStatus(setInventoryReadStatus);
  }

  // Loot olaylari
  window.electronAPI.onLootAdded(() => {
    refreshTrackerData({ includeSessions: isPageActive('sessions') });
  });

  if (window.electronAPI.onAuditTrailUpdated) {
    window.electronAPI.onAuditTrailUpdated((data) => {
      state.auditTrail = data?.entries || [];
      renderAuditTrail();
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
    window.electronAPI.onAppUpdateStateChanged(applyAppUpdateState);
  }

  // Game detection
  if (window.electronAPI.onGameVersionChanged) {
    window.electronAPI.onGameVersionChanged(({ version, settingsVersion, logPath, runtimeSession }) => {
      if (runtimeSession) {
        setRuntimeSessionState(runtimeSession);
      }
      syncRendererGameContext(version, { settingsVersion, logPath });
      refreshAccountStateFromCurrentUser();
      renderCharacterSummaryCard();

      // Clear cached prices (they're version-specific)
      stashState.pricesSynced = false;
      if (elements.priceItemCount) {
        elements.priceItemCount.textContent = '—';
      }

      // Auto-refresh currency page if it's currently visible
      if (currencyState.poeVersion !== version) {
        // Update poe-toggle buttons on currency page
        document.querySelectorAll('.poe-toggle-btn').forEach(b => {
          setToggleButtonPressed(b, b.dataset.poe === version);
        });
        switchCurrencyGame(version);
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

  // The tray's Start New Map brings this window to the front, so its outcome shows here.
  if (window.electronAPI.onTrayAction) {
    window.electronAPI.onTrayAction((action) => {
      if (action === 'startMapFailed') {
        showToast(window.t('toast.mapStartFailed'), window.t('toast.tryAgain'), 'error');
      } else if (action === 'startMapJournalUnreadable') {
        showToast(window.t('toast.mapStartFailed'), window.t('errors.journalUnreadable'), 'error');
      }
    });
  }
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
  } else if (page === 'settings' && elements.settingsAboutTab?.classList.contains('active')
    && elements.loginModal?.classList.contains('hidden')) {
    // The selected tab survives leaving Settings, so coming back to About builds the report again. Not under the
    // login modal: that would clear the login report, and signing in builds About's report anyway.
    void loadBugReportPreview(bugReportViews.about);
  } else if (page === 'settings' && elements.settingsDataTab?.classList.contains('active')) {
    // As with About: the selected tab survives leaving Settings, so coming back to Data measures again.
    void loadDataSummary();
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
  // Each visit builds the report again, so it shows the latest errors. Not under the login modal, as in navigateTo.
  if (tab === 'about' && elements.loginModal?.classList.contains('hidden')) {
    void loadBugReportPreview(bugReportViews.about);
  }
  // The folder size is measured in main on each visit, so it includes what the app wrote since.
  if (tab === 'data') {
    void loadDataSummary();
  }
}

// The Hub's off panel leads straight to the Online switch.
function openOnlineSettings() {
  navigateTo('settings');
  showSettingsTab('api');
  elements.onlineEnabled?.focus();
}

// The journal notice's Report a problem opens the report in Settings > About, which builds it again with the cause.
// Coming back to an About tab that is still selected builds it in navigateTo, so it is not built twice.
function openAboutBugReport() {
  navigateTo('settings');
  if (!elements.settingsAboutTab?.classList.contains('active')) {
    showSettingsTab('about');
  }
  elements.bugReportPreview?.focus();
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

  // A new visit starts at sign-in, even if the last one ended on the bug report.
  showLoginSignIn();
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

  // The start prompt names the map; without one the Active map card is enough.
  if (!shouldPromptForSession) {
    return;
  }

  const detectedMapName = typeof data.mapName === 'string' && data.mapName.trim()
    ? data.mapName.trim()
    : null;

  const trackerContext = typeof getSelectedTrackerContext === 'function'
    ? getSelectedTrackerContext()
    : {};
  const mapExitCount = state.mapExitCount || 0;
  state.mapSessionPromptActive = true;
  let startPromptOverlayShown = false;
  try {
    if (window.electronAPI?.showStartMapPromptOverlay) {
      let stopWaitingForOverlayResult = () => {};
      let startOverlayResultTimeout = () => {};
      try {
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

        state.stopStartMapPrompt = () => stopWaitingForOverlayResult();
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
        // map starts so it cannot surface later and swallow clicks nobody is listening for.
        if (window.electronAPI?.hideStartMapPromptOverlay) {
          await window.electronAPI.hideStartMapPromptOverlay();
          startPromptOverlayShown = false;
        }
      } catch (error) {
        stopWaitingForOverlayResult();
        console.warn('Failed to show start-map overlay prompt', error);
      }
    }

    // A map started meanwhile (the tray, the Dashboard) or a map already left takes no automatic start.
    if (state.currentSession || (state.mapExitCount || 0) !== mapExitCount) {
      return;
    }

    // A map entry never opens the desktop modal over the game. A prompt left unanswered, or one the overlay could not
    // show, starts the map with the farm type it offered: the player's own pick on the Dashboard.
    await handleStartSession({
      defaultMapName: detectedMapName,
      source: 'map-detected-auto',
      sessionDetails: {
        mapName: detectedMapName || window.t('misc.unknownMap'),
        farmTypeId: trackerContext?.farmTypeId || null
      }
    });
  } finally {
    if (startPromptOverlayShown && window.electronAPI?.hideStartMapPromptOverlay) {
      try {
        await window.electronAPI.hideStartMapPromptOverlay();
      } catch (error) {
        console.warn('Failed to hide start-map overlay prompt', error);
      }
    }
    state.stopStartMapPrompt = null;
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

// A failed sign-in shows in the open modal, above Report a problem; an empty text hides the line.
function setLoginError(text) {
  if (!elements.loginError || !elements.loginErrorText) {
    return;
  }

  elements.loginError.classList.toggle('hidden', !text);
  elements.loginErrorText.textContent = text;
}

/**
 * Path of Exile OAuth login.
 * Opens the GGG consent page in the user's browser, waits for the local
 * loopback callback, and signs the user in (creating an account on first use).
 */
async function handlePoeOAuthLogin() {
  const button = document.getElementById('poe-oauth-login');
  setButtonBusy(button, true, window.t('login.waitingBrowser'));
  // A new attempt clears the last failure.
  setLoginError('');
  let failed = false;

  try {
    const result = await window.electronAPI.signInWithPoe();

    if (result?.success) {
      await loadProfileAccountStateCache();
      setCurrentUser(toProfileUser(result.profile));
      if (elements.loginModal) {
        elements.loginModal.classList.add('hidden');
      }
      // Signing out leaves Settings > About open under the modal, so its report is built again for the new sign-in.
      if (elements.settingsPage?.classList.contains('active') && elements.settingsAboutTab?.classList.contains('active')) {
        void loadBugReportPreview(bugReportViews.about);
      }
      // Custom farm types belong to the profile that just signed in; the selection may have been another profile's.
      if (typeof loadCustomFarmTypes === 'function') {
        await loadCustomFarmTypes();
        await loadActiveFarmTypeSelection();
        await loadFarmTypeCosts();
        renderFarmTypeSelector();
      }
      await loadMapResultHistory();
      void syncPoeDeviceConnection();
      await refreshTrackerData();
    } else {
      setLoginError(window.t('login.failedInline', { reason: getUserFacingErrorMessage({ error: result?.error }, 'login.failedHint') }));
      failed = true;
    }
  } catch (error) {
    setLoginError(window.t('login.failedInline', { reason: getUserFacingErrorMessage(error, 'login.failedHint') }));
    failed = true;
  } finally {
    setButtonBusy(button, false);
  }

  // Main logged the failure before it answered, so a report opened while sign-in waited is built again to show it.
  // The inline line waits on the hidden sign-in panel, so a toast says it meanwhile.
  if (failed && elements.loginModal?.classList.contains('hidden') === false
    && elements.loginBugReportPanel?.classList.contains('hidden') === false) {
    showToast(window.t('login.failedTitle'), '', 'error');
    void loadBugReportPreview(bugReportViews.login);
  }
}

/**
 * Cikis islemi
 */
async function handleLogout() {
  clearActiveCharacterRefreshTimers();
  clearTimeout(characterReconcileTimer);
  await window.electronAPI.logout();
  showSignedOutWindow();
}

// What the window keeps of the account that signed out goes, and sign-in shows. A failed Delete everything calls it
// without the sign-out call: main signed out already, and a second sign-out would write the activity log it cleared.
function showSignedOutWindow() {
  state.currentUser = null;
  if (typeof loadCustomFarmTypes === 'function') {
    window.farmTypeModel?.setCustomFarmTypes?.([]);
    state.farmTypeCosts = {};
    closeCustomFarmForm();
    renderCustomFarmTypes();
  }
  state.deviceCharactersByGame = {};
  state.loggedLevelsByGame = {};
  endPoeDeviceConnection();
  state.poeStashAccess = false;
  state.currentSession = null;
  state.sessions = [];
  state.mapResults = [];
  state.mapResultsLoadFailed = false;
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
  // The next sign-in checks its own journal and reads the notice out again.
  setJournalUnreadable(false);
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
  if (typeof renderAppUpdateState === 'function') {
    renderAppUpdateState();
  }
  // The active map card is written by JS (its badge too), so it follows the new language here.
  if (typeof updateActiveSessionUI === 'function') {
    updateActiveSessionUI();
  }
  // So is Recent Loot's empty state; it redraws from state, with no IPC.
  if (typeof renderRecentLoot === 'function') {
    renderRecentLoot();
  }
  if (typeof renderInventoryReadStatus === 'function') {
    renderInventoryReadStatus();
  }
  // The character card and the map result cards write their fallback lines from JS too.
  if (typeof renderCharacterSummaryCard === 'function') {
    renderCharacterSummaryCard();
  }
  if (typeof renderLatestMapResult === 'function') {
    renderLatestMapResult();
  }
  if (typeof renderMapResultHistory === 'function') {
    renderMapResultHistory();
  }
  // The activity log is drawn by JS as well, and now sits on the Data tab next to translated headings.
  if (typeof renderAuditTrail === 'function') {
    renderAuditTrail();
  }
  if (typeof renderCustomFarmTypes === 'function') {
    renderCustomFarmTypes();
  }
  // An open Currency page draws its rail, rows and status line in JS, so they follow the new language from state.
  if (typeof isPageActive === 'function' && isPageActive('currency')) {
    updateTypeFilterDropdown();
    renderCurrencyTable();
    renderCurrencyStatus();
  }
  // The Data tab's size line has no data-i18n either. Reset to Defaults can change the language on that tab, so an
  // open Data tab measures again and writes the line in the new language.
  if (elements.settingsDataTab?.classList.contains('active')) {
    void loadDataSummary();
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
    cachedAccountState: state.settings?.lastKnownAccountState || null,
    loggedLevelsByGame: state.loggedLevelsByGame
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
    // The card and the character lists show the new level at once, not only after the next fetch from GGG.
    if (kind === 'level_up' && Number.isFinite(level)) {
      const levels = state.loggedLevelsByGame[version] || {};
      state.loggedLevelsByGame = { ...state.loggedLevelsByGame, [version]: { ...levels, [character.id]: Math.max(levels[character.id] || 0, level) } };
    }
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
  if (result?.connected) {
    state.poeDeviceConnected = true;
  } else {
    endPoeDeviceConnection();
  }
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
  state.poeDeviceExpiresAt = state.poeDeviceConnected && Number.isFinite(status?.expiresAt) ? status.expiresAt : null;
  state.poeDeviceRenewable = status?.renewable === true;
  state.poeStashAccess = status?.stashAccess === true;
  schedulePoeDeviceExpiry();
  applyDashboardCapabilities();
  renderPoeLinkStatus();
  renderCharacterSummaryCard();
  if (state.poeDeviceConnected) {
    await refreshDeviceCharacters(state.account?.activePoeVersion);
  }
}

// The end of a device sign-in, as a clock time in the player's locale.
function formatPoeDeviceEnd() {
  return new Date(state.poeDeviceExpiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// What the character card says about the device sign-in. Nothing while GGG renews it by itself. Otherwise until when it
// lasts, that it ends soon (with Reconnect offered early), or that it ended and the character list and levels need a
// Reconnect to be brought up to date.
function getPoeDeviceNote(now = Date.now()) {
  if (!state.currentUser) {
    return null;
  }
  if (!state.poeDeviceConnected) {
    return { tone: 'warn', text: window.t('dashboard.poeReconnectNote') };
  }
  if (state.poeDeviceRenewable || !Number.isFinite(state.poeDeviceExpiresAt)) {
    return null;
  }
  const time = formatPoeDeviceEnd();
  return state.poeDeviceExpiresAt - now <= POE_DEVICE_WARN_MS
    ? { tone: 'warn', text: window.t('dashboard.poeConnectionEndsSoon', { time }), endsSoon: true }
    : { tone: 'muted', text: window.t('dashboard.poeConnectionUntil', { time }) };
}

// The device sign-in ended here (Disconnect, sign-out, or a fetch that found it gone): its end timer goes with it, so no
// "connection ended" notice comes later.
function endPoeDeviceConnection() {
  state.poeDeviceConnected = false;
  state.poeDeviceExpiresAt = null;
  schedulePoeDeviceExpiry();
}

// A sign-in GGG does not renew ends at a fixed time: the card warns shortly before, and once it ends it asks for Reconnect
// at once instead of at the next character fetch.
function schedulePoeDeviceExpiry() {
  clearTimeout(poeDeviceExpiryTimer);
  poeDeviceExpiryTimer = null;
  const expiresAt = state.poeDeviceExpiresAt;
  if (!state.poeDeviceConnected || state.poeDeviceRenewable || !Number.isFinite(expiresAt)) {
    return;
  }

  const now = Date.now();
  const warnAt = expiresAt - POE_DEVICE_WARN_MS;
  if (now < warnAt) {
    poeDeviceExpiryTimer = setTimeout(() => {
      renderCharacterSummaryCard();
      renderPoeLinkStatus();
      schedulePoeDeviceExpiry();
    }, warnAt - now);
    return;
  }
  poeDeviceExpiryTimer = setTimeout(async () => {
    await syncPoeDeviceConnection();
    if (state.currentUser && !state.poeDeviceConnected) {
      showToast(window.t('toast.poeConnectionEnded'), window.t('dashboard.poeReconnectNote'), 'warning', {
        action: { label: window.t('dashboard.connectDevice'), onSelect: handleConnectPoeDevice }
      });
    }
  }, Math.max(0, expiresAt - now) + 1000);
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
      // The reply carries main's error code, so a different account says how to switch instead of try again.
      showToast(window.t('toast.poeConnectFailed'), getUserFacingErrorMessage(result, 'toast.tryAgain'), 'error');
      // Another account's approval drops the sign-in this one had, so the card reads main's state again.
      await syncPoeDeviceConnection();
      return;
    }
    // Asks main again, so the card learns when the new sign-in ends.
    await syncPoeDeviceConnection();
  } catch (error) {
    showToast(window.t('toast.poeConnectFailed'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
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
    elements.poeLinkMode.textContent = !state.poeDeviceRenewable && Number.isFinite(state.poeDeviceExpiresAt)
      ? window.t('settings.poeLiveUntil', { time: formatPoeDeviceEnd() })
      : window.t('settings.poeLiveMode');
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
    endPoeDeviceConnection();
    renderPoeLinkStatus();
    renderCharacterSummaryCard();
    // The link status line shows it; the announcer reads it out, since the hidden button took focus with it.
    announceStatus(window.t('settings.poeNotLinked'));
  } catch (error) {
    showToast(window.t('toast.poeDisconnectError'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
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

// Adds entry cost to a stash diff's result as an input. `entryCostChaos` keeps how much of the run's cost it holds.
function addStashEntryCost(mapResult, costChaos) {
  const netProfit = (Number(mapResult.netProfit) || 0) - costChaos;
  return {
    ...mapResult,
    inputValue: (Number(mapResult.inputValue) || 0) + costChaos,
    netProfit,
    profitState: netProfit > 0 ? 'positive' : netProfit < 0 ? 'negative' : 'neutral',
    entryCostChaos: (Number(mapResult.entryCostChaos) || 0) + costChaos
  };
}

function deriveCurrentMapResult(profitReport = null, session = state.currentSession) {
  const { deriveMapResult } = getMapResultModel();
  const { listFarmTypes, getFarmTypeById } = getFarmTypeModel();
  const capturedContext = stashState.mapResultContext || {};
  const hasCapturedContext = Boolean(stashState.mapResultContext);
  const selectedFarmTypeId = capturedContext.farmTypeId
    || state.currentSession?.farmTypeId
    || state.currentSession?.mapType
    || state.farmType?.selectedFarmTypeId
    || null;
  const farmType = typeof getFarmTypeById === 'function'
    ? getFarmTypeById(selectedFarmTypeId, { includeDeleted: true })
    : (listFarmTypes().find((entry) => entry.id === selectedFarmTypeId) || null);
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

  const mapResult = deriveMapResult({
    farmType,
    runtimeSession,
    beforeSnapshot: stashState.beforeSnapshot,
    afterSnapshot: stashState.afterSnapshot,
    profitReport,
    characterSummary,
    accountName,
    poeVersion
  });
  // The stash is read once the map is open, after the map device took the map, so the diff does not see the run's
  // entry cost. It is added for the run being ended; a diff with no run id is that run's, as its completion is.
  const costChaos = Number(session?.costChaos) || 0;
  if (!mapResult || costChaos <= 0 || (mapResult.sessionId && mapResult.sessionId !== session.id)) {
    return mapResult;
  }

  return addStashEntryCost(mapResult, costChaos);
}

// Main settles a Divine cost that waited for a price when the map ends, and the cost can change while the stash is
// read. The result already shown and saved, and the stash panel, take the same change, so they match the run.
async function settleStashResultCost(endedSession, report = null) {
  const mapResult = stashState.lastMapResult;
  const restChaos = (Number(endedSession?.costChaos) || 0) - (Number(mapResult?.entryCostChaos) || 0);
  if (!mapResult || !endedSession || !restChaos) {
    return;
  }

  stashState.lastMapResult = addStashEntryCost(mapResult, restChaos);
  if (report) {
    renderProfitReport(report, { entryCostChaos: stashState.lastMapResult.entryCostChaos });
  }
  try {
    await window.electronAPI.showMapResultOverlay(stashState.lastMapResult);
  } catch (error) {
    console.warn('Failed to show map result overlay', error);
  }
  try {
    await persistMapResultHistory(stashState.lastMapResult);
  } catch (error) {
    console.warn('Failed to save the map result with its settled cost', error);
  }
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
    ? (farmTypeModel.getFarmTypeById(farmTypeId, { poeVersion }) || farmTypeModel.getFarmTypeById(farmTypeId, { includeDeleted: true }))
    : farmTypeModel.listFarmTypes().find((entry) => entry.id === farmTypeId);

  // A custom farm type this profile no longer knows has no name to show, and its id means nothing to a player.
  if (!farmType && farmTypeModel.isCustomFarmTypeId?.(farmTypeId)) {
    return null;
  }

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
    farmTypeId: session.farmTypeId
      || session.mapType
      || (typeof getFarmTypeIdFor === 'function' ? getFarmTypeIdFor(getCompletedSessionFarmTypeLabel(session)) : null),
    farmType: getCompletedSessionFarmTypeLabel(session),
    durationSeconds,
    inputValue: costChaos,
    outputValue: totalLootChaos,
    netProfit,
    profitState: netProfit > 0 ? 'positive' : netProfit < 0 ? 'negative' : 'neutral',
    topInputs: [],
    topOutputs: getScannedTopOutputs(lootEntries),
    lootItemCount: lootEntries.reduce((sum, loot) => sum + (parseInt(loot.quantity || 1, 10) || 1), 0),
    noLoot: Boolean(session.noLoot),
    lootUnread: Boolean(session.lootUnread),
    lootMapCount: session.lootMapCount > 1 ? session.lootMapCount : undefined,
    // The run's Divine and Mirror rates, as stash-diff results keep them: the overlay tiers the run by them.
    profitCurrencyRates: typeof getProfitCurrencyRates === 'function'
      ? getProfitCurrencyRates(poeVersion, league)
      : null,
    createdAt
  };
}

// A run's most valuable drops, grouped by item, in the shape stash-diff results use. Names differ in case between
// sources, so "Divine orb" and "Divine Orb" are one item, named as first seen.
// The grouping lives in mapResultStoreModel, so main can recompute a finished run's result from the same code.
function getScannedTopOutputs(lootEntries = []) {
  return getMapResultStoreModel().getTopLootOutputs(lootEntries);
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

async function completeCurrentSessionAfterStashProfit(mapResult = {}, report = null) {
  if (!shouldEndSessionAfterStashProfit(mapResult)) {
    return null;
  }

  try {
    const endedSession = await window.electronAPI.endSession(buildSessionCompletionPayloadFromMapResult(mapResult));
    await settleStashResultCost(endedSession, report);
    return endedSession;
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
  // Main takes off the part of the run's entry cost that the profit does not hold yet.
  const entryCostChaos = getSessionNumber(mapResult.entryCostChaos, 0);
  if (entryCostChaos > 0) {
    payload.entryCostChaos = entryCostChaos;
  }

  return payload;
}

async function loadMapResultHistory() {
  if (!state.currentUser) {
    state.mapResults = [];
    state.mapResultsLoadFailed = false;
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
    state.mapResultsLoadFailed = false;
  } catch {
    state.mapResults = [];
    // The card then says the load failed, not that no map was played yet.
    state.mapResultsLoadFailed = true;
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
    return `<span class="profit-unavailable">${window.t('mapResult.notCalculated')}</span>`;
  }
  // No loot was counted, so the map has no profit to show, even when its entry cost would make the number a loss.
  if (result?.noLoot) {
    return `<span class="profit-unavailable">${window.t('toast.mapNoLoot')}</span>`;
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
  if (result?.profitUnavailable || result?.noLoot || typeof getProfitTierFor !== 'function') {
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
    elements.lastMapResultFarmType.textContent = window.t(
      state.mapResultsLoadFailed ? 'dashboard.mapResultsLoadError' : 'dashboard.noCompletedMap'
    );
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
  // Map results store the English 'No farm type' fallback, so it is translated when shown.
  elements.lastMapResultFarmType.textContent = !latest.farmType ? window.t('dashboard.unknownFarmType') : latest.farmType === 'No farm type' ? window.t('dashboard.noFarmType') : latest.farmType;
  if (typeof applyFarmType === 'function') {
    applyFarmType(elements.lastMapResultFarmType, latest.farmTypeId || latest.farmType);
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
    return window.t('mapResult.published');
  }

  if (result.publishState === 'draft') {
    return window.t('mapResult.draft');
  }

  return window.t('mapResult.local');
}

function canPublishMapResult(result = {}) {
  return state.onlineAccount?.enabled === true
    && state.onlineAccount?.signedIn === true
    && isDisplayableMapResult(result)
    && result.publishState !== 'published';
}

// A run's most valuable drop, as the game's inventory shows it, with what it was worth.
function mapResultTopDropHTML(result = {}) {
  const drop = Array.isArray(result?.topOutputs) ? result.topOutputs[0] : null;
  if (!drop?.label) {
    return '';
  }

  const label = escapeHTML(drop.label);
  const slot = itemSlotHTML(drop.label, result.poeVersion || state.settings?.poeVersion || 'poe1', {
    quantity: Number(drop.quantityDelta) || 1,
    iconUrl: lootArtUrl({ itemName: drop.label, icon: drop.icon }, result.poeVersion || state.settings?.poeVersion || 'poe1')
  });
  const value = formatMapResultProfitHTML({ netProfit: drop.valueDelta, poeVersion: result.poeVersion }, 18);
  return `<div class="map-result-history-drop" title="${label}">${slot}<span class="map-result-history-drop-text"><strong>${label}</strong>${value}</span></div>`;
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
    `<option value="">${escapeHTML(window.t('dashboard.allFarms'))}</option>`,
    ...availableFarmTypes.map((farmType) => `<option value="${escapeHTML(farmType)}"${typeof farmTypeAttr === 'function' ? farmTypeAttr(farmType) : ''}>${escapeHTML(farmType)}</option>`)
  ].join('');
  elements.mapResultFilter.value = selectedFarmType;

  const filteredResults = getMapResultStoreModel().filterMapResults(results, { farmType: selectedFarmType });

  if (!filteredResults.length) {
    elements.mapResultHistory.innerHTML = `<p class="empty-state">${escapeHTML(window.t('dashboard.noMapResults'))}</p>`;
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
          <strong${typeof farmTypeAttr === 'function' ? farmTypeAttr(result?.farmTypeId || result?.farmType) : ''}>${typeof farmTypeIconHTML === 'function' ? farmTypeIconHTML(result?.farmTypeId || result?.farmType) : ''}${escapeHTML(result?.farmType || window.t('dashboard.unknownFarmType'))}</strong>
          <span>${formatDuration(Number(result?.durationSeconds || 0))}</span>
          <span class="map-result-publish-state" data-publish-state="${escapeHTML(result?.publishState || 'local')}">${escapeHTML(publishLabel)}</span>
          ${typeof profitMemeHTML === 'function' ? profitMemeHTML(profitTier) : ''}
        </div>
        ${typeof mapResultTopDropHTML === 'function' ? mapResultTopDropHTML(result) : ''}
        <div class="map-result-history-meta">
          <span class="map-result-history-profit"${profitTier ? ` data-profit-tier="${profitTier}"` : ''}>${formatMapResultProfitHTML(result, 24)}</span>
          <span>${escapeHTML(result?.createdAt ? timeAgo(result.createdAt) : window.t('time.justNow'))}</span>
          <button type="button" class="map-result-publish-btn" data-result-id="${escapeHTML(result?.id || result?.localRunId || '')}" ${publishable ? '' : 'disabled'}>
            ${escapeHTML(window.t(result?.publishState === 'published' ? 'mapResult.shared' : 'mapResult.share'))}
          </button>
        </div>
      </article>
    `;
  }).join('');
  if (typeof applyCachedItemIcons === 'function') {
    applyCachedItemIcons(elements.mapResultHistory);
  }
  ensureLootArtForRows(
    filteredResults.filter((result) => result?.topOutputs?.[0]?.label && !result.topOutputs[0].icon).map((result) => ({
      name: result.topOutputs[0].label,
      poeVersion: result.poeVersion || state.settings?.poeVersion || 'poe1'
    })),
    renderMapResultHistory
  );
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

  const farmType = !result.farmType ? window.t('dashboard.unknownFarmType') : result.farmType === 'No farm type' ? window.t('dashboard.noFarmType') : result.farmType;
  const mapName = result.mapName || window.t('misc.unknownMap');
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
    showToast(window.t('toast.farmPublished'), '', 'success');
  } catch (error) {
    showToast(window.t('toast.farmPublishFailed'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
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

// Shows or hides the journal notice on both pages. It is read out once when it appears, not on each refresh that finds
// the journal still unreadable.
function setJournalUnreadable(unreadable) {
  const appeared = unreadable && !state.journalUnreadable;
  state.journalUnreadable = unreadable;
  elements.journalNotices.forEach((notice) => notice.classList.toggle('hidden', !unreadable));
  if (appeared) {
    announceStatus(`${window.t('journal.unreadableTitle')}. ${window.t('journal.unreadableBody')}`);
  }
}

// Main answers only whether the signed-in profile's journal can be read.
async function loadJournalStatus() {
  try {
    const status = await window.electronAPI.getJournalStatus();
    setJournalUnreadable(status?.unreadable === true);
  } catch {
    // The history views report their own load failure; the notice keeps its last state.
  }
}

// The line in Recent Loot's header: how the last inventory read went. Not shown for PoE 1, which has no inventory read.
function describeInventoryReadStatus(status) {
  const time = status.at
    ? new Date(status.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '';
  switch (status.kind) {
    case 'saved':
      return { tone: 'ok', text: window.t('inventoryRead.saved', { time }) };
    case 'added': {
      const map = status.mapName || window.t('inventoryRead.lastMap');
      const text = status.count === 1
        ? window.t('inventoryRead.addedOne', { map, time })
        : window.t('inventoryRead.added', { count: status.count, map, time });
      return { tone: 'ok', text };
    }
    case 'noGain':
      return { tone: 'ok', text: window.t('inventoryRead.noGain', { time }) };
    case 'noBaseline':
      return { tone: 'warn', text: window.t('inventoryRead.noBaseline', { time }) };
    case 'none':
      return { tone: 'warn', text: window.t('inventoryRead.none') };
    case 'resolution':
      return { tone: 'warn', text: window.t('inventoryRead.resolution') };
    case 'saveFailed':
      return { tone: 'warn', text: window.t('inventoryRead.saveFailed', { time }) };
    case 'off':
      return { tone: 'muted', text: window.t('inventoryRead.off') };
    default:
      return null;
  }
}

function renderInventoryReadStatus() {
  const element = elements.inventoryReadStatus;
  if (!element) return;

  const status = state.inventoryReadStatus;
  const view = state.currentUser && status && getResolvedLeagueVersion() !== 'poe1'
    ? describeInventoryReadStatus(status)
    : null;
  element.hidden = !view;
  if (!view) return;

  element.dataset.tone = view.tone;
  elements.inventoryReadStatusText.textContent = view.text;
}

function setInventoryReadStatus(status) {
  state.inventoryReadStatus = status || null;
  renderInventoryReadStatus();
  // The guide in an empty Recent Loot follows the reading toggle.
  if (!state.recentLoot?.length && typeof renderRecentLoot === 'function') {
    renderRecentLoot();
  }
}

async function loadInventoryReadStatus() {
  try {
    setInventoryReadStatus(await window.electronAPI.getInventoryReadStatus());
  } catch {
    // The line keeps its last state.
  }
}

let _refreshPending = null;
let _refreshOptions = {};
let _refreshRunNow = null;

async function refreshTrackerData({ includeSessions = false, includeCurrency = false, immediate = false } = {}) {
  // Coalesce rapid calls within 300ms. `immediate` ends the wait, and calls after it wait as usual.
  _refreshOptions.includeSessions = _refreshOptions.includeSessions || includeSessions;
  _refreshOptions.includeCurrency = _refreshOptions.includeCurrency || includeCurrency;

  if (_refreshPending) {
    if (immediate) _refreshRunNow();
    return _refreshPending;
  }

  _refreshPending = new Promise((resolve) => {
    _refreshRunNow = resolve;
    if (immediate) resolve();
    else setTimeout(resolve, 300);
  }).then(async () => {
    const opts = { ..._refreshOptions };
    _refreshOptions = {};
    _refreshPending = null;

    if (!state.currentUser) {
      state.mapResults = [];
      state.mapResultsLoadFailed = false;
      resetDashboardSummary();
      renderLatestMapResult();
      renderMapResultHistory();
      renderRecentLoot();
      renderSessionsList();
      updateActiveSessionUI();
      renderInventoryReadStatus();
      return;
    }

    const tasks = [
      loadCurrentSession(),
      loadDashboardStats(),
      loadRecentLoot(),
      loadMapResultHistory(),
      loadJournalStatus(),
      loadInventoryReadStatus()
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

function setMapSessionConfirmButton(label) {
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
    `<option value="" data-i18n="dashboard.noFarmType">${escapeHTML(window.t('dashboard.noFarmType'))}</option>`,
    ...farmTypes.map((farmType) => `<option value="${escapeHTML(farmType.id)}"${typeof farmTypeAttr === 'function' ? farmTypeAttr(farmType.id) : ''}>${typeof farmTypeIconHTML === 'function' ? farmTypeIconHTML(farmType.id) : ''}${escapeHTML(farmType.label)}</option>`)
  ].join('');
  elements.mapSessionFarmTypeSelect.value = normalizedSelection;

  return normalizedSelection || null;
}

function requestMapSessionDetails({ defaultName, trackerContext } = {}) {
  const fallbackName = normalizeSessionMapName(defaultName)
    || (window.t ? window.t('misc.unknownMap') : 'Unknown Map');

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

  if (title) title.textContent = window.t('dashboard.newMap');
  if (subtitle) subtitle.textContent = window.t('mapSession.startSubtitle');
  if (label) label.hidden = false;
  if (farmTypeLabel) farmTypeLabel.hidden = false;
  if (elements.mapSessionFarmTypeSelect) elements.mapSessionFarmTypeSelect.hidden = false;
  setMapSessionConfirmButton(window.t('mapSession.startMap'));

  elements.mapSessionDefaultName.textContent = fallbackName;
  if (elements.mapSessionContext) {
    elements.mapSessionContext.textContent = trackerContext?.label || window.t('mapSession.defaultContext');
  }
  elements.mapSessionNameInput.value = fallbackName;
  elements.mapSessionNameInput.hidden = false;
  elements.mapSessionNameInput.select();
  populateMapSessionFarmTypes(trackerContext?.farmTypeId || '', {
    poeVersion: trackerContext?.poeVersion
  });
  if (elements.mapSessionCancelBtn) elements.mapSessionCancelBtn.textContent = window.t('mapSession.cancel');
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

  if (title) title.textContent = window.t('mapSession.endTitle');
  if (subtitle) subtitle.textContent = window.t('mapSession.endSubtitle');
  if (elements.mapSessionContext) elements.mapSessionContext.textContent = window.t('mapSession.activeRun');
  if (elements.mapSessionDefaultName) elements.mapSessionDefaultName.textContent = session?.mapName || window.t('misc.unknownMap');
  if (elements.mapSessionNameInput) elements.mapSessionNameInput.hidden = true;
  if (label) label.hidden = true;
  if (farmTypeLabel) farmTypeLabel.hidden = true;
  if (elements.mapSessionFarmTypeSelect) elements.mapSessionFarmTypeSelect.hidden = true;
  if (elements.mapSessionConfirmBtn) elements.mapSessionConfirmBtn.textContent = window.t('dashboard.endMap');
  if (elements.mapSessionCancelBtn) elements.mapSessionCancelBtn.textContent = window.t('mapSession.keepTracking');
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
    showToast(window.t('toast.mapStartFailed'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
    // A journal that broke while the app ran gets its notice, with Start a new journal, here and not only on Dashboard.
    void loadJournalStatus();
  }
}

/**
 * Session bitir
 */
async function handleEndSession() {
  if (!state.currentSession) return;

  if (!await requestEndSessionConfirmation(state.currentSession)) return;

  if (typeof completePoe1SessionWithStashProfit === 'function' && isActiveSessionPoe1(state.currentSession)) {
    // Reading the stash can take a few tries; the button says so instead of a toast per try, and the announcer reads
    // it out once.
    const busyLabel = isStashTrackingEnabled() ? window.t('stash.readingStash') : undefined;
    setButtonBusy(elements.endSessionBtn, true, busyLabel);
    if (busyLabel) {
      announceStatus(busyLabel);
    }
    let completed = false;
    try {
      completed = await completePoe1SessionWithStashProfit();
    } finally {
      setButtonBusy(elements.endSessionBtn, false);
    }
    if (!completed) {
      void loadJournalStatus();
    }
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
    showToast(window.t('toast.mapEndFailed'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
    void loadJournalStatus();
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
  if (elements.sessionBadge) {
    elements.sessionBadge.textContent = window.t(session ? 'dashboard.active' : 'dashboard.waiting');
    elements.sessionBadge.classList.toggle('is-active', Boolean(session));
  }

  if (!session) {
    stopSessionClock();
    renderedActiveSessionHTML = null;
    renderedActiveSessionItems = null;
    // Auto-start starts a map on entry, so the hint mentions it only while that setting is on.
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
  } else if (Number(session.costPending?.amount) > 0) {
    // The Divine rate was unknown at the start; the cost lands when the map ends, if the rate is known by then.
    metaParts.push(window.t('dashboard.costPendingDivine', { amount: escapeHTML(String(session.costPending.amount)) }));
  }

  const html = `
    <div class="session-live">
      <div class="session-live-title">
        <span class="session-live-dot" aria-hidden="true"></span>
        <strong class="session-live-map">${escapeHTML(session.mapName || window.t('misc.unknownMap'))}</strong>
        ${session.mapTier ? `<span class="session-live-chip">T${escapeHTML(session.mapTier)}</span>` : ''}
        ${farmTypeId ? `<span class="session-live-farm"${farmTypeAttr(farmTypeId)}>${typeof farmTypeIconHTML === 'function' ? farmTypeIconHTML(farmTypeId) : ''}${escapeHTML(getSessionFarmTypeLabel(session))}</span>` : ''}
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
    // The journal notice right above the list says why it is empty, so the list does not say it a second time.
    elements.sessionsList.innerHTML = extractRawErrorMessage(error) === 'JOURNAL_UNREADABLE'
      ? ''
      : `<p class="empty-state">${getUserFacingErrorMessage(error, 'sessions.loadError')}</p>`;
    renderSessionsSummary([]);
    // Opening Sessions loads only the list, so the notice is checked again here.
    void loadJournalStatus();
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
    return window.t('dashboard.noFarmType');
  }

  const poeVersion = getSessionPoeVersion(session);
  const farmTypeModel = getFarmTypeModel();
  const farmType = typeof farmTypeModel.getFarmTypeById === 'function'
    ? (farmTypeModel.getFarmTypeById(farmTypeId, { poeVersion }) || farmTypeModel.getFarmTypeById(farmTypeId, { includeDeleted: true }))
    : farmTypeModel.listFarmTypes().find((entry) => entry.id === farmTypeId);

  // A custom farm type this profile no longer knows has no name to show, and its id means nothing to a player.
  if (!farmType && farmTypeModel.isCustomFarmTypeId?.(farmTypeId)) {
    return window.t('dashboard.unknownFarmType');
  }

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
    window.t('sessions.allLeagues')
  );

  populateSelectOptions(
    elements.sessionFarmFilter,
    sessions.map(getSessionFarmTypeLabel),
    'all',
    window.t('dashboard.allFarms')
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
  const { listFarmTypes, isCustomFarmTypeId } = getFarmTypeModel();
  // The hub is public, so a player's own farm type is not offered as a filter sent to the server.
  const farmTypes = listFarmTypes(versionFilter === 'all' ? {} : { poeVersion: versionFilter })
    .filter((farmType) => !isCustomFarmTypeId?.(farmType.id));
  const runFarmTypes = state.farmingHubRuns.map((run) => run.farmType).filter(Boolean);
  const optionLabels = [...new Set([...farmTypes.map((farmType) => farmType.label), ...runFarmTypes])];

  populateSelectOptions(select, optionLabels, 'all', window.t('dashboard.allFarms'));
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
    const author = run.publisherDisplayName || run.author?.username || window.t('farmingHub.unknownAuthor');
    const profitTier = profitTierFor(profit, poeVersion);

    return `
      <article class="farming-hub-run">
        <div class="farming-hub-run-main">
          <div class="farming-hub-run-kicker">${poeVersion === 'poe2' ? 'PoE 2' : 'PoE 1'} / ${escapeHTML(run.league || 'Standard')} / ${escapeHTML(author)}</div>
          <h3${typeof farmTypeAttr === 'function' ? farmTypeAttr(run.farmType) : ''}>${escapeHTML(run.farmType || window.t('dashboard.unknownFarmType'))}</h3>
          <p>${escapeHTML(run.setupDescription || window.t('farmingHub.noSetupNotes'))}</p>
        </div>
        <div class="farming-hub-run-metrics">
          <span><strong>${escapeHTML(String(run.runCount || 1))}</strong> ${escapeHTML(window.t('farmingHub.maps'))}</span>
          <span><strong>${duration}</strong> ${escapeHTML(window.t('farmingHub.duration'))}</span>
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
    if (extractRawErrorMessage(error) === 'JOURNAL_UNREADABLE') {
      // The journal notice at the top of the Dashboard says why; the card shows its usual empty state like the others.
      renderRecentLoot();
    } else {
      elements.recentLootList.innerHTML = `<p class="empty-state">${getUserFacingErrorMessage(error, 'errors.lootRecent')}</p>`;
    }
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
    const contextLabel = `${poeVersion === 'poe2' ? 'PoE 2' : 'PoE 1'} / ${escapeHTML(session.league || 'Standard')} / <span${typeof farmTypeAttr === 'function' ? farmTypeAttr(farmTypeId) : ''}>${typeof farmTypeIconHTML === 'function' ? farmTypeIconHTML(farmTypeId) : ''}${escapeHTML(getSessionFarmTypeLabel(session))}</span>`;
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
      <button class="session-item${isActive ? ' is-active' : ''}" type="button" data-session-id="${escapeHTML(session.id)}">
        <div class="session-primary">
          <div class="session-title">${tierChip}<span class="session-name" lang="en">${escapeHTML(session.mapName || window.t('misc.unknownMap'))}</span></div>
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
    const title = `${session.mapName || window.t('misc.unknownMap')} ${formatAdaptiveProfitText(profit, poeVersion, { league, signed: true })}`;
    return `<span class="sessions-summary-run${below ? ' is-below' : ''}" data-profit-tier="${tierFor(profit)}" title="${escapeHTML(title)}" style="--run-size: ${size.toFixed(1)}%"></span>`;
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
        <span class="sessions-summary-best"><span class="sessions-summary-best-name" lang="en">${escapeHTML(best.mapName || window.t('misc.unknownMap'))}</span>${valueHTML(profitOf(best), tierFor(profitOf(best)))}${profitMemeHTML(tierFor(profitOf(best)))}</span>
      </div>
    </div>
    <div class="sessions-summary-runs" role="img" aria-label="${window.t('sessions.summaryBarsLabel', { count: bars.length })}" style="--baseline: ${baseline.toFixed(1)}%">${barsHTML}</div>
  `;
  summary.hidden = false;
}

function renderRecentLoot() {
  if (!elements.recentLootList) return;

  if (!state.currentUser || !state.recentLoot.length) {
    // A PoE 2 player with no loot yet learns how the inventory reads count a map.
    if (state.currentUser && getResolvedLeagueVersion() !== 'poe1' && state.inventoryReadStatus?.kind !== 'off') {
      const step = (n) => `<li><span class="loot-guide-num" aria-hidden="true">${n}</span><span><strong>${escapeHTML(window.t(`dashboard.lootGuideStep${n}Lead`))}</strong> ${escapeHTML(window.t(`dashboard.lootGuideStep${n}Rest`))}</span></li>`;
      elements.recentLootList.innerHTML = `<div class="loot-guide"><span class="loot-guide-title">${escapeHTML(window.t('dashboard.lootGuideTitle'))}</span><ol class="loot-guide-steps">${step(1)}${step(2)}${step(3)}</ol></div>`;
      return;
    }
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
        ${itemSlotHTML(loot.itemName, poeVersion, { quantity, iconUrl: lootArtUrl(loot, poeVersion) })}
        <div class="recent-loot-main">
          <span class="recent-loot-name">${escapeHTML(loot.itemName || window.t('misc.unknownItem'))}</span>
          <div class="recent-loot-meta">${escapeHTML(session.mapName || window.t('misc.unknownMap'))} · ${timeAgo(loot.createdAt)}</div>
        </div>
        <div class="recent-loot-value" data-profit-tier="${lootTierFor(totalValue, poeVersion, rateOptions)}">${formatLootValue(totalValue, 14, poeVersion, rateOptions)}</div>
      </article>
    `;
  }).join('');
  applyCachedItemIcons(elements.recentLootList);
  ensureLootArtForRows(
    state.recentLoot.filter((loot) => !loot.icon).map((loot) => ({
      name: loot.itemName,
      poeVersion: loot.session?.poeVersion || state.settings.poeVersion || 'poe1'
    })),
    renderRecentLoot
  );
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
    showToast(window.t('toast.settingsError'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
    return;
  }

  const settings = {
    apiUrl: elements.apiUrl.value,
    onlineEnabled: elements.onlineEnabled ? elements.onlineEnabled.checked : false,
    poePath: elements.poePath.value,
    autoStartSession: elements.autoStartSession.checked,
    overlayEnabled: elements.overlayEnabled ? elements.overlayEnabled.checked : false,
    inventoryReadEnabled: elements.inventoryReadEnabled ? elements.inventoryReadEnabled.checked : true,
    notifications: elements.enableNotifications.checked,
    soundNotifications: elements.soundNotifications ? elements.soundNotifications.checked : false,
    language: elements.globalLanguage ? elements.globalLanguage.value : 'en',
    poeVersion: activeVersion ? activeVersion.dataset.version : 'poe1',
    [leagueSettingKey]: visibleLeague,
    scanHotkey: hotkeys.scanHotkey,
    stashScanHotkey: hotkeys.stashScanHotkey
  };

  try {
    const result = await window.electronAPI.setSettings(settings);
    // Cancel in main's online prompt saved nothing, so the form keeps what was typed and shows no saved state.
    if (result?.canceled === true) {
      return;
    }
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
    markButtonSaved(elements.saveSettingsBtn);
  } catch (error) {
    showToast(window.t('toast.settingsError'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
  }
}

// Reset to Defaults asks in the app's own dialog, like Delete everything. Cancel has focus first, so Enter alone never
// resets. Resolves once the dialog closed and focus is back on the Reset button.
function requestResetSettingsConfirmation() {
  const { resetSettingsModal: modal, resetSettingsCancelBtn: cancel, resetSettingsConfirmBtn: confirm } = elements;
  modal.classList.remove('hidden');
  cancel.focus();

  return new Promise((resolve) => {
    let settled = false;
    const handleCancel = () => settle(false);
    const handleConfirm = () => settle(true);
    const handleBackdropClick = (event) => {
      if (event.target === modal) settle(false);
    };
    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        settle(false);
        return;
      }
      if (event.key !== 'Tab') return;
      // Tab wraps between the two buttons, so focus never reaches the page behind the dialog.
      event.preventDefault();
      const controls = [cancel, confirm];
      const index = controls.indexOf(document.activeElement);
      const step = event.shiftKey ? -1 : 1;
      controls[index === -1 ? 0 : (index + step + controls.length) % controls.length].focus();
    };
    const settle = (confirmed) => {
      if (settled) return;
      settled = true;
      cancel.removeEventListener('click', handleCancel);
      confirm.removeEventListener('click', handleConfirm);
      modal.removeEventListener('click', handleBackdropClick);
      document.removeEventListener('keydown', handleKeydown);
      modal.classList.add('hidden');
      elements.resetSettingsBtn?.focus();
      resolve(confirmed);
    };

    cancel.addEventListener('click', handleCancel);
    confirm.addEventListener('click', handleConfirm);
    modal.addEventListener('click', handleBackdropClick);
    document.addEventListener('keydown', handleKeydown);
  });
}

/**
 * Ayarlari sifirla
 */
async function handleResetSettings() {
  if (!(await requestResetSettingsConfirmation())) return;

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

    showToast(window.t('toast.settingsReset'), '', 'success');
  } catch (error) {
    showToast(window.t('toast.settingsResetFailed'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
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
    elements.connectionText.dataset.i18n = 'settings.connected';
    elements.connectionText.textContent = window.t('settings.connected');
  } catch (error) {
    // Main refused the address without trying it, so saying the connection failed would point at the network.
    const messageKey = String(error?.message).includes('Invalid API URL') ? 'errors.invalidApiUrl' : 'settings.connectionFailed';
    elements.connectionDot.classList.remove('connected');
    elements.connectionText.dataset.i18n = messageKey;
    elements.connectionText.textContent = window.t(messageKey);
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
      // The account status line shows it; the announcer reads it out.
      announceStatus(window.t('settings.onlineAccountSignedIn'));
    } else {
      showToast(window.t('toast.serverSignInFailed'), getUserFacingErrorMessage({ error: result?.error }, 'toast.tryAgain'), 'error');
    }
  } catch (error) {
    showToast(window.t('toast.serverSignInFailed'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
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

// A save confirms on its own button for 2 s instead of with a toast; the announcer still reads it out.
const SAVED_STATE_MS = 2000;

// Reads out an outcome that a button or status line shows instead of a toast; the line goes once it has been read.
function announceStatus(text) {
  const line = document.createElement('p');
  line.textContent = text;
  elements.toastAnnouncer.appendChild(line);
  setTimeout(() => line.remove(), SAVED_STATE_MS);
}

function markButtonSaved(button) {
  const label = button?.querySelector('.btn-label');
  if (!label) {
    return;
  }

  announceStatus(window.t('settings.savedState'));
  label.textContent = window.t('settings.savedState');
  setTimeout(() => {
    label.textContent = window.t(label.getAttribute('data-i18n'));
  }, SAVED_STATE_MS);
}

// Errors and warnings stay long enough to read; info and success get out of the way. A toast with an action stays
// until it is used or dismissed.
const TOAST_DURATION_MS = { info: 4000, success: 5000, warning: 8000, error: 8000 };
const TOAST_STACK_LIMIT = 3;
// Removes a leaving toast even when its exit animation never reports an end (hidden window, reduced motion).
const TOAST_EXIT_FALLBACK_MS = 300;
// Each type has its own glyph shape, so the type never rests on the tile colour alone; a finished map shows the map.
const TOAST_GLYPH_SVG = {
  info: '<svg class="icon" width="18" height="18"><use href="assets/icons.svg#info"/></svg>',
  success: '<svg class="icon" width="18" height="18"><use href="assets/icons.svg#check"/></svg>',
  warning: '<svg class="icon" width="18" height="18"><use href="assets/icons.svg#warn"/></svg>',
  error: '<svg class="icon" width="18" height="18"><use href="assets/icons.svg#alert"/></svg>',
  map: '<svg class="icon" width="18" height="18"><use href="assets/icons.svg#map"/></svg>'
};
const TOAST_CLOSE_SVG = '<svg class="icon icon-sm" width="12" height="12" aria-hidden="true"><use href="assets/icons.svg#close"/></svg>';
// The dismiss button, announcer line and timer holds of each visible toast.
const toastHandles = new WeakMap();
// Where keyboard focus was before it entered the stack; it goes back there when the last toast closes.
let toastReturnFocus = null;
// The element that had focus when the window went to the background; the window coming back focuses it again.
let toastFocusBeforeBlur = null;
// Numbers the toast titles, so each dismiss button can point at the notice it closes.
let toastSerial = 0;

// The plate: status tile, body with its title, and a real dismiss button. Only fixed sprite markup goes in as HTML.
function createToastShell(type, glyph) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const mark = document.createElement('span');
  mark.className = 'toast-mark';
  mark.setAttribute('aria-hidden', 'true');
  mark.innerHTML = TOAST_GLYPH_SVG[glyph];
  const body = document.createElement('div');
  body.className = 'toast-body';
  const title = document.createElement('p');
  title.className = 'toast-title';
  toastSerial += 1;
  title.id = `toast-title-${toastSerial}`;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', window.t('toast.dismiss'));
  close.setAttribute('data-i18n-aria', 'toast.dismiss');
  // Every toast has a Dismiss button, so each one names its notice by the title.
  close.setAttribute('aria-describedby', title.id);
  close.innerHTML = TOAST_CLOSE_SVG;
  toast.append(mark, body, close);
  return { toast, mark, body, title, close };
}

// No braces in the parameter list: tests/security-hardening.test.js reads the body from the first brace.
function showToast(title, message, type = 'info', options) {
  const kind = TOAST_DURATION_MS[type] ? type : 'info';
  const action = options?.action || null;
  const shell = createToastShell(kind, kind);
  shell.title.textContent = title == null ? '' : String(title);
  shell.body.append(shell.title);
  if (message) {
    const messageElement = document.createElement('p');
    messageElement.className = 'toast-message';
    messageElement.textContent = String(message);
    shell.body.append(messageElement);
  }
  // An error is read out once, assertively and without the button names; the rest go through the polite announcer.
  if (kind === 'error') {
    shell.body.setAttribute('role', 'alert');
  }

  if (action) {
    const actions = document.createElement('div');
    actions.className = 'toast-actions';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-secondary btn-small';
    button.textContent = action.label;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      dismissToast(shell.toast, event.detail === 0);
      action.onSelect();
    });
    actions.append(button);
    shell.toast.append(actions);
  }

  return mountToast(shell, kind, {
    sticky: Boolean(action),
    announcement: kind === 'error' ? '' : [title, message].filter(Boolean).join('. ')
  });
}

// The one routine notice: a finished map with its signed value in the profit tier, as on the overlay result card.
function showMapResultToast(result = {}) {
  // A map with no loot has no profit to report, rather than a profit of 0.
  const hasValue = !result.profitUnavailable && !result.noLoot;
  const tier = hasValue ? getMapResultProfitTier(result) : '';
  const shell = createToastShell('success', 'map');
  shell.toast.classList.add('toast--result');
  if (tier) {
    shell.mark.setAttribute('data-profit-tier', tier);
  }

  const head = document.createElement('div');
  head.className = 'toast-head';
  shell.title.textContent = result.mapName || window.t('misc.unknownMap');
  // A name too long for the plate ends in an ellipsis; the tooltip keeps all of it.
  shell.title.title = shell.title.textContent;
  head.append(shell.title);
  if (hasValue) {
    const value = document.createElement('span');
    value.className = 'toast-value';
    if (tier) {
      value.setAttribute('data-profit-tier', tier);
    }
    value.innerHTML = formatMapResultProfitHTML(result, 16, { signed: true });
    head.append(value);
  }

  const label = hasValue
    ? window.t(Number(result.netProfit) < 0 ? 'toast.mapLoss' : 'toast.mapProfit')
    : window.t(result.noLoot ? 'toast.mapNoLoot' : 'toast.mapUnpriced');
  const seconds = Math.round(Number(result.durationSeconds) || 0);
  const meta = document.createElement('div');
  meta.className = 'toast-meta';
  const messageElement = document.createElement('p');
  messageElement.className = 'toast-message';
  messageElement.textContent = seconds > 0 ? `${label} · ${formatDuration(seconds)}` : label;
  meta.append(messageElement);
  if (hasValue) {
    // Extreme tiers get the flask mascot reaction, as on the Last Map Result card, on this row so the first row keeps
    // its room for the map name.
    meta.insertAdjacentHTML('beforeend', profitMemeHTML(tier));
  }
  shell.body.append(head, meta);

  const amount = hasValue
    ? ` ${formatAdaptiveProfitText(result.netProfit || 0, result.poeVersion || state.settings.poeVersion || 'poe1', { signed: true })}`
    : '';
  return mountToast(shell, 'success', { announcement: `${shell.title.textContent}. ${label}${amount}` });
}

function mountToast(shell, type, { sticky = false, announcement = '' } = {}) {
  const { toast, close } = shell;
  // The oldest timed toast steps aside so at most TOAST_STACK_LIMIT stay on screen; one waiting for an action, or one
  // the player is pointing at or has focused, stays.
  const visibleToasts = Array.from(elements.toastContainer.querySelectorAll('.toast:not(.leaving)'));
  const overflow = Math.max(0, visibleToasts.length - TOAST_STACK_LIMIT + 1);
  visibleToasts
    .filter((oldToast) => {
      const oldHolds = toastHandles.get(oldToast)?.holds;
      return !oldToast.dataset.sticky && !oldHolds?.has('pointer') && !oldHolds?.has('focus');
    })
    .slice(0, overflow)
    .forEach((oldToast) => dismissToast(oldToast));
  if (sticky) {
    toast.dataset.sticky = 'true';
  }
  elements.toastContainer.appendChild(toast);

  let line = null;
  if (announcement) {
    line = document.createElement('p');
    line.textContent = announcement;
    elements.toastAnnouncer.appendChild(line);
  }

  // The pointer, keyboard focus and a window in the background each hold the toast; it counts down only when none
  // does, from the time it had left.
  const holds = new Set(document.hasFocus() ? [] : ['window']);
  let remainingMs = TOAST_DURATION_MS[type] || TOAST_DURATION_MS.info;
  let startedAt = 0;
  let timerId = null;
  const update = () => {
    if (sticky) {
      return;
    }
    if (holds.size > 0 && timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
      remainingMs -= Date.now() - startedAt;
    } else if (holds.size === 0 && timerId === null) {
      startedAt = Date.now();
      timerId = setTimeout(() => dismissToast(toast), remainingMs);
    }
  };
  const hold = (reason) => {
    holds.add(reason);
    update();
  };
  const release = (reason) => {
    holds.delete(reason);
    update();
  };
  toastHandles.set(toast, { close, line, holds, hold, release });

  toast.addEventListener('mouseenter', () => hold('pointer'));
  toast.addEventListener('mouseleave', () => release('pointer'));
  toast.addEventListener('focusin', (event) => {
    // The window coming back focuses the same element again with no relatedTarget; focus never left the stack, so
    // the place to go back to stays. Focus that came from nowhere (a click with nothing focused) has no place to go
    // back to, so an older one is dropped rather than focused later.
    const windowReturned = !event.relatedTarget && event.target === toastFocusBeforeBlur;
    toastFocusBeforeBlur = null;
    if (!windowReturned && !elements.toastContainer.contains(event.relatedTarget)) {
      toastReturnFocus = event.relatedTarget;
    }
    hold('focus');
  });
  toast.addEventListener('focusout', (event) => {
    if (!toast.contains(event.relatedTarget)) {
      release('focus');
    }
  });
  // Escape closes only this toast, so a modal or drawer behind it stays open.
  toast.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      dismissToast(toast, true);
    }
  });
  // Enter or Space on the dismiss button clicks with no click count, so that click came from the keyboard.
  toast.addEventListener('click', (event) => dismissToast(toast, event.detail === 0));
  update();
  return toast;
}

// The player is in the game while the window is in the background, so the toasts wait for their return.
window.addEventListener('blur', () => {
  toastFocusBeforeBlur = document.activeElement;
  elements.toastContainer.querySelectorAll('.toast:not(.leaving)').forEach((toast) => toastHandles.get(toast)?.hold('window'));
});
window.addEventListener('focus', () => {
  elements.toastContainer.querySelectorAll('.toast:not(.leaving)').forEach((toast) => toastHandles.get(toast)?.release('window'));
});

function dismissToast(toast, fromKeyboard = false) {
  if (!toast.isConnected || toast.classList.contains('leaving')) {
    return;
  }

  // From the keyboard, focus moves on to the next toast, or back to where it was before it entered the stack. A
  // pointer close sends it straight back, so no other toast is left holding focus and its timer.
  if (toast.contains(document.activeElement)) {
    const next = fromKeyboard
      ? Array.from(elements.toastContainer.querySelectorAll('.toast:not(.leaving)')).find((other) => other !== toast)
      : null;
    const target = next ? toastHandles.get(next)?.close : toastReturnFocus;
    if (target?.isConnected) {
      target.focus();
    }
  }

  toast.classList.add('leaving');
  const remove = () => {
    toast.remove();
    toastHandles.get(toast)?.line?.remove();
  };
  toast.addEventListener('animationend', remove, { once: true });
  setTimeout(remove, TOAST_EXIT_FALLBACK_MS);
}

async function handleCheckForAppUpdate() {
  try {
    state.appUpdate = await window.electronAPI.checkForAppUpdate();
    renderAppUpdateState();
  } catch {
    // The About status line carries the failure, next to Check for Updates; the announcer reads it out.
    if (elements.appUpdateStatus) {
      elements.appUpdateStatus.textContent = window.t('settings.updateError');
    }
    announceStatus(window.t('settings.updateError'));
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
    showToast(window.t('stash.baselineFailedTitle'), window.t('stash.baselineFailed'), 'warning');
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
      showToast(window.t('stash.staleSnapshotTitle'), window.t('stash.staleSnapshot'), 'warning');
    }

    report = await window.electronAPI.calculateProfit(
      stashState.beforeSnapshotId,
      stashState.afterSnapshotId
    );

    if (!isEmptyProfitReport(report) || attempt >= maxAttempts) {
      return report;
    }

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

// Without stash totals the journal values the session from the loot recorded in it (read from the inventory or manual), and
// the session-ended event records and shows that result. A failed end is said here with main's reason, because main's
// OS notice is only for a window in the background.
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
      showToast(window.t('stash.completedWithoutStashTitle'), window.t('stash.completedWithoutStash'), 'warning');
    }

    return true;
  } catch (completionError) {
    console.warn('Failed to complete PoE1 session without stash profit', completionError);
    showToast(window.t('toast.mapEndFailed'), getUserFacingErrorMessage(completionError, 'toast.tryAgain'), 'error');
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
    return completePoe1SessionWithoutStashProfit(state.currentSession, new Error('Missing before-stash baseline'));
  }

  const previousSession = state.currentSession;

  try {
    let report = await takeAfterSnapshotWithStashRefreshRetry(previousSession);
    if (isEmptyProfitReport(report)) {
      report = await hydratePoe1StashSnapshotsForSession(previousSession) || report;
    }
    stashState.lastMapResult = deriveCurrentMapResult(report, previousSession);

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

    renderProfitReport(report, { entryCostChaos: Number(stashState.lastMapResult?.entryCostChaos) || 0 });

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
    const endedSession = await window.electronAPI.endSession(
      buildSessionCompletionPayloadFromMapResult(stashState.lastMapResult)
    );
    await settleStashResultCost(endedSession, report);

    state.currentSession = null;
    updateActiveSessionUI();
    await refreshTrackerData({ includeSessions: true });

    return true;
  } catch (error) {
    // A fallback end that fails says its own reason, not the stash's.
    if (error?.stashSnapshotFailed) {
      return completePoe1SessionWithoutStashProfit(previousSession, error);
    }

    showToast(window.t('toast.mapEndFailed'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
    return false;
  }
}

function handleAppUpdateAction() {
  return state.appUpdate?.readyToInstall ? handleInstallAppUpdate() : handleDownloadAppUpdate();
}

async function handleDownloadAppUpdate() {
  const update = state.appUpdate;
  // A sticky toast can outlive the offer it was raised for, and must not claim a download that never starts.
  if (!update?.available || update.readyToInstall || update.downloading || update.verifying) {
    return;
  }

  try {
    showAppUpdateToast(
      window.t('toast.updateDownloadingTitle'),
      window.t('toast.updateDownloadingBody', { version: state.appUpdate?.nextVersion || '?' }),
      'info'
    );
    await window.electronAPI.downloadAppUpdate();
  } catch (error) {
    showToast(window.t('settings.updateDownloadFailed'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
  }
}

async function handleInstallAppUpdate() {
  try {
    await window.electronAPI.installAppUpdate();
  } catch (error) {
    showToast(window.t('settings.updateError'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
  }
}

async function handleOpenAppUpdatePage() {
  try {
    await window.electronAPI.openAppUpdatePage();
  } catch (error) {
    showToast(window.t('toast.updatePageFailed'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
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
  // Main cannot register a hotkey that another app already holds; trying again cannot help.
  { pattern: /register global shortcut/i, key: 'settings.hotkeyErrorInUse' },
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

  resetSessionLootEditing();

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
    showToast(window.t('toast.runOpenFailed'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
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
      showToast(window.t('toast.diagnosticsSaved'), window.t(toastKey), 'success');
    }
  } catch (error) {
    showToast(window.t('toast.diagnosticsFailed'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
  } finally {
    setButtonBusy(elements.exportDiagnosticsBtn, false);
  }
}

// Sizes count in 1024s like File Explorer: whole KB below 1 MB, then MB with one decimal. en-US digits, like the
// other counts in the app.
function formatDataSize(bytes) {
  const value = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  const kilobytes = Math.ceil(value / 1024);
  if (kilobytes < 1024) {
    return kilobytes.toLocaleString('en-US') + ' KB';
  }
  return (value / (1024 * 1024)).toLocaleString('en-US', { maximumFractionDigits: 1 }) + ' MB';
}

// The folder and its size come from main on each visit, as text only. A newer load wins over an older, slower one.
async function loadDataSummary() {
  if (!elements.dataTotalSize || !elements.dataFolderPath) return;
  const requestId = ++dataSummaryRequestId;
  elements.dataTotalSize.textContent = window.t('settings.dataSizeLoading');
  elements.dataTotalSize.setAttribute('aria-busy', 'true');
  try {
    const summary = await window.electronAPI.getLocalDataSummary();
    if (requestId !== dataSummaryRequestId) return;
    elements.dataFolderPath.textContent = summary?.folderPath || '';
    elements.dataTotalSize.textContent = window.t('settings.dataTotalSize', { size: formatDataSize(summary?.totalBytes) });
  } catch {
    if (requestId !== dataSummaryRequestId) return;
    elements.dataTotalSize.textContent = window.t('settings.dataSizeUnavailable');
  } finally {
    if (requestId === dataSummaryRequestId) {
      elements.dataTotalSize.removeAttribute('aria-busy');
    }
  }
}

// Main opens the folder it owns and answers only whether it did, so no path or OS error text reaches a toast.
async function handleOpenDataFolder(event) {
  // The Data tab and the journal notice share this. The clicked button is read before the first await, after which
  // the event no longer names it.
  const button = event?.currentTarget || elements.openDataFolderBtn;
  setButtonBusy(button, true);
  let opened = false;
  try {
    opened = (await window.electronAPI.openDataFolder())?.opened === true;
  } catch {
    // Reported below with a static text: the error text can name the folder.
  } finally {
    setButtonBusy(button, false);
    // Disabling the button dropped its focus; keyboard users carry on from it. As in handleClearLogs, focus comes
    // back before the toast.
    button.focus();
  }

  if (!opened) {
    showToast(window.t('toast.dataFolderOpenFailed'), window.t('toast.tryAgain'), 'error');
  }
}

// The journal notice's Start a new journal. Main asks first (Cancel is the default) and only renames a journal it cannot
// read; it answers with a reason, so every toast here is a static text.
async function handleStartNewJournal(event) {
  const button = event?.currentTarget || null;
  setButtonBusy(button, true);
  let result = null;
  try {
    result = await window.electronAPI.startNewJournal();
  } catch {
    result = { started: false, reason: 'failed' };
  } finally {
    setButtonBusy(button, false);
    // The native confirm took focus away. It comes back before the toast, so moving it does not cut the toast off.
    button?.focus();
  }

  if (result?.reason === 'canceled') return;
  if (result?.reason === 'busy') {
    showToast(window.t('toast.dataActionBusy'), '', 'warning');
    return;
  }
  if (result?.started || result?.reason === 'readable') {
    if (result.started) {
      // Main dropped the map of the old journal; the Dashboard follows now, not only after the refresh.
      state.currentSession = null;
      updateActiveSessionUI();
    }
    // The notice and its buttons go, so focus moves on to the page's next control before the toast is read out. On the
    // Dashboard that is Start map, or End map while a map still runs.
    setJournalUnreadable(false);
    const dashboardTarget = state.currentSession ? elements.endSessionBtn : elements.startSessionBtn;
    (isPageActive('sessions') ? elements.sessionFilter : dashboardTarget)?.focus();
    if (result.started) {
      showToast(window.t('toast.journalStarted'), '', 'success');
    } else {
      showToast(window.t('toast.journalReadable'), '', 'info');
    }
  } else {
    showToast(window.t('toast.journalStartFailed'), window.t('toast.logsClearFailed'), 'error');
  }
  // The views and the notice follow the journal as it is now, also when main failed after setting the file aside.
  void refreshTrackerData({ includeSessions: true });
}

// Main asks first (Cancel is the default) and clears the activity log and the error log together. The list empties
// through the audit-trail-updated event. A rejected call is reported like a failed clear, with a static text only.
async function handleClearLogs() {
  const button = elements.clearLogsBtn;
  setButtonBusy(button, true);
  let result = null;
  try {
    result = await window.electronAPI.clearLogs();
  } catch {
    result = { cleared: false };
  } finally {
    setButtonBusy(button, false);
    // The native confirm took focus away. It comes back before the toast, so moving it does not cut the toast off.
    button.focus();
  }

  if (result?.canceled) return;
  if (result?.busy) {
    showToast(window.t('toast.dataActionBusy'), '', 'warning');
    return;
  }
  // The logs may have changed, so no view keeps showing cleared lines; each builds its report again on its next visit.
  Object.values(bugReportViews).forEach((view) => {
    if (!view.preview) return;
    view.preview.textContent = '';
    view.reportId = null;
    view.openButton.disabled = true;
    view.copyButton.disabled = true;
  });
  if (result?.cleared) {
    showToast(window.t('toast.logsCleared'), '', 'success');
  } else {
    showToast(window.t('toast.logsClearFailedTitle'), window.t('toast.logsClearFailed'), 'error');
  }
  void loadDataSummary();
}

// The dialog gives focus back to the Data tab button, or to sign-in when a failed delete left the sign-in screen over it.
function getDeleteAllReturnFocus() {
  return elements.loginModal?.classList.contains('hidden') === false
    ? document.getElementById('poe-oauth-login')
    : elements.deleteAllBtn;
}

// Delete everything asks in the app's own dialog. Cancel has focus first and Delete everything stays disabled until the
// checkbox is ticked, so Enter alone never deletes. Resolves true with the dialog still open for the busy state, false
// once it closed and focus is back where the dialog was opened from.
function requestDeleteAllConfirmation() {
  const { deleteAllModal: modal, deleteAllAck: ack, deleteAllCancelBtn: cancel, deleteAllConfirmBtn: confirm } = elements;
  ack.checked = false;
  confirm.disabled = true;
  modal.classList.remove('hidden');
  cancel.focus();

  return new Promise((resolve) => {
    let settled = false;
    const handleAckChange = () => {
      // Unticking disables it again.
      confirm.disabled = !ack.checked;
    };
    const handleCancel = () => settle(false);
    const handleConfirm = () => {
      if (ack.checked) settle(true);
    };
    const handleBackdropClick = (event) => {
      if (event.target === modal) settle(false);
    };
    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        settle(false);
        return;
      }
      if (event.key !== 'Tab') return;
      // Tab moves through the enabled controls only and wraps, so focus never reaches the page behind the dialog.
      event.preventDefault();
      const controls = [ack, cancel, confirm].filter((control) => !control.disabled);
      const index = controls.indexOf(document.activeElement);
      const step = event.shiftKey ? -1 : 1;
      controls[index === -1 ? 0 : (index + step + controls.length) % controls.length].focus();
    };
    const settle = (confirmed) => {
      if (settled) return;
      settled = true;
      ack.removeEventListener('change', handleAckChange);
      cancel.removeEventListener('click', handleCancel);
      confirm.removeEventListener('click', handleConfirm);
      modal.removeEventListener('click', handleBackdropClick);
      document.removeEventListener('keydown', handleKeydown);
      if (!confirmed) {
        modal.classList.add('hidden');
        getDeleteAllReturnFocus()?.focus();
      }
      resolve(confirmed);
    };

    ack.addEventListener('change', handleAckChange);
    cancel.addEventListener('click', handleCancel);
    confirm.addEventListener('click', handleConfirm);
    modal.addEventListener('click', handleBackdropClick);
    document.addEventListener('keydown', handleKeydown);
  });
}

// Main signs out, deletes and restarts the app at the sign-in screen; the dialog stays busy until then. Otherwise main
// answers with a reason only, so every toast is a static text.
async function handleDeleteAllLocalData() {
  if (!(await requestDeleteAllConfirmation())) return;

  const {
    deleteAllModal: modal, deleteAllTitle: title, deleteAllAck: ack, deleteAllCancelBtn: cancel, deleteAllConfirmBtn: confirm
  } = elements;
  ack.disabled = true;
  cancel.disabled = true;
  setButtonBusy(confirm, true, window.t('settings.deleteAllRunning'));
  // With every control disabled, the title keeps focus in the dialog and Tab cannot leave it.
  const holdFocus = (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      title.focus();
    }
  };
  title.focus();
  document.addEventListener('keydown', holdFocus);
  announceStatus(window.t('settings.deleteAllRunning'));

  let result = null;
  try {
    result = await window.electronAPI.deleteAllLocalData();
  } catch {
    result = { deleted: false, reason: 'failed' };
  }
  if (result?.deleted) return;

  document.removeEventListener('keydown', holdFocus);
  setButtonBusy(confirm, false);
  ack.disabled = false;
  cancel.disabled = false;
  modal.classList.add('hidden');
  if (result?.reason === 'busy') {
    getDeleteAllReturnFocus()?.focus();
    showToast(window.t('toast.dataActionBusy'), '', 'warning');
    return;
  }

  // Main signed out before it deleted, so the window shows sign-in as after Sign out, but without a second sign-out
  // call: that would write a new entry into the activity log main just cleared. Only a sign-out that main reports as
  // failed, or a reply that never came, is tried again.
  clearActiveCharacterRefreshTimers();
  clearTimeout(characterReconcileTimer);
  if (!Array.isArray(result?.failed) || result.failed.includes('signOut')) {
    await window.electronAPI.logout().catch(() => { });
  }
  showSignedOutWindow();
  // Main reset the settings; the form still shows the old ones, and the next Save would write them back.
  await loadSettings();
  document.getElementById('poe-oauth-login')?.focus();
  // The Data tab is behind the sign-in screen now, so the toast tries again itself; the dialog opens over sign-in.
  showToast(window.t('toast.deleteAllFailedTitle'), window.t('toast.deleteAllFailed'), 'error', {
    action: { label: window.t('toast.deleteAllRetry'), onSelect: handleDeleteAllLocalData }
  });
}

// Main keeps only the report it built last, and Copy and the issue button send exactly that text, so the user sends
// what they saw. Loading one view therefore clears the other, whose text main no longer keeps.
async function loadBugReportPreview(view) {
  if (!view?.preview) return;

  Object.values(bugReportViews).forEach((other) => {
    if (other === view || !other.preview) return;
    other.preview.textContent = '';
    other.reportId = null;
    other.openButton.disabled = true;
    other.copyButton.disabled = true;
  });
  view.reportId = null;
  view.openButton.disabled = true;
  view.copyButton.disabled = true;
  view.preview.setAttribute('aria-busy', 'true');

  try {
    const { text, reportId } = await window.electronAPI.getBugReport();
    view.preview.textContent = text;
    view.reportId = reportId;
    view.openButton.disabled = false;
    view.copyButton.disabled = false;
  } catch {
    view.preview.textContent = window.t('settings.bugReportLoadFailed');
    // Focus may already sit on the preview, so a screen reader would not read the new text; the toast is announced.
    showToast(window.t('settings.bugReportLoadFailed'), window.t('toast.tryAgainShort'), 'error');
  } finally {
    view.preview.removeAttribute('aria-busy');
  }
}

async function handleCopyBugReport(view) {
  setButtonBusy(view.copyButton, true);
  let result = null;

  try {
    result = await window.electronAPI.copyBugReport(view.reportId);
    if (!result?.stale) {
      showToast(window.t('toast.bugReportCopied'), '', 'success');
    }
  } catch (error) {
    showToast(window.t('toast.bugReportCopyFailed'), getUserFacingErrorMessage(error, 'toast.tryAgainShort'), 'error');
  } finally {
    setButtonBusy(view.copyButton, false);
  }

  if (result?.stale) {
    // Main built a newer report since this view loaded, so nothing was copied: show it and let the user check it.
    showToast(window.t('toast.bugReportChanged'), window.t('toast.bugReportChangedHint'), 'warning');
    await loadBugReportPreview(view);
  }
}

async function handleOpenBugReportIssue(view) {
  setButtonBusy(view.openButton, true, window.t('settings.openingBugReportIssue'));
  let result = null;

  try {
    result = await window.electronAPI.openBugReportIssue(view.reportId);
    if (result?.opened === false) {
      // Copied, but no browser opened: the toast names the address instead.
      showToast(window.t('toast.bugReportCopied'), window.t('toast.bugReportOpenManually', { url: result.url }), 'warning');
    } else if (!result?.stale) {
      showToast(window.t('toast.bugReportCopied'), window.t('toast.bugReportIssueOpened'), 'success');
    }
  } catch (error) {
    showToast(window.t('toast.bugReportOpenFailed'), getUserFacingErrorMessage(error, 'toast.tryAgainShort'), 'error');
  } finally {
    setButtonBusy(view.openButton, false);
  }

  if (result?.stale) {
    // Nothing was copied or opened: the user checks the newer report before pressing again.
    showToast(window.t('toast.bugReportChanged'), window.t('toast.bugReportChangedHint'), 'warning');
    await loadBugReportPreview(view);
  }
}

// The login screen swaps its sign-in panel for the bug report in place; Back swaps it back.
function showLoginBugReport() {
  elements.loginSignInPanel?.classList.add('hidden');
  elements.loginBugReportPanel?.classList.remove('hidden');
  elements.loginBugReportPreview?.focus();
  void loadBugReportPreview(bugReportViews.login);
}

function showLoginSignIn({ restoreFocus = false } = {}) {
  elements.loginBugReportPanel?.classList.add('hidden');
  elements.loginSignInPanel?.classList.remove('hidden');
  if (restoreFocus) {
    elements.loginReportProblemBtn?.focus();
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

    // A failed sync may leave the last list, which can still price a snapshot.
    stashState.pricesSynced = result.itemCount > 0;
    renderPriceItemCount(result.itemCount);
    if (result.syncFailed) {
      showToast(window.t('stash.pricesSyncFailed'), window.t('toast.tryAgain'), 'error');
      return;
    }

    await refreshProfitCurrencyRates(result.poeVersion || state.settings.poeVersion || 'poe1', league);
    showToast(window.t('stash.pricesSyncedTitle'), window.t('stash.pricesSynced', { count: result.itemCount }), 'success');
  } catch (error) {
    showToast(window.t('stash.pricesSyncFailed'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
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
    showToast(window.t('stash.syncPricesFirst'), window.t('stash.syncPricesFirstHint'), 'warning');
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
      infoEl.textContent = `${window.t(result.itemCount === 1 ? 'dashboard.itemCountOne' : 'dashboard.itemCount', { count: result.itemCount })} · ${Math.round(result.totalChaos)}c`;
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

    showToast(window.t('stash.snapshotTakenTitle'), window.t('stash.snapshotTaken', { count: result.itemCount }), 'success');
  } catch (error) {
    showToast(window.t('stash.snapshotFailed'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
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
    renderProfitReport(report, { entryCostChaos: Number(stashState.lastMapResult?.entryCostChaos) || 0 });
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
        await completeCurrentSessionAfterStashProfit(stashState.lastMapResult, report);
      }
    }
  } catch (error) {
    showToast(window.t('stash.profitFailed'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
  } finally {
    elements.calculateProfitBtn.disabled = !isStashTrackingEnabled();
  }
}

function renderProfitReport(report, { entryCostChaos = 0 } = {}) {
  if (isStashTrackingUnavailable()) return;
  if (!elements.stashProfitResult) return;

  const { summary, gained, lost } = report;
  // The run's entry cost left before the stash was read, so it counts with the losses, as on the map result.
  const netProfitChaos = Number(summary.netProfitChaos || 0) - entryCostChaos;

  // Show result section
  elements.stashProfitResult.classList.remove('hidden');
  if (elements.calculateProfitBtn) {
    elements.calculateProfitBtn.classList.add('hidden');
  }

  // Main profit value
  if (elements.profitChaosValue) {
    const val = netProfitChaos;
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
    const divineValue = Number(summary.netProfitDivine || 0) - (Number(summary.divinePrice) > 0 ? entryCostChaos / Number(summary.divinePrice) : 0);
    elements.profitDivineValue.textContent = `${divineValue.toFixed(1)} div`;
  }

  if (elements.profitGainedValue) {
    elements.profitGainedValue.textContent = `+${Math.round(summary.totalGainedChaos)}c`;
  }

  if (elements.profitLostValue) {
    elements.profitLostValue.textContent = `-${Math.round(Number(summary.totalLostChaos || 0) + entryCostChaos)}c`;
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
    const val = netProfitChaos;
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
    indicator.innerHTML = `<span class="game-status-dot"></span> <span data-i18n="game.notRunning">${escapeHTML(window.t('game.notRunning'))}</span>`;
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
  clearLootArtMisses();
  await refreshProfitCurrencyRates(poeVersion || state.settings.poeVersion || 'poe1', league, { cacheOnly: true });
  renderLatestMapResult();
  renderMapResultHistory();
  renderSessionsList();
  updateActiveSessionUI();
  renderRecentLoot();
  if (state.selectedSession) {
    redrawSessionLoot();
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
  resetSessionLootEditing();
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
  // A Divine cost waits for a Divine price. A run that ended without one keeps a cost of 0 until it is set by hand,
  // so the Cost fact says what was left out.
  const pendingCostAmount = cost === 0 ? Number(session.costPending?.amount) : 0;
  const costNote = pendingCostAmount > 0
    ? `<span class="session-drawer-cost-note">${window.t(session.status === 'active' ? 'dashboard.costPendingDivine' : 'sessions.costNotCounted', {
      amount: escapeHTML(String(session.costPending.amount))
    })}</span>`
    : '';

  elements.sessionDrawerTitle.textContent = session.mapName || window.t('misc.unknownMap');
  elements.sessionDrawerLootCount.textContent = String(lootQuantity);
  // Only entries with an id can be edited; runs saved before ids existed keep their loot read-only. Every run's entry
  // cost can be changed, so Edit shows even for a run with no loot.
  const hasEditableLoot = lootEntries.some((loot) => loot.id);
  const canEdit = hasEditableLoot || Boolean(session.id);
  if (!canEdit) state.sessionLootEditing = false;
  const lootEditing = Boolean(state.sessionLootEditing);
  if (elements.sessionDrawerLootEdit) {
    // The label says what a click does next, so the button carries no pressed state as well.
    elements.sessionDrawerLootEdit.classList.toggle('hidden', !canEdit);
    elements.sessionDrawerLootEdit.textContent = window.t(lootEditing ? 'sessions.lootEditDone' : 'sessions.lootEdit');
  }
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
      ${fact('sessions.cost', lootEditing ? sessionCostEditHTML(session) : `${formatProfit(cost, 14, poeVersion, rateOptions)}${costNote}`)}
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

  // New items the inventory read could not name are not in the totals; Edit can add them.
  const unreadNote = session.lootUnread ? `<p class="session-drawer-loot-note">${window.t('sessions.lootUnread')}</p>` : '';
  const addRow = lootEditing ? sessionLootAddHTML() : '';
  if (!lootEntries.length) {
    elements.sessionDrawerLoot.innerHTML = `${unreadNote}${addRow}<p class="empty-state">${window.t('sessions.detailEmptyLoot')}</p>`;
    return;
  }

  elements.sessionDrawerLoot.innerHTML = unreadNote + addRow + sortSessionLoot(lootEntries)
    .map((loot) => {
      const quantity = parseInt(loot.quantity || 1, 10) || 1;
      const totalValue = (parseFloat(loot.chaosValue || 0) * quantity) || 0;
      const typeLabel = loot.itemType ? escapeHTML(loot.itemType.replace(/_/g, ' ')) : '-';
      const lootTier = typeof getProfitTierFor === 'function' ? getProfitTierFor(totalValue, poeVersion, rateOptions) : 'normal';
      // Escaped once here: the item name goes into the aria-labels through t() as well as into the row.
      const itemLabel = escapeHTML(loot.itemName || window.t('misc.unknownItem'));
      const lootIdAttr = loot.id ? ` data-loot-id="${escapeHTML(loot.id)}"` : '';
      const editable = lootEditing && Boolean(loot.id);
      const disabledAttr = editable && state.sessionLootBusyId === loot.id ? ' disabled' : '';
      const armed = editable && state.sessionLootArmedId === loot.id;
      const quantityInput = editable
        ? `<input type="number" class="session-drawer-loot-qty" min="1" max="1000000" step="1" inputmode="numeric" value="${quantity}"${lootIdAttr} aria-label="${window.t('sessions.lootQuantityAria', { item: itemLabel })}"${disabledAttr}>`
        : '';
      const removeButton = editable
        ? `<button type="button" class="btn-icon session-drawer-loot-remove${armed ? ' is-armed' : ''}"${lootIdAttr} aria-label="${window.t(armed ? 'sessions.lootRemoveConfirmAria' : 'sessions.lootRemoveAria', { item: itemLabel })}"${disabledAttr}>${armed ? window.t('sessions.lootRemoveConfirm') : '<svg class="icon" width="14" height="14" aria-hidden="true"><use href="assets/icons.svg#trash"/></svg>'}</button>`
        : '';
      return `
        <article class="session-drawer-loot-item"${lootIdAttr}>
          ${itemSlotHTML(loot.itemName, poeVersion, { small: true, quantity, fallback: 'empty', iconUrl: lootArtUrl(loot, poeVersion) })}
          <div class="session-drawer-loot-main">
            <span class="session-drawer-loot-name">${itemLabel}</span>
            <div class="session-drawer-loot-meta">${typeLabel} · ${loot.createdAt ? timeAgo(loot.createdAt) : '-'}</div>
          </div>
          ${quantityInput}
          <div class="session-drawer-loot-value" data-profit-tier="${lootTier}">${formatProfit(totalValue, 14, poeVersion, rateOptions)}</div>
          ${removeButton}
        </article>
      `;
    })
    .join('');
  applyCachedItemIcons(elements.sessionDrawerLoot);
  ensureLootArt(
    lootEntries.filter((loot) => !loot.icon).map((loot) => loot.itemName),
    poeVersion,
    // Through redrawSessionLoot, so the focus and what was typed in a quantity box survive.
    () => { if (state.selectedSession?.id === session.id) redrawSessionLoot(); }
  );
}

// Edit mode's row for an item the inventory read did not name. Names come from the run's league prices when they are
// loaded; any other name is kept, with no price.
function sessionLootAddHTML() {
  const draft = state.sessionLootAddDraft || { name: '', quantity: '1' };
  const disabledAttr = state.sessionLootAddBusy ? ' disabled' : '';
  const options = (state.sessionLootAddSuggestions || []).map((name) => `<option value="${escapeHTML(name)}"></option>`).join('');
  const error = state.sessionLootAddError
    ? `<p class="session-drawer-loot-add-error" role="alert">${window.t(state.sessionLootAddError)}</p>`
    : '';
  return `<form class="session-drawer-loot-add" data-session-loot-add novalidate>
      <input type="text" name="itemName" class="session-drawer-loot-add-name" list="session-drawer-loot-add-options" maxlength="200" autocomplete="off" placeholder="${window.t('sessions.lootAddName')}" aria-label="${window.t('sessions.lootAddNameAria')}" value="${escapeHTML(draft.name)}"${disabledAttr}>
      <datalist id="session-drawer-loot-add-options">${options}</datalist>
      <input type="number" name="quantity" class="session-drawer-loot-add-qty" min="1" max="1000000" step="1" inputmode="numeric" aria-label="${window.t('sessions.lootAddQtyAria')}" value="${escapeHTML(draft.quantity)}"${disabledAttr}>
      <button type="submit" class="btn btn-secondary btn-small"${disabledAttr}>${window.t('sessions.lootAdd')}</button>
    </form>${error}`;
}

let sessionLootSuggestTimer = null;

// What is typed survives a redraw, and the name box asks the run's league prices for matches.
function handleSessionLootAddInput(event) {
  const form = event.target?.closest?.('[data-session-loot-add]');
  if (!form) return;
  state.sessionLootAddDraft = { name: form.elements.itemName.value, quantity: form.elements.quantity.value };
  if (event.target.name !== 'itemName') return;
  clearTimeout(sessionLootSuggestTimer);
  const session = state.selectedSession;
  const search = form.elements.itemName.value.trim();
  const showSuggestions = (names) => {
    state.sessionLootAddSuggestions = names;
    const list = document.getElementById('session-drawer-loot-add-options');
    if (list) list.innerHTML = names.map((name) => `<option value="${escapeHTML(name)}"></option>`).join('');
  };
  if (!session || search.length < 2 || !window.electronAPI?.getCurrencyPrices) {
    showSuggestions([]);
    return;
  }
  sessionLootSuggestTimer = setTimeout(async () => {
    // cacheOnly: another league's list is never loaded for this, since live tracking reads the loaded one.
    const result = await window.electronAPI.getCurrencyPrices({
      poeVersion: session.poeVersion, league: session.league, search, limit: 8, cacheOnly: true
    }).catch(() => null);
    // A newer search, or another run, answers for itself.
    if (state.selectedSession?.id !== session.id || form.elements.itemName.value.trim() !== search) return;
    showSuggestions((result?.prices || []).map((price) => price.itemName));
  }, 150);
}

async function handleSessionLootAddSubmit(event) {
  const form = event.target?.closest?.('[data-session-loot-add]');
  if (!form) return;
  event.preventDefault();
  const session = state.selectedSession;
  if (!session?.id || state.sessionLootAddBusy) return;
  const itemName = form.elements.itemName.value.trim();
  const quantity = parseSessionLootQuantity(form.elements.quantity.value);
  if (!itemName || quantity === null) {
    state.sessionLootAddError = 'sessions.lootAddInvalid';
    redrawSessionLoot({ kind: itemName ? 'addQty' : 'addName' });
    return;
  }

  state.sessionLootAddBusy = true;
  state.sessionLootAddError = null;
  let added = null;
  try {
    const updated = await window.electronAPI.addSessionLoot(session.id, { itemName, quantity });
    if (state.selectedSession?.id === session.id) state.selectedSession = updated;
    if (state.currentSession?.id === updated.id) {
      state.currentSession = { ...state.currentSession, ...updated };
      updateActiveSessionUI();
    }
    added = (updated.lootEntries || [])[0] || null;
    state.sessionLootAddDraft = { name: '', quantity: '1' };
  } catch (error) {
    state.sessionLootAddError = 'toast.lootAddError';
  } finally {
    state.sessionLootAddBusy = false;
  }

  redrawSessionLoot({ kind: 'addName' });
  if (!added) return;
  announceStatus(window.t(Number(added.chaosValue) > 0 ? 'sessions.lootAdded' : 'sessions.lootAddedNoPrice', { item: itemName }));
  await refreshTrackerData({ includeSessions: true, immediate: true });
}

function sortSessionLoot(lootEntries) {
  return lootEntries.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function clearSessionLootArm() {
  clearTimeout(state.sessionLootArmTimer);
  state.sessionLootArmTimer = null;
  state.sessionLootArmedId = null;
}

function resetSessionLootEditing() {
  clearSessionLootArm();
  state.sessionLootEditing = false;
  state.sessionLootBusyId = null;
  state.sessionCostUnit = 'chaos';
  state.sessionLootAddDraft = { name: '', quantity: '1' };
  state.sessionLootAddSuggestions = [];
  state.sessionLootAddError = null;
}

// A redraw replaces the rows, so the control the player was on is found again by its loot id. A box keeps what was
// typed in it, as a price update can redraw while the player types.
function getFocusedSessionLootControl(node = document.activeElement) {
  // The cost boxes sit in the summary, above the rows.
  if (node && elements.sessionDrawerSummary?.contains?.(node)) {
    if (node.classList.contains('session-drawer-cost-input')) return { kind: 'cost', value: node.value };
    if (node.classList.contains('session-drawer-cost-unit')) return { kind: 'costUnit' };
  }
  if (node && elements.sessionDrawerLoot.contains(node) && node.closest?.('[data-session-loot-add]')) {
    return { kind: node.name === 'quantity' ? 'addQty' : 'addName' };
  }
  if (!node || !elements.sessionDrawerLoot.contains(node) || !node.dataset?.lootId) return null;
  return node.classList.contains('session-drawer-loot-remove')
    ? { kind: 'remove', lootId: node.dataset.lootId }
    : { kind: 'qty', lootId: node.dataset.lootId, value: node.value };
}

function focusSessionLootControl(target) {
  if (!target) return;
  let node = null;
  if (target.kind === 'cost' || target.kind === 'costUnit') {
    node = elements.sessionDrawerSummary.querySelector(target.kind === 'cost' ? '.session-drawer-cost-input' : '.session-drawer-cost-unit');
  } else if (target.kind === 'addName' || target.kind === 'addQty') {
    node = elements.sessionDrawerLoot.querySelector(`[data-session-loot-add] [name="${target.kind === 'addQty' ? 'quantity' : 'itemName'}"]`);
  } else if (target.kind === 'toggle') {
    // With no editable entry left the toggle is hidden, so focus goes to the drawer's close button.
    node = elements.sessionDrawerLootEdit?.classList.contains('hidden') ? elements.sessionDrawerClose : elements.sessionDrawerLootEdit;
  } else {
    const selector = target.kind === 'remove' ? '.session-drawer-loot-remove' : '.session-drawer-loot-qty';
    node = [...elements.sessionDrawerLoot.querySelectorAll(selector)].find((control) => control.dataset.lootId === target.lootId);
  }
  if (!node) return;
  if ((target.kind === 'qty' || target.kind === 'cost') && target.value !== undefined) node.value = target.value;
  if (!node.disabled) node.focus();
}

// Locks one row while main writes it. The rows stay in place, so a click on another row still lands.
function lockSessionLootRow(lootId) {
  for (const selector of ['.session-drawer-loot-qty', '.session-drawer-loot-remove']) {
    elements.sessionDrawerLoot.querySelectorAll(selector).forEach((control) => {
      if (control.dataset.lootId === lootId) control.disabled = true;
    });
  }
}

function redrawSessionLoot(focus = getFocusedSessionLootControl()) {
  // Chromium fires focusout on a focused box the rebuild removes; that is not the player committing it.
  state.sessionLootRedrawing = true;
  try {
    renderSessionDrawer({ keepForm: true });
  } finally {
    state.sessionLootRedrawing = false;
  }
  focusSessionLootControl(focus);
}

function parseSessionLootQuantity(value) {
  const text = String(value ?? '').trim();
  if (!/^\d+$/.test(text)) return null;
  const quantity = Number(text);
  return quantity >= 1 && quantity <= 1000000 ? quantity : null;
}

function handleSessionLootEditToggle() {
  state.sessionLootEditing = !state.sessionLootEditing;
  clearSessionLootArm();
  redrawSessionLoot();
}

// Escape first backs out of an armed remove; only then does it close the drawer.
function handleSessionDrawerKeydown(event) {
  if (event.key !== 'Escape' || !state.selectedSession) return;
  if (state.sessionLootArmedId) {
    clearSessionLootArm();
    redrawSessionLoot();
    return;
  }
  closeSessionDrawer();
}

function armSessionLootRemove(lootId) {
  clearSessionLootArm();
  state.sessionLootArmedId = lootId;
  // The second click has four seconds; after that the row goes back to its trash icon.
  state.sessionLootArmTimer = setTimeout(() => {
    state.sessionLootArmTimer = null;
    if (state.sessionLootArmedId !== lootId) return;
    state.sessionLootArmedId = null;
    redrawSessionLoot();
  }, 4000);
  redrawSessionLoot({ kind: 'remove', lootId });
}

function handleSessionLootClick(event) {
  const button = event.target?.closest?.('.session-drawer-loot-remove');
  const lootId = button?.dataset?.lootId;
  // While another row saves, the click waits: the row stays armed for a second click once that save is done.
  if (!lootId || button.disabled || state.sessionLootBusyId) return;
  if (state.sessionLootArmedId !== lootId) {
    armSessionLootRemove(lootId);
    return;
  }
  clearSessionLootArm();
  changeSessionLoot(lootId, { remove: true });
}

// A box commits on Enter or when focus leaves it, not on each arrow-key step.
function handleSessionLootKeydown(event) {
  if (event.key !== 'Enter' || !event.target?.closest?.('.session-drawer-loot-qty')) return;
  event.preventDefault();
  handleSessionLootChange(event);
}

function handleSessionLootChange(event) {
  const input = event.target?.closest?.('.session-drawer-loot-qty');
  const lootId = input?.dataset?.lootId;
  // The row being saved locks its box, and that can move focus out of it; that is not a new commit. Nor is a rebuild.
  if (!lootId || lootId === state.sessionLootBusyId || (event.type === 'focusout' && state.sessionLootRedrawing)) return;
  const entry = (state.selectedSession?.lootEntries || []).find((loot) => loot.id === lootId);
  const oldQuantity = parseInt(entry?.quantity || 1, 10) || 1;
  const quantity = parseSessionLootQuantity(input.value);
  // While another row saves, this one cannot, so it shows its stored quantity again rather than an unsaved one.
  if (quantity === null || quantity === oldQuantity || state.sessionLootBusyId) {
    input.value = String(oldQuantity);
    return;
  }
  // Focus leaving a box commits it; the control focus moved to gets it back once the rows are redrawn.
  const focus = getFocusedSessionLootControl(event.type === 'focusout' ? event.relatedTarget : input);
  changeSessionLoot(lootId, { quantity }, focus);
}

async function changeSessionLoot(lootId, { quantity, remove = false } = {}, focusBefore = getFocusedSessionLootControl()) {
  const session = state.selectedSession;
  if (!session?.id || state.sessionLootBusyId || state.sessionCostBusy) return;

  const entries = Array.isArray(session.lootEntries) ? session.lootEntries : [];
  const item = entries.find((loot) => loot.id === lootId)?.itemName || window.t('misc.unknownItem');

  clearSessionLootArm();
  state.sessionLootBusyId = lootId;
  lockSessionLootRow(lootId);

  let succeeded = false;
  try {
    const updated = remove
      ? await window.electronAPI.deleteLoot(session.id, lootId)
      : await window.electronAPI.updateLoot(session.id, lootId, { quantity });
    succeeded = true;
    // The player may have opened another run while main was writing.
    if (state.selectedSession?.id === session.id) state.selectedSession = updated;
  } catch (error) {
    showToast(window.t('toast.lootUpdateError'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
  } finally {
    state.sessionLootBusyId = null;
  }

  // Focus goes back to where the player has it now, or had it when this started.
  let focus = getFocusedSessionLootControl() || focusBefore;
  if (succeeded && remove && (!focus || focus.lootId === lootId)) {
    // The row is gone: focus moves to the next row's remove button, else the previous one's, else the toggle.
    const ids = sortSessionLoot(entries).filter((loot) => loot.id).map((loot) => loot.id);
    const index = ids.indexOf(lootId);
    const neighbour = ids[index + 1] || ids[index - 1];
    focus = neighbour ? { kind: 'remove', lootId: neighbour } : { kind: 'toggle' };
  } else if (!succeeded && focus?.lootId === lootId) {
    // A failed change shows the stored values again, so the box drops what was typed.
    focus = { kind: focus.kind, lootId };
  }
  redrawSessionLoot(focus);
  if (!succeeded) return;

  announceStatus(remove
    ? window.t('sessions.lootRemoved', { item })
    : window.t('sessions.lootQuantityChanged', { item, count: quantity }));
  await refreshTrackerData({ includeSessions: true, immediate: true });
}

// The Divine rate a run's cost converts with; null while it is unknown, which hides the Divine option.
function getSessionCostDivineRate(session) {
  const rates = typeof getProfitCurrencyRates === 'function'
    ? getProfitCurrencyRates(session.poeVersion || state.settings.poeVersion || 'poe1', session.league)
    : null;
  const rate = Number(rates?.divineChaos);
  return rate > 0 ? rate : null;
}

// The Cost fact in Edit mode: an amount and its unit. The box keeps the text it was drawn with, so an untouched box
// is told from an edited one even when a Divine amount does not round-trip exactly.
function sessionCostEditHTML(session) {
  const cost = parseFloat(session.costChaos || 0) || 0;
  const rate = getSessionCostDivineRate(session);
  const unit = rate && state.sessionCostUnit === 'divine' ? 'divine' : 'chaos';
  const text = String(Number((unit === 'divine' ? cost / rate : cost).toFixed(unit === 'divine' ? 4 : 2)));
  const disabledAttr = state.sessionCostBusy ? ' disabled' : '';
  const option = (value, name) => `<option value="${value}"${value === unit ? ' selected' : ''}>${name}</option>`;
  return `<span class="session-drawer-cost-edit"><input type="text" class="session-drawer-cost-input" inputmode="decimal" autocomplete="off" maxlength="12" value="${text}" data-baseline="${text}" data-unit="${unit}" aria-label="${window.t('sessions.costAria')}"${disabledAttr}><select class="session-drawer-cost-unit" aria-label="${window.t('sessions.costUnitAria')}"${disabledAttr}>${option('chaos', 'Chaos Orb')}${rate ? option('divine', 'Divine Orb') : ''}</select></span>`;
}

function getSessionCostControls() {
  const summary = elements.sessionDrawerSummary;
  return {
    input: summary?.querySelector?.('.session-drawer-cost-input'),
    unit: summary?.querySelector?.('.session-drawer-cost-unit')
  };
}

// Like the loot quantity box, the cost commits on Enter or when focus leaves it, not on each keystroke.
function handleSessionCostKeydown(event) {
  if (event.key !== 'Enter' || !event.target?.closest?.('.session-drawer-cost-input')) return;
  event.preventDefault();
  handleSessionCostChange(event);
}

function handleSessionCostChange(event) {
  if (!event.target?.closest?.('.session-drawer-cost-input, .session-drawer-cost-unit')) return;
  const { input, unit } = getSessionCostControls();
  const session = state.selectedSession;
  if (!input || !unit || !session?.id) return;
  // A running save locks the boxes, which can move focus out of them, and a rebuild fires focusout too. Neither is a commit.
  if (state.sessionCostBusy || (event.type === 'focusout' && state.sessionLootRedrawing)) return;
  // Moving between the amount and its unit is not leaving the cost.
  if (event.type === 'focusout' && (event.relatedTarget === input || event.relatedTarget === unit)) return;

  const rate = getSessionCostDivineRate(session);
  const unitName = unit.value === 'divine' && rate ? 'divine' : 'chaos';
  const factor = unitName === 'divine' ? rate : 1;
  // 10000000 chaos is the largest cost main accepts.
  const amount = parseCostAmount(input.value, 10000000 / factor);
  const costChaos = amount === null ? null : Math.round(amount * factor * 100) / 100;
  const untouched = input.value.trim() === input.dataset.baseline && unitName === input.dataset.unit;
  // While a loot row saves, a cost cannot, so the box shows its stored cost again.
  if (costChaos === null || untouched || state.sessionLootBusyId
    || Math.abs(costChaos - (parseFloat(session.costChaos || 0) || 0)) < 0.005) {
    input.value = input.dataset.baseline;
    unit.value = input.dataset.unit;
    return;
  }
  // Focus leaving a box commits it; the control focus moved to gets it back once the drawer is redrawn.
  const focus = getFocusedSessionLootControl(event.type === 'focusout' ? event.relatedTarget : event.target);
  changeSessionCost(costChaos, focus);
}

// With the box untouched the unit switch shows the same cost in the other unit; with typed text the text stays and
// reads in the new unit when it commits.
function handleSessionCostUnitChange(event) {
  if (!event.target?.closest?.('.session-drawer-cost-unit')) return;
  const { input, unit } = getSessionCostControls();
  state.sessionCostUnit = unit.value === 'divine' ? 'divine' : 'chaos';
  if (input && input.value.trim() === input.dataset.baseline) redrawSessionLoot({ kind: 'costUnit' });
}

async function changeSessionCost(costChaos, focusBefore = getFocusedSessionLootControl()) {
  const session = state.selectedSession;
  if (!session?.id || state.sessionCostBusy || state.sessionLootBusyId) return;

  state.sessionCostBusy = true;
  const { input, unit } = getSessionCostControls();
  if (input) input.disabled = true;
  if (unit) unit.disabled = true;

  let updated = null;
  try {
    updated = await window.electronAPI.updateSessionCost(session.id, costChaos);
    // The player may have opened another run while main was writing.
    if (state.selectedSession?.id === session.id) state.selectedSession = updated;
    if (state.currentSession?.id === updated.id) {
      state.currentSession = { ...state.currentSession, ...updated };
      if (typeof updateActiveSessionUI === 'function') updateActiveSessionUI();
    }
  } catch (error) {
    showToast(window.t('toast.costUpdateError'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
  } finally {
    state.sessionCostBusy = false;
  }

  // The box shows the stored cost again, so it drops what was typed, whether the save worked or not.
  let focus = getFocusedSessionLootControl() || focusBefore;
  if (focus?.kind === 'cost') focus = { kind: 'cost' };
  redrawSessionLoot(focus);
  if (!updated) return;

  announceStatus(window.t('sessions.costChanged', {
    cost: typeof formatAdaptiveProfitText === 'function'
      ? formatAdaptiveProfitText(costChaos, session.poeVersion, { league: session.league })
      : String(costChaos)
  }));
  await refreshTrackerData({ includeSessions: true, immediate: true });
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
    markButtonSaved(elements.sessionDrawerSave);
  } catch (error) {
    showToast(window.t('toast.sessionUpdateError'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
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

// Category art is game content: a tab shows its own bundled category art (one item of the category; every divination
// card shares one inventory icon), never a stand-in orb. Tabs that are no game category, or whose category has no
// current art, show one of our line icons instead (`glyph`). Currency keeps the real Chaos Orb.

// PoE 1 item category types — includes PoE1-exclusive mechanics
const POE1_CATEGORY_TYPES = [
  { value: '', labelKey: 'category.all', label: 'All', icon: null, glyph: 'layers' },
  { value: 'currency', labelKey: 'category.currency', label: 'Currency', icon: 'chaos' },
  { value: 'fragment', labelKey: 'category.fragment', label: 'Fragment', icon: 'fragment' },
  { value: 'scarab', labelKey: 'category.scarab', label: 'Scarab', icon: 'scarab' },
  { value: 'essence', labelKey: 'category.essence', label: 'Essence', icon: 'essence' },
  { value: 'fossil', labelKey: 'category.fossil', label: 'Fossil', icon: 'fossil' },
  { value: 'map', labelKey: 'category.map', label: 'Map', icon: 'map' },
  { value: 'divination_card', labelKey: 'category.divCard', label: 'Div Card', icon: 'divination-card' },
  { value: 'gem', labelKey: 'category.gem', label: 'Gem', icon: 'gem' },
  { value: 'unique', labelKey: 'category.unique', label: 'Unique', icon: 'unique' },
  { value: 'oil', labelKey: 'category.oil', label: 'Oil', icon: 'oil' },
  { value: 'beast', labelKey: 'category.beast', label: 'Beast', icon: 'beast' },
  { value: 'incubator', labelKey: 'category.incubator', label: 'Incubator', icon: null, glyph: 'chest' },
  { value: 'delirium_orb', labelKey: 'category.deliriumOrb', label: 'Delirium Orb', icon: 'delirium-orb' },
  { value: 'catalyst', labelKey: 'category.catalyst', label: 'Catalyst', icon: 'catalyst' },
  { value: 'omen', labelKey: 'category.omen', label: 'Omen', icon: 'omen' },
  { value: 'tattoo', labelKey: 'category.tattoo', label: 'Tattoo', icon: 'tattoo' },
  { value: 'rune', labelKey: 'category.runegraft', label: 'Runegraft', icon: null, glyph: 'chest' },
  { value: 'base_type', labelKey: 'category.baseType', label: 'Base Type', icon: null, glyph: 'chest' },
  { value: 'other', labelKey: 'category.other', label: 'Other', icon: null, glyph: 'chest' },
];

// PoE 2 item category types — exchange API categories
const POE2_CATEGORY_TYPES = [
  { value: '', labelKey: 'category.all', label: 'All', icon: null, glyph: 'layers' },
  { value: 'currency', labelKey: 'category.currency', label: 'Currency', icon: 'chaos' },
  { value: 'fragment', labelKey: 'category.fragment', label: 'Fragment', icon: 'fragment' },
  { value: 'essence', labelKey: 'category.essence', label: 'Essence', icon: 'essence' },
  { value: 'rune', labelKey: 'category.rune', label: 'Rune', icon: 'rune' },
  { value: 'gem', labelKey: 'category.gem', label: 'Gem', icon: 'uncut-gem' },
  { value: 'soul_core', labelKey: 'category.soulCore', label: 'Soul Core', icon: 'soul-core' },
  { value: 'idol', labelKey: 'category.idol', label: 'Idol', icon: 'idol' },
  { value: 'expedition', labelKey: 'category.expedition', label: 'Expedition', icon: 'expedition' },
  { value: 'omen', labelKey: 'category.omen', label: 'Omen', icon: 'omen' },
  { value: 'abyssal_bone', labelKey: 'category.abyssalBone', label: 'Abyssal Bone', icon: 'abyssal-bone' },
  { value: 'catalyst', labelKey: 'category.catalyst', label: 'Catalyst', icon: 'catalyst' },
  { value: 'liquid_emotion', labelKey: 'category.liquidEmotion', label: 'Liquid Emotion', icon: 'liquid-emotion' },
  { value: 'verisium', labelKey: 'category.verisium', label: 'Verisium', icon: 'verisium' },
  { value: 'ultimatum', labelKey: 'category.ultimatum', label: 'Ultimatum', icon: null, glyph: 'chest' },
  { value: 'vaal', labelKey: 'category.vaal', label: 'Vaal', icon: null, glyph: 'chest' },
  { value: 'other', labelKey: 'category.other', label: 'Other', icon: null, glyph: 'chest' },
];

// Our line icons for tabs without game art, and for a price row with no art at all.
const CURRENCY_TAB_GLYPH_SVG = {
  layers: '<svg class="icon" width="12" height="12" aria-hidden="true"><use href="assets/icons.svg#layers"/></svg>',
  chest: '<svg class="icon" width="12" height="12" aria-hidden="true"><use href="assets/icons.svg#chest"/></svg>'
};
const CURRENCY_ROW_CHEST_SVG = '<svg class="icon" width="16" height="16" aria-hidden="true"><use href="assets/icons.svg#chest"/></svg>';
const PRICE_CHANGE_ARROW_SVG = {
  up: '<svg class="icon" width="10" height="10" aria-hidden="true"><use href="assets/icons.svg#arrow-up"/></svg>',
  down: '<svg class="icon" width="10" height="10" aria-hidden="true"><use href="assets/icons.svg#arrow-down"/></svg>'
};

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
  // What main says around the list: matches before the 500 limit, prices per item type (null until a list loads),
  // the item types its last sync read, and when that sync ran.
  total: 0,
  typeCounts: null,
  syncedTypes: [],
  updatedAt: null,
  // The error of a failed load, which the table shows with Retry until a load works. Kept as the error, so its
  // message follows a language switch.
  loadError: null,
  // The lowercased name of the row whose detail is open.
  expandedKey: null,
  syncing: false,
  searchTimer: null,
  // Whether the rows are the list kept from the last sync while main syncs the real one; bumping the turn drops a kept
  // list that is still on its way.
  lastKnown: false,
  lastKnownTurn: 0,
  // Whether the rows are that kept list because poe.ninja gave nothing, so no sync is coming.
  unreachable: false,
  // The signature of the list the rows show, '' when they show none.
  renderedList: '',
  // The listed prices in table order. A long list holds only some of them as rows: rowWindow is { start, end, rows, top,
  // bottom } (the rows by list index and the two spacers), null when every price has its row.
  sorted: [],
  rowWindow: null,
  rowHeight: 47,
  detailHeight: 0
};

function getCurrencyCategoryList(poeVersion = currencyState.poeVersion) {
  return poeVersion === 'poe2' ? POE2_CATEGORY_TYPES : POE1_CATEGORY_TYPES;
}

// A price's item type in words: the game's own tab label (one 'rune' type is Runegraft in PoE 1 and Rune in PoE 2), else
// the other game's, else the type spelled out. Never the raw snake_case key.
function getCurrencyTypeLabel(itemType, poeVersion = currencyState.poeVersion) {
  const otherVersion = poeVersion === 'poe2' ? 'poe1' : 'poe2';
  const category = [...getCurrencyCategoryList(poeVersion), ...getCurrencyCategoryList(otherVersion)]
    .find((entry) => entry.value && entry.value === itemType);
  if (category) {
    return window.t(category.labelKey) || category.label;
  }
  return formatLootCategoryLabel(itemType);
}

// The bundled art of a price's category, for a price without its own. Currency gives none: its Chaos Orb would read as
// the item's own art next to a chaos value.
function getCurrencyCategoryArt(itemType, poeVersion = currencyState.poeVersion) {
  const category = getCurrencyCategoryList(poeVersion).find((entry) => entry.value && entry.value === itemType);
  return category?.icon && category.value !== 'currency' ? getCurrencyAssetPath(category.icon, poeVersion) : '';
}

// A price row's art, in order: the item's own (poe.ninja's CDN art, through the icon cache), its category's bundled
// art, then our chest icon.
function resolveCurrencyRowArt(item, poeVersion = currencyState.poeVersion) {
  return {
    remote: normalizeSafeImageSrc(item?.iconUrl),
    bundled: getCurrencyCategoryArt(item?.itemType, poeVersion)
  };
}

// An item slot for a price. Art that fails to load gives way to the next art in line. The name sits next to the slot,
// so the art is decorative.
function createCurrencyItemSlot(item, poeVersion = currencyState.poeVersion, extraClass = '') {
  const slot = document.createElement('span');
  slot.className = extraClass ? `item-slot ${extraClass}` : 'item-slot';
  const { remote, bundled } = resolveCurrencyRowArt(item, poeVersion);
  const showChest = () => {
    slot.replaceChildren();
    slot.insertAdjacentHTML('afterbegin', CURRENCY_ROW_CHEST_SVG);
  };
  if (!remote && !bundled) {
    showChest();
    return slot;
  }

  const img = document.createElement('img');
  img.alt = '';
  img.draggable = false;
  img.loading = 'lazy';
  if (remote) {
    // applyCachedItemIcons points it at the icon-cache copy or the remote art.
    img.dataset.iconUrl = remote;
  } else {
    img.src = bundled;
  }
  img.addEventListener('error', () => {
    if (remote && bundled && !img.dataset.fallback) {
      img.dataset.fallback = 'bundled';
      img.src = bundled;
    } else {
      showChest();
    }
  });
  slot.appendChild(img);
  return slot;
}

function updateTypeFilterDropdown() {
  const container = document.getElementById('currency-type-filter');
  if (!container) return;
  const types = getCurrencyCategoryList(currencyState.poeVersion);

  // If current type doesn't exist in new version, reset
  if (!types.find(t => t.value === currencyState.type)) {
    currencyState.type = '';
  }

  container.innerHTML = types.map(t => {
    const active = currencyState.type === t.value;
    const label = window.t ? (window.t(t.labelKey) || t.label) : t.label;
    // The art sits next to its label, so it is decorative.
    const art = t.icon
      ? `<img src="${getCurrencyAssetPath(t.icon, currencyState.poeVersion)}" alt="" draggable="false">`
      : CURRENCY_TAB_GLYPH_SVG[t.glyph] || '';
    return `<button type="button" class="currency-type-btn${active ? ' active' : ''}" data-type="${t.value}" aria-pressed="${active}" title="${label}">`
      + `<span class="item-slot currency-tab-slot">${art}</span>`
      + `<span class="currency-tab-label">${label}</span><span class="currency-tab-count"></span></button>`;
  }).join('');

  // Bind click events
  container.querySelectorAll('.currency-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.currency-type-btn').forEach(b => setToggleButtonPressed(b, b === btn));
      currencyState.type = btn.dataset.type;
      loadCurrencyPrices();
    });
  });
  updateCurrencyTypeCounts();
}

// Each tab counts its prices in the listed league. A tab with none is dimmed but still opens its empty state.
function updateCurrencyTypeCounts() {
  const container = document.getElementById('currency-type-filter');
  if (!container) return;
  const counts = currencyState.typeCounts;
  const total = counts ? Object.values(counts).reduce((sum, count) => sum + (Number(count) || 0), 0) : 0;
  container.querySelectorAll('.currency-type-btn').forEach((btn) => {
    const count = btn.dataset.type ? (Number(counts?.[btn.dataset.type]) || 0) : total;
    const countElement = btn.querySelector('.currency-tab-count');
    if (countElement) countElement.textContent = counts ? count.toLocaleString('en-US') : '';
    btn.classList.toggle('currency-type-btn--empty', Boolean(counts) && count === 0);
  });
}

// The sorted header says so with aria-sort; the others carry none.
function updateCurrencySortHeaders() {
  document.querySelectorAll('.currency-table th[data-sort]').forEach((th) => {
    const active = th.dataset.sort === currencyState.sortField;
    th.classList.toggle('active', active);
    th.classList.toggle('asc', active && currencyState.sortDir === 'asc');
    if (active) {
      th.setAttribute('aria-sort', currencyState.sortDir === 'asc' ? 'ascending' : 'descending');
    } else {
      th.removeAttribute('aria-sort');
    }
  });
}

function clearCurrencySearch() {
  const searchInput = document.getElementById('currency-search');
  clearTimeout(currencyState.searchTimer);
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
  const clearButton = document.getElementById('currency-search-clear');
  if (clearButton) clearButton.hidden = true;
  currencyState.search = '';
  loadCurrencyPrices();
}

// Lists another game. Its league comes from its league list, so the prices wait for that list: asked for sooner, main
// would answer for its stored league while the page names the first active one. The still rows show from the start, and
// an answer for the game left behind no longer counts.
async function switchCurrencyGame(poeVersion) {
  currencyState.poeVersion = poeVersion;
  currencyState.league = '';
  currencyState.type = '';
  currencyState.typeCounts = null;
  currencyState.pricesRequest += 1;
  currencyState.lastKnown = false;
  currencyState.unreachable = false;
  updateTypeFilterDropdown();
  showCurrencyLoadingRows();
  // The league select still lists the game left behind, so neither control can name a league until the list answers.
  const syncBtn = document.getElementById('currency-sync-btn');
  const leagueSelect = document.getElementById('currency-league');
  if (syncBtn) syncBtn.disabled = true;
  if (leagueSelect) leagueSelect.disabled = true;
  await loadCurrencyLeagues();
  if (currencyState.poeVersion === poeVersion) {
    if (syncBtn) syncBtn.disabled = currencyState.syncing || !canCurrentUserSyncPrices();
    if (leagueSelect) leagueSelect.disabled = false;
    await loadCurrencyPrices();
  }
}

function setupCurrencyListeners() {
  // A long list draws the rows near the screen as the page moves.
  let rowWindowFrame = null;
  const scheduleRowWindow = () => {
    if (rowWindowFrame !== null || !currencyState.rowWindow) return;
    rowWindowFrame = requestAnimationFrame(() => {
      rowWindowFrame = null;
      syncCurrencyRowWindow();
    });
  };
  window.addEventListener('scroll', scheduleRowWindow, { passive: true });
  window.addEventListener('resize', scheduleRowWindow);

  // PoE version toggle
  document.querySelectorAll('.poe-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.poe-toggle-btn').forEach(b => setToggleButtonPressed(b, b === btn));
      switchCurrencyGame(btn.dataset.poe);
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

  // Search, with a clear button while it holds text
  const searchInput = document.getElementById('currency-search');
  const clearButton = document.getElementById('currency-search-clear');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (clearButton) clearButton.hidden = !searchInput.value;
      clearTimeout(currencyState.searchTimer);
      currencyState.searchTimer = setTimeout(() => {
        currencyState.search = searchInput.value;
        loadCurrencyPrices();
      }, 300);
    });
  }
  if (clearButton) {
    clearButton.addEventListener('click', clearCurrencySearch);
  }

  // Sync button
  const syncBtn = document.getElementById('currency-sync-btn');
  if (syncBtn) {
    syncBtn.addEventListener('click', handleCurrencySync);
  }

  // Sort headers
  document.querySelectorAll('.currency-table th[data-sort]').forEach(th => {
    th.querySelector('.currency-sort')?.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (currencyState.sortField === field) {
        currencyState.sortDir = currencyState.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        currencyState.sortField = field;
        currencyState.sortDir = 'desc';
      }
      updateCurrencySortHeaders();
      renderCurrencyTable();
    });
  });
}

async function loadCurrencyPage() {
  const settingsGame = state.settings.poeVersion || 'poe1';
  // Another game's league must not pair with this game while the league list loads.
  if (currencyState.poeVersion !== settingsGame) currencyState.league = '';
  currencyState.poeVersion = settingsGame;
  document.querySelectorAll('.poe-toggle-btn').forEach((btn) => {
    setToggleButtonPressed(btn, btn.dataset.poe === currencyState.poeVersion);
  });
  updateTypeFilterDropdown();
  updateCurrencySortHeaders();
  const { poeVersion } = currencyState;
  // The league list may wait for poe.ninja, so a game with no rows yet says so at once.
  if (!String(currencyState.listedKey || '').startsWith(`${poeVersion}:`)) {
    showCurrencyLoadingRows();
  }
  syncCurrencyRowWindow();
  await loadCurrencyLeagues();
  if (currencyState.poeVersion === poeVersion) {
    await loadCurrencyPrices();
  }

  const syncBtn = document.getElementById('currency-sync-btn');
  if (syncBtn) {
    // A sync started on an earlier visit keeps the button busy; handleCurrencySync frees it when that sync ends.
    syncBtn.disabled = currencyState.syncing || !canCurrentUserSyncPrices();
    syncBtn.title = canCurrentUserSyncPrices() ? '' : window.t('currency.syncRestricted');
  }
  renderCurrencyStatus();
}

// Fallback PoE leagues (used when API is unreachable)
const FALLBACK_POE1_LEAGUES = ['Mirage', 'Hardcore Mirage', 'SSF Mirage', 'HC SSF Mirage', 'Standard', 'Hardcore'];
const FALLBACK_POE2_LEAGUES = ['Fate of the Vaal', 'HC Fate of the Vaal', 'Standard', 'Hardcore'];

async function loadCurrencyLeagues() {
  const select = document.getElementById('currency-league');
  if (!select) return;

  let allLeagues = [];
  let activeLeagueNames = [];
  let lastKnownLeague = null;
  const { poeVersion } = currencyState;

  try {
    // res = { activeLeagues: [...] } from poe.ninja
    const res = await window.electronAPI.getCurrencyLeagues(poeVersion);
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

    // poe.ninja's list could not be read, and main names the league of the newest kept list.
    lastKnownLeague = leagueData.lastKnownLeague || null;
    if (lastKnownLeague && !allLeagues.includes(lastKnownLeague)) allLeagues.push(lastKnownLeague);
  } catch { }

  // The page moved to another game meanwhile, and that game's own list decides the league.
  if (poeVersion !== currencyState.poeVersion) return;

  // Always merge fallback leagues so standard options are available
  const fallback = poeVersion === 'poe2' ? FALLBACK_POE2_LEAGUES : FALLBACK_POE1_LEAGUES;
  for (const l of fallback) {
    if (!allLeagues.includes(l)) allLeagues.push(l);
  }

  select.innerHTML = allLeagues.map(l => `<option value="${escapeHTML(l)}">${escapeHTML(l)}</option>`).join('');

  const preferredLeague = [
    currencyState.league,
    activeLeagueNames[0],
    lastKnownLeague,
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
    + '<td class="currency-td-item"><span class="currency-item"><span class="item-slot"></span><span class="currency-bar"></span></span></td>'
    + '<td class="currency-td-chaos"><span class="currency-bar currency-bar--value"></span></td>'
    + '<td class="currency-td-divine"></td>'
    + '<td class="currency-td-change"></td>'
    + '</tr>';
  return `<tr class="currency-loading-row"><td colspan="4" class="currency-loading-label">${window.t('currency.waitingForSync')}</td></tr>`
    + placeholderRow.repeat(8);
}

function showCurrencyLoadingRows() {
  const tbody = document.getElementById('currency-table-body');
  if (!tbody) return;
  markCurrencyRowsReplaced(tbody);
  tbody.innerHTML = currencyLoadingRowsHTML();
  const footer = document.getElementById('currency-footer');
  if (footer) footer.textContent = '';
}

// What the table lists comes from one answer of main, so the same answer again draws nothing new. The rows carry text
// in the language they were drawn in, and a language changed on another page does not redraw them.
function getCurrencyListSignature() {
  const { listedKey, type, search, sortField, sortDir, updatedAt } = currencyState;
  return JSON.stringify([listedKey, type, search, sortField, sortDir, updatedAt, window._appState?.language]);
}

function applyCurrencyPriceAnswer(json, poeVersion) {
  currencyState.prices = json?.prices || json?.data?.prices || [];
  currencyState.rates = json?.rates || {};
  currencyState.total = Number(json?.total) || currencyState.prices.length;
  currencyState.typeCounts = json?.typeCounts || null;
  currencyState.syncedTypes = Array.isArray(json?.syncedTypes) ? json.syncedTypes : [];
  currencyState.updatedAt = json?.updatedAt || json?.data?.updatedAt || null;
  currencyState.loadError = null;
  currencyState.listedKey = `${poeVersion}:${json?.league || currencyState.league}`;
  if (currencyState.renderedList !== getCurrencyListSignature()) {
    renderCurrencyTable();
  }
  updateCurrencyTypeCounts();
  renderCurrencyStatus();
}

// `cacheOnly` (the reload after prices-updated) lists only what main already holds and never starts a sync. When
// main holds another game or league by then, it answers prices null and the table keeps its rows.
async function loadCurrencyPrices({ cacheOnly = false } = {}) {
  const tbody = document.getElementById('currency-table-body');
  if (!tbody) return;
  // No league yet: the page's load or game switch is waiting for the league list and lists next, with the current type
  // and search. Asked now, main would answer for its stored league and could queue a sync of it.
  if (!cacheOnly && !currencyState.league) return;
  // A request queued behind a running sync can answer after a later one that main answered at once, so only the
  // latest request renders. A cache-only reload takes the latest request's turn, so it never drops an answer still
  // waiting for a sync.
  const request = cacheOnly ? currencyState.pricesRequest : ++currencyState.pricesRequest;
  const poeVersion = currencyState.poeVersion;
  // A filter, search or reload of the listed game and league keeps its rows, because main usually answers those at
  // once from the loaded list. Another game or league shows still rows, because main may first wait for a sync.
  // Another league's sync can unload the listed one, and then main waits too, so kept rows that get no answer within
  // 300 ms give way to still rows.
  let slowAnswer = null;
  if (!cacheOnly) {
    if (currencyState.listedKey !== `${poeVersion}:${currencyState.league}`) {
      // The rail's counts belong to the listed game and league.
      currencyState.typeCounts = null;
      updateCurrencyTypeCounts();
      showCurrencyLoadingRows();
    } else {
      slowAnswer = setTimeout(() => {
        if (request === currencyState.pricesRequest) showCurrencyLoadingRows();
      }, 300);
    }
  }

  try {
    const params = { poeVersion, limit: '500' };
    if (currencyState.league) params.league = currencyState.league;
    if (currencyState.type) params.type = currencyState.type;
    if (currencyState.search) params.search = currencyState.search;
    if (cacheOnly) params.cacheOnly = true;

    // While main waits for a sync, the list kept from the last sync shows, with its age and that a sync runs. Any answer
    // from the real list ends that. Main answers null when it holds the list already.
    const lastKnownTurn = cacheOnly ? null : ++currencyState.lastKnownTurn;
    if (!cacheOnly) {
      window.electronAPI.getLastKnownCurrencyPrices(params).then((lastKnown) => {
        if (lastKnownTurn !== currencyState.lastKnownTurn || request !== currencyState.pricesRequest || !lastKnown?.prices) return;
        clearTimeout(slowAnswer);
        currencyState.lastKnown = true;
        currencyState.unreachable = false;
        applyCurrencyPriceAnswer(lastKnown, poeVersion);
      }).catch(() => {});
    }

    // json = { prices, count, total, typeCounts, syncedTypes, league, updatedAt, rates } from the local poe.ninja cache
    const json = await window.electronAPI.getCurrencyPrices(params);
    if (request !== currencyState.pricesRequest) return;
    if (cacheOnly && json?.prices === null) return;
    currencyState.lastKnownTurn += 1;
    currencyState.lastKnown = false;
    currencyState.unreachable = Boolean(json?.lastKnown);
    applyCurrencyPriceAnswer(json, poeVersion);
  } catch (error) {
    // A failed cache-only reload leaves the listed rows as they are.
    if (request !== currencyState.pricesRequest || cacheOnly) return;
    currencyState.lastKnownTurn += 1;
    currencyState.lastKnown = false;
    currencyState.unreachable = false;
    currencyState.listedKey = null;
    currencyState.loadError = error || new Error();
    // Nothing is listed, so the rail and status line drop the last list's counts and sync time.
    currencyState.typeCounts = null;
    currencyState.updatedAt = null;
    renderCurrencyEmptyRow(tbody, getUserFacingErrorMessage(currencyState.loadError, 'currency.loadError'), { action: 'retry' });
    updateCurrencyTypeCounts();
    renderCurrencyStatus();
  } finally {
    clearTimeout(slowAnswer);
  }
}

// How long ago the listed prices were synced, in the page's language.
function formatSyncedAgo(date) {
  const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (!Number.isFinite(mins) || mins < 1) return window.t('time.justNow');
  if (mins < 60) return window.t('time.minutesAgo', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return window.t('time.hoursAgo', { count: hours });
  return window.t('time.daysAgo', { count: Math.floor(hours / 24) });
}

// The line under the title names the listed league, its price count and when it was synced (or that a sync runs, or
// that poe.ninja gave nothing and the list is an older one; after a failed load only the league); the footer says how
// many of the matches the table shows.
function renderCurrencyStatus() {
  const status = document.getElementById('currency-status');
  if (status) {
    const parts = [currencyState.league];
    if (currencyState.syncing) {
      parts.push(window.t('currency.syncing'));
    } else if (currencyState.updatedAt) {
      const count = Object.values(currencyState.typeCounts || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
      parts.push(window.t('currency.priceCount', { count: count.toLocaleString('en-US') }));
      const time = formatSyncedAgo(currencyState.updatedAt);
      parts.push(currencyState.unreachable ? window.t('currency.unreachable', { time }) : window.t('currency.syncedAgo', { time }));
      if (currencyState.lastKnown) parts.push(window.t('currency.syncing'));
    } else if (!currencyState.loadError) {
      parts.push(window.t('currency.neverSynced'));
    }
    status.textContent = parts.filter(Boolean).join(' · ');
  }

  const footer = document.getElementById('currency-footer');
  if (footer) {
    const shown = currencyState.loadError ? 0 : currencyState.prices.length;
    footer.textContent = shown > 0
      ? window.t('currency.listedCount', {
        shown: shown.toLocaleString('en-US'),
        total: Math.max(Number(currencyState.total) || 0, shown).toLocaleString('en-US')
      })
      : '';
  }
}

// Which message an empty table shows: a search that matches nothing, a tab whose type the last sync read and found no
// listings for, a tab the quick sync skipped, or a league with no prices at all.
function selectCurrencyEmptyState({ search = '', type = '', syncedTypes = [] } = {}) {
  if (search) return 'noMatch';
  if (!type) return 'noData';
  return (syncedTypes || []).includes(type) ? 'zeroListings' : 'notSynced';
}

// The table's one message row, with at most one way out: Sync now, Clear search or Retry.
function renderCurrencyEmptyRow(tbody, message, { action = '' } = {}) {
  markCurrencyRowsReplaced(tbody);
  const row = document.createElement('tr');
  const cell = document.createElement('td');
  cell.colSpan = 4;
  cell.className = 'currency-empty';
  cell.textContent = message == null ? '' : String(message);
  if (action) {
    const wrap = document.createElement('div');
    wrap.className = 'currency-empty-action';
    const button = document.createElement('button');
    button.type = 'button';
    const label = document.createElement('span');
    label.className = 'btn-label';
    if (action === 'sync') {
      button.className = 'btn btn-secondary btn-small currency-empty-sync';
      button.insertAdjacentHTML('afterbegin', '<svg class="icon icon-sm" width="12" height="12" aria-hidden="true"><use href="assets/icons.svg#sync"/></svg>');
      label.setAttribute('data-i18n', 'currency.syncNow');
      label.textContent = window.t('currency.syncNow');
      button.addEventListener('click', handleCurrencySync);
    } else if (action === 'clearSearch') {
      button.className = 'btn btn-secondary btn-small';
      button.insertAdjacentHTML('afterbegin', '<svg class="icon icon-sm" width="12" height="12" aria-hidden="true"><use href="assets/icons.svg#close"/></svg>');
      label.setAttribute('data-i18n', 'currency.clearSearch');
      label.textContent = window.t('currency.clearSearch');
      button.addEventListener('click', clearCurrencySearch);
    } else {
      button.className = 'btn btn-secondary btn-small';
      button.insertAdjacentHTML('afterbegin', '<svg class="icon icon-sm" width="12" height="12" aria-hidden="true"><use href="assets/icons.svg#sync"/></svg>');
      label.setAttribute('data-i18n', 'currency.retry');
      label.textContent = window.t('currency.retry');
      button.addEventListener('click', () => loadCurrencyPrices());
    }
    button.appendChild(label);
    wrap.appendChild(button);
    cell.appendChild(wrap);
    // A Sync now drawn while a sync runs shows that sync.
    if (action === 'sync' && currencyState.syncing) setButtonBusy(button, true, window.t('currency.syncing'));
  }
  row.appendChild(cell);
  tbody.replaceChildren(row);
}

function renderCurrencyTable() {
  const tbody = document.getElementById('currency-table-body');
  if (!tbody) return;

  if (currencyState.loadError) {
    renderCurrencyEmptyRow(tbody, getUserFacingErrorMessage(currencyState.loadError, 'currency.loadError'), { action: 'retry' });
    return;
  }

  const sorted = [...currencyState.prices].sort((a, b) => {
    if (currencyState.sortField === 'itemName') {
      const av = (a.itemName || '').toLowerCase();
      const bv = (b.itemName || '').toLowerCase();
      return currencyState.sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    if (currencyState.sortField === 'change') {
      // A row without a 7-day change goes last in both orders, not between the gains and the losses.
      const toChange = (item) => (item.change === null || item.change === undefined || item.change === '' ? NaN : Number(item.change));
      const av = toChange(a), bv = toChange(b);
      if (!Number.isFinite(av) || !Number.isFinite(bv)) {
        return Number.isFinite(av) ? -1 : (Number.isFinite(bv) ? 1 : 0);
      }
      return currencyState.sortDir === 'asc' ? av - bv : bv - av;
    }
    const av = parseFloat(a[currencyState.sortField]) || 0;
    const bv = parseFloat(b[currencyState.sortField]) || 0;
    return currencyState.sortDir === 'asc' ? av - bv : bv - av;
  });

  if (sorted.length === 0) {
    // Sync can fill a league or a category the quick sync skipped, but not a search that matches nothing or a category
    // the league has no listings for.
    const emptyState = selectCurrencyEmptyState(currencyState);
    const syncAction = canCurrentUserSyncPrices() ? 'sync' : '';
    if (emptyState === 'noMatch') {
      renderCurrencyEmptyRow(tbody, window.t('currency.noMatch'), { action: 'clearSearch' });
    } else if (emptyState === 'zeroListings') {
      renderCurrencyEmptyRow(tbody, window.t('currency.emptyCategory'));
    } else if (emptyState === 'notSynced') {
      renderCurrencyEmptyRow(tbody, window.t('currency.notSyncedCategory'), { action: syncAction });
    } else {
      renderCurrencyEmptyRow(tbody, window.t('currency.noData'), { action: syncAction });
    }
    return;
  }

  currencyState.sorted = sorted;
  currencyState.renderedList = currencyState.updatedAt ? getCurrencyListSignature() : '';
  // The rows are one Tab stop (the open row, else the first), so Tab gets past up to 500 of them in one press.
  const tabStop = Math.max(sorted.findIndex(isCurrencyRowExpanded), 0);
  const fragment = document.createDocumentFragment();
  if (sorted.length > window.currencyRowWindowModel.FULL_LIST_MAX) {
    // Read before the old rows go: a table that is short for a moment would pull the page's scroll position back.
    const { start, end, topHeight, bottomHeight } = selectCurrencyRowWindow(tbody);
    const rowWindow = {
      start,
      end,
      rows: new Map(),
      top: createCurrencySpacerRow(topHeight),
      bottom: createCurrencySpacerRow(bottomHeight)
    };
    currencyState.rowWindow = rowWindow;
    tbody.parentElement?.setAttribute('aria-rowcount', String(sorted.length + 1));
    fragment.appendChild(rowWindow.top);
    for (let index = start; index < end; index += 1) {
      appendCurrencyRow(fragment, index, tabStop);
    }
    fragment.appendChild(rowWindow.bottom);
  } else {
    markCurrencyRowsReplaced(tbody, { keepList: true });
    sorted.forEach((item, index) => appendCurrencyRow(fragment, index, tabStop));
  }

  tbody.replaceChildren(fragment);
  applyCachedItemIcons(tbody);
  if (currencyState.rowWindow) {
    keepCurrencyTabStop(tbody);
    syncCurrencyRowWindow();
  }
}

// Whatever replaces the rows ends the row window, and the signature says no list is drawn, unless a list follows.
function markCurrencyRowsReplaced(tbody, { keepList = false } = {}) {
  currencyState.rowWindow = null;
  if (!keepList) currencyState.renderedList = '';
  tbody.parentElement?.removeAttribute?.('aria-rowcount');
}

function isCurrencyRowExpanded(item) {
  return Boolean(item.itemName) && String(item.itemName).toLowerCase() === currencyState.expandedKey;
}

function appendCurrencyRow(target, index, tabStop) {
  const item = currencyState.sorted[index];
  const chaos = parseFloat(item.chaosValue) || 0;
  const divine = parseFloat(item.divineValue);

  const row = document.createElement('tr');
  row.className = 'currency-row';
  row.tabIndex = index === tabStop ? 0 : -1;
  row.setAttribute('aria-expanded', 'false');

  const itemCell = document.createElement('td');
  itemCell.className = 'currency-td-item';
  const itemBox = document.createElement('div');
  itemBox.className = 'currency-item';
  const text = document.createElement('span');
  text.className = 'currency-item-text';
  const name = document.createElement('span');
  name.className = 'currency-item-name';
  name.textContent = item.itemName || '';
  // A long name ends in an ellipsis, so its full text is one hover away.
  name.title = item.itemName || '';
  text.appendChild(name);
  // A tab already names the type, so only All shows it under each name.
  if (!currencyState.type) {
    const meta = document.createElement('span');
    meta.className = 'currency-item-meta';
    meta.textContent = getCurrencyTypeLabel(item.itemType);
    text.appendChild(meta);
  }
  itemBox.append(createCurrencyItemSlot(item), text);
  itemCell.appendChild(itemBox);

  const chaosCell = document.createElement('td');
  chaosCell.className = 'currency-td-chaos';
  chaosCell.appendChild(createCurrencyValueElement(chaos, 'chaos', 18, currencyState.poeVersion));
  // A loot-filter colour for the item's own value, measured against this list's Divine and Mirror prices.
  applyProfitTier(chaosCell, getProfitTierFor(chaos, currencyState.poeVersion, { rates: currencyState.rates || {} }));

  const divineCell = document.createElement('td');
  divineCell.className = 'currency-td-divine';
  if (Number.isFinite(divine) && divine > 0) {
    divineCell.appendChild(createCurrencyValueElement(divine, 'divine', 18, currencyState.poeVersion, { markTiny: true }));
  } else {
    const muted = document.createElement('span');
    muted.className = 'text-muted';
    muted.textContent = '-';
    divineCell.appendChild(muted);
  }

  const changeCell = document.createElement('td');
  changeCell.className = 'currency-td-change';
  changeCell.appendChild(createPriceChangeElement(item.change, item.sparklineData));

  row.append(itemCell, chaosCell, divineCell, changeCell);
  row.addEventListener('click', () => toggleCurrencyRowDetail(row, item));
  row.addEventListener('keydown', (event) => {
    if (event.target !== row) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleCurrencyRowDetail(row, item);
    } else if (handleCurrencyRowKey(row, index, event.key)) {
      event.preventDefault();
    }
  });
  target.appendChild(row);
  if (currencyState.rowWindow) {
    currencyState.rowWindow.rows.set(index, row);
    // The header is row 1. The table holds only some rows, so each says its place in the list.
    row.setAttribute('aria-rowindex', String(index + 2));
  }
  if (isCurrencyRowExpanded(item)) {
    row.setAttribute('aria-expanded', 'true');
    target.appendChild(buildCurrencyDetailRow(item));
  }
}

function createCurrencySpacerRow(height) {
  const row = document.createElement('tr');
  row.className = 'currency-row-spacer';
  row.setAttribute('aria-hidden', 'true');
  const cell = document.createElement('td');
  cell.colSpan = 4;
  cell.style.height = `${height}px`;
  row.appendChild(cell);
  return row;
}

function getCurrencyRowLayout() {
  const { sorted, rowHeight, detailHeight } = currencyState;
  return { count: sorted.length, rowHeight, detailIndex: sorted.findIndex(isCurrencyRowExpanded), detailHeight };
}

// The window for the screen's place on the list, unless `viewTop` names another place.
function selectCurrencyRowWindow(tbody, { current = null, viewTop = -tbody.getBoundingClientRect().top } = {}) {
  return window.currencyRowWindowModel.selectRowWindow({
    ...getCurrencyRowLayout(),
    viewTop,
    viewHeight: window.innerHeight,
    current
  });
}

// Takes the table to a new window. Rows in both stay in place, so they keep focus and their loaded art.
function drawCurrencyRowWindow(tbody, next) {
  const rowWindow = currencyState.rowWindow;
  const { rows, start, end, top, bottom } = rowWindow;
  for (const [index, row] of rows) {
    if (index < next.start || index >= next.end) {
      if (row.getAttribute('aria-expanded') === 'true') row.nextElementSibling?.remove();
      row.remove();
      rows.delete(index);
    }
  }
  const before = document.createDocumentFragment();
  for (let index = next.start; index < Math.min(start, next.end); index += 1) {
    appendCurrencyRow(before, index, -1);
  }
  const after = document.createDocumentFragment();
  for (let index = Math.max(end, next.start); index < next.end; index += 1) {
    appendCurrencyRow(after, index, -1);
  }
  // Called before the rows go in: it collects the images at once and sets them when main answers.
  applyCachedItemIcons(before);
  applyCachedItemIcons(after);
  top.after(before);
  bottom.before(after);
  top.firstChild.style.height = `${next.topHeight}px`;
  bottom.firstChild.style.height = `${next.bottomHeight}px`;
  rowWindow.start = next.start;
  rowWindow.end = next.end;
  keepCurrencyTabStop(tbody);
}

// The Tab stop leaves with its row, so the first row held takes it over.
function keepCurrencyTabStop(tbody) {
  if (!tbody.querySelector('.currency-row[tabindex="0"]')) {
    tbody.querySelector('.currency-row').tabIndex = 0;
  }
}

// Puts the window where the screen is, after a scroll, a resize, a row opening or the page showing again. A hidden page
// has no place on the screen.
function syncCurrencyRowWindow() {
  const { rowWindow } = currencyState;
  const tbody = document.getElementById('currency-table-body');
  if (!rowWindow || !tbody.getClientRects().length) return;
  // A row in the middle: collapsed borders leave the rows at the window's edges half a pixel apart from the rest.
  const rowHeight = rowWindow.rows.get(Math.floor((rowWindow.start + rowWindow.end) / 2))?.getBoundingClientRect().height;
  if (rowHeight > 0) currencyState.rowHeight = rowHeight;
  const detailRowHeight = tbody.querySelector('.currency-detail-row')?.getBoundingClientRect().height;
  if (detailRowHeight > 0) currencyState.detailHeight = detailRowHeight;
  drawCurrencyRowWindow(tbody, selectCurrencyRowWindow(tbody, { current: rowWindow }));
}

// A key that moves to a row the window does not hold draws the window around that row first.
function handleCurrencyRowKey(row, index, key) {
  const { rowWindow, sorted } = currencyState;
  const target = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: sorted.length - 1 }[key];
  if (!rowWindow || !sorted[target] || rowWindow.rows.has(target)) {
    return moveCurrencyRowFocus(row, key);
  }
  const tbody = row.parentElement;
  const viewTop = window.currencyRowWindowModel.getRowTop(target, getCurrencyRowLayout());
  drawCurrencyRowWindow(tbody, selectCurrencyRowWindow(tbody, { viewTop }));
  const next = rowWindow.rows.get(target);
  rowWindow.rows.forEach((other) => { other.tabIndex = other === next ? 0 : -1; });
  next.focus();
  return true;
}

// Arrow keys, Home and End move between the price rows, and the Tab stop moves with them. Says whether the key moved.
function moveCurrencyRowFocus(row, key) {
  const rows = [...(row.parentElement?.querySelectorAll('.currency-row') || [])];
  const index = rows.indexOf(row);
  const next = { ArrowDown: rows[index + 1], ArrowUp: rows[index - 1], Home: rows[0], End: rows[rows.length - 1] }[key];
  if (!next) return false;
  rows.forEach((other) => { other.tabIndex = other === next ? 0 : -1; });
  next.focus();
  return true;
}

// Opens one price row's detail at a time. The open row stays open while the table redraws (sort, sync, language).
function toggleCurrencyRowDetail(row, item) {
  const tbody = row.parentElement;
  const opening = row.getAttribute('aria-expanded') !== 'true';
  tbody?.querySelectorAll('.currency-detail-row').forEach((detail) => detail.remove());
  tbody?.querySelectorAll('.currency-row[aria-expanded="true"]').forEach((open) => open.setAttribute('aria-expanded', 'false'));
  // The row used last is the Tab stop, as a redraw makes the open row.
  tbody?.querySelectorAll('.currency-row').forEach((other) => { other.tabIndex = other === row ? 0 : -1; });
  currencyState.expandedKey = opening ? String(item.itemName || '').toLowerCase() : null;
  if (opening) {
    const detail = buildCurrencyDetailRow(item);
    row.after(detail);
    row.setAttribute('aria-expanded', 'true');
    applyCachedItemIcons(detail);
  }
  syncCurrencyRowWindow();
}

// The detail under a price row: bigger art, the full name and type, both values, the week's change with a larger line,
// and the name to copy for a trade search. It reads the loaded row only.
function buildCurrencyDetailRow(item) {
  const row = document.createElement('tr');
  row.className = 'currency-detail-row';
  const cell = document.createElement('td');
  cell.colSpan = 4;
  const panel = document.createElement('div');
  panel.className = 'currency-detail';

  const info = document.createElement('div');
  info.className = 'currency-detail-info';
  const name = document.createElement('strong');
  name.className = 'currency-detail-name';
  name.textContent = item.itemName || '';
  const type = document.createElement('span');
  type.className = 'currency-detail-type';
  type.textContent = getCurrencyTypeLabel(item.itemType);
  const values = document.createElement('div');
  values.className = 'currency-detail-values';
  values.appendChild(createCurrencyValueElement(parseFloat(item.chaosValue) || 0, 'chaos', 18, currencyState.poeVersion));
  const divine = parseFloat(item.divineValue);
  if (Number.isFinite(divine) && divine > 0) {
    values.appendChild(createCurrencyValueElement(divine, 'divine', 18, currencyState.poeVersion, { markTiny: true }));
  }
  info.append(name, type, values);

  const trend = document.createElement('div');
  trend.className = 'currency-detail-trend';
  const trendLabel = document.createElement('span');
  trendLabel.className = 'currency-detail-label';
  trendLabel.textContent = window.t('currency.change7d');
  trend.append(trendLabel, createPriceChangeElement(item.change, item.sparklineData, { width: 240, height: 48, ticks: true }));

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'btn btn-ghost btn-small currency-copy-name';
  const copyLabel = document.createElement('span');
  copyLabel.className = 'btn-label';
  copyLabel.setAttribute('data-i18n', 'currency.copyName');
  copyLabel.textContent = window.t('currency.copyName');
  copy.appendChild(copyLabel);
  copy.addEventListener('click', () => copyCurrencyItemName(copy, item.itemName || ''));

  panel.append(createCurrencyItemSlot(item, currencyState.poeVersion, 'currency-detail-slot'), info, trend, copy);
  cell.appendChild(panel);
  row.appendChild(cell);
  return row;
}

// Copies an item name for a trade search. The button says so for 2 s and the announcer reads it out.
async function copyCurrencyItemName(button, name) {
  try {
    await navigator.clipboard.writeText(name);
  } catch (error) {
    showToast(window.t('currency.copyFailed'), getUserFacingErrorMessage(error, 'toast.tryAgain'), 'error');
    return;
  }
  const label = button.querySelector('.btn-label');
  announceStatus(window.t('currency.copied'));
  label.textContent = window.t('currency.copied');
  setTimeout(() => {
    label.textContent = window.t('currency.copyName');
  }, SAVED_STATE_MS);
}

// poe.ninja's 7-day change as signed text, '+12.4%' or '-81.5%', or '' when it gives none.
function formatPriceChange(change) {
  if (change === null || change === undefined || change === '' || !Number.isFinite(Number(change))) return '';
  const rounded = Math.round(Number(change) * 10) / 10;
  const sign = rounded > 0 ? '+' : (rounded < 0 ? '-' : '');
  return `${sign}${Math.abs(rounded).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

// The 7d cell: the signed change with an up or down arrow in the gain or loss colour, so the direction never rests on
// colour alone, then the week's sparkline in the same colour.
function createPriceChangeElement(change, sparkData, { width = 64, height = 18, ticks = false } = {}) {
  const box = document.createElement('div');
  box.className = 'currency-change';
  const text = formatPriceChange(change);
  const trend = text.startsWith('+') ? 'up' : (text.startsWith('-') ? 'down' : (text ? 'flat' : 'none'));
  box.dataset.trend = trend;

  const value = document.createElement('span');
  value.className = 'currency-change-value';
  if (PRICE_CHANGE_ARROW_SVG[trend]) {
    value.insertAdjacentHTML('afterbegin', PRICE_CHANGE_ARROW_SVG[trend]);
  }
  const number = document.createElement('span');
  number.textContent = text || '-';
  value.appendChild(number);
  box.appendChild(value);

  const spark = createSparklineElement(sparkData, { width, height, change, ticks });
  if (spark) box.appendChild(spark);
  return box;
}

// A sparkline of poe.ninja's 7-day series that skips the days it has no data for, coloured by the week's change (or
// by its own first and last points when poe.ninja gives none). `ticks` marks each day under the line.
function createSparklineElement(sparkData, { width = 64, height = 18, change = null, ticks = false } = {}) {
  const raw = Array.isArray(sparkData?.data) ? sparkData.data : [];
  const points = raw
    .map((value, index) => ({ index, value: value === null || value === undefined || value === '' ? NaN : Number(value) }))
    .filter((point) => Number.isFinite(point.value));
  if (points.length < 2) return null;

  const pad = 2;
  const bottom = ticks ? height - 6 : height - pad;
  const values = points.map((point) => point.value);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const step = (width - pad * 2) / (raw.length - 1);
  const coordinates = points.map((point) => {
    const x = pad + point.index * step;
    const y = bottom - ((point.value - min) / range) * (bottom - pad);
    return `${x},${y}`;
  }).join(' ');

  const weekChange = formatPriceChange(change) ? Number(change) : values[values.length - 1] - values[0];
  const direction = Math.round(weekChange * 10) / 10;
  const color = direction > 0 ? 'var(--gain)' : (direction < 0 ? 'var(--loss)' : 'var(--text-muted)');
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('class', 'currency-spark');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('aria-hidden', 'true');

  if (ticks) {
    for (let index = 0; index < raw.length; index += 1) {
      const tick = document.createElementNS(svgNamespace, 'line');
      const x = String(pad + index * step);
      tick.setAttribute('class', 'currency-spark-tick');
      tick.setAttribute('x1', x);
      tick.setAttribute('x2', x);
      tick.setAttribute('y1', String(height - 3));
      tick.setAttribute('y2', String(height));
      svg.appendChild(tick);
    }
  }

  const polyline = document.createElementNS(svgNamespace, 'polyline');
  polyline.setAttribute('points', coordinates);
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
  // innerHTML leaves quotes as they are, and callers also write this into quoted attributes.
  return _escapeDiv.innerHTML.replace(/\u0022/g, '&quot;').replace(/\u0027/g, '&#39;');
}

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return window.t('time.justNow');
  if (mins < 60) return window.t('time.minutesAgo', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return window.t('time.hoursAgo', { count: hours });
  return window.t('time.daysAgo', { count: Math.floor(hours / 24) });
}

async function handleCurrencySync() {
  // The header Sync and the table's Sync now start one sync between them. A game switch has no league until its list
  // answers, and main would read a blank league as Standard and unload the prices loot reads.
  if (currencyState.syncing || !currencyState.league) return;
  if (!canCurrentUserSyncPrices()) {
    showToast(window.t('currency.syncRestrictedTitle'), window.t('currency.syncRestricted'), 'warning');
    return;
  }
  const { poeVersion, league } = currencyState;

  currencyState.syncing = true;
  const syncButtons = () => [document.getElementById('currency-sync-btn'), ...document.querySelectorAll('.currency-empty-sync')];
  const startedFromSyncButton = syncButtons().includes(document.activeElement);
  syncButtons().forEach((button) => setButtonBusy(button, true, window.t('currency.syncing')));
  renderCurrencyStatus();

  try {
    // The table refreshing with the new prices says the sync worked. Main answers without an error when poe.ninja gave
    // nothing, and the table may go on listing the last prices, so only this says the sync failed.
    const status = await window.electronAPI.syncCurrencyPrices({ league, poeVersion });
    if (status?.itemCount === 0 || status?.syncFailed) {
      showToast(window.t('currency.syncFailed'), window.t('toast.tryAgain'), 'error');
    }
    // Cache-only: the page may have moved on meanwhile, and a sync here would unload the prices it moved to.
    await refreshProfitCurrencyRates(poeVersion, league, { cacheOnly: true });
    await loadCurrencyLeagues();
    if (currencyState.league) await loadCurrencyPrices();
  } catch (e) {
    showToast(window.t('currency.syncFailed'), getUserFacingErrorMessage(e, 'toast.tryAgain'), 'error');
  } finally {
    currencyState.syncing = false;
    renderCurrencyStatus();
    // Asked again, so a Sync now drawn during the sync goes idle too.
    syncButtons().forEach((button) => setButtonBusy(button, false));
    // The busy buttons were disabled and the table drawn again, so a keyboard user's focus may have dropped to the
    // page. It goes back to a Sync control, unless the user moved it somewhere else meanwhile.
    const focused = document.activeElement;
    if (startedFromSyncButton && (!focused || focused === document.body || syncButtons().includes(focused))) {
      (document.querySelector('.currency-empty-sync') || document.getElementById('currency-sync-btn'))?.focus();
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
