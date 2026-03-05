/**
 * PoE Farm Tracker - Desktop App JavaScript
 * Renderer process logic
 */

// Global app state for i18n
window._appState = { language: 'tr' };

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
  window._appState.language = state.settings.language || 'tr';
  if (window.applyTranslations) window.applyTranslations();

  // Event listener'lari kur
  setupEventListeners();
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
    const lang = state.settings.language || 'tr';
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

/**
 * Session baslat
 */
async function handleStartSession() {
  const mapName = prompt(window.t('misc.mapPrompt'), 'Dunes Map');
  if (!mapName) return;
  
  try {
    const session = await window.electronAPI.startSession({ mapName });
    if (session) {
      state.currentSession = session;
      updateActiveSessionUI();
      showToast(window.t('dashboard.activeSession'), `${mapName} ${window.t('toast.sessionStarted')}`);
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
  elements.todayProfit.textContent = '0c';
  elements.todayAvg.textContent = '0c';
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
    language: activeLang ? activeLang.dataset.lang : 'tr',
    poeVersion: activeVersion ? activeVersion.dataset.version : 'poe1',
    defaultLeague: elements.defaultLeague ? elements.defaultLeague.value : '',
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
  if (elements.defaultLeague) elements.defaultLeague.value = '';
  if (elements.scanHotkey) elements.scanHotkey.value = 'F9';

  // Reset language to TR
  elements.langBtns.forEach(b => b.classList.toggle('active', b.dataset.lang === 'tr'));
  window._appState.language = 'tr';
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
