// src/timetracker.js — Site-time tracker content script
// Tracks how long the user actively spends on each hostname.
// "Active" = tab is visible AND window is focused (no idle time counted).

'use strict';

// FIX #6: Use shared CR shim (crossbrowser.js)
const _rt = CR.runtime;
const HOST = location.hostname || '';

// BUG FIX: Skip tracking on extension pages, blank tabs, and non-web origins.
// location.hostname is '' on chrome-extension://, about:blank, file://, etc.
if (!HOST || HOST === 'newtab' || location.protocol === 'chrome-extension:') {
  // Nothing to track — exit content script silently
  throw new Error('[AdsRefiner] timetracker: skipping non-web page');
}

let sessionStart = null;   // timestamp when active session began on this page
let isActive = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Visibility / focus detection ─────────────────────────────────────────────

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
