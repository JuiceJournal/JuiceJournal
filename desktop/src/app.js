/**
 * PoE Farm Tracker - Desktop App JavaScript
 * Renderer process logic
 */

// Global app state for i18n
window._appState = { language: 'en' };

// Durum yonetimi
const state = {
  currentUser: null,
  currentSession: null,
  settings: {},
  sessions: [],
  recentLoot: [],
  poeLink: null,
  selectedSession: null
};

const ERROR_MESSAGE_KEY_MAP = {
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
  'Path of Exile baglantisi kaldirilamadi': 'errors.poeDisconnect'
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
  scanHotkey: document.getElementById('scan-hotkey'),
  testConnection: document.getElementById('test-connection'),
  connectionDot: document.getElementById('connection-dot'),
  connectionText: document.getElementById('connection-text'),
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
  toastContainer: document.getElementById('toast-container')
};

/**
 * Uygulamayi baslat
 */
async function init() {
  // Ayarlari yukle
  await loadSettings();

  // Set language from settings and apply translations
  window._appState.language = state.settings.language || 'en';
  if (window.applyTranslations) window.applyTranslations();
  syncDesktopCurrencyIcons();

  // Event listener'lari kur
  setupEventListeners();
  setupCurrencyListeners();
  setupIPCListeners();
  
  // Mevcut kullaniciyi kontrol et
  const token = state.settings.authToken;
  if (token) {
    try {
      const me = await window.electronAPI.getCurrentUser();
      if (me?.user) {
        setCurrentUser(me.user);
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
  
}

function ensureSessionClock() {
  if (sessionClockInterval) {
    clearInterval(sessionClockInterval);
  }

  sessionClockInterval = setInterval(() => {
    if (state.currentSession && !document.hidden) {
      updateActiveSessionUI();
    }
  }, 1000);
}

/**
 * Ayarlari yukle
 */
async function loadSettings() {
  try {
    state.settings = await window.electronAPI.getSettings();

    // Settings formunu doldur
    if (elements.apiUrl) elements.apiUrl.value = state.settings.apiUrl || '';
    if (elements.poePath) elements.poePath.value = state.settings.poePath || '';
    if (elements.autoStartSession) elements.autoStartSession.checked = state.settings.autoStartSession || false;
    if (elements.enableNotifications) elements.enableNotifications.checked = state.settings.notifications !== false;
    if (elements.soundNotifications) elements.soundNotifications.checked = state.settings.soundNotifications || false;
    if (elements.defaultLeague) elements.defaultLeague.value = state.settings.defaultLeague || '';
    if (elements.scanHotkey) elements.scanHotkey.value = state.settings.scanHotkey || 'F9';

    const lang = state.settings.language || 'en';
    if (elements.globalLanguage) elements.globalLanguage.value = lang;

    // PoE version buttons
    const ver = state.settings.poeVersion || 'poe1';
    elements.versionBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.version === ver);
    });
  } catch (error) {
    console.error('Ayarlari yukleme hatasi:', error);
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
  elements.loginForm.addEventListener('submit', handleLogin);
  elements.registerForm.addEventListener('submit', handleRegister);
  document.getElementById('show-register').addEventListener('click', showRegisterModal);
  document.getElementById('show-login').addEventListener('click', showLoginModal);
  elements.logoutBtn.addEventListener('click', handleLogout);
  
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
      if (window.applyTranslations) window.applyTranslations();
    });
  }

  // PoE version switching
  elements.versionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.versionBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.settings.poeVersion = btn.dataset.version;
      syncDesktopCurrencyIcons();
    });
  });

  // Test connection
  if (elements.testConnection) {
    elements.testConnection.addEventListener('click', handleTestConnection);
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
    showToast(window.t('toast.mapEnteredTitle'), window.t('toast.mapEnteredBody', { mapName: data.mapName }));
  });
  
  window.electronAPI.onMapExited((data) => {
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
    showToast(window.t('toast.sessionStartedTitle'), window.t('toast.sessionStartedBody', { mapName: session.mapName }));
    refreshTrackerData({ includeSessions: true });
  });
  
  window.electronAPI.onSessionEnded((session) => {
    state.currentSession = null;
    updateActiveSessionUI();
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
  elements.loginModal.classList.remove('hidden');
  elements.registerModal.classList.add('hidden');
}

/**
 * Register modal'i goster
 */
function showRegisterModal() {
  elements.loginModal.classList.add('hidden');
  elements.registerModal.classList.remove('hidden');
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
      setCurrentUser(result.data.user);
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
      setCurrentUser(result.data.user);
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
  closeSessionDrawer();
  elements.username.textContent = window.t('user.guest');
  if (elements.userAvatar) elements.userAvatar.textContent = '?';
  resetDashboardSummary();
  updateActiveSessionUI();
  renderSessionsList();
  renderRecentLoot();
  renderPoeLinkStatus();
  showLoginModal();
}

/**
 * Mevcut kullaniciyi ayarla
 */
function setCurrentUser(user) {
  state.currentUser = user;
  elements.username.textContent = user.username;
  if (elements.userAvatar) {
    elements.userAvatar.textContent = user.username.charAt(0).toUpperCase();
  }
}

function renderPoeLinkStatus() {
  const status = state.poeLink;

  if (!elements.poeLinkStatus || !elements.poeAccountName || !elements.poeLinkMode) return;

  if (!state.currentUser) {
    elements.poeLinkStatus.textContent = window.t('settings.poeSignInRequired');
    elements.poeAccountName.textContent = window.t('settings.poeSignInHint');
    elements.poeLinkMode.textContent = window.t('settings.poeMockMode');
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
    console.error('PoE link status load error:', error);
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
  const poeVersion = state.settings.poeVersion || 'poe1';
  const league = (state.settings.defaultLeague || 'Standard').trim() || 'Standard';

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

async function refreshTrackerData({ includeSessions = false, includeCurrency = false } = {}) {
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

  if (includeSessions || isPageActive('sessions')) {
    tasks.push(loadSessions());
  }

  if (includeCurrency || isPageActive('currency')) {
    tasks.push(loadCurrencyPage());
  }

  await Promise.allSettled(tasks);
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
      showToast(window.t('dashboard.activeSession'), `${mapName} ${window.t('toast.sessionStarted')} (${trackerContext.label})`);
    }
  } catch (error) {
    showToast(window.t('toast.error'), window.t('toast.sessionError'), 'error');
  }
}

/**
 * Session bitir
 */
async function handleEndSession() {
  if (!state.currentSession) return;
  
  if (!confirm(window.t('misc.endSessionConfirm'))) return;
  
  try {
    await window.electronAPI.endSession();
    state.currentSession = null;
    updateActiveSessionUI();
    await refreshTrackerData({ includeSessions: true });
  } catch (error) {
    showToast(window.t('toast.error'), window.t('toast.endSessionError'), 'error');
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
    const contextLabel = `${state.currentSession.poeVersion === 'poe2' ? 'PoE 2' : 'PoE 1'} • ${state.currentSession.league || 'Standard'}`;
    elements.activeSession.innerHTML = `
      <div class="session-info">
        <div class="session-info-item">
          <span class="session-info-label">${window.t('session.map')}</span>
          <span class="session-info-value">${state.currentSession.mapName}</span>
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
    await window.electronAPI.scanScreen();
    showToast(window.t('dashboard.scanScreen'), window.t('toast.scanComplete'));
  } catch (error) {
    showToast(window.t('toast.error'), window.t('toast.scanError'), 'error');
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
    console.error('Session load error:', error);
    elements.sessionsList.innerHTML = `<p class="empty-state">${window.t('sessions.loadError')}</p>`;
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
    console.error('Dashboard stats load error:', error);
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
    console.error('Recent loot load error:', error);
    state.recentLoot = [];
    elements.recentLootList.innerHTML = `<p class="empty-state">${window.t('dashboard.noLoot')}</p>`;
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
    const contextLabel = `${session.poeVersion === 'poe2' ? 'PoE 2' : 'PoE 1'} / ${session.league || 'Standard'}`;
    const duration = session.durationSec ? formatDuration(session.durationSec) : '-';
    const tier = session.mapTier ? `T${session.mapTier}` : '-';
    const startedAt = session.startedAt ? timeAgo(session.startedAt) : '-';

    return `
      <button class="session-item" type="button" data-session-id="${session.id}">
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
        <div class="session-status ${session.status}">${window.t(`sessions.${session.status}`)}</div>
      </button>
    `;
  }).join('');

  elements.sessionsList.querySelectorAll('[data-session-id]').forEach((sessionButton) => {
    sessionButton.addEventListener('click', () => {
      openSessionDrawer(sessionButton.dataset.sessionId);
    });
  });
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
    const contextLabel = `${session.poeVersion === 'poe2' ? 'PoE 2' : 'PoE 1'} / ${session.league || 'Standard'}`;

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

  const settings = {
    apiUrl: elements.apiUrl.value,
    poePath: elements.poePath.value,
    autoStartSession: elements.autoStartSession.checked,
    notifications: elements.enableNotifications.checked,
    soundNotifications: elements.soundNotifications ? elements.soundNotifications.checked : false,
    language: elements.globalLanguage ? elements.globalLanguage.value : 'en',
    poeVersion: activeVersion ? activeVersion.dataset.version : 'poe1',
    defaultLeague: elements.defaultLeague ? (elements.defaultLeague.value.trim() || 'Standard') : 'Standard',
    scanHotkey: elements.scanHotkey ? elements.scanHotkey.value : 'F9'
  };

  try {
    await window.electronAPI.setSettings(settings);
    state.settings = { ...state.settings, ...settings };
    syncDesktopCurrencyIcons();

    const contextChanged =
      previousContext.poeVersion !== settings.poeVersion ||
      previousContext.league !== settings.defaultLeague;

    if (contextChanged && state.currentUser) {
      await refreshTrackerData({ includeSessions: true, includeCurrency: true });
    }
    showToast(window.t('nav.settings'), window.t('toast.settingsSaved'));
  } catch (error) {
    showToast(window.t('toast.error'), window.t('toast.settingsError'), 'error');
  }
}

/**
 * Ayarlari sifirla
 */
async function handleResetSettings() {
  if (!confirm(window.t('settings.resetConfirm'))) return;

  elements.apiUrl.value = 'http://localhost:3001';
  elements.poePath.value = '';
  elements.autoStartSession.checked = true;
  elements.enableNotifications.checked = true;
  if (elements.soundNotifications) elements.soundNotifications.checked = false;
  if (elements.defaultLeague) elements.defaultLeague.value = 'Standard';
  if (elements.scanHotkey) elements.scanHotkey.value = 'F9';

  // Reset language to EN
  if (elements.globalLanguage) elements.globalLanguage.value = 'en';
  window._appState.language = 'en';
  if (window.applyTranslations) window.applyTranslations();

  // Reset PoE version to poe1
  elements.versionBtns.forEach(b => b.classList.toggle('active', b.dataset.version === 'poe1'));

  await handleSaveSettings();
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
    <div class="toast-title">${title}</div>
    <div class="toast-message">${message}</div>
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
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (typeof error.message === 'string' && error.message.trim() && error.message !== '[object Object]') {
    return error.message.trim();
  }
  if (typeof error.error === 'string' && error.error.trim()) return error.error.trim();
  if (typeof error.data?.error === 'string' && error.data.error.trim()) return error.data.error.trim();
  return '';
}

function localizeKnownErrorMessage(message) {
  const key = ERROR_MESSAGE_KEY_MAP[message];
  return key ? window.t(key) : message;
}

function getUserFacingErrorMessage(error, fallbackKey = 'toast.unexpectedError') {
  const fallback = window.t(fallbackKey);
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

  const contextLabel = `${session.poeVersion === 'poe2' ? 'PoE 2' : 'PoE 1'} / ${session.league || 'Standard'}`;
  const lootEntries = Array.isArray(session.lootEntries) ? session.lootEntries : [];
  const totalLoot = parseFloat(session.totalLootChaos || 0);
  const profit = parseFloat(session.profitChaos || 0);
  const cost = parseFloat(session.costChaos || 0);
  const poeVersion = session.poeVersion || state.settings.poeVersion || 'poe1';
  const analytics = buildSessionAnalytics(lootEntries);

  elements.sessionDrawerTitle.textContent = session.mapName || 'Session';
  elements.sessionDrawerLootCount.textContent = String(lootEntries.length);
  elements.sessionDrawerSummary.innerHTML = `
    <div class="session-drawer-metric">
      <span class="session-drawer-label">${window.t('session.status')}</span>
      <span class="session-status ${session.status}">${window.t(`sessions.${session.status}`)}</span>
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
      if (window.applyTranslations) window.applyTranslations();
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

// PoE 1 item category types with representative icons
const POE1_CATEGORY_TYPES = [
  { value: '', label: 'All', icon: null },
  { value: 'currency', label: 'Currency', icon: 'chaos' },
  { value: 'fragment', label: 'Fragment', icon: 'vaal' },
  { value: 'scarab', label: 'Scarab', icon: 'chance' },
  { value: 'map', label: 'Map', icon: 'alchemy' },
  { value: 'divination_card', label: 'Div Card', icon: 'divine' },
  { value: 'gem', label: 'Gem', icon: 'gcp' },
  { value: 'unique', label: 'Unique', icon: 'exalted' },
  { value: 'oil', label: 'Oil', icon: 'blessed' },
  { value: 'incubator', label: 'Incubator', icon: 'regret' },
  { value: 'delirium_orb', label: 'Delirium Orb', icon: 'chromatic' },
  { value: 'catalyst', label: 'Catalyst', icon: 'scouring' },
  { value: 'other', label: 'Other', icon: 'alteration' },
];

// PoE 2 item category types with representative icons
const POE2_CATEGORY_TYPES = [
  { value: '', label: 'All', icon: null },
  { value: 'currency', label: 'Currency', icon: 'chaos' },
  { value: 'fragment', label: 'Fragment', icon: 'vaal' },
  { value: 'scarab', label: 'Scarab', icon: 'chance' },
  { value: 'map', label: 'Map', icon: 'alchemy' },
  { value: 'divination_card', label: 'Div Card', icon: 'divine' },
  { value: 'gem', label: 'Gem', icon: 'gcp' },
  { value: 'unique', label: 'Unique', icon: 'mirror' },
  { value: 'catalyst', label: 'Catalyst', icon: 'scouring' },
  { value: 'other', label: 'Other', icon: 'alteration' },
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
  const types = currencyState.poeVersion === 'poe2' ? POE2_CATEGORY_TYPES : POE1_CATEGORY_TYPES;

  // If current type doesn't exist in new version, reset
  if (!types.find(t => t.value === currencyState.type)) {
    currencyState.type = '';
  }

  container.innerHTML = types.map(t => {
    const active = currencyState.type === t.value ? ' active' : '';
    const iconHTML = t.icon
      ? `<img src="${getCurrencyAssetPath(t.icon, currencyState.poeVersion)}" class="currency-tab-icon" width="14" height="14" draggable="false">`
      : '';
    return `<button class="currency-type-btn${active}" data-type="${t.value}">${iconHTML}<span>${t.label}</span></button>`;
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
}

async function loadCurrencyLeagues() {
  try {
    const apiUrl = state.settings.apiUrl || 'http://localhost:3001';
    const res = await fetch(`${apiUrl}/api/prices/leagues?poeVersion=${currencyState.poeVersion}`);
    const json = await res.json();
    const leagues = json.data?.leagues || [];
    const select = document.getElementById('currency-league');
    if (select) {
      select.innerHTML = leagues.map(l => `<option value="${l}">${l}</option>`).join('') || '<option value="">Standard</option>';
      if (leagues.length > 0) currencyState.league = leagues[0];
    }
  } catch (e) {
    console.error('Currency leagues error:', e);
  }
}

async function loadCurrencyPrices() {
  const tbody = document.getElementById('currency-table-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="currency-empty">${window.t('currency.loading')}</td></tr>`;

  try {
    const apiUrl = state.settings.apiUrl || 'http://localhost:3001';
    const params = new URLSearchParams({ poeVersion: currencyState.poeVersion, limit: '500' });
    if (currencyState.league) params.set('league', currencyState.league);
    if (currencyState.type) params.set('type', currencyState.type);
    if (currencyState.search) params.set('search', currencyState.search);

    const res = await fetch(`${apiUrl}/api/prices/current?${params}`);
    const json = await res.json();
    currencyState.prices = json.data?.prices || [];
    renderCurrencyTable();

    const footer = document.getElementById('currency-footer');
    if (footer) {
      const count = json.data?.count || 0;
      const updated = json.data?.updatedAt;
      footer.textContent = `${count} items` + (updated ? ` · Last synced: ${timeAgo(updated)}` : '');
    }
  } catch (e) {
    console.error('Currency prices error:', e);
    tbody.innerHTML = `<tr><td colspan="7" class="currency-empty">${window.t('currency.loadError')}</td></tr>`;
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

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
  const btn = document.getElementById('currency-sync-btn');
  if (btn) { btn.disabled = true; btn.textContent = window.t('currency.syncing'); }

  try {
    const apiUrl = state.settings.apiUrl || 'http://localhost:3001';
    const token = state.settings.authToken;
    const res = await fetch(`${apiUrl}/api/prices/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ league: currencyState.league, poeVersion: currencyState.poeVersion })
    });
    const json = await res.json();
    if (json.success) {
      showToast(window.t('toast.currencyTitle'), window.t('currency.syncSuccess'), 'success');
      await loadCurrencyPrices();
    } else {
      showToast(window.t('toast.currencyTitle'), window.t('currency.syncFailed'), 'error');
    }
  } catch (e) {
    showToast(window.t('toast.currencyTitle'), window.t('currency.syncFailed'), 'error');
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
