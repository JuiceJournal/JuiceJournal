(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.runtimeSessionModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRuntimeSessionModel() {
  function normalizeString(value, fallback = null) {
    const normalized = String(value ?? '').trim();
    return normalized || fallback;
  }

  function normalizeTimestamp(value) {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? new Date(0).toISOString() : value.toISOString();
    }

    const parsed = new Date(value ?? 0);
    return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
  }

  function secondsBetween(start, end) {
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);

    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      return 0;
    }

    return Math.max(0, Math.round((endMs - startMs) / 1000));
  }

  function createIdleSummary(state) {
    const lastInstance = state.instances[state.instances.length - 1] || null;
    const summary = {
      status: 'idle',
      currentAreaName: null,
      currentInstanceSeconds: 0,
      totalActiveSeconds: state.totalActiveSeconds,
      instanceCount: state.instances.length,
      lastAreaName: lastInstance?.areaName || null,
      lastExitedAt: lastInstance?.exitedAt || null
    };

    if (state.summary?.clearReason) {
      summary.clearReason = state.summary.clearReason;
      summary.clearedAt = state.summary.clearedAt || null;
    }

    return summary;
  }

  function createActiveSummary(state, { now } = {}) {
    const currentInstanceSeconds = secondsBetween(
      state.currentInstance.enteredAt,
      normalizeTimestamp(now ?? state.currentInstance.enteredAt)
    );

    return {
      status: 'active',
      currentAreaName: state.currentInstance.areaName,
      currentInstanceSeconds,
      totalActiveSeconds: state.totalActiveSeconds + currentInstanceSeconds,
      instanceCount: state.instances.length,
      lastAreaName: state.currentInstance.areaName,
      lastExitedAt: null
    };
  }

  function deriveRuntimeSessionSummary(state, options = {}) {
    const targetState = state || createRuntimeSessionState();
    return targetState.currentInstance
      ? createActiveSummary(targetState, options)
      : createIdleSummary(targetState);
  }

  function refreshSummary(state, options = {}) {
    state.summary = deriveRuntimeSessionSummary(state, options);
    return state;
  }

  function createRuntimeSessionState() {
    const state = {
      currentInstance: null,
      instances: [],
      totalActiveSeconds: 0,
      summary: null
    };

    return refreshSummary(state);
  }

  function createInstanceFromEvent(event, enteredAt) {
    return {
      areaName: normalizeString(event.areaName, 'Unknown Area'),
      enteredAt,
      exitedAt: null,
      durationSeconds: 0,
      status: 'active',
      mapTier: event.mapTier ?? null,
      source: normalizeString(event.source)
    };
  }

  function completeCurrentInstance(state, exitedAt, event = {}) {
    if (!state.currentInstance) {
      return null;
    }

    const durationSeconds = secondsBetween(state.currentInstance.enteredAt, exitedAt);
    const completedInstance = {
      ...state.currentInstance,
      exitedAt,
      durationSeconds,
      status: 'completed',
      exitAreaName: normalizeString(event.areaName),
      exitLocation: normalizeString(event.exitLocation ?? event.location),
      exitReason: normalizeString(event.exitReason)
    };

    state.instances.push(completedInstance);
    state.totalActiveSeconds += durationSeconds;
    state.currentInstance = null;

    return completedInstance;
  }

  function applyRuntimeEvent(state, event = {}) {
    const targetState = state || createRuntimeSessionState();
    const eventType = normalizeString(event.type);

    if (eventType === 'area_entered') {
      const enteredAt = normalizeTimestamp(event.at ?? event.timestamp);

      if (targetState.currentInstance) {
        completeCurrentInstance(targetState, enteredAt, {
          areaName: event.areaName,
          exitReason: 'superseded_by_area_entered'
        });
      }

      targetState.currentInstance = createInstanceFromEvent(event, enteredAt);
      return refreshSummary(targetState);
    }

    if (eventType === 'area_exited') {
      const exitedAt = normalizeTimestamp(event.at ?? event.timestamp);
      completeCurrentInstance(targetState, exitedAt, event);
      return refreshSummary(targetState);
    }

    return refreshSummary(targetState);
  }

  function clearRuntimeSessionState(state, options = {}) {
    const targetState = state || createRuntimeSessionState();
    const clearedAt = normalizeTimestamp(options.at ?? options.now);

    targetState.currentInstance = null;
    targetState.instances = [];
    targetState.totalActiveSeconds = 0;
    targetState.summary = {
      ...createIdleSummary(targetState),
      clearReason: normalizeString(options.reason, 'runtime_cleared'),
      clearedAt
    };

    return targetState;
  }

  function cloneRuntimeSessionState(state, options = {}) {
    const snapshot = JSON.parse(JSON.stringify(state || createRuntimeSessionState()));
    const summary = deriveRuntimeSessionSummary(snapshot, options);

    if (snapshot.currentInstance) {
      snapshot.currentInstance.durationSeconds = summary.currentInstanceSeconds;
    }

    snapshot.summary = summary;
    return snapshot;
  }

  return {
    createRuntimeSessionState,
    applyRuntimeEvent,
    deriveRuntimeSessionSummary,
    clearRuntimeSessionState,
    cloneRuntimeSessionState
  };
});
