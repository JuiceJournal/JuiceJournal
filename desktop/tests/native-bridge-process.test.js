const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const desktopDir = path.join(__dirname, '..');
const bridgeProjectPath = path.join('native-bridge', 'JuiceJournal.NativeBridge.csproj');
let bridgeBuildVerified = false;

function ensureBridgeBuilt() {
  if (bridgeBuildVerified) {
    return;
  }

  execFileSync('dotnet', ['build', bridgeProjectPath], {
    cwd: desktopDir,
    stdio: 'ignore',
    windowsHide: true
  });
  bridgeBuildVerified = true;
}

function startBridgeProcess() {
  ensureBridgeBuilt();

  const child = spawn('dotnet', ['run', '--no-build', '--project', bridgeProjectPath], {
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

async function waitFor(predicate, { timeoutMs = 20000, intervalMs = 50, description = 'condition' } = {}) {
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
      && seen.has('process-tree-probe')
      && seen.has('named-pipe-probe')
      && seen.has('artifact-probe')
      && seen.has('transition-probe')
      && seen.has('window-probe')
      ? Array.from(seen)
      : null;
  }, {
    description: 'startup diagnostics'
  });

  assert.ok(messages.includes('artifact-probe'));
  assert.ok(messages.includes('named-pipe-probe'));
  assert.ok(messages.includes('process-probe'));
  assert.ok(messages.includes('process-tree-probe'));
  assert.ok(messages.includes('transition-probe'));
  assert.ok(messages.includes('window-probe'));
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

test('native bridge does not emit active-character-hint without an active poe process even when accountHint matches', async (t) => {
  const bridge = startBridgeProcess();
  t.after(async () => {
    await shutdownBridge(bridge);
  });

  await waitFor(() => bridge.lines.some((line) => line?.message === 'window-probe'), {
    description: 'initial diagnostics'
  });

  bridge.child.stdin.write('{"type":"set-character-pool","characters":[{"poeVersion":"poe2","characterId":"poe2-kellee","characterName":"KELLEE","className":"Monk2","level":92}],"accountHint":{"poeVersion":"poe2","characterName":"KELLEE","className":"Monk2","level":92}}\n');

  await waitFor(
    () => bridge.lines.some((line) => line?.message === 'character-pool-replaced'),
    { description: 'character-pool-replaced diagnostic' }
  );
  await waitFor(
    () => bridge.lines.some((line) => line?.message === 'hint-resolution-rejected'),
    { description: 'hint-resolution-rejected diagnostic' }
  );

  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.equal(
    bridge.lines.some((line) => line?.type === 'active-character-hint'),
    false
  );
});

test('native bridge startup diagnostics still include artifact-probe after root discovery wiring', async (t) => {
  const bridge = startBridgeProcess();
  t.after(async () => {
    await shutdownBridge(bridge);
  });

  const artifactDiagnostic = await waitFor(
    () => bridge.lines.find((line) => line?.message === 'artifact-probe'),
    { description: 'artifact-probe diagnostic' }
  );

  assert.equal(artifactDiagnostic.type, 'bridge-diagnostic');
  assert.equal(typeof artifactDiagnostic.data.rootCount, 'number');
});

test('native bridge artifact-probe diagnostics remain bounded after enumeration expansion', async (t) => {
  const bridge = startBridgeProcess();
  t.after(async () => {
    await shutdownBridge(bridge);
  });

  const artifactDiagnostic = await waitFor(
    () => bridge.lines.find((line) => line?.message === 'artifact-probe'),
    { description: 'artifact-probe diagnostic' }
  );

  assert.equal(artifactDiagnostic.type, 'bridge-diagnostic');
  assert.equal(Array.isArray(artifactDiagnostic.data.artifacts), true);
  assert.equal(artifactDiagnostic.data.artifacts.length <= 20, true);
});

test('artifact-probe diagnostics expose previewText and remain bounded after preview enrichment', async (t) => {
  const bridge = startBridgeProcess();
  t.after(async () => {
    await shutdownBridge(bridge);
  });

  const artifactDiagnostic = await waitFor(
    () => bridge.lines.find((line) => line?.message === 'artifact-probe'),
    { description: 'artifact-probe diagnostic' }
  );

  assert.equal(Array.isArray(artifactDiagnostic.data.artifacts), true);
  assert.equal(artifactDiagnostic.data.artifacts.length <= 20, true);

  if (artifactDiagnostic.data.artifacts.length > 0) {
    assert.equal(typeof artifactDiagnostic.data.artifacts[0].previewText, 'string');
  }
});

test('parsed artifact diagnostics remain bounded and stable after parser enrichment', async (t) => {
  const bridge = startBridgeProcess();
  t.after(async () => {
    await shutdownBridge(bridge);
  });

  const artifactDiagnostic = await waitFor(
    () => bridge.lines.find((line) => line?.message === 'artifact-probe'),
    { description: 'artifact-probe diagnostic' }
  );

  if (artifactDiagnostic.data.artifacts.length === 0) {
    assert.equal(true, true);
    return;
  }

  const parsedMessages = await waitFor(() => {
    const matches = bridge.lines
      .filter((line) => line?.type === 'bridge-diagnostic')
      .filter((line) => ['artifact-config-parse', 'artifact-state-parse', 'artifact-loaded-mtx-parse'].includes(line.message));
    return matches.length > 0 ? matches : null;
  }, { description: 'parsed artifact diagnostics' });

  assert.equal(parsedMessages.length <= 20, true);
});

test('native bridge emits memory feasibility diagnostics when explicitly commanded', async (t) => {
  const bridge = startBridgeProcess();
  t.after(async () => {
    await shutdownBridge(bridge);
  });

  await waitFor(() => bridge.lines.some((line) => line?.message === 'window-probe'), {
    description: 'initial diagnostics'
  });

  bridge.child.stdin.write('{"type":"run-memory-feasibility","poeVersion":"poe2","targets":["KELLEE"]}\n');

  const memoryDiagnostic = await waitFor(
    () => bridge.lines.find((line) => line?.message === 'memory-feasibility-probe'),
    { description: 'memory-feasibility-probe diagnostic' }
  );

  assert.equal(memoryDiagnostic.type, 'bridge-diagnostic');
  assert.equal(memoryDiagnostic.data.poeVersion, 'poe2');
  assert.equal(memoryDiagnostic.data.targetCount, 1);
  assert.equal(Array.isArray(memoryDiagnostic.data.hits), true);
  assert.equal(Array.isArray(memoryDiagnostic.data.neighborhoods), true);
  assert.equal(typeof memoryDiagnostic.data.regionCount, 'number');
});
