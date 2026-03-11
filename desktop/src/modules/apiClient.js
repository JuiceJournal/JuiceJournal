/**
 * API Client Module
 * Backend API ile iletisim
 */

const axios = require('axios');

function normalizeApiError(error) {
  const status = error.response?.status || null;
  const apiMessage = error.response?.data?.error;
  const apiErrorCode = error.response?.data?.errorCode || null;
  const responseMessage = typeof apiMessage === 'string' && apiMessage.trim()
    ? apiMessage.trim()
    : null;

  if (status === 401) {
    return {
      status,
      code: apiErrorCode || 'UNAUTHORIZED',
      message: responseMessage || 'Unauthorized request',
      data: error.response?.data || null
    };
  }

  if (responseMessage) {
    return {
      status,
      code: apiErrorCode || 'API_ERROR',
      message: responseMessage,
      data: error.response?.data || null
    };
  }

  if (error.code === 'ECONNABORTED') {
    return {
      status,
      code: 'REQUEST_TIMEOUT',
      message: 'The request timed out',
      data: null
    };
  }

  if (error.code === 'ERR_NETWORK' || /network|econnrefused|failed to fetch/i.test(error.message || '')) {
    return {
      status,
      code: 'SERVER_UNAVAILABLE',
      message: 'Unable to reach the server',
      data: null
    };
  }

  return {
    status,
    code: 'UNEXPECTED_ERROR',
    message: 'An unexpected error occurred',
    data: error.response?.data || null
  };
}

