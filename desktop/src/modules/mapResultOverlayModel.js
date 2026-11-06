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

  const MAX_DROPS = 3;
  const BASE_CARD_HEIGHT = 112;
  // Measured in the overlay: the list adds 4px of gap, 22px per row and 3px between rows. The window is clickable while
  // the card shows, so it grows by exactly that and leaves no extra transparent strip over the game.
  const DROP_LIST_GAP = 4;
  const DROP_ROW_HEIGHT = 22;
  const DROP_ROW_GAP = 3;

  // The drops the card lists: the first few top outputs that have a name and are worth something.
  function getMapResultDrops(result) {
    const outputs = Array.isArray(result?.topOutputs) ? result.topOutputs : [];
    return outputs
      .filter((output) => output && typeof output.label === 'string' && output.label.trim() && Number(output.valueDelta) > 0)
      .slice(0, MAX_DROPS)
      .map((output) => ({
        label: output.label,
        quantity: Math.max(1, Math.floor(Number(output.quantityDelta)) || 1),
        valueDelta: Number(output.valueDelta),
        icon: typeof output.icon === 'string' ? output.icon : ''
      }));
  }

  // The overlay window grows by one row per listed drop.
  function getMapResultCardHeight(result) {
    const rows = getMapResultDrops(result).length;
    return rows === 0
      ? BASE_CARD_HEIGHT
      : BASE_CARD_HEIGHT + DROP_LIST_GAP + DROP_ROW_HEIGHT * rows + DROP_ROW_GAP * (rows - 1);
  }

  return {
    deriveMapResultOverlayState,
    getMapResultDrops,
    getMapResultCardHeight
  };
});
