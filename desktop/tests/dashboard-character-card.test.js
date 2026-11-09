const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const desktopDir = path.resolve(__dirname, '..');
const indexHtmlPath = path.join(desktopDir, 'src', 'index.html');
const appJsPath = path.join(desktopDir, 'src', 'app.js');
const stylesPath = path.join(desktopDir, 'src', 'styles.css');

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}`;
  const startIndex = source.indexOf(signature);
  // An async function keeps its keyword, or its body could not await.
  const sourceStart = source.slice(startIndex - 6, startIndex) === 'async ' ? startIndex - 6 : startIndex;

  if (startIndex === -1) {
    assert.fail(`Expected app.js to define ${functionName}()`);
  }

  let bodyStartIndex = -1;
  let parenDepth = 0;
  let seenParamList = false;

  for (let index = startIndex + signature.length; index < source.length; index += 1) {
    const char = source[index];

    if (char === '(') {
      parenDepth += 1;
      continue;
    }

    if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        seenParamList = true;
      }
      continue;
    }

    if (seenParamList && char === '{') {
      bodyStartIndex = index;
      break;
    }
  }

  if (bodyStartIndex === -1) {
    assert.fail(`Unable to locate ${functionName}() body in app.js`);
  }

  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inTemplateString = false;
  let inLineComment = false;
  let inBlockComment = false;
  let escaped = false;

  for (let index = bodyStartIndex; index < source.length; index += 1) {
    const char = source[index];
    const nextChar = source[index + 1];

    if (inLineComment) {
      if (char === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inSingleQuote) {
      if (!escaped && char === '\'') inSingleQuote = false;
      escaped = !escaped && char === '\\';
      continue;
    }

    if (inDoubleQuote) {
      if (!escaped && char === '"') inDoubleQuote = false;
      escaped = !escaped && char === '\\';
      continue;
    }

    if (inTemplateString) {
      if (!escaped && char === '`') inTemplateString = false;
      escaped = !escaped && char === '\\';
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (char === '\'') {
      inSingleQuote = true;
      escaped = false;
      continue;
    }

    if (char === '"') {
      inDoubleQuote = true;
      escaped = false;
      continue;
    }

    if (char === '`') {
      inTemplateString = true;
      escaped = false;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(sourceStart, index + 1);
      }
    }
  }

  assert.fail(`Unable to parse ${functionName}() from app.js`);
}

function loadFunctions(functionNames, contextOverrides = {}) {
  const source = fs.readFileSync(appJsPath, 'utf8');
  const context = vm.createContext({
    console,
    ...contextOverrides
  });

  for (const functionName of functionNames) {
    const functionSource = extractFunctionSource(source, functionName);
    vm.runInContext(`${functionSource};\nthis.${functionName} = ${functionName};`, context);
  }

  return context;
}

test('dashboard html exposes hero banner targets for the character summary card', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.match(html, /id="character-summary-card"/);
  assert.match(html, /class="character-banner"/);
  assert.match(html, /id="character-banner"/);
  assert.match(html, /id="character-banner-image"/);
  assert.match(html, /class="character-hero"/);
  assert.match(html, /class="character-hero-copy"/);
  assert.match(html, /class="character-portrait-shell"/);
  assert.match(html, /id="character-portrait-image"/);
  assert.match(html, /id="character-name"/);
  assert.match(html, /id="character-class"/);
  assert.match(html, /id="character-level"/);
  assert.match(html, /id="character-league"/);
});

test('character card stylesheet defines banner art and hero layout rules', () => {
  const css = fs.readFileSync(stylesPath, 'utf8');

  assert.match(css, /\.character-banner/);
  assert.match(css, /\.character-banner-scrim/);
  assert.match(css, /\.character-hero/);
  assert.match(css, /\.character-portrait-shell/);
});

