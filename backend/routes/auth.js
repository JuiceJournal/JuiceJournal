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
const env = require('../config/env');
const { Op } = require('sequelize');

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

function errorResponse(res, status, error, errorCode) {
  return res.status(status).json({
    success: false,
    data: null,
    error,
    errorCode
  });
}

function setAuthCookie(res, token) {
  const secure = env.isProduction;
  const sameSite = secure ? 'None' : 'Lax';
  const parts = [
    `${env.auth.authCookieName}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `SameSite=${sameSite}`,
    'Max-Age=604800'
  ];

  if (secure) {
    parts.push('Secure');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearAuthCookie(res) {
  const secure = env.isProduction;
  const sameSite = secure ? 'None' : 'Lax';
  const parts = [
    `${env.auth.authCookieName}=`,
    'Path=/',
    'HttpOnly',
    `SameSite=${sameSite}`,
    'Max-Age=0'
  ];

  if (secure) {
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
          token,
          capabilities: getCapabilities(user)
        },
        error: null
      });
    } catch (error) {
      console.error('Kayit hatasi:', error);
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
          token,
          capabilities: getCapabilities(user)
        },
        error: null
      });
    } catch (error) {
      console.error('Giris hatasi:', error);
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
    res.json({
      success: true,
      data: {
        user: req.user,
        capabilities: getCapabilities(req.user)
      },
      error: null
    });
  } catch (error) {
    console.error('Profil getirme hatasi:', error);
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
    console.error('Realtime token error:', error);
    errorResponse(res, 500, 'Realtime token olusturulamadi', 'REALTIME_TOKEN_FAILED');
  }
});

/**
 * POST /api/auth/poe/connect/start
 * Path of Exile account linking flow start
 */
router.post('/poe/connect/start',
  authenticate,
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

      const authUrl = poeAuthService.buildAuthorizationUrl({
        redirectUri,
        codeChallenge,
        state,
      });

      res.json({
        success: true,
        data: {
          mode: 'live',
          requiresBrowser: true,
          state,
          authUrl,
          scopes: poeAuthService.getScopes()
        },
        error: null
      });
    } catch (error) {
      console.error('PoE connect start error:', error);
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

      res.json({
        success: true,
        data: {
          mode: 'live',
          poe: linkedUser.getPoeStatus()
        },
        error: null
      });
    } catch (error) {
      console.error('PoE connect complete error:', error);
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
    console.error('PoE status error:', error);
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

    res.json({
      success: true,
      data: {
        poe: updatedUser.getPoeStatus()
      },
      error: null
    });
  } catch (error) {
    console.error('PoE disconnect error:', error);
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
      console.error('Profil guncelleme hatasi:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Profil guncellenirken hata olustu'
      });
    }
  }
);

module.exports = router;
