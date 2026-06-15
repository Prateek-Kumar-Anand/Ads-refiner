// src/crossbrowser.js — Shared extension API shim
// Chrome-only build: exposes the chrome.* API as `globalThis.CR` so every
// script/page can write `CR.runtime`, `CR.storage`, etc. without repeating
// `chrome` everywhere. Load this before any other extension script in all
// HTML pages. background.js (ES module) uses `chrome` directly.

(function () {
  'use strict';

  globalThis.CR = chrome;
})();

