const {
  getRequiredFeaturesForVersion,
  normalizeNativeInfoPayload
} = require('./nativeGameInfoProducerModel');

function createNativeGameInfoProducer({
  gep,
  emitHint,
  logger = console,
  requiredFeaturesRetryDelayMs = 1500,
  requiredFeaturesMaxAttempts = 4
} = {}) {
  let sessionId = 0;
  let activeSession = null;

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

  function waitForRetryDelay() {
    const delayMs = Math.max(0, Number(requiredFeaturesRetryDelayMs) || 0);
    if (!delayMs) {
      return Promise.resolve();
    }

    return new Promise(resolve => setTimeout(resolve, delayMs));
  }

  function clearSubscriptions(session = activeSession) {
    if (typeof gep?.removeListener !== 'function' || !session) {
      return false;
    }

    let success = true;

    if (session.gameDetectedHandler) {
      try {
        gep.removeListener('game-detected', session.gameDetectedHandler);
        session.gameDetectedHandler = null;
      } catch (error) {
        warnFailClosed(error);
        success = false;
      }
    }

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

  async function getSupportedRequiredFeatures(session, requiredFeatures) {
    if (typeof gep?.getFeatures !== 'function') {
      return requiredFeatures;
    }

    try {
      const supportedFeatures = await gep.getFeatures(session.gameId);
      if (!hasActiveSession(session) || !Array.isArray(supportedFeatures) || supportedFeatures.length === 0) {
        return requiredFeatures;
      }

      const supported = new Set(supportedFeatures.map(feature => String(feature)));
      const filtered = requiredFeatures.filter(feature => supported.has(feature));

      return filtered.length > 0 ? filtered : requiredFeatures;
    } catch (error) {
      warnFailClosed(error);
      return requiredFeatures;
    }
  }

  async function setRequiredFeaturesWithRetry(session, requiredFeatures) {
    const attempts = Math.max(1, Number(requiredFeaturesMaxAttempts) || 1);
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      if (!hasActiveSession(session)) {
        return false;
      }

      try {
        const supportedRequiredFeatures = await getSupportedRequiredFeatures(session, requiredFeatures);
        if (!hasActiveSession(session)) {
          return false;
        }

        await gep.setRequiredFeatures(session.gameId, supportedRequiredFeatures);
        return true;
      } catch (error) {
        lastError = error;
        if (attempt >= attempts) {
          throw lastError;
        }
        await waitForRetryDelay();
      }
    }

    throw lastError || new Error('Unable to set required GEP features');
  }

  async function emitFromInfo(session, gameId) {
    if (!hasActiveSession(session) || typeof gep?.getInfo !== 'function') {
      return;
    }

    const info = await gep.getInfo(gameId);

    if (!hasActiveSession(session)) {
      return;
    }

    const hint = normalizeNativeInfoPayload({
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

    const requiredFeatures = getRequiredFeaturesForVersion(poeVersion);
    if (
      !gameId
      || requiredFeatures.length === 0
      || typeof gep?.setRequiredFeatures !== 'function'
      || typeof gep?.getInfo !== 'function'
      || typeof gep?.on !== 'function'
      || typeof gep?.removeListener !== 'function'
    ) {
      return false;
    }

    sessionId += 1;
    const currentSession = {
      id: sessionId,
      poeVersion,
      gameId,
      closed: false,
      infoUpdateHandler: null,
      gameExitHandler: null,
      gameDetectedHandler: null
    };
    activeSession = currentSession;

    const gameDetectedHandler = async (event, detectedGameId) => {
      if (!hasActiveSession(currentSession) || detectedGameId !== currentSession.gameId) {
        return;
      }

      try {
        if (event && typeof event.enable === 'function') {
          event.enable();
        }
        await emitFromInfo(currentSession, detectedGameId);
      } catch (error) {
        warnFailClosed(error);
      }
    };
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

    currentSession.gameDetectedHandler = gameDetectedHandler;
    currentSession.infoUpdateHandler = infoUpdateHandler;
    currentSession.gameExitHandler = gameExitHandler;

    try {
      gep.on('game-detected', gameDetectedHandler);
      gep.on('new-info-update', infoUpdateHandler);
      gep.on('game-exit', gameExitHandler);
    } catch (error) {
      return rollbackStartupSession(currentSession, error);
    }

    try {
      const featuresRegistered = await setRequiredFeaturesWithRetry(currentSession, requiredFeatures);
      if (!featuresRegistered) {
        return false;
      }
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
  createNativeGameInfoProducer
};
