const test = require('node:test');
const assert = require('node:assert/strict');

const {
  addLoot,
  deleteLoot,
  endSession,
  getActiveSession,
  getPersonalStats,
  getSession,
  listRecentLoot,
  listSessions,
  markLootUnread,
  startSession,
  updateCost,
  updateLoot,
  updateSession
} = require('../src/modules/localJournalModel');

const NOW = new Date('2026-10-21T12:00:00.000Z');

function idFactory(prefix) {
  let next = 0;
  return () => {
    next += 1;
    return `${prefix}-${next}`;
  };
}

function startedJournal(input = {}, journal = { sessions: [] }, id = 'session-1') {
  return startSession(journal, {
    mapName: 'Dunes Map',
    farmTypeId: 'breach',
    poeVersion: 'poe1',
    league: 'Mirage',
    costChaos: 10,
    startedAt: '2026-10-21T11:50:00.000Z',
    ...input
  }, { id, now: NOW });
}

test('startSession creates an active session in the server shape', () => {
  const { journal, session } = startedJournal({ mapTier: '16', notes: '  juiced  ' });

  assert.deepEqual(session, {
    id: 'session-1',
    mapName: 'Dunes Map',
    mapTier: 16,
    mapType: 'breach',
    farmTypeId: 'breach',
    strategyTag: null,
    notes: 'juiced',
    league: 'Mirage',
    poeVersion: 'poe1',
    costChaos: 10,
    costSource: null,
    costPending: null,
    durationSec: null,
    startedAt: '2026-10-21T11:50:00.000Z',
    endedAt: null,
    status: 'active',
    totalLootChaos: 0,
    profitChaos: -10,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    lootEntries: []
  });
  assert.equal(getActiveSession(journal).id, 'session-1');
});

test('startSession keeps the cost source and a pending cost, and starts the profit at minus the cost', () => {
  const farmType = startedJournal({ costChaos: 12.5, costSource: 'farmType' }).session;
  assert.equal(farmType.costSource, 'farmType');
  assert.equal(farmType.profitChaos, -12.5);
  assert.equal(farmType.totalLootChaos, 0);

  const pending = startedJournal({ costChaos: 0, costSource: 'farmType', costPending: { amount: 2, unit: 'divine' } }).session;
  assert.deepEqual(pending.costPending, { amount: 2, unit: 'divine' });
  assert.equal(Object.is(pending.profitChaos, 0), true);

  const invalid = startedJournal({ costSource: 'other', costPending: { amount: -1, unit: 'exalted' } }).session;
  assert.equal(invalid.costSource, null);
  assert.equal(invalid.costPending, null);
});

test('a map without loot ends at minus its cost, and loot counts against the cost', () => {
  const { journal } = startedJournal({ costChaos: 20 });
  assert.equal(endSession(journal, 'session-1', {}, { now: NOW }).session.profitChaos, -20);

  const looted = addLoot(journal, 'session-1', [{ itemName: 'Divine Orb', chaosValue: 150 }], { createId: idFactory('loot'), now: NOW });
  assert.equal(looted.session.profitChaos, 130);
});

test('startSession refuses a second active session and a missing map name', () => {
  const { journal } = startedJournal();

  assert.throws(() => startedJournal({}, journal, 'session-2'), { code: 'SESSION_ALREADY_ACTIVE' });
  assert.throws(() => startedJournal({ mapName: '  ' }), { code: 'SESSION_MAP_NAME_REQUIRED' });
});

test('addLoot stores entries newest first and recalculates totals', () => {
  const { journal } = startedJournal();
  const createId = idFactory('loot');
  const first = addLoot(journal, 'session-1', [{ itemName: 'Divine Orb', itemType: 'currency', chaosValue: 150 }], {
    createId,
    now: NOW
  });
  const second = addLoot(first.journal, 'session-1', [
    { itemName: 'Scarab', itemType: 'not-a-type', quantity: '3', chaosValue: '2.5', source: 'ocr' }
  ], { createId, now: new Date('2026-10-21T12:01:00.000Z') });

  assert.deepEqual(second.lootEntries[0], {
    id: 'loot-2',
    sessionId: 'session-1',
    itemName: 'Scarab',
    itemType: 'other',
    quantity: 3,
    chaosValue: 2.5,
    divineValue: null,
    source: 'ocr',
    createdAt: '2026-10-21T12:01:00.000Z',
    updatedAt: '2026-10-21T12:01:00.000Z'
  });
  assert.deepEqual(second.session.lootEntries.map((loot) => loot.id), ['loot-2', 'loot-1']);
  assert.equal(second.session.totalLootChaos, 157.5);
  assert.equal(second.session.profitChaos, 147.5);
  assert.equal(getSession(second.journal, 'session-1').totalLootChaos, 157.5);
});

