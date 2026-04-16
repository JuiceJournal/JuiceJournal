/**
 * PoE API Service (Backend)
 * Wraps the GGG official Path of Exile API for endpoints that require an
 * authenticated user (stash tabs, characters, etc.). Uses poeAuthService for
 * encrypted token storage and automatic refresh.
 *
 * Docs: https://www.pathofexile.com/developer/docs/reference
 */

const axios = require('axios');
const env = require('../config/env');
const poeAuthService = require('./poeAuthService');

const POE_API_BASE = 'https://api.pathofexile.com';

// Conservative spacing between requests to stay under GGG's per-endpoint
// rate limits. Real enforcement happens via 429 handling below.
const RATE_LIMIT_SAFETY_MS = 250;

let lastRequestAt = 0;
const CHARACTER_CACHE_TTL_MS = 30_000;
const characterPayloadCache = new Map();

async function throttle() {
  const elapsed = Date.now() - lastRequestAt;
  if (elapsed < RATE_LIMIT_SAFETY_MS) {
    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_SAFETY_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

function buildUserAgent() {
  const clientId = env.poe.clientId || 'juicejournal/1.0.0 (contact: admin@juicejournal.local)';
  const contact = env.poe.contact || 'admin@juicejournal.local';
  return `OAuth ${clientId}/0.1.0 (contact: ${contact}) JuiceJournal`;
}

function tagPoeError(error, code, message) {
  const wrapped = new Error(message || error.message);
  wrapped.code = code;
  wrapped.cause = error;
  if (error.response?.status) wrapped.status = error.response.status;
  return wrapped;
}

/**
 * Make an authenticated request to the GGG API on behalf of `user`.
 * Refreshes the access token automatically when expired.
 */
async function authenticatedRequest(user, { method = 'GET', path, params, data } = {}) {
  // Will throw POE_REAUTH_REQUIRED if the user has no valid token + cannot refresh.
  const accessToken = await poeAuthService.getValidAccessToken(user);

  await throttle();

  try {
    const response = await axios.request({
      method,
      url: `${POE_API_BASE}${path}`,
      params,
      data,
      timeout: 30000,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': buildUserAgent(),
      },
    });
    return response.data;
  } catch (error) {
    const status = error.response?.status;

    if (status === 401) {
      // The token was rejected even after refresh. Clear the link so the user
      // is forced to re-authenticate next time.
      try { await poeAuthService.clearPoeLink(user); } catch (_) { /* ignore */ }
      throw tagPoeError(error, 'POE_REAUTH_REQUIRED', 'Path of Exile session was rejected — please sign in again');
    }

    if (status === 403) {
      throw tagPoeError(error, 'POE_SCOPE_MISSING', 'Missing required Path of Exile scope (account:stashes)');
    }

    if (status === 429) {
      const retryAfter = parseInt(error.response.headers['retry-after'] || '60', 10);
      const wrapped = tagPoeError(error, 'POE_RATE_LIMITED', `Rate limited by GGG API. Retry after ${retryAfter}s`);
      wrapped.retryAfter = retryAfter;
      throw wrapped;
    }

    throw tagPoeError(error, 'POE_REQUEST_FAILED', error.response?.data?.error?.message || error.message);
  }
}

// ─── Mock-mode fixtures ─────────────────────────────────────────
// Users linked via POE_OAUTH_MOCK=true have no real GGG token, so we must
// return canned data for any stash endpoint instead of hitting the live API.
// Keep the shapes identical to the real GGG payloads so downstream code
// (stashSnapshotService, etc.) doesn't need mock-aware branches.

const MOCK_STASHES = [
  { id: 'mock-currency', name: 'Currency', type: 'CurrencyStash', index: 0 },
  { id: 'mock-dump', name: 'Dump', type: 'PremiumStash', index: 1 },
];

const MOCK_CHARACTERS = {
  poe1: [
    {
      id: 'mock-poe1-ranger',
      name: 'MockRanger',
      level: 94,
      class: 'Ranger',
      ascendancy: 'Deadeye',
      league: 'Mercenaries'
    }
  ],
  poe2: [
    {
      id: 'mock-poe2-shaman',
      name: 'MockShaman',
      level: 96,
      class: 'Shaman',
      ascendancy: 'Ritualist',
      league: 'Fate of the Vaal'
    }
  ]
};

function normalizePoeVersion(realm) {
  return realm === 'poe2' ? 'poe2' : 'poe1';
}

function normalizeCharacters(characters = [], poeVersion = 'poe1') {
  if (!Array.isArray(characters)) {
    return [];
  }

  return characters
    .filter(Boolean)
    .map((character) => ({
      id: character.id || character.characterId || character.name || null,
      name: character.name || null,
      level: Number(character.level || 0),
      class: character.class || character.className || null,
      ascendancy: character.ascendancy || character.alternate_ascendancy || null,
      league: character.league || null,
      poeVersion: normalizePoeVersion(character.poeVersion || poeVersion)
    }))
    .filter((character) => character.name);
}

function buildCharacterPayload({ poe1 = [], poe2 = [] } = {}) {
  const charactersByGame = {
    poe1: normalizeCharacters(poe1, 'poe1'),
    poe2: normalizeCharacters(poe2, 'poe2')
  };

  function getDefaultCharacterId(characters) {
    return [...characters]
      .sort((a, b) => (b.level || 0) - (a.level || 0))
      [0]?.id || null;
  }

  return {
    characters: [
      ...charactersByGame.poe1,
      ...charactersByGame.poe2
    ],
    charactersByGame,
    selectedCharacterByGame: {
      ...(getDefaultCharacterId(charactersByGame.poe1) ? { poe1: getDefaultCharacterId(charactersByGame.poe1) } : {}),
      ...(getDefaultCharacterId(charactersByGame.poe2) ? { poe2: getDefaultCharacterId(charactersByGame.poe2) } : {})
    },
    syncedAt: new Date().toISOString()
  };
}

async function listCharacters(user, poeVersion = 'poe1') {
  const normalizedVersion = normalizePoeVersion(poeVersion);

  if (user?.poeMock || env.poe.mock) {
    return normalizeCharacters(MOCK_CHARACTERS[normalizedVersion], normalizedVersion);
  }

  const realmPath = normalizedVersion === 'poe2' ? '/poe2' : '';
  const payload = await authenticatedRequest(user, {
    method: 'GET',
    path: `/character${realmPath}`
  });

  return normalizeCharacters(payload?.characters || payload || [], normalizedVersion);
}

async function getAccountCharacters(user) {
  if (user?.poeMock || env.poe.mock) {
    return buildCharacterPayload(MOCK_CHARACTERS);
  }

  const [poe1, poe2] = await Promise.allSettled([
    listCharacters(user, 'poe1'),
    listCharacters(user, 'poe2')
  ]);

  return buildCharacterPayload({
    poe1: poe1.status === 'fulfilled' ? poe1.value : [],
    poe2: poe2.status === 'fulfilled' ? poe2.value : []
  });
}

function getCharacterCacheKey(user) {
  if (!user?.id) {
    return null;
  }

  return [
    user.id,
    user.poeSub || 'no-poe-sub',
    user.poeMock ? 'mock' : 'live'
  ].join(':');
}

function invalidateAccountCharactersCache(user) {
  const key = getCharacterCacheKey(user);
  if (!key) {
    return false;
  }

  return characterPayloadCache.delete(key);
}

async function getCachedAccountCharacters(user, { loader = getAccountCharacters, ttlMs = CHARACTER_CACHE_TTL_MS } = {}) {
  const key = getCharacterCacheKey(user);
  if (!key) {
    return loader(user);
  }

  const now = Date.now();
  const existing = characterPayloadCache.get(key);
  if (existing?.value && (now - existing.cachedAt) < ttlMs) {
    return existing.value;
  }

  if (existing?.promise) {
    return existing.promise;
  }

  const pending = Promise.resolve(loader(user))
    .then((value) => {
      characterPayloadCache.set(key, {
        value,
        cachedAt: Date.now(),
        promise: null
      });
      return value;
    })
    .catch((error) => {
      characterPayloadCache.delete(key);
      throw error;
    });

  characterPayloadCache.set(key, {
    value: null,
    cachedAt: 0,
    promise: pending
  });

  return pending;
}

function buildMockStashTab(stashId) {
  const base = MOCK_STASHES.find((s) => s.id === stashId) || {
    id: stashId,
    name: stashId,
    type: 'PremiumStash',
    index: 0,
  };
  return {
    stash: {
      ...base,
      items: [
        { id: `${stashId}-item-1`, typeLine: 'Chaos Orb', baseType: 'Chaos Orb', stackSize: 100, maxStackSize: 10, frameType: 5, identified: true },
        { id: `${stashId}-item-2`, typeLine: 'Divine Orb', baseType: 'Divine Orb', stackSize: 5, maxStackSize: 10, frameType: 5, identified: true },
      ],
    },
  };
}

// ─── Stash endpoints ────────────────────────────────────────────

/**
 * List all stash tabs in a league.
 * Returns the raw GGG payload: { stashes: [{ id, name, type, index, ... }] }
 */
async function listStashTabs(user, league) {
  if (!league) throw new Error('league is required');
  if (user?.poeMock) {
    return { stashes: MOCK_STASHES };
  }
  return authenticatedRequest(user, {
    method: 'GET',
    path: `/stash/${encodeURIComponent(league)}`
  });
}

/**
 * Get items inside a single stash tab.
 * Returns: { stash: { id, name, type, items: [...] } }
 */
async function getStashTab(user, league, stashId, substashId = null) {
  if (!league || !stashId) throw new Error('league and stashId are required');
  if (user?.poeMock) {
    return buildMockStashTab(stashId);
  }
  let path = `/stash/${encodeURIComponent(league)}/${encodeURIComponent(stashId)}`;
  if (substashId) path += `/${encodeURIComponent(substashId)}`;
  return authenticatedRequest(user, { method: 'GET', path });
}

/**
 * Fetch items from a list of tabs sequentially with retry-on-429.
 * Returns an array of { stashId, stashName, stashType, items, error? }.
 */
async function getStashTabsBatch(user, league, stashIds = []) {
  const results = [];
  for (const stashId of stashIds) {
    try {
      const data = await getStashTab(user, league, stashId);
      results.push({
        stashId,
        stashName: data?.stash?.name || stashId,
        stashType: data?.stash?.type || 'unknown',
        items: data?.stash?.items || []
      });
    } catch (error) {
      if (error.code === 'POE_RATE_LIMITED') {
        // Sleep then retry once
        await new Promise((resolve) => setTimeout(resolve, (error.retryAfter || 60) * 1000));
        try {
          const data = await getStashTab(user, league, stashId);
          results.push({
            stashId,
            stashName: data?.stash?.name || stashId,
            stashType: data?.stash?.type || 'unknown',
            items: data?.stash?.items || []
          });
          continue;
        } catch (retryError) {
          results.push({ stashId, stashName: stashId, stashType: 'error', items: [], error: retryError.message });
          continue;
        }
      }
      results.push({ stashId, stashName: stashId, stashType: 'error', items: [], error: error.message });
    }
  }
  return results;
}

module.exports = {
  authenticatedRequest,
  buildCharacterPayload,
  getCachedAccountCharacters,
  getAccountCharacters,
  listStashTabs,
  listCharacters,
  getStashTab,
  getStashTabsBatch,
  invalidateAccountCharactersCache,
  normalizeCharacters,
};
