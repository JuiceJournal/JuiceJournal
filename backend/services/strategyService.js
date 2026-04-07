const { Op } = require('sequelize');
const {
  Strategy,
  StrategySession,
  StrategyTag,
  Session,
  LootEntry,
  User,
} = require('../models');

function normalizeText(value, maxLength, fallback = null) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.slice(0, maxLength);
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  const seen = new Set();
  const result = [];

  for (const tag of tags) {
    const normalized = normalizeText(tag, 50, null);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result.slice(0, 12);
}

function slugify(name) {
  const normalized = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'strategy';
}

async function createUniqueSlug(name, currentStrategyId = null) {
  const MAX_ITERATIONS = 100;
  const base = slugify(name);
  let candidate = base;
  let counter = 1;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration += 1) {
    const where = currentStrategyId
      ? {
        slug: candidate,
        id: { [Op.ne]: currentStrategyId }
      }
      : { slug: candidate };

    const existing = await Strategy.findOne({
      where,
      attributes: ['id'],
      raw: true
    });

    if (!existing) {
      return candidate;
    }

    counter += 1;
    candidate = `${base}-${counter}`;
  }

  throw new Error(`Unable to generate unique slug for "${name}" after ${MAX_ITERATIONS} attempts`);
}

function getYearFromDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.getUTCFullYear();
}

function toNumber(value) {
  const numeric = parseFloat(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toInteger(value) {
  const numeric = parseInt(value, 10);
  return Number.isFinite(numeric) ? numeric : 0;
}

function filterSessionsByYear(sessions, year) {
  if (!year) {
    return sessions;
  }

  return sessions.filter((session) => getYearFromDate(session.startedAt) === year);
}

function buildTrend(sessions, days = 7) {
  const now = new Date();
  const buckets = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset));
    const key = date.toISOString().slice(0, 10);
    buckets.push({
      date: key,
      totalProfitChaos: 0,
      runCount: 0
    });
  }

  const bucketMap = new Map(buckets.map((bucket) => [bucket.date, bucket]));
  for (const session of sessions) {
    const key = new Date(session.startedAt).toISOString().slice(0, 10);
    const bucket = bucketMap.get(key);
    if (!bucket) {
      continue;
    }

    bucket.totalProfitChaos += toNumber(session.profitChaos);
    bucket.runCount += 1;
  }

  return buckets;
}

function buildLootBreakdown(sessions) {
  const totals = new Map();

  for (const session of sessions) {
    for (const lootEntry of session.lootEntries || []) {
      const key = lootEntry.itemType || 'other';
      const existing = totals.get(key) || 0;
      totals.set(key, existing + (toNumber(lootEntry.chaosValue) * toInteger(lootEntry.quantity || 1)));
    }
  }

  return Array.from(totals.entries())
    .map(([itemType, totalChaos]) => ({ itemType, totalChaos }))
    .sort((a, b) => b.totalChaos - a.totalChaos)
    .slice(0, 8);
}

function buildRunHistory(sessions) {
  return [...sessions]
    .sort((left, right) => new Date(right.startedAt) - new Date(left.startedAt))
    .map((session) => ({
      id: session.id,
      mapName: session.mapName,
      mapTier: session.mapTier,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationSec: session.durationSec,
      costChaos: toNumber(session.costChaos),
      totalLootChaos: toNumber(session.totalLootChaos),
      profitChaos: toNumber(session.profitChaos),
    }));
}

function uniqueById(items) {
  const seen = new Set();
  const result = [];

  for (const item of items || []) {
    if (!item?.id || seen.has(item.id)) {
      continue;
    }

    seen.add(item.id);
    result.push(item);
  }

  return result;
}

function buildStrategyAggregate(strategy, options = {}) {
  const year = options.year ? parseInt(options.year, 10) : null;
  const sessions = filterSessionsByYear(uniqueById(strategy.sessions || []), year).filter((session) => session.status === 'completed');

  const runCount = sessions.length;
  const totalProfitChaos = sessions.reduce((sum, session) => sum + toNumber(session.profitChaos), 0);
  const totalCostChaos = sessions.reduce((sum, session) => sum + toNumber(session.costChaos), 0);
  const totalLootChaos = sessions.reduce((sum, session) => sum + toNumber(session.totalLootChaos), 0);
  const totalDurationSec = sessions.reduce((sum, session) => sum + toInteger(session.durationSec), 0);
  const avgProfitChaos = runCount > 0 ? totalProfitChaos / runCount : 0;
  const avgCostChaos = runCount > 0 ? totalCostChaos / runCount : 0;
  const avgProfitPerHour = totalDurationSec > 0 ? totalProfitChaos / (totalDurationSec / 3600) : 0;

  const lastRun = sessions.reduce((latest, session) => {
    if (!latest) {
      return session;
    }

    return new Date(session.startedAt) > new Date(latest.startedAt) ? session : latest;
  }, null);

  return {
    runCount,
    totalProfitChaos,
    totalCostChaos,
    totalLootChaos,
    totalDurationSec,
    avgProfitChaos,
    avgCostChaos,
    avgProfitPerHour,
    lastRunAt: lastRun?.startedAt || null,
    trend: buildTrend(sessions, options.trendDays || 7),
    topLootCategories: buildLootBreakdown(sessions),
    runHistory: buildRunHistory(sessions)
  };
}

