/**
 * API Client Module
 * Backend API communication
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

    // Request interceptor - attach the token.
    this.client.interceptors.request.use(
      (config) => {
        if (this.token) {
          config.headers.Cookie = this.token;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - normalize errors.
    // Note: this unwraps response.data, so this.client.get() returns the HTTP body directly
    // All methods that do `response.data` are accessing the `.data` field of the API response body
    this.client.interceptors.response.use(
      (response) => response.data,
      (error) => {
        if (error.response) {
          const { status, data } = error.response;
          
          if (status === 401) {
            // The token is no longer valid.
            this.setToken(null);
          }
        }

        return Promise.reject(normalizeApiError(error));
      }
    );
  }

  /**
   * Set the token
   */
  setToken(token) {
    this.token = token;
  }

  getToken() {
    return this.token;
  }

  /**
   * Set the base URL
   */
  setBaseURL(baseURL) {
    this.baseURL = baseURL;
    this.client.defaults.baseURL = baseURL;
  }

  /**
   * Health check
   */
  async healthCheck() {
    return this.client.get('/health');
  }

  // ==================== AUTH ====================

  /**
   * Sign in
   */
  async login(credentials) {
    return this.requestWithSessionCookie({
      method: 'POST',
      url: '/api/auth/login',
      data: credentials
    });
  }

  /**
   * Register
   */
  async register(userData) {
    const response = await this.requestWithSessionCookie({
      method: 'POST',
      url: '/api/auth/register',
      data: userData
    });
    return response.data;
  }

  /**
   * Get the current user details
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
   * Path of Exile OAuth login flow start (no existing session required)
   */
  async startPoeLogin(data = {}) {
    const response = await this.client.post('/api/auth/poe/login/start', data);
    return response.data;
  }

  /**
   * Complete Path of Exile OAuth login.
   * Returns the full envelope { success, data: { user, token, capabilities, poe }, error }
   * so the caller can persist the JWT — mirrors login()/register() behaviour.
   */
  async completePoeLogin(data = {}) {
    return this.requestWithSessionCookie({
      method: 'POST',
      url: '/api/auth/poe/login/complete',
      data
    });
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

  extractAuthCookie(response) {
    const cookies = response?.headers?.['set-cookie'];
    if (!Array.isArray(cookies)) {
      return null;
    }

    const match = cookies.find((value) => typeof value === 'string' && value.startsWith('juice_journal_auth='));
    if (!match) {
      return null;
    }

    return match.split(';')[0] || null;
  }

  async requestWithSessionCookie(config) {
    const response = await axios.request({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Cookie: this.token } : {})
      },
      ...config
    });

    const sessionCookie = this.extractAuthCookie(response);
    if (sessionCookie) {
      this.setToken(sessionCookie);
    }

    return response.data;
  }

  // ==================== SESSIONS ====================

  /**
   * Get all sessions
   */
  async getSessions(params = {}) {
    const response = await this.client.get('/api/sessions', { params });
    return response.data;
  }

  /**
   * Get the active session
   */
  async getActiveSession() {
    const response = await this.client.get('/api/sessions/active');
    return response.data?.session || null;
  }

  /**
   * Get session details
   */
  async getSession(sessionId) {
    const response = await this.client.get(`/api/sessions/${sessionId}`);
    return response.data?.session;
  }

  /**
   * Update session metadata
   */
  async updateSession(sessionId, data) {
    const response = await this.client.put(`/api/sessions/${sessionId}`, data);
    return response.data?.session;
  }

  /**
   * Start a new session
   */
  async startSession(data) {
    const response = await this.client.post('/api/sessions/start', data);
    return response.data?.session;
  }

  /**
   * End a session
   */
  async endSession(sessionId, data = {}) {
    const response = await this.client.put(`/api/sessions/${sessionId}/end`, data);
    return response.data?.session;
  }

  /**
   * Abandon a session
   */
  async abandonSession(sessionId, data = {}) {
    const response = await this.client.put(`/api/sessions/${sessionId}/abandon`, data);
    return response.data?.session;
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId) {
    const response = await this.client.delete(`/api/sessions/${sessionId}`);
    return response.data;
  }

  // ==================== LOOT ====================

  /**
   * Add a loot entry
   */
  async addLoot(sessionId, data) {
    const response = await this.client.post('/api/loot', {
      sessionId,
      ...data
    });
    return response.data;
  }

  /**
   * Add loot in bulk
   */
  async addLootBulk(sessionId, items) {
    const response = await this.client.post('/api/loot/bulk', {
      sessionId,
      items
    });
    return response.data;
  }

  /**
   * Get recent loot entries
   */
  async getRecentLoot(params = {}) {
    const response = await this.client.get('/api/loot/recent', { params });
    return response.data;
  }

  /**
   * Get the loot entries for a session
   */
  async getLootBySession(sessionId, params = {}) {
    const response = await this.client.get(`/api/loot/session/${sessionId}`, { params });
    return response.data;
  }

  /**
   * Update a loot entry
   */
  async updateLoot(lootId, data) {
    const response = await this.client.put(`/api/loot/${lootId}`, data);
    return response.data;
  }

  /**
   * Delete a loot entry
   */
  async deleteLoot(lootId) {
    const response = await this.client.delete(`/api/loot/${lootId}`);
    return response.data;
  }

  // ==================== PRICES ====================

  /**
   * Get current prices
   */
  async getPrices(params = {}) {
    const response = await this.client.get('/api/prices/current', { params });
    return response.data;
  }

  /**
   * Get the price for a specific item
   */
  async getItemPrice(itemName, params = {}) {
    const response = await this.client.get(`/api/prices/item/${encodeURIComponent(itemName)}`, {
      params
    });
    return response.data?.price;
  }

  /**
   * Sync prices
   */
  async syncPrices(data = {}) {
    const response = await this.client.post('/api/prices/sync', data, {
      timeout: 120000 // Sync fetches many types sequentially, needs longer timeout
    });
    return response.data;
  }

  /**
   * Get the current leagues
   */
  async getLeagues(params = {}) {
    const response = await this.client.get('/api/prices/leagues', { params });
    return response.data;
  }

  /**
   * Get the current item types
   */
  async getTypes(params = {}) {
    const response = await this.client.get('/api/prices/types', { params });
    return response.data;
  }

  // ==================== STATS ====================

  /**
   * Get personal statistics
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
