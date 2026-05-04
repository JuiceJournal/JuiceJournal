(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.overlayStateModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createOverlayStateModel() {
  const SEPARATOR = ' \u00b7 ';

  function normalizeString(value, fallback = null) {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
  }

  function normalizeSeconds(value) {
    const seconds = Number(value ?? 0);
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  }

  function formatDuration(seconds) {
    const normalized = normalizeSeconds(seconds);
    if (!normalized) {
      return '0s';
    }

    const minutes = Math.floor(normalized / 60);
    const remainingSeconds = normalized % 60;
    if (!minutes) {
      return `${remainingSeconds}s`;
    }

    return `${minutes}m ${String(remainingSeconds).padStart(2, '0')}s`;
  }

  function getCharacterSummary(character) {
    if (!character || typeof character !== 'object') {
      return null;
    }

    const summary = character.summary && typeof character.summary === 'object'
      ? character.summary
      : null;
    const selectedCharacter = character.selectedCharacter && typeof character.selectedCharacter === 'object'
      ? character.selectedCharacter
      : null;
    const source = summary || selectedCharacter || character;

    const name = normalizeString(source.name);
    const league = normalizeString(source.league);

    if (!name && !league) {
      return null;
    }

    return {
      name,
      league,
      className: normalizeString(source.className ?? source.class)
    };
  }

  function getActiveSessionSummary(session, now = Date.now()) {
    if (!session || typeof session !== 'object') {
      return null;
    }

    const status = normalizeString(session.status, 'active');
    if (status !== 'active' && status !== 'queued' && status !== 'running') {
      return null;
    }

    const mapName = normalizeString(session.mapName ?? session.map_name, 'Unknown Map');
    const farmType = normalizeString(session.farmType ?? session.farmTypeLabel ?? session.mapTypeLabel);
    const league = normalizeString(session.league);
    const poeVersion = normalizeString(session.poeVersion ?? session.gameVersion);
    const startedAt = normalizeString(session.startedAt ?? session.started_at);
    const startedMs = startedAt ? Date.parse(startedAt) : NaN;
    const elapsedSeconds = normalizeSeconds(session.elapsedSeconds ?? (
      Number.isFinite(startedMs) ? (now - startedMs) / 1000 : 0
    ));

    return {
      mapName,
      farmType,
      league,
      poeVersion,
      elapsedSeconds
    };
  }

  function getRuntimeSummary(runtime) {
    if (!runtime || typeof runtime !== 'object') {
      return null;
    }

    const summary = runtime.summary && typeof runtime.summary === 'object'
      ? runtime.summary
      : null;
    const currentInstance = runtime.currentInstance && typeof runtime.currentInstance === 'object'
      ? runtime.currentInstance
      : null;

    const currentArea = normalizeString(
      runtime.currentArea
        ?? runtime.currentAreaName
        ?? summary?.currentAreaName
        ?? currentInstance?.areaName
        ?? runtime.mapName
    );
    const currentInstanceSeconds = normalizeSeconds(
      runtime.currentInstanceSeconds
        ?? summary?.currentInstanceSeconds
        ?? currentInstance?.durationSeconds
    );
    const currentSessionSeconds = normalizeSeconds(
      runtime.currentSessionSeconds
        ?? runtime.totalActiveSeconds
        ?? summary?.totalActiveSeconds
    );

    if (!currentArea && summary?.status !== 'active') {
      return null;
    }

    return {
      currentArea,
      currentInstanceSeconds,
      currentSessionSeconds
    };
  }

  function createPrimaryLine(characterSummary) {
    if (!characterSummary) {
      return 'Character sync needed';
    }

    return [
      characterSummary.name,
      characterSummary.league
    ].filter(Boolean).join(SEPARATOR) || 'Character sync needed';
  }

  function deriveOverlayState({ enabled = false, character, runtime, session, now = Date.now() } = {}) {
    const sessionSummary = getActiveSessionSummary(session, now);
    if (enabled !== true && !sessionSummary) {
      return {
        visibility: 'hidden',
        primaryLine: '',
        secondaryLine: '',
        metaLine: ''
      };
    }

    if (sessionSummary) {
      const contextLine = [
        sessionSummary.farmType || 'No farm type',
        sessionSummary.poeVersion ? sessionSummary.poeVersion.replace(/^poe/i, 'PoE ') : null,
        sessionSummary.league
      ].filter(Boolean).join(SEPARATOR);

      return {
        visibility: 'visible',
        primaryLine: sessionSummary.mapName,
        secondaryLine: contextLine || 'Active map session',
        metaLine: `elapsed ${formatDuration(sessionSummary.elapsedSeconds)}`
      };
    }

    const runtimeSummary = getRuntimeSummary(runtime);
    if (!runtimeSummary) {
      return {
        visibility: 'waiting',
        primaryLine: 'Waiting for game',
        secondaryLine: 'Waiting for runtime session',
        metaLine: ''
      };
    }

    return {
      visibility: 'visible',
      primaryLine: createPrimaryLine(getCharacterSummary(character)),
      secondaryLine: runtimeSummary.currentArea || 'Waiting for area data',
      metaLine: `${runtimeSummary.currentInstanceSeconds}s${SEPARATOR}session ${runtimeSummary.currentSessionSeconds}s`
    };
  }

  return {
    deriveOverlayState
  };
});
