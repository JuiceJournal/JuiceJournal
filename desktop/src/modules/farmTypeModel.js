(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.farmTypeModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createFarmTypeModel() {
  const FARM_TYPES = [
    { id: 'abyss', label: 'Abyss' },
    { id: 'breach', label: 'Breach' },
    { id: 'expedition', label: 'Expedition' },
    { id: 'ritual', label: 'Ritual' },
    { id: 'harbinger', label: 'Harbinger' },
    { id: 'essence', label: 'Essence' },
    { id: 'delirium', label: 'Delirium' }
  ];

  function createFarmTypeState() {
    return {
      selectedFarmTypeId: null
    };
  }

  function listFarmTypes() {
    return FARM_TYPES.slice();
  }

  function selectFarmType(state, farmTypeId) {
    state.selectedFarmTypeId = FARM_TYPES.some((farmType) => farmType.id === farmTypeId)
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
    selectFarmType,
    clearFarmType
  };
});
