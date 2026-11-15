(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
    return;
  }

  root.guideModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function createGuideModel() {
  // The Guide page: sections of questions. The text is in translations.js as guide.section.<section>, guide.<topic>.q and
  // guide.<topic>.a, where an answer's paragraphs are separated by a bar (|).
  const GUIDE_SECTIONS = [
    { id: 'start', topics: ['firstMap', 'manualMap', 'character'] },
    { id: 'loot', topics: ['inventory', 'unread', 'lowProfit', 'poe1', 'tiers'] },
    { id: 'farm', topics: ['customFarm', 'entryCost', 'compare'] },
    { id: 'overlay', topics: ['overlayOn', 'startCard', 'overlayKeyboard'] },
    { id: 'data', topics: ['dataFolder', 'privacy', 'updates'] },
    { id: 'help', topics: ['hotkeys', 'language', 'reportBug'] }
  ];

  function normalize(text) {
    return String(text || '').toLocaleLowerCase('en').trim();
  }

  // The sections with their texts, narrowed to the topics that hold every word of the search. A word may be in the
  // question, the answer or the section's title.
  function buildGuide(translate, query = '') {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    return GUIDE_SECTIONS.map((section) => {
      const title = translate(`guide.section.${section.id}`);
      const topics = section.topics.map((id) => ({
        id,
        question: translate(`guide.${id}.q`),
        paragraphs: String(translate(`guide.${id}.a`)).split('|').filter(Boolean)
      })).filter((topic) => {
        const text = normalize([title, topic.question, ...topic.paragraphs].join(' '));
        return words.every((word) => text.includes(word));
      });
      return { id: section.id, title, topics };
    }).filter((section) => section.topics.length > 0);
  }

  return {
    GUIDE_SECTIONS,
    buildGuide
  };
});
