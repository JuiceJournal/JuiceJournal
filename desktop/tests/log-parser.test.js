const test = require('node:test');
const assert = require('node:assert/strict');

const LogParser = require('../src/modules/logParser');

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const line = (text) => `2026/05/04 21:00:00 1 abc [DEBUG Client 1] ${text}`;

test('log parser knows where maps start: a hideout by its own area id, and the endgame town by name', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe2' });
  assert.equal(parser.isInMapHub(), false, 'unknown until an area is generated');

  parser.parseLine(line('Generating level 65 area "HideoutFelled" with seed 1'));
  assert.equal(parser.isInMapHub(), true, 'a hideout, in any client language');
  parser.parseLine(line('Generating level 80 area "MapHeadland" with seed 2'));
  assert.equal(parser.isInMapHub(), false);
  parser.parseLine(line('Generating level 1 area "G1_town" with seed 3'));
  parser.parseLine(line(': You have entered Clearfell Encampment.'));
  assert.equal(parser.isInMapHub(), false, 'a campaign town is not where maps start');
  parser.parseLine(line('Generating level 65 area "EndgameTown" with seed 4'));
  parser.parseLine(line(': You have entered The Ziggurat Refuge.'));
  assert.equal(parser.isInMapHub(), true, 'the endgame town before a hideout is claimed');
  parser.parseLine(line('Generating level 80 area "MapHeadland" with seed 5'));
  assert.equal(parser.isInMapHub(), false, 'the name of the last area goes with it');

  // Local chat that reads like the game's own line moves nothing.
  parser.parseLine('2026/05/04 21:10:00 1 abc [INFO Client 1] Someone: You have entered The Ziggurat Refuge.');
  assert.equal(parser.isInMapHub(), false);
});

test('log parser forgets the area when the player leaves the game', () => {
  for (const leaving of [
    '2026/05/04 21:20:00 1 abc [INFO Client 1] Async connecting to eu.login.pathofexile2.com:6112',
    '2026/05/04 21:20:00 1 abc [INFO Client 1] Closing game gracefully',
    '2026/05/04 21:20:00 ***** LOG FILE OPENING *****'
  ]) {
    const parser = new LogParser('Client.txt', { poeVersion: 'poe2' });
    parser.parseLine(line('Generating level 65 area "HideoutFelled" with seed 1'));
    assert.equal(parser.isInMapHub(), true);
    parser.parseLine(leaving);
    assert.equal(parser.isInMapHub(), false, leaving);
  }
});

test('log parser resumes the area from the recent log, so a player already in a hideout is known at start', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe2' });
  parser.bootstrapFromRecentLines([
    line('Generating level 80 area "MapHeadland" with seed 2'),
    line('Generating level 65 area "HideoutFelled" with seed 1')
  ]);
  assert.equal(parser.isInMapHub(), true);

  // A hideout from an earlier run of the game, before it was opened again, is not where the player is now.
  const restarted = new LogParser('Client.txt', { poeVersion: 'poe2' });
  restarted.bootstrapFromRecentLines([
    line('Generating level 65 area "HideoutFelled" with seed 1'),
    '2026/05/04 22:00:00 ***** LOG FILE OPENING *****'
  ]);
  assert.equal(restarted.isInMapHub(), false);
});

test('log parser treats PoE2 endgame area names without Map as map entries', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe2' });
  const entries = [];

  parser.on('mapEntered', (payload) => entries.push(payload));
  parser.parseLine('2026/05/04 15:49:10 123456 abc [INFO Client 123] : You have entered Tower.');

  assert.equal(entries.length, 1);
  assert.equal(entries[0].mapName, 'Tower');
  assert.equal(entries[0].mapTier, null);
});

test('log parser tracks PoE2 generated map areas and safe generated area exits', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe2' });
  const entries = [];
  const exits = [];

  parser.on('mapEntered', (payload) => entries.push(payload));
  parser.on('mapExited', (payload) => exits.push(payload));

  parser.parseLine('2026/05/04 21:00:38 7155484 2caa22d2 [DEBUG Client 98516] Generating level 80 area "MapHeadland" with seed 10066852');
  parser.parseLine('2026/05/04 21:02:34 7271093 2caa22d2 [DEBUG Client 98516] Generating level 65 area "HideoutCanal" with seed 1');
  parser.parseLine('2026/05/04 21:10:38 7155484 2caa22d2 [DEBUG Client 98516] Generating level 80 area "MapMesa" with seed 3135500465');

  assert.deepEqual(
    entries.map((entry) => entry.mapName),
    ['Headland', 'Mesa']
  );
  assert.equal(entries[0].mapTier, 80);
  assert.equal(exits.length, 1);
  assert.equal(exits[0].mapName, 'Headland');
  assert.equal(exits[0].location, 'Canal Hideout');
});

