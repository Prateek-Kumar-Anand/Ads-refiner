// Source: https://github.com/mozilla/readability
(function initMiniReadability(globalScope) {
  class Readability {
    constructor(doc) { this.doc = doc; }
    parse() {
      const clone = this.doc.cloneNode(true);
      const main = clone.querySelector('main, article, [role="main"], .post, .content') || clone.body;
      return {
        title: (clone.querySelector('title')?.textContent || this.doc.title || 'Reader Mode').trim(),
        content: main.innerHTML,
        textContent: main.textContent || ''
      };
    }
  }
  globalScope.Readability = globalScope.Readability || Readability;
})(globalThis);
