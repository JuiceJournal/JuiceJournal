const {
  getRequiredFeaturesForVersion,
  normalizeNativeInfoPayload
} = require('./nativeGameInfoProducerModel');
const { createOverwolfGepProducer } = require('./overwolfGepProducer');

function createNativeGameInfoProducer(options = {}) {
  return createOverwolfGepProducer({
    ...options,
    getRequiredFeatures: getRequiredFeaturesForVersion,
    normalizeHint: normalizeNativeInfoPayload
  });
}

module.exports = {
  createNativeGameInfoProducer
};