test('log parser keeps PoE2 Abyssal Depths transitions inside the active map', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe2' });
  const entries = [];
  const exits = [];

  parser.on('mapEntered', (payload) => entries.push(payload));
  parser.on('mapExited', (payload) => exits.push(payload));

  parser.parseLine('2026/05/04 21:00:38 7155484 2caa22d2 [DEBUG Client 98516] Generating level 80 area "MapChannel" with seed 10066852');
  parser.parseLine('2026/05/04 21:02:34 7271093 2caa22d2 [INFO Client 98516] : You have entered Abyssal Depths.');
  parser.parseLine('2026/05/04 21:07:21 7271093 2caa22d2 [INFO Client 98516] : You have entered Channel.');
  parser.parseLine('2026/05/04 21:10:38 7155484 2caa22d2 [DEBUG Client 98516] Generating level 65 area "HideoutCanal" with seed 1');

  assert.deepEqual(
    entries.map((entry) => entry.mapName),
    ['Channel']
  );
  assert.equal(exits.length, 1);
  assert.equal(exits[0].mapName, 'Channel');
  assert.equal(exits[0].location, 'Canal Hideout');
});

test('log parser ignores PoE2 trial side areas when no map is active', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe2' });
  const entries = [];

  parser.on('mapEntered', (payload) => entries.push(payload));

  parser.parseLine('2026/05/05 19:14:10 123456 abc [INFO Client 123] : You have entered Trial of the Sekhemas.');
  parser.parseLine('2026/05/05 19:18:42 123456 abc [INFO Client 123] : You have entered Trial of Chaos.');
  parser.parseLine('2026/05/05 19:21:08 123456 abc [INFO Client 123] : You have entered The Trial of Chaos.');

  assert.deepEqual(entries, []);
});

test('log parser does not treat PoE2 safe social areas as map entries', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe2' });
  const entries = [];

  parser.on('mapEntered', (payload) => entries.push(payload));
  parser.parseLine('2026/05/04 15:49:10 123456 abc [INFO Client 123] : You have entered Canal Hideout.');

  assert.equal(entries.length, 0);
});

test('log parser exits PoE2 maps when the player returns to a named hideout', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe2' });
  const entries = [];
  const exits = [];

  parser.on('mapEntered', (payload) => entries.push(payload));
  parser.on('mapExited', (payload) => exits.push(payload));

  parser.parseLine('2026/05/06 12:00:00 123456 abc [INFO Client 123] : Generating level 80 area "MapChannel" with seed 1');
  parser.parseLine('2026/05/06 12:02:00 123456 abc [INFO Client 123] : You have entered Abyssal Depths.');
  parser.parseLine('2026/05/06 12:05:30 123456 abc [INFO Client 123] : You have entered Canal Hideout.');

  assert.deepEqual(entries.map((entry) => entry.mapName), ['Channel']);
  assert.equal(exits.length, 1);
  assert.equal(exits[0].mapName, 'Channel');
  assert.equal(exits[0].location, 'Canal Hideout');
});

test('log parser keeps generic non-map area entries disabled for PoE1', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe1' });
  const entries = [];

  parser.on('mapEntered', (payload) => entries.push(payload));
  parser.parseLine('2026/05/04 15:49:10 123456 abc [INFO Client 123] : You have entered The Coast.');

  assert.equal(entries.length, 0);
});

