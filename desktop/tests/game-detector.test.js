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
