/**
 * Icon Cache Module
 * Keeps poe.ninja item art (web.poecdn.com) on disk so game icons work offline and in the overlay.
 *
 * Files are named by a SHA-256 of the source URL and handed to pages as file:// URLs, which both page
 * CSPs already accept as 'self'. Lookups never wait for the network: a miss queues a background download.
 */

const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ICON_HOST = 'web.poecdn.com';
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
const MAX_ICON_BYTES = 1024 * 1024;
const MAX_URL_LENGTH = 2048;
const MAX_RESOLVE_URLS = 1000;
const MAX_CONCURRENT_DOWNLOADS = 4;
const FAILED_RETRY_MS = 10 * 60 * 1000;
const TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const EXTENSIONS_BY_TYPE = {
  'image/png': '.png',
  'image/webp': '.webp',
  'image/jpeg': '.jpg',
  'image/gif': '.gif'
};
const CACHE_FILE_PATTERN = /^([a-f0-9]{64})\.(png|webp|jpg|gif)$/;

/**
 * Returns the canonical URL when it points at GGG's CDN over HTTPS, otherwise null.
 */
function normalizeIconUrl(url) {
  if (typeof url !== 'string' || url.length > MAX_URL_LENGTH) {
    return null;
  }

  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:' || parsed.hostname !== ICON_HOST || parsed.port || parsed.username || parsed.password) {
      return null;
    }
    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
}

function getIconKey(iconUrl) {
  return crypto.createHash('sha256').update(iconUrl).digest('hex');
}

function removeFile(filePath) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // A locked file stays behind untracked; the next start finds it again.
  }
}

async function fetchIcon(iconUrl) {
  const response = await axios.get(iconUrl, {
    responseType: 'arraybuffer',
    timeout: 15000,
    maxRedirects: 0,
    maxContentLength: MAX_ICON_BYTES,
    headers: { 'User-Agent': 'JuiceJournal/1.0' }
  });
  return { contentType: response.headers['content-type'], data: Buffer.from(response.data) };
}

class IconCache {
  /**
   * @param {Object} options
   * @param {string} options.dir - Cache folder, e.g. userData/icon-cache
   * @param {number} [options.maxBytes] - Total size cap; least recently used icons are removed first
   * @param {Function} [options.fetchIcon] - (url) => Promise<{ contentType, data: Buffer }>
   */
  constructor({ dir, maxBytes = DEFAULT_MAX_BYTES, fetchIcon: fetchImpl = fetchIcon, now = Date.now } = {}) {
    this.dir = dir;
    this.maxBytes = maxBytes;
    this.fetchIcon = fetchImpl;
    this.now = now;
    // key → { fileName, size, usedAt }, least recently used first. Loaded from disk on first use.
    this.entries = null;
    this.totalBytes = 0;
    this.downloads = new Map();
    this.queue = [];
    this.activeDownloads = 0;
    this.failures = new Map();
  }

  /**
   * File URL of the cached copy, or null. A miss queues a background download.
   */
  getCachedIconUrl(url) {
    const iconUrl = normalizeIconUrl(url);
    if (!iconUrl) {
      return null;
    }

    this._load();
    const key = getIconKey(iconUrl);
    const entry = this.entries.get(key);
    if (!entry) {
      this._queueDownload(key, iconUrl);
      return null;
    }

    this._touch(key, entry);
    return pathToFileURL(path.join(this.dir, entry.fileName)).href;
  }

  /**
   * Maps each given URL that is already cached to its file URL; the rest start downloading.
   */
  resolveIconUrls(urls) {
    const resolved = {};
    if (!Array.isArray(urls)) {
      return resolved;
    }

    for (const url of urls.slice(0, MAX_RESOLVE_URLS)) {
      const fileUrl = this.getCachedIconUrl(url);
      if (fileUrl) {
        resolved[url] = fileUrl;
      }
    }
    return resolved;
  }

