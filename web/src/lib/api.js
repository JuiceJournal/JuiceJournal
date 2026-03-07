/**
 * API Client
 * Backend API communication
 */

import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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
    return Promise.reject(error.response?.data || error);
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
