const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { Strategy } = require('../models');
const {
  createUniqueSlug,
  loadStrategiesForUser,
  loadStrategyByIdForUser,
  normalizeTags,
  normalizeText,
  replaceStrategySessions,
  replaceStrategyTags,
  serializeStrategy,
  validateCompletedSessionsForStrategy,
} = require('../services/strategyService');

const router = express.Router();

function errorResponse(res, status, error, errorCode) {
  return res.status(status).json({
    success: false,
    data: null,
    error,
    errorCode
  });
}

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return errorResponse(res, 400, errors.array()[0].msg, 'VALIDATION_ERROR');
  }
  next();
};

router.get('/mine',
  authenticate,
  [
    query('visibility').optional().isIn(['private', 'public']),
    query('poeVersion').optional().isIn(['poe1', 'poe2']),
    query('league').optional().trim().isLength({ min: 1, max: 50 }),
    query('year').optional().isInt({ min: 2000, max: 2100 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const strategies = await loadStrategiesForUser(req.userId, req.query);
      const year = req.query.year ? parseInt(req.query.year, 10) : null;

      res.json({
        success: true,
        data: {
          strategies: strategies.map((strategy) => serializeStrategy(strategy, { year })),
        },
        error: null
      });
    } catch (error) {
      errorResponse(res, 500, 'Failed to load strategies', 'STRATEGY_LIST_LOAD_FAILED');
    }
  }
);

router.post('/',
  authenticate,
  [
    body('name').trim().notEmpty().isLength({ max: 150 }).withMessage('Strategy name is required'),
    body('description').optional({ nullable: true }).isString().isLength({ max: 4000 }),
    body('tags').isArray({ min: 1 }).withMessage('At least one strategy tag is required'),
    body('sessionIds').isArray({ min: 1 }).withMessage('At least one completed session is required'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { name, description, tags = [], sessionIds = [] } = req.body;
      const validated = await validateCompletedSessionsForStrategy(req.userId, sessionIds);

      const strategy = await Strategy.create({
        userId: req.userId,
        name: normalizeText(name, 150),
        slug: await createUniqueSlug(name),
        description: normalizeText(description, 4000),
        mapName: validated.context.mapName,
        league: validated.context.league,
        poeVersion: validated.context.poeVersion,
        visibility: 'private',
      });

      await replaceStrategySessions(strategy.id, validated.sessions.map((session) => session.id));
      await replaceStrategyTags(strategy.id, normalizeTags(tags));

      const freshStrategy = await loadStrategyByIdForUser(strategy.id, req.userId, true);
      res.status(201).json({
        success: true,
        data: {
          strategy: serializeStrategy(freshStrategy, { includeDetails: true })
        },
        error: null
      });
    } catch (error) {
      errorResponse(res, error.status || 500, error.message || 'Failed to create strategy', error.errorCode || 'STRATEGY_CREATE_FAILED');
    }
  }
);

router.get('/:id',
  authenticate,
  [
    param('id').isUUID().withMessage('Valid strategy id is required'),
    query('year').optional().isInt({ min: 2000, max: 2100 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const strategy = await loadStrategyByIdForUser(req.params.id, req.userId, true);
      if (!strategy) {
        return errorResponse(res, 404, 'Strategy not found', 'STRATEGY_NOT_FOUND');
      }

      res.json({
        success: true,
        data: {
          strategy: serializeStrategy(strategy, {
            includeDetails: true,
            year: req.query.year ? parseInt(req.query.year, 10) : null
          })
        },
        error: null
      });
    } catch (error) {
      errorResponse(res, 500, 'Failed to load strategy', 'STRATEGY_LOAD_FAILED');
    }
  }
);

router.put('/:id',
  authenticate,
  [
    param('id').isUUID().withMessage('Valid strategy id is required'),
    body('name').optional().trim().notEmpty().isLength({ max: 150 }),
    body('description').optional({ nullable: true }).isString().isLength({ max: 4000 }),
    body('tags').optional().isArray(),
    body('sessionIds').optional().isArray({ min: 1 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const strategy = await Strategy.findOne({
        where: {
          id: req.params.id,
          userId: req.userId
        }
      });

      if (!strategy) {
        return errorResponse(res, 404, 'Strategy not found', 'STRATEGY_NOT_FOUND');
      }

      if (Array.isArray(req.body.sessionIds)) {
        const validated = await validateCompletedSessionsForStrategy(req.userId, req.body.sessionIds, strategy.id);
        await replaceStrategySessions(strategy.id, validated.sessions.map((session) => session.id));
        await strategy.update({
          mapName: validated.context.mapName,
          league: validated.context.league,
          poeVersion: validated.context.poeVersion
        });
      }

      if (Array.isArray(req.body.tags)) {
        await replaceStrategyTags(strategy.id, req.body.tags);
      }

      const updates = {};
      if (Object.prototype.hasOwnProperty.call(req.body, 'name')) {
        updates.name = normalizeText(req.body.name, 150);
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'description')) {
        updates.description = normalizeText(req.body.description, 4000);
      }

      if (Object.keys(updates).length > 0) {
        await strategy.update(updates);
      }

      const freshStrategy = await loadStrategyByIdForUser(strategy.id, req.userId, true);
      res.json({
        success: true,
        data: {
          strategy: serializeStrategy(freshStrategy, { includeDetails: true })
        },
        error: null
      });
    } catch (error) {
      errorResponse(res, error.status || 500, error.message || 'Failed to update strategy', error.errorCode || 'STRATEGY_UPDATE_FAILED');
    }
  }
);

router.post('/:id/publish',
  authenticate,
  [
    param('id').isUUID().withMessage('Valid strategy id is required'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const strategy = await loadStrategyByIdForUser(req.params.id, req.userId, true);
      if (!strategy) {
        return errorResponse(res, 404, 'Strategy not found', 'STRATEGY_NOT_FOUND');
      }

      if (!strategy.tags || strategy.tags.length === 0) {
        return errorResponse(res, 400, 'Add at least one tag before publishing', 'STRATEGY_TAG_REQUIRED');
      }

      if (!strategy.sessions || strategy.sessions.length === 0) {
        return errorResponse(res, 400, 'Link at least one completed session before publishing', 'STRATEGY_SESSION_REQUIRED');
      }

      const firstSession = strategy.sessions[0];
      const hasContextMismatch = strategy.sessions.some((session) => (
        session.status !== 'completed' ||
        session.mapName !== firstSession.mapName ||
        session.league !== firstSession.league ||
        session.poeVersion !== firstSession.poeVersion
      ));

      if (hasContextMismatch) {
        return errorResponse(res, 400, 'Strategy sessions must share one map, league, and Path of Exile version', 'STRATEGY_CONTEXT_MISMATCH');
      }

      await strategy.update({
        visibility: 'public',
        publishedAt: strategy.publishedAt || new Date(),
        lastCalculatedAt: new Date()
      });

      const freshStrategy = await loadStrategyByIdForUser(strategy.id, req.userId, true);
      res.json({
        success: true,
        data: {
          strategy: serializeStrategy(freshStrategy, { includeDetails: true })
        },
        error: null
      });
    } catch (error) {
      errorResponse(res, 500, 'Failed to publish strategy', 'STRATEGY_PUBLISH_FAILED');
    }
  }
);

router.post('/:id/unpublish',
  authenticate,
  [
    param('id').isUUID().withMessage('Valid strategy id is required'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const strategy = await Strategy.findOne({
        where: {
          id: req.params.id,
          userId: req.userId
        }
      });

      if (!strategy) {
        return errorResponse(res, 404, 'Strategy not found', 'STRATEGY_NOT_FOUND');
      }

      await strategy.update({
        visibility: 'private',
        publishedAt: null
      });

      const freshStrategy = await loadStrategyByIdForUser(strategy.id, req.userId, true);
      res.json({
        success: true,
        data: {
          strategy: serializeStrategy(freshStrategy, { includeDetails: true })
        },
        error: null
      });
    } catch (error) {
      errorResponse(res, 500, 'Failed to unpublish strategy', 'STRATEGY_UNPUBLISH_FAILED');
    }
  }
);

module.exports = router;
