import { EN_MESSAGES } from '@/lib/locales/en';
import { TR_MESSAGES } from '@/lib/locales/tr';
import { DE_MESSAGES, FR_MESSAGES, ES_MESSAGES } from '@/lib/locales/europe-west';
import { IT_MESSAGES, PT_BR_MESSAGES, RU_MESSAGES } from '@/lib/locales/europe-east';
import { JA_MESSAGES, KO_MESSAGES, ZH_CN_MESSAGES, ZH_TW_MESSAGES } from '@/lib/locales/asia';

export const DEFAULT_LOCALE = 'en';
export const LOCALE_STORAGE_KEY = 'poe-farm-tracker-locale';

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'tr', label: 'Turkce' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Francais' },
  { code: 'es', label: 'Espanol' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt-BR', label: 'Portugues (Brasil)' },
  { code: 'ru', label: 'Russkiy' },
  { code: 'ja', label: 'Nihongo' },
  { code: 'ko', label: 'Hangug-eo' },
  { code: 'zh-CN', label: 'JianTi ZhongWen' },
  { code: 'zh-TW', label: 'FanTi ZhongWen' },
];

const LOCALE_TAGS = {
  en: 'en-US',
  tr: 'tr-TR',
  de: 'de-DE',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
  'pt-BR': 'pt-BR',
  ru: 'ru-RU',
  ja: 'ja-JP',
  ko: 'ko-KR',
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
};

export const TRANSLATIONS = {
  en: EN_MESSAGES,
  tr: { ...EN_MESSAGES, ...TR_MESSAGES },
  de: { ...EN_MESSAGES, ...DE_MESSAGES },
  fr: { ...EN_MESSAGES, ...FR_MESSAGES },
  es: { ...EN_MESSAGES, ...ES_MESSAGES },
  it: { ...EN_MESSAGES, ...IT_MESSAGES },
  'pt-BR': { ...EN_MESSAGES, ...PT_BR_MESSAGES },
  ru: { ...EN_MESSAGES, ...RU_MESSAGES },
  ja: { ...EN_MESSAGES, ...JA_MESSAGES },
  ko: { ...EN_MESSAGES, ...KO_MESSAGES },
  'zh-CN': { ...EN_MESSAGES, ...ZH_CN_MESSAGES },
  'zh-TW': { ...EN_MESSAGES, ...ZH_TW_MESSAGES },
};

let currentLocale = DEFAULT_LOCALE;

export function getLocaleTag(locale = currentLocale) {
  return LOCALE_TAGS[locale] || LOCALE_TAGS[DEFAULT_LOCALE];
}

export function setCurrentLocale(locale) {
  currentLocale = SUPPORTED_LOCALES.some((entry) => entry.code === locale) ? locale : DEFAULT_LOCALE;
}

export function getCurrentLocale() {
  return currentLocale;
}

export function translate(key, values = {}, locale = currentLocale) {
  const template = TRANSLATIONS[locale]?.[key] || EN_MESSAGES[key] || key;
  return String(template).replace(/\{(\w+)\}/g, (_, token) => (
    Object.prototype.hasOwnProperty.call(values, token) ? String(values[token]) : `{${token}}`
  ));
}
