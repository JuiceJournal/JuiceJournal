/**
 * Session Routes
 * Map oturumlarinin yonetimi
 */

const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const { Session, LootEntry } = require('../models');
const { authenticate } = require('../middleware/auth');

const { Op } = require('sequelize');

function normalizeOptionalText(value, maxLength) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

const MAX_CLIENT_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;
const MAX_CLIENT_BACKDATE_MS = 7 * 24 * 60 * 60 * 1000;

function parseAndValidateClientTimestamp(value, { field, minDate = null, maxDate = null } = {}) {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw Object.assign(new Error(`${field || 'timestamp'} is invalid`), {
      status: 400,
      errorCode: 'INVALID_TIMESTAMP'
    });
  }

  const now = Date.now();
  if (parsed.getTime() > now + MAX_CLIENT_TIMESTAMP_SKEW_MS) {
    throw Object.assign(new Error(`${field || 'timestamp'} is in the future`), {
      status: 400,
      errorCode: 'TIMESTAMP_IN_FUTURE'
    });
  }

  if (parsed.getTime() < now - MAX_CLIENT_BACKDATE_MS) {
    throw Object.assign(new Error(`${field || 'timestamp'} is too old`), {
      status: 400,
      errorCode: 'TIMESTAMP_TOO_OLD'
    });
  }

  if (minDate && parsed.getTime() < new Date(minDate).getTime()) {
    throw Object.assign(new Error(`${field || 'timestamp'} is before the allowed range`), {
      status: 400,
      errorCode: 'TIMESTAMP_BEFORE_RANGE'
    });
  }

  if (maxDate && parsed.getTime() > new Date(maxDate).getTime()) {
    throw Object.assign(new Error(`${field || 'timestamp'} is after the allowed range`), {
      status: 400,
      errorCode: 'TIMESTAMP_AFTER_RANGE'
    });
  }

  return parsed;
}

/**
 * Validation middleware
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      data: null,
      error: errors.array()[0].msg
    });
  }
  next();
};

function errorResponse(res, status, error, errorCode) {
  return res.status(status).json({
    success: false,
    data: null,
    error,
    errorCode
  });
}

/**
 * GET /api/sessions
 * Tum session'lari listele
 */
