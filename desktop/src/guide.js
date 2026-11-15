/**
 * The Guide page: questions new players ask, in sections, with a search box. The questions are in guideModel.js and
 * their texts in translations.js. The page draws itself again whenever the app applies a language.
 */
(function setUpGuide() {
  const list = document.getElementById('guide-list');
  const search = document.getElementById('guide-search');
  const empty = document.getElementById('guide-empty');
  if (!list || !search || !window.guideModel) {
    return;
  }

  // Questions the player opened stay open while the list is drawn again for a search or a language.
  const openTopics = new Set();

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderGuide() {
    const query = search.value;
    const sections = window.guideModel.buildGuide(window.t, query);
    list.replaceChildren(...sections.map((section) => {
      const block = element('section', 'guide-section');
      block.append(element('h3', 'guide-section-title', section.title));
      for (const topic of section.topics) {
        const details = element('details', 'guide-topic');
        details.dataset.topic = topic.id;
        // A search shows its answers at once: the player asked for them.
        details.open = openTopics.has(topic.id) || query.trim() !== '';
        const summary = element('summary', 'guide-question', topic.question);
        // Only the player's own click is remembered, not the answers a search opened. The click comes before the
        // question opens or closes, so the state it finds is the one being left.
        summary.addEventListener('click', () => {
          if (details.open) openTopics.delete(topic.id);
          else openTopics.add(topic.id);
        });
        details.append(summary);
        const answer = element('div', 'guide-answer');
        answer.append(...topic.paragraphs.map((paragraph) => element('p', '', paragraph)));
        details.append(answer);
        block.append(details);
      }
      return block;
    }));
    empty.hidden = sections.length > 0;
  }

  search.addEventListener('input', renderGuide);

  const applyTranslations = window.applyTranslations;
  window.applyTranslations = function applyTranslationsAndGuide() {
    applyTranslations.apply(this, arguments);
    renderGuide();
  };

  renderGuide();
})();
