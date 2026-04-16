const DEFAULT_OVERWOLF_QA_PACKAGES_URL = 'https://electronapi-qa.overwolf.com/packages';
const REQUIRED_GEP_METHODS = ['setRequiredFeatures', 'getInfo', 'on', 'removeListener'];

function loadElectronIsOverwolfModule() {
  try {
    return require('@overwolf/electron-is-overwolf');
  } catch {
    return {
      isElectronOverwolf: false,
      overwolfInfo() {
        return null;
      }
    };
  }
}

function normalizeConfiguredPackages(packages) {
  if (!Array.isArray(packages)) {
    return [];
  }

  return packages
    .filter(value => typeof value === 'string')
    .map(value => value.trim())
    .filter(Boolean);
}

function parseOverwolfPackagesUrl(argv = []) {
  if (!Array.isArray(argv)) {
    return null;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (typeof value !== 'string') {
      continue;
    }

    if (value.startsWith('--owepm-packages-url=')) {
      return value.slice('--owepm-packages-url='.length).trim() || null;
    }

    if (value === '--owepm-packages-url') {
      const nextValue = typeof argv[index + 1] === 'string' ? argv[index + 1].trim() : '';
      return nextValue || null;
    }
  }

  return null;
}

function getOverwolfRuntimeState({
  app,
  argv = process.argv,
  configuredPackages,
  isOverwolfRuntime,
  getOverwolfInfo
} = {}) {
  const electronIsOverwolfModule = loadElectronIsOverwolfModule();
  const resolvedIsOverwolfRuntime = typeof isOverwolfRuntime === 'boolean'
    ? isOverwolfRuntime
    : electronIsOverwolfModule.isElectronOverwolf;
  const resolvedGetOverwolfInfo = typeof getOverwolfInfo === 'function'
    ? getOverwolfInfo
    : electronIsOverwolfModule.overwolfInfo;
  const packagesConfigured = normalizeConfiguredPackages(configuredPackages);
  const gep = app?.overwolf?.packages?.gep ?? null;
  const packageFeedUrl = parseOverwolfPackagesUrl(argv);
  const missingGepMethods = REQUIRED_GEP_METHODS.filter(methodName => typeof gep?.[methodName] !== 'function');
  const overwolfMetadata = typeof resolvedGetOverwolfInfo === 'function' ? resolvedGetOverwolfInfo() : null;

  return {
    runtime: resolvedIsOverwolfRuntime ? 'ow-electron' : 'electron',
    appUid: typeof overwolfMetadata?.appId === 'string' && overwolfMetadata.appId.trim()
      ? overwolfMetadata.appId.trim()
      : null,
    packageFeedUrl,
    usingQaFeed: packageFeedUrl === DEFAULT_OVERWOLF_QA_PACKAGES_URL,
    packagesConfigured,
    gepConfigured: packagesConfigured.includes('gep'),
    gepAvailable: missingGepMethods.length === 0,
    missingGepMethods
  };
}

module.exports = {
  DEFAULT_OVERWOLF_QA_PACKAGES_URL,
  getOverwolfRuntimeState,
  normalizeConfiguredPackages,
  parseOverwolfPackagesUrl
};
