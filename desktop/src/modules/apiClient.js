/**
 * API Client Module
 * Backend API communication
 */

const axios = require('axios');

function createOnlineDisabledError() {
  return {
    status: null,
    code: 'ONLINE_DISABLED',
    message: 'Online features are turned off',
    data: null
  };
}

function normalizeApiError(error) {
  if (error?.code === 'ONLINE_DISABLED') {
    return error;
  }

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
  // Nothing goes to the server until online features are turned on.
  constructor(baseURL, token = null, { online = false } = {}) {
    this.baseURL = baseURL;
    this.token = token;
    this.online = online === true;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Request interceptor - stop while offline, attach the token.
    this.client.interceptors.request.use(
      (config) => {
        if (!this.online) {
          throw createOnlineDisabledError();
        }
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

  setOnline(online) {
    this.online = online === true;
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

  /**
   * Take a backend-managed Path of Exile stash snapshot.
   */
  async takePoeStashSnapshot(data = {}) {
    const response = await this.client.post('/api/poe/snapshots', data, {
      timeout: 120000
    });
    return response.data;
  }

  /**
   * List backend-managed Path of Exile stash snapshots.
   */
  async listPoeStashSnapshots(params = {}) {
    const response = await this.client.get('/api/poe/snapshots', { params });
    return response.data;
  }

  /**
   * Load a backend-managed Path of Exile stash snapshot including item data.
   */
  async getPoeStashSnapshot(snapshotId) {
    const response = await this.client.get(`/api/poe/snapshots/${snapshotId}`);
    return response.data;
  }

  /**
   * Diff two backend-managed Path of Exile stash snapshots.
   */
  async diffPoeStashSnapshots(data = {}) {
    const response = await this.client.post('/api/poe/snapshots/diff', data, {
      timeout: 60000
    });
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
    // This path uses axios directly, so the instance interceptor above does not see it.
    if (!this.online) {
      throw createOnlineDisabledError();
    }

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

  // ==================== PRICES ====================

  /**
   * Get the current item types
   */
  async getTypes(params = {}) {
    const response = await this.client.get('/api/prices/types', { params });
    return response.data;
  }

  // ==================== FARMING HUB ====================

  async publishFarmRun(data = {}) {
    const response = await this.client.post('/api/farming-hub/runs', data);
    return response.data?.run;
  }

  async getMyPublishedFarmRuns(params = {}) {
    const response = await this.client.get('/api/farming-hub/runs/mine', { params });
    return response.data?.runs || [];
  }

  async getPublicFarmRuns(params = {}) {
    const response = await this.client.get('/api/farming-hub/runs', { params });
    return response.data?.runs || [];
  }

  async getPublishedFarmRun(runId) {
    const response = await this.client.get(`/api/farming-hub/runs/${runId}`);
    return response.data?.run;
  }

  async updatePublishedFarmRunVisibility(runId, visibility) {
    const response = await this.client.patch(`/api/farming-hub/runs/${runId}/visibility`, { visibility });
    return response.data?.run;
  }

  async deletePublishedFarmRun(runId) {
    const response = await this.client.delete(`/api/farming-hub/runs/${runId}`);
    return response.data;
  }
}

module.exports = APIClient;
