const test = require('node:test');
const assert = require('node:assert/strict');

const PRODUCER_REQUEST = '../src/modules/nativeGameInfoProducer';

function isDirectMissingModule(error, request) {
  return error?.code === 'MODULE_NOT_FOUND'
    && error.message.includes(`Cannot find module '${request}'`);
}

function loadNativeGameInfoProducer() {
  try {
    return require(PRODUCER_REQUEST);
  } catch (error) {
    if (!isDirectMissingModule(error, PRODUCER_REQUEST)) {
      throw error;
    }

    return { __loadError: error };
  }
}

function getCreateNativeGameInfoProducer() {
  const nativeGameInfoProducer = loadNativeGameInfoProducer();

  if (nativeGameInfoProducer.__loadError) {
    const { code, message } = nativeGameInfoProducer.__loadError;
    assert.fail(
      `Expected desktop/src/modules/nativeGameInfoProducer.js to exist and export createNativeGameInfoProducer. Current red state: ${code || 'LOAD_ERROR'}: ${message}`
    );
  }

  assert.equal(
    typeof nativeGameInfoProducer.createNativeGameInfoProducer,
    'function',
    'Expected nativeGameInfoProducer.createNativeGameInfoProducer to be a function'
  );

  return nativeGameInfoProducer.createNativeGameInfoProducer;
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function createListenerRegistry() {
  const handlersByEvent = new Map();

  return {
    add(eventName, handler) {
      const handlers = handlersByEvent.get(eventName) ?? [];
      handlers.push(handler);
      handlersByEvent.set(eventName, handlers);
    },
    remove(eventName, handler) {
      const handlers = handlersByEvent.get(eventName) ?? [];
      const nextHandlers = handlers.filter(candidate => candidate !== handler);

      if (nextHandlers.length > 0) {
        handlersByEvent.set(eventName, nextHandlers);
        return;
      }

      handlersByEvent.delete(eventName);
    },
    get(eventName) {
      return handlersByEvent.get(eventName) ?? [];
    }
  };
}

async function startProducerForGameExitTest({ logger, removeListener }) {
  const createNativeGameInfoProducer = getCreateNativeGameInfoProducer();
  const listeners = new Map();
  const gep = {
    async setRequiredFeatures() {},
    async getInfo() {
      return null;
    },
    on(eventName, handler) {
      listeners.set(eventName, handler);
    },
    removeListener
  };

  const producer = createNativeGameInfoProducer({
    gep,
    logger
  });

  const started = await producer.start({
    poeVersion: 'poe2',
    gameId: 24886
  });

  assert.equal(started, true);

  return {
    gameExitHandler: listeners.get('game-exit')
  };
}

test('producer emits a high-confidence hint after immediate getInfo and subscribes to lifecycle events', async () => {
  const createNativeGameInfoProducer = getCreateNativeGameInfoProducer();
  const emitted = [];
  const listeners = new Map();
  const setRequiredFeaturesCalls = [];
  const onCalls = [];
  const gep = {
    async setRequiredFeatures(gameId, features) {
      setRequiredFeaturesCalls.push({ gameId, features });
    },
    async getInfo(gameId) {
      assert.equal(gameId, 24886);

      return {
        me: {
          character_name: 'KELLEE',
          character_level: 92,
          character_exp: 123456789
        }
      };
    },
    on(eventName, handler) {
      onCalls.push(eventName);
      listeners.set(eventName, handler);
    },
    removeListener() {}
  };

  const producer = createNativeGameInfoProducer({
    gep,
    emitHint: hint => emitted.push(hint)
  });

  const started = await producer.start({
    poeVersion: 'poe2',
    gameId: 24886
  });

  assert.equal(started, true);
  assert.deepEqual(setRequiredFeaturesCalls, [
    {
      gameId: 24886,
      features: ['gep_internal', 'me', 'match_info']
    }
  ]);
  assert.deepEqual(onCalls, ['new-info-update', 'game-exit']);
  assert.equal(typeof listeners.get('new-info-update'), 'function');
  assert.equal(typeof listeners.get('game-exit'), 'function');
  assert.deepEqual(emitted, [
    {
      source: 'native-info',
      poeVersion: 'poe2',
      characterName: 'KELLEE',
      level: 92,
      experience: 123456789,
      confidence: 'high'
    }
  ]);
});

test('producer refreshes on new-info-update and tears down the active session on game-exit', async () => {
  const createNativeGameInfoProducer = getCreateNativeGameInfoProducer();
  const emitted = [];
  const listeners = new Map();
  const removed = [];
  const infoQueue = [
    null,
    {
      me: {
        character_name: 'KELLEE',
        character_level: 93,
        character_exp: 223456789
      }
    }
  ];
  const gep = {
    async setRequiredFeatures() {},
    async getInfo() {
      return infoQueue.shift() ?? null;
    },
    on(eventName, handler) {
      listeners.set(eventName, handler);
    },
    removeListener(eventName, handler) {
      if (listeners.get(eventName) === handler) {
        listeners.delete(eventName);
      }

      removed.push(eventName);
    }
  };

  const producer = createNativeGameInfoProducer({
    gep,
    emitHint: hint => emitted.push(hint)
  });

  await producer.start({
    poeVersion: 'poe2',
    gameId: 24886
  });

  const infoUpdateHandler = listeners.get('new-info-update');
  const gameExitHandler = listeners.get('game-exit');

  assert.equal(emitted.length, 0);

  await infoUpdateHandler({}, 24886);

  assert.deepEqual(emitted, [
    {
      source: 'native-info',
      poeVersion: 'poe2',
      characterName: 'KELLEE',
      level: 93,
      experience: 223456789,
      confidence: 'high'
    }
  ]);

  await gameExitHandler({}, 24886);

  assert.deepEqual(removed, ['new-info-update', 'game-exit']);

  await infoUpdateHandler({}, 24886);

  assert.equal(emitted.length, 1);
});

test('producer returns false and logs a warning when required feature setup fails', async () => {
  const createNativeGameInfoProducer = getCreateNativeGameInfoProducer();
  const warnings = [];
  const listeners = createListenerRegistry();
  const setupError = new Error('native setup failed');
  const gep = {
    async setRequiredFeatures() {
      throw setupError;
    },
    async getInfo() {
      assert.fail('getInfo should not run when required feature setup fails');
    },
    on(eventName, handler) {
      listeners.add(eventName, handler);
    },
    removeListener(eventName, handler) {
      listeners.remove(eventName, handler);
    }
  };

  const producer = createNativeGameInfoProducer({
    gep,
    logger: {
      warn(error) {
        warnings.push(error);
      }
    }
  });

  const started = await producer.start({
    poeVersion: 'poe2',
    gameId: 24886
  });

  assert.equal(started, false);
  assert.deepEqual(warnings, [setupError]);
  assert.deepEqual(listeners.get('new-info-update'), []);
  assert.deepEqual(listeners.get('game-exit'), []);
});

test('producer returns false without subscribing when removeListener is unavailable', async () => {
  const createNativeGameInfoProducer = getCreateNativeGameInfoProducer();
  const onCalls = [];
  let setRequiredFeaturesCalled = false;
  const gep = {
    async setRequiredFeatures() {
      setRequiredFeaturesCalled = true;
    },
    async getInfo() {
      return null;
    },
    on(eventName) {
      onCalls.push(eventName);
    }
  };

  const producer = createNativeGameInfoProducer({ gep });

  const started = await producer.start({
    poeVersion: 'poe2',
    gameId: 24886
  });

  assert.equal(started, false);
  assert.equal(setRequiredFeaturesCalled, false);
  assert.deepEqual(onCalls, []);
});

test('producer rolls back subscriptions and returns false when listener registration throws', async () => {
  const createNativeGameInfoProducer = getCreateNativeGameInfoProducer();
  const warnings = [];
  const listeners = createListenerRegistry();
  const onCalls = [];
  const registrationError = new Error('native listener registration failed');
  const gep = {
    async setRequiredFeatures() {},
    async getInfo() {
      return null;
    },
    on(eventName, handler) {
      onCalls.push(eventName);

      if (eventName === 'game-exit') {
        throw registrationError;
      }

      listeners.add(eventName, handler);
    },
    removeListener(eventName, handler) {
      listeners.remove(eventName, handler);
    }
  };

  const producer = createNativeGameInfoProducer({
    gep,
    logger: {
      warn(error) {
        warnings.push(error);
      }
    }
  });

  const started = await producer.start({
    poeVersion: 'poe2',
    gameId: 24886
  });

  assert.equal(started, false);
  assert.deepEqual(onCalls, ['new-info-update', 'game-exit']);
  assert.deepEqual(warnings, [registrationError]);
  assert.deepEqual(listeners.get('new-info-update'), []);
  assert.deepEqual(listeners.get('game-exit'), []);
});

test('producer does not leak stale listeners when overlapping starts resolve out of order', async () => {
  const createNativeGameInfoProducer = getCreateNativeGameInfoProducer();
  const emitted = [];
  const listeners = createListenerRegistry();
  const firstStartSetup = createDeferred();
  let setRequiredFeaturesCallCount = 0;
  const gep = {
    async setRequiredFeatures() {
      setRequiredFeaturesCallCount += 1;

      if (setRequiredFeaturesCallCount === 1) {
        return firstStartSetup.promise;
      }
    },
    async getInfo(gameId) {
      assert.equal(gameId, 24887);

      return {
        me: {
          character_name: 'SECOND',
          character_level: 95,
          character_exp: 423456789
        }
      };
    },
    on(eventName, handler) {
      listeners.add(eventName, handler);
    },
    removeListener(eventName, handler) {
      listeners.remove(eventName, handler);
    }
  };

  const producer = createNativeGameInfoProducer({
    gep,
    emitHint: hint => emitted.push(hint)
  });

  const firstStartPromise = producer.start({
    poeVersion: 'poe2',
    gameId: 24886
  });
  const secondStartPromise = producer.start({
    poeVersion: 'poe2',
    gameId: 24887
  });

  const secondStarted = await secondStartPromise;

  assert.equal(secondStarted, true);
  assert.equal(listeners.get('new-info-update').length, 1);
  assert.equal(listeners.get('game-exit').length, 1);

  firstStartSetup.resolve();

  const firstStarted = await firstStartPromise;

  assert.equal(firstStarted, false);
  assert.equal(listeners.get('new-info-update').length, 1);
  assert.equal(listeners.get('game-exit').length, 1);
  assert.deepEqual(emitted, [
    {
      source: 'native-info',
      poeVersion: 'poe2',
      characterName: 'SECOND',
      level: 95,
      experience: 423456789,
      confidence: 'high'
    }
  ]);

  await producer.stop();

  assert.deepEqual(listeners.get('new-info-update'), []);
  assert.deepEqual(listeners.get('game-exit'), []);
});

test('producer rolls back subscriptions when startup emission fails after activation', async () => {
  const createNativeGameInfoProducer = getCreateNativeGameInfoProducer();
  const emitted = [];
  const warnings = [];
  const listeners = createListenerRegistry();
  const startupError = new Error('initial native fetch failed');
  let getInfoCallCount = 0;
  const gep = {
    async setRequiredFeatures() {},
    async getInfo() {
      getInfoCallCount += 1;

      if (getInfoCallCount === 1) {
        throw startupError;
      }

      return {
        me: {
          character_name: 'RECOVERED',
          character_level: 96,
          character_exp: 523456789
        }
      };
    },
    on(eventName, handler) {
      listeners.add(eventName, handler);
    },
    removeListener(eventName, handler) {
      listeners.remove(eventName, handler);
    }
  };

  const producer = createNativeGameInfoProducer({
    gep,
    emitHint: hint => emitted.push(hint),
    logger: {
      warn(error) {
        warnings.push(error);
      }
    }
  });

  const firstStarted = await producer.start({
    poeVersion: 'poe2',
    gameId: 24886
  });

  assert.equal(firstStarted, false);
  assert.deepEqual(warnings, [startupError]);
  assert.deepEqual(listeners.get('new-info-update'), []);
  assert.deepEqual(listeners.get('game-exit'), []);
  assert.deepEqual(emitted, []);

  const secondStarted = await producer.start({
    poeVersion: 'poe2',
    gameId: 24886
  });

  assert.equal(secondStarted, true);
  assert.equal(listeners.get('new-info-update').length, 1);
  assert.equal(listeners.get('game-exit').length, 1);
  assert.deepEqual(emitted, [
    {
      source: 'native-info',
      poeVersion: 'poe2',
      characterName: 'RECOVERED',
      level: 96,
      experience: 523456789,
      confidence: 'high'
    }
  ]);
});

test('producer logs post-start refresh failures without rejecting the update handler', async () => {
  const createNativeGameInfoProducer = getCreateNativeGameInfoProducer();
  const warnings = [];
  const listeners = new Map();
  const updateError = new Error('refresh failed');
  let getInfoCallCount = 0;
  const gep = {
    async setRequiredFeatures() {},
    async getInfo() {
      getInfoCallCount += 1;

      if (getInfoCallCount === 1) {
        return null;
      }

      throw updateError;
    },
    on(eventName, handler) {
      listeners.set(eventName, handler);
    },
    removeListener(eventName, handler) {
      if (listeners.get(eventName) === handler) {
        listeners.delete(eventName);
      }
    }
  };

  const producer = createNativeGameInfoProducer({
    gep,
    logger: {
      warn(error) {
        warnings.push(error);
      }
    }
  });

  const started = await producer.start({
    poeVersion: 'poe2',
    gameId: 24886
  });

  assert.equal(started, true);

  const infoUpdateHandler = listeners.get('new-info-update');

  await assert.doesNotReject(async () => infoUpdateHandler({}, 24886));

  assert.deepEqual(warnings, [updateError]);
  assert.equal(typeof listeners.get('new-info-update'), 'function');
  assert.equal(typeof listeners.get('game-exit'), 'function');
});

test('producer game-exit handler does not reject when stop cleanup fails and logger has no warn method', async () => {
  const cleanupError = new Error('native cleanup failed');
  const { gameExitHandler } = await startProducerForGameExitTest({
    logger: {},
    removeListener() {
      throw cleanupError;
    }
  });

  await assert.doesNotReject(async () => gameExitHandler({}, 24886));
});

test('producer game-exit handler does not reject when stop cleanup fails and logger.warn throws', async () => {
  const cleanupError = new Error('native cleanup failed');
  const warnError = new Error('warn failed');
  const { gameExitHandler } = await startProducerForGameExitTest({
    logger: {
      warn(error) {
        assert.equal(error, cleanupError);
        throw warnError;
      }
    },
    removeListener() {
      throw cleanupError;
    }
  });

  await assert.doesNotReject(async () => gameExitHandler({}, 24886));
});

test('producer game-exit handler does not reject when logger.warn returns a rejected promise', async t => {
  const cleanupError = new Error('native cleanup failed');
  const warnError = new Error('warn rejected');
  const unhandledRejections = [];
  const onUnhandledRejection = reason => {
    unhandledRejections.push(reason);
  };

  process.on('unhandledRejection', onUnhandledRejection);
  t.after(() => {
    process.removeListener('unhandledRejection', onUnhandledRejection);
  });

  const { gameExitHandler } = await startProducerForGameExitTest({
    logger: {
      warn(error) {
        assert.equal(error, cleanupError);
        return Promise.reject(warnError);
      }
    },
    removeListener() {
      throw cleanupError;
    }
  });

  await assert.doesNotReject(async () => gameExitHandler({}, 24886));
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(unhandledRejections, []);
});

test('producer ignores stale info updates after the active session changes', async () => {
  const createNativeGameInfoProducer = getCreateNativeGameInfoProducer();
  const emitted = [];
  const listeners = new Map();
  const staleInfo = createDeferred();
  let getInfoCallCount = 0;
  const gep = {
    async setRequiredFeatures() {},
    async getInfo() {
      getInfoCallCount += 1;

      if (getInfoCallCount === 1) {
        return null;
      }

      if (getInfoCallCount === 2) {
        return staleInfo.promise;
      }

      return {
        me: {
          character_name: 'FRESH',
          character_level: 94,
          character_exp: 323456789
        }
      };
    },
    on(eventName, handler) {
      listeners.set(eventName, handler);
    },
    removeListener(eventName, handler) {
      if (listeners.get(eventName) === handler) {
        listeners.delete(eventName);
      }
    }
  };

  const producer = createNativeGameInfoProducer({
    gep,
    emitHint: hint => emitted.push(hint)
  });

  await producer.start({
    poeVersion: 'poe2',
    gameId: 24886
  });

  const staleInfoUpdateHandler = listeners.get('new-info-update');
  const staleUpdatePromise = staleInfoUpdateHandler({}, 24886);

  await producer.start({
    poeVersion: 'poe2',
    gameId: 24887
  });

  staleInfo.resolve({
    me: {
      character_name: 'STALE',
      character_level: 99,
      character_exp: 999999999
    }
  });

  await staleUpdatePromise;

  assert.deepEqual(emitted, [
    {
      source: 'native-info',
      poeVersion: 'poe2',
      characterName: 'FRESH',
      level: 94,
      experience: 323456789,
      confidence: 'high'
    }
  ]);
});
