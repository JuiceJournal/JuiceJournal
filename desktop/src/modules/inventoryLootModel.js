/**
 * Inventory Loot Model
 * Decides what a map earned from two inventory reads: the last one before the map and the first one after it.
 *
 * The baseline has to be the inventory last seen before the map. Against an older read, stacks the player put in the
 * stash and then found again would look like no gain at all.
 */

function createInventoryLootState(baselines = {}) {
  return { baselines: { ...baselines }, pending: null };
}

function getCharacterKey(poeVersion, character) {
  return `${poeVersion}:${character?.id || character?.name || 'unknown'}`;
}

// Items only count when there are more of them than before. Fewer means they were used or stashed, not looted.
function diffInventory(before = {}, after = {}) {
  return Object.entries(after)
    .map(([name, quantity]) => ({ name, quantity: quantity - (before[name] || 0) }))
    .filter((item) => item.quantity > 0);
}

// A map ended: its loot is the difference the next read shows. A second map ending first takes over the wait, so a
// read after two maps goes to the newer one.
function markSessionEnded(state, { sessionId, characterKey }) {
  return {
    ...state,
    pending: { sessionId, characterKey, baseline: state.baselines[characterKey] || null }
  };
}

/**
 * Applies an inventory read and returns { state, outcome }. Outcome is null when the read only refreshes the baseline,
 * { type: 'gain', sessionId, items } when it settles a finished map, and { type: 'noBaseline', sessionId } when that
 * map started before any read, so its loot cannot be told from what was already carried.
 */
function applyInventoryRead(state, { characterKey, items }) {
  const baselines = { ...state.baselines, [characterKey]: items };
  const { pending } = state;
  if (!pending || pending.characterKey !== characterKey) {
    return { state: { baselines, pending: null }, outcome: null };
  }

  return {
    state: { baselines, pending: null },
    outcome: pending.baseline
      ? { type: 'gain', sessionId: pending.sessionId, items: diffInventory(pending.baseline, items) }
      : { type: 'noBaseline', sessionId: pending.sessionId }
  };
}

module.exports = {
  createInventoryLootState,
  getCharacterKey,
  diffInventory,
  markSessionEnded,
  applyInventoryRead
};
