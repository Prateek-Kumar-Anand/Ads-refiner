// src/timetracker.js — Site-time tracker content script
// Tracks how long the user actively spends on each hostname.
// "Active" = tab is visible AND window is focused (no idle time counted).

'use strict';

// FIX #6: Use shared CR shim (crossbrowser.js)
const _rt = CR.runtime;
const HOST = location.hostname || '';

// BUG FIX: This file is loaded as a plain (non-module) content script
// (see manifest.json content_scripts), so a top-level `return;` here is a
// SyntaxError ("Illegal return statement"). A syntax error is caught at
// parse time, before any code runs — so the entire file silently failed to
// execute on every single page, meaning site-time tracking never worked at
// all, on any page. Wrapping the guard-and-init logic in an IIFE makes the
// early exit legal and restores normal execution everywhere else.
if (!HOST || HOST === 'newtab' || location.protocol === 'chrome-extension:') {
  // Nothing to track — exit content script silently
  console.debug('[AdsRefiner] timetracker: skipping non-web page');
} else {
  (function initTimeTracker() {
    let sessionStart = null;   // timestamp when active session began on this page
    let isActive = false;

    // ─── Helpers ────────────────────────────────────────────────────────────

    function startSession() {
      if (!isActive) {
        isActive = true;
        sessionStart = Date.now();
      }
    }

    function endSession() {
      if (isActive && sessionStart !== null) {
        const elapsed = Date.now() - sessionStart;
        if (elapsed > 0) {   // ignore sub-second blips
          _rt.sendMessage({ type: 'RECORD_TIME', host: HOST, ms: elapsed });
        }
        isActive = false;
        sessionStart = null;
      }
    }

    // ─── Visibility / focus detection ───────────────────────────────────────

    function handleVisibility() {
      if (document.hidden) endSession();
      else startSession();
    }

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur',  endSession);
    window.addEventListener('focus', () => { if (!document.hidden) startSession(); });

    // Start immediately if already visible
    if (!document.hidden) startSession();

    // Flush before page unloads
    window.addEventListener('beforeunload', endSession);
    window.addEventListener('pagehide',     endSession);
  })();
}
