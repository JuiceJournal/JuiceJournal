(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.settingsModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createSettingsModel() {
  const DEFAULT_RESET_SETTINGS = Object.freeze({
    apiUrl: 'http://localhost:3001',
    poePath: '',
    autoStartSession: true,
    notifications: true,
    soundNotifications: false,
    language: 'en',
    poeVersion: 'poe1',
    scanHotkey: 'F9',
    stashScanHotkey: 'Ctrl+Shift+L',
    defaultLeaguePoe1: 'Standard',
    defaultLeaguePoe2: 'Standard'
  });

  function normalizeLeagueOptions(activeLeagues) {
    if (!Array.isArray(activeLeagues)) {
      return [];
    }

    return activeLeagues
      .map((league) => String(league || '').trim())
      .filter(Boolean);
  }

  function deriveLeagueFieldState({
    storedLeague,
    activeLeagues,
    apiReachable
  } = {}) {
    const options = normalizeLeagueOptions(activeLeagues);
    const normalizedStoredLeague = String(storedLeague || '').trim();

    if (options.length > 0 && apiReachable !== false) {
      return {
        controlType: 'select',
        options,
        value: options.includes(normalizedStoredLeague) ? normalizedStoredLeague : options[0]
      };
    }

    return {
      controlType: 'input',
      options: [],
      value: normalizedStoredLeague || 'Standard'
    };
  }

  function buildResetSettingsDraft({ currentUser } = {}) {
    return {
      settings: { ...DEFAULT_RESET_SETTINGS },
      headerUsername: currentUser?.username || 'Guest'
    };
  }

  return {
    deriveLeagueFieldState,
    buildResetSettingsDraft
  };
});