function serializeStrategy(strategy, options = {}) {
  const aggregate = buildStrategyAggregate(strategy, options);

  return {
    id: strategy.id,
    name: strategy.name,
    slug: strategy.slug,
    description: strategy.description,
    mapName: strategy.mapName,
    poeVersion: strategy.poeVersion,
    league: strategy.league,
    visibility: strategy.visibility,
    publishedAt: strategy.publishedAt,
    lastCalculatedAt: strategy.lastCalculatedAt,
    createdAt: strategy.createdAt,
    updatedAt: strategy.updatedAt,
    author: strategy.user ? {
      id: strategy.user.id,
      username: strategy.user.username
    } : null,
    tags: uniqueById(strategy.tags || []).map((tag) => tag.tag),
    metrics: {
      runCount: aggregate.runCount,
      totalProfitChaos: aggregate.totalProfitChaos,
      totalCostChaos: aggregate.totalCostChaos,
      totalLootChaos: aggregate.totalLootChaos,
      totalDurationSec: aggregate.totalDurationSec,
      avgProfitChaos: aggregate.avgProfitChaos,
      avgCostChaos: aggregate.avgCostChaos,
      avgProfitPerHour: aggregate.avgProfitPerHour,
      lastRunAt: aggregate.lastRunAt
    },
    trend: aggregate.trend,
    topLootCategories: options.includeDetails ? aggregate.topLootCategories : undefined,
    runHistory: options.includeDetails ? aggregate.runHistory : undefined
  };
}

async function loadStrategiesForUser(userId, filters = {}) {
  const strategyWhere = { userId };
  if (filters.visibility) {
    strategyWhere.visibility = filters.visibility;
  }
  if (filters.poeVersion) {
    strategyWhere.poeVersion = filters.poeVersion;
  }
  if (filters.league) {
    strategyWhere.league = filters.league;
  }

  const limit = Math.min(parseInt(filters.limit, 10) || 50, 100);
  const offset = parseInt(filters.offset, 10) || 0;

  return Strategy.findAll({
    where: strategyWhere,
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'username']
      },
      {
        model: StrategyTag,
        as: 'tags',
      },
      {
        model: Session,
        as: 'sessions',
        through: { attributes: [] },
        attributes: [
          'id',
          'mapName',
          'mapTier',
          'poeVersion',
          'league',
          'status',
          'startedAt',
          'endedAt',
          'durationSec',
          'costChaos',
          'totalLootChaos',
          'profitChaos'
        ],
      }
    ],
    order: [['updatedAt', 'DESC']],
    limit,
    offset
  });
}

async function loadStrategyByIdForUser(id, userId, includeDetails = false) {
  return Strategy.findOne({
    where: { id, userId },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'username']
      },
      {
        model: StrategyTag,
        as: 'tags',
      },
      {
        model: Session,
        as: 'sessions',
        through: { attributes: [] },
        attributes: [
          'id',
          'mapName',
          'mapTier',
          'poeVersion',
          'league',
          'status',
          'startedAt',
          'endedAt',
          'durationSec',
          'costChaos',
          'totalLootChaos',
          'profitChaos'
        ],
        include: includeDetails ? [{
          model: LootEntry,
          as: 'lootEntries',
          attributes: ['id', 'itemType', 'quantity', 'chaosValue']
        }] : []
      }
    ]
  });
}

