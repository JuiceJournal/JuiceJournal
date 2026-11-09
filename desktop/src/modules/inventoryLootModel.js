/**
 * Inventory Loot Model
 * Decides what a map earned from two inventory reads: the last one before the map and the first one after it.
 * A read is { items: { name: quantity }, cells: { position: cell } }. A cell holds { name, quantity, digits } or
 * { unknown: true } for something unread, such as gear or an item the reader was not sure of, and { unknown: true,
 * covered: true } for a cell under a tooltip. An empty cell has no entry.
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

const hasLook = (cell) => Boolean(cell.unknown && !cell.covered && Array.isArray(cell.candidates) && cell.candidates.length);

// How many items a read holds that could be any of `names`: stacks read by name and unread stacks that looked like one.
function couldBe(read, names) {
  let total = 0;
  for (const cell of Object.values(read.cells)) {
    if (cell.name && names.includes(cell.name)) total += cell.quantity || 1;
    else if (hasLook(cell) && cell.candidates.some((name) => names.includes(name))) total += cell.quantity || 1;
  }
  return total;
}

/**
 * What the map left unread: { candidates, other }. Any doubt counts less, so a one-click offer is made in one case only:
 * an unread stack in a cell that was empty before the map, that looked like items nothing in the baseline could be (so
 * it is not a stack moved there). Its offer is its own look and stack size. Anything else that may be unread loot is
 * `other`, for the note only: an unread stack that grew or changed in place, a new one that could be a moved stack and
 * outgrew what the baseline held of its names, a stack that grew where the named count does not trust it (unread before,
 * or first seen without digits), something unread with no look in a cell that was empty or held a known stack, and offers
 * past the ten a run keeps. A tooltip over a cell (covered) tells nothing.
 */
function unreadLoot(before = EMPTY_READ, after = EMPTY_READ) {
  const offers = new Map();
  let other = false;
  for (const [position, cell] of Object.entries(after.cells)) {
    const earlier = before.cells[position];
    if (cell.unknown && !cell.covered) {
      if (!hasLook(cell)) {
        // New, or where a stack the reader named or recognised stood: what the cell holds now is not known.
        if (!earlier || earlier.name || hasLook(earlier)) other = true;
        continue;
      }
      if (earlier) {
        const earlierNames = earlier.name ? [earlier.name] : (hasLook(earlier) ? earlier.candidates : []);
        const same = earlierNames.some((name) => cell.candidates.includes(name));
        if (!same || (cell.quantity || 1) > (earlier.quantity || 0)) other = true;
        continue;
      }
      if (couldBe(before, cell.candidates) > 0) {
        if (couldBe(after, cell.candidates) > couldBe(before, cell.candidates)) other = true;
        continue;
      }
      const key = JSON.stringify(cell.candidates);
      const offer = offers.get(key) || { names: cell.candidates.slice(0, 2), quantity: 0 };
      offer.quantity += cell.quantity || 1;
      offers.set(key, offer);
    } else if (cell.name && earlier && cell.quantity > (earlier.quantity || 0)
      && ((earlier.unknown && !earlier.covered) || (earlier.name === cell.name && !earlier.digits && cell.digits))) {
      // A stack that grew where the named count does not trust the growth: it was unread before, or first seen without
      // its digits.
      other = true;
    }
  }
  const candidates = [...offers.values()];
  if (candidates.length > 10) other = true;
  return { candidates: candidates.slice(0, 10), other };
}

function unreadCandidates(before = EMPTY_READ, after = EMPTY_READ) {
  return unreadLoot(before, after).candidates;
}

function hasNewUnreadItem(before = EMPTY_READ, after = EMPTY_READ) {
  const { candidates, other } = unreadLoot(before, after);
  return candidates.length > 0 || other;
}

function unreadOutcome(before, after) {
  const { candidates, other } = unreadLoot(before, after);
  return { unread: candidates.length > 0 || other, unreadCandidates: candidates, unreadOther: other };
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
 * { type: 'gain', sessionId, items, mapCount, unread } when it settles a finished map (unread: new items were left
 * unread), and { type: 'noBaseline', sessionId } when
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
        mapCount: Math.max(1, mapCount),
        ...unreadOutcome(pending.baseline, read)
      }
      : { type: 'noBaseline', sessionId: pending.sessionId }
  };
}

module.exports = {
  createInventoryLootState,
  getCharacterKey,
  diffInventory,
  hasNewUnreadItem,
  unreadCandidates,
  unreadLoot,
  noteMapEntered,
  markSessionEnded,
  applyInventoryRead
};
