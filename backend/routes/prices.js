/**
 * Price Routes
 * Fiyat endpoint'leri
 */

const express = require('express');
const router = express.Router();
const { query, body, validationResult } = require('express-validator');
const { Price } = require('../models');
const { authenticate } = require('../middleware/auth');
const poeNinjaService = require('../services/poeNinjaService');

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
 * GET /api/prices/current
 * Guncel fiyatlari getir
 */
router.get('/current',
  [
    query('league').optional().trim(),
    query('type').optional().isIn([
      'currency', 'fragment', 'scarab', 'map', 
      'divination_card', 'gem', 'unique', 'oil',
      'incubator', 'delirium_orb', 'catalyst', 'other'
    ]),
    query('search').optional().trim(),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { 
        league, 
        type, 
        search, 
        limit = 100 
      } = req.query;

      // Aktif ligi bul
      const activeLeague = league || await Price.getCurrentLeague() || 'Standard';

      const where = {
        league: activeLeague,
        active: true
      };

      if (type) {
        where.itemType = type;
      }

      if (search) {
        where.itemName = {
          [Op.iLike]: `%${search}%`
        };
      }

      const prices = await Price.findAll({
        where,
        order: [['chaosValue', 'DESC']],
        limit: parseInt(limit)
      });

      res.json({
        success: true,
        data: {
          prices,
          league: activeLeague,
          count: prices.length,
          updatedAt: prices.length > 0 ? prices[0].updatedAt : null
        },
        error: null
      });
    } catch (error) {
      console.error('Fiyat getirme hatasi:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Fiyatlar alinirken hata olustu'
      });
    }
  }
);

/**
 * GET /api/prices/:itemName
 * Belirli bir item'in fiyatini getir
 */
router.get('/item/:itemName',
  [
    query('league').optional().trim(),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { itemName } = req.params;
      const { league } = req.query;

      const activeLeague = league || await Price.getCurrentLeague() || 'Standard';

      const price = await Price.findOne({
        where: {
          itemName: {
            [Op.iLike]: itemName
          },
          league: activeLeague,
          active: true
        }
      });

      if (!price) {
        return res.status(404).json({
          success: false,
          data: null,
          error: 'Item fiyati bulunamadi'
        });
      }

      res.json({
        success: true,
        data: { price },
        error: null
      });
    } catch (error) {
      console.error('Fiyat getirme hatasi:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Fiyat alinirken hata olustu'
      });
    }
  }
);

/**
 * GET /api/prices/types
 * Mevcut item tiplerini getir
 */
router.get('/types', async (req, res) => {
  try {
    const types = await Price.findAll({
      attributes: [[Price.sequelize.fn('DISTINCT', Price.sequelize.col('item_type')), 'itemType']],
      raw: true
    });

    res.json({
      success: true,
      data: {
        types: types.map(t => t.itemType)
      },
      error: null
    });
  } catch (error) {
    console.error('Tip getirme hatasi:', error);
    res.status(500).json({
      success: false,
      data: null,
      error: 'Tipler alinirken hata olustu'
    });
  }
});

/**
 * GET /api/prices/leagues
 * Mevcut ligleri getir
 */
router.get('/leagues', async (req, res) => {
  try {
    const leagues = await Price.findAll({
      attributes: [[Price.sequelize.fn('DISTINCT', Price.sequelize.col('league')), 'league']],
      raw: true
    });

    res.json({
      success: true,
      data: {
        leagues: leagues.map(l => l.league)
      },
      error: null
    });
  } catch (error) {
    console.error('Lig getirme hatasi:', error);
    res.status(500).json({
      success: false,
      data: null,
      error: 'Ligler alinirken hata olustu'
    });
  }
});

/**
 * POST /api/prices/sync
 * poe.ninja'dan fiyatlari senkronize et (Admin/Internal)
 */
router.post('/sync',
  authenticate,
  [
    body('league').optional().trim(),
    body('types').optional().isArray(),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { league, types } = req.body;

      const targetLeague = league || await Price.getCurrentLeague() || 'Ancestor';
      const targetTypes = types || [
        'Currency',
        'Fragment',
        'Scarab',
        'Map',
        'DivinationCard',
        'SkillGem',
        'UniqueMap',
        'Oil',
        'Incubator',
        'DeliriumOrb',
        'Catalyst'
      ];

      console.log(`Fiyat senkronizasyonu basladi: ${targetLeague}`);
      
      const results = await poeNinjaService.syncAllPrices(targetLeague, targetTypes);

      // WebSocket uzerinden broadcast
      if (req.app.broadcast) {
        req.app.broadcast({
          type: 'PRICES_SYNCED',
          data: { 
            league: targetLeague, 
            syncedAt: new Date(),
            results 
          }
        });
      }

      res.json({
        success: true,
        data: {
          message: 'Fiyat senkronizasyonu tamamlandi',
          league: targetLeague,
          results
        },
        error: null
      });
    } catch (error) {
      console.error('Fiyat senkronizasyon hatasi:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Fiyatlar senkronize edilirken hata olustu'
      });
    }
  }
);

/**
 * GET /api/prices/currency-overview
 * Poe.ninja currency overview (Ham veri)
 */
router.get('/currency-overview',
  [
    query('league').optional().trim(),
    query('type').optional().trim(),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { league = 'Ancestor', type = 'Currency' } = req.query;
      
      const data = await poeNinjaService.getCurrencyOverview(league, type);

      res.json({
        success: true,
        data,
        error: null
      });
    } catch (error) {
      console.error('Currency overview hatasi:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Currency overview alinirken hata olustu'
      });
    }
  }
);

/**
 * GET /api/prices/item-overview
 * Poe.ninja item overview (Ham veri)
 */
router.get('/item-overview',
  [
    query('league').optional().trim(),
    query('type').optional().trim(),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { league = 'Ancestor', type = 'Map' } = req.query;
      
      const data = await poeNinjaService.getItemOverview(league, type);

      res.json({
        success: true,
        data,
        error: null
      });
    } catch (error) {
      console.error('Item overview hatasi:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Item overview alinirken hata olustu'
      });
    }
  }
);

module.exports = router;
