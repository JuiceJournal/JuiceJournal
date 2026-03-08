/**
 * Utility functions
 */

import { getCurrentLocale, getLocaleTag, translate } from '@/lib/i18n';

/**
 * Format chaos value
 */
export function formatChaos(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return '0c';
  return `${num.toFixed(1)}c`;
}

/**
 * Format divine value
 */
export function formatDivine(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return '0D';
  return `${num.toFixed(2)}D`;
}

/**
 * Format duration (seconds -> mm:ss or hh:mm:ss)
 */
export function formatDuration(seconds) {
  if (!seconds) return '-';

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${mins}m ${secs}s`;
  }
  return `${mins}m ${secs}s`;
}

/**
 * Format date
 */
export function formatDate(date, options = {}) {
  if (!date) return '-';

  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';

  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  };

  return d.toLocaleDateString(getLocaleTag(), defaultOptions);
}

/**
 * Format time
 */
export function formatTime(date) {
  if (!date) return '-';

  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';

  return d.toLocaleTimeString(getLocaleTag(), {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Short date format
 */
export function formatShortDate(date) {
  return formatDate(date, { month: 'short', day: 'numeric' });
}

/**
 * Format currency (for large values)
 */
export function formatCurrency(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return '0';
  
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toFixed(0);
}

/**
 * Format number
 */
export function formatNumber(num) {
  return new Intl.NumberFormat(getLocaleTag()).format(num);
}

/**
 * Return color class based on profit value
 */
export function getProfitColorClass(value) {
  const num = parseFloat(value);
  if (num > 0) return 'text-green-500';
  if (num < 0) return 'text-red-500';
  return 'text-gray-400';
}

/**
 * Return color class based on status
 */
export function getStatusColorClass(status) {
  switch (status) {
    case 'active':
      return 'bg-blue-500';
    case 'completed':
      return 'bg-green-500';
    case 'abandoned':
      return 'bg-gray-500';
    default:
      return 'bg-gray-500';
  }
}

/**
 * Return status label
 */
export function getStatusLabel(status) {
  return translate(`status.${status}`, {}, getCurrentLocale());
}

/**
 * Return the display label for a Path of Exile version.
 */
export function getPoeVersionLabel(poeVersion) {
  return poeVersion === 'poe2' ? 'PoE 2' : 'PoE 1';
}

/**
 * Return item type label
 */
export function getItemTypeLabel(type) {
  return translate(`itemType.${type}`, {}, getCurrentLocale());
}

/**
 * Group array by key
 */
export function groupBy(array, key) {
  return array.reduce((result, item) => {
    const groupKey = item[key];
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
    return result;
  }, {});
}

/**
 * Get unique values from array
 */
export function uniqueBy(array, key) {
  const seen = new Set();
  return array.filter((item) => {
    const val = item[key];
    if (seen.has(val)) return false;
    seen.add(val);
    return true;
  });
}

/**
 * Save to local storage
 */
export function setStorage(key, value) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

/**
 * Get from local storage
 */
export function getStorage(key, defaultValue = null) {
  if (typeof window !== 'undefined') {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  }
  return defaultValue;
}

/**
 * Remove from local storage
 */
export function removeStorage(key) {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(key);
  }
}
