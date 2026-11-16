const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { COACH_STEPS, COACH_OVERLAY_MESSAGES, deriveCoach } = require('../src/modules/coachModel');
const InventoryWatcher = require('../src/modules/inventoryWatcher');

const desktopDir = path.join(__dirname, '..');
// Objects made inside a vm context have that context's prototypes, so they are compared as plain data.
const plain = (value) => JSON.parse(JSON.stringify(value));
const read = (...parts) => fs.readFileSync(path.join(desktopDir, ...parts), 'utf8');
const mainJs = read('main.js');
const appJs = read('src', 'app.js');

// Named top-level functions of a source file, run in a context that supplies what they reach for.
function loadFunctions(source, names, context) {
  const code = names.map((name) => {
    const start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `${name} not found`);
    const end = source.indexOf('\n}', start);
    return source.slice(start, end + 2);
  }).join('\n');
  vm.createContext(context);
  vm.runInContext(code, context);
  return context;
}

function loadTranslations() {
  const window = {};
  const context = vm.createContext({ window, document: { querySelectorAll: () => [], documentElement: {} }, console });
  vm.runInContext(read('src', 'modules', 'translations.js'), context);
  return window;
}

function createWatcher(overrides = {}) {
  const calls = { priced: 0 };
  const watcher = new InventoryWatcher({
    isEnabled: () => true,
    getProfileId: () => 'profile-1',
    getGame: () => 'poe2',
    isGameInFront: () => false,
    isInMap: () => false,
    isInMapHub: () => true,
    getGameWindow: () => null,
    readScreen: () => null,
    getCharacter: () => ({ id: 'char-1', name: 'Coached' }),
    listPricedItems: () => {
      calls.priced += 1;
      return { complete: true, items: [] };
    },
    getIconPath: () => null,
    loadArt: () => null,
    onGain() {},
    onStatus() {},
    onRead() {},
    now: () => 1000,
    ...overrides
  });
  return { watcher, calls };
}

test('every step and every message the model can return has its text in English and in Turkish', () => {
  const { Translations } = loadTranslations();
  const messages = new Set();
  const flags = ['done', 'hidden', 'readingEnabled', 'hasCharacter', 'windowUnmeasured', 'artReady', 'inMap', 'inHub', 'hasBaseline', 'mapWaiting'];
  // Every combination of the facts, for each game.
  for (const game of [null, 'poe1', 'poe2']) {
    for (let bits = 0; bits < 2 ** flags.length; bits += 1) {
      const facts = Object.fromEntries(flags.map((flag, index) => [flag, Boolean(bits & (1 << index))]));
      const coach = deriveCoach({ ...facts, game });
      if (coach) messages.add(coach.message);
    }
  }
  assert.deepEqual([...messages].sort(), [
    'character', 'count', 'countInHideout', 'done', 'game', 'goHideout', 'inMap', 'loading', 'mapUncounted', 'openInventory',
    'poe1', 'readingOff', 'resolution', 'runMap'
  ]);

  const keys = [
    'coach.title', 'coach.progress', 'coach.kicker', 'coach.hide', 'coach.doneTag', 'coach.showAgain',
    ...COACH_STEPS.map((step) => `coach.step.${step}`),
    ...[...messages].map((message) => `coach.msg.${message}`)
  ];
  for (const key of keys) {
    assert.ok(Translations.en[key], `en ${key}`);
    assert.ok(Translations.tr[key], `tr ${key}`);
    assert.notEqual(Translations.tr[key], Translations.en[key], `tr ${key} is its own text`);
  }
  // The overlay shows a message's first sentence as the headline, so each one has a short first sentence.
  // The game step, the Path of Exile 1 note and the done card show on the Dashboard only.
  for (const message of [...messages].filter((name) => !['game', 'poe1', 'done'].includes(name))) {
    for (const language of ['en', 'tr']) {
      const [headline] = Translations[language][`coach.msg.${message}`].split('. ');
      assert.ok(headline.length <= 48, `${language} coach.msg.${message} headline is ${headline.length} long`);
    }
  }
});

