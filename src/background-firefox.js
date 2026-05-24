// src/background-firefox.js — Firefox MV2 Background Script
// BUG FIXES applied:
//  #1  moz-extension:// URLs skipped in nav listener (extension pages no longer flagged)
//  #2  Context menu only opens warning for non-safe links
//  #4  CHECK_BREACH and GET_REPUTATION handlers added (were completely missing)
//  #5  CHECK_URL now returns reputation data (trust score now works on Firefox)
//  #6  contextMenus.removeAll() before create
//  #10 trackersBlocked counter now correctly incremented

'use strict';

const api      = globalThis.adsRefinerApi;
const safety   = globalThis.adsRefinerSafety;
const whitelist = globalThis.adsRefinerWhitelist;

const { getUrlRisk, isDangerousDownload, isLikelyAdUrl } = safety;

const NOTIFICATION_ID = 'ads-refiner-threat';
const LAST_ALERT_KEY  = 'lastThreatAlert';
const WARNING_PAGE    = api.runtime.getURL('src/warning.html');
const DASHBOARD_PAGE  = api.runtime.getURL('src/dashboard.html');
const EXT_ORIGIN      = api.runtime.getURL('').replace(/\/$/, ''); // moz-extension://[id]

const DEFAULT_SETTINGS = {
  enabled: true,
  blockAds: true,
  blockTrackers: true,
  warnLinks: true,
  blockRiskyDownloads: true,
  cosmeticBlocking: true,
  blockedDownloads: [],
  lastScan: null
};

let runtimeSettings = { ...DEFAULT_SETTINGS };

// ─── Startup ──────────────────────────────────────────────────────────────────

api.runtime.onInstalled.addListener(async () => {
  const existing = await api.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const merged = { ...DEFAULT_SETTINGS };
  for (const [k, v] of Object.entries(existing)) {
    if (v !== undefined) merged[k] = v;
  }
  await api.storage.local.set(merged);
  runtimeSettings = merged;

  // FIX #6: Remove all context menus before creating to avoid duplicate ID error on update
  if (api.raw.contextMenus) {
    api.raw.contextMenus.removeAll(() => {
      api.raw.contextMenus.create({
        id: 'checkLinkRisk',
        title: 'Check this link with Ads Refiner',
        contexts: ['link']
      });
    });
  }
});

loadSettings();

api.raw.storage?.onChanged?.addListener((changes, area) => {
  if (area !== 'local') return;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (changes[key]) runtimeSettings[key] = changes[key].newValue;
  }
});

// ─── Context Menu ─────────────────────────────────────────────────────────────

if (api.raw.contextMenus?.onClicked) {
  api.raw.contextMenus.onClicked.addListener(async (info) => {
    if (info.menuItemId !== 'checkLinkRisk' || !info.linkUrl) return;
    const wl = whitelist ? await whitelist.loadWhitelist() : new Set();
    const risk = getUrlRisk(info.linkUrl, { whitelist: wl });

    // FIX #2: Only open warning for non-safe URLs
    if (risk.level === 'safe') {
      await api.notifications.create('ar-safe-link', {
        type: 'basic',
        iconUrl: api.runtime.getURL('src/icon.svg'),
        title: 'Ads Refiner — Link looks safe',
        message: `No threats detected for: ${info.linkUrl.slice(0, 80)}`,
        priority: 0
      });
      return;
    }
    const warningUrl = buildWarningUrl(info.linkUrl, risk);
    await api.tabs.create({ url: warningUrl.href });
  });
}

// ─── Ad/Tracker blocking via webRequest ───────────────────────────────────────

const AD_HOSTS = [
  /(?:^|\.)doubleclick\.net$/, /(?:^|\.)googlesyndication\.com$/,
  /(?:^|\.)adnxs\.com$/, /(?:^|\.)rubiconproject\.com$/,
  /(?:^|\.)pubmatic\.com$/, /(?:^|\.)openx\.net$/, /(?:^|\.)criteo\.com$/,
  /(?:^|\.)taboola\.com$/, /(?:^|\.)outbrain\.com$/,
];
const TRACKER_HOSTS = [
  /(?:^|\.)google-analytics\.com$/, /(?:^|\.)googletagmanager\.com$/,
  /(?:^|\.)hotjar\.com$/, /(?:^|\.)mixpanel\.com$/, /(?:^|\.)segment\.io$/,
  /(?:^|\.)facebook\.net$/, /(?:^|\.)facebook\.com\/tr/,
  /(?:^|\.)clarity\.ms$/, /(?:^|\.)amplitude\.com$/,
];

