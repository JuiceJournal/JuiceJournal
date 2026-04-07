/**
 * Game Detector Module
 * Detects which Path of Exile client (PoE 1 or PoE 2) is currently running.
 * Polls the process list and emits events on game launch/exit/switch.
 *
 * Process names:
 *   PoE 1: PathOfExile.exe, PathOfExile_x64.exe, PathOfExileSteam.exe
 *   PoE 2: PathOfExile2.exe, PathOfExile2_x64.exe
 */

const { execFile } = require('child_process');
const { EventEmitter } = require('events');

// Known process names per version
const POE1_PROCESSES = [
  'pathofexile.exe',
  'pathofexile_x64.exe',
  'pathofexilesteam.exe',
  'pathofexile_x64steam.exe'
];

const POE2_PROCESSES = [
  'pathofexile2.exe',
  'pathofexile2_x64.exe',
  'pathofexile2steam.exe',
  'pathofexile2_x64steam.exe'
];

// Default Client.txt paths per version
const DEFAULT_LOG_PATHS = {
  poe1: [
    'C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt',
    'C:\\Program Files\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt',
    'E:\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt',
    'D:\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt'
  ],
  poe2: [
    'C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile 2\\logs\\Client.txt',
    'C:\\Program Files\\Grinding Gear Games\\Path of Exile 2\\logs\\Client.txt',
    'E:\\Grinding Gear Games\\Path of Exile 2\\logs\\Client.txt',
    'D:\\Grinding Gear Games\\Path of Exile 2\\logs\\Client.txt',
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt'
  ]
};

// Primary default PoE1 log path — single source of truth for main.js
const DEFAULT_POE_LOG_PATH = 'E:\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt';

const POLL_INTERVAL_MS = 5000; // check every 5 seconds

class GameDetector extends EventEmitter {
  constructor() {
    super();
    this.pollInterval = null;
    this.currentGame = null;   // null | 'poe1' | 'poe2'
    this.isRunning = false;
    this.lastDetectedPid = null;
  }

  /**
   * Start polling for game processes
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._polling = false;

    // Initial check
    this._poll();

    this.pollInterval = setInterval(() => {
      this._poll();
    }, POLL_INTERVAL_MS);
  }

  /**
   * Stop polling
   */
  stop() {
    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Get current detected game version
   */
  getDetectedGame() {
    return this.currentGame;
  }

  /**
   * Check running processes
   */
  async _poll() {
    if (this._polling) return; // Prevent overlapping polls
    this._polling = true;
    try {
      const processes = await this._getRunningProcesses();
      const lowerProcs = processes.map(p => p.toLowerCase());

      const poe1Running = POE1_PROCESSES.some(name => lowerProcs.includes(name));
      const poe2Running = POE2_PROCESSES.some(name => lowerProcs.includes(name));

      let detected = null;
      if (poe2Running) {
        detected = 'poe2';
      } else if (poe1Running) {
        detected = 'poe1';
      }

      // Detect state changes
      if (detected !== this.currentGame) {
        const previous = this.currentGame;
        this.currentGame = detected;

        if (detected && !previous) {
          // Game launched
          this.emit('gameLaunched', { version: detected });
        } else if (!detected && previous) {
          // Game closed
          this.emit('gameClosed', { version: previous });
        } else if (detected && previous && detected !== previous) {
          // Switched games (e.g. closed PoE1, opened PoE2)
          this.emit('gameSwitched', { from: previous, to: detected });
        }

        // Always emit the change
        this.emit('gameChanged', {
          version: detected,
          previous,
          running: !!detected
        });
      }
    } catch (error) {
      // Silently handle poll errors (permissions, etc.)
      console.error('Game detection poll error:', error.message);
    } finally {
      this._polling = false;
    }
  }

  /**
   * Get list of running process names (Windows-specific)
   */
  _getRunningProcesses() {
    return new Promise((resolve, reject) => {
      // Use tasklist for Windows — fast and reliable
      execFile('tasklist', ['/FO', 'CSV', '/NH'], { maxBuffer: 1024 * 1024 }, (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        const names = [];
        const lines = stdout.split('\n');
        for (const line of lines) {
          // CSV format: "Image Name","PID","Session Name","Session#","Mem Usage"
          const match = line.match(/^"([^"]+)"/);
          if (match) {
            names.push(match[1]);
          }
        }
        resolve(names);
      });
    });
  }

  /**
   * Try to find Client.txt path for a given game version
   * Checks common install locations
   */
  static findLogPath(version) {
    const fs = require('fs');
    const paths = DEFAULT_LOG_PATHS[version] || [];
    for (const p of paths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }
    return null;
  }

  /**
   * Get default log paths for reference
   */
  static getDefaultLogPaths() {
    return DEFAULT_LOG_PATHS;
  }
}

module.exports = GameDetector;
module.exports.DEFAULT_POE_LOG_PATH = DEFAULT_POE_LOG_PATH;
