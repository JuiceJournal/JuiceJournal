(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.characterVisualModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCharacterVisualModel() {
  const CLASS_VISUALS = {
    shaman: { portraitKey: 'shaman', badgeText: 'S', tone: 'ember', classLabel: 'Shaman' },
    druid: { portraitKey: 'druid', badgeText: 'D', tone: 'verdant', classLabel: 'Druid' },
    ranger: { portraitKey: 'ranger', badgeText: 'R', tone: 'jade', classLabel: 'Ranger' },
    witch: { portraitKey: 'witch', badgeText: 'W', tone: 'violet', classLabel: 'Witch' },
    warrior: { portraitKey: 'warrior', badgeText: 'W', tone: 'iron', classLabel: 'Warrior' },
    monk: { portraitKey: 'monk', badgeText: 'M', tone: 'azure', classLabel: 'Monk' },
    mercenary: { portraitKey: 'mercenary', badgeText: 'M', tone: 'brass', classLabel: 'Mercenary' },
    sorceress: { portraitKey: 'sorceress', badgeText: 'S', tone: 'crystal', classLabel: 'Sorceress' },
    huntress: { portraitKey: 'huntress', badgeText: 'H', tone: 'jade', classLabel: 'Huntress' },
    marauder: { portraitKey: 'marauder', badgeText: 'M', tone: 'iron', classLabel: 'Marauder' },
    templar: { portraitKey: 'templar', badgeText: 'T', tone: 'gold', classLabel: 'Templar' },
    duelist: { portraitKey: 'duelist', badgeText: 'D', tone: 'brass', classLabel: 'Duelist' },
    shadow: { portraitKey: 'shadow', badgeText: 'S', tone: 'violet', classLabel: 'Shadow' },
    scion: { portraitKey: 'scion', badgeText: 'S', tone: 'gold', classLabel: 'Scion' }
  };

  function normalizeString(value) {
    const normalized = String(value ?? '').trim();
    return normalized || null;
  }

  function normalizeKey(value) {
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
    const classKey = normalizeKey(className);
    const visual = CLASS_VISUALS[classKey] || null;

    if (visual) {
      return {
        ...visual,
        classLabel: visual.classLabel,
        baseClassLabel: visual.classLabel,
        detailLabel: ascendancy,
        fallbackInitials: createInitials(character.name)
      };
    }

    return {
      portraitKey: 'unknown',
      classLabel: className || 'Unknown Class',
      baseClassLabel: className || 'Unknown Class',
      detailLabel: ascendancy,
      badgeText: createInitials(character.name),
      fallbackInitials: createInitials(character.name),
      tone: 'neutral'
    };
  }

  return {
    deriveCharacterVisual
  };
});
