/**
 * Auth Routes
 * Kullanici kayit, giris ve profil islemleri
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const { User } = require('../models');
const { authenticate, generateRealtimeToken, generateToken } = require('../middleware/auth');
const poeAuthService = require('../services/poeAuthService');
const poeApiService = require('../services/poeApiService');
const env = require('../config/env');
const logger = require('../services/logger');
const { Op } = require('sequelize');

// OAuth state storage with 5-minute TTL to prevent CSRF
const oauthStates = new Map();
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

// Periodic cleanup of expired OAuth states
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStates.entries()) {
    if (now - data.createdAt > OAUTH_STATE_TTL_MS) {
      oauthStates.delete(state);
    }
  }
}, 60 * 1000).unref();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: 'Cok fazla giris denemesi yapildi, lutfen daha sonra tekrar deneyin'
  }
});

function getCapabilities(user) {
  return {
    canSyncPrices: !env.auth.requireAdminForPriceSync || user.role === 'admin'
  };
}

async function buildCurrentUserPayload(user) {
  let characterPayload = {
    characters: [],
    charactersByGame: { poe1: [], poe2: [] },
    selectedCharacterByGame: {},
    syncedAt: null
  };

  try {
    if (user?.poeSub || user?.poeMock || poeAuthService.isMockMode()) {
      characterPayload = await poeApiService.getCachedAccountCharacters(user);
    }
  } catch (error) {
    logger.warn('poe character sync failed', {
      userId: user?.id,
      code: error.code,
      message: error.message
    });
  }

  return {
    user: {
      ...user.toJSON(),
      characters: characterPayload.characters,
      charactersByGame: characterPayload.charactersByGame,
      selectedCharacterByGame: characterPayload.selectedCharacterByGame,
      characterSync: {
        syncedAt: characterPayload.syncedAt,
        available: characterPayload.characters.length > 0
      }
    },
    capabilities: getCapabilities(user)
  };
}

function errorResponse(res, status, error, errorCode) {
  return res.status(status).json({
    success: false,
    data: null,
    error,
    errorCode
  });
}

function setAuthCookie(res, token) {
  const parts = [
    `${env.auth.authCookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=604800'
  ];

  if (env.isProduction) {
    parts.push('Secure');
  } else {
    logger.warn('auth cookie set without Secure flag — not suitable for production', { env: env.nodeEnv });
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearAuthCookie(res) {
  const parts = [
    `${env.auth.authCookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0'
  ];

  if (env.isProduction) {
    parts.push('Secure');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

/**
 * Validation middleware
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return errorResponse(res, 400, errors.array()[0].msg, 'VALIDATION_ERROR');
  }
  next();
};

/**
 * POST /api/auth/register
 * Yeni kullanici kaydi
 */
router.post('/register',
  authLimiter,
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Kullanici adi 3-50 karakter arasinda olmalidir')
      .isAlphanumeric()
      .withMessage('Kullanici adi sadece harf ve rakam icerebilir'),
    body('email')
      .trim()
      .isEmail()
      .withMessage('Gecerli bir e-posta adresi giriniz')
      .normalizeEmail(),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Sifre en az 6 karakter olmalidir'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { username, email, password } = req.body;

      // Kullanici adi veya email kontrolu
      const existingUser = await User.findOne({
        where: {
          [Op.or]: [
            { username },
            { email }
          ]
        }
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          data: null,
          error: existingUser.username === username
            ? 'Bu kullanici adi zaten kullaniliyor'
            : 'Bu e-posta adresi zaten kullaniliyor',
          errorCode: existingUser.username === username ? 'USERNAME_TAKEN' : 'EMAIL_TAKEN'
        });
      }

      // Sifreyi hashle
      const passwordHash = await User.hashPassword(password);

      // Kullanici olustur
      const user = await User.create({
        username,
        email,
        passwordHash
      });

      // Token olustur
      const token = generateToken(user.id);
      setAuthCookie(res, token);

      res.status(201).json({
        success: true,
        data: {
          user,
          capabilities: getCapabilities(user)
        },
        error: null
      });
    } catch (error) {
      logger.error('registration failed', { message: error.message });
      errorResponse(res, 500, 'Kayit sirasinda bir hata olustu', 'REGISTER_FAILED');
    }
  }
);

/**
 * POST /api/auth/login
 * Kullanici girisi
 */
