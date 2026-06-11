// src/crossbrowser.js — Shared cross-browser API shim
// FIX #6: Replaces the repeated `(typeof browser !== 'undefined' ? browser : chrome)`
// ternary scattered across every file. Load this before any other extension script
// in all HTML pages. background.js (ES module) imports directly from browser-api.js.

(function () {
  'use strict';

  // Unified API root — works in Chrome (MV3) and Firefox (MV2)
  const _cr = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;

  // Expose globally so all scripts can use window.CR instead of repeating the ternary
  globalThis.CR = _cr;
})();
