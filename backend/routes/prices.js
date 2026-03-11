/**
 * Price Routes
 * Price endpoints
 */

const express = require('express');
const router = express.Router();
const { query, body, validationResult } = require('express-validator');
const { Price } = require('../models');
const { authenticate } = require('../middleware/auth');
const poeNinjaService = require('../services/poeNinjaService');

const { Op } = require('sequelize');
const syncState = new Map();
const PRICE_SYNC_MIN_INTERVAL_MS = parseInt(process.env.PRICE_SYNC_MIN_INTERVAL_MS || '300000', 10);

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

const poeVersionValidator = query('poeVersion').optional().isIn(['poe1', 'poe2']);

/**
 * GET /api/prices/current
 * Get current prices
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
    poeVersionValidator,
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const {
        league,
        type,
        search,
        limit = 100,
        poeVersion = 'poe1'
      } = req.query;

      // Find active league
      const activeLeague = league || await Price.getCurrentLeague(poeVersion) || 'Standard';

      const where = {
        league: activeLeague,
        poeVersion,
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
          poeVersion,
          count: prices.length,
          updatedAt: prices.length > 0 ? prices[0].updatedAt : null
        },
        error: null
      });
    } catch (error) {
      console.error('Price fetch error:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Failed to get prices'
      });
    }
  }
);

/**
 * GET /api/prices/:itemName
 * Get price for a specific item
 */
router.get('/item/:itemName',
  [
    query('league').optional().trim(),
    poeVersionValidator,
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { itemName } = req.params;
      const { league, poeVersion = 'poe1' } = req.query;

      const activeLeague = league || await Price.getCurrentLeague(poeVersion) || 'Standard';

      const price = await Price.findOne({
        where: {
          itemName: {
            [Op.iLike]: itemName
          },
          league: activeLeague,
          poeVersion,
          active: true
        }
      });

      if (!price) {
        return res.status(404).json({
          success: false,
          data: null,
          error: 'Item price not found'
        });
      }

      res.json({
        success: true,
        data: { price },
        error: null
      });
    } catch (error) {
      console.error('Price fetch error:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Failed to get price'
      });
    }
  }
);

/**
 * GET /api/prices/types
 * Get available item types
 */
router.get('/types',
  [
    poeVersionValidator,
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { poeVersion = 'poe1' } = req.query;

      const where = { poeVersion };
      const types = await Price.findAll({
        attributes: [[Price.sequelize.fn('DISTINCT', Price.sequelize.col('item_type')), 'itemType']],
        where,
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
      console.error('Type fetch error:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Failed to get types'
      });
    }
  }
);

/**
 * GET /api/prices/leagues
 * Get available leagues
 */
router.get('/leagues',
  [
    poeVersionValidator,
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { poeVersion = 'poe1' } = req.query;

      const where = { poeVersion };
      const leagues = await Price.findAll({
        attributes: [[Price.sequelize.fn('DISTINCT', Price.sequelize.col('league')), 'league']],
        where,
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
      console.error('League fetch error:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Failed to get leagues'
      });
    }
  }
);

/**
 * POST /api/prices/sync
 * Sync prices from poe.ninja (Admin/Internal)
 */
router.post('/sync',
  authenticate,
  [
    body('league').optional().trim(),
    body('types').optional().isArray(),
    body('poeVersion').optional().isIn(['poe1', 'poe2']),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { league, types, poeVersion = 'poe1' } = req.body;

      const targetLeague = league || await Price.getCurrentLeague(poeVersion) || 'Standard';
      const targetTypes = types || poeNinjaService.getDefaultSyncTypes(poeVersion);
      const syncKey = `${poeVersion}:${targetLeague}`;
      const currentState = syncState.get(syncKey);
      const now = Date.now();

      if (currentState?.inFlight) {
        return res.status(429).json({
          success: false,
          data: null,
          error: 'Price sync is already running for this context'
        });
      }

      if (currentState?.lastSuccessAt && (now - currentState.lastSuccessAt) < PRICE_SYNC_MIN_INTERVAL_MS) {
        return res.status(429).json({
          success: false,
          data: null,
          error: 'Prices were synced recently for this context'
        });
      }

      console.log(`Price sync started: ${targetLeague} (${poeVersion})`);
      syncState.set(syncKey, {
        inFlight: true,
        lastSuccessAt: currentState?.lastSuccessAt || null
      });

      const results = await poeNinjaService.syncAllPrices(targetLeague, targetTypes, poeVersion);
      syncState.set(syncKey, {
        inFlight: false,
        lastSuccessAt: Date.now()
      });

      // Broadcast via WebSocket
      if (req.app.broadcast) {
        req.app.broadcast({
          type: 'PRICES_SYNCED',
          data: {
            league: targetLeague,
            poeVersion,
            syncedAt: new Date(),
            results
          }
        }, {
          targetUserId: req.userId
        });
      }

      res.json({
        success: true,
        data: {
          message: 'Price sync completed',
          league: targetLeague,
          poeVersion,
          results
        },
        error: null
      });
    } catch (error) {
      const { league, poeVersion = 'poe1' } = req.body;
      const targetLeague = league || await Price.getCurrentLeague(poeVersion) || 'Standard';
      const syncKey = `${poeVersion}:${targetLeague}`;
      const previousState = syncState.get(syncKey);
      syncState.set(syncKey, {
        inFlight: false,
        lastSuccessAt: previousState?.lastSuccessAt || null
      });
      console.error('Price sync error:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Failed to sync prices'
      });
    }
  }
);

/**
 * GET /api/prices/currency-overview
 * Poe.ninja currency overview (raw data)
 */
router.get('/currency-overview',
  [
    query('league').optional().trim(),
    query('type').optional().trim(),
    poeVersionValidator,
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { league = 'Standard', type = 'Currency', poeVersion = 'poe1' } = req.query;

      const data = await poeNinjaService.getCurrencyOverview(league, type, poeVersion);

      res.json({
        success: true,
        data,
        error: null
      });
    } catch (error) {
      console.error('Currency overview error:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Failed to get currency overview'
      });
    }
  }
);

/**
 * GET /api/prices/item-overview
 * Poe.ninja item overview (raw data)
 */
router.get('/item-overview',
  [
    query('league').optional().trim(),
    query('type').optional().trim(),
    poeVersionValidator,
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { league = 'Standard', type = 'Map', poeVersion = 'poe1' } = req.query;

      const data = await poeNinjaService.getItemOverview(league, type, poeVersion);

      res.json({
        success: true,
        data,
        error: null
      });
    } catch (error) {
      console.error('Item overview error:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Failed to get item overview'
      });
    }
  }
);

module.exports = router;
