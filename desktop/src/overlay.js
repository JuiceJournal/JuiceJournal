(function initializeOverlay(root) {
  const elements = {
    html: document.documentElement,
    card: document.querySelector('[data-overlay-state]'),
    primary: document.querySelector('[data-overlay-primary]'),
    secondary: document.querySelector('[data-overlay-secondary]'),
    meta: document.querySelector('[data-overlay-meta]')
  };

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

  function setText(element, value) {
    if (element) {
      element.textContent = value || '';
    }
  }

  function renderState(input) {
    const state = deriveState(input);
    const visibility = state.visibility || 'waiting';

    if (elements.html) {
      elements.html.dataset.overlayVisibility = visibility;
    }

    if (elements.card) {
      elements.card.dataset.overlayState = visibility;
      elements.card.hidden = visibility === 'hidden';
    }

    setText(elements.primary, state.primaryLine);
    setText(elements.secondary, state.secondaryLine);
    setText(elements.meta, state.metaLine);

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      renderState(root.__JUICE_OVERLAY_INITIAL_STATE__ || null);
    }, { once: true });
  } else {
    renderState(root.__JUICE_OVERLAY_INITIAL_STATE__ || null);
  }
})(window);