test('log parser keeps PoE1 league side instances inside the active map', async () => {
  const parser = new LogParser('Client.txt', {
    poeVersion: 'poe1',
    instanceExitDelayMs: 20
  });
  const entries = [];
  const exits = [];

  parser.on('mapEntered', (payload) => entries.push(payload));
  parser.on('mapExited', (payload) => exits.push(payload));

  parser.parseLine('2026/05/06 18:00:00 123456 abc [INFO Client 123] : Generating level 83 area "MapDunes" with seed 1');
  parser.parseLine('2026/05/06 18:02:00 123456 abc [INFO Client 123] : Connecting to instance server...');
  parser.parseLine('2026/05/06 18:02:02 123456 abc [INFO Client 123] : You have entered The Sacred Grove.');
  await wait(30);

  assert.deepEqual(entries.map((entry) => entry.mapName), ['Dunes Map']);
  assert.equal(exits.length, 0);
  assert.equal(parser.getCurrentMap().mapName, 'Dunes Map');

  parser.parseLine('2026/05/06 18:08:00 123456 abc [INFO Client 123] : You have entered Canal Hideout.');

  assert.equal(exits.length, 1);
  assert.equal(exits[0].mapName, 'Dunes Map');
  assert.equal(exits[0].location, 'Canal Hideout');
});

test('log parser keeps PoE1 same-seed map re-entry inside the active map', async () => {
  const parser = new LogParser('Client.txt', {
    poeVersion: 'poe1',
    instanceExitDelayMs: 20
  });
  const entries = [];
  const exits = [];

  parser.on('mapEntered', (payload) => entries.push(payload));
  parser.on('mapExited', (payload) => exits.push(payload));

  parser.parseLine('2026/05/07 09:31:30 123456 abc [INFO Client 123] : Generating level 83 area "MapWorldsDunes" with seed 3809657038');
  parser.parseLine('2026/05/07 09:31:30 123456 abc [INFO Client 123] : You have entered Dunes.');
  parser.parseLine('2026/05/07 09:35:17 123456 abc [INFO Client 123] : Connecting to instance server...');
  parser.parseLine('2026/05/07 09:35:17 123456 abc [INFO Client 123] : Generating level 83 area "MapWorldsDunes" with seed 3809657038');
  parser.parseLine('2026/05/07 09:35:18 123456 abc [INFO Client 123] : You have entered Dunes.');
  await wait(30);

  assert.deepEqual(entries.map((entry) => entry.mapName), ['Dunes Map']);
  assert.equal(exits.length, 0);
  assert.equal(parser.getCurrentMap().mapName, 'Dunes Map');

  parser.parseLine('2026/05/07 09:36:37 123456 abc [INFO Client 123] : Generating level 60 area "HideoutForest" with seed 1');
  parser.parseLine('2026/05/07 09:36:38 123456 abc [INFO Client 123] : You have entered Lush Hideout.');

  assert.equal(exits.length, 1);
  assert.equal(exits[0].mapName, 'Dunes Map');
});

test('log parser bootstraps one PoE1 map-entered event when startup tail is inside a map', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe1' });
  const entries = [];

  parser.on('mapEntered', (payload) => entries.push(payload));

  const didBootstrap = parser.bootstrapFromRecentLines([
    '2026/05/07 09:31:30 123456 abc [INFO Client 123] : Generating level 83 area "MapWorldsDunes" with seed 3809657038',
    '2026/05/07 09:31:30 123456 abc [INFO Client 123] : You have entered Dunes.'
  ], {
    // Client.txt timestamps are local time, so the test clock must be local too.
    now: new Date(2026, 4, 7, 9, 32, 0),
    maxAgeMs: 5 * 60 * 1000
  });

  assert.equal(didBootstrap, true);
  assert.deepEqual(entries.map((entry) => entry.mapName), ['Dunes Map']);
  assert.equal(entries[0].source, 'log_bootstrap');
  assert.equal(parser.getCurrentMap().mapName, 'Dunes Map');
});

test('log parser does not bootstrap PoE1 map prompt when startup tail ends in hideout', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe1' });
  const entries = [];

  parser.on('mapEntered', (payload) => entries.push(payload));

  const didBootstrap = parser.bootstrapFromRecentLines([
    '2026/05/07 09:31:30 123456 abc [INFO Client 123] : Generating level 83 area "MapWorldsDunes" with seed 3809657038',
    '2026/05/07 09:36:37 123456 abc [INFO Client 123] : Generating level 60 area "HideoutForest" with seed 1',
    '2026/05/07 09:36:38 123456 abc [INFO Client 123] : You have entered Lush Hideout.'
  ], {
    now: new Date(2026, 4, 7, 9, 37, 0),
    maxAgeMs: 5 * 60 * 1000
  });

  assert.equal(didBootstrap, false);
  assert.deepEqual(entries, []);
  assert.equal(parser.getCurrentMap().mapName, null);
});

