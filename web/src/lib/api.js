/**
 * API Client
 * Backend API communication
 */

import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const API_ERROR_MESSAGE_MAP = {
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
  const rawMessage = error?.response?.data?.error || error?.error || error?.message || '';
  const trimmedMessage = typeof rawMessage === 'string' ? rawMessage.trim() : '';

  if (status === 401) {
    return {
      status,
      code: 'UNAUTHORIZED',
      message: API_ERROR_MESSAGE_MAP[trimmedMessage] || 'Your session has expired. Please sign in again.',
      rawMessage: trimmedMessage,
    };
  }

  if (trimmedMessage) {
    return {
      status,
      code: error?.code || 'API_ERROR',
      message: API_ERROR_MESSAGE_MAP[trimmedMessage] || trimmedMessage,
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

// Create Axios instance
const apiClient = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - attach token
apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - error handling
apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      // Token invalid, logout
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        window.location.href = '/login';
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

export default apiClient;
