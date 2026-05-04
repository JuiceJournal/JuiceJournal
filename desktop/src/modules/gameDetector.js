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
const fs = require('fs');
const path = require('path');

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
    'D:\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt',
    'F:\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt',
    'G:\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt'
  ],
  poe2: [
    'C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile 2\\logs\\Client.txt',
    'C:\\Program Files\\Grinding Gear Games\\Path of Exile 2\\logs\\Client.txt',
    'E:\\Grinding Gear Games\\Path of Exile 2\\logs\\Client.txt',
    'D:\\Grinding Gear Games\\Path of Exile 2\\logs\\Client.txt',
    'F:\\Grinding Gear Games\\Path of Exile 2\\logs\\Client.txt',
    'G:\\Grinding Gear Games\\Path of Exile 2\\logs\\Client.txt',
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt',
    'D:\\SteamLibrary\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt',
    'E:\\SteamLibrary\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt',
    'F:\\SteamLibrary\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt',
    'G:\\SteamLibrary\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt'
  ]
};

// Primary default PoE1 log path — single source of truth for main.js
const DEFAULT_POE_LOG_PATH = 'E:\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt';
const STEAM_LIBRARY_CONFIG_PATHS = [
  'C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf',
  'C:\\Program Files\\Steam\\steamapps\\libraryfolders.vdf'
];
const STEAM_APP_LOG_RELATIVE_PATHS = {
  poe1: 'steamapps\\common\\Path of Exile\\logs\\Client.txt',
  poe2: 'steamapps\\common\\Path of Exile 2\\logs\\Client.txt'
};

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

function normalizeSteamLibraryRoot(value) {
  return String(value || '')
    .replace(/\\\\/g, '\\')
    .trim()
    .replace(/[\\\/]+$/, '');
}

function joinWindowsPath(root, relativePath) {
  const normalizedRoot = normalizeSteamLibraryRoot(root);
  const normalizedRelative = String(relativePath || '')
    .replace(/[\\\/]+/g, '\\')
    .replace(/^\\+/, '');

  return normalizedRoot && normalizedRelative
    ? `${normalizedRoot}\\${normalizedRelative}`
    : '';
}

function extractExecutablePathFromProcess(process = {}) {
  const executablePath = String(process.executablePath || process.ExecutablePath || '').trim();
  if (executablePath) {
    return executablePath.replace(/^"|"$/g, '');
  }

  const commandLine = String(process.commandLine || process.CommandLine || '').trim();
  const quotedPath = commandLine.match(/^"([^"]+\.exe)"/i);
  if (quotedPath) {
    return quotedPath[1];
  }

  const barePath = commandLine.match(/^([^\s]+\.exe)\b/i);
  return barePath ? barePath[1] : '';
}

function getProcessGameVersion(process = {}) {
  const normalized = normalizeProcessSnapshot(process);

  if (
    POE2_PROCESSES.includes(normalized.name)
    || (POE1_PROCESSES.includes(normalized.name) && isPoe2InstallPath(normalized))
  ) {
    return 'poe2';
  }

  if (
    POE1_PROCESSES.includes(normalized.name)
    || normalized.name === 'pathofexilesteam.exe'
    || normalized.name === 'pathofexile_x64steam.exe'
  ) {
    return 'poe1';
  }

  return null;
}

function buildProcessLogPathCandidates(version, processes = []) {
  return processes
    .filter((process) => getProcessGameVersion(process) === version)
    .map((process) => {
      const executablePath = extractExecutablePathFromProcess(process);
      return executablePath
        ? path.win32.join(path.win32.dirname(executablePath), 'logs', 'Client.txt')
        : '';
    })
    .filter(Boolean);
}

function parseSteamLibraryRoots(vdfContent) {
  const roots = [];
  const content = String(vdfContent || '');
  const pattern = /"path"\s+"([^"]+)"/gi;
  let match = pattern.exec(content);

  while (match) {
    const root = normalizeSteamLibraryRoot(match[1]);
    if (root) {
      roots.push(root);
    }
    match = pattern.exec(content);
  }

  return [...new Set(roots)];
}

function buildLogPathCandidates(version, options = {}) {
  const fsModule = typeof options.existsSync === 'function'
    ? options
    : (options.fsModule || fs);
  const processes = Array.isArray(options.processes) ? options.processes : [];
  const staticPaths = DEFAULT_LOG_PATHS[version] || [];
  const relativePath = STEAM_APP_LOG_RELATIVE_PATHS[version];
  const candidates = [
    ...buildProcessLogPathCandidates(version, processes),
    ...staticPaths
  ];

  if (relativePath) {
    for (const configPath of STEAM_LIBRARY_CONFIG_PATHS) {
      try {
        if (!fsModule.existsSync(configPath)) {
          continue;
        }

        const content = fsModule.readFileSync(configPath, 'utf8');
        for (const root of parseSteamLibraryRoots(content)) {
          candidates.push(joinWindowsPath(root, relativePath));
        }
      } catch {
        // Static candidates still cover common installs when Steam metadata is unavailable.
      }
    }
  }

  return [...new Set(candidates.filter(Boolean))];
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
  const processVersions = processes.map((process) => getProcessGameVersion(process));
  const poe2Running = processVersions.includes('poe2');

  if (poe2Running) {
    return 'poe2';
  }

  const poe1Running = processVersions.includes('poe1');

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
      const detectedProcesses = detected
        ? processes.filter((process) => getProcessGameVersion(process) === detected)
        : [];

      // Detect state changes
      if (detected !== this.currentGame) {
        const previous = this.currentGame;
        this.currentGame = detected;

        if (detected && !previous) {
          // Game launched
          this.emit('gameLaunched', { version: detected, processes: detectedProcesses });
        } else if (!detected && previous) {
          // Game closed
          this.emit('gameClosed', { version: previous });
        } else if (detected && previous && detected !== previous) {
          // Switched games (e.g. closed PoE1, opened PoE2)
          this.emit('gameSwitched', { from: previous, to: detected, processes: detectedProcesses });
        }

        // Always emit the change
        this.emit('gameChanged', {
          version: detected,
          previous,
          running: !!detected,
          processes: detectedProcesses
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
  static findLogPath(version, options = {}) {
    const paths = buildLogPathCandidates(version, options);
    const fsModule = typeof options.existsSync === 'function'
      ? options
      : (options.fsModule || fs);
    for (const p of paths) {
      if (fsModule.existsSync(p)) {
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
module.exports.buildLogPathCandidates = buildLogPathCandidates;
module.exports.buildProcessLogPathCandidates = buildProcessLogPathCandidates;
module.exports.parseSteamLibraryRoots = parseSteamLibraryRoots;