test('log parser still exits PoE1 maps on unresolved instance changes after debounce', async () => {
  const parser = new LogParser('Client.txt', {
    poeVersion: 'poe1',
    instanceExitDelayMs: 20
  });
  const exits = [];

  parser.on('mapExited', (payload) => exits.push(payload));

  parser.parseLine('2026/05/06 18:00:00 123456 abc [INFO Client 123] : Generating level 83 area "MapDunes" with seed 1');
  parser.parseLine('2026/05/06 18:02:00 123456 abc [INFO Client 123] : Connecting to instance server...');
  await wait(30);

  assert.equal(exits.length, 1);
  assert.equal(exits[0].mapName, 'Dunes Map');
  assert.equal(exits[0].location, 'instance_change');
  assert.equal(parser.getCurrentMap().mapName, null);
});

test('log parser emits game session events with the parser version and log timestamp', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe2' });
  const events = [];

  parser.on('gameSessionEntered', (payload) => events.push(['entered', payload]));
  parser.on('gameSessionLeft', (payload) => events.push(['left', payload]));
  parser.on('characterLogLine', (payload) => events.push(['character', payload]));

  parser.parseLine('2026/10/21 13:10:03 9555953 4f3e4d2c [INFO Client 46216] Async connecting to mil.login.pathofexile2.com:21270');
  parser.parseLine('2026/10/21 13:10:52 9604750 2d8e64dd [DEBUG Client 46216] Got Instance Details from login server');
  parser.parseLine('2026/10/21 13:11:30 9642000 3ef23348 [INFO Client 46216] : ExampleRanger (Deadeye) is now level 95');
  parser.parseLine('2026/10/21 13:12:53 9725000 4f3e4d2c [INFO Client 46216] Async connecting to mil.login.pathofexile2.com:21270');

  assert.deepEqual(events.map(([kind]) => kind), ['entered', 'character', 'left']);
  assert.equal(events[0][1].poeVersion, 'poe2');
  assert.equal(events[0][1].timestamp.getTime(), new Date('2026-10-21 13:10:52').getTime());
  assert.deepEqual(
    { name: events[1][1].name, className: events[1][1].className, level: events[1][1].level, kind: events[1][1].kind },
    { name: 'ExampleRanger', className: 'Deadeye', level: 95, kind: 'level_up' }
  );
  assert.equal(events[2][1].reason, 'character_select');
});

test('log parser resumes the session phase from the startup tail without replaying its events', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe2' });
  const entered = [];

  parser.on('gameSessionEntered', (payload) => entered.push(payload));

  parser.bootstrapFromRecentLines([
    '2026/10/21 13:09:53 ***** LOG FILE OPENING *****',
    '2026/10/21 13:10:03 9555953 4f3e4d2c [INFO Client 46216] Async connecting to mil.login.pathofexile2.com:21270'
  ]);
  assert.deepEqual(entered, []);

  parser.parseLine('2026/10/21 13:10:52 9604750 2d8e64dd [DEBUG Client 46216] Got Instance Details from login server');
  assert.equal(entered.length, 1);
});

// Pure: a temp-file version was flaky on Windows when antivirus briefly locked the file (EBUSY).
test('log parser holds an unterminated Client.txt line and split UTF-8 bytes until the rest arrives', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe2' });
  const levelUp = '2026/10/21 13:10:01 1 3ef23348 [INFO Client 1] : ÜnalShaman (Shaman) is now level 2';
  const play = '2026/10/21 13:10:52 2 2d8e64dd [DEBUG Client 1] Got Instance Details from login server';
  const bytes = Buffer.from(`${levelUp}\r\n${play}\r\n`, 'utf8');
  const insideUmlaut = bytes.indexOf(Buffer.from('Ü', 'utf8')) + 1;
  const insidePlay = bytes.indexOf(Buffer.from('Instance Det')) + 'Instance Det'.length;

  assert.deepEqual(parser.takeCompleteLines(bytes.subarray(0, insideUmlaut)), []);
  assert.deepEqual(parser.takeCompleteLines(bytes.subarray(insideUmlaut, insidePlay)), [`${levelUp}\r`]);
  assert.deepEqual(parser.takeCompleteLines(bytes.subarray(insidePlay)), [`${play}\r`]);

  parser.resetLineBuffer();
  assert.deepEqual(parser.takeCompleteLines(Buffer.from('tail without newline')), []);
  assert.deepEqual(parser.takeCompleteLines(Buffer.from('\n')), ['tail without newline']);
});

