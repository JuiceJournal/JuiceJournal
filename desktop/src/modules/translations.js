/**
 * PoE Farm Tracker - i18n Translation Module
 * Supports: Turkish (tr), English (en)
 */

window.Translations = {
  tr: {
    // Navigation
    'nav.dashboard': 'Dashboard',
    'nav.sessions': "Session'lar",
    'nav.settings': 'Ayarlar',

    // User
    'user.guest': 'Misafir',
    'user.logout': 'Cikis',

    // Login
    'login.title': 'Giris Yap',
    'login.subtitle': 'Hesabiniza giris yaparak devam edin',
    'login.username': 'Kullanici Adi veya Email',
    'login.password': 'Sifre',
    'login.usernamePlaceholder': 'testuser',
    'login.passwordPlaceholder': 'Sifrenizi girin',
    'login.submit': 'Giris Yap',
    'login.or': 'veya',
    'login.createAccount': 'Yeni Hesap Olustur',

    // Register
    'register.title': 'Hesap Olustur',
    'register.subtitle': 'Yeni bir hesap olusturun',
    'register.username': 'Kullanici Adi',
    'register.email': 'Email',
    'register.password': 'Sifre',
    'register.usernamePlaceholder': 'En az 3 karakter',
    'register.emailPlaceholder': 'ornek@email.com',
    'register.passwordPlaceholder': 'En az 6 karakter',
    'register.submit': 'Kayit Ol',
    'register.or': 'veya',
    'register.login': 'Giris Yap',

    // Dashboard
    'dashboard.activeSession': 'Aktif Map Session',
    'dashboard.waiting': 'Bekleniyor',
    'dashboard.active': 'Aktif',
    'dashboard.noActiveMap': 'Aktif map yok',
    'dashboard.newMap': 'Yeni Map Baslat',
    'dashboard.endMap': "Map'i Bitir",
    'dashboard.todaySummary': 'Bugunku Ozet',
    'dashboard.map': 'Map',
    'dashboard.profit': 'Kar',
    'dashboard.avgPerMap': 'Ort/Map',
    'dashboard.quickLoot': 'Hizli Loot Ekle',
    'dashboard.scanHint': 'Stash ekranini taramak icin kisayol tusunu kullanin veya butona basin.',
    'dashboard.scanScreen': 'Ekrani Tara',
    'dashboard.scanning': 'Taraniyor...',
    'dashboard.recentLoot': "Son Loot'lar",
    'dashboard.noLoot': 'Henuz loot eklenmedi',

    // Sessions
    'sessions.title': "Map Session'lari",
    'sessions.all': 'Tumu',
    'sessions.active': 'Aktif',
    'sessions.completed': 'Tamamlanmis',
    'sessions.abandoned': 'Iptal Edilmis',
    'sessions.empty': 'Henuz session yok',
    'sessions.loading': 'Session listesi yukleniyor...',

    // Session info
    'session.map': 'Map',
    'session.tier': 'Tier',
    'session.start': 'Baslangic',
    'session.status': 'Durum',

    // Settings
    'settings.title': 'Ayarlar',
    'settings.general': 'Genel',
    'settings.poe': 'Path of Exile',
    'settings.hotkeys': 'Kisayollar',
    'settings.notifications': 'Bildirimler',
    'settings.api': 'API Baglantisi',
    'settings.about': 'Hakkinda',

    // Settings - General
    'settings.language': 'Dil',
    'settings.theme': 'Tema',
    'settings.themeDark': 'Koyu',
    'settings.league': 'Aktif Lig',
    'settings.leaguePlaceholder': 'Ornegin: Settlers of Kalguur',

    // Settings - PoE
    'settings.clientTxtPath': 'Client.txt Dosya Yolu',
    'settings.browse': 'Gozat',
    'settings.autoStartSession': 'Yeni map girisinde otomatik session baslat',
    'settings.poeVersion': 'PoE Versiyonu',
    'settings.defaultLeague': 'Varsayilan Lig',
    'settings.defaultLeaguePlaceholder': 'Standard',

    // Settings - Hotkeys
    'settings.scanHotkey': 'Loot Tarama',
    'settings.scanHotkeyDesc': 'Stash ekranini taramak icin kullanilir',
    'settings.stashScanHotkey': 'Stash Tarama',
    'settings.stashScanHotkeyDesc': 'Alternatif stash tarama kisayolu',
    'settings.hotkeyHint': 'Kisayollari degistirmek icin Ayarlar > Kisayollar bolumune gidin',

    // Settings - Notifications
    'settings.desktopNotifications': 'Masaustu bildirimlerini etkinlestir',
    'settings.soundNotifications': 'Ses bildirimlerini etkinlestir',

    // Settings - API
    'settings.apiUrl': 'API URL',
    'settings.apiUrlPlaceholder': 'http://localhost:3001',
    'settings.connectionStatus': 'Baglanti Durumu',
    'settings.connected': 'Bagli',
    'settings.disconnected': 'Baglanti Yok',
    'settings.testConnection': 'Baglantiyi Test Et',
    'settings.testing': 'Test ediliyor...',

    // Settings - About
    'settings.version': 'Versiyon',
    'settings.developer': 'Gelistirici',
    'settings.github': 'GitHub',
    'settings.reportBug': 'Hata Bildir',
    'settings.license': 'Lisans',

    // Settings - Actions
    'settings.save': 'Kaydet',
    'settings.reset': 'Varsayilanlara Sifirla',
    'settings.resetConfirm': 'Tum ayarlari varsayilan degerlere sifirlamak istiyor musunuz?',

    // Toasts
    'toast.loginSuccess': 'Hosgeldiniz!',
    'toast.loginFailed': 'Giris Basarisiz',
    'toast.registerSuccess': 'Hesabiniz olusturuldu!',
    'toast.registerFailed': 'Kayit Basarisiz',
    'toast.settingsSaved': 'Ayarlar basariyla kaydedildi',
    'toast.settingsError': 'Ayarlar kaydedilemedi',
    'toast.sessionStarted': 'baslatildi',
    'toast.sessionError': 'Session baslatilamadi',
    'toast.endSessionError': 'Session bitirilemedi',
    'toast.scanComplete': 'Loot basariyla eklendi',
    'toast.scanError': 'Tarama sirasinda hata olustu',
    'toast.noSession': 'Once bir map session baslatin',
    'toast.error': 'Hata',
    'toast.connectionSuccess': 'API baglantisi basarili',
    'toast.connectionFailed': 'API baglantisi basarisiz',

    // Misc
    'misc.mapPrompt': 'Map adini girin:',
    'misc.endSessionConfirm': "Mevcut map session'ini bitirmek istiyor musunuz?",
    'misc.durationMin': 'dk',
    'misc.durationSec': 'sn',
  },

  en: {
    // Navigation
    'nav.dashboard': 'Dashboard',
    'nav.sessions': 'Sessions',
    'nav.settings': 'Settings',

    // User
    'user.guest': 'Guest',
    'user.logout': 'Logout',

    // Login
    'login.title': 'Sign In',
    'login.subtitle': 'Sign in to your account to continue',
    'login.username': 'Username or Email',
    'login.password': 'Password',
    'login.usernamePlaceholder': 'testuser',
    'login.passwordPlaceholder': 'Enter your password',
    'login.submit': 'Sign In',
    'login.or': 'or',
    'login.createAccount': 'Create New Account',

    // Register
    'register.title': 'Create Account',
    'register.subtitle': 'Create a new account',
    'register.username': 'Username',
    'register.email': 'Email',
    'register.password': 'Password',
    'register.usernamePlaceholder': 'At least 3 characters',
    'register.emailPlaceholder': 'example@email.com',
    'register.passwordPlaceholder': 'At least 6 characters',
    'register.submit': 'Sign Up',
    'register.or': 'or',
    'register.login': 'Sign In',

    // Dashboard
    'dashboard.activeSession': 'Active Map Session',
    'dashboard.waiting': 'Waiting',
    'dashboard.active': 'Active',
    'dashboard.noActiveMap': 'No active map',
    'dashboard.newMap': 'Start New Map',
    'dashboard.endMap': 'End Map',
    'dashboard.todaySummary': "Today's Summary",
    'dashboard.map': 'Maps',
    'dashboard.profit': 'Profit',
    'dashboard.avgPerMap': 'Avg/Map',
    'dashboard.quickLoot': 'Quick Loot Add',
    'dashboard.scanHint': 'Use the hotkey to scan your stash screen or click the button.',
    'dashboard.scanScreen': 'Scan Screen',
    'dashboard.scanning': 'Scanning...',
    'dashboard.recentLoot': 'Recent Loot',
    'dashboard.noLoot': 'No loot added yet',

    // Sessions
    'sessions.title': 'Map Sessions',
    'sessions.all': 'All',
    'sessions.active': 'Active',
    'sessions.completed': 'Completed',
    'sessions.abandoned': 'Abandoned',
    'sessions.empty': 'No sessions yet',
    'sessions.loading': 'Loading sessions...',

    // Session info
    'session.map': 'Map',
    'session.tier': 'Tier',
    'session.start': 'Started',
    'session.status': 'Status',

    // Settings
    'settings.title': 'Settings',
    'settings.general': 'General',
    'settings.poe': 'Path of Exile',
    'settings.hotkeys': 'Hotkeys',
    'settings.notifications': 'Notifications',
    'settings.api': 'API Connection',
    'settings.about': 'About',

    // Settings - General
    'settings.language': 'Language',
    'settings.theme': 'Theme',
    'settings.themeDark': 'Dark',
    'settings.league': 'Active League',
    'settings.leaguePlaceholder': 'e.g. Settlers of Kalguur',

    // Settings - PoE
    'settings.clientTxtPath': 'Client.txt File Path',
    'settings.browse': 'Browse',
    'settings.autoStartSession': 'Auto-start session on new map entry',
    'settings.poeVersion': 'PoE Version',
    'settings.defaultLeague': 'Default League',
    'settings.defaultLeaguePlaceholder': 'Standard',

    // Settings - Hotkeys
    'settings.scanHotkey': 'Loot Scan',
    'settings.scanHotkeyDesc': 'Used to scan your stash screen',
    'settings.stashScanHotkey': 'Stash Scan',
    'settings.stashScanHotkeyDesc': 'Alternative stash scan hotkey',
    'settings.hotkeyHint': 'Go to Settings > Hotkeys to change shortcuts',

    // Settings - Notifications
    'settings.desktopNotifications': 'Enable desktop notifications',
    'settings.soundNotifications': 'Enable sound notifications',

    // Settings - API
    'settings.apiUrl': 'API URL',
    'settings.apiUrlPlaceholder': 'http://localhost:3001',
    'settings.connectionStatus': 'Connection Status',
    'settings.connected': 'Connected',
    'settings.disconnected': 'Disconnected',
    'settings.testConnection': 'Test Connection',
    'settings.testing': 'Testing...',

    // Settings - About
    'settings.version': 'Version',
    'settings.developer': 'Developer',
    'settings.github': 'GitHub',
    'settings.reportBug': 'Report Bug',
    'settings.license': 'License',

    // Settings - Actions
    'settings.save': 'Save',
    'settings.reset': 'Reset to Defaults',
    'settings.resetConfirm': 'Are you sure you want to reset all settings to defaults?',

    // Toasts
    'toast.loginSuccess': 'Welcome!',
    'toast.loginFailed': 'Login Failed',
    'toast.registerSuccess': 'Account created!',
    'toast.registerFailed': 'Registration Failed',
    'toast.settingsSaved': 'Settings saved successfully',
    'toast.settingsError': 'Failed to save settings',
    'toast.sessionStarted': 'started',
    'toast.sessionError': 'Failed to start session',
    'toast.endSessionError': 'Failed to end session',
    'toast.scanComplete': 'Loot added successfully',
    'toast.scanError': 'Error during scan',
    'toast.noSession': 'Start a map session first',
    'toast.error': 'Error',
    'toast.connectionSuccess': 'API connection successful',
    'toast.connectionFailed': 'API connection failed',

    // Misc
    'misc.mapPrompt': 'Enter map name:',
    'misc.endSessionConfirm': 'Do you want to end the current map session?',
    'misc.durationMin': 'm',
    'misc.durationSec': 's',
  }
};

/**
 * Get translation for a key
 */
window.t = function(key) {
  const lang = (window._appState && window._appState.language) || 'tr';
  return window.Translations[lang]?.[key] || window.Translations['tr']?.[key] || key;
};

/**
 * Apply translations to all elements with data-i18n attributes
 */
window.applyTranslations = function() {
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    el.textContent = window.t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
    el.placeholder = window.t(el.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(function(el) {
    el.setAttribute('aria-label', window.t(el.getAttribute('data-i18n-aria')));
  });
  var lang = (window._appState && window._appState.language) || 'tr';
  document.documentElement.lang = lang;
};
