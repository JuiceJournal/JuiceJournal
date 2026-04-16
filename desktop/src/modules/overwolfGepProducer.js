const {
  getOverwolfGepCapability,
  getRequiredFeaturesForVersion,
  normalizeOverwolfInfoHint
} = require('./overwolfGepModel');

function createOverwolfGepProducer({
  gep,
  emitHint,
  emitDiagnostic,
  getRequiredFeatures = getRequiredFeaturesForVersion,
  normalizeHint = normalizeOverwolfInfoHint,
  logger = console
} = {}) {
  let sessionId = 0;
  let activeSession = null;

  function emitCapabilityDiagnostic(code, data = {}) {
    if (typeof emitDiagnostic !== 'function') {
      return;
    }

    try {
      emitDiagnostic({
        type: 'overwolf-gep-diagnostic',
        code,
        detectedAt: new Date().toISOString(),
        ...data
      });
    } catch {}
  }

  function warnFailClosed(error) {
    try {
      const warn = logger?.warn;

      if (typeof warn !== 'function') {
        return;
      }

      Promise.resolve(warn.call(logger, error)).catch(() => {});
    } catch {}
  }

  function hasActiveSession(session) {
    return Boolean(session) && activeSession === session && session.closed !== true;
  }

  function clearSubscriptions(session = activeSession) {
    if (typeof gep?.removeListener !== 'function' || !session) {
      return false;
    }

    let success = true;

    if (session.infoUpdateHandler) {
      try {
        gep.removeListener('new-info-update', session.infoUpdateHandler);
        session.infoUpdateHandler = null;
      } catch (error) {
        warnFailClosed(error);
        success = false;
      }
    }

    if (session.gameExitHandler) {
      try {
        gep.removeListener('game-exit', session.gameExitHandler);
        session.gameExitHandler = null;
      } catch (error) {
        warnFailClosed(error);
        success = false;
      }
    }

    return success;
  }

  async function emitFromInfo(session, gameId) {
    if (!hasActiveSession(session) || typeof gep?.getInfo !== 'function') {
      return;
    }

    const info = await gep.getInfo(gameId);

    if (!hasActiveSession(session)) {
      return;
    }

    const hint = normalizeHint({
      poeVersion: session.poeVersion,
      info
    });

    if (hint?.confidence === 'high' && typeof emitHint === 'function') {
      emitHint(hint);
    }
  }

  async function rollbackStartupSession(session, error) {
    session.closed = true;
    const cleaned = clearSubscriptions(session);

    if (activeSession === session) {
      if (cleaned) {
        activeSession = null;
      }
      sessionId += 1;
    }

    warnFailClosed(error);
    return false;
  }

  async function stop() {
    const session = activeSession;

    if (!session) {
      return true;
    }

    session.closed = true;
    sessionId += 1;

    const cleaned = clearSubscriptions(session);
    if (cleaned) {
      activeSession = null;
    }

    return cleaned;
  }

  async function start({ poeVersion, gameId } = {}) {
    const stopped = await stop();
    if (!stopped) {
      return false;
    }

    const capability = getOverwolfGepCapability(gep);
    if (capability.status !== 'available') {
      emitCapabilityDiagnostic('overwolf-gep-unavailable', {
        missing: capability.missing,
        poeVersion: typeof poeVersion === 'string' ? poeVersion.trim().toLowerCase() : null
      });
      return false;
    }

    const requiredFeatures = getRequiredFeatures(poeVersion);
    if (!gameId || requiredFeatures.length === 0) {
      emitCapabilityDiagnostic('overwolf-gep-unsupported-game', {
        poeVersion: typeof poeVersion === 'string' ? poeVersion.trim().toLowerCase() : null,
        gameId: gameId ?? null
      });
      return false;
    }

    sessionId += 1;
    const currentSession = {
      id: sessionId,
      poeVersion,
      gameId,
      closed: false,
      infoUpdateHandler: null,
      gameExitHandler: null
    };
    activeSession = currentSession;

    try {
      await gep.setRequiredFeatures(gameId, requiredFeatures);
    } catch (error) {
      return rollbackStartupSession(currentSession, error);
    }

    if (!hasActiveSession(currentSession)) {
      return false;
    }

    const infoUpdateHandler = async (_event, updatedGameId) => {
      if (!hasActiveSession(currentSession) || updatedGameId !== currentSession.gameId) {
        return;
      }

      try {
        await emitFromInfo(currentSession, updatedGameId);
      } catch (error) {
        warnFailClosed(error);
      }
    };

    const gameExitHandler = async (_event, exitedGameId) => {
      if (!hasActiveSession(currentSession) || exitedGameId !== currentSession.gameId) {
        return;
      }

      try {
        await stop();
      } catch (error) {
        warnFailClosed(error);
      }
    };

    if (!hasActiveSession(currentSession)) {
      return false;
    }

    currentSession.infoUpdateHandler = infoUpdateHandler;
    currentSession.gameExitHandler = gameExitHandler;

    try {
      gep.on('new-info-update', infoUpdateHandler);
      gep.on('game-exit', gameExitHandler);
    } catch (error) {
      return rollbackStartupSession(currentSession, error);
    }

    if (!hasActiveSession(currentSession)) {
      clearSubscriptions(currentSession);
      return false;
    }

    try {
      await emitFromInfo(currentSession, gameId);
    } catch (error) {
      return rollbackStartupSession(currentSession, error);
    }

    if (!hasActiveSession(currentSession)) {
      clearSubscriptions(currentSession);
      return false;
    }

    return true;
  }

  return {
    start,
    stop
  };
}

module.exports = {
  createOverwolfGepProducer
};
