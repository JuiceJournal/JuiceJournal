const {
  getRequiredFeaturesForVersion,
  normalizeOverwolfInfoHint
} = require('./overwolfGepModel');

function normalizeNativeInfoPayload(input = {}) {
  const hint = normalizeOverwolfInfoHint(input);

  if (!hint) {
    return null;
  }

  const normalized = {
    ...hint,
    source: 'native-info'
  };

  if (normalized.className == null) {
    delete normalized.className;
  }

  return normalized;
}

module.exports = {
  getRequiredFeaturesForVersion,
  normalizeNativeInfoPayload
};
