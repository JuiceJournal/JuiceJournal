const axios = require('axios');
const crypto = require('crypto');
const env = require('../config/env');
const { User } = require('../models');

const OAUTH_BASE_URL = 'https://www.pathofexile.com/oauth';
const API_BASE_URL = 'https://api.pathofexile.com';

function getScopes() {
  return env.poe.scopes;
}

function isMockMode() {
  return env.poe.mock || !env.poe.clientId;
}

function isConfigured() {
  return Boolean(
    env.poe.clientId &&
    env.poe.redirectUri &&
    env.poe.tokenEncryptionKey
  );
}

function getEncryptionKey() {
  const rawKey = env.poe.tokenEncryptionKey || null;

  if (!rawKey) {
    throw new Error('POE_TOKEN_ENCRYPTION_KEY must be configured in production');
  }

  return crypto.createHash('sha256').update(rawKey).digest();
}

function encryptToken(value) {
  if (!value) return null;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptToken(payload) {
  if (!payload) return null;

  const [ivText, tagText, encryptedText] = payload.split(':');
  if (!ivText || !tagText || !encryptedText) {
    throw new Error('Invalid encrypted PoE token payload');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(ivText, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tagText, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

function buildAuthorizationUrl({ redirectUri, codeChallenge, state }) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: env.poe.clientId,
    redirect_uri: redirectUri,
    scope: getScopes(),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  });

  return `${OAUTH_BASE_URL}/authorize?${params.toString()}`;
}

async function exchangeCode({ code, codeVerifier, redirectUri }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: env.poe.clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const response = await axios.post(`${OAUTH_BASE_URL}/token`, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': `OAuth ${env.poe.clientId}/0.1.0 (contact: ${env.poe.contact}) JuiceJournal`,
    },
    timeout: 30000,
  });

  return response.data;
}

async function refreshAccessToken(refreshToken) {
  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: env.poe.clientId,
    refresh_token: refreshToken,
  });

  const response = await axios.post(`${OAUTH_BASE_URL}/token`, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': `OAuth ${env.poe.clientId}/0.1.0 (contact: ${env.poe.contact}) JuiceJournal`,
    },
    timeout: 30000,
  });

  return response.data;
}

/**
 * Returns a guaranteed-valid plaintext access token for the given user.
 * If the cached token is expired (or expiring within 60s) and a refresh token
 * is available, transparently refreshes and persists new tokens to the DB.
 *
 * Throws an error tagged `POE_REAUTH_REQUIRED` if refresh fails or no token
 * exists at all — the caller should surface this to the UI so the user can
 * re-link their account.
 */
async function getValidAccessToken(user) {
  if (!user) {
    const error = new Error('User is required');
    error.code = 'POE_REAUTH_REQUIRED';
    throw error;
  }

  if (!user.poeAccessToken) {
    const error = new Error('Path of Exile account is not linked');
    error.code = 'POE_REAUTH_REQUIRED';
    throw error;
  }

  // Mock-mode users never have a real GGG token. Callers MUST check user.poeMock
  // and route to the mock data path before reaching this function — otherwise the
  // fake token ends up hitting api.pathofexile.com, getting 401'd, and triggering
  // clearPoeLink as a side effect. Fail loudly so accidents surface during dev.
  if (user.poeMock) {
    const error = new Error('Mock PoE accounts cannot call the live GGG API');
    error.code = 'POE_MOCK_MODE';
    throw error;
  }

  const expiresAt = user.poeTokenExpiresAt ? new Date(user.poeTokenExpiresAt).getTime() : 0;
  const now = Date.now();
  const stillValid = expiresAt - now > 60_000; // 60s safety margin

  if (stillValid) {
    return decryptToken(user.poeAccessToken);
  }

  // Token expired (or about to). Try to refresh.
  if (!user.poeRefreshToken) {
    const error = new Error('Path of Exile session expired and no refresh token is available');
    error.code = 'POE_REAUTH_REQUIRED';
    throw error;
  }

  let tokenPayload;
  try {
    const plaintextRefreshToken = decryptToken(user.poeRefreshToken);
    tokenPayload = await refreshAccessToken(plaintextRefreshToken);
  } catch (error) {
    // Refresh failed — most likely the refresh token was revoked or expired (7 days).
    // Clear the link so the user is prompted to re-authenticate, then surface a
    // tagged error so the route handler can return a meaningful status code.
    try {
      await clearPoeLink(user);
    } catch (clearError) {
      console.error('Failed to clear PoE link after refresh failure:', clearError);
    }
    const wrapped = new Error('Path of Exile session expired — please sign in again');
    wrapped.code = 'POE_REAUTH_REQUIRED';
    wrapped.cause = error;
    throw wrapped;
  }

  // Persist the refreshed tokens. GGG may or may not rotate the refresh token.
  await user.update({
    poeAccessToken: encryptToken(tokenPayload.access_token),
    poeRefreshToken: encryptToken(tokenPayload.refresh_token || decryptToken(user.poeRefreshToken)),
    poeTokenExpiresAt: new Date(Date.now() + ((tokenPayload.expires_in || 0) * 1000)),
  });

  return tokenPayload.access_token;
}

