(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.gameSessionModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createGameSessionModel() {
  // Client.txt has no line naming the character at load. What it does show (PoE2 0.5.5e, measured):
  //   Async connecting to <realm>.login.pathofexile2.com   -> account login / back to character select
  //   Got Instance Details from login server             -> first one after login = Play; later ones = zone changes
  //   : Name (Class) is now level N / : Name has been slain. / : Name has received ...
  // The name lines also cover party members, so consumers must match names against the account's own characters.
  const CLIENT_LINE = /\[[A-Z]+ Client \d+\] (.*)$/;
  // Chat: channel prefixes (#, $, %, &, @From/@To) or local chat "Name: text". System messages start with ": ".
  const CHAT_MESSAGE = /^(?:[#$%&@]|[^\s[:]+: )/;
  const LOGIN_CONNECT = /^Async connecting to \S*login\S*/i;
  const INSTANCE_DETAILS = /^Got Instance Details from login server/;
  const LEVEL_UP = /^: (\S+) \(([^)]+)\) is now level (\d+)$/;
  const SLAIN = /^: (\S+) has been slain\.$/;
  const REWARD = /^: (\S+) has received /;

  function createGameSessionState() {
    return { phase: 'idle' };
  }

  function readMessage(line) {
    const text = String(line || '');
    if (text.includes('***** LOG FILE OPENING *****')) {
      return { logOpened: true };
    }

    const match = text.match(CLIENT_LINE);
    if (!match || CHAT_MESSAGE.test(match[1])) {
      return null;
    }

    return { message: match[1].trim() };
  }

  function readCharacterLine(message) {
    const levelUp = message.match(LEVEL_UP);
    if (levelUp) {
      return { kind: 'level_up', name: levelUp[1], className: levelUp[2], level: Number(levelUp[3]) };
    }

    const slain = message.match(SLAIN);
    if (slain) {
      return { kind: 'slain', name: slain[1], className: null, level: null };
    }

    const reward = message.match(REWARD);
    if (reward) {
      return { kind: 'reward', name: reward[1], className: null, level: null };
    }

    return null;
  }

  function leaveSession(phase, nextPhase, reason) {
    return {
      state: { phase: nextPhase },
      events: phase === 'in_game' ? [{ type: 'session_left', reason }] : []
    };
  }

  // Phases: idle -> login (log opened) -> char_select (login connect) -> in_game (first instance details).
  function applyGameSessionLine(state, line) {
    const phase = state?.phase || 'idle';
    const parsed = readMessage(line);
    if (!parsed) {
      return { state: { phase }, events: [] };
    }

    if (parsed.logOpened) {
      return leaveSession(phase, 'login', 'game_restarted');
    }

    const { message } = parsed;

    if (/^Closing game gracefully/.test(message)) {
      return leaveSession(phase, 'idle', 'game_closed');
    }

    if (LOGIN_CONNECT.test(message)) {
      return leaveSession(phase, 'char_select', 'character_select');
    }

    if (INSTANCE_DETAILS.test(message) && phase === 'char_select') {
      return { state: { phase: 'in_game' }, events: [{ type: 'session_entered' }] };
    }

    const characterLine = readCharacterLine(message);
    if (characterLine) {
      return { state: { phase }, events: [{ type: 'character_line', ...characterLine }] };
    }

    return { state: { phase }, events: [] };
  }

  return {
    createGameSessionState,
    applyGameSessionLine
  };
});
