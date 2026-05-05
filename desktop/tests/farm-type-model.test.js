const test = require('node:test');
const assert = require('node:assert/strict');

const FARM_TYPE_MODEL_REQUEST = '../src/modules/farmTypeModel';

function isDirectMissingModule(error, request) {
  return error?.code === 'MODULE_NOT_FOUND'
    && error.message.includes(`Cannot find module '${request}'`);
}

function loadFarmTypeModel() {
  try {
    return require(FARM_TYPE_MODEL_REQUEST);
  } catch (error) {
    if (!isDirectMissingModule(error, FARM_TYPE_MODEL_REQUEST)) {
      throw error;
    }

    return { __loadError: error };
  }
}

function getFarmTypeModelExport(exportName) {
  const farmTypeModel = loadFarmTypeModel();

  if (farmTypeModel.__loadError) {
    const { code, message } = farmTypeModel.__loadError;
    assert.fail(
      `Expected desktop/src/modules/farmTypeModel.js to exist and export ${exportName}. Current red state: ${code || 'LOAD_ERROR'}: ${message}`
    );
  }

  assert.equal(
    typeof farmTypeModel[exportName],
    'function',
    `Expected farmTypeModel.${exportName} to be a function`
  );

  return farmTypeModel[exportName];
}

test('farm type model exposes the supported farm types in the approved order', () => {
  const listFarmTypes = getFarmTypeModelExport('listFarmTypes');

  const farmTypes = listFarmTypes();

  assert.deepEqual(
    farmTypes.map((farmType) => farmType.id),
    ['abyss', 'breach', 'expedition', 'ritual', 'harbinger', 'essence', 'delirium', 'blight', 'legion', 'harvest', 'betrayal', 'incursion']
  );
  assert.deepEqual(
    farmTypes.map((farmType) => farmType.label),
    ['Abyss', 'Breach', 'Expedition', 'Ritual', 'Harbinger', 'Essence', 'Delirium', 'Blight', 'Legion', 'Harvest', 'Betrayal', 'Incursion']
  );
});

test('farm type model filters trackable farms by game version', () => {
  const listFarmTypes = getFarmTypeModelExport('listFarmTypes');

  assert.deepEqual(
    listFarmTypes({ poeVersion: 'poe1' }).map((farmType) => farmType.id),
    ['abyss', 'breach', 'expedition', 'ritual', 'harbinger', 'essence', 'delirium', 'blight', 'legion', 'harvest', 'betrayal', 'incursion']
  );
  assert.deepEqual(
    listFarmTypes({ poeVersion: 'poe2' }).map((farmType) => farmType.id),
    ['abyss', 'breach', 'expedition', 'ritual', 'delirium', 'essence']
  );
  assert.deepEqual(
    listFarmTypes({ poeVersion: 'poe2' }).map((farmType) => farmType.poeVersions),
    [
      ['poe1', 'poe2'],
      ['poe1', 'poe2'],
      ['poe1', 'poe2'],
      ['poe1', 'poe2'],
      ['poe1', 'poe2'],
      ['poe1', 'poe2']
    ]
  );
});

test('farm type model returns a defensive copy of the supported farms list', () => {
  const listFarmTypes = getFarmTypeModelExport('listFarmTypes');

  const firstResult = listFarmTypes();
  firstResult.pop();

  const secondResult = listFarmTypes();

  assert.equal(secondResult.length, 12);
  assert.equal(secondResult[11].id, 'incursion');
});

test('farm type model selects supported farm ids and clears unsupported ones', () => {
  const createFarmTypeState = getFarmTypeModelExport('createFarmTypeState');
  const selectFarmType = getFarmTypeModelExport('selectFarmType');
  const clearFarmType = getFarmTypeModelExport('clearFarmType');

  const state = createFarmTypeState();

  assert.equal(state.selectedFarmTypeId, null);
  assert.equal(selectFarmType(state, 'ritual'), 'ritual');
  assert.equal(state.selectedFarmTypeId, 'ritual');
  assert.equal(selectFarmType(state, 'unknown-farm'), null);
  assert.equal(state.selectedFarmTypeId, null);

  selectFarmType(state, 'essence');
  clearFarmType(state);

  assert.equal(state.selectedFarmTypeId, null);
});

test('farm type model rejects farm ids unsupported by the selected game version', () => {
  const createFarmTypeState = getFarmTypeModelExport('createFarmTypeState');
  const selectFarmType = getFarmTypeModelExport('selectFarmType');
  const isFarmTypeSupported = getFarmTypeModelExport('isFarmTypeSupported');
  const getFarmTypeById = getFarmTypeModelExport('getFarmTypeById');

  const state = createFarmTypeState();

  assert.equal(selectFarmType(state, 'blight', { poeVersion: 'poe1' }), 'blight');
  assert.equal(selectFarmType(state, 'blight', { poeVersion: 'poe2' }), null);
  assert.equal(state.selectedFarmTypeId, null);
  assert.equal(isFarmTypeSupported('blight', { poeVersion: 'poe1' }), true);
  assert.equal(isFarmTypeSupported('blight', { poeVersion: 'poe2' }), false);
  assert.equal(getFarmTypeById('blight', { poeVersion: 'poe1' })?.label, 'Blight');
  assert.equal(getFarmTypeById('blight', { poeVersion: 'poe2' }), null);
});
