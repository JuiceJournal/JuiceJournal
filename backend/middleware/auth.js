/**
 * Authentication Middleware
 * JWT token dogrulama ve yetkilendirme
 */

const jwt = require('jsonwebtoken');
const { User } = require('../models');
const env = require('../config/env');

const JWT_SECRET = env.auth.jwtSecret;

/**
 * JWT token dogrulama middleware
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'Yetkilendirme tokeni gerekli',
        errorCode: 'AUTH_TOKEN_REQUIRED'
      });
    }

    const token = authHeader.substring(7);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'Token bulunamadi',
        errorCode: 'AUTH_TOKEN_MISSING'
      });
    }

    // Token'i dogrula
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Kullaniciyi bul
    const user = await User.findByPk(decoded.userId);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'Kullanici bulunamadi',
        errorCode: 'AUTH_USER_NOT_FOUND'
      });
    }

    // Request'e kullanici bilgisini ekle
    req.user = user;
    req.userId = user.id;
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          data: null,
          error: 'Token suresi doldu, lutfen tekrar giris yapin',
          errorCode: 'AUTH_TOKEN_EXPIRED'
        });
      }
    
    if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          data: null,
          error: 'Gecersiz token',
          errorCode: 'AUTH_TOKEN_INVALID'
        });
      }

    console.error('Auth middleware hatasi:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Yetkilendirme hatasi',
      errorCode: 'AUTH_MIDDLEWARE_FAILED'
    });
  }
};

/**
 * Opsiyonel auth - token varsa kullaniciyi set et, yoksa devam et
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findByPk(decoded.userId);
    
    if (user) {
      req.user = user;
      req.userId = user.id;
    }
    
    next();
  } catch (error) {
    // Hata durumunda devam et, kullanici yokmus gibi
    next();
  }
};

/**
 * JWT token olusturma yardimci fonksiyonu
 */
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: env.auth.jwtExpiresIn }
  );
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      data: null,
      error: 'Yetkilendirme tokeni gerekli',
      errorCode: 'AUTH_TOKEN_REQUIRED'
    });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      data: null,
      error: 'Bu islem icin yetkiniz yok',
      errorCode: 'FORBIDDEN'
    });
  }

  next();
};

module.exports = {
  authenticate,
  optionalAuth,
  requireRole,
  generateToken,
  JWT_SECRET
};