test('addLoot accepts the inventory source and still reads the older ones, and falls back to manual for others', () => {
  const { journal } = startedJournal();
  const { lootEntries } = addLoot(journal, 'session-1', ['inventory', 'ocr', 'api', 'manual', 'made-up'].map((source, index) => ({
    itemName: `Item ${index}`,
    source
  })), { createId: idFactory('loot'), now: NOW });

  assert.deepEqual(lootEntries.map((loot) => loot.source), ['inventory', 'ocr', 'api', 'manual', 'manual']);
});

test('addLoot keeps the art of an item that has one', () => {
  const { journal } = startedJournal();
  const { lootEntries } = addLoot(journal, 'session-1', [
    { itemName: 'Omen of Light', icon: ' https://example.test/omen.png ' },
    { itemName: 'Exalted Orb', icon: null },
    { itemName: 'Chaos Orb' }
  ], { createId: idFactory('loot'), now: NOW });

  assert.equal(lootEntries[0].icon, 'https://example.test/omen.png');
  assert.equal('icon' in lootEntries[1], false);
  assert.equal('icon' in lootEntries[2], false);
});

test('addLoot on an ended session adds the loot, recalculates the totals and keeps it completed', () => {
  const { journal } = startedJournal({ costChaos: 10 });
  const ended = endSession(journal, 'session-1', { endedAt: '2026-10-21T11:55:00.000Z' }, { now: NOW });
  assert.equal(ended.session.status, 'completed');
  assert.deepEqual([ended.session.totalLootChaos, ended.session.profitChaos], [0, -10]);

  const counted = addLoot(ended.journal, 'session-1', [
    { itemName: 'Divine Orb', itemType: 'currency', quantity: 1, chaosValue: 150, source: 'inventory' },
    { itemName: 'Exalted Orb', itemType: 'currency', quantity: 2, chaosValue: 12, source: 'inventory' }
  ], { createId: idFactory('loot'), now: new Date('2026-10-21T12:30:00.000Z') });

  assert.equal(counted.session.status, 'completed');
  assert.equal(counted.session.endedAt, '2026-10-21T11:55:00.000Z');
  assert.equal(counted.session.durationSec, ended.session.durationSec);
  assert.equal(counted.session.totalLootChaos, 174);
  assert.equal(counted.session.profitChaos, 164);
  assert.equal(counted.session.updatedAt, '2026-10-21T12:30:00.000Z');
  assert.equal(getSession(counted.journal, 'session-1').totalLootChaos, 174);
});

test('addLoot keeps the item types of the PoE 2 Currency tabs', () => {
  const { journal } = startedJournal();
  const itemTypes = ['omen', 'catalyst', 'abyssal_bone', 'liquid_emotion', 'verisium'];
  const { lootEntries } = addLoot(journal, 'session-1', itemTypes.map((itemType) => ({ itemName: itemType, itemType })), {
    createId: idFactory('loot'),
    now: NOW
  });

  assert.deepEqual(lootEntries.map((loot) => loot.itemType).sort(), [...itemTypes].sort());
});

test('addLoot rejects unknown sessions and nameless items', () => {
  const { journal } = startedJournal();
  const options = { createId: idFactory('loot'), now: NOW };

  assert.throws(() => addLoot(journal, 'missing', [{ itemName: 'Chaos Orb' }], options), { code: 'SESSION_NOT_FOUND' });
  assert.throws(() => addLoot(journal, 'session-1', [{ itemName: '' }], options), { code: 'LOOT_ITEM_NAME_REQUIRED' });
});

test('endSession uses completion totals when both are sent', () => {
  const { journal } = startedJournal();
  const { session } = endSession(journal, 'session-1', {
    endedAt: '2026-10-21T11:55:30.000Z',
    totalLootChaos: 40,
    profitChaos: 35
  }, { now: NOW });

  assert.equal(session.status, 'completed');
  assert.equal(session.endedAt, '2026-10-21T11:55:30.000Z');
  assert.equal(session.durationSec, 330);
  assert.equal(session.totalLootChaos, 40);
  assert.equal(session.profitChaos, 35);
});

