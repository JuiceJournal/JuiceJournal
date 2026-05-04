const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');

const LogParser = require('../src/modules/logParser');
const {
  createRuntimeSessionState,
  applyRuntimeEvent,
  cloneRuntimeSessionState
} = require('../src/modules/runtimeSessionModel');
const { deriveOverlayState } = require('../src/modules/overlayStateModel');

const BUDGETS = {
  logParserMs: 900,
  runtimeSessionMs: 700,
  overlayStateMs: 500,
  retainedHeapMb: 16
};

function forceGc() {
  if (typeof global.gc === 'function') {
    global.gc();
  }
}

function heapUsedMb() {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

function measure(name, fn) {
  forceGc();
  const beforeHeap = heapUsedMb();
  const startedAt = performance.now();
  const result = fn();
  const durationMs = performance.now() - startedAt;
  forceGc();
  const afterHeap = heapUsedMb();

  return {
    name,
    durationMs: Number(durationMs.toFixed(2)),
    retainedHeapMb: Number(Math.max(0, afterHeap - beforeHeap).toFixed(2)),
    result
  };
}

function benchmarkLogParser() {
  const parser = new LogParser('benchmark-client.txt', { poeVersion: 'poe2' });
  let entered = 0;
  let exited = 0;
  parser.on('mapEntered', () => {
    entered += 1;
  });
  parser.on('mapExited', () => {
    exited += 1;
  });

  for (let index = 0; index < 12000; index += 1) {
    const second = String(index % 60).padStart(2, '0');
    parser.parseLine(`2026/05/04 12:00:${second} 123456 abc [INFO Client 123] : You have entered Tower.`);
    parser.parseLine(`2026/05/04 12:00:${second} 123456 abc [INFO Client 123] : You have entered Hideout.`);
  }

  assert.equal(entered, 12000);
  assert.equal(exited, 12000);
  return { entered, exited };
}

function benchmarkRuntimeSessionModel() {
  const state = createRuntimeSessionState();

  for (let index = 0; index < 8000; index += 1) {
    const enteredAt = new Date(Date.UTC(2026, 4, 4, 12, 0, index % 60)).toISOString();
    const exitedAt = new Date(Date.UTC(2026, 4, 4, 12, 1, index % 60)).toISOString();
    applyRuntimeEvent(state, {
      type: 'area_entered',
      areaName: `Tower ${index}`,
      at: enteredAt,
      source: 'benchmark'
    });
    applyRuntimeEvent(state, {
      type: 'area_exited',
      areaName: 'Hideout',
      at: exitedAt,
      source: 'benchmark'
    });
  }

  const snapshot = cloneRuntimeSessionState(state, {
    now: '2026-05-04T12:30:00.000Z'
  });

  assert.equal(snapshot.instances.length, 8000);
  assert.equal(snapshot.currentInstance, null);
  return {
    instances: snapshot.instances.length,
    totalActiveSeconds: snapshot.totalActiveSeconds
  };
}

function benchmarkOverlayStateModel() {
  const now = Date.parse('2026-05-04T12:30:00.000Z');
  let visible = 0;

  for (let index = 0; index < 60000; index += 1) {
    const state = deriveOverlayState({
      enabled: true,
      session: {
        status: 'active',
        mapName: 'Tower',
        farmType: 'Expedition',
        poeVersion: 'poe2',
        league: 'Standard',
        startedAt: '2026-05-04T12:00:00.000Z'
      },
      now
    });
    if (state.visibility === 'visible') {
      visible += 1;
    }
  }

  assert.equal(visible, 60000);
  return { visible };
}

function main() {
  const results = [
    measure('log-parser', benchmarkLogParser),
    measure('runtime-session-model', benchmarkRuntimeSessionModel),
    measure('overlay-state-model', benchmarkOverlayStateModel)
  ];

  const totalRetainedHeapMb = Number(results.reduce((sum, result) => sum + result.retainedHeapMb, 0).toFixed(2));
  const failures = [];

  const logParser = results.find((result) => result.name === 'log-parser');
  const runtimeSession = results.find((result) => result.name === 'runtime-session-model');
  const overlayState = results.find((result) => result.name === 'overlay-state-model');

  if (logParser.durationMs > BUDGETS.logParserMs) {
    failures.push(`log parser exceeded ${BUDGETS.logParserMs}ms: ${logParser.durationMs}ms`);
  }

  if (runtimeSession.durationMs > BUDGETS.runtimeSessionMs) {
    failures.push(`runtime session exceeded ${BUDGETS.runtimeSessionMs}ms: ${runtimeSession.durationMs}ms`);
  }

  if (overlayState.durationMs > BUDGETS.overlayStateMs) {
    failures.push(`overlay state exceeded ${BUDGETS.overlayStateMs}ms: ${overlayState.durationMs}ms`);
  }

  if (totalRetainedHeapMb > BUDGETS.retainedHeapMb) {
    failures.push(`retained heap exceeded ${BUDGETS.retainedHeapMb}MB: ${totalRetainedHeapMb}MB`);
  }

  console.table(results.map(({ name, durationMs, retainedHeapMb }) => ({
    name,
    durationMs,
    retainedHeapMb
  })));
  console.log(JSON.stringify({
    budgets: BUDGETS,
    totalRetainedHeapMb,
    results
  }, null, 2));

  if (failures.length > 0) {
    console.error(`Desktop benchmark budget failure:\n${failures.join('\n')}`);
    process.exitCode = 1;
  }
}

main();
