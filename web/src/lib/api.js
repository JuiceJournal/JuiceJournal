/**
 * API Client
 * Backend API communication
 */

import axios from 'axios';

let API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

if (
  typeof process !== 'undefined' &&
  process.env.NODE_ENV === 'production' &&
  !API_URL.startsWith('https://')
) {
  console.warn(
    `[api] NEXT_PUBLIC_API_URL must use https:// in production, got: ${API_URL}`
  );
}
const LEGACY_TOKEN_KEY = 'token';

const API_ERROR_MESSAGE_MAP = {
  FORBIDDEN: 'You do not have permission to perform this action.',
  PRICE_SYNC_IN_PROGRESS: 'Price sync is already running for this context.',
  PRICE_SYNC_COOLDOWN: 'Prices were synced recently for this context.',
  SESSION_NOT_FOUND: 'Session not found.',
  ACTIVE_SESSION_NOT_FOUND: 'No active session was found.',
  SESSION_ALREADY_ACTIVE: 'An active session already exists.',
  SESSION_START_FAILED: 'Unable to start the session.',
  SESSION_END_FAILED: 'Unable to end the session.',
  SESSION_LIST_LOAD_FAILED: 'Unable to load sessions right now.',
  SESSION_LOAD_FAILED: 'Unable to load the session right now.',
  SESSION_UPDATE_FAILED: 'Unable to update the session right now.',
  LOOT_NOT_FOUND: 'Loot entry not found.',
  LOOT_ADD_FAILED: 'Unable to add loot right now.',
  LOOT_BULK_ADD_FAILED: 'Unable to add loot right now.',
  RECENT_LOOT_LOAD_FAILED: 'Unable to load recent loot right now.',
  STATS_PERSONAL_LOAD_FAILED: 'Unable to load statistics right now.',
  STATS_LEADERBOARD_LOAD_FAILED: 'Unable to load the leaderboard right now.',
  STATS_SUMMARY_LOAD_FAILED: 'Unable to load summary statistics right now.',
  'Kullanici adi veya sifre hatali': 'Invalid username or password.',
  'Invalid username or password': 'Invalid username or password.',
  'Kullanici adi veya e-posta gereklidir': 'Enter your username or email.',
  'Username or email is required': 'Enter your username or email.',
  'Sifre gereklidir': 'Enter your password.',
  'Password is required': 'Enter your password.',
  'Bu kullanici adi zaten kullaniliyor': 'That username is already in use.',
  'That username is already in use': 'That username is already in use.',
  'Bu e-posta adresi zaten kullaniliyor': 'That email address is already in use.',
  'That email address is already in use': 'That email address is already in use.',
  'Path of Exile OAuth is not configured': 'Path of Exile linking is not configured yet.',
  'Path of Exile OAuth yapilandirilmamis': 'Path of Exile linking is not configured yet.',
};

export function normalizeApiError(error, fallbackMessage = 'Something went wrong. Please try again.') {
  const status = error?.response?.status || error?.status || null;
  const errorCode = error?.response?.data?.errorCode || error?.errorCode || error?.code || null;
  const rawMessage = error?.response?.data?.error || error?.error || error?.message || '';
  const trimmedMessage = typeof rawMessage === 'string' ? rawMessage.trim() : '';

  if (status === 401) {
    return {
      status,
      code: errorCode || 'UNAUTHORIZED',
      message: API_ERROR_MESSAGE_MAP[errorCode] || API_ERROR_MESSAGE_MAP[trimmedMessage] || 'Your session has expired. Please sign in again.',
      rawMessage: trimmedMessage,
    };
  }

  if (trimmedMessage) {
    return {
      status,
      code: errorCode || error?.code || 'API_ERROR',
      message: API_ERROR_MESSAGE_MAP[errorCode] || API_ERROR_MESSAGE_MAP[trimmedMessage] || trimmedMessage,
      rawMessage: trimmedMessage,
    };
  }

  if (error?.code === 'ECONNABORTED') {
    return {
      status,
      code: 'REQUEST_TIMEOUT',
      message: 'The server took too long to respond.',
      rawMessage: '',
    };
  }

  if (error?.code === 'ERR_NETWORK' || /network|econnrefused|failed to fetch/i.test(error?.message || '')) {
    return {
      status,
      code: 'SERVER_UNAVAILABLE',
      message: 'Unable to reach the server.',
      rawMessage: '',
    };
  }

  return {
    status,
    code: error?.code || 'UNEXPECTED_ERROR',
    message: fallbackMessage,
    rawMessage: trimmedMessage,
  };
}

