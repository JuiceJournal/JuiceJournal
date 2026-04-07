const express = require('express');
const { param, query, validationResult } = require('express-validator');
const {
  loadPublicStrategies,
  loadPublicStrategyBySlug,
  serializeStrategy,
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

function sortStrategies(items, sort) {
  const strategies = [...items];
  const sortKey = sort || 'newest';

  switch (sortKey) {
    case 'most_profitable':
      strategies.sort((left, right) => right.metrics.avgProfitChaos - left.metrics.avgProfitChaos);
      break;
    case 'best_profit_per_hour':
      strategies.sort((left, right) => right.metrics.avgProfitPerHour - left.metrics.avgProfitPerHour);
      break;
    case 'most_runs':
      strategies.sort((left, right) => right.metrics.runCount - left.metrics.runCount);
      break;
    default:
      strategies.sort((left, right) => new Date(right.publishedAt || right.createdAt) - new Date(left.publishedAt || left.createdAt));
      break;
  }

  return strategies;
}

router.get('/',
  [
    query('poeVersion').optional().isIn(['poe1', 'poe2']),
    query('league').optional().trim().isLength({ min: 1, max: 50 }),
    query('mapName').optional().trim().isLength({ min: 1, max: 100 }),
    query('tag').optional().trim().isLength({ min: 1, max: 200 }),
    query('author').optional().trim().isLength({ min: 1, max: 50 }),
    query('search').optional().trim().isLength({ min: 1, max: 150 }),
    query('sort').optional().isIn(['newest', 'most_profitable', 'best_profit_per_hour', 'most_runs']),
    query('year').optional().isInt({ min: 2000, max: 2100 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const strategies = await loadPublicStrategies(req.query);
      const year = req.query.year ? parseInt(req.query.year, 10) : null;
      const search = req.query.search ? req.query.search.trim().toLowerCase() : null;
      const author = req.query.author ? req.query.author.trim().toLowerCase() : null;
      const tagFilters = req.query.tag
        ? req.query.tag.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean)
        : [];

      const filtered = strategies
        .map((strategy) => serializeStrategy(strategy, { year }))
        .filter((strategy) => strategy.metrics.runCount > 0)
        .filter((strategy) => {
          if (tagFilters.length > 0) {
            const strategyTags = strategy.tags.map((tag) => tag.toLowerCase());
            if (!tagFilters.some((tag) => strategyTags.includes(tag))) {
              return false;
            }
          }

          if (author && !strategy.author?.username?.toLowerCase().includes(author)) {
            return false;
          }

          if (!search) {
            return true;
          }

          const haystack = [
            strategy.name,
            strategy.description,
            strategy.mapName,
            strategy.author?.username,
            ...strategy.tags
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return haystack.includes(search);
        });

      res.json({
        success: true,
        data: {
          strategies: sortStrategies(filtered, req.query.sort),
        },
        error: null
      });
    } catch (error) {
      errorResponse(res, 500, 'Failed to load public strategies', 'PUBLIC_STRATEGY_LIST_FAILED');
    }
  }
);

router.get('/:slug',
  [
    param('slug').trim().notEmpty(),
    query('year').optional().isInt({ min: 2000, max: 2100 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const strategy = await loadPublicStrategyBySlug(req.params.slug);
      if (!strategy) {
        return errorResponse(res, 404, 'Strategy not found', 'PUBLIC_STRATEGY_NOT_FOUND');
      }

      res.json({
        success: true,
        data: {
          strategy: serializeStrategy(strategy, {
            year: req.query.year ? parseInt(req.query.year, 10) : null,
            includeDetails: true
          })
        },
        error: null
      });
    } catch (error) {
      errorResponse(res, 500, 'Failed to load strategy details', 'PUBLIC_STRATEGY_LOAD_FAILED');
    }
  }
);

module.exports = router;
