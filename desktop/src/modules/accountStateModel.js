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

  function normalizePoeVersion(version) {
    const normalized = normalizeString(version)?.toLowerCase();
    return normalized === 'poe1' || normalized === 'poe2' ? normalized : null;
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
      league: normalizeString(character.league),
      poeVersion: normalizePoeVersion(character.poeVersion ?? character.gameVersion ?? character.game)
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

  function groupCharactersByGame(characters) {
    return {
      poe1: characters.filter((character) => character.poeVersion === 'poe1'),
      poe2: characters.filter((character) => character.poeVersion === 'poe2')
    };
  }

  function findCharacterById(characters, characterId) {
    return characterId
      ? characters.find((character) => character.id === characterId) || null
      : null;
  }

  function deriveAccountState({
    accountName,
    activePoeVersion,
    selectedCharacterId,
    selectedCharacterByGame = {},
    selectedCharacter: selectedCharacterPayload,
    characters = []
  } = {}) {
    const normalizedCharacters = normalizeCharacters(characters);
    const normalizedSelectedCharacter = normalizeCharacter(selectedCharacterPayload);
    const normalizedActivePoeVersion = normalizePoeVersion(activePoeVersion);
    const charactersByGame = groupCharactersByGame(normalizedCharacters);
    const normalizedSelectedCharacterId = normalizeString(
      (normalizedActivePoeVersion ? selectedCharacterByGame[normalizedActivePoeVersion] : null)
        ?? selectedCharacterId
        ?? selectedCharacterPayload?.id
        ?? selectedCharacterPayload?.characterId
    );
    const activeGameCharacters = normalizedActivePoeVersion
      ? charactersByGame[normalizedActivePoeVersion]
      : [];

    const selectedCharacter = findCharacterById(activeGameCharacters, normalizedSelectedCharacterId)
      || findCharacterById(normalizedCharacters, normalizedSelectedCharacterId)
      || (normalizedSelectedCharacter?.poeVersion === normalizedActivePoeVersion ? normalizedSelectedCharacter : null)
      || activeGameCharacters[0]
      || normalizedSelectedCharacter
      || normalizedCharacters[0]
      || null;

    return {
      accountName: normalizeString(accountName),
      characters: normalizedCharacters,
      charactersByGame,
      activePoeVersion: normalizedActivePoeVersion,
      selectedCharacter,
      summary: selectedCharacter
        ? {
          status: 'ready',
          id: selectedCharacter.id,
          name: selectedCharacter.name,
          level: selectedCharacter.level,
          className: selectedCharacter.className,
          ascendancy: selectedCharacter.ascendancy,
          league: selectedCharacter.league,
          poeVersion: selectedCharacter.poeVersion || normalizedActivePoeVersion
        }
        : { status: 'no_character_selected' }
    };
  }

  return {
    deriveAccountState
  };
});
