(function initializeOverlay(root) {
  var el = {
    card: document.querySelector('[data-overlay-state]'),
    kickerLabel: document.querySelector('[data-overlay-kicker-label]'),
    pin: document.querySelector('[data-overlay-pin]'),
    dismiss: document.querySelector('[data-overlay-dismiss]'),
    primary: document.querySelector('[data-overlay-primary]'),
    secondary: document.querySelector('[data-overlay-secondary]'),
    meta: document.querySelector('[data-overlay-meta]'),
    startForm: document.querySelector('[data-overlay-start-form]'),
    startFarmTypes: document.querySelector('[data-overlay-start-farm-types]'),
    startSubmit: document.querySelector('[data-overlay-start-submit]'),
    startCancel: document.querySelector('[data-overlay-start-cancel]'),
    characterForm: document.querySelector('[data-overlay-character-form]'),
    characters: document.querySelector('[data-overlay-characters]'),
    characterKeep: document.querySelector('[data-overlay-character-keep]')
  };

  var lastRenderedMode = 'runtime';
  var animFrameId = null;
  // The overlay never takes focus, so the prompt is mouse-only: the map name comes from the prompt state
  // and the farm type is picked from buttons.
  var startPromptKey = null;
  var renderedChipsKey = null;
  var selectedFarmTypeId = '';
  var renderedCharactersKey = null;
  var promptedCharacterId = '';
  // Main pushes state only on events, so a running map or session counts up here: one 1 Hz timer that only
  // swaps the meta text (no transition), and only while the state has a clock and the card is shown.
  var clockTimer = null;
  var clockState = null;

  function setText(element, value) {
    if (element) { element.textContent = value || ''; }
  }

  // Game art for the top drop. The overlay CSP only allows local images, so the art comes from the main-process
  // icon cache as a file:// URL. Keyed by the remote URL; '' while loading or when the icon is unavailable.
  var cachedIconSources = Object.create(null);
  var secondaryIconUrl = '';

  // A farm id or label resolves to the data-farm-type that gives the name its league content colour.
  function getFarmTypeId(value) {
    var model = root.farmTypeModel;
    return model && typeof model.resolveFarmTypeId === 'function' ? model.resolveFarmTypeId(value) : null;
  }

  // The primary line is a name plus an optional value, so the value can carry the profit tier colour.
  function setPrimary(name, value, farmTypeId) {
    if (!el.primary) return;
    var nameSpan = document.createElement('span');
    nameSpan.className = 'jj-primary-name';
    if (farmTypeId) { nameSpan.setAttribute('data-farm-type', farmTypeId); }
    nameSpan.textContent = name || '';
    el.primary.replaceChildren(nameSpan);
    if (value) {
      el.primary.append(' ');
      var valueSpan = document.createElement('span');
      valueSpan.className = 'jj-value';
      valueSpan.textContent = value;
      el.primary.appendChild(valueSpan);
    }
  }

  function setSecondary(text, iconSrc) {
    if (!el.secondary) return;
    el.secondary.textContent = text || '';
    secondaryIconUrl = '';
    if (iconSrc) prependSecondaryIcon(iconSrc);
  }

  function prependSecondaryIcon(iconSrc) {
    var icon = document.createElement('img');
    icon.src = iconSrc;
    icon.alt = '';
    icon.draggable = false;
    el.secondary.prepend(icon);
  }

  function loadCachedIcon(iconUrl) {
    var api = root.electronAPI;
    if (!api || typeof api.getCachedIcon !== 'function') return;
    cachedIconSources[iconUrl] = '';
    api.getCachedIcon(iconUrl).then(function (src) {
      if (typeof src !== 'string' || src.indexOf('file:') !== 0) return;
      cachedIconSources[iconUrl] = src;
      if (el.secondary && secondaryIconUrl === iconUrl) prependSecondaryIcon(src);
    }).catch(function () {});
  }

  function escapeHTML(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function normalizeFarmTypeOptions(value) {
    if (!Array.isArray(value)) return [];
    return value.map(function (entry) {
      if (!entry || typeof entry !== 'object') return null;
      var id = String(entry.id || '').trim();
      return id ? { id: id, label: String(entry.label || id).trim() } : null;
    }).filter(Boolean);
  }

  function formatSignedProfit(value, rates) {
    var model = root.profitCurrencyModel;
    if (model && typeof model.formatProfitCurrencyText === 'function') {
      return model.formatProfitCurrencyText(value, rates || {}, { signed: true });
    }
    var rounded = Math.round(Number(value || 0));
    var prefix = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
    return prefix + Math.abs(rounded) + 'c';
  }

  function formatDuration(seconds) {
    var s = Math.max(0, Number(seconds || 0) | 0);
    if (!s) return '';
    var m = (s / 60) | 0;
    var sec = s % 60;
    return m ? m + 'm ' + (sec < 10 ? '0' : '') + sec + 's' : sec + 's';
  }

  function deriveState(input) {
    if (input && typeof input === 'object' && typeof input.visibility === 'string') return input;
    var model = root.overlayStateModel;
    if (model && typeof model.deriveOverlayState === 'function') {
      return model.deriveOverlayState(input || {});
    }
    return { visibility: 'waiting', primaryLine: 'Waiting for game', secondaryLine: 'Waiting for runtime session', metaLine: '' };
  }

  /* ── Mode: Runtime / Waiting ── */
  function renderRuntimeMode(state) {
    setText(el.kickerLabel, 'Juice Journal');
    setPrimary(state.primaryLine || 'Waiting for game');
    setSecondary(state.secondaryLine || '');
    setText(el.meta, state.metaLine || '');
  }

  /* ── Mode: Map Result ── */
  function renderMapResultMode(state) {
    var result = (state.mapResult && state.mapResult.result) || {};
    var rates = result.profitCurrencyRates || result.currencyRates || (state.mapResult && state.mapResult.profitCurrencyRates) || {};
    var topOutput = Array.isArray(result.topOutputs) && result.topOutputs.length > 0 ? result.topOutputs[0] : null;
    var iconUrl = topOutput && typeof topOutput.icon === 'string' ? topOutput.icon : '';
    setText(el.kickerLabel, 'Map Complete');
    setPrimary(result.farmType || 'Completed Map', formatSignedProfit(result.netProfit, rates), getFarmTypeId(result.farmType));
    setSecondary(
      topOutput ? (topOutput.label || '') + ' ' + formatSignedProfit(topOutput.valueDelta, rates) : 'Completed map result',
      cachedIconSources[iconUrl]
    );
    if (iconUrl) {
      secondaryIconUrl = iconUrl;
      if (!(iconUrl in cachedIconSources)) loadCachedIcon(iconUrl);
    }
    setText(el.meta, formatDuration(result.durationSeconds));
  }

  function getMapResultTier(state) {
    var model = root.profitTierModel;
    var result = (state.mapResult && state.mapResult.result) || {};
    if (!model || typeof model.getProfitTier !== 'function' || result.profitUnavailable) return '';
    var rates = result.profitCurrencyRates || result.currencyRates || (state.mapResult && state.mapResult.profitCurrencyRates) || {};
    return model.getProfitTier(result.netProfit, rates);
  }

  /* ── Mode: Start Map Prompt ── */
  function renderStartMapPrompt(state) {
    var prompt = (state.startMapPrompt && typeof state.startMapPrompt === 'object') ? state.startMapPrompt : {};
    setText(el.kickerLabel, 'New Map');
    setPrimary(prompt.mapName || state.primaryLine || 'Unknown Map');
    var ctxParts = [prompt.farmType || 'Choose farm type'];
    if (prompt.poeVersion) ctxParts.push(prompt.poeVersion.replace(/^poe/i, 'PoE '));
    if (prompt.league) ctxParts.push(prompt.league);
    setSecondary(ctxParts.filter(Boolean).join(' \u00b7 '));
    setText(el.meta, 'confirm map start');
  }

  function renderStartMapForm(state) {
    if (!el.startForm) return;
    var showForm = state.mode === 'start-map-prompt' && state.visibility !== 'hidden';
    el.startForm.hidden = !showForm;
    if (!showForm) return;
    var prompt = (state.startMapPrompt && typeof state.startMapPrompt === 'object') ? state.startMapPrompt : {};
    var opts = normalizeFarmTypeOptions(prompt.farmTypeOptions);
    // A new prompt (entering the prompt mode, or a different map) resets the selection to its default.
    var promptKey = String(prompt.mapName || '') + '|' + String(prompt.farmTypeId || '');
    if (lastRenderedMode !== 'start-map-prompt' || promptKey !== startPromptKey) {
      startPromptKey = promptKey;
      renderedChipsKey = null;
      selectedFarmTypeId = opts.some(function (e) { return e.id === prompt.farmTypeId; }) ? prompt.farmTypeId : '';
    }
    // Rebuild the buttons only when they change, so state pushes cannot swallow a click in progress.
    var chipsKey = JSON.stringify(opts);
    if (el.startFarmTypes && chipsKey !== renderedChipsKey) {
      renderedChipsKey = chipsKey;
      el.startFarmTypes.innerHTML = [{ id: '', label: 'No farm type' }].concat(opts).map(function (e) {
        var farmTypeId = getFarmTypeId(e.id);
        return '<button class="jj-chip" type="button" data-farm-type-id="' + escapeHTML(e.id) + '"' +
          (farmTypeId ? ' data-farm-type="' + farmTypeId + '"' : '') + ' aria-pressed="' +
          (e.id === selectedFarmTypeId ? 'true' : 'false') + '">' + escapeHTML(e.label) + '</button>';
      }).join('');
    }
  }

  function selectFarmType(farmTypeId) {
    selectedFarmTypeId = farmTypeId;
    if (!el.startFarmTypes) return;
    Array.prototype.forEach.call(el.startFarmTypes.querySelectorAll('[data-farm-type-id]'), function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-farm-type-id') === farmTypeId ? 'true' : 'false');
    });
  }

  /* ── Mode: Character Prompt ── */
  function renderCharacterPrompt(state) {
    setText(el.kickerLabel, 'Playing as');
    setPrimary(state.primaryLine || '');
    setSecondary(state.secondaryLine || '');
    setText(el.meta, state.metaLine || '');
  }

  function renderCharacterForm(state) {
    if (!el.characterForm) return;
    var prompt = state.mode === 'character-prompt' && state.visibility !== 'hidden' ? state.characterPrompt : null;
    el.characterForm.hidden = !prompt;
    if (!prompt) {
      renderedCharactersKey = null;
      return;
    }
    promptedCharacterId = prompt.selectedId || '';
    // Same rule as the farm type chips: rebuild only on change so a state push cannot swallow a click.
    var charactersKey = JSON.stringify([prompt.selectedId, prompt.characters]);
    if (el.characters && charactersKey !== renderedCharactersKey) {
      renderedCharactersKey = charactersKey;
      el.characters.innerHTML = (prompt.characters || []).map(function (c) {
        return '<button class="jj-chip" type="button" data-character-id="' + escapeHTML(c.id) + '" aria-pressed="' +
          (c.id === prompt.selectedId ? 'true' : 'false') + '">' + escapeHTML(c.name) + (c.level ? ' ' + c.level : '') + '</button>';
      }).join('');
    }
  }

  function chooseCharacter(characterId) {
    if (!characterId || typeof root.electronAPI === 'undefined' || typeof root.electronAPI.chooseCharacterPromptOverlay !== 'function') return;
    root.electronAPI.chooseCharacterPromptOverlay({ characterId: characterId });
  }

  function clearExitingAnimation() {
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    if (el.card) el.card.setAttribute('data-overlay-exiting', 'false');
  }

  function tickClock() {
    var model = root.overlayStateModel;
    if (clockState && model && typeof model.formatOverlayClock === 'function') {
      setText(el.meta, model.formatOverlayClock(clockState, Date.now()));
    }
  }

  function syncClock(state, visibility) {
    clockState = visibility !== 'hidden' && state.clock && typeof state.clock === 'object' ? state.clock : null;
    if (clockState && !clockTimer) {
      clockTimer = setInterval(tickClock, 1000);
    } else if (!clockState && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  }

  /* ── Main render ── */
  function renderState(input) {
    var state = deriveState(input);
    var visibility = state.visibility || 'waiting';
    var mode = state.mode || 'runtime';
    var tone = (state.mapResult && state.mapResult.tone) || state.tone || 'neutral';
    var isExiting = visibility === 'hidden' && lastRenderedMode === 'map-result';

    clearExitingAnimation();

    if (el.card) {
      el.card.dataset.overlayState = visibility;
      el.card.dataset.overlayMode = mode;
      el.card.dataset.overlayTone = tone;
      var profitTier = mode === 'map-result' ? getMapResultTier(state) : '';
      if (profitTier) {
        el.card.dataset.profitTier = profitTier;
      } else {
        delete el.card.dataset.profitTier;
      }

      if (isExiting) {
        el.card.setAttribute('data-overlay-exiting', 'true');
        animFrameId = requestAnimationFrame(function () {
          animFrameId = requestAnimationFrame(function () {
            el.card.hidden = true;
            el.card.setAttribute('data-overlay-exiting', 'false');
          });
        });
      } else {
        el.card.hidden = visibility === 'hidden';
      }
    }

    if (mode === 'map-result') {
      renderMapResultMode(state);
    } else if (mode === 'start-map-prompt') {
      renderStartMapPrompt(state);
    } else if (mode === 'character-prompt') {
      renderCharacterPrompt(state);
    } else {
      renderRuntimeMode(state);
    }

    renderStartMapForm(state);
    renderCharacterForm(state);
    syncClock(state, visibility);

    if (el.pin) {
      var showPin = mode === 'map-result' && visibility !== 'hidden';
      var pinned = showPin && Boolean(state.mapResult && state.mapResult.pinned);
      el.pin.hidden = !showPin;
      el.pin.setAttribute('aria-pressed', pinned ? 'true' : 'false');
      // The label says it too, so the pinned state is not shown by colour alone.
      setText(el.pin, pinned ? 'Pinned' : 'Pin');
      if (el.dismiss) el.dismiss.hidden = !showPin;
    }

    lastRenderedMode = mode;
  }

  /* ── IPC helpers ── */
  function getStartMapPromptPayload() {
    return { farmTypeId: selectedFarmTypeId || null };
  }

  function setStartMapPromptBusy(busy) {
    var chips = el.startFarmTypes ? Array.prototype.slice.call(el.startFarmTypes.querySelectorAll('button')) : [];
    chips.concat([el.startSubmit, el.startCancel]).filter(Boolean).forEach(function (e) { e.disabled = busy; });
  }

  /* ── Event bindings ── */
  if (el.pin) {
    el.pin.addEventListener('click', function () {
      if (typeof root.electronAPI === 'undefined' || typeof root.electronAPI.toggleMapResultOverlayPin !== 'function') return;
      el.pin.disabled = true;
      root.electronAPI.toggleMapResultOverlayPin().finally(function () { el.pin.disabled = false; });
    });
  }

  if (el.dismiss) {
    el.dismiss.addEventListener('click', function () {
      if (typeof root.electronAPI === 'undefined' || typeof root.electronAPI.dismissMapResultOverlay !== 'function') return;
      el.dismiss.disabled = true;
      root.electronAPI.dismissMapResultOverlay().finally(function () { el.dismiss.disabled = false; });
    });
  }

  if (el.startFarmTypes) {
    el.startFarmTypes.addEventListener('click', function (event) {
      var button = event.target && event.target.closest ? event.target.closest('[data-farm-type-id]') : null;
      if (button) selectFarmType(button.getAttribute('data-farm-type-id') || '');
    });
  }

  if (el.startForm) {
    el.startForm.addEventListener('submit', function (event) {
      event.preventDefault();
      if (typeof root.electronAPI === 'undefined' || typeof root.electronAPI.confirmStartMapPromptOverlay !== 'function') return;
      setStartMapPromptBusy(true);
      root.electronAPI.confirmStartMapPromptOverlay(getStartMapPromptPayload()).finally(function () { setStartMapPromptBusy(false); });
    });
  }

  if (el.startCancel) {
    el.startCancel.addEventListener('click', function () {
      if (typeof root.electronAPI === 'undefined' || typeof root.electronAPI.cancelStartMapPromptOverlay !== 'function') return;
      setStartMapPromptBusy(true);
      root.electronAPI.cancelStartMapPromptOverlay().finally(function () { setStartMapPromptBusy(false); });
    });
  }

  if (el.characters) {
    el.characters.addEventListener('click', function (event) {
      var button = event.target && event.target.closest ? event.target.closest('[data-character-id]') : null;
      if (button) chooseCharacter(button.getAttribute('data-character-id'));
    });
  }

  if (el.characterKeep) {
    el.characterKeep.addEventListener('click', function () {
      chooseCharacter(promptedCharacterId);
    });
  }

  /* ── Public API ── */
  root.JuiceOverlay = { renderState: renderState };

  if (root.electronAPI && typeof root.electronAPI.onOverlayState === 'function') {
    root.electronAPI.onOverlayState(renderState);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { renderState(root.__JUICE_OVERLAY_INITIAL_STATE__ || null); }, { once: true });
  } else {
    renderState(root.__JUICE_OVERLAY_INITIAL_STATE__ || null);
  }
})(window);