test('the watcher says what reading still waits for, and loads prices and art without the game in front', () => {
  const { watcher, calls } = createWatcher();
  assert.deepEqual(watcher.getReadiness('poe2'), {
    hasCharacter: true, windowUnmeasured: false, artReady: false, hasBaseline: false, mapWaiting: false
  });

  // A tick does nothing while another window is in front; prepare loads all the same.
  watcher.tick();
  assert.equal(calls.priced, 0);
  watcher.prepare('poe2');
  assert.equal(calls.priced, 1);
  assert.equal(watcher.getReadiness('poe2').artReady, true);
  // Another game's art is not this game's.
  assert.equal(watcher.getReadiness('poe1').artReady, false);

  // Path of Exile 1 has no layout to read, a switched-off reader loads nothing, and no character is said so.
  const idle = createWatcher({ isEnabled: () => false });
  idle.watcher.prepare('poe2');
  assert.equal(idle.calls.priced, 0);
  const poe1 = createWatcher();
  poe1.watcher.prepare('poe1');
  assert.equal(poe1.calls.priced, 0);
  assert.equal(createWatcher({ getCharacter: () => null }).watcher.getReadiness('poe2').hasCharacter, false);
});

test('main keeps the steps per profile and tells the window and the overlay when the step changes', () => {
  const stored = {};
  const statuses = [];
  const sent = [];
  let overlayUpdates = 0;
  let prepared = 0;
  let readiness = { hasCharacter: true, windowUnmeasured: false, artReady: false, hasBaseline: false, mapWaiting: false };
  let profile = { id: 'profile-1' };
  const context = loadFunctions(mainJs, [
    'getCoachStoreKey', 'getCoachRecord', 'setCoachRecord', 'buildCoachState', 'isCoachGuiding', 'refreshCoach', 'completeCoach', 'setCoachHidden',
    'coachOverlayState'
  ], {
    coachState: null,
    coachResolutionTold: false,
    deriveCoach,
    COACH_OVERLAY_MESSAGES,
    console: { warn() {} },
    showInventoryStatus: (kind) => statuses.push(kind),
    store: { get: (key) => stored[key], set: (key, value) => { stored[key] = value; }, delete: (key) => { delete stored[key]; } },
    readParsedSetting: (key) => stored[key],
    getActiveProfile: () => profile,
    gameDetector: { getDetectedGame: () => 'poe2' },
    inventoryWatcher: { getReadiness: () => readiness, prepare: () => { prepared += 1; } },
    logParser: { currentMap: null, isInMapHub: () => true },
    mainWindow: { isDestroyed: () => false, webContents: { send: (channel, payload) => sent.push([channel, payload && payload.message]) } },
    updateOverlayWindow: () => { overlayUpdates += 1; },
    isOverlayEnabled: () => true,
    currentSession: null
  });

  // Prices and art are loaded from the refresh while the steps wait for them.
  context.refreshCoach();
  assert.deepEqual(sent, [['coach-state', 'loading']]);
  assert.equal(prepared, 1);
  context.refreshCoach();
  assert.equal(sent.length, 1, 'an unchanged step is not sent again');
  assert.equal(prepared, 2);

  readiness = { ...readiness, artReady: true };
  context.refreshCoach();
  assert.deepEqual(sent.at(-1), ['coach-state', 'openInventory']);
  assert.equal(prepared, 2);
  assert.equal(overlayUpdates, 2);

  // The overlay shows the step in place of its idle card only: not over a card with a mode of its own or a running map.
  const idle = { visibility: 'visible', primaryLine: 'Coached' };
  assert.deepEqual(JSON.parse(JSON.stringify(context.coachOverlayState(idle))), {
    visibility: 'visible', mode: 'coach', coach: { step: 'inventory', index: 3, total: 5, message: 'openInventory', status: 'do' }
  });
  const prompt = { visibility: 'visible', mode: 'start-map-prompt' };
  assert.equal(context.coachOverlayState(prompt), prompt);
  context.currentSession = { id: 'run-1' };
  assert.equal(context.coachOverlayState(idle), idle);
  context.currentSession = null;
  context.isOverlayEnabled = () => false;
  assert.equal(context.coachOverlayState(idle), idle);

  // A counted map ends the steps for this profile; the done card stays until it is hidden.
  context.completeCoach();
  assert.deepEqual(plain(stored), { 'firstMapCoach:profile-1': 'done' });
  assert.deepEqual(sent.at(-1), ['coach-state', 'done']);
  assert.equal(context.isCoachGuiding(), false);
  context.completeCoach();
  assert.deepEqual(plain(stored), { 'firstMapCoach:profile-1': 'done' });

  assert.equal(context.setCoachHidden(true), null);
  assert.deepEqual(plain(stored), { 'firstMapCoach:profile-1': 'hidden' });
  context.completeCoach();
  assert.deepEqual(plain(stored), { 'firstMapCoach:profile-1': 'hidden' }, 'hidden steps stay hidden');

  // The Guide's button starts them again from the top; another profile has its own.
  assert.equal(context.setCoachHidden(false).message, 'openInventory');
  assert.deepEqual(plain(stored), {});
  profile = { id: 'profile-2' };
  context.setCoachHidden(true);
  assert.deepEqual(plain(stored), { 'firstMapCoach:profile-2': 'hidden' });

  // Signed out, there is nothing to show.
  profile = null;
  context.refreshCoach();
  assert.deepEqual(sent.at(-1), ['coach-state', null]);
  assert.equal(context.coachState, null);
});

