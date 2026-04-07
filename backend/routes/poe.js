/**
 * Path of Exile Routes
 * Stash listing, snapshot capture, and snapshot diff endpoints.
 *
 * All routes require an authenticated user (JWT) AND a linked PoE account
 * (poeAccessToken on the user). Token refresh happens transparently inside
 * poeAuthService.getValidAccessToken().
 */

const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');

const { StashSnapshot, Session } = require('../models');
const { authenticate } = require('../middleware/auth');
const poeApiService = require('../services/poeApiService');
const stashSnapshotService = require('../services/stashSnapshotService');
const logger = require('../services/logger');

// ─── Helpers ────────────────────────────────────────────────────

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      data: null,
      error: errors.array()[0].msg,
      errorCode: 'VALIDATION_FAILED'
    });
  }
  next();
};

function errorResponse(res, status, error, errorCode) {
  return res.status(status).json({ success: false, data: null, error, errorCode });
}

/**
 * Translate poe-tagged errors into HTTP responses with stable error codes
 * the desktop / web clients can switch on.
 */
function handlePoeError(res, error, fallbackMessage = 'Path of Exile request failed') {
  if (error?.code === 'POE_REAUTH_REQUIRED') {
    return errorResponse(res, 401, error.message || 'Path of Exile session expired — please sign in again', 'POE_REAUTH_REQUIRED');
  }
  if (error?.code === 'POE_SCOPE_MISSING') {
    return errorResponse(res, 403, error.message || 'Missing required Path of Exile scope', 'POE_SCOPE_MISSING');
  }
  if (error?.code === 'POE_RATE_LIMITED') {
    if (error.retryAfter) res.setHeader('Retry-After', String(error.retryAfter));
    return errorResponse(res, 429, error.message || 'Rate limited by GGG API', 'POE_RATE_LIMITED');
  }
  if (error?.code === 'NO_TABS_SELECTED') {
    return errorResponse(res, 400, error.message, 'NO_TABS_SELECTED');
  }
  if (error?.code === 'LEAGUE_REQUIRED') {
    return errorResponse(res, 400, error.message, 'LEAGUE_REQUIRED');
  }
  logger.error('poe request failed', { message: error?.message });
  return errorResponse(res, 500, fallbackMessage, 'POE_REQUEST_FAILED');
}

function ensurePoeLinked(req, res) {
  if (!req.user?.poeAccessToken) {
    errorResponse(res, 400, 'Path of Exile account is not linked', 'POE_NOT_LINKED');
    return false;
  }
  return true;
}

// ─── Stash tab listing ──────────────────────────────────────────

/**
 * GET /api/poe/stash-tabs?league=Mirage
 * Returns the raw GGG tab list for the league.
 */
router.get('/stash-tabs',
  authenticate,
  [
    query('league').isString().trim().notEmpty().isLength({ max: 60 }),
    handleValidationErrors
  ],
  async (req, res) => {
    if (!ensurePoeLinked(req, res)) return;

    try {
      const data = await poeApiService.listStashTabs(req.user, req.query.league);
      res.json({
        success: true,
        data: {
          league: req.query.league,
          tabs: (data?.stashes || []).map((tab) => ({
            id: tab.id,
            name: tab.name,
            type: tab.type,
            index: tab.index,
            colour: tab.colour || null,
            children: Array.isArray(tab.children) ? tab.children.length : 0
          }))
        },
        error: null
      });
    } catch (error) {
      handlePoeError(res, error, 'Failed to list Path of Exile stash tabs');
    }
  }
);

// ─── Snapshot CRUD ──────────────────────────────────────────────

/**
 * POST /api/poe/snapshots
 * Take a fresh stash snapshot. Body:
 *   { league, poeVersion?, tabIds?, allTabs?, label?, kind?, sessionId? }
 */
router.post('/snapshots',
  authenticate,
  [
    body('league').isString().trim().notEmpty().isLength({ max: 60 }),
    body('poeVersion').optional().isIn(['poe1', 'poe2']),
    body('tabIds').optional().isArray({ max: 100 }),
    body('tabIds.*').optional().isString(),
    body('allTabs').optional().isBoolean(),
    body('label').optional().isString().isLength({ max: 120 }),
    body('kind').optional().isIn(['before', 'after', 'manual']),
    body('sessionId').optional().isUUID(),
    handleValidationErrors
  ],
  async (req, res) => {
    if (!ensurePoeLinked(req, res)) return;

    try {
      const { league, poeVersion, tabIds, allTabs, label, kind, sessionId } = req.body;

      // If sessionId is provided, verify it belongs to this user.
      if (sessionId) {
        const session = await Session.findOne({ where: { id: sessionId, userId: req.userId } });
        if (!session) {
          return errorResponse(res, 404, 'Session not found', 'SESSION_NOT_FOUND');
        }
      }

      const snapshot = await stashSnapshotService.takeSnapshot(req.user, {
        league,
        poeVersion: poeVersion || 'poe1',
        tabIds,
        allTabs: Boolean(allTabs),
        label,
        kind: kind || 'manual',
        sessionId: sessionId || null,
      });

      res.status(201).json({
        success: true,
        data: { snapshot },
        error: null
      });
    } catch (error) {
      handlePoeError(res, error, 'Failed to take stash snapshot');
    }
  }
);

