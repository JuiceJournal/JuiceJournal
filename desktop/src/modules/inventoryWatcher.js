/**
 * Inventory Watcher
 * Reads the player's inventory whenever it is open outside a map, keeps the last read as the baseline for the next
 * map and settles a finished map on the first read after it. The read hotkey does the same on demand and says why
 * when it cannot.
 *
 * Baselines stay in memory on purpose. One saved by an earlier run could predate maps played since, or come from a
 * different icon library, and either would count items as loot that were already there.
 */

const {
  getGridRect,
  hasInventoryLayout,
  isMeasuredWindow,
  readInventory
} = require('./inventoryVision');
const {
  createInventoryLootState,
  getCharacterKey,
  noteMapEntered,
  markSessionEnded,
  applyInventoryRead
} = require('./inventoryLootModel');

const ART_BATCH_SIZE = 40;
// Icons that still have not arrived by then are left out, so a slow download cannot hold reading back for good.
const ART_WAIT_MS = 60_000;
const CELL_CACHE_LIMIT = 512;

// Cells come back in reading order, so an unchanged read gives the same text.
function sameRead(left, right) {
  return Boolean(left) && JSON.stringify(left.cells) === JSON.stringify(right.cells);
}

class InventoryWatcher {
  /**
   * @param {object} deps
   * @param {function(): boolean} deps.isEnabled - Whether automatic reading is on
   * @param {function(): (string|null)} deps.getProfileId
   * @param {function(): (string|null)} deps.getGame - The running game: 'poe1', 'poe2' or null
   * @param {function(): boolean} deps.isGameInFront
   * @param {function(): boolean} deps.isInMap
   * @param {function(): (object|null)} deps.getGameWindow - Client rectangle in screen pixels
   * @param {function(number, number, number, number): (Uint8Array|null)} deps.readScreen - BGRA pixels of a screen area
   * @param {function(): (object|null)} deps.getCharacter
   * @param {function(string): {complete: boolean, items: Array}} deps.listPricedItems - Priced items as { name, icon }
   * @param {function(string): (string|null)} deps.getIconPath - Local file of an icon URL; a miss starts its download
   * @param {function(string): (object|null)} deps.loadArt - { coarse, fine } pixels of an icon file
   * @param {function(string, Array, number): void} deps.onGain - Session id, its new items and how many maps they cover
   * @param {function(string): void} deps.onStatus - Something the player should be told, see the kinds below
   * @param {function(): number} [deps.now]
   */
  constructor(deps) {
    this.deps = { now: Date.now, ...deps };
    this.profileId = null;
    this.state = createInventoryLootState();
    this.resetArt(null);
  }

  resetArt(game) {
    this.art = { game, items: new Map(), list: [], sealed: false, startedAt: null };
    this.cellCache = new Map();
  }

  syncProfile() {
    const profileId = this.deps.getProfileId();
    if (profileId !== this.profileId) {
      this.profileId = profileId;
      this.state = createInventoryLootState();
    }
    return profileId;
  }

  // Loads priced art a little at a time, then seals the library. Reads wait for that: an item missing from the library
  // would be missing from the baseline too, and would look like loot once its icon arrived.
  warmArt(game) {
    if (this.art.game !== game) {
      this.resetArt(game);
    }
    if (this.art.sealed) {
      return true;
    }

    const { complete, items } = this.deps.listPricedItems(game);
    if (!complete) {
      return false;
    }
    this.art.startedAt ??= this.deps.now();

    let loaded = 0;
    let waiting = 0;
    for (const item of items) {
      if (!item.icon || this.art.items.has(item.name)) continue;
      if (loaded >= ART_BATCH_SIZE) {
        waiting += 1;
        continue;
      }
      const iconPath = this.deps.getIconPath(item.icon);
      if (!iconPath) {
        waiting += 1;
        continue;
      }
      const art = this.deps.loadArt(iconPath);
      loaded += 1;
      if (art) this.art.items.set(item.name, { name: item.name, ...art });
    }

    if (waiting === 0 || this.deps.now() - this.art.startedAt >= ART_WAIT_MS) {
      this.art.list = [...this.art.items.values()];
      this.art.sealed = true;
    }
    return this.art.sealed;
  }