test('the steps take the first-read hint\'s place while they lead, and a counted map completes them', () => {
  const hint = mainJs.slice(mainJs.indexOf('function maybeShowFirstReadNudge('), mainJs.indexOf('\n}', mainJs.indexOf('function maybeShowFirstReadNudge(')));
  assert.match(hint, /\|\| \(typeof isCoachGuiding === 'function' && isCoachGuiding\(\)\)/);
  assert.match(mainJs, /if \(\(kind === 'gain' \|\| kind === 'noGain'\) && typeof completeCoach === 'function'\) \{\r?\n\s+completeCoach\(\);/);
  assert.match(mainJs, /inventoryWatcher = createInventoryWatcher\(\);\r?\n\s+startCoach\(\);/);
  assert.match(mainJs, /ipcMain\.handle\('set-coach-hidden', \(event, hidden\) => setCoachHidden\(hidden === true\)\);/);
});

test('the Dashboard card lights the current step on its rail, fills the flask and says what the step waits for', () => {
  const classes = new Set(['hidden']);
  const properties = {};
  const messageClasses = [];
  const elements = {
    coachCard: {
      dataset: {},
      classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) },
      style: { setProperty: (name, value) => { properties[name] = value; } }
    },
    coachProgress: { textContent: '' },
    coachSteps: { innerHTML: '' },
    coachCoins: Array.from({ length: 12 }, () => {
      const coin = { inFlask: false, classList: { toggle: (name, on) => { if (name === 'is-in') coin.inFlask = on; } } };
      return coin;
    }),
    coachMessage: { textContent: '', offsetWidth: 0, classList: { add: (name) => messageClasses.push(`+${name}`), remove: (name) => messageClasses.push(`-${name}`) } }
  };
  const context = loadFunctions(appJs, ['setCoachState', 'renderCoach', 'handleCoachStepClick'], {
    elements,
    state: {},
    window: { t: (key, values) => (values ? `${key}:${values.step}/${values.total}` : key), coachModel: { COACH_STEPS } },
    escapeHTML: (value) => String(value)
  });
  vm.runInContext(appJs.match(/const COACH_STEP_MESSAGES = \{[^}]*\};/)[0].replace('const ', 'globalThis.'), context);
  vm.runInContext(appJs.match(/const COACH_STEP_PILE = \[[^\]]*\];/)[0].replace('const ', 'globalThis.'), context);
  // The pile fills from the bottom: the pieces in the flask are always the first ones.
  const inFlask = () => {
    const count = elements.coachCoins.filter((coin) => coin.inFlask).length;
    assert.ok(elements.coachCoins.slice(0, count).every((coin) => coin.inFlask));
    return count;
  };
  const rail = () => [...elements.coachSteps.innerHTML.matchAll(
    /<li data-step-state="(\w+)"><button type="button" class="coach-node" data-coach-step="(\w+)"( aria-current="step")? aria-pressed="(true|false)"><span class="coach-node-mark" aria-hidden="true">(\d?)<\/span><span class="coach-node-name">([^<]+)<\/span><\/button><\/li>/g
  )].map(([, stepState, id, current, pressed, number, name]) => [stepState, id, Boolean(current), pressed === 'true', number, name]);
  const press = (step) => context.handleCoachStepClick({ target: { closest: () => ({ getAttribute: () => step }) } });

  context.setCoachState({ step: 'inventory', index: 3, total: 5, message: 'openInventory', status: 'do' });
  assert.equal(classes.has('hidden'), false);
  assert.equal(elements.coachCard.dataset.coachStatus, 'do');
  assert.equal(elements.coachProgress.textContent, 'coach.progress:3/5');
  assert.equal(elements.coachMessage.textContent, 'coach.msg.openInventory');
  // A done step shows a tick in place of its number.
  assert.deepEqual(rail(), [
    ['done', 'game', false, false, '', 'coach.step.game'],
    ['done', 'ready', false, false, '', 'coach.step.ready'],
    ['current', 'inventory', true, false, '3', 'coach.step.inventory'],
    ['todo', 'map', false, false, '4', 'coach.step.map'],
    ['todo', 'count', false, false, '5', 'coach.step.count']
  ]);
  // The flask is half full at the third step, and the rail is filled up to it.
  assert.deepEqual(properties, { '--coach-fill': '0.5', '--coach-rail': '0.5' });
  // The sentence comes in again only when it changes.
  assert.deepEqual(messageClasses, ['-is-in', '+is-in']);
  context.renderCoach();
  assert.deepEqual(messageClasses, ['-is-in', '+is-in']);

  // Pressing another step reads what it is about, without moving the player's own step.
  press('map');
  assert.equal(elements.coachMessage.textContent, 'coach.msg.runMap');
  assert.equal(elements.coachCard.dataset.coachPeek, 'true');
  assert.deepEqual(rail().map((step) => [step[0], step[3]]), [['done', false], ['done', false], ['current', false], ['todo', true], ['todo', false]]);
  // The flask shows itself as it is at that step; the rail stays where the player is.
  assert.deepEqual(properties, { '--coach-fill': '0.7', '--coach-rail': '0.5' });
  assert.equal(inFlask(), 10);
  // Pressing it again goes back, and so does pressing the current step.
  press('map');
  assert.equal(elements.coachMessage.textContent, 'coach.msg.openInventory');
  assert.equal(elements.coachCard.dataset.coachPeek, 'false');
  assert.deepEqual(properties, { '--coach-fill': '0.5', '--coach-rail': '0.5' });
  assert.equal(inFlask(), 5);
  press('game');
  assert.equal(elements.coachMessage.textContent, 'coach.msg.game');
  press('inventory');
  assert.equal(elements.coachMessage.textContent, 'coach.msg.openInventory');
  assert.equal(elements.coachCard.dataset.coachPeek, 'false');

  // A new step from main ends a look at another one; the same step sent again does not.
  press('count');
  context.setCoachState({ step: 'inventory', index: 3, total: 5, message: 'openInventory', status: 'do' });
  assert.equal(elements.coachMessage.textContent, 'coach.msg.count');
  context.setCoachState({ step: 'map', index: 4, total: 5, message: 'runMap', status: 'do' });
  assert.equal(elements.coachMessage.textContent, 'coach.msg.runMap');
  assert.equal(elements.coachCard.dataset.coachPeek, 'false');
  assert.deepEqual(properties, { '--coach-fill': '0.7', '--coach-rail': '0.75' });
  // Currency lies in the flask by the step: a few pieces while getting ready, most of them once the map runs. A step
  // back takes the later pieces out again.
  assert.equal(inFlask(), 10);
  context.setCoachState({ step: 'inventory', index: 3, total: 5, message: 'openInventory', status: 'do' });
  assert.equal(inFlask(), 5);
  context.setCoachState({ step: 'ready', index: 2, total: 5, message: 'loading', status: 'wait' });
  assert.equal(inFlask(), 3);
  context.setCoachState({ step: 'game', index: 1, total: 5, message: 'game', status: 'do' });
  assert.equal(inFlask(), 1);
  context.setCoachState({ step: 'count', index: 5, total: 5, message: 'count', status: 'do' });
  assert.equal(inFlask(), 12);

  context.setCoachState({ step: 'done', index: 5, total: 5, message: 'done', status: 'done' });
  assert.equal(elements.coachProgress.textContent, 'coach.doneTag');
  assert.deepEqual(rail().map((step) => step[0]), ['done', 'done', 'done', 'done', 'done']);
  assert.deepEqual(properties, { '--coach-fill': '1', '--coach-rail': '1' });
  assert.equal(inFlask(), 12);

  // Path of Exile 1 gets its note with no steps; nothing to show hides the card.
  context.setCoachState({ step: 'poe1', index: 0, total: 0, message: 'poe1', status: 'info' });
  assert.equal(elements.coachSteps.innerHTML, '');
  assert.equal(elements.coachMessage.textContent, 'coach.msg.poe1');
  context.setCoachState(null);
  assert.equal(classes.has('hidden'), true);
});

