(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.nativeBridgeCommandModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createNativeBridgeCommandModel() {
  function hasRequiredString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function normalizeOptionalString(value) {
    return hasRequiredString(value) ? value.trim() : null;
  }

  function normalizeCharacterEntry(character) {
    if (!character || typeof character !== 'object' || Array.isArray(character)) {
      return null;
    }

    if (!hasRequiredString(character.poeVersion)
      || !hasRequiredString(character.characterId)
      || !hasRequiredString(character.characterName)) {
      return null;
    }

    const normalizedVersion = character.poeVersion.trim().toLowerCase();
    if (normalizedVersion !== 'poe1' && normalizedVersion !== 'poe2') {
      return null;
    }

    return {
      poeVersion: normalizedVersion,
      characterId: character.characterId.trim(),
      characterName: character.characterName.trim(),
      className: normalizeOptionalString(character.className),
      ascendancy: normalizeOptionalString(character.ascendancy),
      level: Number.isInteger(character.level) ? character.level : null,
      league: normalizeOptionalString(character.league)
    };
  }

  function buildCharacterPoolCommand(characters = []) {
    return {
      type: 'set-character-pool',
      detectedAt: new Date().toISOString(),
      characters: Array.isArray(characters)
        ? characters.map(normalizeCharacterEntry).filter(Boolean)
        : []
    };
  }

  return {
    buildCharacterPoolCommand
  };
});
