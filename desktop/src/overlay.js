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
    meta: document.querySelector('[data-overlay-meta]')
  };
  let passthroughEnabled = true;

  function getOverlayModel() {
    return root.overlayStateModel || null;
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
    const topOutput = Array.isArray(result.topOutputs) && result.topOutputs.length > 0
      ? result.topOutputs[0]
      : null;

    return {
      primaryLine: [result.farmType || 'Completed Map', formatSignedChaos(result.netProfit)].filter(Boolean).join(' · '),
      secondaryLine: topOutput
        ? `${topOutput.label || 'Top output'} ${formatSignedChaos(topOutput.valueDelta)}`
        : 'Completed map result',
      metaLine: formatDuration(result.durationSeconds),
      tone: state?.mapResult?.tone || 'neutral',
      pinned: state?.mapResult?.pinned === true
    };
  }

  function normalizeRuntimeState(state) {
    return {
      visibility: state.visibility || 'waiting',
      mode: 'runtime',
      tone: 'neutral',
      primaryLine: state.primaryLine || 'Waiting for game',
      secondaryLine: state.secondaryLine || 'Waiting for runtime session',
      metaLine: state.metaLine || '',
      pinned: false
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

  function syncInteractivePassthrough(event) {
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

    if (elements.html) {
      elements.html.dataset.overlayVisibility = visibility;
      elements.html.dataset.overlayMode = state.mode || 'runtime';
    }

    if (elements.card) {
      elements.card.dataset.overlayState = visibility;
      elements.card.dataset.overlayMode = state.mode || 'runtime';
      elements.card.dataset.overlayTone = state.tone || 'neutral';
      elements.card.hidden = visibility === 'hidden';
    }

    setText(elements.kickerLabel, state.mode === 'map-result' ? 'Map Result' : 'Juice Journal');
    setText(elements.primary, state.primaryLine);
    setText(elements.secondary, state.secondaryLine);
    setText(elements.meta, state.metaLine);
    if (elements.pin) {
      const showPin = state.mode === 'map-result' && visibility !== 'hidden';
      elements.pin.hidden = !showPin;
      elements.pin.setAttribute('aria-pressed', showPin && state.pinned ? 'true' : 'false');
      if (elements.dismiss) {
        elements.dismiss.hidden = !showPin;
      }
      if (!showPin) {
        setPointerPassthrough(true);
      } else {
        void syncCursorPassthroughFromMain();
      }
    }

    return state;
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
    setPointerPassthrough(true);
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      renderState(root.__JUICE_OVERLAY_INITIAL_STATE__ || null);
    }, { once: true });
  } else {
    renderState(root.__JUICE_OVERLAY_INITIAL_STATE__ || null);
  }
})(window);
