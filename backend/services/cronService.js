/**
 * Cron Service
 * Periyodik gorevlerin yonetimi
 */

const cron = require('node-cron');
const poeNinjaService = require('./poeNinjaService');
const env = require('../config/env');
const logger = require('./logger');

let priceSyncJob = null;

/**
 * Fiyat senkronizasyon cron job'unu baslat
 */
const startPriceSync = (app, intervalHours = env.priceSync.intervalHours) => {
  // Varsa onceki job'u durdur
  if (priceSyncJob) {
    priceSyncJob.stop();
  }

  // Her saat basi calistir
  priceSyncJob = cron.schedule(`0 */${intervalHours} * * *`, async () => {
    logger.info('automatic price sync started');

    try {
      for (const poeVersion of ['poe1', 'poe2']) {
        try {
          const league = env.priceSync.defaultLeague;
          const results = await poeNinjaService.syncAllPrices(league, undefined, poeVersion);
          logger.info(`automatic price sync completed for ${poeVersion}`, {
            poeVersion,
            totalSynced: results.types.reduce((sum, t) => sum + (t.synced || 0), 0),
            duration: new Date() - results.startedAt
          });

          // WebSocket uzerinden bildirim gonder
          if (app && app.broadcast) {
            try {
              app.broadcast({
                type: 'PRICES_AUTO_SYNCED',
                data: {
                  poeVersion,
                  syncedAt: new Date(),
                  totalItems: results.types.reduce((sum, t) => sum + (t.synced || 0), 0)
                }
              });
            } catch (broadcastError) {
              logger.error('cron broadcast failed', { message: broadcastError.message });
            }
          }
        } catch (versionError) {
          logger.error(`automatic price sync failed for ${poeVersion}`, { message: versionError.message });
        }
      }
    } catch (error) {
      logger.error('automatic price sync failed', { message: error.message });
    }
  });

  logger.info('price sync schedule configured', { intervalHours });

  // Hemen bir senkronizasyon yap
  setTimeout(async () => {
    try {
      for (const poeVersion of ['poe1', 'poe2']) {
        try {
          const league = env.priceSync.defaultLeague;
          logger.info(`initial price sync started for ${poeVersion}`);
          await poeNinjaService.syncAllPrices(league, undefined, poeVersion);
          logger.info(`initial price sync completed for ${poeVersion}`);
        } catch (versionError) {
          logger.error(`initial price sync failed for ${poeVersion}`, { message: versionError.message });
        }
      }
    } catch (error) {
      logger.error('initial price sync failed', { message: error.message });
    }
  }, 5000); // 5 saniye bekle (veritabani hazir olsun)

  return priceSyncJob;
};

/**
 * Fiyat senkronizasyon cron job'unu durdur
 */
const stopPriceSync = () => {
  if (priceSyncJob) {
    priceSyncJob.stop();
    priceSyncJob = null;
    logger.info('price sync stopped');
  }
};

/**
 * Cron job durumunu kontrol et
 */
const getStatus = () => {
  return {
    priceSyncRunning: priceSyncJob !== null,
    priceSyncStatus: priceSyncJob ? 'running' : 'stopped'
  };
};

module.exports = {
  startPriceSync,
  stopPriceSync,
  getStatus
};
