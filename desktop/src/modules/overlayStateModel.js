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

  function normalizeFarmTypeOptions(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }

        const id = normalizeString(entry.id);
        const label = normalizeString(entry.label, id);
        return id ? { id, label } : null;
      })
      .filter(Boolean);
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

  // m:ss under an hour, h:mm:ss after.
  function formatClock(seconds) {
    const normalized = normalizeSeconds(seconds);
    const hours = Math.floor(normalized / 3600);
    const minutes = Math.floor((normalized % 3600) / 60);
    const remainingSeconds = String(normalized % 60).padStart(2, '0');

    return hours
      ? `${hours}:${String(minutes).padStart(2, '0')}:${remainingSeconds}`
      : `${minutes}:${remainingSeconds}`;
  }

  // Main only pushes overlay state on events, so the overlay counts a clock up from its base seconds at `at`
  // (epoch ms) and redraws the meta line with this.
  function formatOverlayClock(clock, now = Date.now()) {
    if (!clock || typeof clock !== 'object') {
      return '';
    }

    const passedSeconds = Math.max(0, Math.floor((now - clock.at) / 1000));
    if (clock.kind === 'session') {
      return `elapsed ${formatDuration(clock.base + passedSeconds)}`;
    }

    return `Map ${formatClock(clock.mapBase + passedSeconds)}${SEPARATOR}Total ${formatClock(clock.totalBase + passedSeconds)}`;
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

  function getRuntimeSummary(runtime, now = Date.now()) {
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
    // The snapshot is taken at the area event, so a running map counts from its entry time instead.
    // The top-level total holds completed maps only.
    const enteredMs = currentInstance ? Date.parse(currentInstance.enteredAt) : NaN;
    const running = Number.isFinite(enteredMs);
    const currentInstanceSeconds = running
      ? normalizeSeconds((now - enteredMs) / 1000)
      : normalizeSeconds(
        runtime.currentInstanceSeconds
          ?? summary?.currentInstanceSeconds
          ?? currentInstance?.durationSeconds
      );
    const currentSessionSeconds = running
      ? normalizeSeconds(runtime.totalActiveSeconds) + currentInstanceSeconds
      : normalizeSeconds(
        runtime.currentSessionSeconds
          ?? summary?.totalActiveSeconds
          ?? runtime.totalActiveSeconds
      );

    if (!currentArea && summary?.status !== 'active') {
      return null;
    }

    return {
      currentArea,
      currentInstanceSeconds,
      currentSessionSeconds,
      running
    };
  }

  function getStartMapPromptSummary(startMapPrompt) {
    if (!startMapPrompt || typeof startMapPrompt !== 'object') {
      return null;
    }

    const mapName = normalizeString(startMapPrompt.mapName ?? startMapPrompt.map_name, 'Unknown Map');
    const farmTypeId = normalizeString(startMapPrompt.farmTypeId ?? startMapPrompt.farm_type_id);
    const farmType = normalizeString(startMapPrompt.farmType ?? startMapPrompt.farmTypeLabel);
    const league = normalizeString(startMapPrompt.league);
    const poeVersion = normalizeString(startMapPrompt.poeVersion ?? startMapPrompt.gameVersion);
    const farmTypeOptions = normalizeFarmTypeOptions(startMapPrompt.farmTypeOptions);

    return {
      mapName,
      farmTypeId,
      farmType,
      league,
      poeVersion,
      farmTypeOptions
    };
  }

  function getCharacterPromptSummary(characterPrompt) {
    if (!characterPrompt || typeof characterPrompt !== 'object' || !Array.isArray(characterPrompt.characters)) {
      return null;
    }

    const characters = characterPrompt.characters
      .map((entry) => {
        const id = normalizeString(entry?.id);
        const name = normalizeString(entry?.name);
        const level = Number(entry?.level);
        return id && name
          ? { id, name, className: normalizeString(entry.className), level: Number.isFinite(level) && level > 0 ? level : null }
          : null;
      })
      .filter(Boolean);
    const selected = characters.find((entry) => entry.id === normalizeString(characterPrompt.selectedId));

    // With a single character there is nothing to choose.
    if (characters.length < 2 || !selected) {
      return null;
    }

    return {
      poeVersion: normalizeString(characterPrompt.poeVersion),
      selectedId: selected.id,
      characters
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

  function deriveOverlayState({ enabled = false, character, runtime, session, startMapPrompt, characterPrompt, now = Date.now() } = {}) {
    const sessionSummary = getActiveSessionSummary(session, now);
    if (sessionSummary) {
      const contextLine = [
        sessionSummary.farmType || 'No farm type',
        sessionSummary.poeVersion ? sessionSummary.poeVersion.replace(/^poe/i, 'PoE ') : null,
        sessionSummary.league
      ].filter(Boolean).join(SEPARATOR);

      const clock = { kind: 'session', base: sessionSummary.elapsedSeconds, at: now };

      return {
        visibility: 'visible',
        primaryLine: sessionSummary.mapName,
        secondaryLine: contextLine || 'Active map session',
        metaLine: formatOverlayClock(clock, now),
        clock
      };
    }

    const startMapPromptSummary = getStartMapPromptSummary(startMapPrompt);
    if (startMapPromptSummary) {
      const contextLine = [
        startMapPromptSummary.farmType || 'Choose farm type',
        startMapPromptSummary.poeVersion ? startMapPromptSummary.poeVersion.replace(/^poe/i, 'PoE ') : null,
        startMapPromptSummary.league
      ].filter(Boolean).join(SEPARATOR);

      return {
        visibility: 'visible',
        mode: 'start-map-prompt',
        primaryLine: startMapPromptSummary.mapName,
        secondaryLine: contextLine || 'Confirm detected map',
        metaLine: 'confirm map start',
        startMapPrompt: startMapPromptSummary
      };
    }

    if (enabled !== true) {
      return {
        visibility: 'hidden',
        primaryLine: '',
        secondaryLine: '',
        metaLine: ''
      };
    }

    const characterPromptSummary = getCharacterPromptSummary(characterPrompt);
    if (characterPromptSummary) {
      const selected = characterPromptSummary.characters.find((entry) => entry.id === characterPromptSummary.selectedId);

      return {
        visibility: 'visible',
        mode: 'character-prompt',
        primaryLine: selected.name,
        secondaryLine: [selected.level ? `Level ${selected.level}` : null, selected.className].filter(Boolean).join(' ')
          || 'Last played character',
        metaLine: characterPromptSummary.poeVersion ? characterPromptSummary.poeVersion.replace(/^poe/i, 'PoE ') : '',
        characterPrompt: characterPromptSummary
      };
    }

    const runtimeSummary = getRuntimeSummary(runtime, now);
    if (!runtimeSummary) {
      return {
        visibility: 'hidden',
        primaryLine: '',
        secondaryLine: '',
        metaLine: ''
      };
    }

    // Between maps the total stays put, so only a running map gets a clock.
    const clock = {
      kind: 'runtime',
      mapBase: runtimeSummary.currentInstanceSeconds,
      totalBase: runtimeSummary.currentSessionSeconds,
      at: now
    };
    const state = {
      visibility: 'visible',
      primaryLine: createPrimaryLine(getCharacterSummary(character)),
      secondaryLine: runtimeSummary.currentArea || 'Waiting for area data',
      metaLine: formatOverlayClock(clock, now)
    };

    if (runtimeSummary.running) {
      state.clock = clock;
    }

    return state;
  }

  return {
    deriveOverlayState,
    formatOverlayClock
  };
});
