(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.mapResultStoreModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createMapResultStoreModel() {
  function appendMapResult(existingResults = [], nextResult, { maxResults = 100 } = {}) {
    return [nextResult, ...existingResults]
      .filter(Boolean)
      .filter((entry, index, list) => {
        if (!entry?.id) {
          return true;
        }

        return index === list.findIndex((candidate) => candidate?.id === entry.id);
      })
      .slice(0, maxResults);
  }

  function filterMapResults(results = [], { farmType = '' } = {}) {
    if (!farmType) {
      return results;
    }

    return results.filter((result) => result?.farmType === farmType);
  }

  return {
    appendMapResult,
    filterMapResults
  };
});
