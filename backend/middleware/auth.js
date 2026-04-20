/**
 * Authentication Middleware
 * JWT token verification and authorization
 */

const jwt = require('jsonwebtoken');
const { User } = require('../models');
const env = require('../config/env');

const JWT_SECRET = env.auth.jwtSecret;
const AUTH_COOKIE_NAME = env.auth.authCookieName;

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.substring(7);
    if (bearerToken) {
      return bearerToken;
    }
  }

  const cookieHeader = req.headers.cookie || '';
  if (!cookieHeader) return null;

  const cookie = cookieHeader
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${AUTH_COOKIE_NAME}=`));

  if (!cookie) return null;

  return decodeURIComponent(cookie.substring(AUTH_COOKIE_NAME.length + 1));
}

/**
 * JWT token verification middleware
 */
const authenticate = async (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'Authorization token is required',
        errorCode: 'AUTH_TOKEN_REQUIRED'
      });
    }

    // Verify the token.
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

    // Find the user.
    const user = await User.findByPk(decoded.userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'User not found',
        errorCode: 'AUTH_USER_NOT_FOUND'
      });
    }

    // Attach user information to the request.
    req.user = user;
    req.userId = user.id;

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'Token expired. Please sign in again',
        errorCode: 'AUTH_TOKEN_EXPIRED'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        data: null,
        error: 'Invalid token',
        errorCode: 'AUTH_TOKEN_INVALID'
      });
    }

    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      data: null,
      error: 'Authorization failed',
      errorCode: 'AUTH_MIDDLEWARE_FAILED'
    });
  }
};

/**
 * Optional auth - attach the user when a token is present, otherwise continue
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return next();
    }
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const user = await User.findByPk(decoded.userId);

    if (user) {
      req.user = user;
      req.userId = user.id;
    }

    next();
  } catch (error) {
    // Continue on error as if no user is present.
    next();
  }
};

/**
 * JWT token helper
 */
const generateToken = (userId) => {
  return jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: env.auth.jwtExpiresIn }
  );
};

const generateRealtimeToken = (userId) => {
  return jwt.sign(
    { userId, kind: 'realtime' },
    JWT_SECRET,
    { expiresIn: env.auth.realtimeTokenExpiresIn }
  );
};

const verifyRealtimeToken = (token) => {
  const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });

  if (decoded?.kind !== 'realtime') {
    const error = new Error('Expected a realtime token');
    error.code = 'REALTIME_TOKEN_REQUIRED';
    throw error;
  }

  return decoded;
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      data: null,
      error: 'Authorization token is required',
      errorCode: 'AUTH_TOKEN_REQUIRED'
    });
  }

  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      data: null,
      error: 'You do not have permission to perform this action',
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
  generateRealtimeToken,
  verifyRealtimeToken
};