test('character portrait slot keeps PoE1 class art centered in a square circular crop', () => {
  const css = fs.readFileSync(stylesPath, 'utf8');

  assert.match(css, /\.character-portrait-shell\s*\{[^}]*aspect-ratio:\s*1;/s);
  assert.match(css, /\.character-portrait-shell\s*\{[^}]*border-radius:\s*50%;/s);
  assert.match(css, /\.character-portrait-shell\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.character-portrait-shell img\s*\{[^}]*width:\s*100%;/s);
  assert.match(css, /\.character-portrait-shell img\s*\{[^}]*height:\s*100%;/s);
  assert.match(css, /\.character-portrait-shell img\s*\{[^}]*object-fit:\s*cover;/s);
  assert.match(css, /\.character-portrait-shell img\s*\{[^}]*object-position:\s*center top;/s);
});

test('character banner and portrait art are never recoloured', () => {
  const css = fs.readFileSync(stylesPath, 'utf8');

  for (const selector of [/\.character-banner > img\s*\{[^}]*\}/, /\.character-portrait-shell img\s*\{[^}]*\}/]) {
    const [rule] = css.match(selector) || [''];
    assert.ok(rule, String(selector));
    assert.doesNotMatch(rule, /filter:/, rule);
  }
});

test('dashboard hero shows class, league and game chips instead of a meta grid', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  assert.doesNotMatch(html, /character-meta-grid|id="character-(level-meta|class-meta|account)"|data-i18n="dashboard\.characterSummary"/);
  assert.match(html, /id="character-summary-card" role="region" data-i18n-aria="dashboard\.characterSummary"/);

  const [chips] = html.match(/<div class="character-chips">[\s\S]*?<\/div>/) || [''];
  assert.match(chips, /id="character-class"/);
  assert.match(chips, /id="character-league"/);
  assert.match(chips, /id="character-game-version"/);
});

test('hero chips keep English casing for GGG names under any UI language', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');

  // Uppercased under lang="tr", 'Witch' would read 'WİTCH'.
  for (const id of ['character-class', 'character-league', 'character-game-version']) {
    assert.match(html, new RegExp(`<span class="character-chip" id="${id}" lang="en">`), id);
  }
});

test('hero banner art is right-anchored, masked and slim', () => {
  const css = fs.readFileSync(stylesPath, 'utf8');

  const [img] = css.match(/\.character-banner > img\s*\{[^}]*\}/) || [''];
  assert.match(img, /inset:\s*0 0 0 auto;/);
  assert.match(img, /width:\s*58%;/);
  assert.match(img, /mask-image:\s*linear-gradient\(90deg,\s*transparent/);
  assert.match(css, /\.character-banner\s*\{[^}]*min-height:\s*176px;/);
  assert.match(css, /\.character-hero\s*\{[^}]*min-height:\s*176px;/);
  assert.match(css, /\.character-portrait-shell\s*\{[^}]*width:\s*112px;/);
});

test('hero chips never blur the art behind them', () => {
  const css = fs.readFileSync(stylesPath, 'utf8');

  const [chip] = css.match(/\.character-chip\s*\{[^}]*\}/) || [''];
  assert.ok(chip);
  assert.doesNotMatch(chip, /backdrop-filter|filter:/);
});