test('log parser ignores chat lines that read like the game changing area', () => {
  const chatLines = (text) => [
    `2026/05/04 21:02:34 1 abc [INFO Client 1] @From Griefer: ${text}`,
    `2026/05/04 21:02:34 1 abc [INFO Client 1] @From <TAG> Griefer: ${text}`,
    `2026/05/04 21:02:34 1 abc [INFO Client 1] @To Griefer: ${text}`,
    `2026/05/04 21:02:34 1 abc [INFO Client 1] #Griefer: ${text}`,
    `2026/05/04 21:02:34 1 abc [INFO Client 1] $Griefer: ${text}`,
    `2026/05/04 21:02:34 1 abc [INFO Client 1] %Griefer: ${text}`,
    `2026/05/04 21:02:34 1 abc [INFO Client 1] &Griefer: ${text}`,
    `2026/05/04 21:02:34 1 abc [INFO Client 1] Griefer: ${text}`,
    `2026/05/04 21:02:34 1 abc [INFO Client 1] Griefer: [INFO Client 1] : ${text}`,
    // '.' stops at these, so without the s flag the match would restart at the forged tag.
    `2026/05/04 21:02:34 1 abc [INFO Client 1] @From Griefer: x\u2028[INFO Client 1] : ${text}`,
    `2026/05/04 21:02:34 1 abc [INFO Client 1] @From Griefer: x\u2029[INFO Client 1] : ${text}`,
    `2026/05/04 21:02:34 1 abc [INFO Client 1] Griefer: x\r[INFO Client 1] : ${text}`
  ];

  for (const poeVersion of ['poe1', 'poe2']) {
    const parser = new LogParser('Client.txt', { poeVersion, instanceExitDelayMs: 0 });
    const entries = [];
    const exits = [];
    parser.on('mapEntered', (payload) => entries.push(payload.mapName));
    parser.on('mapExited', (payload) => exits.push(payload.location));

    // With no map running, no chat line starts one.
    for (const text of ['You have entered Fake Map.', 'Generating level 83 area "MapEvil"']) {
      chatLines(text).forEach((line) => parser.parseLine(line));
    }
    assert.deepEqual(entries, []);

    parser.parseLine('2026/05/04 21:00:38 1 abc [DEBUG Client 1] Generating level 80 area "MapDunes" with seed 1');
    assert.equal(entries.length, 1);

    // With a map running, no chat line ends it or replaces it.
    for (const text of ['You have entered Hideout.', 'You have entered Fake Map.', 'Generating level 83 area "MapEvil"', 'Generating level 65 area "HideoutCanal"', 'Connecting to instance server at 1.2.3.4:6112']) {
      chatLines(text).forEach((line) => parser.parseLine(line));
    }
    assert.equal(entries.length, 1);
    assert.deepEqual(exits, []);

    // The game's own line still ends it.
    parser.parseLine('2026/05/04 21:10:00 1 abc [INFO Client 1] : You have entered Hideout.');
    assert.deepEqual(exits, ['Hideout']);
    assert.equal(parser.currentMap, null);
  }
});

test('log parser keeps a pending instance change open across chat lines', () => {
  const parser = new LogParser('Client.txt', { poeVersion: 'poe1', instanceExitDelayMs: 60000 });
  parser.parseLine('2026/05/04 21:00:38 1 abc [DEBUG Client 1] Generating level 80 area "MapDunes" with seed 1');
  parser.parseLine('2026/05/04 21:01:00 1 abc [DEBUG Client 1] Connecting to instance server at 1.2.3.4:6112');
  assert.ok(parser.pendingInstanceExitData);

  parser.parseLine('2026/05/04 21:01:01 1 abc [INFO Client 1] @From Griefer: You have entered Hideout.');
  assert.ok(parser.pendingInstanceExitData);

  parser.clearPendingInstanceExit();
});
