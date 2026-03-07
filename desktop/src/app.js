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
  recentLoot: []
};

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
  langBtns: document.querySelectorAll('.lang-btn'),
  versionBtns: document.querySelectorAll('.version-btn'),
  
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
  console.log('PoE Farm Tracker Desktop baslatiliyor...');

  // Ayarlari yukle
  await loadSettings();

  // Set language from settings and apply translations
  window._appState.language = state.settings.language || 'en';
  if (window.applyTranslations) window.applyTranslations();

  // Event listener'lari kur
  setupEventListeners();
  setupCurrencyListeners();
  setupIPCListeners();
  
  // Mevcut kullaniciyi kontrol et
  const token = state.settings.authToken;
  if (token) {
    try {
      const user = await window.electronAPI.login({});
      if (user) {
        setCurrentUser(user);
      }
    } catch (error) {
      console.log('Otomatik giris basarisiz');
      showLoginModal();
    }
  } else {
    showLoginModal();
  }
  
  // Aktif session'i kontrol et
  await loadCurrentSession();
  
  console.log('Uygulama basarili bir sekilde baslatildi');
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

    // Language buttons
    const lang = state.settings.language || 'en';
    elements.langBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });

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
const CURRENCY_IMAGES = {
  chaos: 'assets/currency/chaos.png',
  divine: 'assets/currency/divine.png',
  exalted: 'assets/currency/exalted.png',
  mirror: 'assets/currency/mirror.png',
  vaal: 'assets/currency/vaal.png',
  alchemy: 'assets/currency/alchemy.png',
  fusing: 'assets/currency/fusing.png',
  chromatic: 'assets/currency/chromatic.png',
  alteration: 'assets/currency/alteration.png',
  jewellers: 'assets/currency/jewellers.png',
  scouring: 'assets/currency/scouring.png',
  blessed: 'assets/currency/blessed.png',
  regal: 'assets/currency/regal.png',
  regret: 'assets/currency/regret.png',
  gcp: 'assets/currency/gcp.png',
  chance: 'assets/currency/chance.png'
};

function currencyHTML(value, type = 'chaos', iconSize = 18) {
  const num = parseFloat(value);
  const imgPath = CURRENCY_IMAGES[type] || CURRENCY_IMAGES.chaos;
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
  
  // Settings
  elements.saveSettingsBtn.addEventListener('click', handleSaveSettings);
  elements.resetSettingsBtn.addEventListener('click', handleResetSettings);

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

  // Language switching
  elements.langBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.langBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const lang = btn.dataset.lang;
      state.settings.language = lang;
      window._appState.language = lang;
      if (window.applyTranslations) window.applyTranslations();
    });
  });

  // PoE version switching
  elements.versionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.versionBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.settings.poeVersion = btn.dataset.version;
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
}

/**
 * IPC event listener'lari
 */
function setupIPCListeners() {
  // Map olaylari
  window.electronAPI.onMapEntered((data) => {
    showToast('Map Girisi', `${data.mapName} map'ine girildi`);
  });
  
  window.electronAPI.onMapExited((data) => {
    showToast('Map Cikisi', `${data.mapName} tamamlandi. Sure: ${formatDuration(data.duration)}`);
    loadCurrentSession();
  });
  
  // Session olaylari
  window.electronAPI.onSessionStarted((session) => {
    state.currentSession = session;
    updateActiveSessionUI();
    showToast('Session Basladi', `${session.mapName} baslatildi`);
  });
  
  window.electronAPI.onSessionEnded((session) => {
    state.currentSession = null;
    updateActiveSessionUI();
    const profit = parseFloat(session.profitChaos);
    const message = profit >= 0 ? `Kâr: ${profit.toFixed(1)}c` : `Zarar: ${Math.abs(profit).toFixed(1)}c`;
    showToast('Session Tamamlandi', message, profit >= 0 ? 'success' : 'warning');
  });
  
  // Loot olaylari
  window.electronAPI.onLootAdded((data) => {
    showToast('Loot Eklendi', `${data.items.length} item eklendi`);
    loadRecentLoot();
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
    loadDashboardStats();
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
      showToast(window.t('login.title'), window.t('toast.loginSuccess'));
    } else {
      showToast(window.t('toast.loginFailed'), result.error, 'error');
    }
  } catch (error) {
    showToast(window.t('toast.error'), error.message, 'error');
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
      showToast(window.t('register.title'), window.t('toast.registerSuccess'));
    } else {
      showToast(window.t('toast.registerFailed'), result.error, 'error');
    }
  } catch (error) {
    showToast(window.t('toast.error'), error.message, 'error');
  }
}

