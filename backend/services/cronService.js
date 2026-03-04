/**
 * Cron Service
 * Periyodik gorevlerin yonetimi
 */

const cron = require('node-cron');
const poeNinjaService = require('./poeNinjaService');

let priceSyncJob = null;

/**
 * Fiyat senkronizasyon cron job'unu baslat
 */
const startPriceSync = (app, intervalHours = 1) => {
  // Varsa onceki job'u durdur
  if (priceSyncJob) {
    priceSyncJob.stop();
  }

  // Her saat basi calistir
  priceSyncJob = cron.schedule(`0 */${intervalHours} * * *`, async () => {
    console.log(`[${new Date().toISOString()}] Otomatik fiyat senkronizasyonu basliyor...`);
    
    try {
      const league = process.env.DEFAULT_LEAGUE || 'Ancestor';
      const results = await poeNinjaService.syncAllPrices(league);
      
      console.log(`[${new Date().toISOString()}] Fiyat senkronizasyonu tamamlandi:`, {
        totalSynced: results.types.reduce((sum, t) => sum + (t.synced || 0), 0),
        duration: new Date() - results.startedAt
      });

      // WebSocket uzerinden bildirim gonder
      if (app && app.broadcast) {
        app.broadcast({
          type: 'PRICES_AUTO_SYNCED',
          data: {
            syncedAt: new Date(),
            totalItems: results.types.reduce((sum, t) => sum + (t.synced || 0), 0)
          }
        });
      }
    } catch (error) {
      console.error('Otomatik fiyat senkronizasyon hatasi:', error);
    }
  });

  console.log(`Fiyat senkronizasyonu her ${intervalHours} saatte bir calisacak sekilde ayarlandi`);
  
  // Hemen bir senkronizasyon yap
  setTimeout(async () => {
    try {
      const league = process.env.DEFAULT_LEAGUE || 'Ancestor';
      console.log(`[${new Date().toISOString()}] Ilk fiyat senkronizasyonu basliyor...`);
      await poeNinjaService.syncAllPrices(league);
      console.log(`[${new Date().toISOString()}] Ilk fiyat senkronizasyonu tamamlandi`);
    } catch (error) {
      console.error('Ilk fiyat senkronizasyon hatasi:', error);
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
    console.log('Fiyat senkronizasyonu durduruldu');
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
