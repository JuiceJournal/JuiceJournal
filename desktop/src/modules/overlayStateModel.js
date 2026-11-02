(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.overlayStateModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createOverlayStateModel() {
  const SEPARATOR = ' \u00b7 ';
  // Main builds these lines and the overlay ticks the clocks, so both read one table here. The overlay's own labels are
  // in translations.js.
  const OVERLAY_TEXT = {
    en: {
      unknownMap: 'Unknown Map',
      noFarmType: 'No farm type',
      chooseFarmType: 'Choose farm type',
      activeMapSession: 'Active map session',
      confirmDetectedMap: 'Confirm detected map',
      confirmMapStart: 'confirm map start',
      characterSyncNeeded: 'Character sync needed',
      lastPlayedCharacter: 'Last played character',
      waitingForArea: 'Waiting for area data',
      level: 'Level',
      closesIn: (seconds) => `closes in ${seconds}s`,
      elapsed: (time) => `elapsed ${time}`,
      map: 'Map',
      total: 'Total',
      minutes: 'm',
      seconds: 's'
    },
    tr: {
      unknownMap: 'Bilinmeyen Map',
      noFarmType: 'Farm tipi yok',
      chooseFarmType: 'Farm tipi sec',
      activeMapSession: 'Aktif map oturumu',
      confirmDetectedMap: 'Algilanan mapi onayla',
      confirmMapStart: 'map baslangicini onayla',
      characterSyncNeeded: 'Karakter senkronu gerekli',
      lastPlayedCharacter: 'Son oynanan karakter',
      waitingForArea: 'Bolge bilgisi bekleniyor',
      level: 'Seviye',
      closesIn: (seconds) => `${seconds} sn icinde kapanir`,
      elapsed: (time) => `gecen sure ${time}`,
      map: 'Map',
      total: 'Toplam',
      minutes: 'dk',
      seconds: 'sn'
    }
  };

  function getOverlayText(language) {
    return OVERLAY_TEXT[language] || OVERLAY_TEXT.en;
  }

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

  function formatDuration(seconds, text) {
    const normalized = normalizeSeconds(seconds);
    if (!normalized) {
      return `0${text.seconds}`;
    }

    const minutes = Math.floor(normalized / 60);
    const remainingSeconds = normalized % 60;
    if (!minutes) {
      return `${remainingSeconds}${text.seconds}`;
    }

    return `${minutes}${text.minutes} ${String(remainingSeconds).padStart(2, '0')}${text.seconds}`;
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
  function formatOverlayClock(clock, now = Date.now(), language = 'en') {
    if (!clock || typeof clock !== 'object') {
      return '';
    }

    const text = getOverlayText(language);
    // A prompt counts down to the moment it closes on its own.
    if (clock.kind === 'countdown') {
      const secondsLeft = Math.max(0, Math.ceil((clock.expiresAt - now) / 1000));
      return clock.label ? `${clock.label}${SEPARATOR}${secondsLeft}${text.seconds}` : text.closesIn(secondsLeft);
    }

    const passedSeconds = Math.max(0, Math.floor((now - clock.at) / 1000));
    if (clock.kind === 'session') {
      return text.elapsed(formatDuration(clock.base + passedSeconds, text));
    }

    return `${text.map} ${formatClock(clock.mapBase + passedSeconds)}${SEPARATOR}${text.total} ${formatClock(clock.totalBase + passedSeconds)}`;
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

  function getActiveSessionSummary(session, now, text) {
    if (!session || typeof session !== 'object') {
      return null;
    }

    const status = normalizeString(session.status, 'active');
    if (status !== 'active' && status !== 'queued' && status !== 'running') {
      return null;
    }

    const mapName = normalizeString(session.mapName ?? session.map_name, text.unknownMap);
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

  function getStartMapPromptSummary(startMapPrompt, text) {
    if (!startMapPrompt || typeof startMapPrompt !== 'object') {
      return null;
    }

    const mapName = normalizeString(startMapPrompt.mapName ?? startMapPrompt.map_name, text.unknownMap);
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
      farmTypeOptions,
      expiresAt: normalizeTimestamp(startMapPrompt.expiresAt)
    };
  }

  function normalizeTimestamp(value) {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
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
      characters,
      expiresAt: normalizeTimestamp(characterPrompt.expiresAt)
    };
  }

  function createPrimaryLine(characterSummary, text) {
    if (!characterSummary) {
      return text.characterSyncNeeded;
    }

    return [
      characterSummary.name,
      characterSummary.league
    ].filter(Boolean).join(SEPARATOR) || text.characterSyncNeeded;
  }

  function deriveOverlayState({ enabled = false, character, runtime, session, startMapPrompt, characterPrompt, now = Date.now(), language = 'en' } = {}) {
    const text = getOverlayText(language);
    const sessionSummary = getActiveSessionSummary(session, now, text);
    if (sessionSummary) {
      const contextLine = [
        sessionSummary.farmType || text.noFarmType,
        sessionSummary.poeVersion ? sessionSummary.poeVersion.replace(/^poe/i, 'PoE ') : null,
        sessionSummary.league
      ].filter(Boolean).join(SEPARATOR);

      const clock = { kind: 'session', base: sessionSummary.elapsedSeconds, at: now };

      return {
        visibility: 'visible',
        primaryLine: sessionSummary.mapName,
        secondaryLine: contextLine || text.activeMapSession,
        metaLine: formatOverlayClock(clock, now, language),
        clock
      };
    }

    const startMapPromptSummary = getStartMapPromptSummary(startMapPrompt, text);
    if (startMapPromptSummary) {
      const contextLine = [
        startMapPromptSummary.farmType || text.chooseFarmType,
        startMapPromptSummary.poeVersion ? startMapPromptSummary.poeVersion.replace(/^poe/i, 'PoE ') : null,
        startMapPromptSummary.league
      ].filter(Boolean).join(SEPARATOR);

      const promptState = {
        visibility: 'visible',
        mode: 'start-map-prompt',
        primaryLine: startMapPromptSummary.mapName,
        secondaryLine: contextLine || text.confirmDetectedMap,
        metaLine: text.confirmMapStart,
        startMapPrompt: startMapPromptSummary
      };
      if (startMapPromptSummary.expiresAt) {
        promptState.clock = { kind: 'countdown', expiresAt: startMapPromptSummary.expiresAt };
        promptState.metaLine = formatOverlayClock(promptState.clock, now, language);
      }
      return promptState;
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
      const gameLabel = characterPromptSummary.poeVersion ? characterPromptSummary.poeVersion.replace(/^poe/i, 'PoE ') : '';

      const promptState = {
        visibility: 'visible',
        mode: 'character-prompt',
        primaryLine: selected.name,
        secondaryLine: [selected.level ? `${text.level} ${selected.level}` : null, selected.className].filter(Boolean).join(' ')
          || text.lastPlayedCharacter,
        metaLine: gameLabel,
        characterPrompt: characterPromptSummary
      };
      if (characterPromptSummary.expiresAt) {
        promptState.clock = { kind: 'countdown', expiresAt: characterPromptSummary.expiresAt, label: gameLabel || null };
        promptState.metaLine = formatOverlayClock(promptState.clock, now, language);
      }
      return promptState;
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
      primaryLine: createPrimaryLine(getCharacterSummary(character), text),
      secondaryLine: runtimeSummary.currentArea || text.waitingForArea,
      metaLine: formatOverlayClock(clock, now, language)
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
