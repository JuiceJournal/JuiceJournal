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
const WINDOWS_PROCESS_QUERY_NAMES = [
  ...new Set([
    ...POE1_PROCESSES,
    ...POE2_PROCESSES
  ])
];

function normalizeProcessValue(value) {
  return String(value || '').trim().toLowerCase();
}

function buildWindowsProcessCommand() {
  const filter = WINDOWS_PROCESS_QUERY_NAMES
    .map((name) => `Name = '${name.replace(/'/g, "''")}'`)
    .join(' OR ');

  return [
    '$ErrorActionPreference = "Stop";',
    `Get-CimInstance Win32_Process -Filter "${filter}" |`,
    'Select-Object Name,ExecutablePath,CommandLine |',
    'ConvertTo-Json -Compress'
  ].join(' ');
}

function normalizeProcessSnapshot(process = {}) {
  return {
    name: normalizeProcessValue(process.name || process.Name),
    executablePath: normalizeProcessValue(process.executablePath || process.ExecutablePath),
    commandLine: normalizeProcessValue(process.commandLine || process.CommandLine)
  };
}

function isPoe2InstallPath(process) {
  const joined = `${process.executablePath} ${process.commandLine}`;
  return joined.includes('path of exile 2');
}

function detectGameVersionFromProcesses(processes = []) {
  const normalizedProcesses = processes.map((process) => normalizeProcessSnapshot(process));

  const poe2Running = normalizedProcesses.some((process) => (
    POE2_PROCESSES.includes(process.name)
    || (POE1_PROCESSES.includes(process.name) && isPoe2InstallPath(process))
  ));

  if (poe2Running) {
    return 'poe2';
  }

  const poe1Running = normalizedProcesses.some((process) => (
    POE1_PROCESSES.includes(process.name)
    || process.name === 'pathofexilesteam.exe'
    || process.name === 'pathofexile_x64steam.exe'
  ));

  if (poe1Running) {
    return 'poe1';
  }

  return null;
}

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
      const detected = detectGameVersionFromProcesses(processes);

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
   * Get list of running process details (Windows-specific)
   */
  _getRunningProcesses() {
    return new Promise((resolve, reject) => {
      const command = buildWindowsProcessCommand();

      execFile('powershell', ['-NoProfile', '-Command', command], { maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        if (!stdout || !stdout.trim()) {
          resolve([]);
          return;
        }

        try {
          const parsed = JSON.parse(stdout);
          resolve(Array.isArray(parsed) ? parsed : [parsed]);
        } catch (parseError) {
          reject(parseError);
        }
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
module.exports.detectGameVersionFromProcesses = detectGameVersionFromProcesses;
module.exports.buildWindowsProcessCommand = buildWindowsProcessCommand;
