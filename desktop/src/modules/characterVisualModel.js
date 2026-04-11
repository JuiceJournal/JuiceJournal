(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.characterVisualModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCharacterVisualModel() {
  const CLASS_VISUALS = {
    shaman: { portraitKey: 'shaman', badgeText: 'S', tone: 'ember', classLabel: 'Shaman', portraitPath: 'assets/characters/poe2/druid-shaman.png' },
    druid: { portraitKey: 'druid', badgeText: 'D', tone: 'verdant', classLabel: 'Druid', portraitPath: 'assets/characters/poe2/druid.png' },
    ranger: { portraitKey: 'ranger', badgeText: 'R', tone: 'jade', classLabel: 'Ranger', portraitPath: 'assets/characters/poe1/ranger.jpg' },
    witch: { portraitKey: 'witch', badgeText: 'W', tone: 'violet', classLabel: 'Witch', portraitPath: 'assets/characters/poe1/witch.jpg' },
    warrior: { portraitKey: 'warrior', badgeText: 'W', tone: 'iron', classLabel: 'Warrior', portraitPath: 'assets/characters/poe2/warrior.png' },
    monk: { portraitKey: 'monk', badgeText: 'M', tone: 'azure', classLabel: 'Monk', portraitPath: 'assets/characters/poe2/monk.png' },
    mercenary: { portraitKey: 'mercenary', badgeText: 'M', tone: 'brass', classLabel: 'Mercenary', portraitPath: 'assets/characters/poe2/mercenary.png' },
    sorceress: { portraitKey: 'sorceress', badgeText: 'S', tone: 'crystal', classLabel: 'Sorceress', portraitPath: 'assets/characters/poe2/sorceress.png' },
    huntress: { portraitKey: 'huntress', badgeText: 'H', tone: 'jade', classLabel: 'Huntress', portraitPath: 'assets/characters/poe2/huntress.png' },
    marauder: { portraitKey: 'marauder', badgeText: 'M', tone: 'iron', classLabel: 'Marauder', portraitPath: 'assets/characters/poe1/marauder.jpg' },
    templar: { portraitKey: 'templar', badgeText: 'T', tone: 'gold', classLabel: 'Templar', portraitPath: 'assets/characters/poe1/templar.jpg' },
    duelist: { portraitKey: 'duelist', badgeText: 'D', tone: 'brass', classLabel: 'Duelist', portraitPath: 'assets/characters/poe1/duelist.jpg' },
    shadow: { portraitKey: 'shadow', badgeText: 'S', tone: 'violet', classLabel: 'Shadow', portraitPath: 'assets/characters/poe1/shadow.jpg' },
    scion: { portraitKey: 'scion', badgeText: 'S', tone: 'gold', classLabel: 'Scion', portraitPath: 'assets/characters/poe1/scion.jpg' }
  };

  function normalizeString(value) {
    const normalized = String(value ?? '').trim();
    return normalized || null;
  }

  function normalizeKey(value) {
    return normalizeString(value)?.toLowerCase().replace(/\d+$/g, '').replace(/[^a-z0-9]+/g, '') || null;
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
    const classKey = normalizeKey(className);
    const visual = CLASS_VISUALS[classKey] || null;

    if (visual) {
      return {
        ...visual,
        classLabel: visual.classLabel,
        baseClassLabel: visual.classLabel,
        detailLabel: ascendancy,
        fallbackInitials: createInitials(character.name),
        portraitPath: visual.portraitPath
      };
    }

    return {
      portraitKey: 'unknown',
      classLabel: className || 'Unknown Class',
      baseClassLabel: className || 'Unknown Class',
      detailLabel: ascendancy,
      badgeText: createInitials(character.name),
      fallbackInitials: createInitials(character.name),
      tone: 'neutral',
      portraitPath: null
    };
  }

  return {
    deriveCharacterVisual
  };
});
