/**
 * Preload Script
 * Renderer process ile main process arasinda givenli iletisim
 */

const { contextBridge, ipcRenderer } = require('electron');

// API'yi expose et
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose: () => ipcRenderer.invoke('window-close'),

  // Ayarlar
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (settings) => ipcRenderer.invoke('set-settings', settings),

  // Auth
  hasAuthToken: () => ipcRenderer.invoke('has-auth-token'),

  // Dosya secici
  browsePoePath: () => ipcRenderer.invoke('browse-poe-path'),

  // Currency (IPC uzerinden guvenli)
  getCurrencyPrices: (params) => ipcRenderer.invoke('get-currency-prices', params),
  getCurrencyLeagues: (poeVersion) => ipcRenderer.invoke('get-currency-leagues', poeVersion),
  syncCurrencyPrices: (options) => ipcRenderer.invoke('sync-currency-prices', options),

  // Session islemleri
  startSession: (data) => ipcRenderer.invoke('start-session', data),
  endSession: () => ipcRenderer.invoke('end-session'),
  getCurrentSession: () => ipcRenderer.invoke('get-current-session'),
  getActiveFarmType: () => ipcRenderer.invoke('get-active-farm-type'),
  setActiveFarmType: (farmTypeId) => ipcRenderer.invoke('set-active-farm-type', farmTypeId),
  getSessionDetails: (sessionId) => ipcRenderer.invoke('get-session-details', sessionId),
  updateSessionDetails: (sessionId, payload) => ipcRenderer.invoke('update-session-details', sessionId, payload),
  getSessions: (params) => ipcRenderer.invoke('get-sessions', params),
  getDashboardStats: () => ipcRenderer.invoke('get-dashboard-stats'),

  // Loot islemleri
  addLoot: (data) => ipcRenderer.invoke('add-loot', data),
  scanScreen: () => ipcRenderer.invoke('scan-screen'),
  getRecentLoot: (params) => ipcRenderer.invoke('get-recent-loot', params),
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  getAuditTrail: () => ipcRenderer.invoke('get-audit-trail'),
  retryPendingLootActions: () => ipcRenderer.invoke('retry-pending-loot-actions'),
  exportDiagnostics: (mode) => ipcRenderer.invoke('export-diagnostics', mode),

  // Stash & Prices
  syncPrices: (options) => ipcRenderer.invoke('sync-prices', options),
  getPriceStatus: () => ipcRenderer.invoke('get-price-status'),
  takeStashSnapshot: (options) => ipcRenderer.invoke('take-stash-snapshot', options),
  calculateProfit: (beforeId, afterId) => ipcRenderer.invoke('calculate-profit', beforeId, afterId),
  getDetectedGame: () => ipcRenderer.invoke('get-detected-game'),

  // Auth
  login: (credentials) => ipcRenderer.invoke('login', credentials),
  register: (payload) => ipcRenderer.invoke('register', payload),
  logout: () => ipcRenderer.invoke('logout'),
  getCurrentUser: () => ipcRenderer.invoke('get-current-user'),
  startPoeConnect: () => ipcRenderer.invoke('start-poe-connect'),
  completePoeConnect: (data) => ipcRenderer.invoke('complete-poe-connect', data),
  getPoeLinkStatus: () => ipcRenderer.invoke('get-poe-link-status'),
  disconnectPoeAccount: () => ipcRenderer.invoke('disconnect-poe-account'),
  startPoeLogin: () => ipcRenderer.invoke('start-poe-login'),

  // Olay dinleyicileri
  onMapEntered: (callback) => {
    ipcRenderer.on('map-entered', (event, data) => callback(data));
  },
  onMapExited: (callback) => {
    ipcRenderer.on('map-exited', (event, data) => callback(data));
  },
  onSessionStarted: (callback) => {
    ipcRenderer.on('session-started', (event, data) => callback(data));
  },
  onSessionEnded: (callback) => {
    ipcRenderer.on('session-ended', (event, data) => callback(data));
  },
  onLootAdded: (callback) => {
    ipcRenderer.on('loot-added', (event, data) => callback(data));
  },
  onPendingLootUpdated: (callback) => {
    ipcRenderer.on('pending-loot-updated', (event, data) => callback(data));
  },
  onPendingSyncUpdated: (callback) => {
    ipcRenderer.on('pending-sync-updated', (event, data) => callback(data));
  },
  onAuditTrailUpdated: (callback) => {
    ipcRenderer.on('audit-trail-updated', (event, data) => callback(data));
  },
  onNavigate: (callback) => {
    ipcRenderer.on('navigate', (event, page) => callback(page));
  },
  onStashSnapshotTaken: (callback) => {
    ipcRenderer.on('stash-snapshot-taken', (event, data) => callback(data));
  },
  onProfitCalculated: (callback) => {
    ipcRenderer.on('profit-calculated', (event, data) => callback(data));
  },
  onGameVersionChanged: (callback) => {
    ipcRenderer.on('game-version-changed', (event, data) => callback(data));
  },
  onGameClosed: (callback) => {
    ipcRenderer.on('game-closed', (event, data) => callback(data));
  },

  // Dinleyicileri temizle (sadece izin verilen kanallar)
  removeAllListeners: (channel) => {
    const ALLOWED_CHANNELS = [
      'map-entered', 'map-exited', 'session-started', 'session-ended',
      'loot-added', 'pending-loot-updated', 'pending-sync-updated',
      'audit-trail-updated', 'navigate', 'stash-snapshot-taken',
      'profit-calculated', 'game-version-changed', 'game-closed'
    ];
    if (channel && ALLOWED_CHANNELS.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  }
});
