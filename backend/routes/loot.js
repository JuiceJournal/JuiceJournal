/**
 * Loot Routes
 * Loot entry islemleri
 */

const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const { Session, LootEntry, Price } = require('../models');
const { authenticate } = require('../middleware/auth');

const { Op } = require('sequelize');

function errorResponse(res, status, error, errorCode) {
  return res.status(status).json({
    success: false,
    data: null,
    error,
    errorCode
  });
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

/**
 * POST /api/loot
 * Yeni loot entry ekle
 */
router.post('/',
  authenticate,
  [
    body('sessionId').isUUID().withMessage('Gecerli bir session ID giriniz'),
    body('itemName').trim().notEmpty().withMessage('Item adi gereklidir'),
    body('itemType').optional().isIn([
      'currency', 'fragment', 'scarab', 'map',
      'divination_card', 'gem', 'unique', 'other'
    ]),
    body('quantity').optional().isInt({ min: 1 }),
    body('chaosValue').optional().isFloat({ min: 0 }),
    body('divineValue').optional().isFloat({ min: 0 }),
    body('source').optional().isIn(['manual', 'ocr', 'api']),
    body('screenshotPath').optional().trim().isLength({ max: 500 })
      .custom(val => {
        if (val && (val.includes('..') || val.startsWith('/') || /^[a-zA-Z]:/.test(val))) {
          throw new Error('Invalid screenshot path');
        }
        return true;
      }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const {
        sessionId,
        itemName,
        itemType = 'other',
        quantity = 1,
        chaosValue,
        divineValue,
        source = 'manual',
        screenshotPath
      } = req.body;

      // Session kontrolu
      const session = await Session.findOne({
        where: {
          id: sessionId,
          userId: req.userId
        }
      });

      if (!session) {
        return errorResponse(res, 404, 'Session bulunamadi', 'SESSION_NOT_FOUND');
      }

      // Chaos degeri verilmemisse fiyat tablosundan bul
      let finalChaosValue = chaosValue;
      let finalDivineValue = divineValue;

      if (!finalChaosValue) {
        const price = await Price.findOne({
          where: {
            itemName: {
              [Op.iLike]: itemName
            },
            league: session.league,
            poeVersion: session.poeVersion,
            active: true
          },
          order: [['updatedAt', 'DESC']]
        });

        if (price) {
          finalChaosValue = price.chaosValue;
          finalDivineValue = price.divineValue;
        } else {
          finalChaosValue = 0;
        }
      }

      // Loot entry olustur
      const lootEntry = await LootEntry.create({
        sessionId,
        itemName,
        itemType,
        quantity: parseInt(quantity),
        chaosValue: finalChaosValue,
        divineValue: finalDivineValue,
        source,
        screenshotPath
      });

      // Session karini guncelle
      await session.calculateProfit();

      // WebSocket uzerinden broadcast
      if (req.app.broadcast) {
        req.app.broadcast({
          type: 'LOOT_ADDED',
          data: { lootEntry, session }
        }, {
          targetUserId: req.userId
        });
      }

      res.status(201).json({
        success: true,
        data: { lootEntry, session },
        error: null
      });
    } catch (error) {
      console.error('Loot ekleme hatasi:', error);
      errorResponse(res, 500, 'Loot eklenirken hata olustu', 'LOOT_ADD_FAILED');
    }
  }
);

/**
 * GET /api/loot/session/:sessionId
 * Session'a ait tum loot entry'lerini getir
 */
router.get('/session/:sessionId',
  authenticate,
  [
    param('sessionId').isUUID().withMessage('Gecerli bir session ID giriniz'),
    query('limit').optional().isInt({ min: 1, max: 500 }),
    query('offset').optional().isInt({ min: 0 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { limit = 100, offset = 0 } = req.query;

      // Session kontrolu
      const session = await Session.findOne({
        where: {
          id: sessionId,
          userId: req.userId
        }
      });

      if (!session) {
        return errorResponse(res, 404, 'Session bulunamadi', 'SESSION_NOT_FOUND');
      }

      const { count, rows: lootEntries } = await LootEntry.findAndCountAll({
        where: { sessionId },
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      // Toplam degerleri hesapla
      const totalChaosValue = lootEntries.reduce((sum, loot) => {
        return sum + (parseFloat(loot.chaosValue) * loot.quantity);
      }, 0);

      res.json({
        success: true,
        data: {
          lootEntries,
          total: count,
          totalChaosValue,
          limit: parseInt(limit),
          offset: parseInt(offset)
        },
        error: null
      });
    } catch (error) {
      console.error('Loot listeleme hatasi:', error);
      errorResponse(res, 500, 'Loot entry\'ler alinirken hata olustu', 'LOOT_LIST_LOAD_FAILED');
    }
  }
);

/**
 * GET /api/loot/recent
 * Kullaniciya ait son loot entry'lerini getir
 */
router.get('/recent',
  authenticate,
  [
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('poeVersion').optional().isIn(['poe1', 'poe2']),
    query('league').optional().trim().notEmpty().isLength({ max: 50 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { limit = 10, poeVersion, league } = req.query;

      const sessionWhere = {
        userId: req.userId
      };

      if (poeVersion) {
        sessionWhere.poeVersion = poeVersion;
      }

      if (league) {
        sessionWhere.league = league;
      }

      const lootEntries = await LootEntry.findAll({
        include: [{
          model: Session,
          as: 'session',
          attributes: [
            'id',
            'mapName',
            'mapTier',
            'mapType',
            'status',
            'poeVersion',
            'league',
            'startedAt',
            'endedAt'
          ],
          where: sessionWhere
        }],
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit)
      });

      res.json({
        success: true,
        data: {
          lootEntries,
          count: lootEntries.length,
          poeVersion: poeVersion || null,
          league: league || null
        },
        error: null
      });
    } catch (error) {
      console.error('Son loot listeleme hatasi:', error);
      errorResponse(res, 500, 'Son loot entry\'ler alinirken hata olustu', 'RECENT_LOOT_LOAD_FAILED');
    }
  }
);

/**
 * GET /api/loot/:id
 * Loot entry detayini getir
 */
router.get('/:id',
  authenticate,
  [
    param('id').isUUID().withMessage('Gecerli bir loot ID giriniz'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const lootEntry = await LootEntry.findOne({
        where: { id: req.params.id },
        include: [{
          model: Session,
          as: 'session',
          where: { userId: req.userId }
        }]
      });

      if (!lootEntry) {
        return errorResponse(res, 404, 'Loot entry bulunamadi', 'LOOT_NOT_FOUND');
      }

      res.json({
        success: true,
        data: { lootEntry },
        error: null
      });
    } catch (error) {
      console.error('Loot getirme hatasi:', error);
      errorResponse(res, 500, 'Loot entry alinirken hata olustu', 'LOOT_LOAD_FAILED');
    }
  }
);

/**
 * PUT /api/loot/:id
 * Loot entry guncelle
 */
router.put('/:id',
  authenticate,
  [
    param('id').isUUID().withMessage('Gecerli bir loot ID giriniz'),
    body('quantity').optional().isInt({ min: 1 }),
    body('chaosValue').optional().isFloat({ min: 0 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { quantity, chaosValue, divineValue } = req.body;

      const lootEntry = await LootEntry.findOne({
        where: { id: req.params.id },
        include: [{
          model: Session,
          as: 'session',
          where: { userId: req.userId }
        }]
      });

      if (!lootEntry) {
        return errorResponse(res, 404, 'Loot entry bulunamadi', 'LOOT_NOT_FOUND');
      }

      await lootEntry.update({
        quantity: quantity !== undefined ? parseInt(quantity) : lootEntry.quantity,
        chaosValue: chaosValue !== undefined ? parseFloat(chaosValue) : lootEntry.chaosValue,
        divineValue: divineValue !== undefined ? parseFloat(divineValue) : lootEntry.divineValue
      });

      // Session karini guncelle
      await lootEntry.session.calculateProfit();

      res.json({
        success: true,
        data: { lootEntry },
        error: null
      });
    } catch (error) {
      console.error('Loot guncelleme hatasi:', error);
      errorResponse(res, 500, 'Loot entry guncellenirken hata olustu', 'LOOT_UPDATE_FAILED');
    }
  }
);

/**
 * DELETE /api/loot/:id
 * Loot entry sil
 */
router.delete('/:id',
  authenticate,
  [
    param('id').isUUID().withMessage('Gecerli bir loot ID giriniz'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const lootEntry = await LootEntry.findOne({
        where: { id: req.params.id },
        include: [{
          model: Session,
          as: 'session',
          where: { userId: req.userId }
        }]
      });

      if (!lootEntry) {
        return errorResponse(res, 404, 'Loot entry bulunamadi', 'LOOT_NOT_FOUND');
      }

      const session = lootEntry.session;
      await lootEntry.destroy();

      // Session karini guncelle
      await session.calculateProfit();

      res.json({
        success: true,
        data: { message: 'Loot entry basariyla silindi' },
        error: null
      });
    } catch (error) {
      console.error('Loot silme hatasi:', error);
      errorResponse(res, 500, 'Loot entry silinirken hata olustu', 'LOOT_DELETE_FAILED');
    }
  }
);

/**
 * POST /api/loot/bulk
 * Toplu loot ekle (OCR veya desktop app icin)
 */
router.post('/bulk',
  authenticate,
  [
    body('sessionId').isUUID().withMessage('Gecerli bir session ID giriniz'),
    body('items').isArray({ min: 1, max: 200 }).withMessage('En az 1, en fazla 200 item gereklidir'),
    body('items.*.itemName').trim().notEmpty().isLength({ max: 200 }),
    body('items.*.itemType').optional().isIn([
      'currency', 'fragment', 'scarab', 'map',
      'divination_card', 'gem', 'unique', 'other'
    ]),
    body('items.*.quantity').optional().isInt({ min: 1, max: 99999 }),
    body('items.*.chaosValue').optional().isFloat({ min: 0 }),
    body('items.*.divineValue').optional().isFloat({ min: 0 }),
    body('items.*.source').optional().isIn(['manual', 'ocr', 'api']),
    body('items.*.screenshotPath').optional().trim().isLength({ max: 500 })
      .custom(val => {
        if (val && (val.includes('..') || val.startsWith('/') || /^[a-zA-Z]:/.test(val))) {
          throw new Error('Invalid screenshot path');
        }
        return true;
      }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { sessionId, items } = req.body;

      // Session kontrolu
      const session = await Session.findOne({
        where: {
          id: sessionId,
          userId: req.userId
        }
      });

      if (!session) {
        return errorResponse(res, 404, 'Session bulunamadi', 'SESSION_NOT_FOUND');
      }

      // Batch price lookup — single query instead of N+1
      const itemsNeedingPrice = items.filter(i => !i.chaosValue);
      const priceMap = new Map();

      if (itemsNeedingPrice.length > 0) {
        const uniqueNames = [...new Set(itemsNeedingPrice.map(i => i.itemName.toLowerCase()))];
        const prices = await Price.findAll({
          where: {
            itemName: { [Op.iLike]: { [Op.any]: uniqueNames } },
            league: session.league,
            poeVersion: session.poeVersion,
            active: true
          },
          order: [['updatedAt', 'DESC']]
        });
        for (const p of prices) {
          const key = p.itemName.toLowerCase();
          if (!priceMap.has(key)) {
            priceMap.set(key, { chaosValue: p.chaosValue, divineValue: p.divineValue });
          }
        }
      }

      // Bulk create all loot entries
      const lootData = items.map(item => {
        let chaosValue = item.chaosValue;
        let divineValue = item.divineValue;

        if (!chaosValue) {
          const found = priceMap.get(item.itemName.toLowerCase());
          if (found) {
            chaosValue = found.chaosValue;
            divineValue = found.divineValue;
          }
        }

        return {
          sessionId,
          itemName: item.itemName,
          itemType: item.itemType || 'other',
          quantity: item.quantity || 1,
          chaosValue: chaosValue || 0,
          divineValue: divineValue || null,
          source: item.source || 'api',
          screenshotPath: item.screenshotPath
        };
      });

      const createdItems = await LootEntry.bulkCreate(lootData);

      // Session karini guncelle
      await session.calculateProfit();

      // WebSocket uzerinden broadcast
      if (req.app.broadcast) {
        req.app.broadcast({
          type: 'LOOT_BULK_ADDED',
          data: { items: createdItems, session }
        }, {
          targetUserId: req.userId
        });
      }

      res.status(201).json({
        success: true,
        data: {
          items: createdItems,
          count: createdItems.length,
          session
        },
        error: null
      });
    } catch (error) {
      console.error('Toplu loot ekleme hatasi:', error);
      errorResponse(res, 500, 'Loot eklenirken hata olustu', 'LOOT_BULK_ADD_FAILED');
    }
  }
);

module.exports = router;
