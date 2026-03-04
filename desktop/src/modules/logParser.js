/**
 * Log Parser Module
 * PoE Client.txt dosyasini izleyerek map giris/cikisini tespit eder
 * 
 * Kullanim:
 * const parser = new LogParser('C:/PoE/logs/Client.txt');
 * parser.on('mapEntered', (data) => console.log(data));
 * parser.start();
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

class LogParser extends EventEmitter {
  constructor(logPath) {
    super();
    
    this.logPath = logPath;
    this.tail = null;
    this.isRunning = false;
    this.lastPosition = 0;
    this.watchInterval = null;
    
    // Map durumu
    this.currentMap = null;
    this.mapStartTime = null;
  }

  /**
   * Log dosyasini izlemeye basla
   */
  start() {
    if (this.isRunning) {
      console.log('Log parser zaten calisiyor');
      return;
    }

    if (!fs.existsSync(this.logPath)) {
      console.error('Log dosyasi bulunamadi:', this.logPath);
      this.emit('error', new Error('Log dosyasi bulunamadi'));
      return;
    }

    this.isRunning = true;
    
    // Dosya boyutunu al ve son pozisyondan basla
    const stats = fs.statSync(this.logPath);
    this.lastPosition = stats.size;

    console.log('Log parser baslatildi:', this.logPath);
    console.log('Baslangic pozisyonu:', this.lastPosition);

    // Dosyayi izle
    this.watchInterval = setInterval(() => {
      this.readNewLines();
    }, 500); // Her 500ms kontrol et

    this.emit('started');
  }

  /**
   * Log dosyasini izlemeyi durdur
   */
  stop() {
    this.isRunning = false;
    
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }

    console.log('Log parser durduruldu');
    this.emit('stopped');
  }

  /**
   * Yeni satirlari oku
   */
  readNewLines() {
    try {
      const stats = fs.statSync(this.logPath);
      
      // Dosya kuculmusse (log rotation) bastan basla
      if (stats.size < this.lastPosition) {
        this.lastPosition = 0;
      }

      // Yeni veri yoksa cik
      if (stats.size === this.lastPosition) {
        return;
      }

      // Yeni veriyi oku
      const fd = fs.openSync(this.logPath, 'r');
      const buffer = Buffer.alloc(stats.size - this.lastPosition);
      
      fs.readSync(fd, buffer, 0, buffer.length, this.lastPosition);
      fs.closeSync(fd);

      this.lastPosition = stats.size;

      // Buffer'i satirlara ayir
      const lines = buffer.toString().split('\n');
      
      for (const line of lines) {
        if (line.trim()) {
          this.parseLine(line.trim());
        }
      }
    } catch (error) {
      console.error('Log okuma hatasi:', error);
      this.emit('error', error);
    }
  }

  /**
   * Tek bir satiri parse et
   */
  parseLine(line) {
    // Map giris tespiti
    // Ornek: 2023/12/25 15:30:45 ***** MAP LOADING : Maps/Dunes_01.tbw
    // Ornek: 2023/12/25 15:30:45 Generating level 16 area "MapDunes"
    
    const mapEnterPatterns = [
      // Generating level X area "Map..."
      {
        regex: /Generating level (\d+) area "Map([^"]+)"/i,
        handler: (match) => ({
          type: 'map_entered',
          mapName: this.formatMapName(match[2]),
          mapTier: parseInt(match[1]),
          timestamp: this.extractTimestamp(line),
          raw: line
        })
      },
      // Entering area Map...
      {
        regex: /You have entered ([^\.]+)\./i,
        handler: (match) => {
          const areaName = match[1].trim();
          // Sadece map alanlarini yakala
          if (areaName.toLowerCase().includes('map')) {
            return {
              type: 'map_entered',
              mapName: areaName,
              mapTier: null,
              timestamp: this.extractTimestamp(line),
              raw: line
            };
          }
          return null;
        }
      }
    ];

    // Map cikis tespiti
    // Ornek: 2023/12/25 15:45:12 ] You have entered Hideout.
    // Ornek: 2023/12/25 15:45:12 ] Connecting to instance server...
    
    const mapExitPatterns = [
      {
        regex: /You have entered (Hideout|Town|Tavern|Lioneye's Watch|Forest Encampment|The Sarn Encampment|Highgate|Overseer's Tower|Lilly's Hideout|Kingsmarch)\./i,
        handler: (match) => ({
          type: 'map_exited',
          location: match[1],
          timestamp: this.extractTimestamp(line),
          duration: this.mapStartTime ? Date.now() - this.mapStartTime : null,
          raw: line
        })
      },
      {
        regex: /Connecting to instance server/i,
        handler: (match) => {
          // Map'ten cikis, yeni bir instance'a baglanma
          if (this.currentMap) {
            return {
              type: 'map_exited',
              location: 'instance_change',
              timestamp: this.extractTimestamp(line),
              duration: this.mapStartTime ? Date.now() - this.mapStartTime : null,
              raw: line
            };
          }
          return null;
        }
      }
    ];

    // Map girisini kontrol et
    for (const pattern of mapEnterPatterns) {
      const match = line.match(pattern.regex);
      if (match) {
        const data = pattern.handler(match);
        if (data) {
          this.handleMapEnter(data);
          return;
        }
      }
    }

    // Map cikisini kontrol et
    for (const pattern of mapExitPatterns) {
      const match = line.match(pattern.regex);
      if (match) {
        const data = pattern.handler(match);
        if (data) {
          this.handleMapExit(data);
          return;
        }
      }
    }
  }

  /**
   * Map girisini isle
   */
  handleMapEnter(data) {
    console.log('Map girisi tespit edildi:', data.mapName);
    
    this.currentMap = data.mapName;
    this.mapStartTime = Date.now();

    this.emit('mapEntered', {
      mapName: data.mapName,
      mapTier: data.mapTier,
      timestamp: data.timestamp
    });
  }

  /**
   * Map cikisini isle
   */
  handleMapExit(data) {
    if (!this.currentMap) {
      return; // Aktif map yoksa islem yapma
    }

    console.log('Map cikisi tespit edildi:', data.location);

    const exitData = {
      mapName: this.currentMap,
      location: data.location,
      timestamp: data.timestamp,
      duration: data.duration ? Math.floor(data.duration / 1000) : null // saniye cinsinden
    };

    this.emit('mapExited', exitData);

    // Map durumunu sifirla
    this.currentMap = null;
    this.mapStartTime = null;
  }

  /**
   * Map adini formatla
   */
  formatMapName(rawName) {
    // "Dunes" -> "Dunes Map"
    // "MapDunes" -> "Dunes Map"
    let name = rawName.replace(/^Map/, '');
    name = name.replace(/([A-Z])/g, ' $1').trim(); // CamelCase'i ayir
    
    if (!name.toLowerCase().endsWith('map')) {
      name += ' Map';
    }

    return name;
  }

  /**
   * Satirdan timestamp cikar
   */
  extractTimestamp(line) {
    // YYYY/MM/DD HH:MM:SS formati
    const match = line.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/);
    if (match) {
      return new Date(match[1].replace(/\//g, '-'));
    }
    return new Date();
  }

  /**
   * Aktif map durumunu getir
   */
  getCurrentMap() {
    return {
      mapName: this.currentMap,
      startTime: this.mapStartTime,
      duration: this.mapStartTime ? Math.floor((Date.now() - this.mapStartTime) / 1000) : 0
    };
  }
}

module.exports = LogParser;
