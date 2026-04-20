/**
 * Cron Service
 * Periodic job management
 */

const cron = require('node-cron');
const poeNinjaService = require('./poeNinjaService');
const env = require('../config/env');
const logger = require('./logger');

let priceSyncJob = null;

/**
 * Start the price sync cron job
 */
const startPriceSync = (app, intervalHours = env.priceSync.intervalHours) => {
  // Stop the previous job if one already exists.
  if (priceSyncJob) {
    priceSyncJob.stop();
  }

  // Run on the hour.
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

          // Send a WebSocket notification.
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

  // Run an initial sync immediately.
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
  }, 5000); // Wait 5 seconds so the database is ready.

  return priceSyncJob;
};

/**
 * Stop the price sync cron job
 */
const stopPriceSync = () => {
  if (priceSyncJob) {
    priceSyncJob.stop();
    priceSyncJob = null;
    logger.info('price sync stopped');
  }
};

/**
 * Check the cron job status
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