async function loadPublicStrategies(filters = {}) {
  const strategyWhere = { visibility: 'public' };
  if (filters.poeVersion) {
    strategyWhere.poeVersion = filters.poeVersion;
  }
  if (filters.league) {
    strategyWhere.league = filters.league;
  }
  if (filters.mapName) {
    strategyWhere.mapName = {
      [Op.iLike]: `%${filters.mapName}%`
    };
  }

  const limit = Math.min(parseInt(filters.limit, 10) || 50, 100);
  const offset = parseInt(filters.offset, 10) || 0;

  return Strategy.findAll({
    where: strategyWhere,
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'username']
      },
      {
        model: StrategyTag,
        as: 'tags',
      },
      {
        model: Session,
        as: 'sessions',
        through: { attributes: [] },
        attributes: [
          'id',
          'mapName',
          'mapTier',
          'poeVersion',
          'league',
          'status',
          'startedAt',
          'endedAt',
          'durationSec',
          'costChaos',
          'totalLootChaos',
          'profitChaos'
        ],
      }
    ],
    order: [['publishedAt', 'DESC'], ['updatedAt', 'DESC']],
    limit,
    offset
  });
}

async function loadPublicStrategyBySlug(slug) {
  return Strategy.findOne({
    where: {
      slug,
      visibility: 'public'
    },
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'username']
      },
      {
        model: StrategyTag,
        as: 'tags',
      },
      {
        model: Session,
        as: 'sessions',
        through: { attributes: [] },
        attributes: [
          'id',
          'mapName',
          'mapTier',
          'poeVersion',
          'league',
          'status',
          'startedAt',
          'endedAt',
          'durationSec',
          'costChaos',
          'totalLootChaos',
          'profitChaos'
        ],
        include: [{
          model: LootEntry,
          as: 'lootEntries',
          attributes: ['id', 'itemType', 'quantity', 'chaosValue']
        }]
      }
    ]
  });
}

async function validateCompletedSessionsForStrategy(userId, sessionIds, currentStrategyId = null) {
  const uniqueIds = Array.from(new Set((Array.isArray(sessionIds) ? sessionIds : []).filter(Boolean)));

  if (uniqueIds.length === 0) {
    const error = new Error('At least one completed session is required');
    error.status = 400;
    error.errorCode = 'STRATEGY_SESSION_REQUIRED';
    throw error;
  }

  const sessions = await Session.findAll({
    where: {
      id: uniqueIds,
      userId
    }
  });

  if (sessions.length !== uniqueIds.length) {
    const error = new Error('One or more sessions could not be found');
    error.status = 400;
    error.errorCode = 'STRATEGY_SESSION_NOT_FOUND';
    throw error;
  }

  const context = {
    mapName: sessions[0].mapName,
    league: sessions[0].league,
    poeVersion: sessions[0].poeVersion,
  };

  for (const session of sessions) {
    if (session.status !== 'completed') {
      const error = new Error('Only completed sessions can be linked to a strategy');
      error.status = 400;
      error.errorCode = 'STRATEGY_SESSION_NOT_COMPLETED';
      throw error;
    }

    if (
      session.mapName !== context.mapName ||
      session.league !== context.league ||
      session.poeVersion !== context.poeVersion
    ) {
      const error = new Error('All sessions in a strategy must share the same map, league, and Path of Exile version');
      error.status = 400;
      error.errorCode = 'STRATEGY_CONTEXT_MISMATCH';
      throw error;
    }
  }

  const conflictWhere = currentStrategyId
    ? {
      sessionId: uniqueIds,
      strategyId: { [Op.ne]: currentStrategyId }
    }
    : { sessionId: uniqueIds };

  const conflictingLinks = await StrategySession.findAll({
    where: conflictWhere,
    include: [{
      model: Strategy,
      as: 'strategy',
      attributes: ['id', 'name']
    }]
  });

  if (conflictingLinks.length > 0) {
    const error = new Error('One or more sessions are already linked to another strategy');
    error.status = 400;
    error.errorCode = 'STRATEGY_SESSION_ALREADY_LINKED';
    throw error;
  }

  return {
    sessions,
    context
  };
}

async function replaceStrategyTags(strategyId, tags) {
  const normalizedTags = normalizeTags(tags);
  await StrategyTag.destroy({ where: { strategyId } });

  if (normalizedTags.length === 0) {
    return [];
  }

  await StrategyTag.bulkCreate(
    normalizedTags.map((tag) => ({
      strategyId,
      tag
    }))
  );

  return normalizedTags;
}

async function replaceStrategySessions(strategyId, sessionIds) {
  await StrategySession.destroy({ where: { strategyId } });
  await StrategySession.bulkCreate(
    sessionIds.map((sessionId) => ({
      strategyId,
      sessionId
    }))
  );
}

module.exports = {
  buildStrategyAggregate,
  createUniqueSlug,
  loadStrategiesForUser,
  loadStrategyByIdForUser,
  loadPublicStrategies,
  loadPublicStrategyBySlug,
  normalizeTags,
  normalizeText,
  replaceStrategySessions,
  replaceStrategyTags,
  serializeStrategy,
  validateCompletedSessionsForStrategy,
};
