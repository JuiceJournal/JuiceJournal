/**
 * Stats Routes
 * Statistics and leaderboard endpoints
 */

const express = require('express');
const router = express.Router();
const { query, param, validationResult } = require('express-validator');
const { Session, User, sequelize } = require('../models');
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

const applySessionFilters = (where, { poeVersion, league }) => {
  if (poeVersion) {
    where.poeVersion = poeVersion;
  }
  if (league) {
    where.league = league;
  }
  return where;
};

/**
 * Helper - Create date range
 */
const getDateRange = (period) => {
  const end = new Date();
  const start = new Date();

  switch (period) {
    case 'daily':
      start.setHours(0, 0, 0, 0);
      break;
    case 'weekly':
      start.setDate(start.getDate() - 7);
      break;
    case 'monthly':
      start.setDate(start.getDate() - 30);
      break;
    default:
      start.setDate(start.getDate() - 7);
  }

  return { start, end };
};

/**
 * GET /api/stats/personal
 * Personal statistics
 */
router.get('/personal',
  authenticate,
  [
    query('period').optional().isIn(['daily', 'weekly', 'monthly']),
    query('poeVersion').optional().isIn(['poe1', 'poe2']),
    query('league').optional().trim().notEmpty().isLength({ max: 50 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { period = 'weekly', poeVersion, league } = req.query;
      const { start, end } = getDateRange(period);
      const baseWhere = applySessionFilters({
        userId: req.userId,
        status: 'completed',
        startedAt: {
          [Op.between]: [start, end]
        }
      }, { poeVersion, league });

      const stats = {
        totalSessions: 0,
        totalCost: 0,
        totalLoot: 0,
        totalProfit: 0,
        totalDuration: 0,
        avgProfitPerMap: 0,
        avgProfitPerHour: 0,
        bestMap: null,
        worstMap: null
      };

      const aggregate = await Session.findOne({
        where: baseWhere,
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalSessions'],
          [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('cost_chaos')), 0), 'totalCost'],
          [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total_loot_chaos')), 0), 'totalLoot'],
          [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('profit_chaos')), 0), 'totalProfit'],
          [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('duration_sec')), 0), 'totalDuration'],
          [sequelize.fn('COALESCE', sequelize.fn('AVG', sequelize.col('profit_chaos')), 0), 'avgProfitPerMap']
        ],
        raw: true
      });

      stats.totalSessions = parseInt(aggregate?.totalSessions || 0, 10);
      stats.totalCost = parseFloat(aggregate?.totalCost || 0);
      stats.totalLoot = parseFloat(aggregate?.totalLoot || 0);
      stats.totalProfit = parseFloat(aggregate?.totalProfit || 0);
      stats.totalDuration = parseInt(aggregate?.totalDuration || 0, 10);
      stats.avgProfitPerMap = parseFloat(aggregate?.avgProfitPerMap || 0);

      if (stats.totalSessions > 0) {
        const hours = stats.totalDuration / 3600;
        if (hours > 0) {
          stats.avgProfitPerHour = stats.totalProfit / hours;
        }

        stats.bestMap = await Session.findOne({
          where: baseWhere,
          order: [['profitChaos', 'DESC']]
        });

        stats.worstMap = await Session.findOne({
          where: baseWhere,
          order: [['profitChaos', 'ASC']]
        });
      }

      // Daily profit chart data
      const dailyStats = await Session.findAll({
        where: baseWhere,
        attributes: [
          [sequelize.fn('DATE', sequelize.col('started_at')), 'date'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'sessionCount'],
          [sequelize.fn('SUM', sequelize.col('profit_chaos')), 'totalProfit'],
          [sequelize.fn('SUM', sequelize.col('duration_sec')), 'totalDuration']
        ],
        group: [sequelize.fn('DATE', sequelize.col('started_at'))],
        order: [[sequelize.fn('DATE', sequelize.col('started_at')), 'ASC']],
        raw: true
      });

      // Per-map statistics
      const mapStats = await Session.findAll({
        where: baseWhere,
        attributes: [
          'mapName',
          [sequelize.fn('COUNT', sequelize.col('id')), 'runCount'],
          [sequelize.fn('AVG', sequelize.col('profit_chaos')), 'avgProfit'],
          [sequelize.fn('SUM', sequelize.col('profit_chaos')), 'totalProfit']
        ],
        group: ['mapName'],
        order: [[sequelize.fn('AVG', sequelize.col('profit_chaos')), 'DESC']],
        raw: true
      });

      res.json({
        success: true,
        data: {
          period,
          poeVersion: poeVersion || null,
          league: league || null,
          dateRange: { start, end },
          summary: stats,
          dailyStats,
          mapStats
        },
        error: null
      });
    } catch (error) {
      logger.error('statistics error', { message: error.message });
      errorResponse(res, 500, 'Failed to get statistics', 'STATS_PERSONAL_LOAD_FAILED');
    }
  }
);