  // A window that is there and shown, at a size reading has not been checked on. Not finding it is not that: the lookup
  // can miss for a moment, and the game can be minimized.
  isWindowUnmeasured() {
    const gameWindow = this.deps.getGameWindow();
    return Boolean(gameWindow) && !gameWindow.minimized && !isMeasuredWindow(gameWindow);
  }

  getGrid(game) {
    const gameWindow = this.deps.getGameWindow();
    return gameWindow && !gameWindow.minimized && isMeasuredWindow(gameWindow) ? getGridRect(game, gameWindow) : null;
  }

  readGrid(grid) {
    const data = this.deps.readScreen(grid.x, grid.y, grid.width, grid.height);
    if (!data) {
      return null;
    }
    if (this.cellCache.size > CELL_CACHE_LIMIT) {
      this.cellCache.clear();
    }
    return readInventory({ data, width: grid.width, height: grid.height }, grid, this.art.list, this.cellCache);
  }

  // Applies a read of the open inventory and acts on what it settles.
  applyRead(characterKey, read, { announce }) {
    const { baselines, pending, mapsSinceRead } = this.state;
    const nothingNew = sameRead(baselines[characterKey], read)
      && pending?.characterKey !== characterKey
      && !mapsSinceRead[characterKey];
    if (!announce && nothingNew) {
      return;
    }

    const { state, outcome } = applyInventoryRead(this.state, { characterKey, read });
    this.state = state;

    if (!outcome) {
      if (announce) this.deps.onStatus('saved');
    } else if (outcome.type === 'noBaseline') {
      this.deps.onStatus('noBaseline');
    } else if (outcome.items.length === 0) {
      this.deps.onStatus('noGain');
    } else {
      this.deps.onStatus('reading');
      this.deps.onGain(outcome.sessionId, outcome.items, outcome.mapCount);
    }
  }

  // The timer's step. Costs one small screen read while the game is in front outside a map, and nothing otherwise.
  tick() {
    if (!this.deps.isEnabled() || !this.syncProfile() || !this.deps.isGameInFront() || this.deps.isInMap()) {
      return;
    }

    const game = this.deps.getGame();
    const characterKey = getCharacterKey(game, this.deps.getCharacter());
    if (!game || !characterKey || !hasInventoryLayout(game) || !this.warmArt(game)) {
      return;
    }

    const grid = this.getGrid(game);
    const result = grid ? this.readGrid(grid) : null;
    if (result?.open && !result.covered) {
      this.applyRead(characterKey, result, { announce: false });
    }
  }

  // The read hotkey. Status kinds: unsupported, resolution, inMap, notReady, failed, notOpen, covered, saved, noBaseline, noGain, reading.
  readNow() {
    if (!this.syncProfile()) {
      return;
    }

    const game = this.deps.getGame();
    if (!game || !hasInventoryLayout(game)) {
      this.deps.onStatus('unsupported');
      return;
    }
    if (this.isWindowUnmeasured()) {
      this.deps.onStatus('resolution');
      return;
    }
    if (this.deps.isInMap()) {
      this.deps.onStatus('inMap');
      return;
    }
    const characterKey = getCharacterKey(game, this.deps.getCharacter());
    if (!characterKey || !this.warmArt(game)) {
      this.deps.onStatus('notReady');
      return;
    }

    const grid = this.getGrid(game);
    const result = grid ? this.readGrid(grid) : null;
    if (!result) {
      this.deps.onStatus('failed');
    } else if (!result.open) {
      this.deps.onStatus('notOpen');
    } else if (result.covered) {
      this.deps.onStatus('covered');
    } else {
      this.applyRead(characterKey, result, { announce: true });
    }
  }

  mapEntered() {
    const characterKey = getCharacterKey(this.deps.getGame(), this.deps.getCharacter());
    if (characterKey) {
      this.state = noteMapEntered(this.state, characterKey);
    }
  }

  // Returns whether the finished map can still get its loot from a read.
  sessionEnded(session) {
    const game = session?.poeVersion;
    const characterKey = getCharacterKey(game, this.deps.getCharacter());
    if (!session?.id || !characterKey || !hasInventoryLayout(game) || !this.syncProfile() || this.isWindowUnmeasured()) {
      return false;
    }

    this.state = markSessionEnded(this.state, { sessionId: session.id, characterKey });
    return true;
  }
}

module.exports = InventoryWatcher;
