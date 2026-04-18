'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import { usePathname } from 'next/navigation';
import { authAPI, clearLegacyAuthStorage } from '@/lib/api';

const AuthContext = createContext(null);

function isPublicPath(pathname) {
  if (!pathname) {
    return false;
  }

  return pathname === '/'
    || pathname.startsWith('/strategies/public');
}

export function AuthProvider({ children }) {
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [capabilities, setCapabilities] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isPublicPath(pathname)) {
      setLoading(false);
      return;
    }

    checkAuth();
  }, [pathname]);

  const checkAuth = async () => {
    try {
      const response = await authAPI.getMe();
      if (response.success) {
        setUser(response.data.user);
        setCapabilities(response.data.capabilities || {});
      }
    } catch (error) {
      clearLegacyAuthStorage();
      setUser(null);
      setCapabilities({});
    }
    setLoading(false);
  };

  const login = async (credentials) => {
    const response = await authAPI.login(credentials);
    if (response.success) {
      setUser(response.data.user);
      setCapabilities(response.data.capabilities || {});
    }
    return response;
  };

  const register = async (userData) => {
    const response = await authAPI.register(userData);
    if (response.success) {
      setUser(response.data.user);
      setCapabilities(response.data.capabilities || {});
    }
    return response;
  };

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch {
      // Clear local state even if the server logout call fails.
    }
    clearLegacyAuthStorage();
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

export { isPublicPath };
