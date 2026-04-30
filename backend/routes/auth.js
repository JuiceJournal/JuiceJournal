/**
 * Auth Routes
 * Handles user registration, sign-in, and profile operations
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
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

function createOAuthState(userId = null) {
  const state = crypto.randomUUID();
  oauthStates.set(state, {
    createdAt: Date.now(),
    userId: userId || null
  });
  return state;
}

function consumeOAuthState(state, userId = null) {
  const storedState = oauthStates.get(state);
  if (!storedState) {
    return false;
  }

  const expectedUserId = userId || null;
  const stateUserId = storedState.userId || null;
  const expired = Date.now() - storedState.createdAt > OAUTH_STATE_TTL_MS;
  const wrongUser = stateUserId !== expectedUserId;
  oauthStates.delete(state);

  return !expired && !wrongUser;
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    data: null,
    error: 'Too many sign-in attempts. Please try again later.'
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
 * Register a new user
 */
router.post('/register',
  authLimiter,
  [
    body('username')
      .trim()
      .isLength({ min: 3, max: 50 })
      .withMessage('Username must be between 3 and 50 characters')
      .isAlphanumeric()
      .withMessage('Username may only contain letters and numbers'),
    body('email')
      .trim()
      .isEmail()
      .withMessage('Enter a valid email address')
      .normalizeEmail(),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { username, email, password } = req.body;

      // Check for an existing username or email.
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
            ? 'That username is already in use'
            : 'That email address is already in use',
          errorCode: existingUser.username === username ? 'USERNAME_TAKEN' : 'EMAIL_TAKEN'
        });
      }

      // Hash the password.
      const passwordHash = await User.hashPassword(password);

      // Create the user.
      const user = await User.create({
        username,
        email,
        passwordHash
      });

      // Create the token.
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
      errorResponse(res, 500, 'An error occurred during registration', 'REGISTER_FAILED');
    }
  }
);

/**
 * POST /api/auth/login
 * Sign in a user
 */
router.post('/login',
  authLimiter,
  [
    body('username')
      .trim()
      .notEmpty()
      .withMessage('Username or email is required'),
    body('password')
      .notEmpty()
      .withMessage('Password is required'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { username, password } = req.body;

      // Find the user by username or email.
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
          error: 'Invalid username or password',
          errorCode: 'INVALID_CREDENTIALS'
        });
      }

      // Verify the password.
      const isValidPassword = await user.comparePassword(password);

      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          data: null,
          error: 'Invalid username or password',
          errorCode: 'INVALID_CREDENTIALS'
        });
      }

      // Create the token.
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
      errorResponse(res, 500, 'An error occurred during sign in', 'LOGIN_FAILED');
    }
  }
);

/**
 * GET /api/auth/me
 * Get the current user
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
    errorResponse(res, 500, 'Failed to load profile details', 'PROFILE_LOAD_FAILED');
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
    errorResponse(res, 500, 'Failed to create realtime token', 'REALTIME_TOKEN_FAILED');
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
    body('codeChallenge').optional().isString().isLength({ min: 43, max: 128 }),
    body('codeChallengeMethod').optional().isIn(['S256']),
    body('state').optional().isString().isLength({ max: 128 }),
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

      const oauthState = createOAuthState();

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
    body('code').optional().isString().isLength({ max: 2048 }),
    body('codeVerifier').optional().isString().isLength({ min: 43, max: 128 }),
    body('state').optional().isString().isLength({ max: 128 }),
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
      if (!receivedState || !consumeOAuthState(receivedState)) {
        return errorResponse(res, 400, 'Invalid or expired OAuth state', 'OAUTH_STATE_INVALID');
      }

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
    body('codeChallenge').optional().isString().isLength({ min: 43, max: 128 }),
    body('codeChallengeMethod').optional().isIn(['S256']),
    body('state').optional().isString().isLength({ max: 128 }),
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

      const oauthState = createOAuthState(req.userId);

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
    body('code').optional().isString().isLength({ max: 2048 }),
    body('codeVerifier').optional().isString().isLength({ min: 43, max: 128 }),
    body('state').optional().isString().isLength({ max: 128 }),
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
      if (!receivedState || !consumeOAuthState(receivedState, req.userId)) {
        return errorResponse(res, 400, 'Invalid or expired OAuth state', 'OAUTH_STATE_INVALID');
      }

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
 * Update the user profile
 */
router.put('/me',
  authenticate,
  [
    body('email')
      .optional()
      .isEmail()
      .withMessage('Enter a valid email address')
      .normalizeEmail(),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { email } = req.body;

      // Check for an email change.
      if (email && email !== req.user.email) {
        const existingUser = await User.findOne({ where: { email } });
        if (existingUser) {
          return res.status(400).json({
            success: false,
            data: null,
            error: 'That email address is already in use'
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
        error: 'Failed to update profile'
      });
    }
  }
);

module.exports = router;