api.webRequest.onBeforeRequest?.addListener(
  (details) => {
    if (!runtimeSettings.enabled) return {};
    try {
      const h = new URL(details.url).hostname.toLowerCase();
      if (runtimeSettings.blockAds && AD_HOSTS.some((p) => p.test(h))) {
        logEvent('ad_blocked', { url: details.url });
        incrementCounter('adsBlocked');    // FIX #10: correct counter for ads
        return { cancel: true };
      }
      if (runtimeSettings.blockTrackers && TRACKER_HOSTS.some((p) => p.test(h))) {
        logEvent('tracker_blocked', { url: details.url });
        incrementCounter('trackersBlocked'); // FIX #10: separate tracker counter
        return { cancel: true };
      }
    } catch { /* ignore */ }
    return {};
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);

// ─── Navigation Listener ──────────────────────────────────────────────────────

api.webNavigation.onBeforeNavigate?.addListener(async (details) => {
  if (details.frameId !== 0) return;
  // FIX #1: Skip all extension pages (moz-extension://)
  if (details.url.startsWith(EXT_ORIGIN)) return;
  if (details.url.startsWith('about:')) return;
  if (details.url.startsWith(WARNING_PAGE)) return;

  const { enabled, warnLinks } = runtimeSettings;
  if (!enabled || !warnLinks) return;

  const allowed = await consumeAllowedUrl(details.url);
  if (allowed) return;

  const wl = whitelist ? await whitelist.loadWhitelist() : new Set();
  const risk = getUrlRisk(details.url, { whitelist: wl });
  if (risk.whitelisted || risk.level === 'safe') return;

  await logEvent('url_blocked', { url: details.url, level: risk.level, reasons: risk.reasons });
  await incrementCounter('urlsBlocked');

  const warningUrl = buildWarningUrl(details.url, risk);
  await api.tabs.update(details.tabId, { url: warningUrl.href });
});

// ─── Download Listener ────────────────────────────────────────────────────────

api.downloads.onCreated?.addListener(async (item) => { await handleDownload(item); });
api.downloads.onChanged?.addListener(async (delta) => {
  if (!delta.filename?.current) return;
  const [item] = await api.downloads.search({ id: delta.id });
  if (item) await handleDownload(item);
});

async function handleDownload(item) {
  const { enabled, blockRiskyDownloads } = runtimeSettings;
  if (!enabled || !blockRiskyDownloads) return;
  const risk = isDangerousDownload(item);
  if (!risk.dangerous) return;
  await api.downloads.cancel(item.id);
  const threat = {
    id: item.id,
    url: item.finalUrl || item.url,
    filename: item.filename || 'unknown',
    reasons: risk.reasons,
    createdAt: new Date().toISOString(),
    source: 'Blocked download'
  };
  await recordThreat(threat);
  await logEvent('download_blocked', { url: threat.url, filename: threat.filename, reasons: threat.reasons });
  await incrementCounter('downloadsBlocked');
  await showThreatNotification(`Blocked dangerous download: ${threat.filename}`);
}

// ─── Notifications ────────────────────────────────────────────────────────────

api.notifications.onClicked?.addListener(async (id) => {
  if (id !== NOTIFICATION_ID) return;
  await api.tabs.create({ url: api.runtime.getURL('src/popup.html?scan=1') });
  await api.notifications.clear(id);
});

// ─── Messages ─────────────────────────────────────────────────────────────────

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const p = handleMessage(msg);
  if (globalThis.browser) return p; // Firefox: return Promise
  p.then(sendResponse).catch((e) => sendResponse({ ok: false, error: e.message }));
  return true;
});

