/**
 * Yardimci fonksiyonlar
 */

/**
 * Chaos degerini formatla
 */
export function formatChaos(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return '0c';
  return `${num.toFixed(1)}c`;
}

/**
 * Divine degerini formatla
 */
export function formatDivine(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return '0D';
  return `${num.toFixed(2)}D`;
}

/**
 * Sureyi formatla (saniye -> mm:ss veya hh:mm:ss)
 */
export function formatDuration(seconds) {
  if (!seconds) return '-';
  
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}s ${mins}d ${secs}sn`;
  }
  return `${mins}d ${secs}sn`;
}

/**
 * Tarihi formatla
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
  
  return d.toLocaleDateString('tr-TR', defaultOptions);
}

/**
 * Saati formatla
 */
export function formatTime(date) {
  if (!date) return '-';
  
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  
  return d.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Kisa tarih formati
 */
export function formatShortDate(date) {
  return formatDate(date, { month: 'short', day: 'numeric' });
}

/**
 * Para birimi formatla (buyuk degerler icin)
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
 * Sayiyi formatla
 */
export function formatNumber(num) {
  return new Intl.NumberFormat('tr-TR').format(num);
}

/**
 * Profit degerine gore renk sinifi dondur
 */
export function getProfitColorClass(value) {
  const num = parseFloat(value);
  if (num > 0) return 'text-green-500';
  if (num < 0) return 'text-red-500';
  return 'text-gray-400';
}

/**
 * Status degerine gore renk sinifi dondur
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
 * Status etiketini Turkcelestir
 */
export function getStatusLabel(status) {
  const labels = {
    active: 'Aktif',
    completed: 'Tamamlandi',
    abandoned: 'Iptal Edildi',
  };
  return labels[status] || status;
}

/**
 * Item tipini Turkcelestir
 */
export function getItemTypeLabel(type) {
  const labels = {
    currency: 'Currency',
    fragment: 'Fragment',
    scarab: 'Scarab',
    map: 'Map',
    divination_card: 'Divination Card',
    gem: 'Gem',
    unique: 'Unique',
    oil: 'Oil',
    incubator: 'Incubator',
    delirium_orb: 'Delirium Orb',
    catalyst: 'Catalyst',
    other: 'Diger',
  };
  return labels[type] || type;
}

/**
 * Array'i gruplandir
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
 * Array'den unique degerler al
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
 * Local storage'a kaydet
 */
export function setStorage(key, value) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

/**
 * Local storage'dan al
 */
export function getStorage(key, defaultValue = null) {
  if (typeof window !== 'undefined') {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  }
  return defaultValue;
}

/**
 * Local storage'dan sil
 */
export function removeStorage(key) {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(key);
  }
}
