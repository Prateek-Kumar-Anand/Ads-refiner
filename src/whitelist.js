// src/whitelist.js — Domain whitelist management (ES module for Chrome)

import { enqueueStorageWrite } from './storage-queue.js';

const STORAGE_KEY = 'domainWhitelist';

/** Load whitelist from storage and return as a Set. */
export async function loadWhitelist() {
  const { [STORAGE_KEY]: list = [] } = await chrome.storage.local.get(STORAGE_KEY);
  return new Set(list.map((d) => d.toLowerCase().trim()).filter(Boolean));
}

/** Add a domain to the whitelist. */
export async function addToWhitelist(domain) {
  const clean = normalizeDomain(domain);
  if (!clean) return { ok: false, error: 'Invalid domain.' };
  return enqueueStorageWrite('domainWhitelist', async () => {
    const { [STORAGE_KEY]: list = [] } = await chrome.storage.local.get(STORAGE_KEY);
    if (!list.includes(clean)) {
      list.push(clean);
      await chrome.storage.local.set({ [STORAGE_KEY]: list });
    }
    return { ok: true, domain: clean };
  });
}

/** Remove a domain from the whitelist. */
export async function removeFromWhitelist(domain) {
  const clean = normalizeDomain(domain);
  return enqueueStorageWrite('domainWhitelist', async () => {
    const { [STORAGE_KEY]: list = [] } = await chrome.storage.local.get(STORAGE_KEY);
    const updated = list.filter((d) => d !== clean);
    await chrome.storage.local.set({ [STORAGE_KEY]: updated });
    return { ok: true };
  });
}

/** Return all whitelisted domains as an array. */
export async function getWhitelist() {
  const { [STORAGE_KEY]: list = [] } = await chrome.storage.local.get(STORAGE_KEY);
  return list;
}

function normalizeDomain(input = '') {
  try {
    const raw = input.trim().toLowerCase().replace(/^https?:\/\//i, '').split('/')[0];
    new URL('https://' + raw); // validates
    return raw;
  } catch {
    return null;
  }
}
