/**
 * PoE Farm Tracker - Desktop App JavaScript
 * Renderer process logic
 */

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
  saveSettingsBtn: document.getElementById('save-settings'),
  resetSettingsBtn: document.getElementById('reset-settings'),
  
  // User
  username: document.getElementById('username'),
  logoutBtn: document.getElementById('logout-btn'),
  
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
    elements.apiUrl.value = state.settings.apiUrl || '';
    elements.poePath.value = state.settings.poePath || '';
    elements.autoStartSession.checked = state.settings.autoStartSession || false;
    elements.enableNotifications.checked = state.settings.notifications !== false;
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
      showToast('Giris Basarili', 'Hosgeldiniz!');
    } else {
      showToast('Giris Basarisiz', result.error, 'error');
    }
  } catch (error) {
    showToast('Hata', error.message || 'Giris sirasinda hata olustu', 'error');
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
      showToast('Kayit Basarili', 'Hesabiniz olusturuldu!');
    } else {
      showToast('Kayit Basarisiz', result.error, 'error');
    }
  } catch (error) {
    showToast('Hata', error.message || 'Kayit sirasinda hata olustu', 'error');
  }
}

/**
 * Cikis islemi
 */
async function handleLogout() {
  await window.electronAPI.logout();
  state.currentUser = null;
  elements.username.textContent = 'Misafir';
  showLoginModal();
}

/**
 * Mevcut kullaniciyi ayarla
 */
function setCurrentUser(user) {
  state.currentUser = user;
  elements.username.textContent = user.username;
}

/**
 * Session baslat
 */
async function handleStartSession() {
  const mapName = prompt('Map adini girin:', 'Dunes Map');
  if (!mapName) return;
  
  try {
    const session = await window.electronAPI.startSession({ mapName });
    if (session) {
      state.currentSession = session;
      updateActiveSessionUI();
      showToast('Session Basladi', `${mapName} baslatildi`);
    }
  } catch (error) {
    showToast('Hata', 'Session baslatilamadi', 'error');
  }
}

/**
 * Session bitir
 */
async function handleEndSession() {
  if (!state.currentSession) return;
  
  if (!confirm('Mevcut map session\'ini bitirmek istiyor musunuz?')) return;
  
  try {
    await window.electronAPI.endSession();
    state.currentSession = null;
    updateActiveSessionUI();
  } catch (error) {
    showToast('Hata', 'Session bitirilemedi', 'error');
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
          <span class="session-info-label">Map</span>
          <span class="session-info-value">${state.currentSession.mapName}</span>
        </div>
        <div class="session-info-item">
          <span class="session-info-label">Tier</span>
          <span class="session-info-value">${state.currentSession.mapTier || '-'}</span>
        </div>
        <div class="session-info-item">
          <span class="session-info-label">Baslangic</span>
          <span class="session-info-value">${new Date(state.currentSession.startedAt).toLocaleTimeString()}</span>
        </div>
        <div class="session-info-item">
          <span class="session-info-label">Durum</span>
          <span class="session-info-value" style="color: #2196f3;">Aktif</span>
        </div>
      </div>
    `;
    elements.startSessionBtn.classList.add('hidden');
    elements.endSessionBtn.classList.remove('hidden');
  } else {
    elements.activeSession.innerHTML = '<p class="empty-state">Aktif map yok</p>';
    elements.startSessionBtn.classList.remove('hidden');
    elements.endSessionBtn.classList.add('hidden');
  }
}

/**
 * Ekrani tara
 */
async function handleScanScreen() {
  if (!state.currentSession) {
    showToast('Hata', 'Once bir map session baslatin', 'warning');
    return;
  }
  
  elements.scanScreenBtn.disabled = true;
  elements.scanScreenBtn.textContent = 'Taraniyor...';
  
  try {
    await window.electronAPI.scanScreen();
    showToast('Tarama Tamamlandi', 'Loot basariyla eklendi');
  } catch (error) {
    showToast('Hata', 'Tarama sirasinda hata olustu', 'error');
  } finally {
    elements.scanScreenBtn.disabled = false;
    elements.scanScreenBtn.textContent = 'Ekrani Tara';
  }
}

/**
 * Session'lari yukle
 */
async function loadSessions() {
  const filter = elements.sessionFilter.value;
  // Not: Gercek implementasyonda API'den cekilecek
  // Su an placeholder
  elements.sessionsList.innerHTML = '<p class="empty-state">Session listesi yukleniyor...</p>';
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
  const settings = {
    apiUrl: elements.apiUrl.value,
    poePath: elements.poePath.value,
    autoStartSession: elements.autoStartSession.checked,
    notifications: elements.enableNotifications.checked
  };
  
  try {
    await window.electronAPI.setSettings(settings);
    state.settings = { ...state.settings, ...settings };
    showToast('Ayarlar', 'Ayarlar basariyla kaydedildi');
  } catch (error) {
    showToast('Hata', 'Ayarlar kaydedilemedi', 'error');
  }
}

/**
 * Ayarlari sifirla
 */
async function handleResetSettings() {
  if (!confirm('Tum ayarlari varsayilan degerlere sifirlamak istiyor musunuz?')) return;
  
  elements.apiUrl.value = 'http://localhost:3001';
  elements.poePath.value = '';
  elements.autoStartSession.checked = true;
  elements.enableNotifications.checked = true;
  
  await handleSaveSettings();
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
  return `${mins}dk ${secs}sn`;
}

// Uygulamayi baslat
document.addEventListener('DOMContentLoaded', init);