async function fetchProfile(accessToken) {
  const response = await axios.get(`${API_BASE_URL}/profile`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': `OAuth ${env.poe.clientId || 'juicejournal'}/0.1.0 (contact: ${env.poe.contact}) JuiceJournal`,
    },
    timeout: 30000,
  });

  return response.data;
}

function createMockLinkPayload(user) {
  return {
    sub: `mock-${user.id}`,
    accountName: `${user.username}#0001`,
    accessToken: 'mock-access-token',
    refreshToken: 'mock-refresh-token',
    expiresAt: new Date(Date.now() + 10 * 60 * 60 * 1000),
    linkedAt: new Date(),
    mock: true,
  };
}

function sanitizeUsername(name) {
  // Strip non-alphanumeric (PoE names like "Foo#1234" → "Foo1234")
  const cleaned = String(name || '').replace(/[^A-Za-z0-9]/g, '');
  if (cleaned.length >= 3) return cleaned.slice(0, 45);
  return `poe${cleaned}`.slice(0, 45);
}

async function generateUniqueUsername(baseName) {
  const base = sanitizeUsername(baseName) || 'exile';
  let candidate = base;
  let suffix = 0;

  // Try base, then base + random short suffix until unique
  while (await User.findOne({ where: { username: candidate } })) {
    suffix += 1;
    if (suffix > 50) {
      // Fallback to fully random suffix to avoid pathological loops
      candidate = `${base}${crypto.randomBytes(3).toString('hex')}`;
      break;
    }
    const tag = crypto.randomBytes(2).toString('hex');
    candidate = `${base}${tag}`.slice(0, 50);
  }

  return candidate;
}

/**
 * Find or create a user from a Path of Exile profile + token payload.
 * - If a user with the same poeSub exists, refresh their token + return them.
 * - Otherwise create a brand-new account with a placeholder email/password
 *   (OAuth-only login). The user can add a password later via profile update.
 */
async function findOrCreateFromPoeProfile(profile, tokenPayload) {
  if (!profile?.uuid) {
    throw new Error('PoE profile is missing uuid (account:profile scope required)');
  }

  const linkPayload = {
    sub: profile.uuid,
    accountName: profile.name,
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token,
    expiresAt: new Date(Date.now() + ((tokenPayload.expires_in || 0) * 1000)),
    linkedAt: new Date(),
    mock: false,
  };

  // 1) Existing user linked to this PoE account → refresh tokens, return.
  const existing = await User.findOne({ where: { poeSub: profile.uuid } });
  if (existing) {
    return persistPoeLink(existing, linkPayload);
  }

  // 2) Brand-new OAuth-only account.
  const username = await generateUniqueUsername(profile.name);
  // Placeholder email — must be unique and pass isEmail validator.
  // Form: poe-<sub>@oauth.juicejournal.local (sub is a UUID, guaranteed unique).
  const email = `poe-${profile.uuid}@oauth.juicejournal.local`;
  // Random password hash — user has no password and must use OAuth to sign in.
  const randomPassword = crypto.randomBytes(32).toString('hex');
  const passwordHash = await User.hashPassword(randomPassword);

  const user = await User.create({
    username,
    email,
    passwordHash,
  });

  return persistPoeLink(user, linkPayload);
}

async function persistPoeLink(user, linkPayload) {
  await user.update({
    poeSub: linkPayload.sub,
    poeAccountName: linkPayload.accountName,
    poeAccessToken: encryptToken(linkPayload.accessToken),
    poeRefreshToken: encryptToken(linkPayload.refreshToken),
    poeTokenExpiresAt: linkPayload.expiresAt,
    poeLinkedAt: linkPayload.linkedAt || new Date(),
    poeMock: Boolean(linkPayload.mock),
  });

  return user;
}

async function clearPoeLink(user) {
  await user.update({
    poeSub: null,
    poeAccountName: null,
    poeAccessToken: null,
    poeRefreshToken: null,
    poeTokenExpiresAt: null,
    poeLinkedAt: null,
    poeMock: false,
  });

  return user;
}

module.exports = {
  buildAuthorizationUrl,
  clearPoeLink,
  createMockLinkPayload,
  decryptToken,
  encryptToken,
  exchangeCode,
  fetchProfile,
  findOrCreateFromPoeProfile,
  getScopes,
  getValidAccessToken,
  isConfigured,
  isMockMode,
  persistPoeLink,
  refreshAccessToken,
};
