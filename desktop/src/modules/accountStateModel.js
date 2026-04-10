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

  function flattenCachedCharacters(cachedAccountState) {
    const directCharacters = normalizeCharacters(cachedAccountState?.characters);
    const groupedCharacters = [
      ...normalizeCharacters(cachedAccountState?.charactersByGame?.poe1),
      ...normalizeCharacters(cachedAccountState?.charactersByGame?.poe2)
    ];
    const byId = new Map();

    [...directCharacters, ...groupedCharacters].forEach((character) => {
      if (character?.id && !byId.has(character.id)) {
        byId.set(character.id, character);
      }
    });

    return Array.from(byId.values());
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
    characters = [],
    cachedAccountState = null
  } = {}) {
    const normalizedCharacters = normalizeCharacters(characters);
    const cachedCharacters = flattenCachedCharacters(cachedAccountState);
    const normalizedSelectedCharacter = normalizeCharacter(selectedCharacterPayload);
    const normalizedActivePoeVersion = normalizePoeVersion(activePoeVersion);
    const allCharacters = normalizedCharacters.length ? normalizedCharacters : cachedCharacters;
    const charactersByGame = groupCharactersByGame(allCharacters);
    const normalizedSelectedCharacterId = normalizeString(
      (normalizedActivePoeVersion ? selectedCharacterByGame[normalizedActivePoeVersion] : null)
        ?? (normalizedActivePoeVersion ? cachedAccountState?.selectedCharacterByGame?.[normalizedActivePoeVersion] : null)
        ?? selectedCharacterId
        ?? selectedCharacterPayload?.id
        ?? selectedCharacterPayload?.characterId
    );
    const activeGameCharacters = normalizedActivePoeVersion
      ? charactersByGame[normalizedActivePoeVersion]
      : [];

    const selectedCharacter = findCharacterById(activeGameCharacters, normalizedSelectedCharacterId)
      || findCharacterById(allCharacters, normalizedSelectedCharacterId)
      || (normalizedSelectedCharacter?.poeVersion === normalizedActivePoeVersion ? normalizedSelectedCharacter : null)
      || activeGameCharacters[0]
      || normalizedSelectedCharacter
      || allCharacters[0]
      || null;

    return {
      accountName: normalizeString(accountName) || normalizeString(cachedAccountState?.accountName),
      characters: allCharacters,
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

  function createAccountStateCache(accountState = {}) {
    const characters = normalizeCharacters(accountState.characters);
    const selectedCharacter = normalizeCharacter(accountState.selectedCharacter);
    const byId = new Map();

    characters.forEach((character) => {
      if (character?.id) {
        byId.set(character.id, character);
      }
    });

    if (selectedCharacter?.id && !byId.has(selectedCharacter.id)) {
      byId.set(selectedCharacter.id, selectedCharacter);
    }

    const allCharacters = Array.from(byId.values());
    const charactersByGame = groupCharactersByGame(allCharacters);
    const selectedCharacterByGame = {};

    ['poe1', 'poe2'].forEach((poeVersion) => {
      const selectedForGame = selectedCharacter?.poeVersion === poeVersion
        ? selectedCharacter
        : null;
      const fallbackForGame = charactersByGame[poeVersion][0] || null;
      const chosen = selectedForGame || fallbackForGame;
      if (chosen?.id) {
        selectedCharacterByGame[poeVersion] = chosen.id;
      }
    });

    return {
      accountName: normalizeString(accountState.accountName),
      characters: allCharacters,
      charactersByGame,
      selectedCharacterByGame,
      cachedAt: new Date().toISOString()
    };
  }

  return {
    deriveAccountState,
    createAccountStateCache
  };
});
