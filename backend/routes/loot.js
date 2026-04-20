/**
 * Loot Routes
 * Manages loot entry operations
 */

const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const { Session, LootEntry, Price } = require('../models');
const { authenticate } = require('../middleware/auth');
const logger = require('../services/logger');

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
 * Add a new loot entry
 */
router.post('/',
  authenticate,
  [
    body('sessionId').isUUID().withMessage('Enter a valid session ID'),
    body('itemName').trim().notEmpty().withMessage('Item name is required'),
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

      // Check the session.
      const session = await Session.findOne({
        where: {
          id: sessionId,
          userId: req.userId
        }
      });

      if (!session) {
        return errorResponse(res, 404, 'Session not found', 'SESSION_NOT_FOUND');
      }

      // Look up the price if no chaos value was provided.
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

      // Create the loot entry.
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

      // Refresh the session profit.
      await session.calculateProfit();

      // Broadcast via WebSocket.
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
      logger.error('loot add failed', { message: error.message });
      errorResponse(res, 500, 'Unable to add loot right now', 'LOOT_ADD_FAILED');
    }
  }
);

/**
 * GET /api/loot/session/:sessionId
 * List every loot entry for a session
 */
router.get('/session/:sessionId',
  authenticate,
  [
    param('sessionId').isUUID().withMessage('Enter a valid session ID'),
    query('limit').optional().isInt({ min: 1, max: 500 }),
    query('offset').optional().isInt({ min: 0 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { limit = 100, offset = 0 } = req.query;

      // Check the session.
      const session = await Session.findOne({
        where: {
          id: sessionId,
          userId: req.userId
        }
      });

      if (!session) {
        return errorResponse(res, 404, 'Session not found', 'SESSION_NOT_FOUND');
      }

      const { count, rows: lootEntries } = await LootEntry.findAndCountAll({
        where: { sessionId },
        order: [['createdAt', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      // Calculate total values.
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
      logger.error('loot list failed', { message: error.message });
      errorResponse(res, 500, 'Unable to load loot entries right now', 'LOOT_LIST_LOAD_FAILED');
    }
  }
);

/**
 * GET /api/loot/recent
 * List the user's recent loot entries
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
      logger.error('recent loot list failed', { message: error.message });
      errorResponse(res, 500, 'Unable to load recent loot right now', 'RECENT_LOOT_LOAD_FAILED');
    }
  }
);

/**
 * GET /api/loot/:id
 * Get loot entry details
 */
router.get('/:id',
  authenticate,
  [
    param('id').isUUID().withMessage('Enter a valid loot ID'),
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
        return errorResponse(res, 404, 'Loot entry not found', 'LOOT_NOT_FOUND');
      }

      res.json({
        success: true,
        data: { lootEntry },
        error: null
      });
    } catch (error) {
      logger.error('loot load failed', { message: error.message });
      errorResponse(res, 500, 'Unable to load the loot entry right now', 'LOOT_LOAD_FAILED');
    }
  }
);

/**
 * PUT /api/loot/:id
 * Update a loot entry
 */
router.put('/:id',
  authenticate,
  [
    param('id').isUUID().withMessage('Enter a valid loot ID'),
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
        return errorResponse(res, 404, 'Loot entry not found', 'LOOT_NOT_FOUND');
      }

      await lootEntry.update({
        quantity: quantity !== undefined ? parseInt(quantity) : lootEntry.quantity,
        chaosValue: chaosValue !== undefined ? parseFloat(chaosValue) : lootEntry.chaosValue,
        divineValue: divineValue !== undefined ? parseFloat(divineValue) : lootEntry.divineValue
      });

      // Refresh the session profit.
      await lootEntry.session.calculateProfit();

      res.json({
        success: true,
        data: { lootEntry },
        error: null
      });
    } catch (error) {
      logger.error('loot update failed', { message: error.message });
      errorResponse(res, 500, 'Unable to update the loot entry right now', 'LOOT_UPDATE_FAILED');
    }
  }
);

/**
 * DELETE /api/loot/:id
 * Delete a loot entry
 */
router.delete('/:id',
  authenticate,
  [
    param('id').isUUID().withMessage('Enter a valid loot ID'),
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
        return errorResponse(res, 404, 'Loot entry not found', 'LOOT_NOT_FOUND');
      }

      const session = lootEntry.session;
      await lootEntry.destroy();

      // Refresh the session profit.
      await session.calculateProfit();

      res.json({
        success: true,
        data: { message: 'Loot entry deleted successfully' },
        error: null
      });
    } catch (error) {
      logger.error('loot delete failed', { message: error.message });
      errorResponse(res, 500, 'Unable to delete the loot entry right now', 'LOOT_DELETE_FAILED');
    }
  }
);

/**
 * POST /api/loot/bulk
 * Add loot entries in bulk (for OCR or the desktop app)
 */
router.post('/bulk',
  authenticate,
  [
    body('sessionId').isUUID().withMessage('Enter a valid session ID'),
    body('items').isArray({ min: 1, max: 200 }).withMessage('At least 1 item and at most 200 items are required'),
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

      // Check the session.
      const session = await Session.findOne({
        where: {
          id: sessionId,
          userId: req.userId
        }
      });

      if (!session) {
        return errorResponse(res, 404, 'Session not found', 'SESSION_NOT_FOUND');
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

      // Bulk-create all loot entries.
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

      // Refresh the session profit.
      await session.calculateProfit();

      // Broadcast via WebSocket.
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
      logger.error('bulk loot add failed', { message: error.message });
      errorResponse(res, 500, 'Unable to add loot right now', 'LOOT_BULK_ADD_FAILED');
    }
  }
);

module.exports = router;
