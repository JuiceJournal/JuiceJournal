const test = require('node:test');
const assert = require('node:assert/strict');

const { createGameSessionState, applyGameSessionLine } = require('../src/modules/gameSessionModel');

// PoE2 0.5.5e Client.txt: login, Play, back to character select, Play with another character.
// Character names are made up; IP addresses are redacted.
const POE2_CHARACTER_SWITCH = [
  '2026/10/21 13:09:53 ***** LOG FILE OPENING *****',
  '2026/10/21 13:09:58 9551234 7fbd1225 [INFO Client 46216] [SCENE] Set Source [(unknown)]',
  '2026/10/21 13:10:03 9555953 4f3e4d2c [INFO Client 46216] Async connecting to mil.login.pathofexile2.com:21270',
  '2026/10/21 13:10:03 9556062 4f3e4ba1 [INFO Client 46216] Connected to mil.login.pathofexile2.com in 0ms.',
  '2026/10/21 13:10:52 9604734 7fbd1225 [INFO Client 46216] [SCENE] Set Source [(null)]',
  '2026/10/21 13:10:52 9604750 2d8e64dd [DEBUG Client 46216] Got Instance Details from login server',
  '2026/10/21 13:10:52 9604750 91c6cc1 [INFO Client 46216] Connecting to instance server at 0.0.0.0:21360',
  '2026/10/21 13:10:52 9604843 2caa229f [DEBUG Client 46216] Generating level 65 area "HideoutCanal" with seed 1',
  '2026/10/21 13:10:52 9604937 7fbd1225 [INFO Client 46216] [SCENE] Set Source [Canal Hideout]',
  '2026/10/21 13:11:40 9652000 3ef23348 [INFO Client 46216] #ExampleTrader: WTS : ExampleRanger (Deadeye) is now level 95',
  '2026/10/21 13:12:53 9725000 4f3e4d2c [INFO Client 46216] Async connecting to mil.login.pathofexile2.com:21270',
  '2026/10/21 13:12:54 9725100 7fbd1225 [INFO Client 46216] [SCENE] Set Source [(null)]',
  '2026/10/21 13:12:54 9725200 7fbd1225 [INFO Client 46216] [SCENE] Set Source [(unknown)]',
  '2026/10/21 13:13:04 9736000 7fbd1225 [INFO Client 46216] [SCENE] Set Source [(null)]',
  '2026/10/21 13:13:04 9736015 2d8e64dd [DEBUG Client 46216] Got Instance Details from login server',
  '2026/10/21 13:13:04 9736100 2caa229f [DEBUG Client 46216] Generating level 65 area "HideoutCanal" with seed 1',
  '2026/10/21 13:20:11 9963000 2d8e64dd [DEBUG Client 46216] Got Instance Details from login server',
  '2026/10/21 13:20:11 9963100 2caa229f [DEBUG Client 46216] Generating level 79 area "MapHeadland" with seed 10066852',
  '2026/10/21 13:24:30 10222000 3ef23348 [INFO Client 46216] : ExampleShaman (Shaman) is now level 88',
  '2026/10/21 13:25:02 10254000 3ef23348 [INFO Client 46216] : PartyFriend has been slain.',
  '2026/10/21 13:31:17 10629000 a1e41499 [INFO Client 46216] Closing game gracefully'
];

function replay(lines) {
  let state = createGameSessionState();
  const events = [];

  for (const line of lines) {
    const result = applyGameSessionLine(state, line);
    state = result.state;
    events.push(...result.events.map((event) => ({ ...event, line: line.slice(0, 19) })));
  }

  return { state, events };
}

test('game session model reports Play once per character select and ignores zone changes', () => {
  const { state, events } = replay(POE2_CHARACTER_SWITCH);

  assert.deepEqual(
    events.map((event) => [event.type, event.reason || event.name || null, event.line]),
    [
      ['session_entered', null, '2026/10/21 13:10:52'],
      ['session_left', 'character_select', '2026/10/21 13:12:53'],
      ['session_entered', null, '2026/10/21 13:13:04'],
      ['character_line', 'ExampleShaman', '2026/10/21 13:24:30'],
      ['character_line', 'PartyFriend', '2026/10/21 13:25:02'],
      ['session_left', 'game_closed', '2026/10/21 13:31:17']
    ]
  );
  assert.equal(state.phase, 'idle');
});

test('game session model reads level-up, death and reward lines but never chat', () => {
  const lines = [
    '2026/10/21 13:24:30 1 3ef23348 [INFO Client 1] : ExampleRanger (Deadeye) is now level 94',
    '2026/10/21 13:24:31 1 3ef23348 [INFO Client 1] : ExampleRanger has been slain.',
    '2026/10/21 13:24:32 1 3ef23348 [INFO Client 1] : ExampleRanger has received +5 to [Spirit|Spirit].',
    '2026/10/21 13:24:33 1 3ef23348 [INFO Client 1] @From ExampleTrader: ExampleRanger has been slain.',
    '2026/10/21 13:24:34 1 3ef23348 [INFO Client 1] ExampleTrader: : ExampleRanger (Deadeye) is now level 99',
    '2026/10/21 13:24:35 1 3ef23348 [INFO Client 1] %ExampleTrader: : ExampleRanger has received a gift.',
    '2026/10/21 13:24:36 1 3ef23348 [INFO Client 1] : ExampleTrader has joined the area.'
  ];

  const { events } = replay(lines);

  assert.deepEqual(events.map(({ line, ...event }) => event), [
    { type: 'character_line', kind: 'level_up', name: 'ExampleRanger', className: 'Deadeye', level: 94 },
    { type: 'character_line', kind: 'slain', name: 'ExampleRanger', className: null, level: null },
    { type: 'character_line', kind: 'reward', name: 'ExampleRanger', className: null, level: null }
  ]);
});

test('game session model does not treat instance details as Play until a login connect is seen', () => {
  const { state, events } = replay([
    '2026/10/21 13:20:11 9963000 2d8e64dd [DEBUG Client 46216] Got Instance Details from login server',
    '2026/10/21 13:20:11 9963100 2caa229f [DEBUG Client 46216] Generating level 79 area "MapHeadland" with seed 10066852'
  ]);

  assert.deepEqual(events, []);
  assert.equal(state.phase, 'idle');
});

test('game session model ends an open session when a new game log starts without a clean close', () => {
  const { state, events } = replay([
    ...POE2_CHARACTER_SWITCH.slice(0, 6),
    '2026/10/21 14:00:00 ***** LOG FILE OPENING *****'
  ]);

  assert.deepEqual(events.map((event) => event.type), ['session_entered', 'session_left']);
  assert.equal(events[1].reason, 'game_restarted');
  assert.equal(state.phase, 'login');
});