router.post('/login',
  authLimiter,
  [
    body('username')
      .trim()
      .notEmpty()
      .withMessage('Kullanici adi veya e-posta gereklidir'),
    body('password')
      .notEmpty()
      .withMessage('Sifre gereklidir'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { username, password } = req.body;

      // Kullaniciyi bul (username veya email ile)
      const user = await User.findOne({
        where: {
          [Op.or]: [
            { username },
            { email: username }
          ]
        }
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          data: null,
          error: 'Kullanici adi veya sifre hatali',
          errorCode: 'INVALID_CREDENTIALS'
        });
      }

      // Sifreyi dogrula
      const isValidPassword = await user.comparePassword(password);

      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          data: null,
          error: 'Kullanici adi veya sifre hatali',
          errorCode: 'INVALID_CREDENTIALS'
        });
      }

      // Token olustur
      const token = generateToken(user.id);
      setAuthCookie(res, token);

      res.json({
        success: true,
        data: {
          user,
          capabilities: getCapabilities(user)
        },
        error: null
      });
    } catch (error) {
      logger.error('login failed', { message: error.message });
      errorResponse(res, 500, 'Giris sirasinda bir hata olustu', 'LOGIN_FAILED');
    }
  }
);

/**
 * GET /api/auth/me
 * Mevcut kullanici bilgilerini getir
 */
router.get('/me', authenticate, async (req, res) => {
  try {
    const payload = await buildCurrentUserPayload(req.user);

    res.json({
      success: true,
      data: payload,
      error: null
    });
  } catch (error) {
    logger.error('profile load failed', { message: error.message });
    errorResponse(res, 500, 'Profil bilgileri alinirken hata olustu', 'PROFILE_LOAD_FAILED');
  }
});

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({
    success: true,
    data: { loggedOut: true },
    error: null
  });
});

router.get('/realtime-token', authenticate, async (req, res) => {
  try {
    const token = generateRealtimeToken(req.userId);
    res.json({
      success: true,
      data: { token },
      error: null
    });
  } catch (error) {
    logger.error('realtime token failed', { message: error.message });
    errorResponse(res, 500, 'Realtime token olusturulamadi', 'REALTIME_TOKEN_FAILED');
  }
});

/**
 * POST /api/auth/poe/login/start
 * Path of Exile OAuth login flow start (no existing session required).
 * Builds the authorization URL the desktop app will open in the browser.
 */
