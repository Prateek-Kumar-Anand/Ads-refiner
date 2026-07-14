// src/reputation.js — Domain trust/reputation scoring
// BUG FIX #12: Eviction sort now operates on a copy of the keys array (was mutating in-place).
// BUG FIX: updateReputation now serialized via storage-queue.js — it's called
// on every navigation AND every flagged URL, so concurrent calls (e.g. two
// tabs navigating at once) used to race and drop each other's updates.

import { enqueueStorageWrite } from './storage-queue.js';

const REP_KEY = 'domainReputation';
const MAX_DOMAINS = 1000;

export async function getReputation(domain) {
  const { [REP_KEY]: rep = {} } = await chrome.storage.local.get(REP_KEY);
  return rep[domain] ?? null;
}

export async function updateReputation(domain, event) {
  return enqueueStorageWrite('domainReputation', async () => {
    const { [REP_KEY]: rep = {} } = await chrome.storage.local.get(REP_KEY);

    if (!rep[domain]) {
      rep[domain] = {
        domain,
        firstSeen: new Date().toISOString(),
        visits: 0,
        flagged: false,
        flagCount: 0,
        score: 50,
        lastUpdated: new Date().toISOString()
      };
    }

    const entry = rep[domain];
    entry.lastUpdated = new Date().toISOString();

    switch (event.type) {
      case 'visit':
        entry.visits++;
        entry.score = Math.min(100, entry.score + Math.max(0, (5 - entry.flagCount) * 0.5));
        break;
      case 'flagged':
        entry.flagged = true;
        entry.flagCount++;
        entry.score = Math.max(0, entry.score - 20 * Math.min(entry.flagCount, 3));
        entry.lastReason = event.reason ?? 'Suspicious activity detected.';
        break;
      case 'whitelisted':
        entry.score = 100;
        entry.flagged = false;
        break;
      case 'breach':
        entry.score = Math.max(0, entry.score - 10);
        entry.hasKnownBreach = true;
        entry.breachCount = (entry.breachCount ?? 0) + 1;
        break;
    }

    // FIX #12: Sort a COPY of the keys array to avoid mutating the array being iterated
    const allKeys = Object.keys(rep);
    if (allKeys.length > MAX_DOMAINS) {
      const sorted = [...allKeys].sort((a, b) =>
        (rep[a]?.lastUpdated ?? '') < (rep[b]?.lastUpdated ?? '') ? -1 : 1
      );
      const toDelete = sorted.slice(0, allKeys.length - MAX_DOMAINS);
      for (const k of toDelete) delete rep[k];
    }

    await chrome.storage.local.set({ [REP_KEY]: rep });
    return entry;
  });
}

export async function getAllReputation() {
  const { [REP_KEY]: rep = {} } = await chrome.storage.local.get(REP_KEY);
  return rep;
}

export function trustLabel(score) {
  if (score >= 80) return { label: 'Trusted',   color: '#047857' };
  if (score >= 50) return { label: 'Neutral',   color: '#b45309' };
  if (score >= 25) return { label: 'Suspicious',color: '#c2410c' };
  return             { label: 'Dangerous',  color: '#7f1d1d' };
}
