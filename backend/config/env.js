const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';

function parseBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  return String(value).toLowerCase() === 'true';
}

function parseInteger(value, defaultValue) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function getRequired(name, fallback = null) {
  const value = process.env[name];
  if (value !== undefined && value !== '') {
    return value;
  }

  if (fallback !== null) {
    return fallback;
  }

  throw new Error(`${name} must be configured`);
}

function assertProductionConfig() {
  if (!isProduction) return;

  const jwtSecret = getRequired('JWT_SECRET');
  const knownWeakSecrets = ['development-only-jwt-secret', 'your_super_secret_jwt_key', 'your_super_secret_jwt_key_change_this_in_production'];
  if (jwtSecret.length < 32 || knownWeakSecrets.includes(jwtSecret)) {
    throw new Error('JWT_SECRET must be at least 32 characters and not a default value');
  }

  if (process.env.POE_CLIENT_ID || process.env.POE_REDIRECT_URI) {
    const encKey = getRequired('POE_TOKEN_ENCRYPTION_KEY');
    if (encKey.length < 16) {
      throw new Error('POE_TOKEN_ENCRYPTION_KEY must be at least 16 characters');
    }
  }

  if (parseBoolean(process.env.DB_AUTO_SYNC, false)) {
    throw new Error('DB_AUTO_SYNC must not be enabled in production — use migrations instead');
  }
}

assertProductionConfig();

module.exports = {
  nodeEnv: NODE_ENV,
  isProduction,
  isDevelopment: NODE_ENV === 'development',
  port: parseInteger(process.env.PORT, 3001),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInteger(process.env.DB_PORT, 5432),
    name: process.env.DB_NAME || 'juicejournal',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    autoSync: parseBoolean(process.env.DB_AUTO_SYNC, !isProduction),
  },
  auth: {
    jwtSecret: getRequired('JWT_SECRET', isProduction ? null : 'dev-jwt-secret-not-for-production'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    realtimeTokenExpiresIn: process.env.REALTIME_TOKEN_EXPIRES_IN || '10m',
    authCookieName: process.env.AUTH_COOKIE_NAME || 'juice_journal_auth',
    requireAdminForPriceSync: parseBoolean(process.env.REQUIRE_ADMIN_FOR_PRICE_SYNC, false),
  },
  priceSync: {
    intervalHours: parseInteger(process.env.PRICE_SYNC_INTERVAL, 1),
    minIntervalMs: parseInteger(process.env.PRICE_SYNC_MIN_INTERVAL_MS, 300000),
    defaultLeague: process.env.DEFAULT_LEAGUE || 'Mirage',
  },
  poe: {
    clientId: process.env.POE_CLIENT_ID || '',
    redirectUri: process.env.POE_REDIRECT_URI || '',
    tokenEncryptionKey: process.env.POE_TOKEN_ENCRYPTION_KEY || (isProduction ? '' : 'dev-poe-key-not-for-production'),
    mock: parseBoolean(process.env.POE_OAUTH_MOCK, !isProduction && !process.env.POE_CLIENT_ID),
    scopes: process.env.POE_SCOPES || 'account:profile',
    contact: process.env.POE_CONTACT || 'support@example.com',
  }
};
