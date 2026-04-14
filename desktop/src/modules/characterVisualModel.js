(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.characterVisualModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCharacterVisualModel() {
  function createBaseVisual(game, key, badgeText, tone, classLabel, portraitPath, overrides = {}) {
    const bannerKey = overrides.bannerKey || key;

    return {
      portraitKey: key,
      bannerKey,
      badgeText,
      tone,
      classLabel,
      portraitPath,
      bannerPath: `assets/characters/banners/${game}/${bannerKey}.jpg`,
      ...overrides
    };
  }

  const CLASS_VISUALS = {
    shaman: createBaseVisual('poe2', 'shaman', 'S', 'ember', 'Shaman', 'assets/characters/poe2/druid-shaman.png', { bannerKey: 'druid-shaman', bannerPath: 'assets/characters/banners/poe2/druid-shaman.webp' }),
    druid: createBaseVisual('poe2', 'druid', 'D', 'verdant', 'Druid', 'assets/characters/poe2/druid.png'),
    ranger: createBaseVisual('poe1', 'ranger', 'R', 'jade', 'Ranger', 'assets/characters/poe1/ranger.jpg'),
    witch: createBaseVisual('poe1', 'witch', 'W', 'violet', 'Witch', 'assets/characters/poe1/witch.jpg'),
    warrior: createBaseVisual('poe2', 'warrior', 'W', 'iron', 'Warrior', 'assets/characters/poe2/warrior.png'),
    monk: createBaseVisual('poe2', 'monk', 'M', 'azure', 'Monk', 'assets/characters/poe2/monk.png'),
    mercenary: createBaseVisual('poe2', 'mercenary', 'M', 'brass', 'Mercenary', 'assets/characters/poe2/mercenary.png'),
    sorceress: createBaseVisual('poe2', 'sorceress', 'S', 'crystal', 'Sorceress', 'assets/characters/poe2/sorceress.png'),
    huntress: createBaseVisual('poe2', 'huntress', 'H', 'jade', 'Huntress', 'assets/characters/poe2/huntress.png'),
    marauder: createBaseVisual('poe1', 'marauder', 'M', 'iron', 'Marauder', 'assets/characters/poe1/marauder.jpg'),
    templar: createBaseVisual('poe1', 'templar', 'T', 'gold', 'Templar', 'assets/characters/poe1/templar.jpg'),
    duelist: createBaseVisual('poe1', 'duelist', 'D', 'brass', 'Duelist', 'assets/characters/poe1/duelist.jpg'),
    shadow: createBaseVisual('poe1', 'shadow', 'S', 'violet', 'Shadow', 'assets/characters/poe1/shadow.jpg'),
    scion: createBaseVisual('poe1', 'scion', 'S', 'gold', 'Scion', 'assets/characters/poe1/scion.jpg')
  };

  const POE2_CLASS_VARIANTS = {
    druid1: createBaseVisual('poe2', 'druid', 'D', 'verdant', 'Oracle', 'assets/characters/poe2/druid.png'),
    druid2: createBaseVisual('poe2', 'shaman', 'S', 'ember', 'Shaman', 'assets/characters/poe2/druid-shaman.png', { bannerKey: 'druid-shaman', bannerPath: 'assets/characters/banners/poe2/druid-shaman.webp' }),
    monk1: createBaseVisual('poe2', 'monk', 'M', 'azure', 'Acolyte of Chayula', 'assets/characters/poe2/monk.png'),
    monk2: createBaseVisual('poe2', 'monk', 'M', 'azure', 'Invoker', 'assets/characters/poe2/monk.png', { bannerKey: 'monk-invoker', bannerPath: 'assets/characters/banners/poe2/monk-invoker.webp' }),
    mercenary1: createBaseVisual('poe2', 'mercenary', 'M', 'brass', 'Witchhunter', 'assets/characters/poe2/mercenary.png'),
    mercenary3: createBaseVisual('poe2', 'mercenary', 'M', 'brass', 'Gemling Legionnaire', 'assets/characters/poe2/mercenary.png', { bannerKey: 'mercenary-gemling', bannerPath: 'assets/characters/banners/poe2/mercenary-gemling.webp' }),
    huntress1: createBaseVisual('poe2', 'huntress', 'H', 'jade', 'Amazon', 'assets/characters/poe2/huntress.png', { bannerKey: 'huntress-amazon', bannerPath: 'assets/characters/banners/poe2/huntress-amazon.webp' }),
    ranger1: createBaseVisual('poe2', 'ranger', 'R', 'jade', 'Deadeye', 'assets/characters/poe2/ranger.png'),
    witch1: createBaseVisual('poe2', 'witch', 'W', 'violet', 'Lich', 'assets/characters/poe2/witch.png'),
    warrior1: createBaseVisual('poe2', 'warrior', 'W', 'iron', 'Smith of Kitava', 'assets/characters/poe2/warrior.png'),
    warrior2: createBaseVisual('poe2', 'warrior', 'W', 'iron', 'Tactician', 'assets/characters/poe2/warrior.png')
  };

  function normalizeString(value) {
    const normalized = String(value ?? '').trim();
    return normalized || null;
  }

  function normalizeKey(value) {
    return normalizeString(value)?.toLowerCase().replace(/\d+$/g, '').replace(/[^a-z0-9]+/g, '') || null;
  }

  function normalizeVariantKey(value) {
    return normalizeString(value)?.toLowerCase().replace(/[^a-z0-9]+/g, '') || null;
  }

  function createInitials(name) {
    const parts = String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }

    return (parts[0] || '?').slice(0, 2).toUpperCase();
  }

  function deriveCharacterVisual(character = {}) {
    const className = normalizeString(character.className ?? character.class);
    const ascendancy = normalizeString(character.ascendancy);
    const variantKey = normalizeVariantKey(className);
    const variantVisual = variantKey ? POE2_CLASS_VARIANTS[variantKey] || null : null;
    const classKey = normalizeKey(className);
    const visual = variantVisual || CLASS_VISUALS[classKey] || null;

    if (visual) {
      return {
        ...visual,
        classLabel: visual.classLabel,
        baseClassLabel: CLASS_VISUALS[classKey]?.classLabel || visual.classLabel,
        detailLabel: ascendancy,
        fallbackInitials: createInitials(character.name)
      };
    }

    return {
      portraitKey: 'unknown',
      bannerKey: 'unknown',
      classLabel: className || 'Unknown Class',
      baseClassLabel: className || 'Unknown Class',
      detailLabel: ascendancy,
      badgeText: createInitials(character.name),
      fallbackInitials: createInitials(character.name),
      tone: 'neutral',
      portraitPath: null,
      bannerPath: null
    };
  }

  return {
    deriveCharacterVisual
  };
});
