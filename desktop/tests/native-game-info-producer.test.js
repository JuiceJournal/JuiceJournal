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
