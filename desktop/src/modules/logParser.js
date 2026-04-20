/**
 * Log Parser Module
 * Watches PoE Client.txt and detects map enter/exit events.
 *
 * Usage:
 * const parser = new LogParser('C:/PoE/logs/Client.txt');
 * parser.on('mapEntered', (data) => data);
 * parser.start();
 */

const fs = require('fs');
const fsp = require('fs/promises');
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
    
    // Map state
    this.currentMap = null;
    this.mapStartTime = null;
  }

  /**
   * Start watching the log file
   */
  start() {
    if (this.isRunning) {
      return;
    }

    if (!fs.existsSync(this.logPath)) {
      console.error('Log file not found:', this.logPath);
      this.emit('error', new Error('Log file not found'));
      return;
    }

    this.isRunning = true;
    this._reading = false;

    // Read the file size and start from the last position.
    const stats = fs.statSync(this.logPath);
    this.lastPosition = stats.size;

    // Watch the file.
    this.watchInterval = setInterval(() => {
      this.readNewLines();
    }, 500); // Poll every 500ms.

    this.emit('started');
  }

  /**
   * Stop watching the log file
   */
  stop() {
    this.isRunning = false;
    
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }

    this.emit('stopped');
  }

  /**
   * Read new lines
   */
  async readNewLines() {
    if (this._reading) return; // Prevent overlapping reads
    this._reading = true;
    let fh = null;
    try {
      const stats = await fsp.stat(this.logPath);

      // Restart from the beginning if the file shrank during log rotation.
      if (stats.size < this.lastPosition) {
        this.lastPosition = 0;
      }

      // Exit early when there is no new data.
      if (stats.size === this.lastPosition) {
        return;
      }

      // Read the new data through an async file handle.
      fh = await fsp.open(this.logPath, 'r');
      const buffer = Buffer.alloc(stats.size - this.lastPosition);
      await fh.read(buffer, 0, buffer.length, this.lastPosition);
      await fh.close();
      fh = null;

      this.lastPosition = stats.size;

      // Split the buffer into lines.
      const lines = buffer.toString().split('\n');

      for (const line of lines) {
        if (line.trim()) {
          this.parseLine(line.trim());
        }
      }
    } catch (error) {
      if (fh) { try { await fh.close(); } catch {} }
      console.error('Log read error:', error);
      this.emit('error', error);
    } finally {
      this._reading = false;
    }
  }

  /**
   * Parse a single line
   */
  parseLine(line) {
    // Detect map entry.
    // Example: 2023/12/25 15:30:45 ***** MAP LOADING : Maps/Dunes_01.tbw
    // Example: 2023/12/25 15:30:45 Generating level 16 area "MapDunes"
    
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
          // Only match map areas.
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

    // Detect map exit.
    // Example: 2023/12/25 15:45:12 ] You have entered Hideout.
    // Example: 2023/12/25 15:45:12 ] Connecting to instance server...
    
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
          // Leaving a map and connecting to a new instance.
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

    // Check for map entry.
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

    // Check for map exit.
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
   * Handle map entry
   */
  handleMapEnter(data) {
    this.currentMap = data.mapName;
    this.mapStartTime = Date.now();

    this.emit('mapEntered', {
      mapName: data.mapName,
      mapTier: data.mapTier,
      timestamp: data.timestamp
    });
  }

  /**
   * Handle map exit
   */
  handleMapExit(data) {
    if (!this.currentMap) {
      return; // Do nothing when there is no active map.
    }

    const exitData = {
      mapName: this.currentMap,
      location: data.location,
      timestamp: data.timestamp,
      duration: data.duration ? Math.floor(data.duration / 1000) : null // in seconds
    };

    this.emit('mapExited', exitData);

    // Reset the map state.
    this.currentMap = null;
    this.mapStartTime = null;
  }

  /**
   * Format the map name
   */
  formatMapName(rawName) {
    // "Dunes" -> "Dunes Map"
    // "MapDunes" -> "Dunes Map"
    let name = rawName.replace(/^Map/, '');
    name = name.replace(/([A-Z])/g, ' $1').trim(); // Split CamelCase.
    
    if (!name.toLowerCase().endsWith('map')) {
      name += ' Map';
    }

    return name;
  }

  /**
   * Extract a timestamp from the line
   */
  extractTimestamp(line) {
    // YYYY/MM/DD HH:MM:SS format
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
