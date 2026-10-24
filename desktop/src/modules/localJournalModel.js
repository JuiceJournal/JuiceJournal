// Sessions and their loot, kept on this machine. Returns the same shapes the server API used to, so the
// renderer reads them unchanged.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.localJournalModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createLocalJournalModel() {
  const ITEM_TYPES = new Set([
    'currency', 'fragment', 'scarab', 'map', 'divination_card', 'gem', 'unique', 'oil', 'incubator',
    'delirium_orb', 'catalyst', 'essence', 'fossil', 'beast', 'rune', 'tattoo', 'omen', 'soul_core', 'idol',
    'expedition', 'ultimatum', 'vaal', 'base_type', 'other'
  ]);
  const LOOT_SOURCES = new Set(['manual', 'ocr', 'api']);
  const PERIOD_DAYS = { weekly: 7, monthly: 30 };

  function journalError(message, code) {
    return Object.assign(new Error(message), { code });
  }

  function toNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function normalizeOptionalText(value, maxLength) {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed ? trimmed.slice(0, maxLength) : null;
  }

  function toIsoDate(value) {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  }

  function normalizeJournal(journal) {
    return { sessions: Array.isArray(journal?.sessions) ? journal.sessions : [] };
  }

  // List rows drop the loot entries but keep the item count the Sessions list shows.
  function withoutLoot(session) {
    const { lootEntries, ...summary } = session;
    return { ...summary, lootCount: (lootEntries || []).reduce((sum, loot) => sum + toNumber(loot.quantity), 0) };
  }

  function sumLootChaos(lootEntries) {
    return lootEntries.reduce((sum, loot) => sum + toNumber(loot.chaosValue) * toNumber(loot.quantity), 0);
  }

  function replaceSession(journal, session) {
    return {
      ...journal,
      sessions: journal.sessions.map((candidate) => (candidate.id === session.id ? session : candidate))
    };
  }

  function matchesContext(session, { poeVersion, league } = {}) {
    return (!poeVersion || session.poeVersion === poeVersion) && (!league || session.league === league);
  }

  function clampInteger(value, fallback, min, max) {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? Math.min(Math.max(number, min), max) : fallback;
  }

  function getActiveSession(journal) {
    return normalizeJournal(journal).sessions.find((session) => session.status === 'active') || null;
  }

  function getSession(journal, sessionId) {
    return normalizeJournal(journal).sessions.find((session) => session.id === sessionId) || null;
  }

  function requireSession(journal, sessionId) {
    const session = getSession(journal, sessionId);
    if (!session) {
      throw journalError('Session not found', 'SESSION_NOT_FOUND');
    }
    return session;
  }

  function startSession(journal, input = {}, { id, now }) {
    const current = normalizeJournal(journal);
    if (getActiveSession(current)) {
      throw journalError('An active session already exists. Complete the current session first.', 'SESSION_ALREADY_ACTIVE');
    }

    const mapName = normalizeOptionalText(input.mapName, 100);
    if (!mapName) {
      throw journalError('Map name is required', 'SESSION_MAP_NAME_REQUIRED');
    }

    const timestamp = now.toISOString();
    const farmTypeId = normalizeOptionalText(input.farmTypeId ?? input.mapType, 50);
    const mapTier = Number.parseInt(input.mapTier, 10);
    const session = {
      id,
      mapName,
      mapTier: mapTier >= 1 && mapTier <= 21 ? mapTier : null,
      mapType: farmTypeId,
      farmTypeId,
      strategyTag: normalizeOptionalText(input.strategyTag, 50),
      notes: normalizeOptionalText(input.notes, 2000),
      league: normalizeOptionalText(input.league, 50) || 'Standard',
      poeVersion: input.poeVersion === 'poe2' ? 'poe2' : 'poe1',
      costChaos: Math.max(0, toNumber(input.costChaos)),
      durationSec: null,
      startedAt: toIsoDate(input.startedAt) || timestamp,
      endedAt: null,
      status: 'active',
      totalLootChaos: 0,
      profitChaos: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      lootEntries: []
    };

    return { journal: { ...current, sessions: [session, ...current.sessions] }, session };
  }

  // Totals sent with the completion win; otherwise they come from the session's loot, as on the server.
  function endSession(journal, sessionId, completion = {}, { now }) {
    const current = normalizeJournal(journal);
    const session = getSession(current, sessionId);
    if (!session || session.status !== 'active') {
      throw journalError('No active session was found', 'ACTIVE_SESSION_NOT_FOUND');
    }

    const startedAtMs = Date.parse(session.startedAt);
    const endedAtMs = Math.max(Date.parse(toIsoDate(completion.endedAt) || now.toISOString()), startedAtMs);
    const hasTotals = [completion.totalLootChaos, completion.profitChaos]
      .every((value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)));
    const totalLootChaos = hasTotals ? Number(completion.totalLootChaos) : sumLootChaos(session.lootEntries || []);
    const ended = {
      ...session,
      status: 'completed',
      endedAt: new Date(endedAtMs).toISOString(),
      durationSec: Math.floor((endedAtMs - startedAtMs) / 1000),
      totalLootChaos,
      profitChaos: hasTotals ? Number(completion.profitChaos) : totalLootChaos - toNumber(session.costChaos),
      updatedAt: now.toISOString()
    };

    return { journal: replaceSession(current, ended), session: ended };
  }

  function updateSession(journal, sessionId, payload = {}, { now }) {
    const current = normalizeJournal(journal);
    const updated = { ...requireSession(current, sessionId), updatedAt: now.toISOString() };
    if (Object.prototype.hasOwnProperty.call(payload, 'strategyTag')) {
      updated.strategyTag = normalizeOptionalText(payload.strategyTag, 50);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'notes')) {
      updated.notes = normalizeOptionalText(payload.notes, 2000);
    }

    return { journal: replaceSession(current, updated), session: updated };
  }

  // Each entry needs an itemName; adding loot recalculates the session totals like the server did.
  function addLoot(journal, sessionId, entries = [], { createId, now }) {
    const current = normalizeJournal(journal);
    const session = requireSession(current, sessionId);
    const timestamp = now.toISOString();
    const lootEntries = entries.map((entry) => {
      const itemName = normalizeOptionalText(entry?.itemName, 200);
      if (!itemName) {
        throw journalError('Item name is required', 'LOOT_ITEM_NAME_REQUIRED');
      }

      const divineValue = Number(entry.divineValue);
      return {
        id: createId(),
        sessionId,
        itemName,
        itemType: ITEM_TYPES.has(entry.itemType) ? entry.itemType : 'other',
        quantity: Math.max(1, Number.parseInt(entry.quantity, 10) || 1),
        chaosValue: Math.max(0, toNumber(entry.chaosValue)),
        divineValue: Number.isFinite(divineValue) && divineValue >= 0 ? divineValue : null,
        source: LOOT_SOURCES.has(entry.source) ? entry.source : 'manual',
        createdAt: timestamp,
        updatedAt: timestamp
      };
    });

    const allLoot = [...lootEntries, ...(session.lootEntries || [])];
    const totalLootChaos = sumLootChaos(allLoot);
    const updated = {
      ...session,
      lootEntries: allLoot,
      totalLootChaos,
      profitChaos: totalLootChaos - toNumber(session.costChaos),
      updatedAt: timestamp
    };

    return { journal: replaceSession(current, updated), lootEntries, session: updated };
  }

  function listSessions(journal, params = {}) {
    const limit = clampInteger(params.limit, 20, 1, 100);
    const offset = clampInteger(params.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const matching = normalizeJournal(journal).sessions
      .filter((session) => (!params.status || session.status === params.status) && matchesContext(session, params))
      .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));

    return {
      sessions: matching.slice(offset, offset + limit).map(withoutLoot),
      total: matching.length,
      limit,
      offset
    };
  }

  function listRecentLoot(journal, params = {}) {
    const limit = clampInteger(params.limit, 10, 1, 50);
    const lootEntries = normalizeJournal(journal).sessions
      .filter((session) => matchesContext(session, params))
      .flatMap((session) => (session.lootEntries || []).map((loot) => ({
        ...loot,
        session: {
          id: session.id,
          mapName: session.mapName,
          mapTier: session.mapTier,
          mapType: session.mapType,
          status: session.status,
          poeVersion: session.poeVersion,
          league: session.league,
          startedAt: session.startedAt,
          endedAt: session.endedAt
        }
      })))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, limit);

    return {
      lootEntries,
      count: lootEntries.length,
      poeVersion: params.poeVersion || null,
      league: params.league || null
    };
  }

  // Completed sessions started in the period. "daily" starts at local midnight.
  function getPersonalStats(journal, { period = 'daily', poeVersion, league, now }) {
    const start = new Date(now);
    if (period === 'daily') {
      start.setHours(0, 0, 0, 0);
    } else {
      start.setDate(start.getDate() - (PERIOD_DAYS[period] || PERIOD_DAYS.weekly));
    }

    const sessions = normalizeJournal(journal).sessions.filter((session) => {
      const startedAtMs = Date.parse(session.startedAt);
      return session.status === 'completed'
        && startedAtMs >= start.getTime()
        && startedAtMs <= now.getTime()
        && matchesContext(session, { poeVersion, league });
    });
    const totalProfit = sessions.reduce((sum, session) => sum + toNumber(session.profitChaos), 0);
    const totalDuration = sessions.reduce((sum, session) => sum + toNumber(session.durationSec), 0);

    return {
      period,
      poeVersion: poeVersion || null,
      league: league || null,
      dateRange: { start: start.toISOString(), end: now.toISOString() },
      summary: {
        totalSessions: sessions.length,
        totalCost: sessions.reduce((sum, session) => sum + toNumber(session.costChaos), 0),
        totalLoot: sessions.reduce((sum, session) => sum + toNumber(session.totalLootChaos), 0),
        totalProfit,
        totalDuration,
        avgProfitPerMap: sessions.length ? totalProfit / sessions.length : 0,
        avgProfitPerHour: totalDuration > 0 ? totalProfit / (totalDuration / 3600) : 0
      }
    };
  }

  return {
    addLoot,
    endSession,
    getActiveSession,
    getPersonalStats,
    getSession,
    listRecentLoot,
    listSessions,
    normalizeJournal,
    startSession,
    updateSession
  };
});