/**
 * GET /api/stats/leaderboard/:league/:period
 * Leaderboard
 */
router.get('/leaderboard/:league/:period',
  [
    param('league').trim().notEmpty(),
    param('period').isIn(['daily', 'weekly', 'monthly']),
    query('poeVersion').optional().isIn(['poe1', 'poe2']),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { league, period } = req.params;
      const { limit = 50, poeVersion } = req.query;
      const { start, end } = getDateRange(period);
      const where = applySessionFilters({
        status: 'completed',
        league,
        startedAt: {
          [Op.between]: [start, end]
        }
      }, { poeVersion });

      // Per-user total profit (completed sessions only)
      const leaderboard = await Session.findAll({
        where,
        include: [{
          model: User,
          as: 'user',
          attributes: ['id', 'username']
        }],
        attributes: [
          'userId',
          [sequelize.fn('COUNT', sequelize.col('Session.id')), 'sessionCount'],
          [sequelize.fn('SUM', sequelize.col('profit_chaos')), 'totalProfit'],
          [sequelize.fn('AVG', sequelize.col('profit_chaos')), 'avgProfit'],
          [sequelize.fn('SUM', sequelize.col('duration_sec')), 'totalDuration']
        ],
        group: ['userId', 'user.id', 'user.username'],
        order: [[sequelize.fn('SUM', sequelize.col('profit_chaos')), 'DESC']],
        limit: parseInt(limit),
        raw: true,
        nest: true
      });

      // Add ranking
      const rankedLeaderboard = leaderboard.map((entry, index) => ({
        rank: index + 1,
        userId: entry.userId,
        username: entry.user.username,
        sessionCount: parseInt(entry.sessionCount),
        totalProfit: parseFloat(entry.totalProfit) || 0,
        avgProfit: parseFloat(entry.avgProfit) || 0,
        totalDuration: parseInt(entry.totalDuration) || 0,
        profitPerHour: entry.totalDuration > 0
          ? (parseFloat(entry.totalProfit) / (parseInt(entry.totalDuration) / 3600))
          : 0
      }));

      res.json({
        success: true,
        data: {
          league,
          poeVersion: poeVersion || null,
          period,
          dateRange: { start, end },
          leaderboard: rankedLeaderboard
        },
        error: null
      });
    } catch (error) {
      logger.error('leaderboard error', { message: error.message });
      errorResponse(res, 500, 'Failed to get leaderboard', 'STATS_LEADERBOARD_LOAD_FAILED');
    }
  }
);

/**
 * GET /api/stats/summary
 * General summary statistics
 */
router.get('/summary',
  [
    query('poeVersion').optional().isIn(['poe1', 'poe2']),
    query('league').optional().trim().notEmpty().isLength({ max: 50 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { poeVersion, league } = req.query;
      const completedWhere = applySessionFilters({ status: 'completed' }, { poeVersion, league });

      // Total user count in selected context
      const totalUsers = await Session.count({
        where: completedWhere,
        distinct: true,
        col: 'user_id'
      });

      // Total session count
      const totalSessions = await Session.count({
        where: completedWhere
      });

      // Total profit
      const profitResult = await Session.sum('profitChaos', {
        where: completedWhere
      });

      // Today's profit
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayProfit = await Session.sum('profitChaos', {
        where: {
          ...completedWhere,
          startedAt: {
            [Op.gte]: today
          }
        }
      });

      // Most popular maps
      const popularMaps = await Session.findAll({
        where: completedWhere,
        attributes: [
          'mapName',
          [sequelize.fn('COUNT', sequelize.col('id')), 'runCount']
        ],
        group: ['mapName'],
        order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
        limit: 5,
        raw: true
      });

      res.json({
        success: true,
        data: {
          totalUsers,
          totalSessions,
          totalProfit: profitResult || 0,
          todayProfit: todayProfit || 0,
          poeVersion: poeVersion || null,
          league: league || null,
          popularMaps
        },
        error: null
      });
    } catch (error) {
      logger.error('summary statistics error', { message: error.message });
      errorResponse(res, 500, 'Failed to get summary statistics', 'STATS_SUMMARY_LOAD_FAILED');
    }
  }
);

module.exports = router;
