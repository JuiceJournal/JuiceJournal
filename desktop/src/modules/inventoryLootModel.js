/**
 * Inventory Loot Model
 * Decides what a map earned from two inventory reads: the last one before the map and the first one after it.
 * A read is { items: { name: quantity }, cells: { position: cell } }. A cell holds { name, quantity, digits } or
 * { unknown: true } for something unread, such as gear or an item under a tooltip. An empty cell has no entry.
 *
 * The baseline has to be the inventory last seen before the map. Against an older read, stacks the player put in the
 * stash and then found again would look like no gain at all.
 */

const EMPTY_READ = { items: {}, cells: {} };

function createInventoryLootState() {
  return { baselines: {}, pending: null, mapsSinceRead: {} };
}

// Null until the character is known: another character's inventory would count as this one's loot.
function getCharacterKey(poeVersion, character) {
  const identity = character?.id || character?.name;
  return identity ? `${poeVersion}:${identity}` : null;
}

// How much of an item can be trusted as new, cell by cell. A cell that held something unread or something else before
// may have held this item all along, read wrongly, and a stack first seen without digits may have been missed.
function countTrustedGain(before, after) {
  const trusted = {};
  for (const [position, cell] of Object.entries(after.cells)) {
    if (!cell.name) continue;
    const earlier = before.cells[position];
    let gain = 0;
    if (!earlier) {
      gain = cell.quantity;
    } else if (earlier.name === cell.name && (earlier.digits || !cell.digits)) {
      gain = cell.quantity - earlier.quantity;
    }
    trusted[cell.name] = (trusted[cell.name] || 0) + Math.max(0, gain);
  }
  return trusted;
}

// Items only count when there are more of them than before, in cells that can be trusted. Fewer means they were used
// or stashed, not looted. Any doubt falls on the side of counting less.
function diffInventory(before = EMPTY_READ, after = EMPTY_READ) {
  const trusted = countTrustedGain(before, after);
  return Object.entries(after.items)
    .map(([name, quantity]) => ({
      name,
      quantity: Math.min(quantity - (before.items[name] || 0), trusted[name] || 0)
    }))
    .filter((item) => item.quantity > 0);
}

function noteMapEntered(state, characterKey) {
  return {
    ...state,
    mapsSinceRead: { ...state.mapsSinceRead, [characterKey]: (state.mapsSinceRead[characterKey] || 0) + 1 }
  };
}

// A map ended: its loot is the difference the next read shows. A newer map ending first takes over the wait, so a read
// after several maps goes to the newest one and says how many maps it covers.
function markSessionEnded(state, { sessionId, characterKey }) {
  return {
    ...state,
    pending: { sessionId, characterKey, baseline: state.baselines[characterKey] || null }
  };
}

/**
 * Applies an inventory read and returns { state, outcome }. Outcome is null when the read only refreshes the baseline,
 * { type: 'gain', sessionId, items, mapCount } when it settles a finished map, and { type: 'noBaseline', sessionId } when
 * that map started before any read, so its loot cannot be told from what was already carried. A read of another
 * character leaves a waiting map alone.
 */
function applyInventoryRead(state, { characterKey, read }) {
  const mapCount = state.mapsSinceRead[characterKey] || 0;
  const next = {
    baselines: { ...state.baselines, [characterKey]: read },
    mapsSinceRead: { ...state.mapsSinceRead, [characterKey]: 0 }
  };
  const { pending } = state;
  if (!pending || pending.characterKey !== characterKey) {
    return { state: { ...next, pending }, outcome: null };
  }

  return {
    state: { ...next, pending: null },
    outcome: pending.baseline
      ? {
        type: 'gain',
        sessionId: pending.sessionId,
        items: diffInventory(pending.baseline, read),
        mapCount: Math.max(1, mapCount)
      }
      : { type: 'noBaseline', sessionId: pending.sessionId }
  };
}

module.exports = {
  createInventoryLootState,
  getCharacterKey,
  diffInventory,
  noteMapEntered,
  markSessionEnded,
  applyInventoryRead
};
