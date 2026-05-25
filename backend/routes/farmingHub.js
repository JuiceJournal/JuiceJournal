const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { PublishedFarmRun } = require('../models');
const {
  createPublishedFarmRun,
  loadPublicFarmRuns,
  loadPublishedFarmRunForOwner,
  loadVisiblePublishedFarmRun,
  serializePublishedFarmRun,
  toggleFarmRunReaction,
  updateFarmRunVisibility
} = require('../services/farmingHubService');

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

const farmRunPayloadValidators = [
  body('poeVersion').isIn(['poe1', 'poe2']).withMessage('Valid Path of Exile version is required'),
  body('visibility').optional().isIn(['private', 'unlisted', 'public']),
  body('league').optional({ nullable: true }).isString().isLength({ max: 60 }),
  body('farmType').optional({ nullable: true }).isString().isLength({ max: 80 }),
  body('runCount').isInt({ min: 1, max: 500 }).withMessage('Run count must be between 1 and 500'),
  body('startedAt').optional({ nullable: true }).isISO8601(),
  body('endedAt').optional({ nullable: true }).isISO8601(),
  body('durationSeconds').optional({ nullable: true }).isInt({ min: 0 }),
  body('setupDescription').optional({ nullable: true }).isString().isLength({ max: 1600 }),
  body('investmentKnown').optional().isBoolean(),
  body('calculationStatus').isIn(['calculated', 'zeroCalculated', 'partial', 'failed', 'notCalculated']),
  body('profitChaos').optional({ nullable: true }).isFloat(),
  body('priceContext').optional({ nullable: true }).isObject(),
  body('maps').isArray({ min: 1, max: 100 }).withMessage('At least one map summary is required'),
  body('breakdown').optional({ nullable: true }).isObject(),
  body('topLoot').optional({ nullable: true }).isArray({ max: 20 }),
  body('character').optional({ nullable: true }).isObject(),
  body('publisherDisplayName').optional({ nullable: true }).isString().isLength({ max: 120 }),
  handleValidationErrors
];

router.post('/runs',
  authenticate,
  farmRunPayloadValidators,
  async (req, res) => {
    try {
      const run = await createPublishedFarmRun(req.userId, req.body);
      res.status(201).json({
        success: true,
        data: {
          run: serializePublishedFarmRun(run, { includeDetails: true })
        },
        error: null
      });
    } catch (error) {
      errorResponse(res, 500, 'Failed to publish farm run', 'FARM_RUN_CREATE_FAILED');
    }
  }
);

router.get('/runs',
  optionalAuth,
  [
    query('poeVersion').optional().isIn(['poe1', 'poe2']),
    query('league').optional().trim().isLength({ min: 1, max: 60 }),
    query('farmType').optional().trim().isLength({ min: 1, max: 80 }),
    query('minProfitChaos').optional().isFloat(),
    query('maxProfitChaos').optional().isFloat(),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const runs = await loadPublicFarmRuns(req.query);
      res.json({
        success: true,
        data: {
          runs: runs.map((run) => serializePublishedFarmRun(run, { viewerUserId: req.userId || null }))
        },
        error: null
      });
    } catch (error) {
      errorResponse(res, 500, 'Failed to load farm runs', 'FARM_RUN_LIST_FAILED');
    }
  }
);

router.get('/runs/mine',
  authenticate,
  [
    query('visibility').optional().isIn(['private', 'unlisted', 'public']),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const where = { userId: req.userId };
      if (req.query.visibility) {
        where.visibility = req.query.visibility;
      }

      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
      const offset = parseInt(req.query.offset, 10) || 0;
      const runs = await PublishedFarmRun.findAll({
        where,
        order: [['createdAt', 'DESC']],
        limit,
        offset
      });

      res.json({
        success: true,
        data: {
          runs: runs.map((run) => serializePublishedFarmRun(run, { viewerUserId: req.userId }))
        },
        error: null
      });
    } catch (error) {
      errorResponse(res, 500, 'Failed to load your farm runs', 'FARM_RUN_OWNER_LIST_FAILED');
    }
  }
);

router.get('/runs/:id',
  optionalAuth,
  [
    param('id').isUUID().withMessage('Valid farm run id is required'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const run = await loadVisiblePublishedFarmRun(req.params.id, req.userId || null);
      if (!run) {
        return errorResponse(res, 404, 'Farm run not found', 'FARM_RUN_NOT_FOUND');
      }

      res.json({
        success: true,
        data: {
          run: serializePublishedFarmRun(run, { includeDetails: true, viewerUserId: req.userId || null })
        },
        error: null
      });
    } catch (error) {
      errorResponse(res, 500, 'Failed to load farm run', 'FARM_RUN_LOAD_FAILED');
    }
  }
);

router.post('/runs/:id/reactions',
  authenticate,
  [
    param('id').isUUID().withMessage('Valid farm run id is required'),
    body('reaction').isIn(['divine', 'holy', 'pog']).withMessage('Valid reaction is required'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const result = await toggleFarmRunReaction(req.params.id, req.userId, req.body.reaction);
      if (!result) {
        return errorResponse(res, 404, 'Farm run not found', 'FARM_RUN_NOT_FOUND');
      }

      res.json({
        success: true,
        data: {
          selected: result.selected,
          reaction: result.reaction,
          run: serializePublishedFarmRun(result.run, { includeDetails: true, viewerUserId: req.userId })
        },
        error: null
      });
    } catch (error) {
      if (error.code === 'INVALID_REACTION') {
        return errorResponse(res, 400, 'Valid reaction is required', 'VALIDATION_ERROR');
      }
      errorResponse(res, 500, 'Failed to update farm run reaction', 'FARM_RUN_REACTION_FAILED');
    }
  }
);

router.patch('/runs/:id/visibility',
  authenticate,
  [
    param('id').isUUID().withMessage('Valid farm run id is required'),
    body('visibility').isIn(['private', 'unlisted', 'public']).withMessage('Valid visibility is required'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const run = await updateFarmRunVisibility(req.params.id, req.userId, req.body.visibility);
      if (!run) {
        return errorResponse(res, 404, 'Farm run not found', 'FARM_RUN_NOT_FOUND');
      }

      res.json({
        success: true,
        data: {
          run: serializePublishedFarmRun(run, { includeDetails: true })
        },
        error: null
      });
    } catch (error) {
      errorResponse(res, 500, 'Failed to update farm run visibility', 'FARM_RUN_VISIBILITY_FAILED');
    }
  }
);

router.delete('/runs/:id',
  authenticate,
  [
    param('id').isUUID().withMessage('Valid farm run id is required'),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const run = await loadPublishedFarmRunForOwner(req.params.id, req.userId);
      if (!run) {
        return errorResponse(res, 404, 'Farm run not found', 'FARM_RUN_NOT_FOUND');
      }

      await run.destroy();
      res.json({
        success: true,
        data: {
          deleted: true
        },
        error: null
      });
    } catch (error) {
      errorResponse(res, 500, 'Failed to delete farm run', 'FARM_RUN_DELETE_FAILED');
    }
  }
);

module.exports = router;