test('endSession falls back to loot totals and refuses a session that is not active', () => {
  const { journal } = startedJournal();
  const withLoot = addLoot(journal, 'session-1', [{ itemName: 'Exalted Orb', chaosValue: 25 }], {
    createId: idFactory('loot'),
    now: NOW
  });
  const ended = endSession(withLoot.journal, 'session-1', {}, { now: NOW });

  assert.equal(ended.session.totalLootChaos, 25);
  assert.equal(ended.session.profitChaos, 15);
  assert.equal(ended.session.durationSec, 600);
  assert.equal(getActiveSession(ended.journal), null);
  assert.throws(() => endSession(ended.journal, 'session-1', {}, { now: NOW }), { code: 'ACTIVE_SESSION_NOT_FOUND' });
});

test('updateSession changes only the strategy tag and notes it was given', () => {
  const { journal } = startedJournal({ strategyTag: 'alch-go', notes: 'keep' });
  const { session } = updateSession(journal, 'session-1', { notes: '' }, { now: NOW });

  assert.equal(session.strategyTag, 'alch-go');
  assert.equal(session.notes, null);
  assert.throws(() => updateSession(journal, 'missing', {}, { now: NOW }), { code: 'SESSION_NOT_FOUND' });
});

test('listSessions filters, sorts newest first, pages and leaves loot out', () => {
  let journal = { sessions: [] };
  const sessions = [
    ['s-1', 'poe1', 'Mirage', '2026-10-21T09:00:00.000Z'],
    ['s-2', 'poe2', 'Rise of the Abyssal', '2026-10-21T10:00:00.000Z'],
    ['s-3', 'poe1', 'Mirage', '2026-10-21T11:00:00.000Z']
  ];
  for (const [id, poeVersion, league, startedAt] of sessions) {
    journal = endSession(startedJournal({ poeVersion, league, startedAt }, journal, id).journal, id, {}, { now: NOW }).journal;
  }
  journal = addLoot(journal, 's-3', [
    { itemName: 'Divine Orb', quantity: 12, chaosValue: 150 },
    { itemName: 'Chaos Orb', quantity: 140, chaosValue: 1 }
  ], { createId: idFactory('loot'), now: NOW }).journal;

  const result = listSessions(journal, { poeVersion: 'poe1', league: 'Mirage', limit: 1, offset: 0 });

  assert.equal(result.total, 2);
  assert.equal(result.limit, 1);
  assert.deepEqual(result.sessions.map((session) => session.id), ['s-3']);
  assert.equal('lootEntries' in result.sessions[0], false);
  assert.equal(result.sessions[0].lootCount, 152);
  assert.deepEqual(listSessions(journal, { poeVersion: 'poe1' }).sessions.map((session) => session.lootCount), [152, 0]);
  assert.deepEqual(listSessions(journal, { status: 'active' }).sessions, []);
});

test('listRecentLoot returns the newest loot with its session context', () => {
  const createId = idFactory('loot');
  let journal = startedJournal({}, { sessions: [] }, 's-1').journal;
  journal = addLoot(journal, 's-1', [{ itemName: 'Chaos Orb', chaosValue: 1 }], { createId, now: NOW }).journal;
  journal = endSession(journal, 's-1', {}, { now: NOW }).journal;
  journal = startedJournal({ poeVersion: 'poe2', league: 'Rise of the Abyssal' }, journal, 's-2').journal;
  journal = addLoot(journal, 's-2', [{ itemName: 'Exalted Orb', chaosValue: 5 }], {
    createId,
    now: new Date('2026-10-21T12:05:00.000Z')
  }).journal;

  const all = listRecentLoot(journal, { limit: 8 });
  const poe1 = listRecentLoot(journal, { poeVersion: 'poe1' });

  assert.deepEqual(all.lootEntries.map((loot) => loot.itemName), ['Exalted Orb', 'Chaos Orb']);
  assert.equal(all.lootEntries[0].session.league, 'Rise of the Abyssal');
  assert.equal(all.count, 2);
  assert.deepEqual(poe1.lootEntries.map((loot) => loot.itemName), ['Chaos Orb']);
  assert.equal(poe1.poeVersion, 'poe1');
});