test('empty character card hides the class and league chips', () => {
  const css = fs.readFileSync(stylesPath, 'utf8');

  assert.match(css, /\.character-card\[data-character-state="empty"\] :is\(#character-class, #character-league\)\s*\{\s*display:\s*none;/);
});

test('renderer fills hero banner artwork and chips from normalized account state', () => {
  const elements = {
    characterSummaryCard: { dataset: {} },
    characterBanner: { dataset: {} },
    characterBannerImage: {
      src: '',
      hidden: true,
      alt: ''
    },
    characterPortrait: { dataset: {} },
    characterPortraitImage: {
      src: '',
      hidden: true,
      alt: ''
    },
    characterPortraitBadge: { textContent: '', style: {} },
    characterName: { textContent: '' },
    characterClass: { textContent: '' },
    characterLevel: { textContent: '' },
    characterLeague: { textContent: '' },
    characterStatus: { textContent: '' },
    characterGameVersion: { textContent: '' }
  };
  const context = loadFunctions(['renderCharacterSummaryCard', 'getPoeDeviceNote', 'formatPoeDeviceEnd'], {
    elements,
    state: {
      currentUser: { username: 'FallbackUser' },
      account: {
        accountName: 'KocaGyVeMasha',
        summary: {
          status: 'ready',
          name: 'KocaGyVeMasha',
          level: 96,
          className: 'Druid',
          ascendancy: 'Shaman',
          league: 'Fate of the Vaal'
        }
      },
      detectedGameVersion: 'poe2',
      settings: { poeVersion: 'poe1' }
    },
    window: {
      t: (key) => key,
      location: {
        href: 'file:///D:/Workstation/JuiceJournal/JuiceJournal/desktop/src/index.html'
      }
    },
    URL,
    normalizePoeVersion: (value) => value,
    getCharacterVisualModel: () => ({
      deriveCharacterVisual: () => ({
        portraitKey: 'shaman',
        bannerKey: 'shaman',
        tone: 'ember',
        badgeText: 'S',
        classLabel: 'Shaman',
        baseClassLabel: 'Druid',
        portraitPath: 'assets/characters/poe2/shaman.png',
        bannerPath: 'assets/characters/banners/poe2/shaman.jpg'
      })
    })
  });

  context.renderCharacterSummaryCard();

  assert.equal(elements.characterSummaryCard.dataset.characterState, 'ready');
  assert.equal(elements.characterBanner.dataset.characterBanner, 'shaman');
  assert.equal(elements.characterBanner.dataset.characterTone, 'ember');
  assert.equal(elements.characterBannerImage.hidden, false);
  assert.equal(
    elements.characterBannerImage.src,
    'file:///D:/Workstation/JuiceJournal/JuiceJournal/desktop/src/assets/characters/banners/poe2/shaman.jpg'
  );
  assert.equal(elements.characterPortrait.dataset.characterPortrait, 'shaman');
  assert.equal(elements.characterPortrait.dataset.characterTone, 'ember');
  assert.equal(elements.characterPortraitImage.hidden, false);
  assert.equal(
    elements.characterPortraitImage.src,
    'file:///D:/Workstation/JuiceJournal/JuiceJournal/desktop/src/assets/characters/poe2/shaman.png'
  );
  assert.equal(elements.characterPortraitBadge.textContent, 'S');
  assert.equal(elements.characterPortraitBadge.style.display, 'none');
  assert.equal(elements.characterName.textContent, 'KocaGyVeMasha');
  assert.equal(elements.characterClass.textContent, 'Shaman · Druid');
  assert.equal(elements.characterLevel.textContent, '96');
  assert.equal(elements.characterLeague.textContent, 'Fate of the Vaal');
  assert.equal(elements.characterGameVersion.textContent, 'PoE 2');
});

test('renderer keeps the last detected game character badge when no game is active', () => {
  const elements = {
    characterSummaryCard: { dataset: {} },
    characterBanner: { dataset: {} },
    characterBannerImage: {
      src: '',
      hidden: true,
      alt: ''
    },
    characterPortrait: { dataset: {} },
    characterPortraitImage: {
      src: '',
      hidden: true,
      alt: ''
    },
    characterPortraitBadge: { textContent: '', style: {} },
    characterName: { textContent: '' },
    characterClass: { textContent: '' },
    characterLevel: { textContent: '' },
    characterLeague: { textContent: '' },
    characterStatus: { textContent: '' },
    characterGameVersion: { textContent: '' }
  };
  const context = loadFunctions(['renderCharacterSummaryCard', 'getPoeDeviceNote', 'formatPoeDeviceEnd'], {
    elements,
    state: {
      currentUser: { username: 'FallbackUser' },
      account: {
        accountName: 'Esquetta#4179',
        activePoeVersion: 'poe2',
        summary: {
          status: 'ready',
          name: 'KocaAyVeMasha',
          level: 96,
          className: 'Druid',
          ascendancy: 'Shaman',
          league: 'Fate of the Vaal',
          poeVersion: 'poe2'
        }
      },
      detectedGameVersion: null,
      settings: {
        poeVersion: 'poe1',
        lastDetectedPoeVersion: 'poe2'
      }
    },
    window: {
      t: (key) => key,
      location: {
        href: 'file:///D:/Workstation/JuiceJournal/JuiceJournal/desktop/src/index.html'
      }
    },
    URL,
    normalizePoeVersion: (value) => value === 'poe1' || value === 'poe2' ? value : null,
    getCharacterVisualModel: () => ({
      deriveCharacterVisual: () => ({
        portraitKey: 'shaman',
        bannerKey: 'shaman',
        tone: 'ember',
        badgeText: 'S',
        classLabel: 'Shaman',
        baseClassLabel: 'Druid',
        portraitPath: 'assets/characters/poe2/shaman.png',
        bannerPath: 'assets/characters/banners/poe2/shaman.jpg'
      })
    })
  });

  context.renderCharacterSummaryCard();

  assert.equal(elements.characterGameVersion.textContent, 'PoE 2');
  assert.equal(elements.characterName.textContent, 'KocaAyVeMasha');
  assert.equal(elements.characterPortrait.dataset.characterPortrait, 'shaman');
});

test('renderer keeps hero text current when character art is unavailable', () => {
  const elements = {
    characterSummaryCard: { dataset: {} },
    characterBanner: { dataset: {} },
    characterBannerImage: {
      src: '',
      hidden: true,
      alt: ''
    },
    characterPortrait: { dataset: {} },
    characterPortraitImage: {
      src: '',
      hidden: true,
      alt: ''
    },
    characterPortraitBadge: { textContent: '', style: {} },
    characterName: { textContent: '' },
    characterClass: { textContent: '' },
    characterLevel: { textContent: '' },
    characterLeague: { textContent: '' },
    characterStatus: { textContent: '' },
    characterGameVersion: { textContent: '' }
  };
  const context = loadFunctions(['renderCharacterSummaryCard', 'getPoeDeviceNote', 'formatPoeDeviceEnd'], {
    elements,
    state: {
      currentUser: { username: 'FallbackUser' },
      account: {
        accountName: 'Esquetta#4179',
        summary: {
          status: 'ready',
          name: 'KELLEE',
          level: 92,
          className: 'Monk2',
          league: 'Standard'
        }
      },
      detectedGameVersion: 'poe2',
      settings: { poeVersion: 'poe2' }
    },
    window: {
      t: (key) => key,
      location: {
        href: 'file:///D:/Workstation/JuiceJournal/JuiceJournal/desktop/src/index.html'
      }
    },
    URL,
    normalizePoeVersion: (value) => value,
    getCharacterVisualModel: () => ({
      deriveCharacterVisual: () => ({
        portraitKey: 'invoker',
        bannerKey: 'invoker',
        tone: 'azure',
        badgeText: 'I',
        classLabel: 'Invoker',
        baseClassLabel: 'Monk',
        portraitPath: '',
        bannerPath: ''
      })
    })
  });

  context.renderCharacterSummaryCard();

  assert.equal(elements.characterSummaryCard.dataset.characterState, 'ready');
  assert.equal(elements.characterBanner.dataset.characterBanner, 'invoker');
  assert.equal(elements.characterBanner.dataset.characterTone, 'azure');
  assert.equal(elements.characterBannerImage.hidden, true);
  assert.equal(elements.characterPortraitImage.hidden, true);
  assert.equal(elements.characterPortraitBadge.textContent, 'I');
  assert.notEqual(elements.characterPortraitBadge.style.display, 'none');
  assert.equal(elements.characterName.textContent, 'KELLEE');
  assert.equal(elements.characterClass.textContent, 'Invoker · Monk');
  assert.equal(elements.characterLevel.textContent, '92');
  assert.equal(elements.characterLeague.textContent, 'Standard');
});

test('renderer empty state shows em dashes and the unknown class line', () => {
  const elements = {
    characterSummaryCard: { dataset: {} },
    characterLevel: { textContent: '' },
    characterLeague: { textContent: '' },
    characterClass: { textContent: '' }
  };
  const context = loadFunctions(['renderCharacterSummaryCard', 'getPoeDeviceNote', 'formatPoeDeviceEnd'], {
    elements,
    state: { account: null },
    window: { t: (key) => key },
    getCharacterVisualModel: () => ({
      deriveCharacterVisual: () => ({ badgeText: '?', classLabel: 'Unknown Class' })
    })
  });

  context.renderCharacterSummaryCard();

  assert.equal(elements.characterLevel.textContent, '—');
  assert.equal(elements.characterLeague.textContent, '—');
  assert.equal(elements.characterClass.textContent, 'dashboard.unknownClass');
  assert.equal(elements.characterSummaryCard.dataset.characterState, 'empty');
});

test('renderer shows only the class for an unascended character', () => {
  const elements = {
    characterSummaryCard: { dataset: {} },
    characterClass: { textContent: '' }
  };
  const context = loadFunctions(['renderCharacterSummaryCard', 'getPoeDeviceNote', 'formatPoeDeviceEnd'], {
    elements,
    state: {
      account: {
        summary: { status: 'ready', name: 'Base', level: 12, className: 'Ranger', league: 'Standard' }
      }
    },
    getCharacterVisualModel: () => ({
      deriveCharacterVisual: () => ({ classLabel: 'Ranger', baseClassLabel: 'Ranger', badgeText: 'R' })
    })
  });

  context.renderCharacterSummaryCard();

  assert.equal(elements.characterClass.textContent, 'Ranger');
});

const POE_DEVICE_WARN_MS = 30 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// The clock time the note shows, built the same way the renderer builds it.
function clockTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderCardWithDevice(stateOverrides) {
  const elements = {
    characterSummaryCard: { dataset: {} },
    characterBanner: { dataset: {} },
    characterBannerImage: { src: '', hidden: true, alt: '' },
    characterPortrait: { dataset: {} },
    characterPortraitImage: { src: '', hidden: true, alt: '' },
    characterPortraitBadge: { textContent: '', style: {} },
    characterName: { textContent: '' },
    characterClass: { textContent: '' },
    characterLevel: { textContent: '' },
    characterLeague: { textContent: '' },
    characterStatus: { textContent: '' },
    characterGameVersion: { textContent: '' },
    characterConnectBtn: { hidden: true },
    characterConnectNote: { hidden: true, textContent: '', dataset: {} }
  };
  const context = loadFunctions(['renderCharacterSummaryCard', 'getPoeDeviceNote', 'formatPoeDeviceEnd'], {
    elements,
    POE_DEVICE_WARN_MS,
    state: {
      currentUser: { username: 'FallbackUser' },
      account: { summary: { status: 'ready', name: 'Hero', level: 90, className: 'Ranger', league: 'Standard' } },
      detectedGameVersion: 'poe1',
      settings: { poeVersion: 'poe1' },
      poeDeviceConnected: true,
      poeDeviceRenewable: false,
      poeDeviceExpiresAt: null,
      ...stateOverrides
    },
    window: {
      t: (key, params) => (params ? `${key}|${params.time}` : key),
      location: { href: 'file:///D:/Workstation/JuiceJournal/JuiceJournal/desktop/src/index.html' }
    },
    URL,
    normalizePoeVersion: (value) => value,
    getCharacterVisualModel: () => ({
      deriveCharacterVisual: () => ({
        portraitKey: 'ranger',
        bannerKey: 'ranger',
        tone: 'ember',
        badgeText: 'R',
        classLabel: 'Ranger',
        baseClassLabel: 'Ranger',
        portraitPath: '',
        bannerPath: ''
      })
    })
  });

  context.renderCharacterSummaryCard();
  return { elements, context };
}

test('character card asks to reconnect once the Path of Exile sign-in has ended', () => {
  const { elements } = renderCardWithDevice({ poeDeviceConnected: false, poeDeviceExpiresAt: null });

  assert.equal(elements.characterConnectNote.hidden, false);
  assert.equal(elements.characterConnectNote.textContent, 'dashboard.poeReconnectNote');
  assert.equal(elements.characterConnectNote.dataset.tone, 'warn');
  assert.equal(elements.characterConnectBtn.hidden, false);
});

test('character card says until when a sign-in lasts that GGG does not renew, and keeps Reconnect away', () => {
  const expiresAt = Date.now() + 5 * HOUR_MS;
  const { elements } = renderCardWithDevice({ poeDeviceExpiresAt: expiresAt });

  assert.equal(elements.characterConnectNote.hidden, false);
  assert.equal(elements.characterConnectNote.textContent, `dashboard.poeConnectionUntil|${clockTime(expiresAt)}`);
  assert.equal(elements.characterConnectNote.dataset.tone, 'muted');
  assert.equal(elements.characterConnectBtn.hidden, true);
});

test('character card warns and offers Reconnect early when the sign-in ends within 30 minutes', () => {
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const { elements } = renderCardWithDevice({ poeDeviceExpiresAt: expiresAt });

  assert.equal(elements.characterConnectNote.hidden, false);
  assert.equal(elements.characterConnectNote.textContent, `dashboard.poeConnectionEndsSoon|${clockTime(expiresAt)}`);
  assert.equal(elements.characterConnectNote.dataset.tone, 'warn');
  assert.equal(elements.characterConnectBtn.hidden, false);
});

test('character card switches to the ends-soon note at exactly 30 minutes left, not before', () => {
  const now = Date.UTC(2026, 10, 9, 12, 0, 0);
  const { context } = renderCardWithDevice({ poeDeviceExpiresAt: now + POE_DEVICE_WARN_MS });

  assert.equal(context.getPoeDeviceNote(now).endsSoon, true);
  assert.equal(context.getPoeDeviceNote(now - 1).endsSoon, undefined);
  assert.equal(context.getPoeDeviceNote(now - 1).tone, 'muted');
});

test('character card stays quiet while GGG renews the sign-in, when no end is known and when signed out', () => {
  const cases = [
    { poeDeviceRenewable: true, poeDeviceExpiresAt: Date.now() + 10 * 60 * 1000 },
    { poeDeviceRenewable: false, poeDeviceExpiresAt: null },
    { currentUser: null, poeDeviceConnected: false }
  ];

  for (const overrides of cases) {
    const { elements } = renderCardWithDevice(overrides);

    assert.equal(elements.characterConnectNote.hidden, true, JSON.stringify(overrides));
    assert.equal(elements.characterConnectNote.textContent, '', JSON.stringify(overrides));
    assert.equal(elements.characterConnectNote.dataset.tone, '', JSON.stringify(overrides));
    assert.equal(elements.characterConnectBtn.hidden, true, JSON.stringify(overrides));
  }
});

test('dashboard html and stylesheet carry the Path of Exile connection note', () => {
  const html = fs.readFileSync(indexHtmlPath, 'utf8');
  const css = fs.readFileSync(stylesPath, 'utf8');

  assert.match(html, /id="character-connect-note"/);
  assert.match(css, /\.character-connect-note/);
});

const SIGN_IN_ENDS_AT = Date.UTC(2026, 10, 9, 20, 0, 0);

function loadExpiryScheduler({ status = { authenticated: true, expiresAt: SIGN_IN_ENDS_AT, renewable: false, stashAccess: false } } = {}) {
  const clock = { now: SIGN_IN_ENDS_AT - 5 * HOUR_MS };
  const timers = [];
  const cleared = [];
  const toasts = [];
  const calls = [];
  const replies = { status };
  const handleConnectPoeDevice = async () => {};
  const state = { currentUser: { id: 'p1' }, poeDeviceConnected: true, poeDeviceRenewable: false, poeDeviceExpiresAt: SIGN_IN_ENDS_AT };
  const context = loadFunctions(['schedulePoeDeviceExpiry', 'syncPoeDeviceConnection'], {
    state,
    clock,
    poeDeviceExpiryTimer: null,
    POE_DEVICE_WARN_MS,
    Date: { now: () => clock.now },
    setTimeout: (callback, delay) => {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => cleared.push(timer),
    window: {
      t: (key) => key,
      electronAPI: { getPoeAuthStatus: async () => replies.status }
    },
    applyDashboardCapabilities: () => calls.push('applyDashboardCapabilities'),
    renderPoeLinkStatus: () => calls.push('renderPoeLinkStatus'),
    renderCharacterSummaryCard: () => calls.push('renderCharacterSummaryCard'),
    refreshDeviceCharacters: async () => calls.push('refreshDeviceCharacters'),
    showToast: (...args) => toasts.push(args),
    handleConnectPoeDevice
  });

  return { context, state, clock, timers, cleared, toasts, calls, replies, handleConnectPoeDevice };
}

test('device expiry timer is not set while GGG renews the sign-in, when disconnected or when no end is known', () => {
  for (const overrides of [
    { poeDeviceRenewable: true },
    { poeDeviceConnected: false },
    { poeDeviceExpiresAt: null }
  ]) {
    const { context, state, timers } = loadExpiryScheduler();
    Object.assign(state, overrides);

    context.schedulePoeDeviceExpiry();

    assert.equal(timers.length, 0, JSON.stringify(overrides));
  }
});

test('device expiry timer fires 30 minutes before the end, when more than 30 minutes are left', () => {
  const { context, timers } = loadExpiryScheduler();

  context.schedulePoeDeviceExpiry();

  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 4.5 * HOUR_MS);
});

test('device expiry timer fires one second after the end, when 30 minutes or less are left', () => {
  const { context, clock, timers } = loadExpiryScheduler();

  clock.now = SIGN_IN_ENDS_AT - 10 * 60 * 1000;
  context.schedulePoeDeviceExpiry();
  clock.now = SIGN_IN_ENDS_AT - POE_DEVICE_WARN_MS;
  context.schedulePoeDeviceExpiry();
  // Already past the end (the PC slept): the check still runs, one second from now.
  clock.now = SIGN_IN_ENDS_AT + 5000;
  context.schedulePoeDeviceExpiry();

  assert.deepEqual(timers.map((timer) => timer.delay), [10 * 60 * 1000 + 1000, POE_DEVICE_WARN_MS + 1000, 1000]);
});

test('the 30 minute timer redraws the card and Settings, then waits for the end', () => {
  const { context, clock, timers, calls } = loadExpiryScheduler();

  context.schedulePoeDeviceExpiry();
  clock.now = SIGN_IN_ENDS_AT - POE_DEVICE_WARN_MS;
  timers[0].callback();

  assert.deepEqual(calls, ['renderCharacterSummaryCard', 'renderPoeLinkStatus']);
  assert.equal(timers.length, 2);
  assert.equal(timers[1].delay, POE_DEVICE_WARN_MS + 1000);
});

test('when the sign-in has ended the timer syncs with main and shows a warning with a Reconnect action', async () => {
  const { context, state, clock, timers, toasts, replies, handleConnectPoeDevice } = loadExpiryScheduler();
  clock.now = SIGN_IN_ENDS_AT - 10 * 60 * 1000;
  context.schedulePoeDeviceExpiry();

  clock.now = SIGN_IN_ENDS_AT + 1000;
  replies.status = { authenticated: false, expiresAt: SIGN_IN_ENDS_AT, renewable: false, stashAccess: false };
  await timers[0].callback();

  assert.equal(state.poeDeviceConnected, false);
  assert.equal(state.poeDeviceExpiresAt, null);
  assert.equal(toasts.length, 1);
  assert.deepEqual(toasts[0].slice(0, 3), ['toast.poeConnectionEnded', 'dashboard.poeReconnectNote', 'warning']);
  assert.equal(toasts[0][3].action.label, 'dashboard.connectDevice');
  assert.equal(toasts[0][3].action.onSelect, handleConnectPoeDevice);
  // Disconnected, so nothing is scheduled again.
  assert.equal(timers.length, 1);
});

test('a sign-in that ends after the player signed out shows no notice on the sign-in screen', async () => {
  const { context, state, clock, timers, toasts, replies } = loadExpiryScheduler();
  clock.now = SIGN_IN_ENDS_AT - 10 * 60 * 1000;
  context.schedulePoeDeviceExpiry();

  state.currentUser = null;
  clock.now = SIGN_IN_ENDS_AT + 1000;
  replies.status = null;
  await timers[0].callback();

  assert.equal(state.poeDeviceConnected, false);
  assert.deepEqual(toasts, []);
});

test('when main says the sign-in is still connected the timer shows no warning and watches the new end', async () => {
  const { context, state, clock, timers, toasts, replies } = loadExpiryScheduler();
  clock.now = SIGN_IN_ENDS_AT - 10 * 60 * 1000;
  context.schedulePoeDeviceExpiry();

  clock.now = SIGN_IN_ENDS_AT + 1000;
  replies.status = { authenticated: true, expiresAt: SIGN_IN_ENDS_AT + 10 * HOUR_MS, renewable: false, stashAccess: false };
  await timers[0].callback();

  assert.equal(state.poeDeviceConnected, true);
  assert.deepEqual(toasts, []);
  assert.equal(timers.length, 2);
  assert.equal(timers[1].delay, 9.5 * HOUR_MS - 1000);
});

test('a later sync replaces the device expiry timer', async () => {
  const { context, timers, cleared } = loadExpiryScheduler();

  await context.syncPoeDeviceConnection();
  await context.syncPoeDeviceConnection();

  assert.equal(timers.length, 2);
  assert.deepEqual(cleared, [null, timers[0]]);
  assert.equal(timers[1].delay, 4.5 * HOUR_MS);
});

test('syncing the device sign-in records when it ends and whether GGG renews it', async () => {
  const cases = [
    [{ authenticated: true, expiresAt: SIGN_IN_ENDS_AT, renewable: false }, true, SIGN_IN_ENDS_AT, false],
    [{ authenticated: true, expiresAt: SIGN_IN_ENDS_AT, renewable: true }, true, SIGN_IN_ENDS_AT, true],
    [{ authenticated: true, expiresAt: null, renewable: false }, true, null, false],
    [{ authenticated: true, expiresAt: '2026-11-09', renewable: 'yes' }, true, null, false],
    [{ authenticated: false, expiresAt: SIGN_IN_ENDS_AT, renewable: false }, false, null, false],
    [null, false, null, false]
  ];

  for (const [status, connected, expiresAt, renewable] of cases) {
    const { context, state } = loadExpiryScheduler({ status });

    await context.syncPoeDeviceConnection();

    assert.equal(state.poeDeviceConnected, connected, JSON.stringify(status));
    assert.equal(state.poeDeviceExpiresAt, expiresAt, JSON.stringify(status));
    assert.equal(state.poeDeviceRenewable, renewable, JSON.stringify(status));
  }
});
