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
const env = require('../config/env');
const logger = require('../services/logger');

const { Op } = require('sequelize');
const syncState = new Map();
const PRICE_SYNC_MIN_INTERVAL_MS = parseInt(process.env.PRICE_SYNC_MIN_INTERVAL_MS || '300000', 10);
const SYNC_STATE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_SYNC_STATE_ENTRIES = 50;

// Periodic cleanup of stale sync state entries
setInterval(() => {
  const now = Date.now();
  for (const [key, state] of syncState.entries()) {
    if (state?.lastSuccessAt && (now - state.lastSuccessAt) > SYNC_STATE_TTL_MS) {
      syncState.delete(key);
    }
  }
  // LRU-style cap
  while (syncState.size > MAX_SYNC_STATE_ENTRIES) {
    const oldestKey = syncState.keys().next().value;
    syncState.delete(oldestKey);
  }
}, 5 * 60 * 1000).unref(); // Run every 5 minutes

// In-memory cache for /current endpoint (30s TTL)
const priceCache = new Map();
const PRICE_CACHE_TTL_MS = 30000;

function getCachedPrice(poeVersion, league) {
  const key = `${poeVersion}:${league}`;
  const entry = priceCache.get(key);
  if (entry && (Date.now() - entry.timestamp) < PRICE_CACHE_TTL_MS) {
    return entry.data;
  }
  return null;
}

function setCachedPrice(poeVersion, league, data) {
  const key = `${poeVersion}:${league}`;
  priceCache.set(key, { data, timestamp: Date.now() });
}

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
    return errorResponse(res, 400, errors.array()[0].msg, 'VALIDATION_ERROR');
  }
  next();
};

const poeVersionValidator = query('poeVersion').optional().isIn(['poe1', 'poe2']);

function canAccessSyncControls(user) {
  return !env.auth.requireAdminForPriceSync || user?.role === 'admin';
}

function getSyncStatusPayload() {
  const now = Date.now();
  const contexts = Array.from(syncState.entries()).map(([context, state]) => ({
    context,
    inFlight: Boolean(state?.inFlight),
    lastSuccessAt: state?.lastSuccessAt || null,
    cooldownRemainingMs: state?.lastSuccessAt
      ? Math.max(0, PRICE_SYNC_MIN_INTERVAL_MS - (now - state.lastSuccessAt))
      : 0
  }));

  return {
    contexts,
    inFlightCount: contexts.filter((entry) => entry.inFlight).length,
    trackedContexts: contexts.length
  };
}

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
      'incubator', 'delirium_orb', 'catalyst',
      'essence', 'fossil', 'beast', 'rune', 'tattoo', 'omen',
      'soul_core', 'idol', 'expedition', 'ultimatum', 'base_type', 'other'
    ]),
    query('search').optional().trim(),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
    query('sortField').optional().isIn(['itemName', 'chaosValue', 'divineValue', 'updatedAt']),
    query('sortDir').optional().isIn(['asc', 'desc']),
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
        poeVersion = 'poe1',
        sortField = 'chaosValue',
        sortDir = 'desc'
      } = req.query;

      // Find active league
      const activeLeague = league || await Price.getCurrentLeague(poeVersion) || 'Standard';

      // Check cache (only for simple queries without type/search/sort overrides)
      const cacheable = !type && !search && sortField === 'chaosValue' && sortDir === 'desc';
      if (cacheable) {
        const cached = getCachedPrice(poeVersion, activeLeague);
        if (cached) {
          return res.json({
            success: true,
            data: { ...cached, count: cached.prices.length },
            error: null
          });
        }
      }

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
        order: [[sortField, sortDir.toUpperCase()]],
        limit: parseInt(limit)
      });

      const responseData = {
        prices,
        league: activeLeague,
        poeVersion,
        updatedAt: prices.length > 0 ? prices[0].updatedAt : null
      };

      // Store in cache
      if (cacheable) {
        setCachedPrice(poeVersion, activeLeague, responseData);
      }

      res.json({
        success: true,
        data: {
          ...responseData,
          count: prices.length
        },
        error: null
      });
    } catch (error) {
      logger.error('price fetch error', { message: error.message });
      errorResponse(res, 500, 'Failed to get prices', 'PRICES_LOAD_FAILED');
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
        return errorResponse(res, 404, 'Item price not found', 'PRICE_NOT_FOUND');
      }

      res.json({
        success: true,
        data: { price },
        error: null
      });
    } catch (error) {
      logger.error('price fetch error', { message: error.message });
      errorResponse(res, 500, 'Failed to get price', 'PRICE_LOAD_FAILED');
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
      logger.error('type fetch error', { message: error.message });
      errorResponse(res, 500, 'Failed to get types', 'PRICE_TYPES_LOAD_FAILED');
    }
  }
);