async function handleMessage(msg) {
  switch (msg?.type) {
    // FIX #5: CHECK_URL now includes reputation data (was missing in Firefox)
    case 'CHECK_URL': {
      const wl = whitelist ? await whitelist.loadWhitelist() : new Set();
      const risk = getUrlRisk(msg.url, { whitelist: wl });
      const rep = await getReputationData(new URL(msg.url).hostname).catch(() => null);
      return { ...risk, reputation: rep };
    }
    case 'ALLOW_URL':        return allowUrl(msg.url);
    case 'RUN_SCAN':         return runBrowserSafetyCheck();
    case 'IGNORE_THREAT':    return ignoreThreat(msg.createdAt);
    case 'DELETE_THREAT':    return deleteThreat(msg.createdAt, msg.threat);
    case 'SET_SETTINGS':     return saveSettings(msg.settings || {});
    case 'GET_SETTINGS':     return api.storage.local.get(Object.keys(DEFAULT_SETTINGS));
    case 'WHITELIST_ADD':    return whitelist ? whitelist.addToWhitelist(msg.domain) : { ok: false };
    case 'WHITELIST_REMOVE': return whitelist ? whitelist.removeFromWhitelist(msg.domain) : { ok: false };
    case 'WHITELIST_GET':    return whitelist ? whitelist.getWhitelist() : [];
    case 'GET_LOG':          return getLogData(msg.filter);
    case 'EXPORT_LOG_JSON':  return exportJson();
    case 'EXPORT_LOG_CSV':   return exportCsv();
    case 'GET_COUNTERS':     return getCountersData();
    // FIX #4: GET_REPUTATION and CHECK_BREACH were completely missing from Firefox
    case 'GET_REPUTATION':   return getAllReputationData();
    case 'CHECK_BREACH':     return checkDomainBreachFF(msg.domain);
    case 'OPEN_DASHBOARD':
      await api.tabs.create({ url: DASHBOARD_PAGE });
      return { ok: true };
    default:
      return { ok: false, error: 'Unknown message type.' };
  }
}

// ─── Session URL Allow ────────────────────────────────────────────────────────

async function allowUrl(url) {
  const { allowedUrls = {} } = await api.storage.session.get('allowedUrls');
  allowedUrls[url] = Date.now() + 5 * 60 * 1000;
  await api.storage.session.set({ allowedUrls });
  return { ok: true };
}

async function consumeAllowedUrl(url) {
  const { allowedUrls = {} } = await api.storage.session.get('allowedUrls');
  const exp = allowedUrls[url];
  if (!exp) return false;
  delete allowedUrls[url];
  await api.storage.session.set({ allowedUrls });
  return exp > Date.now();
}

// ─── Threats ──────────────────────────────────────────────────────────────────

async function recordThreat(threat) {
  const { blockedDownloads = [] } = await api.storage.local.get('blockedDownloads');
  const deduped = blockedDownloads.filter((t) => !(t.id === threat.id && t.url === threat.url));
  deduped.unshift(threat);
  await api.storage.local.set({
    [LAST_ALERT_KEY]: threat,
    blockedDownloads: deduped.slice(0, 100)
  });
}

async function showThreatNotification(message = 'A threat was detected and blocked.') {
  await api.notifications.create(NOTIFICATION_ID, {
    type: 'basic',
    iconUrl: api.runtime.getURL('src/icon.svg'),
    title: 'Ads Refiner — Threat Blocked',
    message,
    priority: 2
  });
}

async function ignoreThreat(createdAt) {
  if (!createdAt) return { ok: true };
  const { blockedDownloads = [] } = await api.storage.local.get('blockedDownloads');
  await api.storage.local.set({
    blockedDownloads: blockedDownloads.filter((t) => t.createdAt !== createdAt)
  });
  return { ok: true };
}

async function deleteThreat(createdAt, suppliedThreat) {
  const { blockedDownloads = [] } = await api.storage.local.get('blockedDownloads');
  const threat = blockedDownloads.find((t) => t.createdAt === createdAt) ?? suppliedThreat;
  if (threat?.source === 'Open tab' && threat.tabId) await api.tabs.remove(threat.tabId);
  else if (threat?.id) {
    await api.downloads.removeFile(threat.id);
    await api.downloads.erase({ id: threat.id });
  }
  return ignoreThreat(createdAt);
}

// ─── Safety Scan ──────────────────────────────────────────────────────────────

