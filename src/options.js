// src/options.js — Settings page controller
// BUG FIX: Was using globalThis.adsRefinerApi which browser-api.js sets (Firefox only).
// On Chrome, adsRefinerApi is undefined → all storage/runtime calls silently fail.
// Fix: use CR (set by crossbrowser.js, loaded before this script in options.html).

'use strict';

const KEYS = [
  'enabled', 'blockAds', 'blockTrackers',
  'warnLinks', 'blockRiskyDownloads', 'cosmeticBlocking',
];

const $ = (id) => document.getElementById(id);

async function init() {
  const settings = await CR.storage.local.get(KEYS);
  for (const key of KEYS) {
    const el = $(key);
    if (!el) continue;
    el.checked = settings[key] !== false;
  }
}

async function save() {
  const settings = {};
  for (const key of KEYS) {
    const el = $(key);
    if (el) settings[key] = el.checked;
  }
  await CR.storage.local.set(settings);
  // Notify background to sync rulesets
  CR.runtime.sendMessage({ type: 'SET_SETTINGS', settings }).catch(() => {});
  const msg = $('savedMsg');
  if (msg) {
    msg.textContent = '✓ Saved.';
    setTimeout(() => { msg.textContent = ''; }, 2000);
  }
}

$('saveBtn').addEventListener('click', save);

// Live-save each toggle immediately
for (const key of KEYS) {
  const el = $(key);
  if (el) {
    el.addEventListener('change', () => {
      CR.storage.local.set({ [key]: el.checked });
      CR.runtime.sendMessage({ type: 'SET_SETTINGS', settings: { [key]: el.checked } }).catch(() => {});
    });
  }
}

init();