test('getPersonalStats sums completed sessions started today in the selected context', () => {
  // Local times, because "today" starts at local midnight.
  const localNoon = new Date(2026, 9, 21, 12, 0, 0);
  let journal = { sessions: [] };
  const runs = [
    ['today-1', new Date(2026, 9, 21, 10, 0, 0), 30, 20],
    ['today-2', new Date(2026, 9, 21, 10, 30, 0), 10, -5],
    ['two-days-ago', new Date(2026, 9, 19, 10, 0, 0), 100, 90]
  ];
  for (const [id, startedAt, totalLootChaos, profitChaos] of runs) {
    const started = startedJournal({ startedAt: startedAt.toISOString() }, journal, id).journal;
    const endedAt = new Date(startedAt.getTime() + 15 * 60 * 1000).toISOString();
    journal = endSession(started, id, { endedAt, totalLootChaos, profitChaos }, { now: localNoon }).journal;
  }
  journal = startedJournal({ startedAt: new Date(2026, 9, 21, 11, 45, 0).toISOString() }, journal, 'active').journal;

  const stats = getPersonalStats(journal, { period: 'daily', poeVersion: 'poe1', league: 'Mirage', now: localNoon });
  const otherLeague = getPersonalStats(journal, { period: 'daily', league: 'Standard', now: localNoon });

  assert.equal(stats.summary.totalSessions, 2);
  assert.equal(stats.summary.totalCost, 20);
  assert.equal(stats.summary.totalLoot, 40);
  assert.equal(stats.summary.totalProfit, 15);
  assert.equal(stats.summary.totalDuration, 1800);
  assert.equal(stats.summary.avgProfitPerMap, 7.5);
  assert.equal(stats.summary.avgProfitPerHour, 30);
  assert.equal(otherLeague.summary.totalSessions, 0);
  assert.equal(otherLeague.summary.avgProfitPerMap, 0);
});

function lootJournal({ end = false } = {}) {
  const started = startedJournal({ costChaos: 10 });
  const added = addLoot(started.journal, 'session-1', [
    { itemName: 'Divine Orb', chaosValue: 100, quantity: 2 },
    { itemName: 'Chaos Orb', chaosValue: 1, quantity: 5 }
  ], { createId: idFactory('loot'), now: NOW });
  if (!end) return added;
  const ended = endSession(added.journal, 'session-1', {}, { now: new Date('2026-10-21T12:30:00.000Z') });
  return { journal: ended.journal, session: ended.session };
}

test('updateLoot changes the quantity and the totals of an active and a completed session', () => {
  const later = new Date('2026-10-21T13:00:00.000Z');
  for (const end of [false, true]) {
    const { journal, session } = lootJournal({ end });
    const [first] = session.lootEntries;
    const result = updateLoot(journal, 'session-1', first.id, { quantity: '3' }, { now: later });

    assert.equal(result.lootEntry.quantity, 3);
    assert.equal(result.lootEntry.updatedAt, later.toISOString());
    assert.equal(result.session.totalLootChaos, 3 * first.chaosValue + 5);
    assert.equal(result.session.profitChaos, result.session.totalLootChaos - 10);
    assert.equal(result.session.updatedAt, later.toISOString());
    assert.equal(result.session.status, end ? 'completed' : 'active');
    assert.deepEqual(result.session.lootEntries.map((loot) => loot.id), session.lootEntries.map((loot) => loot.id));
    assert.deepEqual(getSession(result.journal, 'session-1'), result.session);
  }
});

test('updateLoot rejects quantities that are not whole numbers from 1 to 1000000 and unknown ids', () => {
  const { journal, session } = lootJournal();
  const id = session.lootEntries[0].id;
  for (const quantity of [0, -1, 2.5, 'x', '', 1000001, NaN, null, undefined, '2.5', '1e3', '0x10', true, ' ']) {
    assert.throws(() => updateLoot(journal, 'session-1', id, { quantity }, { now: NOW }), { code: 'LOOT_QUANTITY_INVALID' }, String(quantity));
  }
  assert.throws(() => updateLoot(journal, 'session-1', id, undefined, { now: NOW }), { code: 'LOOT_QUANTITY_INVALID' });
  assert.equal(updateLoot(journal, 'session-1', id, { quantity: 1000000 }, { now: NOW }).lootEntry.quantity, 1000000);
  assert.equal(updateLoot(journal, 'session-1', id, { quantity: ' 12 ' }, { now: NOW }).lootEntry.quantity, 12);
  assert.throws(() => updateLoot(journal, 'session-1', 'nope', { quantity: 2 }, { now: NOW }), { code: 'LOOT_NOT_FOUND' });
  assert.throws(() => updateLoot(journal, 'missing', id, { quantity: 2 }, { now: NOW }), { code: 'SESSION_NOT_FOUND' });
});

