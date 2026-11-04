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
    ['abyss', 'breach', 'expedition', 'ritual', 'harbinger', 'essence', 'delirium', 'blight', 'legion', 'harvest', 'betrayal', 'incursion', 'overseer']
  );
  assert.deepEqual(
    farmTypes.map((farmType) => farmType.label),
    ['Abyss', 'Breach', 'Expedition', 'Ritual', 'Harbinger', 'Essence', 'Delirium', 'Blight', 'Legion', 'Harvest', 'Betrayal', 'Incursion', 'Overseer']
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
    ['abyss', 'breach', 'expedition', 'ritual', 'delirium', 'essence', 'overseer']
  );
  assert.deepEqual(
    listFarmTypes({ poeVersion: 'poe2' }).map((farmType) => farmType.poeVersions),
    [
      ['poe1', 'poe2'],
      ['poe1', 'poe2'],
      ['poe1', 'poe2'],
      ['poe1', 'poe2'],
      ['poe1', 'poe2'],
      ['poe1', 'poe2'],
      ['poe2']
    ]
  );
});

test('farm type model returns a defensive copy of the supported farms list', () => {
  const listFarmTypes = getFarmTypeModelExport('listFarmTypes');

  const firstResult = listFarmTypes();
  firstResult.pop();

  const secondResult = listFarmTypes();

  assert.equal(secondResult.length, 13);
  assert.equal(secondResult[12].id, 'overseer');
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

test('farm type model resolves an id from a stored id or label', () => {
  const resolveFarmTypeId = getFarmTypeModelExport('resolveFarmTypeId');

  assert.equal(resolveFarmTypeId('ritual'), 'ritual');
  assert.equal(resolveFarmTypeId('Ritual'), 'ritual');
  assert.equal(resolveFarmTypeId(' expedition '), 'expedition');
  assert.equal(resolveFarmTypeId('Unknown farm'), null);
  assert.equal(resolveFarmTypeId(null), null);
});

const farmTypeModel = require('../src/modules/farmTypeModel');

const CUSTOM_ID = 'custom-3f2b8f6e-0000-4000-8000-000000000001';
const OTHER_ID = 'custom-3f2b8f6e-0000-4000-8000-000000000002';
const VALID_INPUT = { label: 'Boss Tablets', color: 'amber', icon: 'farm-tablet', poeVersions: ['poe2'] };

// The list lives on the module, so each test starts and ends with none.
function withCustomFarmTypes(farmTypes, run) {
  farmTypeModel.setCustomFarmTypes(farmTypes);
  try {
    run();
  } finally {
    farmTypeModel.setCustomFarmTypes([]);
  }
}

test('Overseer is a built-in farm type for PoE 2 only', () => {
  assert.equal(farmTypeModel.getFarmTypeById('overseer', { poeVersion: 'poe2' })?.label, 'Overseer');
  assert.equal(farmTypeModel.getFarmTypeById('overseer', { poeVersion: 'poe1' }), null);
  assert.equal(farmTypeModel.resolveFarmTypeId('Overseer'), 'overseer');
});

test('a custom farm type is created with a valid colour, icon and game', () => {
  const { farmType, farmTypes, error } = farmTypeModel.createCustomFarmType([], { ...VALID_INPUT, label: '  Boss   Tablets ' }, { id: CUSTOM_ID });

  assert.equal(error, undefined);
  assert.deepEqual(farmType, { id: CUSTOM_ID, label: 'Boss Tablets', color: 'amber', icon: 'farm-tablet', poeVersions: ['poe2'] });
  assert.deepEqual(farmTypes, [farmType]);
});

test('a custom farm type is refused with a code for each invalid field', () => {
  const create = (input, list = []) => farmTypeModel.createCustomFarmType(list, { ...VALID_INPUT, ...input }, { id: CUSTOM_ID }).error;

  assert.equal(create({ label: '   ' }), 'LABEL_REQUIRED');
  assert.equal(create({ label: null }), 'LABEL_REQUIRED');
  assert.equal(create({ label: 'x'.repeat(farmTypeModel.CUSTOM_FARM_TYPE_LABEL_MAX_LENGTH + 1) }), 'LABEL_TOO_LONG');
  assert.equal(create({ color: '#ff0000' }), 'COLOR_INVALID');
  assert.equal(create({ icon: '../../evil' }), 'ICON_INVALID');
  assert.equal(create({ poeVersions: [] }), 'GAME_REQUIRED');
  assert.equal(create({ poeVersions: ['poe3'] }), 'GAME_REQUIRED');
  assert.equal(farmTypeModel.createCustomFarmType([], VALID_INPUT, { id: 'ritual' }).error, 'ID_INVALID');
});

test('a custom farm type cannot take the name of another farm type or a stored fallback', () => {
  const existing = [{ id: OTHER_ID, ...VALID_INPUT }];
  const create = (label) => farmTypeModel.createCustomFarmType(existing, { ...VALID_INPUT, label }, { id: CUSTOM_ID }).error;

  assert.equal(create('ritual'), 'LABEL_TAKEN');
  // Built-in names stay taken in the other game too, so a stored label still names one farm type.
  assert.equal(create('Blight'), 'LABEL_TAKEN');
  assert.equal(create('boss tablets'), 'LABEL_TAKEN');
  assert.equal(create('No farm type'), 'LABEL_TAKEN');
  assert.equal(create('Unknown Farm Type'), 'LABEL_TAKEN');
  assert.equal(create('Boss Tablets 2'), undefined);
});

test('the number of custom farm types has a limit that deleted ones do not count towards', () => {
  const full = Array.from({ length: farmTypeModel.CUSTOM_FARM_TYPE_LIMIT }, (_, index) => ({
    ...VALID_INPUT,
    id: `custom-${index}`,
    label: `Farm ${index}`
  }));

  assert.equal(farmTypeModel.createCustomFarmType(full, { ...VALID_INPUT, label: 'One more' }, { id: CUSTOM_ID }).error, 'LIMIT_REACHED');

  const { farmTypes } = farmTypeModel.deleteCustomFarmType(full, 'custom-0');
  assert.equal(farmTypeModel.createCustomFarmType(farmTypes, { ...VALID_INPUT, label: 'One more' }, { id: CUSTOM_ID }).error, undefined);
});

test('editing a custom farm type keeps its id and may keep its own name', () => {
  const { farmTypes } = farmTypeModel.createCustomFarmType([], VALID_INPUT, { id: CUSTOM_ID });

  const edited = farmTypeModel.updateCustomFarmType(farmTypes, CUSTOM_ID, { ...VALID_INPUT, label: 'boss tablets', color: 'red', poeVersions: ['poe1', 'poe2'] });
  assert.deepEqual(edited.farmType, { id: CUSTOM_ID, label: 'boss tablets', color: 'red', icon: 'farm-tablet', poeVersions: ['poe1', 'poe2'] });
  assert.deepEqual(edited.farmTypes, [edited.farmType]);

  assert.equal(farmTypeModel.updateCustomFarmType(farmTypes, OTHER_ID, VALID_INPUT).error, 'NOT_FOUND');
  assert.equal(farmTypeModel.updateCustomFarmType(farmTypes, CUSTOM_ID, { ...VALID_INPUT, label: 'Ritual' }).error, 'LABEL_TAKEN');
});

test('a deleted custom farm type leaves the pickers but past records can still describe it', () => {
  const created = farmTypeModel.createCustomFarmType([], VALID_INPUT, { id: CUSTOM_ID });
  const { farmTypes } = farmTypeModel.deleteCustomFarmType(created.farmTypes, CUSTOM_ID, { now: new Date('2026-11-04T10:00:00.000Z') });

  assert.equal(farmTypes[0].deletedAt, '2026-11-04T10:00:00.000Z');
  withCustomFarmTypes(farmTypes, () => {
    assert.equal(farmTypeModel.listFarmTypes().some((farmType) => farmType.id === CUSTOM_ID), false);
    assert.equal(farmTypeModel.getFarmTypeById(CUSTOM_ID), null);
    assert.equal(farmTypeModel.isFarmTypeSupported(CUSTOM_ID), false);
    assert.equal(farmTypeModel.getFarmTypeById(CUSTOM_ID, { includeDeleted: true })?.label, 'Boss Tablets');

    const shown = farmTypeModel.describeFarmType(CUSTOM_ID);
    assert.deepEqual([shown.label, shown.color, shown.icon], ['Boss Tablets', 'amber', 'farm-tablet']);
    assert.equal(farmTypeModel.resolveFarmTypeId('Boss Tablets'), CUSTOM_ID);
  });

  assert.equal(farmTypeModel.deleteCustomFarmType(farmTypes, CUSTOM_ID).error, 'NOT_FOUND');
  assert.equal(farmTypeModel.updateCustomFarmType(farmTypes, CUSTOM_ID, VALID_INPUT).error, 'NOT_FOUND');
});

test('a new custom farm type can reuse a deleted name, and that name then means the new one', () => {
  const created = farmTypeModel.createCustomFarmType([], VALID_INPUT, { id: CUSTOM_ID });
  const deleted = farmTypeModel.deleteCustomFarmType(created.farmTypes, CUSTOM_ID);
  const recreated = farmTypeModel.createCustomFarmType(deleted.farmTypes, { ...VALID_INPUT, color: 'red' }, { id: OTHER_ID });

  assert.equal(recreated.error, undefined);
  withCustomFarmTypes(recreated.farmTypes, () => {
    assert.equal(farmTypeModel.resolveFarmTypeId('Boss Tablets'), OTHER_ID);
    // A record that stored the id still finds the deleted one.
    assert.equal(farmTypeModel.describeFarmType(CUSTOM_ID)?.color, 'amber');
  });
});

test('custom farm types lead the list, for the games they were made for', () => {
  withCustomFarmTypes([
    { id: CUSTOM_ID, ...VALID_INPUT },
    { id: OTHER_ID, ...VALID_INPUT, label: 'Both games', poeVersions: ['poe1', 'poe2'] }
  ], () => {
    assert.deepEqual(
      farmTypeModel.listFarmTypes({ poeVersion: 'poe2' }).slice(0, 3).map((farmType) => farmType.id),
      [CUSTOM_ID, OTHER_ID, 'abyss']
    );
    assert.deepEqual(
      farmTypeModel.listFarmTypes({ poeVersion: 'poe1' }).slice(0, 2).map((farmType) => farmType.id),
      [OTHER_ID, 'abyss']
    );
    assert.equal(farmTypeModel.isFarmTypeSupported(CUSTOM_ID, { poeVersion: 'poe1' }), false);
    assert.equal(farmTypeModel.isFarmTypeSupported(CUSTOM_ID, { poeVersion: 'poe2' }), true);

    const state = farmTypeModel.createFarmTypeState();
    assert.equal(farmTypeModel.selectFarmType(state, CUSTOM_ID, { poeVersion: 'poe2' }), CUSTOM_ID);
    assert.equal(farmTypeModel.selectFarmType(state, CUSTOM_ID, { poeVersion: 'poe1' }), null);
  });
});

test('stored custom farm types with a broken field are dropped, not rendered', () => {
  const stored = [
    { id: CUSTOM_ID, ...VALID_INPUT },
    { id: CUSTOM_ID, ...VALID_INPUT, label: 'Same id again' },
    { id: 'custom-"><script>', ...VALID_INPUT },
    { id: 'custom-a', ...VALID_INPUT, color: 'red"><img src=x>' },
    { id: 'custom-b', ...VALID_INPUT, icon: 'x"/><script>' },
    { id: 'custom-c', ...VALID_INPUT, label: '' },
    { id: 'custom-d', ...VALID_INPUT, poeVersions: [] },
    null,
    'custom-e'
  ];

  assert.deepEqual(farmTypeModel.normalizeCustomFarmTypes(stored).map((farmType) => farmType.id), [CUSTOM_ID]);
  assert.deepEqual(farmTypeModel.normalizeCustomFarmTypes('not a list'), []);
  assert.deepEqual(farmTypeModel.normalizeCustomFarmTypes(undefined), []);
});

test('custom farm type ids are recognised by shape', () => {
  assert.equal(farmTypeModel.isCustomFarmTypeId(CUSTOM_ID), true);
  assert.equal(farmTypeModel.isCustomFarmTypeId('ritual'), false);
  assert.equal(farmTypeModel.isCustomFarmTypeId(null), false);
  assert.equal(farmTypeModel.isCustomFarmTypeId('custom-"x"'), false);
});
