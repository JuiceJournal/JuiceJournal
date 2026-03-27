'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LOCALE,
  LEGACY_LOCALE_STORAGE_KEY,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  setCurrentLocale,
  translate,
} from '@/lib/i18n';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [locale, setLocaleState] = useState(DEFAULT_LOCALE);

  useEffect(() => {
    const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY) || localStorage.getItem(LEGACY_LOCALE_STORAGE_KEY);
    const nextLocale = SUPPORTED_LOCALES.some((entry) => entry.code === storedLocale)
      ? storedLocale
      : DEFAULT_LOCALE;

    setCurrentLocale(nextLocale);
    setLocaleState(nextLocale);
    document.documentElement.lang = nextLocale;
    localStorage.removeItem(LEGACY_LOCALE_STORAGE_KEY);
  }, []);

  const setLocale = (nextLocale) => {
    const normalizedLocale = SUPPORTED_LOCALES.some((entry) => entry.code === nextLocale)
      ? nextLocale
      : DEFAULT_LOCALE;

    setCurrentLocale(normalizedLocale);
    setLocaleState(normalizedLocale);
    localStorage.setItem(LOCALE_STORAGE_KEY, normalizedLocale);
    document.documentElement.lang = normalizedLocale;
  };

  const value = useMemo(() => ({
    locale,
    setLocale,
    locales: SUPPORTED_LOCALES,
    t: (key, values) => translate(key, values, locale),
  }), [locale]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
}