  /**
   * Like getCachedIconUrl, but waits for the download on a miss. Resolves null when it fails.
   */
  async ensureIconUrl(url) {
    const cached = this.getCachedIconUrl(url);
    if (cached) {
      return cached;
    }

    const iconUrl = normalizeIconUrl(url);
    const download = iconUrl ? this.downloads.get(getIconKey(iconUrl)) : null;
    if (!download) {
      return null;
    }

    await download;
    return this.entries.has(getIconKey(iconUrl)) ? this.getCachedIconUrl(iconUrl) : null;
  }

  _load() {
    if (this.entries) {
      return;
    }

    this.entries = new Map();
    const files = [];
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      for (const name of fs.readdirSync(this.dir)) {
        const filePath = path.join(this.dir, name);
        if (name.endsWith('.tmp')) {
          removeFile(filePath);
          continue;
        }
        const match = CACHE_FILE_PATTERN.exec(name);
        if (match) {
          const stat = fs.statSync(filePath);
          files.push({ key: match[1], fileName: name, size: stat.size, usedAt: stat.mtimeMs });
        }
      }
    } catch (error) {
      console.error('Icon cache could not be read:', error.message);
    }

    files
      .sort((a, b) => a.usedAt - b.usedAt)
      .forEach((file) => this._addEntry(file.key, file.fileName, file.size, file.usedAt));
    this._enforceSizeCap();
  }

  _addEntry(key, fileName, size, usedAt = this.now()) {
    this.entries.set(key, { fileName, size, usedAt });
    this.totalBytes += size;
  }

  // Moves the icon to the most recently used end, and records that on disk at most once a day.
  _touch(key, entry) {
    this.entries.delete(key);
    this.entries.set(key, entry);

    const now = this.now();
    if (now - entry.usedAt > TOUCH_INTERVAL_MS) {
      entry.usedAt = now;
      const time = new Date(now);
      fs.utimes(path.join(this.dir, entry.fileName), time, time, () => {});
    }
  }

  _enforceSizeCap() {
    for (const [key, entry] of this.entries) {
      if (this.totalBytes <= this.maxBytes) {
        break;
      }
      this.entries.delete(key);
      this.totalBytes -= entry.size;
      removeFile(path.join(this.dir, entry.fileName));
    }
  }

  _queueDownload(key, iconUrl) {
    const failedAt = this.failures.get(key);
    if (this.downloads.has(key) || (failedAt && this.now() - failedAt < FAILED_RETRY_MS)) {
      return;
    }

    this.downloads.set(key, new Promise((resolve) => this.queue.push({ key, iconUrl, resolve })));
    this._pump();
  }

  _pump() {
    while (this.activeDownloads < MAX_CONCURRENT_DOWNLOADS && this.queue.length > 0) {
      const job = this.queue.shift();
      this.activeDownloads += 1;
      this._download(job.key, job.iconUrl).then(() => {
        this.activeDownloads -= 1;
        this.downloads.delete(job.key);
        job.resolve();
        this._pump();
      });
    }
  }

  async _download(key, iconUrl) {
    const tempPath = path.join(this.dir, `${key}.${crypto.randomBytes(4).toString('hex')}.tmp`);
    try {
      const { contentType, data } = await this.fetchIcon(iconUrl);
      const extension = EXTENSIONS_BY_TYPE[String(contentType || '').split(';')[0].trim().toLowerCase()];
      if (!extension || !Buffer.isBuffer(data) || data.length === 0 || data.length > MAX_ICON_BYTES) {
        throw new Error(`Unexpected icon response (${contentType || 'no content type'})`);
      }

      const fileName = `${key}${extension}`;
      await fs.promises.writeFile(tempPath, data);
      await fs.promises.rename(tempPath, path.join(this.dir, fileName));
      this.failures.delete(key);
      this._addEntry(key, fileName, data.length);
      this._enforceSizeCap();
    } catch (error) {
      this.failures.set(key, this.now());
      await fs.promises.rm(tempPath, { force: true }).catch(() => {});
    }
  }
}

module.exports = {
  IconCache,
  normalizeIconUrl,
  getIconKey,
  ICON_HOST,
  MAX_ICON_BYTES
};