/**
 * GET /api/poe/snapshots
 * List the user's snapshots (most recent first). Optional filters by league
 * or session, plus pagination.
 */
router.get('/snapshots',
  authenticate,
  [
    query('league').optional().isString().trim().isLength({ max: 60 }),
    query('sessionId').optional().isUUID(),
    query('kind').optional().isIn(['before', 'after', 'manual']),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { league, sessionId, kind } = req.query;
      const limit = parseInt(req.query.limit, 10) || 20;
      const offset = parseInt(req.query.offset, 10) || 0;

      const where = { userId: req.userId };
      if (league) where.league = league;
      if (sessionId) where.sessionId = sessionId;
      if (kind) where.kind = kind;

      const { count, rows } = await StashSnapshot.findAndCountAll({
        where,
        order: [['takenAt', 'DESC']],
        limit,
        offset,
        // Don't ship the (potentially large) item list in the index view.
        attributes: { exclude: ['items'] },
      });

      res.json({
        success: true,
        data: { snapshots: rows, total: count, limit, offset },
        error: null
      });
    } catch (error) {
      logger.error('stash snapshot list failed', { message: error.message });
      errorResponse(res, 500, 'Failed to list stash snapshots', 'SNAPSHOT_LIST_FAILED');
    }
  }
);

/**
 * GET /api/poe/snapshots/:id
 * Full snapshot detail (includes the items array).
 */
router.get('/snapshots/:id',
  authenticate,
  [param('id').isUUID(), handleValidationErrors],
  async (req, res) => {
    try {
      const snapshot = await StashSnapshot.findOne({
        where: { id: req.params.id, userId: req.userId }
      });
      if (!snapshot) {
        return errorResponse(res, 404, 'Snapshot not found', 'SNAPSHOT_NOT_FOUND');
      }
      res.json({ success: true, data: { snapshot }, error: null });
    } catch (error) {
      logger.error('stash snapshot load failed', { message: error.message });
      errorResponse(res, 500, 'Failed to load stash snapshot', 'SNAPSHOT_LOAD_FAILED');
    }
  }
);

/**
 * DELETE /api/poe/snapshots/:id
 */
router.delete('/snapshots/:id',
  authenticate,
  [param('id').isUUID(), handleValidationErrors],
  async (req, res) => {
    try {
      const snapshot = await StashSnapshot.findOne({
        where: { id: req.params.id, userId: req.userId }
      });
      if (!snapshot) {
        return errorResponse(res, 404, 'Snapshot not found', 'SNAPSHOT_NOT_FOUND');
      }
      await snapshot.destroy();
      res.json({ success: true, data: { id: req.params.id }, error: null });
    } catch (error) {
      logger.error('stash snapshot delete failed', { message: error.message });
      errorResponse(res, 500, 'Failed to delete stash snapshot', 'SNAPSHOT_DELETE_FAILED');
    }
  }
);

/**
 * POST /api/poe/snapshots/diff
 * Body: { beforeSnapshotId, afterSnapshotId }
 * Returns the per-item delta + chaos value delta = profit.
 */
router.post('/snapshots/diff',
  authenticate,
  [
    body('beforeSnapshotId').isUUID(),
    body('afterSnapshotId').isUUID(),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { beforeSnapshotId, afterSnapshotId } = req.body;

      if (beforeSnapshotId === afterSnapshotId) {
        return errorResponse(res, 400, 'Before and after snapshots must be different', 'SNAPSHOT_DIFF_SAME_ID');
      }

      const [before, after] = await Promise.all([
        StashSnapshot.findOne({ where: { id: beforeSnapshotId, userId: req.userId } }),
        StashSnapshot.findOne({ where: { id: afterSnapshotId, userId: req.userId } })
      ]);

      if (!before) return errorResponse(res, 404, 'Before snapshot not found', 'BEFORE_SNAPSHOT_NOT_FOUND');
      if (!after) return errorResponse(res, 404, 'After snapshot not found', 'AFTER_SNAPSHOT_NOT_FOUND');

      // The DB returns these as Sequelize instances; the service expects plain
      // objects with `items`/`totalChaosValue`. `.toJSON()` gives us that.
      const diff = stashSnapshotService.diffSnapshots(before.toJSON(), after.toJSON());

      res.json({ success: true, data: { diff }, error: null });
    } catch (error) {
      logger.error('stash snapshot diff failed', { message: error.message });
      errorResponse(res, 500, error.message || 'Failed to diff stash snapshots', 'SNAPSHOT_DIFF_FAILED');
    }
  }
);

module.exports = router;
