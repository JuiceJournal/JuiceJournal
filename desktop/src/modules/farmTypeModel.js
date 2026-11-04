(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.farmTypeModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createFarmTypeModel() {
  const VALID_POE_VERSIONS = new Set(['poe1', 'poe2']);
  const FARM_TYPES = [
    { id: 'abyss', label: 'Abyss', poeVersions: ['poe1', 'poe2'] },
    { id: 'breach', label: 'Breach', poeVersions: ['poe1', 'poe2'] },
    { id: 'expedition', label: 'Expedition', poeVersions: ['poe1', 'poe2'] },
    { id: 'ritual', label: 'Ritual', poeVersions: ['poe1', 'poe2'] },
    { id: 'harbinger', label: 'Harbinger', poeVersions: ['poe1'] },
    { id: 'essence', label: 'Essence', poeVersions: ['poe1', 'poe2'] },
    { id: 'delirium', label: 'Delirium', poeVersions: ['poe1', 'poe2'] },
    { id: 'blight', label: 'Blight', poeVersions: ['poe1'] },
    { id: 'legion', label: 'Legion', poeVersions: ['poe1'] },
    { id: 'harvest', label: 'Harvest', poeVersions: ['poe1'] },
    { id: 'betrayal', label: 'Betrayal', poeVersions: ['poe1'] },
    { id: 'incursion', label: 'Incursion', poeVersions: ['poe1'] },
    { id: 'overseer', label: 'Overseer', poeVersions: ['poe2'] }
  ];
  const FARM_TYPE_BY_ID = new Map(FARM_TYPES.map((farmType) => [farmType.id, farmType]));
  const POE_VERSION_ORDER = {
    poe1: ['abyss', 'breach', 'expedition', 'ritual', 'harbinger', 'essence', 'delirium', 'blight', 'legion', 'harvest', 'betrayal', 'incursion'],
    poe2: ['abyss', 'breach', 'expedition', 'ritual', 'delirium', 'essence', 'overseer']
  };

  // What a player can pick for their own farm type. styles.css and overlay.html map each colour to a token;
  // each icon is a symbol in assets/icons.svg.
  const CUSTOM_FARM_TYPE_COLORS = ['green', 'magenta', 'blue', 'violet', 'cyan', 'pink', 'silver', 'lime', 'amber', 'teal', 'red', 'orange'];
  const CUSTOM_FARM_TYPE_ICONS = [
    'farm-skull', 'farm-tablet', 'farm-crown', 'farm-flame',
    'farm-swords', 'farm-shield', 'farm-gem', 'farm-coin',
    'farm-key', 'farm-leaf', 'farm-eye', 'farm-star',
    'farm-bolt', 'farm-moon', 'farm-compass', 'farm-flask'
  ];
  const CUSTOM_FARM_TYPE_LABEL_MAX_LENGTH = 24;
  const CUSTOM_FARM_TYPE_LIMIT = 24;
  const CUSTOM_FARM_TYPE_ID_PATTERN = /^custom-[a-z0-9-]{1,40}$/;
  // Map results store these two English fallbacks and translate them when shown.
  const RESERVED_LABELS = new Set(['no farm type', 'unknown farm type']);

  // The signed-in profile's own farm types, deleted ones included so past sessions can still show them.
  let customFarmTypes = [];

  function normalizePoeVersion(value) {
    return VALID_POE_VERSIONS.has(value) ? value : null;
  }

  function normalizeLabel(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  function labelKey(value) {
    return normalizeLabel(value).toLowerCase();
  }

  function normalizePoeVersions(value) {
    const versions = Array.isArray(value) ? value : [];
    return ['poe1', 'poe2'].filter((version) => versions.includes(version));
  }

  function isCustomFarmTypeId(value) {
    return typeof value === 'string' && CUSTOM_FARM_TYPE_ID_PATTERN.test(value);
  }

  function cloneFarmType(farmType) {
    return farmType
      ? {
        ...farmType,
        poeVersions: farmType.poeVersions.slice()
      }
      : null;
  }

  // Reads what is on disk: an entry a hand edit broke is dropped rather than rendered.
  function normalizeCustomFarmTypes(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    const seenIds = new Set();
    return value.reduce((farmTypes, entry) => {
      const label = normalizeLabel(entry?.label).slice(0, CUSTOM_FARM_TYPE_LABEL_MAX_LENGTH);
      const poeVersions = normalizePoeVersions(entry?.poeVersions);
      if (
        !isCustomFarmTypeId(entry?.id)
        || seenIds.has(entry.id)
        || !label
        || !poeVersions.length
        || !CUSTOM_FARM_TYPE_COLORS.includes(entry.color)
        || !CUSTOM_FARM_TYPE_ICONS.includes(entry.icon)
      ) {
        return farmTypes;
      }

      seenIds.add(entry.id);
      const farmType = { id: entry.id, label, color: entry.color, icon: entry.icon, poeVersions };
      if (entry.deletedAt) {
        farmType.deletedAt = String(entry.deletedAt);
      }
      farmTypes.push(farmType);
      return farmTypes;
    }, []);
  }

  function setCustomFarmTypes(value) {
    customFarmTypes = normalizeCustomFarmTypes(value);
  }

  function validateCustomFarmTypeInput(farmTypes, input, currentId = null) {
    const label = normalizeLabel(input?.label);
    const poeVersions = normalizePoeVersions(input?.poeVersions);
    if (!label) {
      return { error: 'LABEL_REQUIRED' };
    }
    if (label.length > CUSTOM_FARM_TYPE_LABEL_MAX_LENGTH) {
      return { error: 'LABEL_TOO_LONG' };
    }

    // A label finds its farm type again on results that store only the label, so it has to name just one.
    const key = labelKey(label);
    const taken = RESERVED_LABELS.has(key)
      || FARM_TYPES.some((farmType) => labelKey(farmType.label) === key)
      || farmTypes.some((farmType) => !farmType.deletedAt && farmType.id !== currentId && labelKey(farmType.label) === key);
    if (taken) {
      return { error: 'LABEL_TAKEN' };
    }
    if (!CUSTOM_FARM_TYPE_COLORS.includes(input?.color)) {
      return { error: 'COLOR_INVALID' };
    }
    if (!CUSTOM_FARM_TYPE_ICONS.includes(input?.icon)) {
      return { error: 'ICON_INVALID' };
    }
    if (!poeVersions.length) {
      return { error: 'GAME_REQUIRED' };
    }

    return { value: { label, color: input.color, icon: input.icon, poeVersions } };
  }

  function createCustomFarmType(farmTypes, input, { id } = {}) {
    const current = normalizeCustomFarmTypes(farmTypes);
    if (!isCustomFarmTypeId(id) || current.some((farmType) => farmType.id === id)) {
      return { error: 'ID_INVALID' };
    }
    if (current.filter((farmType) => !farmType.deletedAt).length >= CUSTOM_FARM_TYPE_LIMIT) {
      return { error: 'LIMIT_REACHED' };
    }

    const { error, value } = validateCustomFarmTypeInput(current, input);
    if (error) {
      return { error };
    }

    const farmType = { id, ...value };
    return { farmType, farmTypes: [...current, farmType] };
  }

  function updateCustomFarmType(farmTypes, id, input) {
    const current = normalizeCustomFarmTypes(farmTypes);
    if (!current.some((farmType) => farmType.id === id && !farmType.deletedAt)) {
      return { error: 'NOT_FOUND' };
    }

    const { error, value } = validateCustomFarmTypeInput(current, input, id);
    if (error) {
      return { error };
    }

    const farmType = { id, ...value };
    return {
      farmType,
      farmTypes: current.map((entry) => (entry.id === id ? farmType : entry))
    };
  }

  // The entry stays, marked deleted: it leaves the pickers, but past sessions keep its name, colour and icon.
  function deleteCustomFarmType(farmTypes, id, { now = new Date() } = {}) {
    const current = normalizeCustomFarmTypes(farmTypes);
    if (!current.some((farmType) => farmType.id === id && !farmType.deletedAt)) {
      return { error: 'NOT_FOUND' };
    }

    return {
      farmTypes: current.map((entry) => (entry.id === id ? { ...entry, deletedAt: now.toISOString() } : entry))
    };
  }

  function getFarmTypeIdsForVersion(poeVersion) {
    const normalizedVersion = normalizePoeVersion(poeVersion);
    if (!normalizedVersion) {
      return FARM_TYPES.map((farmType) => farmType.id);
    }

    return POE_VERSION_ORDER[normalizedVersion].slice();
  }

  function createFarmTypeState() {
    return {
      selectedFarmTypeId: null
    };
  }

  // A player's own farm types come first: the overlay's chips scroll after three rows.
  function listFarmTypes(options = {}) {
    const normalizedVersion = normalizePoeVersion(options.poeVersion);
    const custom = customFarmTypes.filter((farmType) => !farmType.deletedAt);
    const builtIn = getFarmTypeIdsForVersion(normalizedVersion).map((farmTypeId) => FARM_TYPE_BY_ID.get(farmTypeId));
    return [...custom, ...builtIn]
      .filter((farmType) => farmType && (!normalizedVersion || farmType.poeVersions.includes(normalizedVersion)))
      .map(cloneFarmType);
  }

  function getFarmTypeById(farmTypeId, options = {}) {
    const farmType = FARM_TYPE_BY_ID.get(farmTypeId)
      || customFarmTypes.find((entry) => entry.id === farmTypeId)
      || null;
    if (!farmType || (farmType.deletedAt && !options.includeDeleted)) {
      return null;
    }

    const normalizedVersion = normalizePoeVersion(options.poeVersion);
    if (normalizedVersion && !farmType.poeVersions.includes(normalizedVersion)) {
      return null;
    }

    return cloneFarmType(farmType);
  }

  function isFarmTypeSupported(farmTypeId, options = {}) {
    return Boolean(getFarmTypeById(farmTypeId, options));
  }

  function selectFarmType(state, farmTypeId, options = {}) {
    state.selectedFarmTypeId = isFarmTypeSupported(farmTypeId, options)
      ? farmTypeId
      : null;
    return state.selectedFarmTypeId;
  }

  function clearFarmType(state) {
    state.selectedFarmTypeId = null;
    return state.selectedFarmTypeId;
  }

  // Map results and hub runs store the label ("Ritual"); sessions store the id ("ritual").
  function resolveFarmTypeId(value) {
    const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!key) {
      return null;
    }

    const matches = (entry) => entry.id === key || labelKey(entry.label) === key;
    const custom = customFarmTypes.filter(matches);
    const farmType = FARM_TYPES.find(matches)
      || custom.find((entry) => !entry.deletedAt)
      || custom[0];
    return farmType ? farmType.id : null;
  }

  // What to show for a stored id or label, whether or not that farm type can still be picked.
  function describeFarmType(value) {
    return getFarmTypeById(resolveFarmTypeId(value), { includeDeleted: true });
  }

  return {
    FARM_TYPES,
    CUSTOM_FARM_TYPE_COLORS,
    CUSTOM_FARM_TYPE_ICONS,
    CUSTOM_FARM_TYPE_LABEL_MAX_LENGTH,
    CUSTOM_FARM_TYPE_LIMIT,
    createFarmTypeState,
    listFarmTypes,
    getFarmTypeById,
    isFarmTypeSupported,
    selectFarmType,
    clearFarmType,
    resolveFarmTypeId,
    describeFarmType,
    isCustomFarmTypeId,
    normalizeCustomFarmTypes,
    setCustomFarmTypes,
    createCustomFarmType,
    updateCustomFarmType,
    deleteCustomFarmType
  };
});
