const {
  getRequiredFeaturesForVersion,
  normalizeNativeInfoPayload
} = require('./nativeGameInfoProducerModel');

function createNativeGameInfoProducer({ gep, emitHint, logger = console } = {}) {
  let sessionId = 0;
  let activeSession = null;

  function hasActiveSession(session) {
    return Boolean(session) && activeSession?.id === session.id;
  }

  function clearSubscriptions(session = activeSession) {
    if (typeof gep?.removeListener !== 'function' || !session) {
      return;
    }

    if (session.infoUpdateHandler) {
      gep.removeListener('new-info-update', session.infoUpdateHandler);
    }

    if (session.gameExitHandler) {
      gep.removeListener('game-exit', session.gameExitHandler);
    }

    session.infoUpdateHandler = null;
    session.gameExitHandler = null;
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
    clearSubscriptions(session);

    if (hasActiveSession(session)) {
      activeSession = null;
      sessionId += 1;
      logger?.warn?.(error);
    }

    return false;
  }

  async function stop() {
    const session = activeSession;

    if (session) {
      sessionId += 1;
    }

    activeSession = null;
    clearSubscriptions(session);
  }

  async function start({ poeVersion, gameId } = {}) {
    await stop();

    const requiredFeatures = getRequiredFeaturesForVersion(poeVersion);
    if (
      !gameId
      || requiredFeatures.length === 0
      || typeof gep?.setRequiredFeatures !== 'function'
      || typeof gep?.getInfo !== 'function'
      || typeof gep?.on !== 'function'
    ) {
      return false;
    }

    sessionId += 1;
    const currentSession = {
      id: sessionId,
      poeVersion,
      gameId,
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

      await emitFromInfo(currentSession, updatedGameId);
    };

    const gameExitHandler = async (_event, exitedGameId) => {
      if (!hasActiveSession(currentSession) || exitedGameId !== currentSession.gameId) {
        return;
      }

      try {
        await stop();
      } catch (error) {
        logger.warn(error);
      }
    };

    if (!hasActiveSession(currentSession)) {
      return false;
    }

    currentSession.infoUpdateHandler = infoUpdateHandler;
    currentSession.gameExitHandler = gameExitHandler;

    gep.on('new-info-update', infoUpdateHandler);
    gep.on('game-exit', gameExitHandler);

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
