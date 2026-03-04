/**
 * Stats Routes
 * Istatistik ve leaderboard endpoint'leri
 */

const express = require('express');
const router = express.Router();
const { query, param, validationResult } = require('express-validator');
const { Session, LootEntry, User, sequelize } = require('../models');
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
 * Yardimci fonksiyon - Tarih araligi olustur
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
 * Kisisel istatistikler
 */
router.get('/personal',
  authenticate,
  [
    query('period').optional().isIn(['daily', 'weekly', 'monthly']),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { period = 'weekly' } = req.query;
      const { start, end } = getDateRange(period);

      // Temel istatistikler
      const sessions = await Session.findAll({
        where: {
          userId: req.userId,
          status: 'completed',
          startedAt: {
            [Op.between]: [start, end]
          }
        }
      });

      const stats = {
        totalSessions: sessions.length,
        totalCost: 0,
        totalLoot: 0,
        totalProfit: 0,
        totalDuration: 0,
        avgProfitPerMap: 0,
        avgProfitPerHour: 0,
        bestMap: null,
        worstMap: null
      };

      if (sessions.length > 0) {
        // Hesaplamalar
        sessions.forEach(session => {
          stats.totalCost += parseFloat(session.costChaos) || 0;
          stats.totalLoot += parseFloat(session.totalLootChaos) || 0;
          stats.totalProfit += parseFloat(session.profitChaos) || 0;
          stats.totalDuration += session.durationSec || 0;
        });

        stats.avgProfitPerMap = stats.totalProfit / sessions.length;
        
        const hours = stats.totalDuration / 3600;
        if (hours > 0) {
          stats.avgProfitPerHour = stats.totalProfit / hours;
        }

        // En iyi ve en kotu map
        const sortedByProfit = [...sessions].sort((a, b) => 
          parseFloat(b.profitChaos) - parseFloat(a.profitChaos)
        );
        
        stats.bestMap = sortedByProfit[0];
        stats.worstMap = sortedByProfit[sortedByProfit.length - 1];
      }

      // Gunluk kazanc grafigi icin veri
      const dailyStats = await Session.findAll({
        where: {
          userId: req.userId,
          status: 'completed',
          startedAt: {
            [Op.between]: [start, end]
          }
        },
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

      // Map bazli istatistikler
      const mapStats = await Session.findAll({
        where: {
          userId: req.userId,
          status: 'completed',
          startedAt: {
            [Op.between]: [start, end]
          }
        },
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
          dateRange: { start, end },
          summary: stats,
          dailyStats,
          mapStats
        },
        error: null
      });
    } catch (error) {
      console.error('Istatistik hatasi:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Istatistikler alinirken hata olustu'
      });
    }
  }
);

/**
 * GET /api/stats/leaderboard/:league/:period
 * Liderlik tablosu
 */
router.get('/leaderboard/:league/:period',
  [
    param('league').trim().notEmpty(),
    param('period').isIn(['daily', 'weekly', 'monthly']),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    handleValidationErrors
  ],
  async (req, res) => {
    try {
      const { league, period } = req.params;
      const { limit = 50 } = req.query;
      const { start, end } = getDateRange(period);

      // Kullanici bazli toplam kazanc (sadece tamamlanmis session'lar)
      const leaderboard = await Session.findAll({
        where: {
          status: 'completed',
          startedAt: {
            [Op.between]: [start, end]
          }
        },
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

      // Siralama ekle
      const rankedLeaderboard = leaderboard.map((entry, index) => ({
        rank: index + 1,
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
          period,
          dateRange: { start, end },
          leaderboard: rankedLeaderboard
        },
        error: null
      });
    } catch (error) {
      console.error('Leaderboard hatasi:', error);
      res.status(500).json({
        success: false,
        data: null,
        error: 'Leaderboard alinirken hata olustu'
      });
    }
  }
);

/**
 * GET /api/stats/summary
 * Genel ozet istatistikler
 */
router.get('/summary', async (req, res) => {
  try {
    // Toplam kullanici sayisi
    const totalUsers = await User.count();

    // Toplam session sayisi
    const totalSessions = await Session.count({
      where: { status: 'completed' }
    });

    // Toplam kazanc
    const profitResult = await Session.sum('profitChaos', {
      where: { status: 'completed' }
    });

    // Bugunun kazanci
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayProfit = await Session.sum('profitChaos', {
      where: {
        status: 'completed',
        startedAt: {
          [Op.gte]: today
        }
      }
    });

    // En populer map'ler
    const popularMaps = await Session.findAll({
      where: { status: 'completed' },
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
        popularMaps
      },
      error: null
    });
  } catch (error) {
    console.error('Ozet istatistik hatasi:', error);
    res.status(500).json({
      success: false,
      data: null,
      error: 'Ozet istatistikler alinirken hata olustu'
    });
  }
});

module.exports = router;
