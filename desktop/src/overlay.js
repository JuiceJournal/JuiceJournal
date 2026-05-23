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
    startMapName: document.querySelector('[data-overlay-start-map-name]'),
    startFarmType: document.querySelector('[data-overlay-start-farm-type]'),
    startSubmit: document.querySelector('[data-overlay-start-submit]'),
    startCancel: document.querySelector('[data-overlay-start-cancel]')
  };

  var passthroughEnabled = true;
  var lastRenderedMode = 'runtime';
  var animFrameId = null;

  function setText(element, value) {
    if (element) { element.textContent = value || ''; }
  }

  function escapeHTML(value) {
    return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function setPointerPassthrough(ignore) {
    var nextValue = ignore !== false;
    if (passthroughEnabled === nextValue) return;
    passthroughEnabled = nextValue;
    if (typeof root.electronAPI && typeof root.electronAPI.setOverlayPointerPassthrough === 'function') {
      root.electronAPI.setOverlayPointerPassthrough(nextValue).catch(function () {});
    }
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
    setText(el.primary, state.primaryLine || 'Waiting for game');
    setText(el.secondary, state.secondaryLine || '');
    setText(el.meta, state.metaLine || '');
  }

  /* ── Mode: Map Result ── */
  function renderMapResultMode(state) {
    var result = (state.mapResult && state.mapResult.result) || {};
    var rates = result.profitCurrencyRates || result.currencyRates || (state.mapResult && state.mapResult.profitCurrencyRates) || {};
    var topOutput = Array.isArray(result.topOutputs) && result.topOutputs.length > 0 ? result.topOutputs[0] : null;
    setText(el.kickerLabel, 'Map Complete');
    setText(el.primary, (result.farmType || 'Completed Map') + '  ' + formatSignedProfit(result.netProfit, rates));
    setText(el.secondary, topOutput ? (topOutput.label || '') + ' ' + formatSignedProfit(topOutput.valueDelta, rates) : 'Completed map result');
    setText(el.meta, formatDuration(result.durationSeconds));
  }

  /* ── Mode: Start Map Prompt ── */
  function renderStartMapPrompt(state) {
    var prompt = (state.startMapPrompt && typeof state.startMapPrompt === 'object') ? state.startMapPrompt : {};
    setText(el.kickerLabel, 'New Map');
    setText(el.primary, prompt.mapName || state.primaryLine || 'Unknown Map');
    var ctxParts = [prompt.farmType || 'Choose farm type'];
    if (prompt.poeVersion) ctxParts.push(prompt.poeVersion.replace(/^poe/i, 'PoE '));
    if (prompt.league) ctxParts.push(prompt.league);
    setText(el.secondary, ctxParts.filter(Boolean).join(' \u00b7 '));
    setText(el.meta, 'confirm map start');
  }

  function renderStartMapForm(state) {
    if (!el.startForm) return;
    var showForm = state.mode === 'start-map-prompt' && state.visibility !== 'hidden';
    el.startForm.hidden = !showForm;
    if (!showForm) return;
    var prompt = (state.startMapPrompt && typeof state.startMapPrompt === 'object') ? state.startMapPrompt : {};
    if (el.startMapName && document.activeElement !== el.startMapName) {
      el.startMapName.value = prompt.mapName || state.primaryLine || 'Unknown Map';
    }
    if (el.startFarmType) {
      var opts = normalizeFarmTypeOptions(prompt.farmTypeOptions);
      var selId = opts.some(function (e) { return e.id === prompt.farmTypeId; }) ? prompt.farmTypeId : '';
      el.startFarmType.innerHTML = '<option value="">No farm type</option>' +
        opts.map(function (e) { return '<option value="' + escapeHTML(e.id) + '">' + escapeHTML(e.label) + '</option>'; }).join('');
      el.startFarmType.value = selId;
    }
  }

  function clearExitingAnimation() {
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    if (el.card) el.card.setAttribute('data-overlay-exiting', 'false');
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
    } else {
      renderRuntimeMode(state);
    }

    renderStartMapForm(state);

    if (el.pin) {
      var showPin = mode === 'map-result' && visibility !== 'hidden';
      el.pin.hidden = !showPin;
      el.pin.setAttribute('aria-pressed', showPin && (state.mapResult && state.mapResult.pinned) ? 'true' : 'false');
      if (el.dismiss) el.dismiss.hidden = !showPin;
      if (!showPin) {
        setPointerPassthrough(mode === 'start-map-prompt' && visibility !== 'hidden' ? false : true);
      }
    }

    lastRenderedMode = mode;
  }

  /* ── IPC helpers ── */
  function getStartMapPromptPayload() {
    return {
      mapName: String(el.startMapName ? el.startMapName.value : '').trim() || 'Unknown Map',
      farmTypeId: String(el.startFarmType ? el.startFarmType.value : '').trim() || null
    };
  }

  function setStartMapPromptBusy(busy) {
    [el.startMapName, el.startFarmType, el.startSubmit, el.startCancel].filter(Boolean).forEach(function (e) { e.disabled = busy; });
  }

  /* ── Event bindings ── */
  if (el.pin) {
    el.pin.addEventListener('click', function () {
      if (typeof root.electronAPI === 'undefined' || typeof root.electronAPI.toggleMapResultOverlayPin !== 'function') return;
      el.pin.disabled = true;
      root.electronAPI.toggleMapResultOverlayPin().finally(function () { el.pin.disabled = false; setPointerPassthrough(true); });
    });
  }

  if (el.dismiss) {
    el.dismiss.addEventListener('click', function () {
      if (typeof root.electronAPI === 'undefined' || typeof root.electronAPI.dismissMapResultOverlay !== 'function') return;
      el.dismiss.disabled = true;
      root.electronAPI.dismissMapResultOverlay().finally(function () { el.dismiss.disabled = false; setPointerPassthrough(true); });
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

  /* ── Pointer passthrough ── */
  root.addEventListener('mousemove', function (event) {
    var isInteractive = el.card && el.card.dataset.overlayMode === 'start-map-prompt' && el.card.dataset.overlayState !== 'hidden';
    if (isInteractive) { setPointerPassthrough(false); return; }
    if (!el.pin || el.pin.hidden) { setPointerPassthrough(true); return; }
    var btns = [el.pin, el.dismiss].filter(Boolean).filter(function (b) { return !b.hidden; });
    var hovering = btns.some(function (b) {
      var r = b.getBoundingClientRect();
      return event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
    });
    setPointerPassthrough(!hovering);
  });

  root.addEventListener('mouseleave', function () {
    setPointerPassthrough(true);
  });

  /* ── Public API ── */
  root.JuiceOverlay = { renderState: renderState };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { renderState(root.__JUICE_OVERLAY_INITIAL_STATE__ || null); }, { once: true });
  } else {
    renderState(root.__JUICE_OVERLAY_INITIAL_STATE__ || null);
  }
})(window);