router.post('/poe/login/start',
  authLimiter,
  [
    body('redirectUri').optional().isString(),
    body('codeChallenge').optional().isString(),
    body('codeChallengeMethod').optional().isString(),
    body('state').optional().isString(),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { redirectUri, codeChallenge, state } = req.body;

      if (poeAuthService.isMockMode()) {
        return res.json({
          success: true,
          data: {
            mode: 'mock',
            requiresBrowser: false,
            state: state || `mock-${Date.now()}`,
            mockCode: 'poe-mock-login-code'
          },
          error: null
        });
      }

      if (!poeAuthService.isConfigured()) {
        return errorResponse(res, 400, 'Path of Exile OAuth is not configured', 'POE_OAUTH_NOT_CONFIGURED');
      }

      if (!redirectUri || redirectUri !== process.env.POE_REDIRECT_URI) {
        return errorResponse(res, 400, 'Invalid redirect URI', 'INVALID_REDIRECT_URI');
      }

      // Store state for verification on callback
      const oauthState = state || `state-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      oauthStates.set(oauthState, { createdAt: Date.now() });

      const authUrl = poeAuthService.buildAuthorizationUrl({
        redirectUri,
        codeChallenge,
        state: oauthState,
      });

      res.json({
        success: true,
        data: {
          mode: 'live',
          requiresBrowser: true,
          state: oauthState,
          authUrl,
          scopes: poeAuthService.getScopes()
        },
        error: null
      });
    } catch (error) {
      logger.error('poe login start failed', { message: error.message });
      errorResponse(res, 500, 'Failed to start Path of Exile sign-in', 'POE_LOGIN_START_FAILED');
    }
  }
);

/**
 * POST /api/auth/poe/login/complete
 * Complete Path of Exile OAuth login. Exchanges the authorization code,
 * finds or creates a user account from the PoE profile, and issues a JWT.
 */
router.post('/poe/login/complete',
  authLimiter,
  [
    body('redirectUri').optional().isString(),
    body('code').optional().isString(),
    body('codeVerifier').optional().isString(),
    body('state').optional().isString(),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { redirectUri, code, codeVerifier } = req.body;

      // Mock mode: provision a deterministic mock user so the UI flow works end-to-end.
      if (poeAuthService.isMockMode()) {
        const mockSub = `mock-${Date.now()}`;
        const mockProfile = { uuid: mockSub, name: `Mock${Math.floor(Math.random() * 9000 + 1000)}` };
        const mockTokenPayload = {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expires_in: 36000,
        };

        const user = await poeAuthService.findOrCreateFromPoeProfile(mockProfile, mockTokenPayload);
        const token = generateToken(user.id);
        const payload = await buildCurrentUserPayload(user);
        setAuthCookie(res, token);

        return res.json({
          success: true,
          data: {
            mode: 'mock',
            ...payload,
            poe: user.getPoeStatus()
          },
          error: null
        });
      }

      if (!poeAuthService.isConfigured()) {
        return errorResponse(res, 400, 'Path of Exile OAuth is not configured', 'POE_OAUTH_NOT_CONFIGURED');
      }

      if (!redirectUri || redirectUri !== process.env.POE_REDIRECT_URI) {
        return errorResponse(res, 400, 'Invalid redirect URI', 'INVALID_REDIRECT_URI');
      }

      if (!code || !codeVerifier) {
        return errorResponse(res, 400, 'Authorization code and PKCE verifier are required', 'POE_AUTHORIZATION_CODE_REQUIRED');
      }

      // Verify OAuth state to prevent CSRF
      const receivedState = req.body.state;
      if (!receivedState || !oauthStates.has(receivedState)) {
        return errorResponse(res, 400, 'Invalid or expired OAuth state', 'OAUTH_STATE_INVALID');
      }
      oauthStates.delete(receivedState);

      const tokenPayload = await poeAuthService.exchangeCode({
        code,
        codeVerifier,
        redirectUri
      });

      const profile = await poeAuthService.fetchProfile(tokenPayload.access_token);
      const user = await poeAuthService.findOrCreateFromPoeProfile(profile, tokenPayload);

      const token = generateToken(user.id);
      const payload = await buildCurrentUserPayload(user);
      setAuthCookie(res, token);

      res.json({
        success: true,
        data: {
          mode: 'live',
          ...payload,
          poe: user.getPoeStatus()
        },
        error: null
      });
    } catch (error) {
      logger.error('poe login complete failed', { message: error.message });
      errorResponse(res, 500, 'Failed to complete Path of Exile sign-in', 'POE_LOGIN_COMPLETE_FAILED');
    }
  }
);

/**
 * POST /api/auth/poe/connect/start
 * Path of Exile account linking flow start
 */
router.post('/poe/connect/start',
  authenticate,
  authLimiter,
  [
    body('redirectUri').optional().isString(),
    body('codeChallenge').optional().isString(),
    body('codeChallengeMethod').optional().isString(),
    body('state').optional().isString(),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { redirectUri, codeChallenge, state } = req.body;

      if (poeAuthService.isMockMode()) {
        return res.json({
          success: true,
          data: {
            mode: 'mock',
            requiresBrowser: false,
            state: state || `mock-${Date.now()}`,
            mockCode: 'poe-mock-code'
          },
          error: null
        });
      }

      if (!poeAuthService.isConfigured()) {
        return errorResponse(res, 400, 'Path of Exile OAuth is not configured', 'POE_OAUTH_NOT_CONFIGURED');
      }

      if (!redirectUri || redirectUri !== process.env.POE_REDIRECT_URI) {
        return errorResponse(res, 400, 'Invalid redirect URI', 'INVALID_REDIRECT_URI');
      }

      // Store state for verification on callback
      const oauthState = state || `state-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      oauthStates.set(oauthState, { createdAt: Date.now() });

      const authUrl = poeAuthService.buildAuthorizationUrl({
        redirectUri,
        codeChallenge,
        state: oauthState,
      });

      res.json({
        success: true,
        data: {
          mode: 'live',
          requiresBrowser: true,
          state: oauthState,
          authUrl,
          scopes: poeAuthService.getScopes()
        },
        error: null
      });
    } catch (error) {
      logger.error('poe connect start failed', { message: error.message });
      errorResponse(res, 500, 'Failed to start Path of Exile linking', 'POE_CONNECT_START_FAILED');
    }
  }
);

/**
 * POST /api/auth/poe/connect/complete
 * Complete Path of Exile account linking
 */