async function runBrowserSafetyCheck() {
  const wl = whitelist ? await whitelist.loadWhitelist() : new Set();
  const [downloads = [], tabs = []] = await Promise.all([
    api.downloads.search({ limit: 50, orderBy: ['-startTime'] }),
    api.tabs.query({})
  ]);

  const suspiciousDownloads = downloads
    .map((item) => ({ item, risk: isDangerousDownload(item) }))
    .filter(({ risk }) => risk.dangerous)
    .map(({ item, risk }) => ({
      id: item.id, filename: item.filename || 'unknown', url: item.finalUrl || item.url,
      reasons: risk.reasons, createdAt: item.startTime || new Date().toISOString(),
      state: item.state, source: 'Recent download'
    }));

  const suspiciousTabs = tabs
    .map((tab) => ({ tab, risk: tab.url ? getUrlRisk(tab.url, { whitelist: wl }) : { level: 'safe', score: 0, reasons: [] } }))
    .filter(({ risk }) => risk.level !== 'safe' && !risk.whitelisted)
    .map(({ tab, risk }) => ({
      id: tab.id, title: tab.title || tab.url, url: tab.url,
      reasons: risk.reasons, level: risk.level, score: risk.score, source: 'Open tab'
    }));

  const lastScan = { scannedAt: new Date().toISOString(), suspiciousDownloads, suspiciousTabs };
  await api.storage.local.set({ lastScan });
  return lastScan;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function loadSettings() {
  const stored = await api.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  runtimeSettings = { ...DEFAULT_SETTINGS };
  for (const [k, v] of Object.entries(stored)) {
    if (v !== undefined) runtimeSettings[k] = v;
  }
}

async function saveSettings(settings) {
  const allowed = new Set(Object.keys(DEFAULT_SETTINGS));
  const safe = Object.fromEntries(
    Object.entries(settings).filter(([k, v]) => allowed.has(k) && v !== undefined)
  );
  runtimeSettings = { ...runtimeSettings, ...safe };
  await api.storage.local.set(safe);
  return { ok: true };
}

// ─── Logger (inline for Firefox) ─────────────────────────────────────────────

const LOG_KEY = 'eventLog';

async function logEvent(type, details) {
  const entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, type, timestamp: new Date().toISOString(), ...details };
  const { [LOG_KEY]: log = [] } = await api.storage.local.get(LOG_KEY);
  log.unshift(entry);
  await api.storage.local.set({ [LOG_KEY]: log.slice(0, 500) });
}

async function getLogData(filter) {
  const { [LOG_KEY]: log = [] } = await api.storage.local.get(LOG_KEY);
  return filter?.type ? log.filter((e) => e.type === filter.type) : log;
}

async function exportJson() {
  return JSON.stringify(await getLogData(), null, 2);
}

async function exportCsv() {
  const log = await getLogData();
  if (!log.length) return 'No data';
  const keys = [...new Set(log.flatMap(Object.keys))];
  // FIX #11: Header row is now also quoted for consistency
  const header = keys.map((k) => `"${k}"`).join(',');
  const rows = log.map((e) => keys.map((k) => `"${String(Array.isArray(e[k]) ? e[k].join('; ') : (e[k] ?? '')).replace(/"/g,'""')}"`).join(','));
  return [header, ...rows].join('\n');
}

async function incrementCounter(name) {
  const { counters = {} } = await api.storage.local.get('counters');
  counters[name] = (counters[name] ?? 0) + 1;
  await api.storage.local.set({ counters });
}

async function getCountersData() {
  const { counters = {} } = await api.storage.local.get('counters');
  return counters;
}

// ─── Reputation (inline for Firefox) ─────────────────────────────────────────

const REP_KEY = 'domainReputation';

async function getReputationData(domain) {
  const { [REP_KEY]: rep = {} } = await api.storage.local.get(REP_KEY);
  return rep[domain] ?? null;
}

async function getAllReputationData() {
  const { [REP_KEY]: rep = {} } = await api.storage.local.get(REP_KEY);
  return rep;
}

// ─── HIBP (inline for Firefox) ───────────────────────────────────────────────

const HIBP_CACHE_FF = new Map();

async function checkDomainBreachFF(domain) {
  if (!domain) return [];
  if (HIBP_CACHE_FF.has(domain)) return HIBP_CACHE_FF.get(domain);
  try {
    const res = await fetch(
      `https://haveibeenpwned.com/api/v3/breaches?domain=${encodeURIComponent(domain)}`
    );
    if (!res.ok) return [];
    const breaches = await res.json();
    const result = breaches.slice(0, 5).map((b) => ({
      Name: b.Name, BreachDate: b.BreachDate, DataClasses: b.DataClasses?.slice(0, 4) ?? []
    }));
    HIBP_CACHE_FF.set(domain, result);
    return result;
  } catch { return []; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildWarningUrl(target, risk) {
  const u = new URL(WARNING_PAGE);
  u.searchParams.set('target', target);
  u.searchParams.set('level', risk.level);
  u.searchParams.set('score', String(risk.score ?? 0));
  u.searchParams.set('reasons', JSON.stringify(risk.reasons));
  return u;
}
