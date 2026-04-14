const { parseNativeBridgeLine } = require('./nativeBridgeModel');

function createNativeBridgeSupervisor({ spawnBridge, onMessage, onError = () => {} } = {}) {
  let child = null;
  let stdoutBuffer = '';

  function emitMessage(payload) {
    if (typeof onMessage === 'function') {
      onMessage(payload);
    }
  }

  function emitError(message) {
    if (typeof onError === 'function') {
      try {
        onError(message);
      } catch {}
    }
  }

  function handleStdout(chunk) {
    stdoutBuffer += String(chunk ?? '');

    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line) {
        continue;
      }

      const payload = parseNativeBridgeLine(line);
      if (payload) {
        emitMessage(payload);
      }
    }
  }

  function start() {
    if (child || typeof spawnBridge !== 'function') {
      return false;
    }

    let nextChild = null;
    try {
      nextChild = spawnBridge();
    } catch (error) {
      emitError(error);
      return false;
    }

    if (!nextChild) {
      return false;
    }

    stdoutBuffer = '';
    child = nextChild;

    try {
      nextChild.stdout?.on('data', handleStdout);
      nextChild.stderr?.on('data', chunk => {
        emitError(String(chunk ?? ''));
      });
      nextChild.on?.('exit', () => {
        if (child === nextChild) {
          child = null;
          stdoutBuffer = '';
        }
      });
    } catch (error) {
      child = null;
      stdoutBuffer = '';
      emitError(error);
      return false;
    }

    return true;
  }

  function stop() {
    if (!child) {
      return false;
    }

    const activeChild = child;
    child = null;
    stdoutBuffer = '';
    try {
      activeChild.kill?.();
      return true;
    } catch (error) {
      emitError(error);
      return false;
    }
  }

  return {
    start,
    stop
  };
}

module.exports = {
  createNativeBridgeSupervisor
};
