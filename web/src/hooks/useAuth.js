'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { authAPI } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [capabilities, setCapabilities] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const response = await authAPI.getMe();
        if (response.success) {
          setUser(response.data.user);
          setCapabilities(response.data.capabilities || {});
        }
      } catch (error) {
        localStorage.removeItem('token');
        setCapabilities({});
      }
    }
    setLoading(false);
  };

  const login = async (credentials) => {
    const response = await authAPI.login(credentials);
    if (response.success) {
      localStorage.setItem('token', response.data.token);
      setUser(response.data.user);
      setCapabilities(response.data.capabilities || {});
    }
    return response;
  };

  const register = async (userData) => {
    const response = await authAPI.register(userData);
    if (response.success) {
      localStorage.setItem('token', response.data.token);
      setUser(response.data.user);
      setCapabilities(response.data.capabilities || {});
    }
    return response;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setCapabilities({});
  };

  return (
    <AuthContext.Provider value={{ user, capabilities, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