class APIClient {
  constructor(baseURL, token = null) {
    this.baseURL = baseURL;
    this.token = token;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Request interceptor - token ekle
    this.client.interceptors.request.use(
      (config) => {
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - hata yonetimi
    this.client.interceptors.response.use(
      (response) => response.data,
      (error) => {
        if (error.response) {
          const { status, data } = error.response;
          
          if (status === 401) {
            // Token gecersiz
            this.setToken(null);
          }
        }

        return Promise.reject(normalizeApiError(error));
      }
    );
  }

  /**
   * Token ayarla
   */
  setToken(token) {
    this.token = token;
  }

  /**
   * Base URL ayarla
   */
  setBaseURL(baseURL) {
    this.baseURL = baseURL;
    this.client.defaults.baseURL = baseURL;
  }

  /**
   * Saglik kontrolu
   */
  async healthCheck() {
    return this.client.get('/health');
  }

  // ==================== AUTH ====================

  /**
   * Giris yap
   */
  async login(credentials) {
    const response = await this.client.post('/api/auth/login', credentials);
    if (response.success && response.data.token) {
      this.setToken(response.data.token);
    }
    return response;
  }

  /**
   * Kayit ol
   */
  async register(userData) {
    const response = await this.client.post('/api/auth/register', userData);
    if (response.success && response.data.token) {
      this.setToken(response.data.token);
    }
    return response.data;
  }

  /**
   * Mevcut kullanici bilgilerini getir
   */
  async getMe() {
    const response = await this.client.get('/api/auth/me');
    return response.data;
  }

  /**
   * Path of Exile linking flow start
   */
  async startPoeConnect(data = {}) {
    const response = await this.client.post('/api/auth/poe/connect/start', data);
    return response.data;
  }

  /**
   * Complete Path of Exile linking
   */
  async completePoeConnect(data = {}) {
    const response = await this.client.post('/api/auth/poe/connect/complete', data);
    return response.data;
  }

  /**
   * Get Path of Exile link status
   */
  async getPoeLinkStatus() {
    const response = await this.client.get('/api/auth/poe/status');
    return response.data;
  }

  /**
   * Disconnect Path of Exile account
   */
  async disconnectPoeAccount() {
    const response = await this.client.delete('/api/auth/poe/disconnect');
    return response.data;
  }

  // ==================== SESSIONS ====================

  /**
   * Tum session'lari getir
   */
  async getSessions(params = {}) {
    const response = await this.client.get('/api/sessions', { params });
    return response.data;
  }

  /**
   * Aktif session'i getir
   */
  async getActiveSession() {
    const response = await this.client.get('/api/sessions/active');
    return response.data?.session || null;
  }

  /**
   * Session detayini getir
   */
  async getSession(sessionId) {
    const response = await this.client.get(`/api/sessions/${sessionId}`);
    return response.data?.session;
  }

  /**
   * Session metadata guncelle
   */
  async updateSession(sessionId, data) {
    const response = await this.client.put(`/api/sessions/${sessionId}`, data);
    return response.data?.session;
  }

  /**
   * Yeni session baslat
   */
  async startSession(data) {
    const response = await this.client.post('/api/sessions/start', data);
    return response.data?.session;
  }

  /**
   * Session'i bitir
   */
  async endSession(sessionId) {
    const response = await this.client.put(`/api/sessions/${sessionId}/end`);
    return response.data?.session;
  }

  /**
   * Session'i iptal et
   */
  async abandonSession(sessionId) {
    const response = await this.client.put(`/api/sessions/${sessionId}/abandon`);
    return response.data?.session;
  }

  /**
   * Session'i sil
   */
  async deleteSession(sessionId) {
    const response = await this.client.delete(`/api/sessions/${sessionId}`);
    return response.data;
  }

  // ==================== LOOT ====================

  /**
   * Loot entry ekle
   */
  async addLoot(sessionId, data) {
    const response = await this.client.post('/api/loot', {
      sessionId,
      ...data
    });
    return response.data;
  }

  /**
   * Toplu loot ekle
   */
  async addLootBulk(sessionId, items) {
    const response = await this.client.post('/api/loot/bulk', {
      sessionId,
      items
    });
    return response.data;
  }

  /**
   * Son loot entry'lerini getir
   */
  async getRecentLoot(params = {}) {
    const response = await this.client.get('/api/loot/recent', { params });
    return response.data;
  }

  /**
   * Session'in loot entry'lerini getir
   */
  async getLootBySession(sessionId, params = {}) {
    const response = await this.client.get(`/api/loot/session/${sessionId}`, { params });
    return response.data;
  }

  /**
   * Loot entry guncelle
   */
  async updateLoot(lootId, data) {
    const response = await this.client.put(`/api/loot/${lootId}`, data);
    return response.data;
  }

  /**
   * Loot entry sil
   */
  async deleteLoot(lootId) {
    const response = await this.client.delete(`/api/loot/${lootId}`);
    return response.data;
  }

  // ==================== PRICES ====================

  /**
   * Guncel fiyatlari getir
   */
  async getPrices(params = {}) {
    const response = await this.client.get('/api/prices/current', { params });
    return response.data;
  }

  /**
   * Belirli item'in fiyatini getir
   */
  async getItemPrice(itemName, params = {}) {
    const response = await this.client.get(`/api/prices/item/${encodeURIComponent(itemName)}`, {
      params
    });
    return response.data?.price;
  }

  /**
   * Fiyatlari senkronize et
   */
  async syncPrices(data = {}) {
    const response = await this.client.post('/api/prices/sync', data);
    return response.data;
  }

  /**
   * Mevcut ligleri getir
   */
  async getLeagues(params = {}) {
    const response = await this.client.get('/api/prices/leagues', { params });
    return response.data;
  }

  /**
   * Mevcut item tiplerini getir
   */
  async getTypes(params = {}) {
    const response = await this.client.get('/api/prices/types', { params });
    return response.data;
  }

  // ==================== STATS ====================

  /**
   * Kisisel istatistikleri getir
   */
  async getPersonalStats(period = 'weekly', context = {}) {
    const response = await this.client.get('/api/stats/personal', {
      params: {
        period,
        ...context
      }
    });
    return response.data;
  }

  /**
   * Leaderboard'u getir
   */
  async getLeaderboard(league, period, limit = 50) {
    const response = await this.client.get(`/api/stats/leaderboard/${league}/${period}`, {
      params: { limit }
    });
    return response.data;
  }

  /**
   * Genel ozet istatistikleri getir
   */
  async getSummaryStats(context = {}) {
    const response = await this.client.get('/api/stats/summary', {
      params: context
    });
    return response.data;
  }
}

module.exports = APIClient;