router.get('/',
  authenticate,
  [
    query('status').optional().isIn(['active', 'completed', 'abandoned']),
    query('poeVersion').optional().isIn(['poe1', 'poe2']),
    query('league').optional().trim().notEmpty().isLength({ max: 50 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { status, poeVersion, league, limit = 20, offset = 0 } = req.query;

      const where = { userId: req.userId };
      if (status) {
        where.status = status;
      }
      if (poeVersion) {
        where.poeVersion = poeVersion;
      }
      if (league) {
        where.league = league;
      }

      const { count, rows: sessions } = await Session.findAndCountAll({
        where,
        order: [['startedAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json({
        success: true,
        data: {
          sessions,
          total: count,
          limit: parseInt(limit),
          offset: parseInt(offset)
        },
        error: null
      });
    } catch (error) {
      console.error('Session listeleme hatasi:', error);
      errorResponse(res, 500, 'Session\'lar alinirken hata olustu', 'SESSION_LIST_LOAD_FAILED');
    }
  }
);

/**
 * GET /api/sessions/active
 * Aktif session'lari getir
 */
router.get('/active', authenticate, async (req, res) => {
  try {
    const session = await Session.findOne({
      where: {
        userId: req.userId,
        status: 'active'
      },
      include: [{
        model: LootEntry,
        as: 'lootEntries',
        order: [['createdAt', 'DESC']]
      }]
    });

    res.json({
      success: true,
      data: { session },
      error: null
    });
  } catch (error) {
    console.error('Aktif session getirme hatasi:', error);
    errorResponse(res, 500, 'Aktif session alinirken hata olustu', 'ACTIVE_SESSION_LOAD_FAILED');
  }
});

/**
 * GET /api/sessions/:id
 * Session detaylarini getir
 */
router.get('/:id',
  authenticate,
  [
    param('id').isUUID().withMessage('Gecerli bir session ID giriniz'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const session = await Session.findOne({
        where: {
          id: req.params.id,
          userId: req.userId
        },
        include: [{
          model: LootEntry,
          as: 'lootEntries',
          order: [['createdAt', 'DESC']]
        }]
      });

      if (!session) {
        return errorResponse(res, 404, 'Session bulunamadi', 'SESSION_NOT_FOUND');
      }

      res.json({
        success: true,
        data: { session },
        error: null
      });
    } catch (error) {
      console.error('Session getirme hatasi:', error);
      errorResponse(res, 500, 'Session alinirken hata olustu', 'SESSION_LOAD_FAILED');
    }
  }
);

/**
 * POST /api/sessions/start
 * Yeni session baslat
 */
router.post('/start',
  authenticate,
  [
    body('mapName')
      .trim()
      .notEmpty()
      .withMessage('Map adi gereklidir')
      .isLength({ max: 100 }),
    body('poeVersion')
      .isIn(['poe1', 'poe2'])
      .withMessage('PoE versiyonu gereklidir'),
    body('league')
      .trim()
      .notEmpty()
      .withMessage('Lig gereklidir')
      .isLength({ max: 50 }),
    body('mapTier').optional().isInt({ min: 1, max: 21 }),
    body('mapType').optional().trim().isLength({ max: 50 }),
    body('strategyTag').optional({ nullable: true }).trim().isLength({ max: 50 }),
    body('notes').optional({ nullable: true }).trim().isLength({ max: 2000 }),
    body('costChaos').optional().isFloat({ min: 0 }),
    body('startedAt').optional().isISO8601().withMessage('Gecerli bir baslangic zamani giriniz'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { mapName, mapTier, mapType, costChaos = 0, poeVersion, league, startedAt } = req.body;
      const normalizedStartedAt = parseAndValidateClientTimestamp(startedAt, { field: 'startedAt' });

      // Aktif session kontrolu - atomic with transaction to prevent race condition
      const session = await sequelize.transaction(
        { isolationLevel: sequelize.Transaction.ISOLATION_LEVELS.SERIALIZABLE },
        async (t) => {
          const activeSession = await Session.findOne({
            where: {
              userId: req.userId,
              status: 'active'
            },
            lock: t.LOCK.UPDATE,
            transaction: t
          });

          if (activeSession) {
            throw Object.assign(new Error('Zaten aktif bir session var. Once mevcut session\'i tamamlayin.'), {
              status: 400,
              errorCode: 'SESSION_ALREADY_ACTIVE'
            });
          }

          // Yeni session olustur
          return Session.create({
            userId: req.userId,
            mapName,
            mapTier: mapTier || null,
            mapType: mapType || null,
            strategyTag: normalizeOptionalText(req.body.strategyTag, 50),
            notes: normalizeOptionalText(req.body.notes, 2000),
            poeVersion,
            league,
            costChaos,
            status: 'active',
            startedAt: normalizedStartedAt || new Date()
          }, { transaction: t });
        }
      );

      // WebSocket uzerinden broadcast
      if (req.app.broadcast) {
        req.app.broadcast({
          type: 'SESSION_STARTED',
          data: { session }
        }, {
          targetUserId: req.userId
        });
      }

      res.status(201).json({
        success: true,
        data: { session },
        error: null
      });
    } catch (error) {
      console.error('Session baslatma hatasi:', error);
      const errorMessage = error.message || 'Session baslatilirken hata olustu';
      errorResponse(res, error.status || 500, errorMessage, error.errorCode || 'SESSION_START_FAILED');
    }
  }
);

/**
 * PUT /api/sessions/:id
 * Session metadata guncelle
 */
router.put('/:id',
  authenticate,
  [
    param('id').isUUID().withMessage('Gecerli bir session ID giriniz'),
    body('strategyTag').optional({ nullable: true }).trim().isLength({ max: 50 }),
    body('notes').optional({ nullable: true }).trim().isLength({ max: 2000 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const session = await Session.findOne({
        where: {
          id: req.params.id,
          userId: req.userId
        }
      });

      if (!session) {
        return errorResponse(res, 404, 'Session bulunamadi', 'SESSION_NOT_FOUND');
      }

      const updates = {};
      if (Object.prototype.hasOwnProperty.call(req.body, 'strategyTag')) {
        updates.strategyTag = normalizeOptionalText(req.body.strategyTag, 50);
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'notes')) {
        updates.notes = normalizeOptionalText(req.body.notes, 2000);
      }

      await session.update(updates);

      const updatedSession = await Session.findOne({
        where: {
          id: req.params.id,
          userId: req.userId
        },
        include: [{
          model: LootEntry,
          as: 'lootEntries',
          order: [['createdAt', 'DESC']]
        }]
      });

      res.json({
        success: true,
        data: { session: updatedSession },
        error: null
      });
    } catch (error) {
      console.error('Session guncelleme hatasi:', error);
      errorResponse(res, 500, 'Session guncellenirken hata olustu', 'SESSION_UPDATE_FAILED');
    }
  }
);

/**
 * PUT /api/sessions/:id/end
 * Session'i tamamla
 */
router.put('/:id/end',
  authenticate,
  [
    param('id').isUUID().withMessage('Gecerli bir session ID giriniz'),
    body('endedAt').optional().isISO8601().withMessage('Gecerli bir bitis zamani giriniz'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { endedAt } = req.body || {};
      const session = await Session.findOne({
        where: {
          id: req.params.id,
          userId: req.userId,
          status: 'active'
        }
      });

      if (!session) {
        return errorResponse(res, 404, 'Aktif session bulunamadi', 'ACTIVE_SESSION_NOT_FOUND');
      }

      const finalEndedAt = parseAndValidateClientTimestamp(endedAt, {
        field: 'endedAt',
        minDate: session.startedAt
      });

      await session.complete(finalEndedAt || null);

      // WebSocket uzerinden broadcast
      if (req.app.broadcast) {
        req.app.broadcast({
          type: 'SESSION_COMPLETED',
          data: { session }
        }, {
          targetUserId: req.userId
        });
      }

      res.json({
        success: true,
        data: { session },
        error: null
      });
    } catch (error) {
      console.error('Session tamamlama hatasi:', error);
      const errorMessage = error.errorCode ? 'Session zamani gecersiz' : (error.message || 'Session tamamlanirken hata olustu');
      errorResponse(res, error.status || 500, errorMessage, error.errorCode || 'SESSION_END_FAILED');
    }
  }
);

/**
 * PUT /api/sessions/:id/abandon
 * Session'i iptal et
 */
router.put('/:id/abandon',
  authenticate,
  [
    param('id').isUUID().withMessage('Gecerli bir session ID giriniz'),
    body('endedAt').optional().isISO8601().withMessage('Gecerli bir bitis zamani giriniz'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { endedAt } = req.body || {};
      const session = await Session.findOne({
        where: {
          id: req.params.id,
          userId: req.userId,
          status: 'active'
        }
      });

      if (!session) {
        return errorResponse(res, 404, 'Aktif session bulunamadi', 'ACTIVE_SESSION_NOT_FOUND');
      }

      const finalEndedAt = parseAndValidateClientTimestamp(endedAt, {
        field: 'endedAt',
        minDate: session.startedAt
      });

      await session.abandon(finalEndedAt || null);

      res.json({
        success: true,
        data: { session },
        error: null
      });
    } catch (error) {
      console.error('Session iptal hatasi:', error);
      const errorMessage = error.errorCode ? 'Session zamani gecersiz' : (error.message || 'Session iptal edilirken hata olustu');
      errorResponse(res, error.status || 500, errorMessage, error.errorCode || 'SESSION_ABANDON_FAILED');
    }
  }
);

/**
 * DELETE /api/sessions/:id
 * Session'i sil
 */
router.delete('/:id',
  authenticate,
  [
    param('id').isUUID().withMessage('Gecerli bir session ID giriniz'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const session = await Session.findOne({
        where: {
          id: req.params.id,
          userId: req.userId
        }
      });

      if (!session) {
        return errorResponse(res, 404, 'Session bulunamadi', 'SESSION_NOT_FOUND');
      }

      await session.destroy();

      res.json({
        success: true,
        data: { message: 'Session basariyla silindi' },
        error: null
      });
    } catch (error) {
      console.error('Session silme hatasi:', error);
      errorResponse(res, 500, 'Session silinirken hata olustu', 'SESSION_DELETE_FAILED');
    }
  }
);

module.exports = router;
