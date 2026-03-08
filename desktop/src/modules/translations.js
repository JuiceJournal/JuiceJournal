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
    'dashboard.liveLoot': 'Loot Toplami',
    'dashboard.liveProfit': 'Anlik Kar',
    'dashboard.itemsCollected': 'Item',
    'dashboard.elapsed': 'Gecen Sure',

    // Sessions
    'sessions.title': "Map Session'lari",
    'sessions.all': 'Tumu',
    'sessions.active': 'Aktif',
    'sessions.completed': 'Tamamlanmis',
    'sessions.abandoned': 'Iptal Edilmis',
    'sessions.empty': 'Henuz session yok',
    'sessions.loading': 'Session listesi yukleniyor...',
    'sessions.loadError': 'Session listesi yuklenemedi',
    'sessions.duration': 'Sure',
    'sessions.lootCount': 'Loot',
    'sessions.detailKicker': 'Run Detayi',
    'sessions.detailLoading': 'Session detaylari yukleniyor...',
    'sessions.lootBreakdown': 'Loot Dagilimi',
    'sessions.detailEmptyLoot': 'Bu run icin loot kaydi yok',
    'sessions.cost': 'Maliyet',
    'sessions.totalLoot': 'Toplam Loot',
    'sessions.game': 'Oyun',
    'sessions.startedAt': 'Basladi',
    'sessions.endedAt': 'Bitti',
    'sessions.sessionNotes': 'Session Notlari',
    'sessions.strategyTag': 'Strategy Tag',
    'sessions.strategyPlaceholder': 'Orn. Strongbox / Legion / Ritual',
    'sessions.notes': 'Notlar',
    'sessions.notesPlaceholder': 'Onemli droplar, hatalar, atlas kurulumu, scarablar...',
    'sessions.saveNotes': 'Notlari Kaydet',
    'sessions.categoryAnalytics': 'Kategori Analizi',
    'sessions.analyticsEmpty': 'Kategori analizi icin loot verisi yok',
    'sessions.analyticsItems': 'adet',
    'sessions.analyticsEntries': 'kayit',
    'sessions.analyticsValue': 'deger',

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
    'settings.poeAccount': 'Path of Exile Hesabi',
    'settings.poeNotLinked': 'Bagli Degil',
    'settings.poeNoAccount': 'Henuz bagli bir Path of Exile hesabi yok.',
    'settings.poeMockMode': 'Gercek GGG OAuth istemcisi gelene kadar mock mod kullanilacak.',
    'settings.poeSignInRequired': 'Giris gerekli',
    'settings.poeSignInHint': 'Path of Exile baglantisini yonetmek icin once yerel uygulama hesabi ile giris yapin.',
    'settings.poeLinked': 'Baglandi',
    'settings.poeLinkedMock': 'Baglandi (Mock)',
    'settings.poeLiveMode': 'Yapilandirilmis Path of Exile OAuth uygulamasi uzerinden baglandi.',
    'settings.connectPoe': 'Path of Exile Bagla',
    'settings.disconnectPoe': 'Baglantiyi Kaldir',

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
    'toast.mapEnteredTitle': 'Map Girisi',
    'toast.mapEnteredBody': '{mapName} mapine girildi',
    'toast.mapExitedTitle': 'Map Cikisi',
    'toast.mapExitedBody': '{mapName} tamamlandi. Sure: {duration}',
    'toast.sessionStartedTitle': 'Session Basladi',
    'toast.sessionStartedBody': '{mapName} baslatildi',
    'toast.sessionCompletedTitle': 'Session Tamamlandi',
    'toast.sessionProfitBody': 'Kar: {value}c',
    'toast.sessionLossBody': 'Zarar: {value}c',
    'toast.lootAddedTitle': 'Loot Eklendi',
    'toast.lootAddedBody': '{count} item eklendi',
    'toast.currencyTitle': 'Currency',
    'toast.poeTitle': 'Path of Exile',
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
    'toast.poeLinked': 'Path of Exile hesabi baglandi',
    'toast.poeLinkedMock': 'Mock Path of Exile hesabi baglandi',
    'toast.poeDisconnected': 'Path of Exile hesabi baglantisi kaldirildi',
    'toast.poeSignInFirst': 'Once yerel uygulama hesabiyla giris yapin',
    'toast.poeConnectError': 'Path of Exile hesabi baglanamadi',
    'toast.poeDisconnectError': 'Path of Exile hesabi baglantisi kaldirilamadi',
    'toast.unexpectedError': 'Beklenmeyen bir hata olustu',
    'toast.sessionUpdated': 'Session notlari kaydedildi',
    'toast.sessionUpdateError': 'Session notlari kaydedilemedi',

    // Error messages
    'errors.invalidCredentials': 'Kullanici adi veya sifre hatali',
    'errors.usernameOrEmailRequired': 'Kullanici adi veya e-posta gereklidir',
    'errors.passwordRequired': 'Sifre gereklidir',
    'errors.usernameLength': 'Kullanici adi 3-50 karakter arasinda olmalidir',
    'errors.usernameAlphanumeric': 'Kullanici adi sadece harf ve rakam icerebilir',
    'errors.emailInvalid': 'Gecerli bir e-posta adresi giriniz',
    'errors.passwordMinLength': 'Sifre en az 6 karakter olmalidir',
    'errors.usernameTaken': 'Bu kullanici adi zaten kullaniliyor',
    'errors.emailTaken': 'Bu e-posta adresi zaten kullaniliyor',
    'errors.registerFailed': 'Kayit sirasinda bir hata olustu',
    'errors.loginFailed': 'Giris sirasinda bir hata olustu',
    'errors.profileLoad': 'Profil bilgileri alinirken hata olustu',
    'errors.profileUpdate': 'Profil guncellenirken hata olustu',
    'errors.sessionNotFound': 'Session bulunamadi',
    'errors.activeSessionNotFound': 'Aktif session bulunamadi',
    'errors.sessionLoad': 'Session detaylari alinamadi',
    'errors.sessionListLoad': 'Session listesi yuklenemedi',
    'errors.sessionUpdate': 'Session detaylari guncellenemedi',
    'errors.sessionStart': 'Session baslatilamadi',
    'errors.sessionEnd': 'Session bitirilemedi',
    'errors.noActiveSession': 'Aktif session yok',
    'errors.lootAdd': 'Loot eklenemedi',
    'errors.lootRecent': 'Son loot verileri alinamadi',
    'errors.poeOAuthNotConfigured': 'Path of Exile OAuth yapilandirilmamis',
    'errors.invalidRedirectUri': 'Gecersiz yonlendirme adresi',
    'errors.authorizationCodeRequired': 'Yetkilendirme kodu ve PKCE verifier gereklidir',
    'errors.poeStart': 'Path of Exile baglantisi baslatilamadi',
    'errors.poeComplete': 'Path of Exile baglantisi tamamlanamadi',
    'errors.poeStatus': 'Path of Exile baglanti durumu alinamadi',
    'errors.poeDisconnect': 'Path of Exile baglantisi kaldirilamadi',

    // Currency
    'nav.currency': 'Currency',
    'currency.title': 'Currency Fiyatlari',
    'currency.allTypes': 'Tumu',
    'currency.searchPlaceholder': 'Item ara...',
    'currency.sync': 'Senkronize Et',
    'currency.syncing': 'Senkronize ediliyor...',
    'currency.syncSuccess': 'Fiyatlar basariyla senkronize edildi',
    'currency.syncFailed': 'Senkronizasyon basarisiz',
    'currency.name': 'Ad',
    'currency.type': 'Tip',
    'currency.trend': 'Trend',
    'currency.noData': 'Fiyat verisi yok. Senkronize butonuna basin.',
    'currency.loading': 'Fiyatlar yukleniyor...',
    'currency.loadError': 'Fiyatlar yuklenirken hata olustu',

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
    'dashboard.liveLoot': 'Loot Total',
    'dashboard.liveProfit': 'Live Profit',
    'dashboard.itemsCollected': 'Items',
    'dashboard.elapsed': 'Elapsed',

    // Sessions
    'sessions.title': 'Map Sessions',
    'sessions.all': 'All',
    'sessions.active': 'Active',
    'sessions.completed': 'Completed',
    'sessions.abandoned': 'Abandoned',
    'sessions.empty': 'No sessions yet',
    'sessions.loading': 'Loading sessions...',
    'sessions.loadError': 'Failed to load sessions',
    'sessions.duration': 'Duration',
    'sessions.lootCount': 'Loot',
    'sessions.detailKicker': 'Run Detail',
    'sessions.detailLoading': 'Loading session details...',
    'sessions.lootBreakdown': 'Loot Breakdown',
    'sessions.detailEmptyLoot': 'No loot recorded for this run',
    'sessions.cost': 'Cost',
    'sessions.totalLoot': 'Total Loot',
    'sessions.game': 'Game',
    'sessions.startedAt': 'Started',
    'sessions.endedAt': 'Ended',
    'sessions.sessionNotes': 'Session Notes',
    'sessions.strategyTag': 'Strategy Tag',
    'sessions.strategyPlaceholder': 'e.g. Strongbox / Legion / Ritual',
    'sessions.notes': 'Notes',
    'sessions.notesPlaceholder': 'Important drops, mistakes, atlas setup, scarabs...',
    'sessions.saveNotes': 'Save Notes',
    'sessions.categoryAnalytics': 'Category Analytics',
    'sessions.analyticsEmpty': 'No loot data available for category analytics',
    'sessions.analyticsItems': 'items',
    'sessions.analyticsEntries': 'entries',
    'sessions.analyticsValue': 'value',

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
    'settings.poeAccount': 'Path of Exile Account',
    'settings.poeNotLinked': 'Not linked',
    'settings.poeNoAccount': 'No Path of Exile account connected yet.',
    'settings.poeMockMode': 'Mock mode will be used until a real GGG OAuth client is configured.',
    'settings.poeSignInRequired': 'Sign in required',
    'settings.poeSignInHint': 'Sign in with your local app account to manage Path of Exile linking.',
    'settings.poeLinked': 'Linked',
    'settings.poeLinkedMock': 'Linked (Mock)',
    'settings.poeLiveMode': 'Connected through the configured Path of Exile OAuth application.',
    'settings.connectPoe': 'Connect Path of Exile',
    'settings.disconnectPoe': 'Disconnect',

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
    'toast.mapEnteredTitle': 'Map Entered',
    'toast.mapEnteredBody': 'Entered {mapName}',
    'toast.mapExitedTitle': 'Map Finished',
    'toast.mapExitedBody': '{mapName} completed. Duration: {duration}',
    'toast.sessionStartedTitle': 'Session Started',
    'toast.sessionStartedBody': '{mapName} started',
    'toast.sessionCompletedTitle': 'Session Completed',
    'toast.sessionProfitBody': 'Profit: {value}c',
    'toast.sessionLossBody': 'Loss: {value}c',
    'toast.lootAddedTitle': 'Loot Added',
    'toast.lootAddedBody': '{count} items added',
    'toast.currencyTitle': 'Currency',
    'toast.poeTitle': 'Path of Exile',
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
    'toast.poeLinked': 'Path of Exile account linked',
    'toast.poeLinkedMock': 'Mock Path of Exile account linked',
    'toast.poeDisconnected': 'Path of Exile account disconnected',
    'toast.poeSignInFirst': 'Sign in with your local app account first',
    'toast.poeConnectError': 'Failed to connect Path of Exile account',
    'toast.poeDisconnectError': 'Failed to disconnect Path of Exile account',
    'toast.unexpectedError': 'An unexpected error occurred',
    'toast.sessionUpdated': 'Session notes saved',
    'toast.sessionUpdateError': 'Failed to save session notes',

    // Error messages
    'errors.invalidCredentials': 'Invalid username or password',
    'errors.usernameOrEmailRequired': 'Username or email is required',
    'errors.passwordRequired': 'Password is required',
    'errors.usernameLength': 'Username must be between 3 and 50 characters',
    'errors.usernameAlphanumeric': 'Username may only contain letters and numbers',
    'errors.emailInvalid': 'Enter a valid email address',
    'errors.passwordMinLength': 'Password must be at least 6 characters',
    'errors.usernameTaken': 'That username is already in use',
    'errors.emailTaken': 'That email address is already in use',
    'errors.registerFailed': 'An error occurred during registration',
    'errors.loginFailed': 'An error occurred during sign in',
    'errors.profileLoad': 'Failed to load profile details',
    'errors.profileUpdate': 'Failed to update profile',
    'errors.sessionNotFound': 'Session not found',
    'errors.activeSessionNotFound': 'Active session not found',
    'errors.sessionLoad': 'Failed to load session details',
    'errors.sessionListLoad': 'Failed to load sessions',
    'errors.sessionUpdate': 'Failed to update session details',
    'errors.sessionStart': 'Failed to start the session',
    'errors.sessionEnd': 'Failed to end the session',
    'errors.noActiveSession': 'No active session',
    'errors.lootAdd': 'Failed to add loot',
    'errors.lootRecent': 'Failed to load recent loot',
    'errors.poeOAuthNotConfigured': 'Path of Exile OAuth is not configured',
    'errors.invalidRedirectUri': 'Invalid redirect URI',
    'errors.authorizationCodeRequired': 'Authorization code and PKCE verifier are required',
    'errors.poeStart': 'Failed to start Path of Exile linking',
    'errors.poeComplete': 'Failed to complete Path of Exile linking',
    'errors.poeStatus': 'Failed to get Path of Exile link status',
    'errors.poeDisconnect': 'Failed to disconnect Path of Exile account',

    // Currency
    'nav.currency': 'Currency',
    'currency.title': 'Currency Prices',
    'currency.allTypes': 'All',
    'currency.searchPlaceholder': 'Search items...',
    'currency.sync': 'Sync',
    'currency.syncing': 'Syncing...',
    'currency.syncSuccess': 'Prices synced successfully',
    'currency.syncFailed': 'Sync failed',
    'currency.name': 'Name',
    'currency.type': 'Type',
    'currency.trend': 'Trend',
    'currency.noData': 'No price data. Click Sync to fetch.',
    'currency.loading': 'Loading prices...',
    'currency.loadError': 'Failed to load prices',

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
window.t = function(key, values) {
  const lang = (window._appState && window._appState.language) || 'en';
  const template = window.Translations[lang]?.[key] || window.Translations['en']?.[key] || key;
  const tokens = values || {};
  return String(template).replace(/\{(\w+)\}/g, function(match, token) {
    return Object.prototype.hasOwnProperty.call(tokens, token) ? String(tokens[token]) : match;
  });
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
  var lang = (window._appState && window._appState.language) || 'en';
  document.documentElement.lang = lang;
};
