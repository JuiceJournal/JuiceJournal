const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const SUPERVISOR_REQUEST = '../src/modules/nativeBridgeSupervisor';

function isDirectMissingModule(error, request) {
  return error?.code === 'MODULE_NOT_FOUND'
    && error.message.includes(`Cannot find module '${request}'`);
}

function loadNativeBridgeSupervisor() {
  try {
    return require(SUPERVISOR_REQUEST);
  } catch (error) {
    if (!isDirectMissingModule(error, SUPERVISOR_REQUEST)) {
      throw error;
    }

    return { __loadError: error };
  }
}

function getCreateNativeBridgeSupervisor() {
  const nativeBridgeSupervisor = loadNativeBridgeSupervisor();

  if (nativeBridgeSupervisor.__loadError) {
    const { code, message } = nativeBridgeSupervisor.__loadError;
    assert.fail(
      `Expected desktop/src/modules/nativeBridgeSupervisor.js to exist and export createNativeBridgeSupervisor. Current red state: ${code || 'LOAD_ERROR'}: ${message}`
    );
  }

  assert.equal(
    typeof nativeBridgeSupervisor.createNativeBridgeSupervisor,
    'function',
    'Expected nativeBridgeSupervisor.createNativeBridgeSupervisor to be a function'
  );

  return nativeBridgeSupervisor.createNativeBridgeSupervisor;
}

function createFakeBridgeProcess() {
  const child = new EventEmitter();

  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killCalls = 0;
  child.kill = () => {
    child.killCalls += 1;
    child.emit('exit', 0);
    return true;
  };

  return child;
}

test('supervisor spawns the bridge once and parses complete stdout lines across chunks', () => {
  const createNativeBridgeSupervisor = getCreateNativeBridgeSupervisor();
  const messages = [];
  const child = createFakeBridgeProcess();
  let spawnCalls = 0;
  const supervisor = createNativeBridgeSupervisor({
    spawnBridge() {
      spawnCalls += 1;
      return child;
    },
    onMessage(message) {
      messages.push(message);
    }
  });

  assert.equal(supervisor.start(), true);
  assert.equal(supervisor.start(), false);

  child.stdout.emit('data', Buffer.from('{"type":"bridge-diagnostic","message":"rea'));
  child.stdout.emit('data', Buffer.from('dy","detectedAt":"2026-04-14T12:00:00.000Z"}\nnot-json\n'));
  child.stdout.emit('data', Buffer.from('{"type":"bridge-diagnostic","message":"second","detectedAt":"2026-04-14T12:00:01.000Z"}\n'));

  assert.equal(spawnCalls, 1);
  assert.deepEqual(messages, [
    {
      type: 'bridge-diagnostic',
      message: 'ready',
      detectedAt: '2026-04-14T12:00:00.000Z'
    },
    {
      type: 'bridge-diagnostic',
      message: 'second',
      detectedAt: '2026-04-14T12:00:01.000Z'
    }
  ]);
});

test('supervisor keeps the first stdout payload even when the child emits during listener registration', () => {
  const createNativeBridgeSupervisor = getCreateNativeBridgeSupervisor();
  const messages = [];
  const child = createFakeBridgeProcess();
  const originalOn = child.stdout.on.bind(child.stdout);
  child.stdout.on = (eventName, handler) => {
    const result = originalOn(eventName, handler);
    if (eventName === 'data') {
      handler(Buffer.from('{"type":"bridge-diagnostic","message":"immediate","detectedAt":"2026-04-14T12:00:00.000Z"}\n'));
    }
    return result;
  };

  const supervisor = createNativeBridgeSupervisor({
    spawnBridge() {
      return child;
    },
    onMessage(message) {
      messages.push(message);
    }
  });

  assert.equal(supervisor.start(), true);
  assert.deepEqual(messages, [
    {
      type: 'bridge-diagnostic',
      message: 'immediate',
      detectedAt: '2026-04-14T12:00:00.000Z'
    }
  ]);
});

test('supervisor forwards stderr data to onError without parsing it', () => {
  const createNativeBridgeSupervisor = getCreateNativeBridgeSupervisor();
  const stderrLines = [];
  const child = createFakeBridgeProcess();
  const supervisor = createNativeBridgeSupervisor({
    spawnBridge() {
      return child;
    },
    onError(message) {
      stderrLines.push(message);
    }
  });

  assert.equal(supervisor.start(), true);

  child.stderr.emit('data', Buffer.from('bridge warning\n'));
  child.stderr.emit('data', Buffer.from('second line'));

  assert.deepEqual(stderrLines, ['bridge warning\n', 'second line']);
});