router.post('/poe/connect/complete',
  authenticate,
  authLimiter,
  [
    body('redirectUri').optional().isString(),
    body('code').optional().isString(),
    body('codeVerifier').optional().isString(),
    body('state').optional().isString(),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { redirectUri, code, codeVerifier } = req.body;

      if (poeAuthService.isMockMode()) {
        const linkedUser = await poeAuthService.persistPoeLink(
          req.user,
          poeAuthService.createMockLinkPayload(req.user)
        );
        poeApiService.invalidateAccountCharactersCache(linkedUser);

        return res.json({
          success: true,
          data: {
            poe: linkedUser.getPoeStatus()
          },
          error: null
        });
      }

      if (!poeAuthService.isConfigured()) {
        return errorResponse(res, 400, 'Path of Exile OAuth is not configured', 'POE_OAUTH_NOT_CONFIGURED');
      }

      if (!redirectUri || redirectUri !== process.env.POE_REDIRECT_URI) {
        return errorResponse(res, 400, 'Invalid redirect URI', 'INVALID_REDIRECT_URI');
      }

      if (!code || !codeVerifier) {
        return errorResponse(res, 400, 'Authorization code and PKCE verifier are required', 'POE_AUTHORIZATION_CODE_REQUIRED');
      }

      // Verify OAuth state to prevent CSRF
      const receivedState = req.body.state;
      if (!receivedState || !oauthStates.has(receivedState)) {
        return errorResponse(res, 400, 'Invalid or expired OAuth state', 'OAUTH_STATE_INVALID');
      }
      oauthStates.delete(receivedState);

      const tokenPayload = await poeAuthService.exchangeCode({
        code,
        codeVerifier,
        redirectUri
      });

      const profile = await poeAuthService.fetchProfile(tokenPayload.access_token);
      const linkedUser = await poeAuthService.persistPoeLink(req.user, {
        sub: profile.uuid,
        accountName: profile.name,
        accessToken: tokenPayload.access_token,
        refreshToken: tokenPayload.refresh_token,
        expiresAt: new Date(Date.now() + ((tokenPayload.expires_in || 0) * 1000)),
        linkedAt: new Date(),
        mock: false,
      });
      poeApiService.invalidateAccountCharactersCache(linkedUser);

      res.json({
        success: true,
        data: {
          mode: 'live',
          poe: linkedUser.getPoeStatus()
        },
        error: null
      });
    } catch (error) {
      logger.error('poe connect complete failed', { message: error.message });
      errorResponse(res, 500, 'Failed to complete Path of Exile linking', 'POE_CONNECT_COMPLETE_FAILED');
    }
  }
);

/**
 * GET /api/auth/poe/status
 * Get Path of Exile linking status
 */
router.get('/poe/status', authenticate, async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        mode: poeAuthService.isMockMode() ? 'mock' : 'live',
        configured: poeAuthService.isConfigured(),
        poe: req.user.getPoeStatus()
      },
      error: null
    });
  } catch (error) {
    logger.error('poe status failed', { message: error.message });
    errorResponse(res, 500, 'Failed to get Path of Exile link status', 'POE_STATUS_LOAD_FAILED');
  }
});

/**
 * DELETE /api/auth/poe/disconnect
 * Remove Path of Exile link
 */
router.delete('/poe/disconnect', authenticate, async (req, res) => {
  try {
    const updatedUser = await poeAuthService.clearPoeLink(req.user);
    poeApiService.invalidateAccountCharactersCache(updatedUser);

    res.json({
      success: true,
      data: {
        poe: updatedUser.getPoeStatus()
      },
      error: null
    });
  } catch (error) {
    logger.error('poe disconnect failed', { message: error.message });
    errorResponse(res, 500, 'Failed to disconnect Path of Exile account', 'POE_DISCONNECT_FAILED');
  }
});

/**
 * PUT /api/auth/me
 * Kullanici profilini guncelle
 */
router.put('/me',
  authenticate,
  [
    body('email')
      .optional()
      .isEmail()
      .withMessage('Gecerli bir e-posta adresi giriniz')
      .normalizeEmail(),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { email } = req.body;

      // Email degisikligi varsa kontrol et
      if (email && email !== req.user.email) {
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
          return res.status(400).json({
            success: false,
            data: null,
            error: 'Bu e-posta adresi zaten kullaniliyor'
          });
        }
      }

      await req.user.update({ email });

      res.json({
        success: true,
        data: {
          user: req.user
        },
        error: null
      });
    } catch (error) {
      logger.error('profile update failed', { message: error.message });
      res.status(500).json({
        success: false,
        data: null,
        error: 'Profil guncellenirken hata olustu'
      });
    }
  }
);

module.exports = router;
