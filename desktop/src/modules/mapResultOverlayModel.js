(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.mapResultOverlayModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMapResultOverlayModel() {
  function createHiddenState() {
    return {
      visible: false,
      pinned: false,
      result: null,
      tone: 'neutral'
    };
  }

  function normalizeTone(value) {
    return value === 'positive' || value === 'negative' || value === 'neutral'
      ? value
      : 'neutral';
  }

  function deriveMapResultOverlayState({
    overlayEnabled = false,
    completedResult = null,
    currentOverlayState = {},
    now = Date.now(),
    durationMs = 10_000
  } = {}) {
    if (overlayEnabled !== true) {
      return createHiddenState();
    }

    if (completedResult) {
      return {
        visible: true,
        pinned: false,
        result: completedResult,
        tone: normalizeTone(completedResult.profitState),
        dismissAt: now + durationMs
      };
    }

    if (currentOverlayState?.pinned && currentOverlayState?.result) {
      return {
        ...currentOverlayState,
        visible: true,
        tone: normalizeTone(currentOverlayState.tone || currentOverlayState.result?.profitState)
      };
    }

    if (currentOverlayState?.dismissAt && now < currentOverlayState.dismissAt && currentOverlayState?.result) {
      return {
        ...currentOverlayState,
        visible: true,
        pinned: false,
        tone: normalizeTone(currentOverlayState.tone || currentOverlayState.result?.profitState)
      };
    }

    return createHiddenState();
  }

  return {
    deriveMapResultOverlayState
  };
});
