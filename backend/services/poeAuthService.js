const axios = require('axios');
const crypto = require('crypto');
const env = require('../config/env');

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
  getScopes,
  isConfigured,
  isMockMode,
  persistPoeLink,
};
