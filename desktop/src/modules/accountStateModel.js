(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.accountStateModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createAccountStateModel() {
  function normalizeString(value) {
    const normalized = String(value ?? '').trim();
    return normalized || null;
  }

  function normalizeLevel(value) {
    const level = Number(value || 0);
    return Number.isFinite(level) ? level : 0;
  }

  function normalizeCharacter(character) {
    if (!character || typeof character !== 'object') {
      return null;
    }

    return {
      id: normalizeString(character.id ?? character.characterId),
      name: normalizeString(character.name),
      level: normalizeLevel(character.level),
      className: normalizeString(character.className ?? character.class),
      ascendancy: normalizeString(character.ascendancy),
      league: normalizeString(character.league)
    };
  }

  function normalizeCharacters(characters) {
    if (!Array.isArray(characters)) {
      return [];
    }

    return characters
      .map(normalizeCharacter)
      .filter(Boolean);
  }

  function deriveAccountState({
    accountName,
    selectedCharacterId,
    selectedCharacter: selectedCharacterPayload,
    characters = []
  } = {}) {
    const normalizedCharacters = normalizeCharacters(characters);
    const normalizedSelectedCharacter = normalizeCharacter(selectedCharacterPayload);
    const normalizedSelectedCharacterId = normalizeString(
      selectedCharacterId ?? selectedCharacterPayload?.id ?? selectedCharacterPayload?.characterId
    );

    const selectedCharacter = normalizedCharacters.find((character) => (
      normalizedSelectedCharacterId && character.id === normalizedSelectedCharacterId
    )) || normalizedSelectedCharacter || normalizedCharacters[0] || null;

    return {
      accountName: normalizeString(accountName),
      characters: normalizedCharacters,
      selectedCharacter,
      summary: selectedCharacter
        ? {
          status: 'ready',
          id: selectedCharacter.id,
          name: selectedCharacter.name,
          level: selectedCharacter.level,
          className: selectedCharacter.className,
          ascendancy: selectedCharacter.ascendancy,
          league: selectedCharacter.league
        }
        : { status: 'no_character_selected' }
    };
  }

  return {
    deriveAccountState
  };
});
