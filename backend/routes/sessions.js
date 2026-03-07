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
        offset: parseInt(offset),
        include: [{
          model: LootEntry,
          as: 'lootEntries',
          attributes: ['id', 'itemName', 'quantity', 'chaosValue']
        }]
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
      res.status(500).json({
        success: false,
        data: null,
        error: 'Session\'lar alinirken hata olustu'
      });
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
    res.status(500).json({
      success: false,
      data: null,
      error: 'Aktif session alinirken hata olustu'
    });
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
        return res.status(404).json({
          success: false,
          data: null,
          error: 'Session bulunamadi'
        });
      }

      res.json({
        success: true,
        data: { session },
        error: null
      });
    } catch (error) {
      console.error('Session getirme hatasi:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Session alinirken hata olustu'
      });
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
    body('costChaos').optional().isFloat({ min: 0 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { mapName, mapTier, mapType, costChaos = 0, poeVersion, league } = req.body;

      // Aktif session kontrolu
      const activeSession = await Session.findOne({
        where: {
          userId: req.userId,
          status: 'active'
        }
      });

      if (activeSession) {
        return res.status(400).json({
          success: false,
          data: null,
          error: 'Zaten aktif bir session var. Once mevcut session\'i tamamlayin.'
        });
      }

      // Yeni session olustur
      const session = await Session.create({
        userId: req.userId,
        mapName,
        mapTier: mapTier || null,
        mapType: mapType || null,
        poeVersion,
        league,
        costChaos,
        status: 'active',
        startedAt: new Date()
      });

      // WebSocket uzerinden broadcast
      if (req.app.broadcast) {
        req.app.broadcast({
          type: 'SESSION_STARTED',
          data: { session }
        });
      }

      res.status(201).json({
        success: true,
        data: { session },
        error: null
      });
    } catch (error) {
      console.error('Session baslatma hatasi:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Session baslatilirken hata olustu'
      });
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
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const session = await Session.findOne({
        where: {
          id: req.params.id,
          userId: req.userId,
          status: 'active'
        }
      });

      if (!session) {
        return res.status(404).json({
          success: false,
          data: null,
          error: 'Aktif session bulunamadi'
        });
      }

      await session.complete();

      // WebSocket uzerinden broadcast
      if (req.app.broadcast) {
        req.app.broadcast({
          type: 'SESSION_COMPLETED',
          data: { session }
        });
      }

      res.json({
        success: true,
        data: { session },
        error: null
      });
    } catch (error) {
      console.error('Session tamamlama hatasi:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Session tamamlanirken hata olustu'
      });
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
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const session = await Session.findOne({
        where: {
          id: req.params.id,
          userId: req.userId,
          status: 'active'
        }
      });

      if (!session) {
        return res.status(404).json({
          success: false,
          data: null,
          error: 'Aktif session bulunamadi'
        });
      }

      await session.abandon();

      res.json({
        success: true,
        data: { session },
        error: null
      });
    } catch (error) {
      console.error('Session iptal hatasi:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Session iptal edilirken hata olustu'
      });
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
        return res.status(404).json({
          success: false,
          data: null,
          error: 'Session bulunamadi'
        });
      }

      await session.destroy();

      res.json({
        success: true,
        data: { message: 'Session basariyla silindi' },
        error: null
      });
    } catch (error) {
      console.error('Session silme hatasi:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Session silinirken hata olustu'
      });
    }
  }
);

module.exports = router;
