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

  function normalizeAccountHint(accountHint) {
    if (!accountHint || typeof accountHint !== 'object' || Array.isArray(accountHint)) {
      return null;
    }

    if (!hasRequiredString(accountHint.poeVersion) || !hasRequiredString(accountHint.characterName)) {
      return null;
    }

    const normalizedVersion = accountHint.poeVersion.trim().toLowerCase();
    if (normalizedVersion !== 'poe1' && normalizedVersion !== 'poe2') {
      return null;
    }

    return {
      poeVersion: normalizedVersion,
      characterName: accountHint.characterName.trim(),
      className: normalizeOptionalString(accountHint.className),
      level: Number.isInteger(accountHint.level) ? accountHint.level : null
    };
  }

  function buildCharacterPoolCommand(characters = [], accountHint = null) {
    return {
      type: 'set-character-pool',
      detectedAt: new Date().toISOString(),
      characters: Array.isArray(characters)
        ? characters.map(normalizeCharacterEntry).filter(Boolean)
        : [],
      accountHint: normalizeAccountHint(accountHint)
    };
  }

  return {
    buildCharacterPoolCommand
  };
});