/**
 * Cikis islemi
 */
async function handleLogout() {
  await window.electronAPI.logout();
  state.currentUser = null;
  elements.username.textContent = window.t('user.guest');
  if (elements.userAvatar) elements.userAvatar.textContent = '?';
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

function getSelectedTrackerContext() {
  const poeVersion = state.settings.poeVersion || 'poe1';
  const league = (state.settings.defaultLeague || 'Standard').trim() || 'Standard';

  return {
    poeVersion,
    league,
    label: `${poeVersion === 'poe2' ? 'PoE 2' : 'PoE 1'} • ${league}`
  };
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
    console.log('Aktif session bulunamadi');
  }
}

function updateActiveSessionUI() {
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
  // Not: Gercek implementasyonda API'den cekilecek
  // Su an placeholder
  elements.sessionsList.innerHTML = `<p class="empty-state">${window.t('sessions.loading')}</p>`;
}

/**
 * Dashboard istatistiklerini yukle
 */
async function loadDashboardStats() {
  // Not: Gercek implementasyonda API'den cekilecek
  // Su an placeholder degerler
  elements.todaySessions.textContent = '0';
  elements.todayProfit.innerHTML = currencyHTML(0);
  elements.todayAvg.innerHTML = currencyHTML(0);
}

/**
 * Son loot'lari yukle
 */
async function loadRecentLoot() {
  // Not: Gercek implementasyonda API'den cekilecek
}

/**
 * Ayarlari kaydet
 */
async function handleSaveSettings() {
  const activeLang = document.querySelector('.lang-btn.active');
  const activeVersion = document.querySelector('.version-btn.active');

  const settings = {
    apiUrl: elements.apiUrl.value,
    poePath: elements.poePath.value,
    autoStartSession: elements.autoStartSession.checked,
    notifications: elements.enableNotifications.checked,
    soundNotifications: elements.soundNotifications ? elements.soundNotifications.checked : false,
    language: activeLang ? activeLang.dataset.lang : 'en',
    poeVersion: activeVersion ? activeVersion.dataset.version : 'poe1',
    defaultLeague: elements.defaultLeague ? (elements.defaultLeague.value.trim() || 'Standard') : 'Standard',
    scanHotkey: elements.scanHotkey ? elements.scanHotkey.value : 'F9'
  };

  try {
    await window.electronAPI.setSettings(settings);
    state.settings = { ...state.settings, ...settings };
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
  elements.langBtns.forEach(b => b.classList.toggle('active', b.dataset.lang === 'en'));
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
  { value: 'currency', label: 'Currency', icon: 'exalted' },
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
      ? `<img src="assets/currency/${t.icon}.png" class="currency-tab-icon" width="14" height="14" draggable="false">`
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
      <td class="currency-td-chaos">${currencyHTML(chaos)}</td>
      <td class="currency-td-divine">${divine ? currencyHTML(divine, 'divine') : '<span class="text-muted">-</span>'}</td>
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
      showToast('Currency', window.t('currency.syncSuccess'), 'success');
      await loadCurrencyPrices();
    } else {
      showToast('Currency', window.t('currency.syncFailed'), 'error');
    }
  } catch (e) {
    showToast('Currency', window.t('currency.syncFailed'), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = window.t('currency.sync'); }
  }
}

/**
 * Sureyi formatla
 */
function formatDuration(seconds) {
  if (!seconds) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}${window.t('misc.durationMin')} ${secs}${window.t('misc.durationSec')}`;
}

// Uygulamayi baslat
document.addEventListener('DOMContentLoaded', init);
