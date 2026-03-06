/**
 * API Client Module
 * Backend API ile iletisim
 */

const axios = require('axios');

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
        console.error('API Hatasi:', error.message);
        
        if (error.response) {
          const { status, data } = error.response;
          
          if (status === 401) {
            // Token gecersiz
            this.setToken(null);
          }
          
          return Promise.reject({
            status,
            message: data?.error || 'Bir hata olustu',
            data
          });
        }
        
        return Promise.reject({
          message: error.message || 'Ag hatasi'
        });
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
    console.log('API login cagrildi:', credentials);
    const response = await this.client.post('/api/auth/login', credentials);
    console.log('API login yaniti:', response);
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
  async getPersonalStats(period = 'weekly') {
    const response = await this.client.get('/api/stats/personal', {
      params: { period }
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
  async getSummaryStats() {
    const response = await this.client.get('/api/stats/summary');
    return response.data;
  }
}

module.exports = APIClient;
