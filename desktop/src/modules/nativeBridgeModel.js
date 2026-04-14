(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.nativeBridgeModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createNativeBridgeModel() {
  function parseNativeBridgeLine(line) {
    if (typeof line !== 'string' || !line.trim()) {
      return null;
    }

    try {
      const payload = JSON.parse(line);
      return payload && typeof payload === 'object' ? payload : null;
    } catch {
      return null;
    }
  }

  return {
    parseNativeBridgeLine
  };
});
