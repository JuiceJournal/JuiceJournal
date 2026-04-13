const {
  getRequiredFeaturesForVersion,
  normalizeNativeInfoPayload
} = require('./nativeGameInfoProducerModel');

function createNativeGameInfoProducer({ gep, emitHint, logger = console } = {}) {
  let sessionId = 0;
  let activeSession = null;
  let infoUpdateHandler = null;
  let gameExitHandler = null;

  function hasActiveSession(currentSessionId) {
    return Boolean(activeSession) && activeSession.id === currentSessionId;
  }

  function clearSubscriptions() {
    if (typeof gep?.removeListener === 'function' && infoUpdateHandler) {
      gep.removeListener('new-info-update', infoUpdateHandler);
    }

    if (typeof gep?.removeListener === 'function' && gameExitHandler) {
      gep.removeListener('game-exit', gameExitHandler);
    }

    infoUpdateHandler = null;
    gameExitHandler = null;
  }

  async function emitFromInfo(currentSessionId, gameId) {
    if (!hasActiveSession(currentSessionId) || typeof gep?.getInfo !== 'function') {
      return;
    }

    const info = await gep.getInfo(gameId);

    if (!hasActiveSession(currentSessionId)) {
      return;
    }

    const hint = normalizeNativeInfoPayload({
      poeVersion: activeSession.poeVersion,
      info
    });

    if (hint?.confidence === 'high' && typeof emitHint === 'function') {
      emitHint(hint);
    }
  }

  async function stop() {
    if (activeSession || infoUpdateHandler || gameExitHandler) {
      sessionId += 1;
    }

    clearSubscriptions();
    activeSession = null;
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
    const currentSessionId = sessionId;
    activeSession = {
      id: currentSessionId,
      poeVersion,
      gameId
    };

    await gep.setRequiredFeatures(gameId, requiredFeatures);

    infoUpdateHandler = async (_event, updatedGameId) => {
      if (!hasActiveSession(currentSessionId) || updatedGameId !== activeSession.gameId) {
        return;
      }

      await emitFromInfo(currentSessionId, updatedGameId);
    };

    gameExitHandler = async (_event, exitedGameId) => {
      if (!hasActiveSession(currentSessionId) || exitedGameId !== activeSession.gameId) {
        return;
      }

      try {
        await stop();
      } catch (error) {
        logger.warn(error);
      }
    };

    gep.on('new-info-update', infoUpdateHandler);
    gep.on('game-exit', gameExitHandler);

    await emitFromInfo(currentSessionId, gameId);
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
