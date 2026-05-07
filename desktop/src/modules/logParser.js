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

const SAFE_AREA_NAMES = new Set([
  'hideout',
  'town',
  'tavern',
  "lioneye's watch",
  'forest encampment',
  'the sarn encampment',
  'highgate',
  "overseer's tower",
  "lilly's hideout",
  'kingsmarch',
  'canal hideout',
  'forest hideout',
  'lush hideout',
  'karui shores',
  'ziggurat refuge',
  'the ziggurat refuge',
  'clearfell encampment'
]);

const POE2_SIDE_AREA_NAMES = new Set([
  'abyssal depth',
  'abyssal depths',
  'the abyssal depths',
  'trial of the sekhemas',
  'the trial of the sekhemas',
  'trial of chaos',
  'the trial of chaos'
]);

function normalizeAreaKey(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function isPoe2NonMapAreaName(value) {
  return POE2_SIDE_AREA_NAMES.has(normalizeAreaKey(value));
}

function isSafeAreaName(value) {
  const normalized = normalizeAreaKey(value);
  return SAFE_AREA_NAMES.has(normalized) || normalized === 'hideout' || normalized.endsWith(' hideout');
}

class LogParser extends EventEmitter {
  constructor(logPath, options = {}) {
    super();
    
    this.logPath = logPath;
    this.poeVersion = options.poeVersion || null;
    this.instanceExitDelayMs = Number.isFinite(Number(options.instanceExitDelayMs))
      ? Math.max(0, Number(options.instanceExitDelayMs))
      : 1500;
    this.tail = null;
    this.isRunning = false;
    this.lastPosition = 0;
    this.watchInterval = null;
    this.pendingInstanceExitTimer = null;
    this.pendingInstanceExitData = null;
    
    // Map state
    this.currentMap = null;
    this.mapStartTime = null;
    this.currentMapIdentity = null;
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
    this.clearPendingInstanceExit();

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
    if (this.reconcilePendingInstanceExit(line)) {
      return;
    }

    // Detect map entry.
    // Example: 2023/12/25 15:30:45 ***** MAP LOADING : Maps/Dunes_01.tbw
    // Example: 2023/12/25 15:30:45 Generating level 16 area "MapDunes"
    
    const mapEnterPatterns = [
      // Generating level X area "Map..."
      {
        regex: /Generating level (\d+) area "([^"]+)"/i,
        handler: (match) => {
          const areaId = match[2].trim();
          if (!/^Map/i.test(areaId)) {
            return null;
          }

          const mapName = this.formatMapName(areaId);
          if (this.poeVersion === 'poe2' && isPoe2NonMapAreaName(mapName)) {
            return null;
          }

          return {
            type: 'map_entered',
            mapName,
            mapTier: parseInt(match[1]),
            mapIdentity: this.extractMapIdentity(line, areaId),
            timestamp: this.extractTimestamp(line),
            raw: line
          };
        }
      },
      // Entering area Map...
      {
        regex: /You have entered ([^\.]+)\./i,
        handler: (match) => {
          const areaName = match[1].trim();
          const normalizedAreaName = normalizeAreaKey(areaName);
          const isSafeArea = isSafeAreaName(normalizedAreaName);
          if (this.poeVersion === 'poe2') {
            if (isSafeArea || isPoe2NonMapAreaName(areaName)) {
              return null;
            }

            // PoE2 maps can contain side areas such as Abyssal Depths. While a map
            // is active, non-safe area transitions should not supersede the map.
            if (this.currentMap) {
              return null;
            }

            return {
              type: 'map_entered',
              mapName: areaName,
              mapTier: null,
              timestamp: this.extractTimestamp(line),
              raw: line
            };
          }

          // PoE2 endgame areas such as "Tower" do not consistently include "Map" in Client.txt.
          if (!isSafeArea && normalizedAreaName.includes('map')) {
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
        regex: /Generating level \d+ area "([^"]+)"/i,
        handler: (match) => {
          const areaName = this.formatAreaName(match[1]);
          if (!isSafeAreaName(areaName)) {
            return null;
          }

          return {
            type: 'map_exited',
            location: areaName,
            timestamp: this.extractTimestamp(line),
            duration: this.mapStartTime ? Date.now() - this.mapStartTime : null,
            raw: line
          };
        }
      },
      {
        regex: /You have entered ([^\.]+)\./i,
        handler: (match) => {
          const areaName = match[1].trim();
          if (!isSafeAreaName(areaName)) {
            return null;
          }

          return {
            type: 'map_exited',
            location: areaName,
            timestamp: this.extractTimestamp(line),
            duration: this.mapStartTime ? Date.now() - this.mapStartTime : null,
            raw: line
          };
        }
      },
      {
        regex: /Connecting to instance server/i,
        handler: (match) => {
          if (this.poeVersion === 'poe2') {
            return null;
          }

          // PoE1 Mirage/league mechanics can move the player into a side
          // instance before they return to the same map. Wait briefly for the
          // next area line before treating the connection as a real map exit.
          if (this.currentMap) {
            this.schedulePendingInstanceExit({
              type: 'map_exited',
              location: 'instance_change',
              timestamp: this.extractTimestamp(line),
              duration: this.mapStartTime ? Date.now() - this.mapStartTime : null,
              raw: line
            });
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

  clearPendingInstanceExit() {
    if (this.pendingInstanceExitTimer) {
      clearTimeout(this.pendingInstanceExitTimer);
      this.pendingInstanceExitTimer = null;
    }
    this.pendingInstanceExitData = null;
  }

  schedulePendingInstanceExit(data) {
    this.clearPendingInstanceExit();
    this.pendingInstanceExitData = data;

    if (this.instanceExitDelayMs <= 0) {
      const pendingExit = this.pendingInstanceExitData;
      this.pendingInstanceExitData = null;
      this.handleMapExit(pendingExit);
      return;
    }

    this.pendingInstanceExitTimer = setTimeout(() => {
      const pendingExit = this.pendingInstanceExitData;
      this.pendingInstanceExitTimer = null;
      this.pendingInstanceExitData = null;
      if (pendingExit) {
        this.handleMapExit(pendingExit);
      }
    }, this.instanceExitDelayMs);
  }

  reconcilePendingInstanceExit(line) {
    if (!this.pendingInstanceExitData) {
      return false;
    }

    const enteredMatch = line.match(/You have entered ([^\.]+)\./i);
    if (!enteredMatch) {
      const generatedMatch = line.match(/Generating level \d+ area "([^"]+)"/i);
      if (!generatedMatch) {
        return false;
      }

      const areaName = this.formatAreaName(generatedMatch[1]);
      if (isSafeAreaName(areaName)) {
        this.clearPendingInstanceExit();
        return false;
      }

      if (/^Map/i.test(generatedMatch[1])) {
        const nextIdentity = this.extractMapIdentity(line, generatedMatch[1]);
        if (this.isSameMapIdentity(nextIdentity)) {
          this.clearPendingInstanceExit();
          return true;
        }

        const pendingExit = this.pendingInstanceExitData;
        this.clearPendingInstanceExit();
        this.handleMapExit(pendingExit);
        return false;
      }

      this.clearPendingInstanceExit();
      return false;
    }

    const areaName = enteredMatch[1].trim();
    if (isSafeAreaName(areaName)) {
      this.clearPendingInstanceExit();
      return false;
    }

    this.clearPendingInstanceExit();
    return false;
  }

  extractMapIdentity(line, areaId) {
    const normalizedAreaId = String(areaId || '').trim().toLowerCase();
    const seedMatch = String(line || '').match(/\bwith seed\s+(\d+)/i);
    return {
      areaId: normalizedAreaId,
      seed: seedMatch ? seedMatch[1] : null
    };
  }

  isSameMapIdentity(nextIdentity) {
    if (!this.currentMapIdentity || !nextIdentity) {
      return false;
    }

    if (this.currentMapIdentity.areaId !== nextIdentity.areaId) {
      return false;
    }

    return !this.currentMapIdentity.seed
      || !nextIdentity.seed
      || this.currentMapIdentity.seed === nextIdentity.seed;
  }

  /**
   * Handle map entry
   */
  handleMapEnter(data) {
    if (data.mapIdentity && this.isSameMapIdentity(data.mapIdentity)) {
      this.clearPendingInstanceExit();
      return;
    }

    this.clearPendingInstanceExit();
    this.currentMap = data.mapName;
    this.mapStartTime = Date.now();
    this.currentMapIdentity = data.mapIdentity || null;

    this.emit('mapEntered', {
      mapName: data.mapName,
      mapTier: data.mapTier,
      timestamp: data.timestamp,
      source: data.source || null
    });
  }

  /**
   * Handle map exit
   */
  handleMapExit(data) {
    if (!this.currentMap) {
      return; // Do nothing when there is no active map.
    }

    this.clearPendingInstanceExit();

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
    this.currentMapIdentity = null;
  }

  /**
   * Format the map name
   */
  formatMapName(rawName) {
    const mapAreaName = this.poeVersion === 'poe1'
      ? String(rawName || '').replace(/^MapWorlds/i, 'Map')
      : rawName;
    const name = this.formatAreaName(mapAreaName);

    if (this.poeVersion === 'poe2') {
      return name;
    }
    
    if (!name.toLowerCase().endsWith('map')) {
      return `${name} Map`;
    }

    return name;
  }

  /**
   * Format internal area ids from Client.txt into player-facing names.
   */
  formatAreaName(rawName) {
    let name = String(rawName || '').trim().replace(/^Map/i, '');

    if (/^Hideout[A-Z]/.test(name)) {
      name = `${name.replace(/^Hideout/, '')} Hideout`;
    }

    return name
      .replace(/_/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
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

  isRecentTimestamp(timestamp, { now = new Date(), maxAgeMs = 30 * 60 * 1000 } = {}) {
    const timestampMs = timestamp instanceof Date ? timestamp.getTime() : Date.parse(timestamp);
    const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);

    if (!Number.isFinite(timestampMs) || !Number.isFinite(nowMs)) {
      return false;
    }

    return timestampMs <= nowMs && (nowMs - timestampMs) <= maxAgeMs;
  }

  bootstrapFromRecentLines(lines = [], options = {}) {
    if (!Array.isArray(lines) || lines.length === 0) {
      return false;
    }

    const probe = new LogParser(this.logPath, {
      poeVersion: this.poeVersion,
      instanceExitDelayMs: 0
    });
    let lastEntry = null;

    probe.on('mapEntered', (payload) => {
      lastEntry = payload;
    });

    for (const line of lines) {
      if (String(line || '').trim()) {
        probe.parseLine(String(line).trim());
      }
    }

    if (!probe.currentMap || !lastEntry) {
      return false;
    }

    if (!this.isRecentTimestamp(lastEntry.timestamp, options)) {
      return false;
    }

    this.handleMapEnter({
      ...lastEntry,
      mapName: probe.currentMap,
      mapIdentity: probe.currentMapIdentity,
      source: 'log_bootstrap'
    });

    return true;
  }

  bootstrapFromTail(options = {}) {
    if (!fs.existsSync(this.logPath)) {
      return false;
    }

    const maxBytes = Math.max(1, Number(options.maxBytes) || 256 * 1024);
    const stats = fs.statSync(this.logPath);
    const start = Math.max(0, stats.size - maxBytes);
    const buffer = Buffer.alloc(stats.size - start);
    const fd = fs.openSync(this.logPath, 'r');

    try {
      fs.readSync(fd, buffer, 0, buffer.length, start);
    } finally {
      fs.closeSync(fd);
    }

    return this.bootstrapFromRecentLines(
      buffer.toString().split(/\r?\n/).filter(Boolean),
      options
    );
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
