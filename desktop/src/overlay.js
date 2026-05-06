(function initializeOverlay(root) {
  const elements = {
    html: document.documentElement,
    card: document.querySelector('[data-overlay-state]'),
    kicker: document.querySelector('[data-overlay-kicker]'),
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
  let passthroughEnabled = true;
  let lastRenderedMode = 'runtime';

  function getOverlayModel() {
    return root.overlayStateModel || null;
  }

  function getProfitCurrencyModel() {
    return root.profitCurrencyModel || null;
  }

  function isDerivedOverlayState(value) {
    return value && typeof value === 'object' && typeof value.visibility === 'string';
  }

  function deriveState(input) {
    if (isDerivedOverlayState(input)) {
      return input;
    }

    const model = getOverlayModel();
    if (model && typeof model.deriveOverlayState === 'function') {
      return model.deriveOverlayState(input || {});
    }

    return {
      visibility: 'waiting',
      primaryLine: 'Waiting for game',
      secondaryLine: 'Waiting for runtime session',
      metaLine: ''
    };
  }

  function formatSignedChaos(value) {
    const normalized = Number(value ?? 0);
    const rounded = Math.round(normalized);
    const prefix = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
    return `${prefix}${Math.abs(rounded)}c`;
  }

  function formatSignedProfit(value, profitCurrencyRates = {}) {
    const model = getProfitCurrencyModel();
    if (model && typeof model.formatProfitCurrencyText === 'function') {
      return model.formatProfitCurrencyText(value, profitCurrencyRates, { signed: true });
    }

    return formatSignedChaos(value);
  }

  function formatDuration(seconds) {
    const normalized = Math.max(0, Number(seconds ?? 0) || 0);
    if (!normalized) {
      return '';
    }

    const minutes = Math.floor(normalized / 60);
    const remainingSeconds = normalized % 60;
    if (!minutes) {
      return `${remainingSeconds}s`;
    }

    return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
  }

  function buildMapResultLines(state) {
    const result = state?.mapResult?.result || {};
    const profitCurrencyRates = result.profitCurrencyRates
      || result.currencyRates
      || state?.mapResult?.profitCurrencyRates
      || {};
    const topOutput = Array.isArray(result.topOutputs) && result.topOutputs.length > 0
      ? result.topOutputs[0]
      : null;

    return {
      primaryLine: [result.farmType || 'Completed Map', formatSignedProfit(result.netProfit, profitCurrencyRates)].filter(Boolean).join(' / '),
      secondaryLine: topOutput
        ? `${topOutput.label || 'Top output'} ${formatSignedProfit(topOutput.valueDelta, profitCurrencyRates)}`
        : 'Completed map result',
      metaLine: formatDuration(result.durationSeconds),
      tone: state?.mapResult?.tone || 'neutral',
      pinned: state?.mapResult?.pinned === true
    };
  }

  function normalizeRuntimeState(state) {
    const mode = state.mode === 'start-map-prompt' ? 'start-map-prompt' : 'runtime';
    return {
      visibility: state.visibility || 'waiting',
      mode,
      tone: 'neutral',
      primaryLine: state.primaryLine || 'Waiting for game',
      secondaryLine: state.secondaryLine || 'Waiting for runtime session',
      metaLine: state.metaLine || '',
      pinned: false,
      startMapPrompt: mode === 'start-map-prompt' ? normalizeStartMapPrompt(state) : null
    };
  }

  function normalizeFarmTypeOptions(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }

        const id = String(entry.id || '').trim();
        const label = String(entry.label || id).trim();
        return id ? { id, label } : null;
      })
      .filter(Boolean);
  }

  function normalizeStartMapPrompt(state) {
    const prompt = state?.startMapPrompt && typeof state.startMapPrompt === 'object'
      ? state.startMapPrompt
      : {};

    return {
      mapName: String(prompt.mapName || state.primaryLine || 'Unknown Map').trim() || 'Unknown Map',
      farmTypeId: String(prompt.farmTypeId || '').trim(),
      farmTypeOptions: normalizeFarmTypeOptions(prompt.farmTypeOptions)
    };
  }

  function normalizeRenderedState(input) {
    const state = deriveState(input);
    if (state?.mode === 'map-result' && state?.mapResult?.result) {
      const lines = buildMapResultLines(state);
      return {
        visibility: state.visibility || 'visible',
        mode: 'map-result',
        tone: lines.tone,
        primaryLine: lines.primaryLine,
        secondaryLine: lines.secondaryLine,
        metaLine: lines.metaLine,
        pinned: lines.pinned
      };
    }

    return normalizeRuntimeState(state);
  }

  function setText(element, value) {
    if (element) {
      element.textContent = value || '';
    }
  }

  function setPointerPassthrough(ignore) {
    const nextValue = ignore !== false;
    if (passthroughEnabled === nextValue) {
      return;
    }

    passthroughEnabled = nextValue;
    if (typeof root.electronAPI?.setOverlayPointerPassthrough === 'function') {
      root.electronAPI.setOverlayPointerPassthrough(nextValue).catch(() => { });
    }
  }

  function isStartMapPromptVisible() {
    return elements.card?.dataset.overlayMode === 'start-map-prompt'
      && elements.card?.dataset.overlayState !== 'hidden';
  }

  function syncInteractivePassthrough(event) {
    if (isStartMapPromptVisible()) {
      setPointerPassthrough(false);
      return;
    }

    if (!elements.pin || elements.pin.hidden) {
      setPointerPassthrough(true);
      return;
    }

    const actionElements = [elements.pin, elements.dismiss].filter(Boolean).filter((element) => !element.hidden);
    const isHoveringAction = actionElements.some((element) => {
      const rect = element.getBoundingClientRect();
      return event.clientX >= rect.left
        && event.clientX <= rect.right
        && event.clientY >= rect.top
        && event.clientY <= rect.bottom;
    });

    setPointerPassthrough(!isHoveringAction);
  }

  async function syncCursorPassthroughFromMain() {
    if (typeof root.electronAPI?.getOverlayCursorPosition !== 'function') {
      return;
    }

    try {
      const position = await root.electronAPI.getOverlayCursorPosition();
      if (position) {
        syncInteractivePassthrough(position);
      }
    } catch {
      // Ignore overlay hover sync failures.
    }
  }

  function renderState(input) {
    const state = normalizeRenderedState(input);
    const visibility = state.visibility || 'waiting';
    const mode = state.mode || 'runtime';
    const isExitingMapResult = visibility === 'hidden' && lastRenderedMode === 'map-result';

    if (elements.html) {
      elements.html.dataset.overlayVisibility = visibility;
      elements.html.dataset.overlayMode = mode;
    }

    if (elements.card) {
      elements.card.dataset.overlayState = visibility;
      elements.card.dataset.overlayMode = mode;
      elements.card.dataset.overlayTone = state.tone || 'neutral';
      elements.card.setAttribute('data-overlay-exiting', isExitingMapResult ? 'true' : 'false');
      elements.card.hidden = visibility === 'hidden' && !isExitingMapResult;
    }

    setText(elements.kickerLabel, mode === 'map-result'
      ? 'Map Result'
      : (mode === 'start-map-prompt' ? 'Start Map' : 'Juice Journal'));
    setText(elements.primary, state.primaryLine);
    setText(elements.secondary, state.secondaryLine);
    setText(elements.meta, state.metaLine);
    renderStartMapPromptControls(state);
    if (elements.pin) {
      const showPin = mode === 'map-result' && visibility !== 'hidden';
      elements.pin.hidden = !showPin;
      elements.pin.setAttribute('aria-pressed', showPin && state.pinned ? 'true' : 'false');
      if (elements.dismiss) {
        elements.dismiss.hidden = !showPin;
      }
      if (!showPin) {
        setPointerPassthrough(mode === 'start-map-prompt' && visibility !== 'hidden' ? false : true);
      } else {
        void syncCursorPassthroughFromMain();
      }
    }

    lastRenderedMode = mode;
    return state;
  }

  function renderStartMapPromptControls(state) {
    if (!elements.startForm) {
      return;
    }

    const showForm = state.mode === 'start-map-prompt' && state.visibility !== 'hidden';
    elements.startForm.hidden = !showForm;
    if (!showForm) {
      return;
    }

    const prompt = state.startMapPrompt || {};
    if (elements.startMapName && document.activeElement !== elements.startMapName) {
      elements.startMapName.value = prompt.mapName || state.primaryLine || 'Unknown Map';
    }

    if (elements.startFarmType) {
      const farmTypeOptions = normalizeFarmTypeOptions(prompt.farmTypeOptions);
      const selectedFarmTypeId = farmTypeOptions.some((entry) => entry.id === prompt.farmTypeId)
        ? prompt.farmTypeId
        : '';
      elements.startFarmType.innerHTML = [
        '<option value="">No farm type</option>',
        ...farmTypeOptions.map((entry) => `<option value="${escapeAttribute(entry.id)}">${escapeHTML(entry.label)}</option>`)
      ].join('');
      elements.startFarmType.value = selectedFarmTypeId;
    }
  }

  function escapeHTML(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttribute(value) {
    return escapeHTML(value);
  }

  function getStartMapPromptPayload() {
    return {
      mapName: String(elements.startMapName?.value || '').trim() || 'Unknown Map',
      farmTypeId: String(elements.startFarmType?.value || '').trim() || null
    };
  }

  function setStartMapPromptBusy(busy) {
    [elements.startMapName, elements.startFarmType, elements.startSubmit, elements.startCancel]
      .filter(Boolean)
      .forEach((element) => {
        element.disabled = busy;
      });
  }

  root.JuiceOverlay = {
    renderState
  };

  root.addEventListener('message', (event) => {
    if (event.data?.type === 'juice-journal-overlay-state') {
      renderState(event.data.payload);
    }
  });

  root.addEventListener('mousemove', syncInteractivePassthrough);
  root.addEventListener('mouseleave', () => {
    setPointerPassthrough(isStartMapPromptVisible() ? false : true);
  });

  if (elements.pin) {
    elements.pin.addEventListener('click', async () => {
      if (typeof root.electronAPI?.toggleMapResultOverlayPin !== 'function') {
        return;
      }

      elements.pin.disabled = true;
      try {
        await root.electronAPI.toggleMapResultOverlayPin();
      } finally {
        elements.pin.disabled = false;
        setPointerPassthrough(true);
      }
    });
  }

  if (elements.dismiss) {
    elements.dismiss.addEventListener('click', async () => {
      if (typeof root.electronAPI?.dismissMapResultOverlay !== 'function') {
        return;
      }

      elements.dismiss.disabled = true;
      try {
        await root.electronAPI.dismissMapResultOverlay();
      } finally {
        elements.dismiss.disabled = false;
        setPointerPassthrough(true);
      }
    });
  }

  if (elements.startForm) {
    elements.startForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (typeof root.electronAPI?.confirmStartMapPromptOverlay !== 'function') {
        return;
      }

      setStartMapPromptBusy(true);
      try {
        await root.electronAPI.confirmStartMapPromptOverlay(getStartMapPromptPayload());
      } finally {
        setStartMapPromptBusy(false);
      }
    });
  }

  if (elements.startCancel) {
    elements.startCancel.addEventListener('click', async () => {
      if (typeof root.electronAPI?.cancelStartMapPromptOverlay !== 'function') {
        return;
      }

      setStartMapPromptBusy(true);
      try {
        await root.electronAPI.cancelStartMapPromptOverlay();
      } finally {
        setStartMapPromptBusy(false);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      renderState(root.__JUICE_OVERLAY_INITIAL_STATE__ || null);
    }, { once: true });
  } else {
    renderState(root.__JUICE_OVERLAY_INITIAL_STATE__ || null);
  }
})(window);
