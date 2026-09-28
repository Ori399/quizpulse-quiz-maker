(() => {
  const ATTRIBUTES = ['placeholder', 'aria-label', 'title', 'data-label'];
  const PROTECTED_SELECTOR = '.qp-dashboard-logo,.qp-account-chip,[dir="auto"],.qp-stats-profile-link,.qp-stats-contributions li span,.qp-subject-context-main h3,.qp-subject-context-main p,.qp-subject-context-groups';
  const COMMON_STRINGS = {
    'Messages': 'الرسائل',
    'Open messages': 'فتح الرسائل'
  };

  function currentLanguage() {
    return document.documentElement.dataset.language === 'ar' ? 'ar' : 'en';
  }

  function create(options = {}) {
    const strings = { ...COMMON_STRINGS, ...(options.strings || {}) };
    const patterns = [
      { test: /^(\d+) unread messages?$/, replace: match => `${match[1]} رسالة غير مقروءة` },
      ...(Array.isArray(options.patterns) ? options.patterns : [])
    ];
    const originalText = new WeakMap();
    const originalAttributes = new WeakMap();
    const appliedAttributes = new WeakMap();
    let observer = null;
    let applying = false;

    function translateValue(value) {
      const source = String(value || '');
      const direct = strings[source];
      if (direct) return direct;
      for (const pattern of patterns) {
        if (!pattern?.test || typeof pattern.replace !== 'function') continue;
        const match = source.match(pattern.test);
        if (match) return pattern.replace(match, source);
      }
      return source;
    }

    function translateTextNode(node, language) {
      if (!node || node.nodeType !== Node.TEXT_NODE) return;
      const parent = node.parentElement;
      if (!parent || parent.closest(`script,style,[data-i18n-skip],${PROTECTED_SELECTOR}`)) return;
      if (!originalText.has(node)) originalText.set(node, node.nodeValue || '');
      const source = originalText.get(node) || '';
      const trimmed = source.trim();
      if (!trimmed) return;
      const translated = language === 'ar' ? translateValue(trimmed) : trimmed;
      const prefix = source.match(/^\s*/)?.[0] || '';
      const suffix = source.match(/\s*$/)?.[0] || '';
      const next = `${prefix}${translated}${suffix}`;
      if (node.nodeValue !== next) node.nodeValue = next;
    }

    function translateAttributes(element, language) {
      if (!(element instanceof Element) || element.closest(`[data-i18n-skip],${PROTECTED_SELECTOR}`)) return;
      let originals = originalAttributes.get(element);
      let applied = appliedAttributes.get(element);
      if (!originals) {
        originals = {};
        originalAttributes.set(element, originals);
      }
      if (!applied) {
        applied = {};
        appliedAttributes.set(element, applied);
      }
      ATTRIBUTES.forEach(attribute => {
        if (!element.hasAttribute(attribute)) return;
        if (!(attribute in originals)) originals[attribute] = element.getAttribute(attribute) || '';
        const source = originals[attribute];
        const next = language === 'ar' ? translateValue(source) : source;
        applied[attribute] = next;
        if (element.getAttribute(attribute) !== next) element.setAttribute(attribute, next);
      });
    }

    function apply(root = document) {
      if (applying) return;
      applying = true;
      const language = currentLanguage();
      if (options.title) document.title = language === 'ar' ? options.title.ar : options.title.en;
      if (root.nodeType === Node.TEXT_NODE) translateTextNode(root, language);
      if (root instanceof Element) translateAttributes(root, language);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let node = walker.nextNode();
      while (node) {
        if (node.nodeType === Node.TEXT_NODE) translateTextNode(node, language);
        else translateAttributes(node, language);
        node = walker.nextNode();
      }
      document.body?.classList.toggle('qp-page-language-ar', language === 'ar');
      applying = false;
    }

    function start() {
      apply(document);
      observer = new MutationObserver(records => {
        if (applying) return;
        records.forEach(record => {
          if (record.type === 'attributes') {
            const element = record.target;
            const attribute = record.attributeName;
            const value = element.getAttribute(attribute) || '';
            if (appliedAttributes.get(element)?.[attribute] === value) return;
            const originals = originalAttributes.get(element) || {};
            originals[attribute] = value;
            originalAttributes.set(element, originals);
            apply(element);
            return;
          }
          record.addedNodes.forEach(node => apply(node));
        });
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ATTRIBUTES
      });
      document.addEventListener('quizpulse:language-changed', () => apply(document));
      // Page controllers populate metrics and accessible labels just after startup.
      // Reapply without delaying first paint so those late values follow the saved language.
      window.setTimeout(() => apply(document), 0);
      window.setTimeout(() => apply(document), 250);
      window.setTimeout(() => apply(document), 800);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
    return { apply, stop: () => observer?.disconnect() };
  }

  window.QuizPulsePageI18n = { create };
})();