export function getApiErrorMessage(error, fallbackMessage) {
  return normalizeApiError(error, fallbackMessage).message;
}

function clearLegacyAuthStorage() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.sessionStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch { }

  try {
    window.localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch { }
}

// Create Axios instance
const apiClient = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor - error handling
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        clearLegacyAuthStorage();
        const requestUrl = error.config?.url || '';
        const isProfileProbe = requestUrl === '/auth/me' || requestUrl.endsWith('/auth/me');
        if (!isProfileProbe && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(normalizeApiError(error));
  }
);

// ==================== AUTH ====================

export const authAPI = {
  login: (credentials) => apiClient.post('/auth/login', credentials),
  register: (userData) => apiClient.post('/auth/register', userData),
  getMe: () => apiClient.get('/auth/me'),
  logout: () => apiClient.post('/auth/logout'),
  getRealtimeToken: () => apiClient.get('/auth/realtime-token'),
};

// ==================== SESSIONS ====================

export const sessionAPI = {
  getAll: (params) => apiClient.get('/sessions', { params }),
  getActive: () => apiClient.get('/sessions/active'),
  getById: (id) => apiClient.get(`/sessions/${id}`),
  start: (data) => apiClient.post('/sessions/start', data),
  end: (id) => apiClient.put(`/sessions/${id}/end`),
  abandon: (id) => apiClient.put(`/sessions/${id}/abandon`),
  delete: (id) => apiClient.delete(`/sessions/${id}`),
};

// ==================== LOOT ====================

export const lootAPI = {
  add: (data) => apiClient.post('/loot', data),
  addBulk: (data) => apiClient.post('/loot/bulk', data),
  getBySession: (sessionId, params) =>
    apiClient.get(`/loot/session/${sessionId}`, { params }),
  update: (id, data) => apiClient.put(`/loot/${id}`, data),
  delete: (id) => apiClient.delete(`/loot/${id}`),
};

// ==================== PRICES ====================

export const priceAPI = {
  getCurrent: (params) => apiClient.get('/prices/current', { params }),
  getItem: (itemName, params) =>
    apiClient.get(`/prices/item/${encodeURIComponent(itemName)}`, { params }),
  getTypes: (params) => apiClient.get('/prices/types', { params }),
  getLeagues: (params) => apiClient.get('/prices/leagues', { params }),
  sync: (data) => apiClient.post('/prices/sync', data),
  getSyncStatus: () => apiClient.get('/prices/sync-status'),
};

// ==================== STATS ====================

export const statsAPI = {
  getPersonal: (period, filters = {}) =>
    apiClient.get('/stats/personal', { params: { period, ...filters } }),
  getLeaderboard: (league, period, limit, filters = {}) =>
    apiClient.get(`/stats/leaderboard/${encodeURIComponent(league)}/${period}`, {
      params: { limit, ...filters },
    }),
  getSummary: (filters = {}) => apiClient.get('/stats/summary', { params: filters }),
};

export const opsAPI = {
  getHealth: async () => {
    const response = await axios.get(`${API_URL}/health`);
    return response.data;
  },
};

export const strategyAPI = {
  getMine: (params) => apiClient.get('/strategies/mine', { params }),
  getById: (id, params) => apiClient.get(`/strategies/${id}`, { params }),
  create: (data) => apiClient.post('/strategies', data),
  update: (id, data) => apiClient.put(`/strategies/${id}`, data),
  publish: (id) => apiClient.post(`/strategies/${id}/publish`),
  unpublish: (id) => apiClient.post(`/strategies/${id}/unpublish`),
};

export const publicStrategyAPI = {
  getAll: (params) => apiClient.get('/public/strategies', { params }),
  getBySlug: (slug, params) => apiClient.get(`/public/strategies/${encodeURIComponent(slug)}`, { params }),
};

export { clearLegacyAuthStorage };
export default apiClient;
