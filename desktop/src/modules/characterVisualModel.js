(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
    return;
  }

  root.characterVisualModel = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCharacterVisualModel(root) {
  const supportMatrix = typeof require === 'function'
    ? require('./characterSupportMatrix')
    : root.characterSupportMatrix;

  function normalizeString(value) {
    const normalized = String(value ?? '').trim();
    return normalized || null;
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
    const visual = supportMatrix?.findCharacterSupportEntry({
      poeVersion: character.poeVersion ?? character.gameVersion ?? character.game,
      className,
      ascendancy
    }) || null;

    if (visual) {
      return {
        ...visual,
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