test('deleteLoot removes the entry and retotals the session', () => {
  for (const end of [false, true]) {
    const { journal, session } = lootJournal({ end });
    const [first, second] = session.lootEntries;
    const result = deleteLoot(journal, 'session-1', first.id, { now: NOW });

    assert.deepEqual(result.lootEntry, first);
    assert.deepEqual(result.session.lootEntries, [second]);
    assert.equal(result.session.totalLootChaos, 5);
    assert.equal(result.session.profitChaos, -5);
    assert.equal(result.session.status, end ? 'completed' : 'active');
    assert.throws(() => deleteLoot(result.journal, 'session-1', first.id, { now: NOW }), { code: 'LOOT_NOT_FOUND' });
    assert.throws(() => deleteLoot(journal, 'missing', first.id, { now: NOW }), { code: 'SESSION_NOT_FOUND' });
  }
});

test('updateLoot and deleteLoot keep totals that did not come from the loot, such as stash-diff totals', () => {
  const { journal, session } = lootJournal();
  const ended = endSession(journal, 'session-1', { totalLootChaos: 500, profitChaos: 490 }, { now: NOW });
  const [first] = session.lootEntries;

  for (const result of [
    updateLoot(ended.journal, 'session-1', first.id, { quantity: 9 }, { now: NOW }),
    deleteLoot(ended.journal, 'session-1', first.id, { now: NOW })
  ]) {
    assert.equal(result.session.totalLootChaos, 500);
    assert.equal(result.session.profitChaos, 490);
    assert.equal(result.session.status, 'completed');
    assert.equal(result.totalsFollowLoot, false);
  }
  assert.equal(updateLoot(journal, 'session-1', first.id, { quantity: 9 }, { now: NOW }).totalsFollowLoot, true);
});

test('stash totals equal to the loot sum still stay when their profit is not the loot\'s', () => {
  const { journal, session } = lootJournal();
  // The loot sums to 205, but the stash diff lost value elsewhere, so its profit is not 205 - 10.
  const ended = endSession(journal, 'session-1', { totalLootChaos: 205, profitChaos: -50 }, { now: NOW });
  const [first] = session.lootEntries;

  const { session: updated, totalsFollowLoot } = updateLoot(ended.journal, 'session-1', first.id, { quantity: 1 }, { now: NOW });

  assert.equal(totalsFollowLoot, false);
  assert.equal(updated.totalLootChaos, 205);
  assert.equal(updated.profitChaos, -50);
});

test('only an id string names a loot entry, so entries without an id cannot be edited by a missing one', () => {
  const started = startedJournal();
  const journal = {
    sessions: [{ ...started.session, lootEntries: [{ itemName: 'Old Scroll', quantity: 1, chaosValue: 1 }] }]
  };

  for (const lootId of [undefined, null, '', 0]) {
    assert.throws(() => deleteLoot(journal, 'session-1', lootId, { now: NOW }), { code: 'LOOT_NOT_FOUND' }, String(lootId));
    assert.throws(() => updateLoot(journal, 'session-1', lootId, { quantity: 2 }, { now: NOW }), { code: 'LOOT_NOT_FOUND' }, String(lootId));
  }
});

test('updateCost sets the cost and moves the profit by the opposite change, active or finished', () => {
  const later = new Date('2026-10-21T13:00:00.000Z');
  for (const end of [false, true]) {
    const { journal } = lootJournal({ end });
    const result = updateCost(journal, 'session-1', 25.5, { now: later });

    assert.equal(result.delta, 15.5);
    assert.equal(result.session.costChaos, 25.5);
    assert.equal(result.session.costSource, 'manual');
    assert.equal(result.session.totalLootChaos, 205);
    assert.equal(result.session.profitChaos, 179.5);
    assert.equal(result.session.updatedAt, later.toISOString());
    assert.equal(getSession(result.journal, 'session-1'), result.session);

    // A lower cost raises the profit again.
    assert.equal(updateCost(result.journal, 'session-1', 0, { now: later }).session.profitChaos, 205);
  }
});