test('the card moves only where motion is welcome: the flask and the rail hold still with motion turned down', () => {
  const css = read('src', 'styles.css');
  // The app's one reduced-motion rule stops every animation and transition, the card's included.
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\r?\n  \*, \*::before, \*::after, select::picker-icon \{\r?\n    animation-duration: 0\.01ms !important;\r?\n    animation-iteration-count: 1 !important;\r?\n    transition-duration: 0\.01ms !important;/);
  assert.match(css, /\.coach-flask-level \{[^}]*transform: translateY\(calc\(55px - var\(--coach-fill\) \* 36px\)\);/);
  assert.match(css, /\.coach-steps::after \{[^}]*transform: scaleX\(var\(--coach-rail\)\);/);
  // The overlay sits over the game: its step bar moves once per step and nothing there loops.
  const overlay = read('src', 'overlay.html');
  const bar = overlay.match(/\.jj-card\[data-overlay-mode="coach"\]::after \{([^}]*)\}/)[1];
  assert.match(bar, /background-size: calc\(var\(--coach-progress, 0\) \* 100%\) 100%, 100% 100%;/);
  // The card's corners are cut: the bar runs between them, on a track, so it reads as part of the card.
  assert.match(bar, /left: var\(--bevel-lg\);/);
  assert.match(bar, /right: var\(--bevel-lg\);/);
  assert.doesNotMatch(bar, /width: 100%/);
  assert.doesNotMatch(overlay, /animation:[^;]*infinite/);
  for (const asset of ['flask-back.svg', 'flask-front.svg', 'flask-mask.svg', 'flask-wave.svg']) {
    assert.ok(fs.existsSync(path.join(desktopDir, 'src', 'assets', 'brand', asset)), asset);
  }
});

