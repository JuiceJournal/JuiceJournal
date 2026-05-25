const { Op } = require('sequelize');
const { FarmRunReaction, PublishedFarmRun, User } = require('../models');

const ALLOWED_VISIBILITIES = new Set(['private', 'unlisted', 'public']);
const PUBLIC_VISIBILITIES = ['public', 'unlisted'];
const ALLOWED_REACTIONS = new Set(['divine', 'holy', 'pog']);
const REACTION_SUMMARY_TEMPLATE = Object.freeze({
  divine: 0,
  holy: 0,
  pog: 0
});
const CALCULATION_STATUSES = new Set(['calculated', 'zeroCalculated', 'partial', 'failed', 'notCalculated']);
const MAX_SETUP_DESCRIPTION_LENGTH = 1200;
const MAX_MAPS = 100;
const MAX_TOP_LOOT = 20;
const MAX_BREAKDOWN_KEYS = 50;

function normalizeText(value, maxLength, fallback = null) {
  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized ? normalized.slice(0, maxLength) : fallback;
}

function normalizeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeVisibility(value) {
  return ALLOWED_VISIBILITIES.has(value) ? value : 'private';
}

function normalizeCalculationStatus(value) {
  return CALCULATION_STATUSES.has(value) ? value : 'notCalculated';
}

function normalizeReaction(value) {
  const reaction = normalizeText(value, 24);
  if (!reaction) {
    return null;
  }

  const normalized = reaction.toLowerCase();
  return ALLOWED_REACTIONS.has(normalized) ? normalized : null;
}

function normalizePriceContext(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    chaosDivineRate: normalizeNumber(source.chaosDivineRate, null),
    mirrorChaosRate: normalizeNumber(source.mirrorChaosRate, null),
    syncedAt: normalizeText(source.syncedAt, 40)
  };
}

function normalizeMapSummary(map = {}) {
  const calculationStatus = normalizeCalculationStatus(map.calculationStatus);
  return {
    localRunId: normalizeText(map.localRunId, 120),
    mapName: normalizeText(map.mapName, 120, 'Unknown Map'),
    durationSeconds: Math.max(0, normalizeNumber(map.durationSeconds, 0)),
    profitChaos: calculationStatus === 'failed' || calculationStatus === 'notCalculated'
      ? null
      : normalizeNumber(map.profitChaos, 0),
    calculationStatus
  };
}

function normalizeMaps(value) {
  const source = Array.isArray(value) ? value : [];
  return source.slice(0, MAX_MAPS).map(normalizeMapSummary);
}

function normalizeBreakdown(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const entries = Object.entries(source).slice(0, MAX_BREAKDOWN_KEYS);

  return entries.reduce((result, [key, stats]) => {
    const category = normalizeText(key, 80);
    if (!category || !stats || typeof stats !== 'object' || Array.isArray(stats)) {
      return result;
    }

    result[category] = {
      gainedChaos: normalizeNumber(stats.gainedChaos, 0),
      lostChaos: normalizeNumber(stats.lostChaos, 0),
      netChaos: normalizeNumber(stats.netChaos, 0)
    };
    return result;
  }, {});
}

function normalizeTopLoot(value) {
  const source = Array.isArray(value) ? value : [];
  return source
    .slice(0, MAX_TOP_LOOT)
    .map((item) => ({
      name: normalizeText(item?.name, 160),
      quantity: Math.max(0, normalizeNumber(item?.quantity, 0)),
      totalChaos: normalizeNumber(item?.totalChaos, 0)
    }))
    .filter((item) => item.name && item.totalChaos > 0);
}

function normalizeCharacter(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    className: normalizeText(source.className, 80),
    ascendancy: normalizeText(source.ascendancy, 80)
  };
}

function getRunIncludes() {
  return [
    {
      model: User,
      as: 'user',
      attributes: ['id', 'username']
    },
    {
      model: FarmRunReaction,
      as: 'reactions',
      attributes: ['userId', 'reaction']
    }
  ];
}

function summarizeReactions(run, viewerUserId = null) {
  const summary = { ...REACTION_SUMMARY_TEMPLATE };
  const viewerReactions = [];
  const reactions = Array.isArray(run.reactions) ? run.reactions : [];

  reactions.forEach((entry) => {
    const reaction = normalizeReaction(entry.reaction);
    if (!reaction) {
      return;
    }

    summary[reaction] += 1;
    if (viewerUserId && entry.userId === viewerUserId) {
      viewerReactions.push(reaction);
    }
  });

  return { summary, viewerReactions };
}

function buildPublishedFarmRunAttributes(payload, userId) {
  const visibility = normalizeVisibility(payload.visibility);
  const calculationStatus = normalizeCalculationStatus(payload.calculationStatus);

  return {
    userId,
    visibility,
    poeVersion: payload.poeVersion,
    league: normalizeText(payload.league, 60),
    farmType: normalizeText(payload.farmType, 80),
    runCount: Math.max(1, Math.min(500, parseInt(payload.runCount, 10) || 1)),
    startedAt: normalizeDate(payload.startedAt),
    endedAt: normalizeDate(payload.endedAt),
    durationSeconds: Math.max(0, normalizeNumber(payload.durationSeconds, 0)),
    setupDescription: normalizeText(payload.setupDescription, MAX_SETUP_DESCRIPTION_LENGTH),
    investmentKnown: payload.investmentKnown === true,
    calculationStatus,
    profitChaos: calculationStatus === 'failed' || calculationStatus === 'notCalculated'
      ? null
      : normalizeNumber(payload.profitChaos, 0),
    priceContext: normalizePriceContext(payload.priceContext),
    maps: normalizeMaps(payload.maps),
    breakdown: normalizeBreakdown(payload.breakdown),
    topLoot: normalizeTopLoot(payload.topLoot),
    characterContext: normalizeCharacter(payload.character),
    publisherDisplayName: normalizeText(payload.publisherDisplayName, 80),
    publishedAt: visibility === 'public' || visibility === 'unlisted' ? new Date() : null
  };
}

