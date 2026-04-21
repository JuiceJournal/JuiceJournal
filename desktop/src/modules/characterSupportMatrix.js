(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.characterSupportMatrix = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCharacterSupportMatrix() {
  function normalizeString(value) {
    const normalized = String(value ?? '').trim();
    return normalized || null;
  }

  function normalizePoeVersion(value) {
    const normalized = normalizeString(value)?.toLowerCase();
    return normalized === 'poe1' || normalized === 'poe2' ? normalized : null;
  }

  function toSlug(value) {
    return normalizeString(value)
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || null;
  }

  function toToken(value) {
    return normalizeString(value)
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      || null;
  }

  function createBadgeText(value) {
    const stopWords = new Set(['of', 'the', 'and']);
    const parts = normalizeString(value)
      ?.split(/\s+/)
      .filter(Boolean) || [];
    const significantParts = parts.filter((part) => !stopWords.has(part.toLowerCase()));
    const tokenParts = significantParts.length ? significantParts : parts;

    if (tokenParts.length >= 2) {
      return `${tokenParts[0][0]}${tokenParts[1][0]}`.toUpperCase();
    }

    return (tokenParts[0] || '?')[0].toUpperCase();
  }

  function createEntry({
    poeVersion,
    baseClass,
    ascendancy = null,
    portraitKey,
    bannerKey,
    badgeText = createBadgeText(ascendancy || baseClass),
    tone,
    portraitPath,
    bannerPath,
  }) {
    const baseSlug = toSlug(baseClass);
    const ascendancySlug = toSlug(ascendancy);

    return {
      id: ascendancySlug
        ? `${poeVersion}:${baseSlug}:${ascendancySlug}`
        : `${poeVersion}:${baseSlug}`,
      poeVersion,
      baseClass,
      ascendancy,
      classLabel: ascendancy || baseClass,
      baseClassLabel: baseClass,
      detailLabel: ascendancy,
      portraitKey,
      bannerKey,
      badgeText,
      tone,
      portraitPath,
      bannerPath,
    };
  }

  function createAscendancySupportEntry({ poeVersion, baseClass, ascendancy, tone }) {
    const slug = toSlug(ascendancy);

    return createEntry({
      poeVersion,
      baseClass,
      ascendancy,
      portraitKey: slug,
      bannerKey: slug,
      tone,
      portraitPath: `assets/characters/${poeVersion}/${slug}.${poeVersion === 'poe1' ? 'jpg' : 'png'}`,
      bannerPath: `assets/characters/banners/${poeVersion}/${slug}.jpg`,
    });
  }

  const BASE_SUPPORT = [
    createEntry({
      poeVersion: 'poe1',
      baseClass: 'Duelist',
      portraitKey: 'duelist',
      bannerKey: 'duelist',
      badgeText: 'D',
      tone: 'brass',
      portraitPath: 'assets/characters/poe1/duelist.jpg',
      bannerPath: 'assets/characters/banners/poe1/duelist.jpg',
    }),
    createEntry({
      poeVersion: 'poe1',
      baseClass: 'Shadow',
      portraitKey: 'shadow',
      bannerKey: 'shadow',
      badgeText: 'S',
      tone: 'violet',
      portraitPath: 'assets/characters/poe1/shadow.jpg',
      bannerPath: 'assets/characters/banners/poe1/shadow.jpg',
    }),
    createEntry({
      poeVersion: 'poe1',
      baseClass: 'Marauder',
      portraitKey: 'marauder',
      bannerKey: 'marauder',
      badgeText: 'M',
      tone: 'iron',
      portraitPath: 'assets/characters/poe1/marauder.jpg',
      bannerPath: 'assets/characters/banners/poe1/marauder.jpg',
    }),
    createEntry({
      poeVersion: 'poe1',
      baseClass: 'Witch',
      portraitKey: 'witch',
      bannerKey: 'witch',
      badgeText: 'W',
      tone: 'violet',
      portraitPath: 'assets/characters/poe1/witch.jpg',
      bannerPath: 'assets/characters/banners/poe1/witch.jpg',
    }),
    createEntry({
      poeVersion: 'poe1',
      baseClass: 'Ranger',
      portraitKey: 'ranger',
      bannerKey: 'ranger',
      badgeText: 'R',
      tone: 'jade',
      portraitPath: 'assets/characters/poe1/ranger.jpg',
      bannerPath: 'assets/characters/banners/poe1/ranger.jpg',
    }),
    createEntry({
      poeVersion: 'poe1',
      baseClass: 'Templar',
      portraitKey: 'templar',
      bannerKey: 'templar',
      badgeText: 'T',
      tone: 'gold',
      portraitPath: 'assets/characters/poe1/templar.jpg',
      bannerPath: 'assets/characters/banners/poe1/templar.jpg',
    }),
    createEntry({
      poeVersion: 'poe1',
      baseClass: 'Scion',
      portraitKey: 'scion',
      bannerKey: 'scion',
      badgeText: 'S',
      tone: 'gold',
      portraitPath: 'assets/characters/poe1/scion.jpg',
      bannerPath: 'assets/characters/banners/poe1/scion.jpg',
    }),
    createEntry({
      poeVersion: 'poe2',
      baseClass: 'Sorceress',
      portraitKey: 'sorceress',
      bannerKey: 'sorceress',
      badgeText: 'S',
      tone: 'crystal',
      portraitPath: 'assets/characters/poe2/sorceress.png',
      bannerPath: 'assets/characters/banners/poe2/sorceress.png',
    }),
    createEntry({
      poeVersion: 'poe2',
      baseClass: 'Warrior',
      portraitKey: 'warrior',
      bannerKey: 'warrior',
      badgeText: 'W',
      tone: 'iron',
      portraitPath: 'assets/characters/poe2/warrior.png',
      bannerPath: 'assets/characters/banners/poe2/warrior.jpg',
    }),
    createEntry({
      poeVersion: 'poe2',
      baseClass: 'Ranger',
      portraitKey: 'ranger',
      bannerKey: 'ranger',
      badgeText: 'R',
      tone: 'jade',
      portraitPath: 'assets/characters/poe2/ranger.png',
      bannerPath: 'assets/characters/banners/poe2/ranger.jpg',
    }),
    createEntry({
      poeVersion: 'poe2',
      baseClass: 'Witch',
      portraitKey: 'witch',
      bannerKey: 'witch',
      badgeText: 'W',
      tone: 'violet',
      portraitPath: 'assets/characters/poe2/witch.png',
      bannerPath: 'assets/characters/banners/poe2/witch.jpg',
    }),
    createEntry({
      poeVersion: 'poe2',
      baseClass: 'Mercenary',
      portraitKey: 'mercenary',
      bannerKey: 'mercenary',
      badgeText: 'M',
      tone: 'brass',
      portraitPath: 'assets/characters/poe2/mercenary.png',
      bannerPath: 'assets/characters/banners/poe2/mercenary.jpg',
    }),
    createEntry({
      poeVersion: 'poe2',
      baseClass: 'Monk',
      portraitKey: 'monk',
      bannerKey: 'monk',
      badgeText: 'M',
      tone: 'azure',
      portraitPath: 'assets/characters/poe2/monk.png',
      bannerPath: 'assets/characters/banners/poe2/monk.jpg',
    }),
    createEntry({
      poeVersion: 'poe2',
      baseClass: 'Huntress',
      portraitKey: 'huntress',
      bannerKey: 'huntress',
      badgeText: 'H',
      tone: 'jade',
      portraitPath: 'assets/characters/poe2/huntress.png',
      bannerPath: 'assets/characters/banners/poe2/huntress.jpg',
    }),
    createEntry({
      poeVersion: 'poe2',
      baseClass: 'Druid',
      portraitKey: 'druid',
      bannerKey: 'druid',
      badgeText: 'D',
      tone: 'verdant',
      portraitPath: 'assets/characters/poe2/druid.png',
      bannerPath: 'assets/characters/banners/poe2/druid.jpg',
    }),
  ];

  const ASCENDANCY_SUPPORT = [
    { poeVersion: 'poe1', baseClass: 'Duelist', ascendancy: 'Slayer', tone: 'brass' },
    { poeVersion: 'poe1', baseClass: 'Duelist', ascendancy: 'Gladiator', tone: 'brass' },
    { poeVersion: 'poe1', baseClass: 'Duelist', ascendancy: 'Champion', tone: 'brass' },
    { poeVersion: 'poe1', baseClass: 'Shadow', ascendancy: 'Assassin', tone: 'violet' },
    { poeVersion: 'poe1', baseClass: 'Shadow', ascendancy: 'Saboteur', tone: 'violet' },
    { poeVersion: 'poe1', baseClass: 'Shadow', ascendancy: 'Trickster', tone: 'violet' },
    { poeVersion: 'poe1', baseClass: 'Marauder', ascendancy: 'Juggernaut', tone: 'iron' },
    { poeVersion: 'poe1', baseClass: 'Marauder', ascendancy: 'Berserker', tone: 'iron' },
    { poeVersion: 'poe1', baseClass: 'Marauder', ascendancy: 'Chieftain', tone: 'iron' },
    { poeVersion: 'poe1', baseClass: 'Witch', ascendancy: 'Necromancer', tone: 'violet' },
    { poeVersion: 'poe1', baseClass: 'Witch', ascendancy: 'Occultist', tone: 'violet' },
    { poeVersion: 'poe1', baseClass: 'Witch', ascendancy: 'Elementalist', tone: 'violet' },
    { poeVersion: 'poe1', baseClass: 'Ranger', ascendancy: 'Deadeye', tone: 'jade' },
    { poeVersion: 'poe1', baseClass: 'Ranger', ascendancy: 'Warden', tone: 'jade' },
    { poeVersion: 'poe1', baseClass: 'Ranger', ascendancy: 'Pathfinder', tone: 'jade' },
    { poeVersion: 'poe1', baseClass: 'Templar', ascendancy: 'Inquisitor', tone: 'gold' },
    { poeVersion: 'poe1', baseClass: 'Templar', ascendancy: 'Hierophant', tone: 'gold' },
    { poeVersion: 'poe1', baseClass: 'Templar', ascendancy: 'Guardian', tone: 'gold' },
    { poeVersion: 'poe1', baseClass: 'Scion', ascendancy: 'Ascendant', tone: 'gold' },
    { poeVersion: 'poe1', baseClass: 'Scion', ascendancy: 'Reliquarian', tone: 'gold' },
    { poeVersion: 'poe2', baseClass: 'Sorceress', ascendancy: 'Stormweaver', tone: 'crystal' },
    { poeVersion: 'poe2', baseClass: 'Sorceress', ascendancy: 'Chronomancer', tone: 'crystal' },
    { poeVersion: 'poe2', baseClass: 'Warrior', ascendancy: 'Titan', tone: 'iron' },
    { poeVersion: 'poe2', baseClass: 'Warrior', ascendancy: 'Warbringer', tone: 'iron' },
    { poeVersion: 'poe2', baseClass: 'Warrior', ascendancy: 'Smith of Kitava', tone: 'iron' },
    { poeVersion: 'poe2', baseClass: 'Ranger', ascendancy: 'Deadeye', tone: 'jade' },
    { poeVersion: 'poe2', baseClass: 'Ranger', ascendancy: 'Pathfinder', tone: 'jade' },
    { poeVersion: 'poe2', baseClass: 'Witch', ascendancy: 'Blood Mage', tone: 'ember' },
    { poeVersion: 'poe2', baseClass: 'Witch', ascendancy: 'Infernalist', tone: 'ember' },
    { poeVersion: 'poe2', baseClass: 'Witch', ascendancy: 'Lich', tone: 'violet' },
    { poeVersion: 'poe2', baseClass: 'Mercenary', ascendancy: 'Witchhunter', tone: 'brass' },
    { poeVersion: 'poe2', baseClass: 'Mercenary', ascendancy: 'Gemling Legionnaire', tone: 'brass' },
    { poeVersion: 'poe2', baseClass: 'Mercenary', ascendancy: 'Tactician', tone: 'brass' },
    { poeVersion: 'poe2', baseClass: 'Monk', ascendancy: 'Invoker', tone: 'azure' },
    { poeVersion: 'poe2', baseClass: 'Monk', ascendancy: 'Acolyte of Chayula', tone: 'azure' },
    { poeVersion: 'poe2', baseClass: 'Huntress', ascendancy: 'Amazon', tone: 'jade' },
    { poeVersion: 'poe2', baseClass: 'Huntress', ascendancy: 'Ritualist', tone: 'violet' },
    { poeVersion: 'poe2', baseClass: 'Druid', ascendancy: 'Oracle', tone: 'verdant' },
    { poeVersion: 'poe2', baseClass: 'Druid', ascendancy: 'Shaman', tone: 'ember' },
  ].map(createAscendancySupportEntry);

  const PLAYABLE_CHARACTER_SUPPORT = [
    ...BASE_SUPPORT,
    ...ASCENDANCY_SUPPORT,
  ];

  const EXPECTED_PLAYABLE_KEYS = [
    'poe1:duelist',
    'poe1:shadow',
    'poe1:marauder',
    'poe1:witch',
    'poe1:ranger',
    'poe1:templar',
    'poe1:scion',
    'poe1:duelist:slayer',
    'poe1:duelist:gladiator',
    'poe1:duelist:champion',
    'poe1:shadow:assassin',
    'poe1:shadow:saboteur',
    'poe1:shadow:trickster',
    'poe1:marauder:juggernaut',
    'poe1:marauder:berserker',
    'poe1:marauder:chieftain',
    'poe1:witch:necromancer',
    'poe1:witch:occultist',
    'poe1:witch:elementalist',
    'poe1:ranger:deadeye',
    'poe1:ranger:warden',
    'poe1:ranger:pathfinder',
    'poe1:templar:inquisitor',
    'poe1:templar:hierophant',
    'poe1:templar:guardian',
    'poe1:scion:ascendant',
    'poe1:scion:reliquarian',
    'poe2:sorceress',
    'poe2:warrior',
    'poe2:ranger',
    'poe2:witch',
    'poe2:mercenary',
    'poe2:monk',
    'poe2:huntress',
    'poe2:druid',
    'poe2:sorceress:stormweaver',
    'poe2:sorceress:chronomancer',
    'poe2:warrior:titan',
    'poe2:warrior:warbringer',
    'poe2:warrior:smith-of-kitava',
    'poe2:ranger:deadeye',
    'poe2:ranger:pathfinder',
    'poe2:witch:blood-mage',
    'poe2:witch:infernalist',
    'poe2:witch:lich',
    'poe2:mercenary:witchhunter',
    'poe2:mercenary:gemling-legionnaire',
    'poe2:mercenary:tactician',
    'poe2:monk:invoker',
    'poe2:monk:acolyte-of-chayula',
    'poe2:huntress:amazon',
    'poe2:huntress:ritualist',
    'poe2:druid:oracle',
    'poe2:druid:shaman',
  ];

  const SUPPORT_BY_ID = new Map(
    PLAYABLE_CHARACTER_SUPPORT.map((entry) => [entry.id, entry])
  );

  const BASE_ENTRY_BY_TOKEN = new Map();
  const ENTRY_BY_TOKEN = new Map();

  PLAYABLE_CHARACTER_SUPPORT.forEach((entry) => {
    const baseTokenKey = `${entry.poeVersion}:${toToken(entry.baseClass)}`;
    if (!entry.ascendancy && !BASE_ENTRY_BY_TOKEN.has(baseTokenKey)) {
      BASE_ENTRY_BY_TOKEN.set(baseTokenKey, entry.id);
    }

    if (!ENTRY_BY_TOKEN.has(baseTokenKey)) {
      ENTRY_BY_TOKEN.set(baseTokenKey, entry.id);
    }

    if (entry.ascendancy) {
      const ascendancyTokenKey = `${entry.poeVersion}:${toToken(entry.ascendancy)}`;
      if (!ENTRY_BY_TOKEN.has(ascendancyTokenKey)) {
        ENTRY_BY_TOKEN.set(ascendancyTokenKey, entry.id);
      }
    }
  });

  const OBSERVED_RUNTIME_ALIASES = {
    'poe2:druid1': 'poe2:druid:oracle',
    'poe2:druid2': 'poe2:druid:shaman',
    'poe2:monk1': 'poe2:monk:acolyte-of-chayula',
    'poe2:monk2': 'poe2:monk:invoker',
    'poe2:mercenary1': 'poe2:mercenary:witchhunter',
    'poe2:mercenary3': 'poe2:mercenary:gemling-legionnaire',
    'poe2:huntress1': 'poe2:huntress:amazon',
    'poe2:ranger1': 'poe2:ranger:deadeye',
    'poe2:witch1': 'poe2:witch:lich',
    'poe2:warrior1': 'poe2:warrior:smith-of-kitava',
  };

  Object.entries(OBSERVED_RUNTIME_ALIASES).forEach(([aliasKey, entryId]) => {
    ENTRY_BY_TOKEN.set(aliasKey, entryId);
  });

  function resolveForVersion(poeVersion, className, ascendancy) {
    if (!poeVersion || !className) {
      return null;
    }

    const classTokenKey = `${poeVersion}:${toToken(className)}`;
    const baseEntryId = BASE_ENTRY_BY_TOKEN.get(classTokenKey);
    if (baseEntryId && ascendancy) {
      const baseEntry = SUPPORT_BY_ID.get(baseEntryId);
      const candidateId = `${poeVersion}:${toSlug(baseEntry.baseClass)}:${toSlug(ascendancy)}`;
      if (SUPPORT_BY_ID.has(candidateId)) {
        return SUPPORT_BY_ID.get(candidateId);
      }
    }

    const directEntryId = ENTRY_BY_TOKEN.get(classTokenKey);
    if (directEntryId && SUPPORT_BY_ID.has(directEntryId)) {
      return SUPPORT_BY_ID.get(directEntryId);
    }

    return null;
  }

  function findCharacterSupportEntry(input = {}) {
    const poeVersion = normalizePoeVersion(input.poeVersion || input.gameVersion || input.game);
    const className = normalizeString(input.className ?? input.class);
    const ascendancy = normalizeString(input.ascendancy);

    if (!className) {
      return null;
    }

    const versions = poeVersion ? [poeVersion] : ['poe1', 'poe2'];
    for (const version of versions) {
      const resolved = resolveForVersion(version, className, ascendancy);
      if (resolved) {
        return resolved;
      }
    }

    return null;
  }

  return {
    PLAYABLE_CHARACTER_SUPPORT,
    EXPECTED_PLAYABLE_KEYS,
    OBSERVED_RUNTIME_ALIASES,
    findCharacterSupportEntry,
  };
});
