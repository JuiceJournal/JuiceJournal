const test = require('node:test');
const assert = require('node:assert/strict');

const GameDetector = require('../src/modules/gameDetector');

test('game detector resolves standard PoE1 and PoE2 process names', () => {
  assert.equal(
    GameDetector.detectGameVersionFromProcesses([
      { name: 'PathOfExile_x64.exe', executablePath: 'E:\\Grinding Gear Games\\Path of Exile\\PathOfExile_x64.exe' }
    ]),
    'poe1'
  );

  assert.equal(
    GameDetector.detectGameVersionFromProcesses([
      { name: 'PathOfExile2.exe', executablePath: 'F:\\SteamLibrary\\steamapps\\common\\Path of Exile 2\\PathOfExile2.exe' }
    ]),
    'poe2'
  );
});

test('game detector treats Steam PathOfExileSteam.exe under Path of Exile 2 as poe2', () => {
  assert.equal(
    GameDetector.detectGameVersionFromProcesses([
      {
        name: 'PathOfExileSteam.exe',
        executablePath: 'F:\\SteamLibrary\\steamapps\\common\\Path of Exile 2\\PathOfExileSteam.exe',
        commandLine: '"F:\\SteamLibrary\\steamapps\\common\\Path of Exile 2\\PathOfExileSteam.exe" --nopatch'
      }
    ]),
    'poe2'
  );
});

test('game detector treats standalone PathOfExile.exe under Path of Exile 2 as poe2', () => {
  assert.equal(
    GameDetector.detectGameVersionFromProcesses([
      {
        name: 'PathOfExile.exe',
        executablePath: 'C:\\Program Files\\Grinding Gear Games\\Path of Exile 2\\PathOfExile.exe',
        commandLine: '"C:\\Program Files\\Grinding Gear Games\\Path of Exile 2\\PathOfExile.exe" --nopatch'
      }
    ]),
    'poe2'
  );
});

test('game detector falls back to poe1 for Steam PathOfExileSteam.exe under Path of Exile', () => {
  assert.equal(
    GameDetector.detectGameVersionFromProcesses([
      {
        name: 'PathOfExileSteam.exe',
        executablePath: 'F:\\SteamLibrary\\steamapps\\common\\Path of Exile\\PathOfExileSteam.exe',
        commandLine: '"F:\\SteamLibrary\\steamapps\\common\\Path of Exile\\PathOfExileSteam.exe" --nopatch'
      }
    ]),
    'poe1'
  );
});

test('game detector builds a targeted Windows process query instead of enumerating every process', () => {
  const command = GameDetector.buildWindowsProcessCommand();

  assert.match(command, /Get-CimInstance Win32_Process -Filter/);
  assert.doesNotMatch(command, /Get-CimInstance Win32_Process \|/);
  assert.match(command, /pathofexile\.exe/);
  assert.match(command, /pathofexile2\.exe/);
  assert.match(command, /pathofexilesteam\.exe/);
  assert.match(command, /Select-Object Name,ExecutablePath,CommandLine/);
  assert.match(command, /ConvertTo-Json -Compress/);
});

test('game detector includes secondary Steam library Client.txt candidates for PoE2', () => {
  const candidates = GameDetector.buildLogPathCandidates('poe2');

  assert.ok(
    candidates.includes('F:\\SteamLibrary\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt'),
    `Expected F: Steam library PoE2 log path in candidates. Got: ${candidates.join(', ')}`
  );
});

test('game detector reads Steam library folders when building Client.txt candidates', () => {
  const libraryConfigPath = 'C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf';
  const fsModule = {
    existsSync(filePath) {
      return filePath === libraryConfigPath;
    },
    readFileSync(filePath) {
      assert.equal(filePath, libraryConfigPath);
      return [
        '"libraryfolders"',
        '{',
        '  "0"',
        '  {',
        '    "path" "C:\\\\Program Files (x86)\\\\Steam"',
        '  }',
        '  "1"',
        '  {',
        '    "path" "H:\\\\Games\\\\SteamLibrary"',
        '  }',
        '}'
      ].join('\n');
    }
  };

  const candidates = GameDetector.buildLogPathCandidates('poe2', fsModule);

  assert.ok(
    candidates.includes('H:\\Games\\SteamLibrary\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt'),
    `Expected dynamic Steam library PoE2 log path in candidates. Got: ${candidates.join(', ')}`
  );
});

test('game detector derives GGG standalone PoE1 and PoE2 Client.txt paths from running processes', () => {
  const poe1Candidates = GameDetector.buildProcessLogPathCandidates('poe1', [
    {
      name: 'PathOfExile_x64.exe',
      executablePath: 'H:\\Games\\Grinding Gear Games\\Path of Exile\\PathOfExile_x64.exe'
    }
  ]);
  const poe2Candidates = GameDetector.buildProcessLogPathCandidates('poe2', [
    {
      name: 'PathOfExile.exe',
      executablePath: 'K:\\Games\\Grinding Gear Games\\Path of Exile 2\\PathOfExile.exe',
      commandLine: '"K:\\Games\\Grinding Gear Games\\Path of Exile 2\\PathOfExile.exe" --nopatch'
    }
  ]);

  assert.equal(
    poe1Candidates[0],
    'H:\\Games\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt'
  );
  assert.equal(
    poe2Candidates[0],
    'K:\\Games\\Grinding Gear Games\\Path of Exile 2\\logs\\Client.txt'
  );
});

test('game detector prefers process-derived Client.txt when locating a GGG standalone PoE2 install', () => {
  const expectedPath = 'K:\\Games\\Grinding Gear Games\\Path of Exile 2\\logs\\Client.txt';
  const fsModule = {
    existsSync(filePath) {
      return filePath === expectedPath;
    },
    readFileSync() {
      throw new Error('Steam metadata should not be required for GGG standalone installs.');
    }
  };

  assert.equal(
    GameDetector.findLogPath('poe2', {
      fsModule,
      processes: [
        {
          name: 'PathOfExile.exe',
          executablePath: 'K:\\Games\\Grinding Gear Games\\Path of Exile 2\\PathOfExile.exe',
          commandLine: '"K:\\Games\\Grinding Gear Games\\Path of Exile 2\\PathOfExile.exe" --nopatch'
        }
      ]
    }),
    expectedPath
  );
});

test('game detector includes detected process details in launch events', async () => {
  const detector = new GameDetector();
  const process = {
    Name: 'PathOfExile.exe',
    ExecutablePath: 'K:\\Games\\Grinding Gear Games\\Path of Exile 2\\PathOfExile.exe',
    CommandLine: '"K:\\Games\\Grinding Gear Games\\Path of Exile 2\\PathOfExile.exe" --nopatch'
  };

  detector._getRunningProcesses = async () => [process];
  const launchEvent = new Promise((resolve) => detector.once('gameLaunched', resolve));

  await detector._poll();
  const payload = await launchEvent;

  assert.equal(payload.version, 'poe2');
  assert.deepEqual(payload.processes, [process]);
});