test('updateCost keeps stash totals, and the loot rule keeps following the loot afterwards', () => {
  const { journal, session } = lootJournal();
  const ended = endSession(journal, 'session-1', { totalLootChaos: 900, profitChaos: 850 }, { now: NOW });

  const { session: updated, delta } = updateCost(ended.journal, 'session-1', 30, { now: NOW });
  assert.equal(delta, 20);
  assert.equal(updated.totalLootChaos, 900);
  assert.equal(updated.profitChaos, 830);

  // A loot-derived map still passes the totalsFollowLoot rule after its cost changed.
  const derived = endSession(lootJournal().journal, 'session-1', {}, { now: NOW });
  const recosted = updateCost(derived.journal, 'session-1', 50, { now: NOW });
  const edited = updateLoot(recosted.journal, 'session-1', session.lootEntries[0].id, { quantity: 1 }, { now: NOW });
  assert.equal(edited.totalsFollowLoot, true);
  assert.equal(edited.session.profitChaos, edited.session.totalLootChaos - 50);
});

test('updateCost sets the source and clears or keeps a pending cost', () => {
  const pendingJournal = startedJournal({ costChaos: 0, costSource: 'farmType', costPending: { amount: 2, unit: 'divine' } });

  const settled = updateCost(pendingJournal.journal, 'session-1', 600, { source: 'farmType', now: NOW });
  assert.equal(settled.session.costSource, 'farmType');
  assert.equal(settled.session.costPending, null);
  assert.equal(settled.session.profitChaos, -600);

  const kept = updateCost(pendingJournal.journal, 'session-1', 0, { source: 'farmType', now: NOW, pending: { amount: 3, unit: 'divine' } });
  assert.deepEqual(kept.session.costPending, { amount: 3, unit: 'divine' });

  const manual = updateCost(pendingJournal.journal, 'session-1', 5, { now: NOW });
  assert.equal(manual.session.costSource, 'manual');
  assert.equal(manual.session.costPending, null);
});

test('updateCost refuses a cost that is not a finite number from 0 to the cap, and an unknown session', () => {
  const { journal } = startedJournal();

  for (const cost of [-1, Number.NaN, Infinity, 10000001, '5', null, undefined]) {
    assert.throws(() => updateCost(journal, 'session-1', cost, { now: NOW }), { code: 'COST_INVALID' }, String(cost));
  }
  assert.equal(updateCost(journal, 'session-1', 10000000, { now: NOW }).session.costChaos, 10000000);
  assert.throws(() => updateCost(journal, 'missing', 5, { now: NOW }), { code: 'SESSION_NOT_FOUND' });
});

test('the stats count the changed cost and profit of a finished map', () => {
  const ended = endSession(lootJournal().journal, 'session-1', {}, { now: NOW });
  const { journal } = updateCost(ended.journal, 'session-1', 40, { now: NOW });

  const { summary } = getPersonalStats(journal, { period: 'daily', now: new Date('2026-10-21T14:00:00.000Z') });
  assert.equal(summary.totalCost, 40);
  assert.equal(summary.totalLoot, 205);
  assert.equal(summary.totalProfit, 165);
});

test('addLoot keeps stash totals, says whether the totals follow the loot, and marks unread loot; markLootUnread marks a run', () => {
  const started = startSession({ sessions: [] }, { mapName: 'Dunes Map', poeVersion: 'poe1', league: 'Mirage', costChaos: 10 }, { id: 's1', now: NOW });
  const ended = endSession(started.journal, 's1', { endedAt: NOW.toISOString(), totalLootChaos: 900, profitChaos: 840 }, { now: NOW });

  const stash = addLoot(ended.journal, 's1', [{ itemName: 'Essence of Ruin', chaosValue: 30 }], { createId: () => 'l1', now: NOW });
  assert.equal(stash.totalsFollowLoot, false);
  assert.equal(stash.session.totalLootChaos, 900);
  assert.equal(stash.session.profitChaos, 840);
  assert.equal(stash.session.lootEntries.length, 1);
  assert.equal(stash.session.lootUnread, undefined);

  const read = addLoot(started.journal, 's1', [{ itemName: 'Exalted Orb', chaosValue: 5, quantity: 2 }], { createId: () => 'l2', now: NOW, lootUnread: true });
  assert.equal(read.totalsFollowLoot, true);
  assert.equal(read.session.totalLootChaos, 10);
  assert.equal(read.session.profitChaos, 0);
  assert.equal(read.session.lootUnread, true);

  const marked = markLootUnread(ended.journal, 's1', { now: NOW });
  assert.equal(marked.session.lootUnread, true);
  assert.equal(marked.session.profitChaos, 840);
  assert.equal(getSession(marked.journal, 's1').lootUnread, true);
  assert.throws(() => markLootUnread(ended.journal, 'nope', { now: NOW }), { code: 'SESSION_NOT_FOUND' });
});
