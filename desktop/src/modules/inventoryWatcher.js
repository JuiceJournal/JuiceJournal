/**
 * Inventory Watcher
 * Reads the player's inventory whenever it is open outside a map, keeps the last read as the baseline for the next
 * map and settles a finished map on the first read after it. The read hotkey does the same on demand and says why
 * when it cannot.
 */

const {
  getGridRect,
  hasInventoryLayout,
  readInventory
} = require('./inventoryVision');
const {
  createInventoryLootState,
  getCharacterKey,
  markSessionEnded,
  applyInventoryRead
} = require('./inventoryLootModel');

const ART_BATCH_SIZE = 40;
// Icons that still have not arrived by then are left out, so a slow download cannot hold reading back for good.
const ART_WAIT_MS = 60_000;
const CELL_CACHE_LIMIT = 512;

function sameItems(left = {}, right = {}) {
  const leftNames = Object.keys(left);
  return leftNames.length === Object.keys(right).length && leftNames.every((name) => left[name] === right[name]);
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
   * @param {function(string): object} deps.loadBaselines
   * @param {function(string, object): void} deps.saveBaselines
   * @param {function(string, Array): void} deps.onGain - A finished map's session id and its new items
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
      this.state = createInventoryLootState(profileId ? this.deps.loadBaselines(profileId) : {});
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

  getGrid(game) {
    const gameWindow = this.deps.getGameWindow();
    return gameWindow && !gameWindow.minimized ? getGridRect(game, gameWindow) : null;
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
  applyRead(game, items, { announce }) {
    const characterKey = getCharacterKey(game, this.deps.getCharacter());
    const changed = !sameItems(this.state.baselines[characterKey], items) || !this.state.baselines[characterKey];
    if (!announce && !changed && !this.state.pending) {
      return;
    }

    const { state, outcome } = applyInventoryRead(this.state, { characterKey, items });
    this.state = state;
    if (changed && this.profileId) {
      this.deps.saveBaselines(this.profileId, state.baselines);
    }

    if (!outcome) {
      if (announce) this.deps.onStatus('saved');
    } else if (outcome.type === 'noBaseline') {
      this.deps.onStatus('noBaseline');
    } else if (outcome.items.length === 0) {
      this.deps.onStatus('noGain');
    } else {
      this.deps.onStatus('reading');
      this.deps.onGain(outcome.sessionId, outcome.items);
    }
  }

  // The timer's step. Costs one small screen read while the game is in front outside a map, and nothing otherwise.
  tick() {
    if (!this.deps.isEnabled() || !this.syncProfile() || !this.deps.isGameInFront() || this.deps.isInMap()) {
      return;
    }

    const game = this.deps.getGame();
    if (!game || !hasInventoryLayout(game) || !this.warmArt(game)) {
      return;
    }

    const grid = this.getGrid(game);
    const result = grid ? this.readGrid(grid) : null;
    if (result?.open && !result.covered) {
      this.applyRead(game, result.items, { announce: false });
    }
  }

  // The read hotkey. Status kinds: unsupported, inMap, notReady, failed, notOpen, covered, saved, noBaseline, noGain, reading.
  readNow() {
    if (!this.syncProfile()) {
      return;
    }

    const game = this.deps.getGame();
    if (!game || !hasInventoryLayout(game)) {
      this.deps.onStatus('unsupported');
      return;
    }
    if (this.deps.isInMap()) {
      this.deps.onStatus('inMap');
      return;
    }
    if (!this.warmArt(game)) {
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
      this.applyRead(game, result.items, { announce: true });
    }
  }

  // Returns whether the finished map can still get its loot from a read.
  sessionEnded(session) {
    const game = session?.poeVersion;
    if (!session?.id || !hasInventoryLayout(game) || !this.syncProfile()) {
      return false;
    }

    this.state = markSessionEnded(this.state, {
      sessionId: session.id,
      characterKey: getCharacterKey(game, this.deps.getCharacter())
    });
    return true;
  }
}

module.exports = InventoryWatcher;
