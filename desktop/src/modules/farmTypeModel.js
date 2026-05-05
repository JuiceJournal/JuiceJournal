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
    { id: 'incursion', label: 'Incursion', poeVersions: ['poe1'] }
  ];
  const FARM_TYPE_BY_ID = new Map(FARM_TYPES.map((farmType) => [farmType.id, farmType]));
  const POE_VERSION_ORDER = {
    poe1: ['abyss', 'breach', 'expedition', 'ritual', 'harbinger', 'essence', 'delirium', 'blight', 'legion', 'harvest', 'betrayal', 'incursion'],
    poe2: ['abyss', 'breach', 'expedition', 'ritual', 'delirium', 'essence']
  };

  function normalizePoeVersion(value) {
    return VALID_POE_VERSIONS.has(value) ? value : null;
  }

  function cloneFarmType(farmType) {
    return farmType
      ? {
        ...farmType,
        poeVersions: farmType.poeVersions.slice()
      }
      : null;
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

  function listFarmTypes(options = {}) {
    const normalizedVersion = normalizePoeVersion(options.poeVersion);
    return getFarmTypeIdsForVersion(normalizedVersion)
      .map((farmTypeId) => FARM_TYPE_BY_ID.get(farmTypeId))
      .filter((farmType) => farmType && (!normalizedVersion || farmType.poeVersions.includes(normalizedVersion)))
      .map(cloneFarmType);
  }

  function getFarmTypeById(farmTypeId, options = {}) {
    const farmType = FARM_TYPE_BY_ID.get(farmTypeId) || null;
    if (!farmType) {
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

  return {
    FARM_TYPES,
    createFarmTypeState,
    listFarmTypes,
    getFarmTypeById,
    isFarmTypeSupported,
    selectFarmType,
    clearFarmType
  };
});