test('supervisor stop kills the active bridge exactly once', () => {
  const createNativeBridgeSupervisor = getCreateNativeBridgeSupervisor();
  const child = createFakeBridgeProcess();
  const supervisor = createNativeBridgeSupervisor({
    spawnBridge() {
      return child;
    }
  });

  assert.equal(supervisor.start(), true);
  assert.equal(supervisor.stop(), true);
  assert.equal(supervisor.stop(), false);
  assert.equal(child.killCalls, 1);
});

test('supervisor can start a fresh bridge after the previous child exits', () => {
  const createNativeBridgeSupervisor = getCreateNativeBridgeSupervisor();
  const children = [createFakeBridgeProcess(), createFakeBridgeProcess()];
  let spawnCalls = 0;
  const supervisor = createNativeBridgeSupervisor({
    spawnBridge() {
      const child = children[spawnCalls];
      spawnCalls += 1;
      return child;
    }
  });

  assert.equal(supervisor.start(), true);
  children[0].emit('exit', 0);
  assert.equal(supervisor.start(), true);
  assert.equal(spawnCalls, 2);
});

test('supervisor start fails closed when spawnBridge throws', () => {
  const createNativeBridgeSupervisor = getCreateNativeBridgeSupervisor();
  const errors = [];
  const startError = new Error('bridge spawn failed');
  const supervisor = createNativeBridgeSupervisor({
    spawnBridge() {
      throw startError;
    },
    onError(error) {
      errors.push(error);
    }
  });

  assert.equal(supervisor.start(), false);
  assert.deepEqual(errors, [startError]);
});

test('supervisor stop fails closed when kill throws', () => {
  const createNativeBridgeSupervisor = getCreateNativeBridgeSupervisor();
  const errors = [];
  const stopError = new Error('bridge kill failed');
  const child = createFakeBridgeProcess();
  child.kill = () => {
    child.killCalls += 1;
    throw stopError;
  };
  const supervisor = createNativeBridgeSupervisor({
    spawnBridge() {
      return child;
    },
    onError(error) {
      errors.push(error);
    }
  });

  assert.equal(supervisor.start(), true);
  assert.equal(supervisor.stop(), false);
  assert.equal(child.killCalls, 1);
  assert.deepEqual(errors, [stopError]);
  assert.equal(supervisor.start(), false);
});

test('supervisor stop fails closed when kill returns false', () => {
  const createNativeBridgeSupervisor = getCreateNativeBridgeSupervisor();
  const child = createFakeBridgeProcess();
  child.kill = () => {
    child.killCalls += 1;
    return false;
  };

  const supervisor = createNativeBridgeSupervisor({
    spawnBridge() {
      return child;
    }
  });

  assert.equal(supervisor.start(), true);
  assert.equal(supervisor.stop(), false);
  assert.equal(child.killCalls, 1);
  assert.equal(supervisor.start(), false);
});

test('supervisor ignores stale child output after stop and restart', () => {
  const createNativeBridgeSupervisor = getCreateNativeBridgeSupervisor();
  const messages = [];
  const firstChild = createFakeBridgeProcess();
  const secondChild = createFakeBridgeProcess();
  let spawnCalls = 0;
  const supervisor = createNativeBridgeSupervisor({
    spawnBridge() {
      const child = spawnCalls === 0 ? firstChild : secondChild;
      spawnCalls += 1;
      return child;
    },
    onMessage(message) {
      messages.push(message);
    }
  });

  assert.equal(supervisor.start(), true);
  assert.equal(supervisor.stop(), true);
  assert.equal(supervisor.start(), true);

  firstChild.stdout.emit('data', Buffer.from('{"type":"bridge-diagnostic","message":"stale","detectedAt":"2026-04-14T12:00:00.000Z"}\n'));
  secondChild.stdout.emit('data', Buffer.from('{"type":"bridge-diagnostic","message":"fresh","detectedAt":"2026-04-14T12:00:01.000Z"}\n'));

  assert.deepEqual(messages, [
    {
      type: 'bridge-diagnostic',
      message: 'fresh',
      detectedAt: '2026-04-14T12:00:01.000Z'
    }
  ]);
});