/**
 * GET /api/prices/leagues
 * Get available leagues (from poe.ninja + DB)
 */
router.get('/leagues',
  [
    poeVersionValidator,
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { poeVersion = 'poe1' } = req.query;

      // Get leagues from DB (already synced)
      const dbLeagues = await Price.findAll({
        attributes: [[Price.sequelize.fn('DISTINCT', Price.sequelize.col('league')), 'league']],
        where: { poeVersion },
        raw: true
      });
      const dbLeagueNames = dbLeagues.map(l => l.league);

      // Get active leagues from poe.ninja
      let activeLeagues = null;
      try {
        activeLeagues = await poeNinjaService.getActiveLeagues(poeVersion);
      } catch { }

      res.json({
        success: true,
        data: {
          leagues: dbLeagueNames,
          activeLeagues: activeLeagues
        },
        error: null
      });
    } catch (error) {
      logger.error('league fetch error', { message: error.message });
      errorResponse(res, 500, 'Failed to get leagues', 'PRICE_LEAGUES_LOAD_FAILED');
    }
  }
);

/**
 * GET /api/prices/sync-status
 * View current sync state for operations surfaces
 */
router.get('/sync-status', authenticate, async (req, res) => {
  try {
    if (!canAccessSyncControls(req.user)) {
      return errorResponse(res, 403, 'Bu islem icin yetkiniz yok', 'FORBIDDEN');
    }

    res.json({
      success: true,
      data: getSyncStatusPayload(),
      error: null
    });
  } catch (error) {
    logger.error('price sync status error', { message: error.message });
    errorResponse(res, 500, 'Failed to get sync status', 'PRICE_SYNC_STATUS_FAILED');
  }
});

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
      if (!canAccessSyncControls(req.user)) {
        return errorResponse(res, 403, 'Bu islem icin yetkiniz yok', 'FORBIDDEN');
      }

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
          error: 'Price sync is already running for this context',
          errorCode: 'PRICE_SYNC_IN_PROGRESS'
        });
      }

      if (currentState?.lastSuccessAt && (now - currentState.lastSuccessAt) < PRICE_SYNC_MIN_INTERVAL_MS) {
        return res.status(429).json({
          success: false,
          data: null,
          error: 'Prices were synced recently for this context',
          errorCode: 'PRICE_SYNC_COOLDOWN'
        });
      }

      logger.info('price sync started', { league: targetLeague, poeVersion });
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
      logger.error('price sync error', { message: error.message });
      errorResponse(res, 500, 'Failed to sync prices', 'PRICE_SYNC_FAILED');
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
      logger.error('currency overview error', { message: error.message });
      errorResponse(res, 500, 'Failed to get currency overview', 'PRICE_CURRENCY_OVERVIEW_FAILED');
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
      logger.error('item overview error', { message: error.message });
      errorResponse(res, 500, 'Failed to get item overview', 'PRICE_ITEM_OVERVIEW_FAILED');
    }
  }
);

module.exports = router;
