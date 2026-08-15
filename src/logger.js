// src/logger.js — Structured event logger with JSON/CSV export
// BUG FIX #11: CSV header row was unquoted while data rows were quoted — now consistent.
// BUG FIX: logEvent/incrementCounter now serialized via storage-queue.js —
// see that file for why unserialized writes silently dropped ad/tracker
// block counts and log entries under normal, frequent usage.

import { enqueueStorageWrite } from './storage-queue.js';

const LOG_KEY = 'eventLog';
const MAX_LOG_ENTRIES = 500;

export async function logEvent(type, details = {}) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    timestamp: new Date().toISOString(),
    ...details
  };
  return enqueueStorageWrite('eventLog', async () => {
    const { [LOG_KEY]: log = [] } = await chrome.storage.local.get(LOG_KEY);
    log.unshift(entry);
    await chrome.storage.local.set({ [LOG_KEY]: log.slice(0, MAX_LOG_ENTRIES) });
    return entry;
  });
}

export async function getLog(filter = {}) {
  const { [LOG_KEY]: log = [] } = await chrome.storage.local.get(LOG_KEY);
  let result = log;
  if (filter.type) result = result.filter((e) => e.type === filter.type);
  if (filter.since) result = result.filter((e) => e.timestamp >= filter.since);
  return result;
}

export async function clearLog() {
  await chrome.storage.local.set({ [LOG_KEY]: [] });
  return { ok: true };
}

export async function exportAsJson() {
  return JSON.stringify(await getLog(), null, 2);
}

export async function exportAsCsv() {
  const log = await getLog();
  if (!log.length) return 'No data';
  const allKeys = [...new Set(log.flatMap(Object.keys))];
  // FIX #11: Header row now quoted (was unquoted before, mismatched data rows)
  const header = allKeys.map((k) => `"${k}"`).join(',');
  const rows = log.map((entry) =>
    allKeys.map((k) => {
      const v = entry[k] ?? '';
      const s = Array.isArray(v) ? v.join('; ') : String(v);
      return `"${csvFormulaGuard(s).replace(/"/g, '""')}"`;
    }).join(',')
  );
  return [header, ...rows].join('\n');
}

// SECURITY FIX: CSV/formula injection (CWE-1236). Logged fields like a
// download's suggested filename come from the page the user visited, so a
// crafted `download="=cmd|'/c calc'!A0.exe"` attribute could land here. If a
// cell opens with =, +, -, @, tab, or CR, Excel/Sheets may treat it as a
// formula. Prefixing with a leading apostrophe forces text interpretation
// without changing the visible value.
function csvFormulaGuard(s) {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export async function incrementCounter(name) {
  return enqueueStorageWrite('counters', async () => {
    const { counters = {} } = await chrome.storage.local.get('counters');
    counters[name] = (counters[name] ?? 0) + 1;
    await chrome.storage.local.set({ counters });
    return counters[name];
  });
}

export async function getCounters() {
  const { counters = {} } = await chrome.storage.local.get('counters');
  return counters;
}
