/**
 * Authentication Middleware
 * JWT token dogrulama ve yetkilendirme
 */

const jwt = require('jsonwebtoken');
const { User } = require('../models');

function getJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if ((process.env.NODE_ENV || 'development') !== 'production') {
    return 'development-only-jwt-secret';
  }

  throw new Error('JWT_SECRET must be configured in production');
}

const JWT_SECRET = getJwtSecret();

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
        error: 'Yetkilendirme tokeni gerekli'
      });
    }

    const token = authHeader.substring(7);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'Token bulunamadi'
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
        error: 'Kullanici bulunamadi'
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
        error: 'Token suresi doldu, lutfen tekrar giris yapin'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'Gecersiz token'
      });
    }

    console.error('Auth middleware hatasi:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Yetkilendirme hatasi'
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
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

module.exports = {
  authenticate,
  optionalAuth,
  generateToken,
  JWT_SECRET
};
