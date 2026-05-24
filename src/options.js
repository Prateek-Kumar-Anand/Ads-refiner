// src/options.js — Settings page controller

'use strict';

const api = globalThis.adsRefinerApi;

const KEYS = [
  'enabled', 'blockAds', 'blockTrackers',
  'warnLinks', 'blockRiskyDownloads', 'cosmeticBlocking',
];

const $ = (id) => document.getElementById(id);

async function init() {
  const settings = await api.storage.local.get(KEYS);
  for (const key of KEYS) {
    const el = $(key);
    if (!el) continue;
    // Default everything ON except if explicitly saved as false
    el.checked = settings[key] !== false;
  }
}

async function save() {
  const settings = {};
  for (const key of KEYS) {
    const el = $(key);
    if (el) settings[key] = el.checked;
  }
  await api.storage.local.set(settings);
  await api.runtime.sendMessage({ type: 'SET_SETTINGS', settings }).catch(() => {});
  const msg = $('savedMsg');
  msg.textContent = '✓ Saved successfully.';
  setTimeout(() => { msg.textContent = ''; }, 2000);
}

$('saveBtn').addEventListener('click', save);

// Instant-save each toggle for live feedback
for (const key of KEYS) {
  const el = $(key);
  if (el) {
    el.addEventListener('change', () => {
      api.storage.local.set({ [key]: el.checked });
      api.runtime.sendMessage({ type: 'SET_SETTINGS', settings: { [key]: el.checked } }).catch(() => {});
    });
  }
}

init();
