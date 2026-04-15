const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

const desktopDir = path.join(__dirname, '..');
const bridgeProjectPath = path.join('native-bridge', 'JuiceJournal.NativeBridge.csproj');

function startBridgeProcess() {
  const child = spawn('dotnet', ['run', '--project', bridgeProjectPath], {
    cwd: desktopDir,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  });

  const lines = [];
  let stdoutBuffer = '';
  let stderrBuffer = '';

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += String(chunk ?? '');
    const stdoutLines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = stdoutLines.pop() ?? '';

    for (const line of stdoutLines) {
      if (!line.trim()) {
        continue;
      }

      try {
        lines.push(JSON.parse(line));
      } catch {
        lines.push({ type: 'invalid-json', raw: line });
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    stderrBuffer += String(chunk ?? '');
  });

  return {
    child,
    lines,
    getStderr() {
      return stderrBuffer;
    }
  };
}

async function waitFor(predicate, { timeoutMs = 10000, intervalMs = 50, description = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  assert.fail(`Timed out waiting for ${description}`);
}

async function shutdownBridge(bridge) {
  if (!bridge?.child) {
    return;
  }

  if (!bridge.child.killed && !bridge.child.exitCode) {
    bridge.child.stdin.end();
  }

  await new Promise((resolve) => {
    bridge.child.once('exit', resolve);
    setTimeout(() => {
      if (bridge.child.exitCode === null) {
        bridge.child.kill();
      }
      resolve();
    }, 5000);
  });
}

test('native bridge emits startup diagnostics before any stdin command arrives', async (t) => {
  const bridge = startBridgeProcess();
  t.after(async () => {
    await shutdownBridge(bridge);
  });

  const messages = await waitFor(() => {
    const seen = new Set(
      bridge.lines
        .filter((line) => line?.type === 'bridge-diagnostic')
        .map((line) => line.message)
    );

    return seen.has('process-probe')
      && seen.has('transition-probe')
      && seen.has('window-probe')
      ? Array.from(seen)
      : null;
  }, {
    description: 'startup diagnostics'
  });

  assert.deepEqual(messages.sort(), ['process-probe', 'transition-probe', 'window-probe']);
  assert.equal(bridge.getStderr(), '');
});

test('native bridge accepts repeated character pool replace commands in one process', async (t) => {
  const bridge = startBridgeProcess();
  t.after(async () => {
    await shutdownBridge(bridge);
  });

  await waitFor(() => bridge.lines.some((line) => line?.message === 'window-probe'), {
    description: 'initial diagnostics'
  });

  bridge.child.stdin.write('{"type":"set-character-pool","characters":[]}\n');

  await waitFor(() => bridge.lines.filter((line) => line?.message === 'character-pool-replaced').length >= 1, {
    description: 'first character-pool-replaced diagnostic'
  });

  bridge.child.stdin.write('{"type":"set-character-pool","characters":[{"poeVersion":"poe2","characterId":"poe2-kellee","characterName":"KELLEE"}]}\n');

  const replaceMessages = await waitFor(() => {
    const messages = bridge.lines.filter((line) => line?.message === 'character-pool-replaced');
    return messages.length >= 2 ? messages : null;
  }, {
    description: 'second character-pool-replaced diagnostic'
  });

  assert.deepEqual(
    replaceMessages.map((message) => message.data?.characterCount),
    [0, 1]
  );
  assert.equal(bridge.child.exitCode, null);
});
