/**
 * PoE API Client Module
 * Communicates with GGG's official Path of Exile API
 * - OAuth2 token management (access + refresh)
 * - Stash tab listing and item fetching
 * - League listing
 * - Rate limit compliance
 *
 * Docs: https://www.pathofexile.com/developer/docs/reference
 */

const axios = require('axios');
const registry = require('./currencyRegistry');

const POE_API_BASE = 'https://api.pathofexile.com';
const POE_AUTH_BASE = 'https://www.pathofexile.com';

// Rate limiting: GGG enforces per-endpoint limits via response headers.
// We implement a simple token-bucket per endpoint pattern.
const RATE_LIMIT_SAFETY_MS = 200; // minimum gap between requests

class PoeApiClient {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = null;
    this.clientId = null;
    this.lastRequestAt = 0;

    this.client = axios.create({
      baseURL: POE_API_BASE,
      timeout: 15000,
      headers: {
        'User-Agent': 'JuiceJournal/1.0 (contact: juicejournal@github.com)'
      }
    });
  }

  // ─── Configuration ──────────────────────────────────────────

  setClientId(clientId) {
    this.clientId = clientId;
  }

  /**
   * Set OAuth tokens obtained from PoE OAuth flow
   */
  setTokens({ accessToken, refreshToken, expiresIn }) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.tokenExpiresAt = expiresIn
      ? Date.now() + expiresIn * 1000 - 60000 // refresh 1 min early
      : null;
  }

  getTokens() {
    return {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      tokenExpiresAt: this.tokenExpiresAt
    };
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiresAt = null;
  }

  isAuthenticated() {
    return !!this.accessToken;
  }

  isTokenExpired() {
    if (!this.tokenExpiresAt) return false;
    return Date.now() >= this.tokenExpiresAt;
  }

  // ─── Token Refresh ──────────────────────────────────────────

  /**
   * Refresh the access token using the refresh token
   * Returns new token data or throws
   */
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await axios.post(`${POE_AUTH_BASE}/oauth/token`, new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      refresh_token: this.refreshToken
    }).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 10000
    });

    const data = response.data;
    this.setTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token || this.refreshToken,
      expiresIn: data.expires_in
    });

    return this.getTokens();
  }

  // ─── Rate Limiting ──────────────────────────────────────────

  async _throttle() {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < RATE_LIMIT_SAFETY_MS) {
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_SAFETY_MS - elapsed));
    }
    this.lastRequestAt = Date.now();
  }

  /**
   * Make an authenticated request to the PoE API
   */
  async _request(method, url, options = {}) {
    // Auto-refresh expired tokens
    if (this.isTokenExpired() && this.refreshToken) {
      await this.refreshAccessToken();
    }

    if (!this.accessToken) {
      throw new Error('Not authenticated with Path of Exile');
    }

    await this._throttle();

    try {
      const response = await this.client.request({
        method,
        url,
        ...options,
        headers: {
          ...options.headers,
          'Authorization': `Bearer ${this.accessToken}`
        }
      });

      // Parse rate limit headers for future use
      this._parseRateLimitHeaders(response.headers);

      return response.data;
    } catch (error) {
      if (error.response?.status === 429) {
        // Rate limited — extract retry-after and wait
        const retryAfter = parseInt(error.response.headers['retry-after'] || '60', 10);
        throw Object.assign(new Error(`Rate limited by PoE API. Retry after ${retryAfter}s`), {
          code: 'POE_RATE_LIMITED',
          retryAfter
        });
      }

      if (error.response?.status === 401) {
        // Token expired/invalid
        this.clearTokens();
        throw Object.assign(new Error('PoE API authentication expired'), {
          code: 'POE_AUTH_EXPIRED'
        });
      }

      if (error.response?.status === 403) {
        throw Object.assign(new Error('Missing required PoE API scope (account:stashes)'), {
          code: 'POE_SCOPE_MISSING'
        });
      }

      throw error;
    }
  }

  _parseRateLimitHeaders(headers) {
    // GGG returns X-Rate-Limit-* headers
    // We log them for debugging but rely on 429 handling for enforcement
    const policy = headers['x-rate-limit-policy'];
    const rules = headers['x-rate-limit-rules'];
    if (policy || rules) {
      this._lastRateInfo = { policy, rules, timestamp: Date.now() };
    }
  }

  // ─── Leagues ────────────────────────────────────────────────

  /**
   * Get list of active leagues (public endpoint, no auth needed)
   */
  async getLeagues() {
    await this._throttle();
    const response = await this.client.get('/league', {
      params: { type: 'main', compact: 1 }
    });
    return response.data;
  }

  // ─── Stash Tabs ─────────────────────────────────────────────

  /**
   * Get list of all stash tabs for a league
   * @param {string} league - League name (e.g. "Standard", "Dawn of the Hunt")
   * @returns {Object} { stashes: [{ id, name, type, index, children?, metadata? }] }
   */
  async listStashTabs(league) {
    return this._request('GET', `/stash/${encodeURIComponent(league)}`);
  }

  /**
   * Get items inside a specific stash tab
   * @param {string} league - League name
   * @param {string} stashId - Stash tab ID from listStashTabs
   * @param {string} [substashId] - Optional sub-stash ID (for folder tabs)
   * @returns {Object} { stash: { id, name, type, items: [...] } }
   */
  async getStashItems(league, stashId, substashId = null) {
    let url = `/stash/${encodeURIComponent(league)}/${encodeURIComponent(stashId)}`;
    if (substashId) {
      url += `/${encodeURIComponent(substashId)}`;
    }
    return this._request('GET', url);
  }

  /**
   * Fetch all items from multiple stash tabs
   * @param {string} league
   * @param {string[]} stashIds - Array of stash IDs to fetch
   * @returns {Object[]} Array of { stashId, stashName, items: [...] }
   */
  async getMultipleStashItems(league, stashIds) {
    const results = [];
    for (const stashId of stashIds) {
      try {
        const data = await this.getStashItems(league, stashId);
        results.push({
          stashId,
          stashName: data.stash?.name || stashId,
          stashType: data.stash?.type || 'unknown',
          items: data.stash?.items || []
        });
      } catch (error) {
        if (error.code === 'POE_RATE_LIMITED') {
          // Wait and retry this one
          await new Promise(resolve => setTimeout(resolve, (error.retryAfter || 60) * 1000));
          const data = await this.getStashItems(league, stashId);
          results.push({
            stashId,
            stashName: data.stash?.name || stashId,
            stashType: data.stash?.type || 'unknown',
            items: data.stash?.items || []
          });
        } else {
          console.error(`Failed to fetch stash ${stashId}:`, error.message);
          results.push({ stashId, stashName: stashId, stashType: 'error', items: [], error: error.message });
        }
      }
    }
    return results;
  }

  /**
   * Take a full stash snapshot: list tabs, then fetch items from currency/fragment tabs
   * @param {string} league
   * @param {Object} options
   * @param {string[]} [options.tabIds] - Specific tab IDs (if empty, auto-select currency tabs)
   * @param {boolean} [options.allTabs] - Fetch all tabs (slow, many API calls)
   * @returns {{ tabs: Object[], items: Object[], timestamp: number }}
   */
  async takeStashSnapshot(league, options = {}) {
    const tabList = await this.listStashTabs(league);
    const tabs = tabList.stashes || [];

    let targetIds;
    if (options.tabIds && options.tabIds.length > 0) {
      targetIds = options.tabIds;
    } else if (options.allTabs) {
      targetIds = tabs.map(t => t.id);
    } else {
      // Auto-select: currency tabs, fragment tabs, and "Dump" named tabs
      const autoPick = tabs.filter(t =>
        t.type === 'CurrencyStash' ||
        t.type === 'FragmentStash' ||
        t.type === 'NormalStash' ||
        /dump|loot|farm/i.test(t.name)
      );
      targetIds = autoPick.map(t => t.id);
    }

    const stashData = await this.getMultipleStashItems(league, targetIds);

    // Flatten and normalize items
    const allItems = [];
    for (const stash of stashData) {
      for (const item of stash.items) {
        allItems.push(this._normalizeItem(item, stash));
      }
    }

    return {
      tabs: tabs.map(t => ({ id: t.id, name: t.name, type: t.type, index: t.index })),
      items: allItems,
      timestamp: Date.now(),
      league
    };
  }

  /**
   * Normalize a raw PoE API item into a simpler format
   */
  _normalizeItem(raw, stash = {}) {
    const stackSize = raw.stackSize || 1;
    const maxStackSize = raw.maxStackSize || 1;

    // Determine item category using registry (dynamic, version-aware)
    const itemName = raw.baseType || raw.typeLine || '';
    const fullName = raw.name ? `${raw.name} ${raw.typeLine}`.trim() : raw.typeLine;

    // 1. Check registry first (populated from poe.ninja)
    let category = registry.getCategory(itemName);

    // 2. If registry says 'other', try frameType mapping
    if (category === 'other' && raw.frameType != null) {
      const ftCategory = registry.getCategoryForFrameType(raw.frameType);
      if (ftCategory !== 'other' && ftCategory !== 'normal' && ftCategory !== 'magic' && ftCategory !== 'rare') {
        category = ftCategory;
      }
    }

    // 3. Also register this item in registry for future lookups
    if (category !== 'other') {
      registry.registerItem(itemName, {
        name: itemName,
        category,
        icon: raw.icon || null,
        source: 'stash-api'
      });
    }

    return {
      id: raw.id,
      name: raw.name ? `${raw.name} ${raw.typeLine}`.trim() : raw.typeLine,
      typeLine: raw.typeLine,
      baseType: raw.baseType || raw.typeLine,
      category,
      quantity: stackSize,
      maxStackSize,
      frameType: raw.frameType,
      icon: raw.icon,
      identified: raw.identified !== false,
      ilvl: raw.ilvl || 0,
      stashId: stash.stashId,
      stashName: stash.stashName,
      // Keep useful properties for price matching
      corrupted: raw.corrupted || false,
      sockets: raw.sockets || [],
      explicitMods: raw.explicitMods || [],
      implicitMods: raw.implicitMods || [],
      enchantMods: raw.enchantMods || [],
      properties: raw.properties || []
    };
  }
}

module.exports = PoeApiClient;
