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
        return res.status(404).json({
          success: false,
          data: null,
          error: 'Session bulunamadi'
        });
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
        });
      }

      res.status(201).json({
        success: true,
        data: { lootEntry, session },
        error: null
      });
    } catch (error) {
      console.error('Loot ekleme hatasi:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Loot eklenirken hata olustu'
      });
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
        return res.status(404).json({
          success: false,
          data: null,
          error: 'Session bulunamadi'
        });
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
      res.status(500).json({
        success: false,
        data: null,
        error: 'Loot entry\'ler alinirken hata olustu'
      });
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
        return res.status(404).json({
          success: false,
          data: null,
          error: 'Loot entry bulunamadi'
        });
      }

      res.json({
        success: true,
        data: { lootEntry },
        error: null
      });
    } catch (error) {
      console.error('Loot getirme hatasi:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Loot entry alinirken hata olustu'
      });
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
        return res.status(404).json({
          success: false,
          data: null,
          error: 'Loot entry bulunamadi'
        });
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
      res.status(500).json({
        success: false,
        data: null,
        error: 'Loot entry guncellenirken hata olustu'
      });
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
        return res.status(404).json({
          success: false,
          data: null,
          error: 'Loot entry bulunamadi'
        });
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
      res.status(500).json({
        success: false,
        data: null,
        error: 'Loot entry silinirken hata olustu'
      });
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
    body('items').isArray({ min: 1 }).withMessage('En az bir item gereklidir'),
    body('items.*.itemName').trim().notEmpty(),
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
        return res.status(404).json({
          success: false,
          data: null,
          error: 'Session bulunamadi'
        });
      }

      const createdItems = [];

      for (const item of items) {
        // Her item icin fiyat bul
        let chaosValue = item.chaosValue;
        let divineValue = item.divineValue;

        if (!chaosValue) {
          const price = await Price.findOne({
            where: {
              itemName: {
                [Op.iLike]: item.itemName
              },
              active: true
            }
          });

          if (price) {
            chaosValue = price.chaosValue;
            divineValue = price.divineValue;
          }
        }

        const lootEntry = await LootEntry.create({
          sessionId,
          itemName: item.itemName,
          itemType: item.itemType || 'other',
          quantity: item.quantity || 1,
          chaosValue: chaosValue || 0,
          divineValue: divineValue || null,
          source: item.source || 'api',
          screenshotPath: item.screenshotPath
        });

        createdItems.push(lootEntry);
      }

      // Session karini guncelle
      await session.calculateProfit();

      // WebSocket uzerinden broadcast
      if (req.app.broadcast) {
        req.app.broadcast({
          type: 'LOOT_BULK_ADDED',
          data: { items: createdItems, session }
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
      res.status(500).json({
        success: false,
        data: null,
        error: 'Loot eklenirken hata olustu'
      });
    }
  }
);

module.exports = router;
