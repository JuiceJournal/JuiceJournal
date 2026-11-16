(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.coachModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCoachModel() {
  // The first-map steps: what a new player does, in order, until one map's loot has been counted. Main works the facts
  // out, and the Dashboard and the overlay show the step with the text of its message key (coach.msg.<message>).
  const COACH_STEPS = ['game', 'ready', 'inventory', 'map', 'count'];
  // The messages the overlay shows in place of its idle card: something to do in the game now, or a short wait. A step
  // the player cannot get past from inside the game (reading turned off, a window at another size) stays on the
  // Dashboard, and so does a running map, which has the overlay's own card.
  const COACH_OVERLAY_MESSAGES = ['character', 'loading', 'goHideout', 'openInventory', 'runMap', 'count', 'countInHideout'];

  // `wait` is a step the app is busy with or the game has to get to; `do` is one the player acts on.
  function at(step, message, status) {
    return { step, index: COACH_STEPS.indexOf(step) + 1, total: COACH_STEPS.length, message, status };
  }

  /**
   * @param {object} facts
   * @param {boolean} facts.done - A map's loot was counted once for this profile
   * @param {boolean} facts.hidden - The player hid the steps
   * @param {('poe1'|'poe2'|null)} facts.game - The running game
   * @param {boolean} facts.readingEnabled - The inventory reading setting
   * @param {boolean} facts.hasCharacter
   * @param {boolean} facts.windowUnmeasured - The game window is at a size reading has not been checked on
   * @param {boolean} facts.artReady - Prices and item art are loaded for the game
   * @param {boolean} facts.inMap
   * @param {boolean} facts.inHub - In a hideout, or where maps start
   * @param {boolean} facts.hasBaseline - The inventory was read for this character
   * @param {boolean} facts.mapWaiting - A finished map waits for the read that counts its loot. A map entered before any
   *   read cannot be counted, so it does not wait: the next read is the first one
   * @returns {(object|null)} Null when there is nothing to show
   */
  function deriveCoach(facts = {}) {
    if (facts.hidden) {
      return null;
    }
    if (facts.done) {
      return { step: 'done', index: COACH_STEPS.length, total: COACH_STEPS.length, message: 'done', status: 'done' };
    }
    if (!facts.game) {
      return at('game', 'game', 'do');
    }
    // Path of Exile 1 has no loot source, so there is no inventory to walk the player through.
    if (facts.game === 'poe1') {
      return { step: 'poe1', index: 0, total: 0, message: 'poe1', status: 'info' };
    }
    if (!facts.readingEnabled) {
      return at('ready', 'readingOff', 'do');
    }
    if (!facts.hasCharacter) {
      return at('ready', 'character', 'wait');
    }
    if (facts.windowUnmeasured) {
      return at('ready', 'resolution', 'do');
    }
    if (!facts.artReady) {
      return at('ready', 'loading', 'wait');
    }
    if (facts.inMap) {
      return facts.hasBaseline ? at('map', 'inMap', 'wait') : at('map', 'mapUncounted', 'wait');
    }
    if (facts.mapWaiting) {
      return at('count', facts.inHub ? 'count' : 'countInHideout', 'do');
    }
    if (!facts.hasBaseline) {
      return at('inventory', facts.inHub ? 'openInventory' : 'goHideout', 'do');
    }
    return at('map', 'runMap', 'do');
  }

  return { COACH_STEPS, COACH_OVERLAY_MESSAGES, deriveCoach };
});