function serializePublishedFarmRun(run, { includeDetails = false, viewerUserId = null } = {}) {
  const reactionState = summarizeReactions(run, viewerUserId);

  return {
    id: run.id,
    visibility: run.visibility,
    poeVersion: run.poeVersion,
    league: run.league,
    farmType: run.farmType,
    runCount: run.runCount,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    durationSeconds: run.durationSeconds,
    setupDescription: run.setupDescription,
    investmentKnown: run.investmentKnown,
    calculationStatus: run.calculationStatus,
    profitChaos: run.profitChaos === null ? null : normalizeNumber(run.profitChaos, 0),
    priceContext: run.priceContext,
    character: run.characterContext,
    publisherDisplayName: run.publisherDisplayName,
    publishedAt: run.publishedAt,
    createdAt: run.createdAt,
    author: run.user ? {
      id: run.user.id,
      username: run.user.username
    } : null,
    reactions: reactionState.summary,
    viewerReactions: reactionState.viewerReactions,
    maps: includeDetails ? run.maps : undefined,
    breakdown: includeDetails ? run.breakdown : undefined,
    topLoot: includeDetails ? run.topLoot : undefined
  };
}

async function createPublishedFarmRun(userId, payload) {
  const attributes = buildPublishedFarmRunAttributes(payload, userId);
  const run = await PublishedFarmRun.create(attributes);
  return loadPublishedFarmRunForOwner(run.id, userId);
}

async function loadPublishedFarmRunForOwner(id, userId) {
  return PublishedFarmRun.findOne({
    where: { id, userId },
    include: getRunIncludes()
  });
}

async function loadVisiblePublishedFarmRun(id, userId = null) {
  const where = userId
    ? {
      id,
      [Op.or]: [
        { visibility: PUBLIC_VISIBILITIES },
        { userId }
      ]
    }
    : {
      id,
      visibility: PUBLIC_VISIBILITIES
    };

  return PublishedFarmRun.findOne({
    where,
    include: getRunIncludes()
  });
}

async function loadPublicFarmRuns(filters = {}) {
  const where = { visibility: 'public' };

  if (filters.poeVersion) {
    where.poeVersion = filters.poeVersion;
  }
  if (filters.league) {
    where.league = filters.league;
  }
  if (filters.farmType) {
    where.farmType = filters.farmType;
  }
  const hasMinProfitFilter = filters.minProfitChaos !== undefined && filters.minProfitChaos !== null && filters.minProfitChaos !== '';
  const hasMaxProfitFilter = filters.maxProfitChaos !== undefined && filters.maxProfitChaos !== null && filters.maxProfitChaos !== '';
  if (hasMinProfitFilter || hasMaxProfitFilter) {
    where.profitChaos = {};
    if (hasMinProfitFilter) {
      where.profitChaos[Op.gte] = Number(filters.minProfitChaos);
    }
    if (hasMaxProfitFilter) {
      where.profitChaos[Op.lte] = Number(filters.maxProfitChaos);
    }
  }

  const limit = Math.min(parseInt(filters.limit, 10) || 50, 100);
  const offset = parseInt(filters.offset, 10) || 0;

  return PublishedFarmRun.findAll({
    where,
    include: getRunIncludes(),
    order: [['publishedAt', 'DESC'], ['createdAt', 'DESC']],
    limit,
    offset
  });
}

async function toggleFarmRunReaction(id, userId, reaction) {
  const normalizedReaction = normalizeReaction(reaction);
  if (!normalizedReaction) {
    const error = new Error('Unsupported farm run reaction');
    error.code = 'INVALID_REACTION';
    throw error;
  }

  const run = await PublishedFarmRun.findOne({
    where: {
      id,
      visibility: PUBLIC_VISIBILITIES
    }
  });
  if (!run) {
    return null;
  }

  const existing = await FarmRunReaction.findOne({
    where: {
      runId: id,
      userId,
      reaction: normalizedReaction
    }
  });

  if (existing) {
    await existing.destroy();
    return {
      selected: false,
      reaction: normalizedReaction,
      run: await loadVisiblePublishedFarmRun(id, userId)
    };
  }

  await FarmRunReaction.create({
    runId: id,
    userId,
    reaction: normalizedReaction
  });

  return {
    selected: true,
    reaction: normalizedReaction,
    run: await loadVisiblePublishedFarmRun(id, userId)
  };
}

async function updateFarmRunVisibility(id, userId, visibility) {
  const run = await PublishedFarmRun.findOne({ where: { id, userId } });
  if (!run) {
    return null;
  }

  const normalizedVisibility = normalizeVisibility(visibility);
  await run.update({
    visibility: normalizedVisibility,
    publishedAt: normalizedVisibility === 'public' || normalizedVisibility === 'unlisted'
      ? run.publishedAt || new Date()
      : null
  });

  return loadPublishedFarmRunForOwner(id, userId);
}

module.exports = {
  buildPublishedFarmRunAttributes,
  createPublishedFarmRun,
  loadPublicFarmRuns,
  loadPublishedFarmRunForOwner,
  loadVisiblePublishedFarmRun,
  normalizeReaction,
  normalizeText,
  serializePublishedFarmRun,
  toggleFarmRunReaction,
  updateFarmRunVisibility
};
