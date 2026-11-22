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

  function normalizeCharacterIdByGame(value) {
    const result = {};
    ['poe1', 'poe2'].forEach((poeVersion) => {
      const characterId = normalizeString(value?.[poeVersion]);
      if (characterId) {
        result[poeVersion] = characterId;
      }
    });
    return result;
  }

  // League names match without case or surrounding spaces.
  function leagueKey(value) {
    return String(value ?? '').trim().toLowerCase();
  }

  // The character last confirmed in each league, per game: { poe2: { 'dawn': id } }. The Play prompt offers it for
  // its league, so a character of another league is one click away.
  function normalizeLastPlayedByLeague(value) {
    const result = {};
    ['poe1', 'poe2'].forEach((poeVersion) => {
      const leagues = {};
      Object.entries(value?.[poeVersion] && typeof value[poeVersion] === 'object' ? value[poeVersion] : {})
        .forEach(([league, characterId]) => {
          const key = leagueKey(league);
          const id = normalizeString(characterId);
          if (key && id) {
            leagues[key] = id;
          }
        });
      if (Object.keys(leagues).length) {
        result[poeVersion] = leagues;
      }
    });
    return result;
  }

  // The record with `character` as the last played of its league. A character with no league changes nothing.
  function recordLastPlayed(lastPlayedByLeague, poeVersion, character) {
    const current = normalizeLastPlayedByLeague(lastPlayedByLeague);
    const version = normalizePoeVersion(poeVersion);
    const key = leagueKey(character?.league);
    if (!version || !key || !character?.id) {
      return current;
    }
    return { ...current, [version]: { ...current[version], [key]: character.id } };
  }

  // Character names are unique within a realm, so a name from Client.txt maps to at most one own character.
  function findCharacterByName(accountState, poeVersion, name) {
    const normalizedName = normalizeString(name);
    const characters = accountState?.charactersByGame?.[normalizePoeVersion(poeVersion)] || [];
    return normalizedName
      ? characters.find((character) => character.name === normalizedName) || null
      : null;
  }

  // A level-up line in Client.txt is newer than any character list, so a logged level the list has not caught up with
  // wins. Levels only rise, so an old line read again never lowers one. Kept by id: a character remade under the same
  // name starts again from its own level.
  function withLoggedLevels(characters, loggedLevelsByGame = {}) {
    return characters.map((character) => {
      const logged = loggedLevelsByGame?.[character.poeVersion]?.[character.id];
      return Number.isFinite(logged) && logged > character.level ? { ...character, level: logged } : character;
    });
  }

  function deriveAccountState({
    accountName,
    activePoeVersion,
    selectedCharacterId,
    selectedCharacterByGame = {},
    selectedCharacter: selectedCharacterPayload,
    characters = [],
    cachedAccountState = null,
    loggedLevelsByGame = {}
  } = {}) {
    const normalizedCharacters = normalizeCharacters(characters);
    const cachedCharacters = flattenCachedCharacters(cachedAccountState);
    const [normalizedSelectedCharacter = null] = withLoggedLevels(
      [normalizeCharacter(selectedCharacterPayload)].filter(Boolean),
      loggedLevelsByGame
    );
    const normalizedActivePoeVersion = normalizePoeVersion(activePoeVersion);
    const allCharacters = withLoggedLevels(normalizedCharacters.length ? normalizedCharacters : cachedCharacters, loggedLevelsByGame);
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
    // The character last confirmed in game wins over the server's default pick (the highest level).
    const confirmedCharacterByGame = normalizeCharacterIdByGame(cachedAccountState?.confirmedCharacterByGame);

    const selectedCharacter = findCharacterById(activeGameCharacters, confirmedCharacterByGame[normalizedActivePoeVersion])
      || findCharacterById(activeGameCharacters, normalizedSelectedCharacterId)
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
      confirmedCharacterByGame,
      apiCurrentByGame: normalizeCharacterIdByGame(cachedAccountState?.apiCurrentByGame),
      lastPlayedByLeague: normalizeLastPlayedByLeague(cachedAccountState?.lastPlayedByLeague),
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
      confirmedCharacterByGame: normalizeCharacterIdByGame(accountState.confirmedCharacterByGame),
      apiCurrentByGame: normalizeCharacterIdByGame(accountState.apiCurrentByGame),
      lastPlayedByLeague: normalizeLastPlayedByLeague(accountState.lastPlayedByLeague),
      cachedAt: new Date().toISOString()
    };
  }

  // Characters this device fetched from GGG replace the account payload's list for that realm.
  function withDeviceCharacters(characters, deviceCharactersByGame = {}) {
    const realms = ['poe1', 'poe2'].filter((poeVersion) => Array.isArray(deviceCharactersByGame?.[poeVersion]));
    const accountCharacters = Array.isArray(characters) ? characters : [];

    return [
      ...accountCharacters.filter((character) => !realms.includes(normalizePoeVersion(character?.poeVersion))),
      ...realms.flatMap((poeVersion) => deviceCharactersByGame[poeVersion])
    ];
  }

  // Chips the Play prompt shows before its More chip, so a long character list does not crowd the card.
  const CHARACTER_PROMPT_CHIP_LIMIT = 6;

  // A run is priced in its character's league, so the Play prompt's first chips are the last played character, then
  // the last played of every other league the account has characters in (its highest level one when none was
  // recorded there), then the rest of the current league by level. More shows the rest, by level. `league` is set on
  // the characters of other leagues, as the label the card shows after the name. `lastPlayedByLeague` is this game's
  // record (see recordLastPlayed). With no league known it offers every character by level. No prompt when there is
  // nothing to choose.
  function buildCharacterPrompt({ characters = [], selectedId = null, league = null, lastPlayedByLeague = {} } = {}) {
    const currentLeague = leagueKey(league);
    const byLevel = (Array.isArray(characters) ? characters : [])
      .filter((character) => character?.id)
      .sort((a, b) => (b.level || 0) - (a.level || 0));
    if (!selectedId || byLevel.length < 2) {
      return null;
    }

    let ordered = byLevel;
    let firstCount = byLevel.length;
    if (currentLeague) {
      const selected = byLevel.find((character) => character.id === selectedId);
      const otherLeagues = [...new Set(byLevel.map((character) => leagueKey(character.league)))]
        .filter((key) => key && key !== currentLeague);
      const leaguePicks = otherLeagues
        .map((key) => {
          const inLeague = byLevel.filter((character) => leagueKey(character.league) === key);
          return inLeague.find((character) => character.id === lastPlayedByLeague?.[key]) || inLeague[0];
        })
        .filter((character) => character !== selected);
      const first = [
        ...(selected ? [selected] : []),
        ...leaguePicks,
        ...byLevel.filter((character) => character !== selected && leagueKey(character.league) === currentLeague)
      ];
      ordered = [...first, ...byLevel.filter((character) => !first.includes(character))];
      firstCount = first.length;
    }

    return {
      selectedId,
      shownCount: Math.min(firstCount, CHARACTER_PROMPT_CHIP_LIMIT),
      characters: ordered.map(({ id, name, className, level, league: characterLeague }) => ({
        id,
        name,
        className,
        level,
        league: currentLeague && leagueKey(characterLeague) !== currentLeague ? characterLeague : null
      }))
    };
  }

  return {
    deriveAccountState,
    createAccountStateCache,
    findCharacterByName,
    withDeviceCharacters,
    recordLastPlayed,
    buildCharacterPrompt
  };
});