test('the pages load the model, show the card above the Dashboard and offer the steps again in the Guide', () => {
  const html = read('src', 'index.html');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((match) => match[1]);
  assert.ok(scripts.indexOf('modules/coachModel.js') !== -1 && scripts.indexOf('modules/coachModel.js') < scripts.indexOf('app.js'));
  assert.match(html, /<div class="coach-card hidden" id="coach-card"[\s\S]*?<div class="coach-mascot" aria-hidden="true">[\s\S]*?<div class="coach-flask-level"><\/div>[\s\S]*?(?:<img class="coach-coin" src="assets\/currency\/poe[12]\/[\w-]+\.(?:png|webp)" width="8" height="8" alt="">\s*){12}<img class="coach-flask-front" src="assets\/brand\/flask-front\.svg" width="64" height="64" alt="">\s*<\/div>\s*<img class="coach-cheer" src="assets\/brand\/reactions\/juiced\.svg" width="34" height="34" alt="">[\s\S]*?<button type="button" class="btn btn-ghost btn-small" id="coach-hide" data-i18n="coach\.hide">[\s\S]*?<div class="dashboard-grid">/);
  assert.match(html, /<button type="button" class="btn btn-link" id="guide-show-coach" data-i18n="coach\.showAgain">/);
  assert.ok(fs.existsSync(path.join(desktopDir, 'src', 'assets', 'brand', 'mark-small.svg')));
  // The currency in the flask is the app's own bundled icons, for both games.
  const coins = [...html.matchAll(/<img class="coach-coin" src="(assets\/currency\/[^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(coins).size, 12);
  for (const coin of coins) {
    assert.ok(fs.existsSync(path.join(desktopDir, 'src', coin)), coin);
  }
  assert.deepEqual([...new Set(coins.map((coin) => coin.split('/')[2]))].sort(), ['poe1', 'poe2']);

  const preload = read('preload.js');
  assert.match(preload, /getCoachState: \(\) => ipcRenderer\.invoke\('get-coach-state'\)/);
  assert.match(preload, /setCoachHidden: \(hidden\) => ipcRenderer\.invoke\('set-coach-hidden', hidden === true\)/);
  assert.match(preload, /'inventory-read-status', 'coach-state',/);
});

test('the overlay holds a step only when the player can act on it in the game', () => {
  assert.deepEqual(COACH_OVERLAY_MESSAGES, ['character', 'loading', 'goHideout', 'openInventory', 'runMap', 'count', 'countInHideout']);

  const statuses = [];
  let readiness = { hasCharacter: true, windowUnmeasured: true, artReady: true, hasBaseline: false, mapWaiting: false };
  let broken = false;
  const context = loadFunctions(mainJs, [
    'getCoachStoreKey', 'getCoachRecord', 'buildCoachState', 'isCoachGuiding', 'refreshCoach', 'coachOverlayState'
  ], {
    coachState: null,
    coachResolutionTold: false,
    deriveCoach,
    COACH_OVERLAY_MESSAGES,
    console: { warn() {} },
    showInventoryStatus: (kind) => statuses.push(kind),
    readParsedSetting: (key) => (key === 'inventoryReadEnabled' ? readiness.readingEnabled : undefined),
    getActiveProfile: () => ({ id: 'profile-1' }),
    gameDetector: { getDetectedGame: () => 'poe2' },
    inventoryWatcher: {
      getReadiness: () => {
        if (broken) throw new Error('window lookup failed');
        return readiness;
      },
      prepare() {}
    },
    logParser: { currentMap: null, isInMapHub: () => true },
    mainWindow: null,
    updateOverlayWindow() {},
    isOverlayEnabled: () => true,
    currentSession: null
  });
  const idle = { visibility: 'visible', primaryLine: 'Coached' };

  // A window at another size cannot be fixed from inside the game: the overlay keeps its own card and says it once.
  context.refreshCoach();
  assert.equal(context.coachState.message, 'resolution');
  assert.equal(context.coachOverlayState(idle), idle);
  assert.deepEqual(statuses, ['resolution']);
  readiness = { ...readiness, windowUnmeasured: false };
  context.refreshCoach();
  readiness = { ...readiness, windowUnmeasured: true };
  context.refreshCoach();
  assert.deepEqual(statuses, ['resolution'], 'once per run');

  // Reading turned off is the player's own setting, and a running map has the overlay's own card.
  readiness = { ...readiness, windowUnmeasured: false, readingEnabled: false };
  context.refreshCoach();
  assert.equal(context.coachState.message, 'readingOff');
  assert.equal(context.coachOverlayState(idle), idle);
  readiness = { ...readiness, readingEnabled: true, hasBaseline: true };
  context.logParser = { currentMap: { mapName: 'Strand' }, isInMapHub: () => false };
  context.refreshCoach();
  assert.equal(context.coachState.message, 'inMap');
  assert.equal(context.coachOverlayState(idle), idle);

  // A throw on the timer is logged and leaves the last step standing, instead of raising the error dialog every second.
  broken = true;
  assert.doesNotThrow(() => context.refreshCoach());
  assert.equal(context.coachState.message, 'inMap');
});

test('a map that ended with no read before it is not said to be waiting for its count', () => {
  const { watcher } = createWatcher();
  watcher.state = { baselines: {}, pending: { sessionId: 'run-1', characterKey: 'poe2:char-1', baseline: null }, mapsSinceRead: {} };
  assert.equal(watcher.getReadiness('poe2').mapWaiting, false);
  assert.deepEqual(
    [deriveCoach({ game: 'poe2', readingEnabled: true, inHub: true, ...watcher.getReadiness('poe2'), artReady: true }).message],
    ['openInventory']
  );

  watcher.state = { baselines: { 'poe2:char-1': { cells: {} } }, pending: { sessionId: 'run-1', characterKey: 'poe2:char-1', baseline: { cells: {} } }, mapsSinceRead: {} };
  assert.equal(watcher.getReadiness('poe2').mapWaiting, true);
  // Another character's finished map is not this one's.
  watcher.state.pending.characterKey = 'poe2:other';
  assert.equal(watcher.getReadiness('poe2').mapWaiting, false);
});

test('the steps are wired where no extracted function can show a slip: the overlay guard, the window\'s settings and the quit', () => {
  assert.match(mainJs, /return typeof coachOverlayState === 'function' \? coachOverlayState\(overlayState\) : overlayState;/);
  assert.match(mainJs, /function coachOverlayState\(overlayState\) \{/);
  assert.match(mainJs, /key\.startsWith\('farmTypeCosts:'\) \|\| key\.startsWith\('firstMapCoach:'\)\)/);
  assert.match(mainJs, /if \(coachTimer\) \{\r?\n\s+clearInterval\(coachTimer\);\r?\n\s+coachTimer = null;/);
  assert.match(mainJs, /overlayState\.mode === 'coach' \? 150 : 112;/);
});
