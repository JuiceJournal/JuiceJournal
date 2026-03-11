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

  // Session islemleri
  startSession: (data) => ipcRenderer.invoke('start-session', data),
  endSession: () => ipcRenderer.invoke('end-session'),
  getCurrentSession: () => ipcRenderer.invoke('get-current-session'),
  getSessionDetails: (sessionId) => ipcRenderer.invoke('get-session-details', sessionId),
  updateSessionDetails: (sessionId, payload) => ipcRenderer.invoke('update-session-details', sessionId, payload),
  getSessions: (params) => ipcRenderer.invoke('get-sessions', params),
  getDashboardStats: () => ipcRenderer.invoke('get-dashboard-stats'),

  // Loot islemleri
  addLoot: (data) => ipcRenderer.invoke('add-loot', data),
  scanScreen: () => ipcRenderer.invoke('scan-screen'),
  getRecentLoot: (params) => ipcRenderer.invoke('get-recent-loot', params),
  getPendingLootActions: () => ipcRenderer.invoke('get-pending-loot-actions'),
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  getAuditTrail: () => ipcRenderer.invoke('get-audit-trail'),
  retryPendingLootActions: () => ipcRenderer.invoke('retry-pending-loot-actions'),
  exportDiagnostics: () => ipcRenderer.invoke('export-diagnostics'),

  // Auth
  login: (credentials) => ipcRenderer.invoke('login', credentials),
  register: (payload) => ipcRenderer.invoke('register', payload),
  logout: () => ipcRenderer.invoke('logout'),
  getCurrentUser: () => ipcRenderer.invoke('get-current-user'),
  startPoeConnect: () => ipcRenderer.invoke('start-poe-connect'),
  completePoeConnect: (data) => ipcRenderer.invoke('complete-poe-connect', data),
  getPoeLinkStatus: () => ipcRenderer.invoke('get-poe-link-status'),
  disconnectPoeAccount: () => ipcRenderer.invoke('disconnect-poe-account'),

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

  // Dinleyicileri temizle
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});
