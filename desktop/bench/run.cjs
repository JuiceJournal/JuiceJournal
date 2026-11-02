// Latency benchmark of the desktop app, on an isolated temp profile with poe.ninja and the game CDN stubbed.
//   npm run bench                         everything but the live runs
//   npm run bench -- --only currency,idle one or more of: launch, currency, dashboard, io, idle, profiles, live
//   npm run bench -- --quick              a third of the runs, to check the harness
//   npm run bench -- --out <file.json>    results file (default: a temp folder, never the repo); an existing one is added to
//   npm run bench -- --only live --live-plan poe1,poe2   which live syncs to run
// `live` reads the real poe.ninja, three syncs at most, and only runs when named. Close other Electron apps and the game
// first; the run refuses to start next to them. Windows open on the second monitor when there is one.
const fs = require('fs');
const os = require('os');
const path = require('path');
const scenarios = require('./scenarios.cjs');
const { createRecorder, hostBusyPercent, otherAppProcesses, tempRoot } = require('./harness.cjs');

const DEFAULT_SECTIONS = ['launch', 'currency', 'dashboard', 'io', 'idle', 'profiles'];

function parseArgs(argv) {
  const options = { sections: DEFAULT_SECTIONS, quick: false, out: null, sizes: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--only') options.sections = argv[++index].split(',');
    else if (arg === '--quick') options.quick = true;
    else if (arg === '--out') options.out = argv[++index];
    else if (arg === '--sizes') options.sizes = argv[++index].split(',').map(Number);
    else if (arg === '--live-plan') options.livePlan = argv[++index].split(',');
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.resolve(options.out || path.join(tempRoot, `results-${stamp}.json`));
  const artifactsDir = path.join(path.dirname(outPath), `artifacts-${path.basename(outPath, '.json')}`);
  fs.mkdirSync(artifactsDir, { recursive: true });

  const previous = options.out && fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : null;
  const results = previous || {
    startedAt: new Date().toISOString(),
    host: { cpu: os.cpus()[0]?.model, cores: os.cpus().length, memoryGb: Math.round(os.totalmem() / 1073741824), platform: `${os.platform()} ${os.release()}` },
    electron: require('electron/package.json').version,
    sections: {},
    metrics: []
  };
  results.artifactsDir = artifactsDir;
  const save = () => fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  const log = (line) => console.log(`[bench ${new Date().toISOString().slice(11, 19)}] ${line}`);
  const recorder = createRecorder(results, { scale: options.quick ? 1 / 3 : 1, log });

  const sizes = options.sizes || undefined;
  const runners = {
    launch: () => scenarios.launch(recorder, results, { runs: options.quick ? 2 : 5 }),
    currency: () => scenarios.currency(recorder, results),
    dashboard: () => scenarios.dashboard(recorder, results, sizes),
    io: () => scenarios.journalIo(recorder, results, sizes),
    idle: () => scenarios.idle(recorder, results, { windowMs: options.quick ? 5000 : 15000, runs: options.quick ? 2 : 5 }),
    profiles: () => scenarios.profiles(recorder, results),
    live: () => scenarios.livePoeNinja(recorder, results, options.livePlan)
  };

  for (const section of options.sections) {
    if (!runners[section]) {
      throw new Error(`Unknown section: ${section}`);
    }
    const others = otherAppProcesses();
    if (others.length > 0) {
      throw new Error(`Refusing to measure next to: ${[...new Set(others)].join(', ')}`);
    }
    const busyBefore = await hostBusyPercent();
    log(`section ${section}: machine ${busyBefore}% busy before it`);
    if (section !== 'live') {
      // Replace an earlier run of this section in the same results file.
      results.metrics = results.metrics.filter((metric) => !sectionOwns(section, metric.name));
    }
    const startedAt = Date.now();
    try {
      await runners[section]();
      results.sections[section] = { ok: true, busyBefore, seconds: Math.round((Date.now() - startedAt) / 1000) };
    } catch (error) {
      results.sections[section] = { ok: false, busyBefore, error: error.stack || String(error) };
      log(`section ${section} failed: ${error.stack || error}`);
      process.exitCode = 1;
    }
    save();
  }

  results.finishedAt = new Date().toISOString();
  save();
  log(`results: ${outPath}`);
}

function sectionOwns(section, name) {
  const prefixes = {
    launch: ['app.launch', 'currency.open.firstAfterLaunch', 'overlay.firstShow'],
    currency: ['floor.', 'currency.'],
    dashboard: ['dashboard.', 'sessions.', 'overlay.mapResult'],
    io: ['main.journal.'],
    idle: ['idle.'],
    profiles: ['experiment.']
  }[section];
  if (section === 'currency' && (name === 'currency.open.firstAfterLaunch' || name.startsWith('currency.sync.full.live'))) {
    return false;
  }
  return prefixes.some((prefix) => name.startsWith(prefix));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
