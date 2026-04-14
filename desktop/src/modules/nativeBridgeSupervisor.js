const { parseNativeBridgeLine } = require('./nativeBridgeModel');

function createNativeBridgeSupervisor({ spawnBridge, onMessage, onError = () => {} } = {}) {
  let activeBridge = null;

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

  function detachBridge(bridge) {
    if (!bridge || !bridge.child) {
      return;
    }

    const { child, onStdoutData, onStderrData, onExit } = bridge;

    if (typeof child.stdout?.removeListener === 'function' && onStdoutData) {
      child.stdout.removeListener('data', onStdoutData);
    }

    if (typeof child.stderr?.removeListener === 'function' && onStderrData) {
      child.stderr.removeListener('data', onStderrData);
    }

    if (typeof child.removeListener === 'function' && onExit) {
      child.removeListener('exit', onExit);
    }
  }

  function start() {
    if (activeBridge || typeof spawnBridge !== 'function') {
      return false;
    }

    let child = null;
    try {
      child = spawnBridge();
    } catch (error) {
      emitError(error);
      return false;
    }

    if (!child) {
      return false;
    }

    const bridge = {
      child,
      stdoutBuffer: '',
      onStdoutData: null,
      onStderrData: null,
      onExit: null
    };

    bridge.onStdoutData = (chunk) => {
      if (activeBridge !== bridge) {
        return;
      }

      bridge.stdoutBuffer += String(chunk ?? '');
      const lines = bridge.stdoutBuffer.split(/\r?\n/);
      bridge.stdoutBuffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line) {
          continue;
        }

        const payload = parseNativeBridgeLine(line);
        if (payload) {
          emitMessage(payload);
        }
      }
    };

    bridge.onStderrData = (chunk) => {
      if (activeBridge !== bridge) {
        return;
      }

      emitError(String(chunk ?? ''));
    };

    bridge.onExit = () => {
      if (activeBridge === bridge) {
        activeBridge = null;
      }

      detachBridge(bridge);
    };

    activeBridge = bridge;

    try {
      child.stdout?.on('data', bridge.onStdoutData);
      child.stderr?.on('data', bridge.onStderrData);
      child.on?.('exit', bridge.onExit);
    } catch (error) {
      detachBridge(bridge);
      if (activeBridge === bridge) {
        activeBridge = null;
      }
      emitError(error);
      return false;
    }

    return true;
  }

  function stop() {
    if (!activeBridge) {
      return false;
    }

    try {
      const killed = activeBridge.child.kill?.();
      if (killed === false) {
        return false;
      }

      detachBridge(activeBridge);
      activeBridge = null;
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
