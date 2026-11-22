const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const accountStateModel = require('../src/modules/accountStateModel');
const overlayStateModel = require('../src/modules/overlayStateModel');

const { buildCharacterPrompt } = accountStateModel;
const appSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8').replace(/\r\n/g, '\n');
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8').replace(/\r\n/g, '\n');

// A top-level function of the file up to its closing brace in column zero.
function loadFunctions(source, functionNames, contextOverrides = {}) {
  const context = vm.createContext({ console: { log() {} }, ...contextOverrides });
  for (const functionName of functionNames) {
    const start = source.indexOf(`\nfunction ${functionName}(`);
    assert.notEqual(start, -1, `should define ${functionName}()`);
    const end = source.indexOf('\n}\n', start);
    vm.runInContext(`${source.slice(start, end + 2)};\nthis.${functionName} = ${functionName};`, context);
  }
  return context;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function character(id, level, league) {
  return { id, name: id.toUpperCase(), className: 'Monk', level, league };
}

const ids = (prompt) => prompt.characters.map((entry) => entry.id);

test('the prompt offers the last played character, then the other league, then this league by level', () => {
  const prompt = buildCharacterPrompt({
    selectedId: 'mid',
    league: 'Dawn',
    characters: [character('low', 40, 'Dawn'), character('std', 99, 'Standard'), character('mid', 70, 'Dawn'), character('top', 95, 'Dawn')]
  });

  assert.deepEqual(ids(prompt), ['mid', 'std', 'top', 'low']);
  assert.equal(prompt.selectedId, 'mid');
  assert.equal(prompt.shownCount, 4);
  assert.deepEqual(prompt.characters.map((entry) => entry.league), [null, 'Standard', null, null]);
  assert.deepEqual(plain(prompt.characters[0]), { id: 'mid', name: 'MID', className: 'Monk', level: 70, league: null });
});

test('each other league offers its last played character, else its highest level one, all within six chips', () => {
  const characters = [
    character('sel', 80, 'Dawn'), character('d1', 90, 'Dawn'), character('d2', 85, 'Dawn'), character('d3', 30, 'Dawn'),
    character('std1', 99, 'Standard'), character('std2', 50, 'Standard'),
    character('hc1', 70, 'Hardcore'), character('hc2', 20, 'Hardcore'),
    character('ssf', 60, 'SSF Dawn'), character('hcssf', 40, 'HC SSF Dawn')
  ];
  // Hardcore's record names a character of another league, so Hardcore offers its highest level one.
  const prompt = buildCharacterPrompt({
    selectedId: 'sel',
    league: 'Dawn',
    characters,
    lastPlayedByLeague: { standard: 'std2', hardcore: 'd1' }
  });

  assert.deepEqual(ids(prompt), ['sel', 'std2', 'hc1', 'ssf', 'hcssf', 'd1', 'd2', 'd3', 'std1', 'hc2']);
  assert.equal(prompt.shownCount, 6);
  assert.deepEqual(prompt.characters.slice(0, 6).map((entry) => entry.league), [null, 'Standard', 'Hardcore', 'SSF Dawn', 'HC SSF Dawn', null]);
  // The rest of the whole list, behind More, keeps the other leagues labelled.
  assert.deepEqual(prompt.characters.slice(6).map((entry) => entry.league), [null, null, 'Standard', 'Hardcore']);
});

test('the last played record keeps one character per league and game, matched without case', () => {
  const { recordLastPlayed, deriveAccountState, createAccountStateCache } = accountStateModel;

  let record = recordLastPlayed(undefined, 'poe2', { id: 'a', league: ' Dawn ' });
  record = recordLastPlayed(record, 'poe2', { id: 'b', league: 'Standard' });
  record = recordLastPlayed(record, 'poe2', { id: 'c', league: 'DAWN' });
  record = recordLastPlayed(record, 'poe1', { id: 'p1', league: 'Mirage' });
  assert.deepEqual(record, { poe2: { dawn: 'c', standard: 'b' }, poe1: { mirage: 'p1' } });
  // A character with no league, or no game, changes nothing.
  assert.deepEqual(recordLastPlayed(record, 'poe2', { id: 'x', league: null }), record);
  assert.deepEqual(recordLastPlayed(record, 'poe3', { id: 'x', league: 'Dawn' }), record);

  // The account state carries it, and the cache it writes keeps it.
  const account = deriveAccountState({
    activePoeVersion: 'poe2',
    characters: [{ ...character('c', 80, 'Dawn'), poeVersion: 'poe2' }],
    cachedAccountState: { lastPlayedByLeague: { ...record, poe2: { ...record.poe2, '  ': 'junk' } } }
  });
  assert.deepEqual(plain(account.lastPlayedByLeague), record);
  assert.deepEqual(plain(createAccountStateCache(account).lastPlayedByLeague), record);
});

test('the prompt shows at most six chips and keeps the rest of the league behind More', () => {
  const characters = Array.from({ length: 9 }, (_, index) => character(`c${index}`, 90 - index, 'Dawn'));
  const prompt = buildCharacterPrompt({ selectedId: 'c7', league: 'Dawn', characters });

  assert.equal(prompt.shownCount, 6);
  assert.equal(prompt.characters.length, 9);
  assert.deepEqual(ids(prompt), ['c7', 'c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c8']);
});

test('nothing is hidden behind More when the league fits and no other league has characters', () => {
  const prompt = buildCharacterPrompt({
    selectedId: 'a',
    league: 'Dawn',
    characters: [character('a', 80, 'Dawn'), character('b', 90, 'Dawn')]
  });

  assert.equal(prompt.shownCount, prompt.characters.length);
});

test('the prompt asks when this league has one character but another league has some', () => {
  const characters = [character('dawn', 80, 'Dawn'), character('std1', 90, 'Standard'), character('std2', 91, 'Standard')];

  const prompt = buildCharacterPrompt({ selectedId: 'dawn', league: 'Dawn', characters });
  assert.deepEqual(ids(prompt), ['dawn', 'std2', 'std1']);
  assert.equal(prompt.shownCount, 2);
  assert.deepEqual(prompt.characters.map((entry) => entry.league), [null, 'Standard', 'Standard']);

  const played = buildCharacterPrompt({ selectedId: 'dawn', league: 'Dawn', characters, lastPlayedByLeague: { standard: 'std1' } });
  assert.deepEqual(ids(played), ['dawn', 'std1', 'std2']);
  assert.equal(played.shownCount, 2);
});

test('no prompt with one character or none, or without a last played character', () => {
  const characters = [character('dawn', 80, 'Dawn'), character('std1', 90, 'Standard')];

  assert.equal(buildCharacterPrompt({ selectedId: 'dawn', league: 'Dawn', characters: characters.slice(0, 1) }), null);
  assert.equal(buildCharacterPrompt({ selectedId: 'dawn', league: 'Dawn', characters: [] }), null);
  // Today's rule stays: no prompt without a last played character.
  assert.equal(buildCharacterPrompt({ selectedId: null, league: 'Standard', characters }), null);
});

test('with no league known the prompt offers every character by level, still six and More', () => {
  const characters = Array.from({ length: 8 }, (_, index) => character(`c${index}`, 10 + index, index % 2 ? 'Dawn' : 'Standard'));
  const prompt = buildCharacterPrompt({ selectedId: 'c0', league: '  ', characters });

  assert.deepEqual(ids(prompt), ['c7', 'c6', 'c5', 'c4', 'c3', 'c2', 'c1', 'c0']);
  assert.equal(prompt.shownCount, 6);
  assert.ok(prompt.characters.every((entry) => entry.league === null));
  assert.equal(buildCharacterPrompt({ selectedId: 'c0', league: null, characters: characters.slice(0, 1) }), null);
});

test('league names match without case or surrounding spaces', () => {
  const prompt = buildCharacterPrompt({
    selectedId: 'a',
    league: '  fate of the VAAL ',
    characters: [character('a', 80, 'Fate of the Vaal'), character('b', 90, 'fate of the vaal'), character('c', 99, 'Standard')]
  });

  assert.deepEqual(ids(prompt), ['a', 'c', 'b']);
  assert.equal(prompt.shownCount, 3);
  assert.deepEqual(prompt.characters.map((entry) => entry.league), [null, 'Standard', null]);
});

test('other leagues come by their highest level character, each with its league as the label', () => {
  const prompt = buildCharacterPrompt({
    selectedId: 'a',
    league: 'Dawn',
    characters: [character('a', 80, 'Dawn'), character('b', 60, 'Dawn'), character('hc', 70, 'Hardcore'), character('std', 92, 'Standard')]
  });

  assert.deepEqual(ids(prompt), ['a', 'std', 'hc', 'b']);
  assert.deepEqual(prompt.characters.map((entry) => entry.league), [null, 'Standard', 'Hardcore', null]);
  assert.equal(prompt.shownCount, 4);
});

function loadPlayPrompt({ characters, confirmed, tracker, lastPlayedByLeague }) {
  const prompts = [];
  const state = {
    account: accountStateModel.deriveAccountState({
      activePoeVersion: 'poe2',
      characters: characters.map((entry) => ({ ...entry, poeVersion: 'poe2' })),
      cachedAccountState: { confirmedCharacterByGame: { poe2: confirmed }, lastPlayedByLeague }
    })
  };
  const context = loadFunctions(appSource, ['handleGameSessionEntered'], {
    state,
    characterReconcileTimer: null,
    CHARACTER_RECONCILE_DELAY_MS: 660000,
    setTimeout: () => 1,
    clearTimeout: () => {},
    normalizePoeVersion: (value) => value === 'poe1' || value === 'poe2' ? value : null,
    refreshAccountStateFromCurrentUser: () => {},
    renderCharacterSummaryCard: () => {},
    refreshRendererOverlayState: () => {},
    getAccountStateModel: () => accountStateModel,
    ...(tracker ? { getSelectedTrackerContext: () => tracker } : {}),
    window: { electronAPI: { showCharacterPromptOverlay: async (prompt) => { prompts.push(plain(prompt)); } } }
  });
  context.handleGameSessionEntered({ poeVersion: 'poe2' });
  return prompts;
}

test('Play asks with the last played character league and sends the chip count', () => {
  const prompts = loadPlayPrompt({
    characters: [character('a', 80, 'Dawn'), character('b', 90, 'Dawn'), character('std', 99, 'Standard')],
    confirmed: 'a',
    tracker: { poeVersion: 'poe2', league: 'Standard' }
  });

  assert.equal(prompts.length, 1);
  assert.equal(prompts[0].poeVersion, 'poe2');
  assert.equal(prompts[0].selectedId, 'a');
  assert.equal(prompts[0].shownCount, 3);
  assert.deepEqual(ids(prompts[0]), ['a', 'std', 'b']);
});

test('Play offers the last played character of each other league from the account cache', () => {
  const prompts = loadPlayPrompt({
    characters: [character('a', 80, 'Rites'), character('r2', 90, 'Rites'), character('aldur1', 95, 'Runes of Aldur'), character('aldur2', 20, 'Runes of Aldur')],
    confirmed: 'a',
    lastPlayedByLeague: { poe2: { 'runes of aldur': 'aldur2' } }
  });

  assert.deepEqual(ids(prompts[0]), ['a', 'aldur2', 'r2', 'aldur1']);
  assert.equal(prompts[0].shownCount, 3);
  assert.equal(prompts[0].characters[1].league, 'Runes of Aldur');
});

test('Play falls back to the Dashboard league of the same game, and asks when another league has the choice', () => {
  const characters = [character('a', 80, null), character('b', 90, 'Dawn'), character('c', 70, 'Dawn')];

  const prompts = loadPlayPrompt({ characters, confirmed: 'a', tracker: { poeVersion: 'poe2', league: 'dawn' } });
  assert.deepEqual(ids(prompts[0]), ['a', 'b', 'c']);
  assert.equal(prompts[0].shownCount, 3);

  // The Dashboard league of the other game says nothing about this one: every character by level.
  const otherGame = loadPlayPrompt({ characters, confirmed: 'a', tracker: { poeVersion: 'poe1', league: 'Standard' } });
  assert.deepEqual(ids(otherGame[0]), ['b', 'a', 'c']);

  const otherLeague = loadPlayPrompt({
    characters: [character('a', 80, 'Dawn'), character('std', 99, 'Standard')],
    confirmed: 'a',
    tracker: { poeVersion: 'poe2', league: 'Standard' }
  });
  assert.deepEqual(ids(otherLeague[0]), ['a', 'std']);
  assert.equal(otherLeague[0].shownCount, 2);

  const single = loadPlayPrompt({ characters: [character('a', 80, 'Dawn')], confirmed: 'a', tracker: { poeVersion: 'poe2', league: 'Dawn' } });
  assert.deepEqual(single, []);
});

function loadCharacterPromptMain() {
  const context = loadFunctions(mainSource, [
    'normalizeOverlayCharacter',
    'clearCharacterPromptOverlay',
    'showCharacterPromptOverlay',
    'chooseCharacterPromptOverlay'
  ], {
    overlayCharacterPromptState: null,
    overlayCharacterPromptTimer: null,
    CHARACTER_PROMPT_OVERLAY_DURATION_MS: 8000,
    normalizePoeVersion: (value) => value === 'poe1' || value === 'poe2' ? value : null,
    updateOverlayWindow: () => null,
    setTimeout: () => 1,
    clearTimeout: () => {},
    mainWindow: { isDestroyed: () => false, webContents: { send() {} } }
  });
  return context;
}

test('main keeps the chip count and each character league, and a pick from the whole list still counts', () => {
  const context = loadCharacterPromptMain();
  const prompt = buildCharacterPrompt({
    selectedId: 'a',
    league: 'Dawn',
    characters: [character('a', 80, 'Dawn'), character('b', 90, 'Dawn'), character('std', 99, 'Standard')]
  });

  context.showCharacterPromptOverlay({ poeVersion: 'poe2', ...prompt });
  const held = plain(context.overlayCharacterPromptState);
  assert.equal(held.shownCount, 3);
  assert.deepEqual(held.characters.map((entry) => entry.league), [null, 'Standard', null]);

  assert.deepEqual(plain(context.chooseCharacterPromptOverlay({ characterId: 'std' })), { poeVersion: 'poe2', characterId: 'std' });
});

test('main shows every chip when the count is missing or out of range', () => {
  const context = loadCharacterPromptMain();
  const characters = [character('a', 80, 'Dawn'), character('b', 90, 'Dawn')];

  for (const shownCount of [undefined, 0, -1, 2.5, 'x', 99]) {
    context.showCharacterPromptOverlay({ poeVersion: 'poe2', selectedId: 'a', characters, shownCount });
    assert.equal(context.overlayCharacterPromptState.shownCount, 2, String(shownCount));
  }
});

test('the overlay state carries the chip count and the league labels', () => {
  const state = overlayStateModel.deriveOverlayState({
    enabled: true,
    characterPrompt: {
      poeVersion: 'poe2',
      selectedId: 'a',
      shownCount: 2,
      characters: [character('a', 80, null), character('b', 90, null), character('std', 99, 'Standard')]
    }
  });

  assert.equal(state.mode, 'character-prompt');
  assert.equal(state.characterPrompt.shownCount, 2);
  assert.deepEqual(state.characterPrompt.characters.map((entry) => entry.league), [null, null, 'Standard']);

  const legacy = overlayStateModel.deriveOverlayState({
    enabled: true,
    characterPrompt: { selectedId: 'a', characters: [character('a', 80, null), character('b', 90, null)] }
  });
  assert.equal(legacy.characterPrompt.shownCount, 2);
});

// A fake element with just what renderCharacterForm and the chip clicks use.
function createElement() {
  const element = {
    textContent: '',
    hidden: false,
    dataset: {},
    innerHTML: '',
    listeners: {},
    setAttribute() {},
    removeAttribute() {},
    getAttribute() { return null; },
    addEventListener(type, listener) { element.listeners[type] = listener; },
    replaceChildren() {},
    append() {},
    prepend() {},
    querySelectorAll: () => []
  };
  return element;
}

function loadOverlay() {
  const selectors = [
    '[data-overlay-state]', '[data-overlay-kicker-label]', '[data-overlay-primary]', '[data-overlay-secondary]',
    '[data-overlay-meta]', '[data-overlay-character-form]', '[data-overlay-characters]', '[data-overlay-character-more]'
  ];
  const elements = Object.fromEntries(selectors.map((selector) => [selector, createElement()]));
  const picks = [];
  const window = {
    overlayStateModel,
    profitCurrencyModel: require('../src/modules/profitCurrencyModel'),
    profitTierModel: require('../src/modules/profitTierModel'),
    mapResultOverlayModel: require('../src/modules/mapResultOverlayModel'),
    electronAPI: { chooseCharacterPromptOverlay: (payload) => { picks.push(payload); return Promise.resolve(null); } }
  };
  const context = vm.createContext({
    window,
    document: {
      readyState: 'complete',
      documentElement: {},
      querySelector: (selector) => elements[selector] || null,
      querySelectorAll: () => [],
      createElement
    },
    Date,
    setInterval: () => 1,
    clearInterval: () => {}
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'modules', 'translations.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'overlay.js'), 'utf8'), context);

  const chips = elements['[data-overlay-characters]'];
  const more = elements['[data-overlay-character-more]'];
  // Reads the chips back from the HTML the renderer wrote; More is a button of its own beside Keep.
  const read = () => [...chips.innerHTML.matchAll(/<button[^>]*?data-character-id="([^"]*)"[^>]*>(.*?)<\/button>/g)]
    .map((match) => match[1] + '|' + match[2].replace(/<[^>]+>/g, ''))
    .concat(more.hidden ? [] : ['MORE']);
  const click = (attribute, value) => (attribute === 'data-character-more'
    ? more.listeners.click()
    : chips.listeners.click({
      target: { closest: (selector) => (selector === `[${attribute}]` ? { getAttribute: () => value } : null) }
    }));
  return { window, read, click, picks };
}

function characterPromptState(language = 'en') {
  const prompt = buildCharacterPrompt({
    selectedId: 'a',
    league: 'Dawn',
    characters: [
      ...Array.from({ length: 7 }, (_, index) => character(index ? `d${index}` : 'a', 90 - index, 'Dawn')),
      character('std', 92, 'Standard')
    ]
  });
  return {
    ...overlayStateModel.deriveOverlayState({ enabled: true, characterPrompt: { poeVersion: 'poe2', ...prompt }, language }),
    language
  };
}

test('the overlay draws six chips and More, then the whole list with other leagues labelled', () => {
  const overlay = loadOverlay();
  const state = characterPromptState();

  overlay.window.JuiceOverlay.renderState(state);
  assert.deepEqual(overlay.read(), ['a|A 90', 'std|STD 92· Standard', 'd1|D1 89', 'd2|D2 88', 'd3|D3 87', 'd4|D4 86', 'MORE']);

  overlay.click('data-character-more');
  assert.deepEqual(overlay.read(), [
    'a|A 90', 'std|STD 92· Standard', 'd1|D1 89', 'd2|D2 88', 'd3|D3 87', 'd4|D4 86', 'd5|D5 85', 'd6|D6 84'
  ]);
  assert.deepEqual(overlay.picks, []);

  // A state push for the same prompt keeps the list open; a pick goes to main as before.
  overlay.window.JuiceOverlay.renderState(state);
  assert.equal(overlay.read().length, 8);
  overlay.click('data-character-id', 'std');
  assert.deepEqual(plain(overlay.picks), [{ characterId: 'std' }]);
});

test('the overlay closes the list again for the next prompt, and More is a button beside Keep', () => {
  const overlay = loadOverlay();

  overlay.window.JuiceOverlay.renderState(characterPromptState());
  overlay.click('data-character-more');
  overlay.window.JuiceOverlay.renderState({ visibility: 'hidden', mode: 'runtime' });
  overlay.window.JuiceOverlay.renderState(characterPromptState('tr'));

  assert.equal(overlay.read().length, 7);
  assert.equal(overlay.read().at(-1), 'MORE');
  // Its label comes from the page's data-i18n, as Keep's does.
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'overlay.html'), 'utf8');
  assert.match(html, /<button class="jj-form-btn" type="button" data-overlay-character-more data-i18n="overlay.moreCharacters" hidden>More<\/button>\s*<button class="jj-form-btn primary" type="button" data-overlay-character-keep/);
});

test('the overlay keeps the chip row padding that holds a pressed chip', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'overlay.html'), 'utf8');
  assert.match(html, /\.jj-chips \{[^}]*padding-bottom: 1px;/);
  assert.match(html, /\.jj-chip-league \{/);
});
