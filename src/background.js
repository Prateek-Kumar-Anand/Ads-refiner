// src/background.js — Chrome MV3 Service Worker
// BUG FIXES applied:
//  #1  Extension own-page URLs (chrome-extension://) now skipped in nav listener
//  #2  Context menu only opens warning page for non-safe URLs
//  #6  contextMenus.removeAll() called before create to prevent duplicate-ID error on update
//  #9  Unused imports (isLikelyAdUrl, trustLabel) removed

import {
  getUrlRisk, isDangerousDownload,
  checkDomainBreach
} from './safety.js';
import { loadWhitelist, addToWhitelist, removeFromWhitelist, getWhitelist } from './whitelist.js';
import { logEvent, getLog, clearLog, exportAsJson, exportAsCsv, incrementCounter, getCounters } from './logger.js';
import { getReputation, updateReputation, getAllReputation } from './reputation.js';

// ─── Constants ─────────────────────────────────────────────────────────────────
const WARNING_PAGE   = chrome.runtime.getURL('src/warning.html');
const DASHBOARD_PAGE = chrome.runtime.getURL('src/dashboard.html');
const NOTIFICATION_ID = 'ads-refiner-threat';
const LAST_ALERT_KEY  = 'lastThreatAlert';
const SESSION_START_KEY = 'sessionStartMs';

// BUG FIX: `const SESSION_START_MS = Date.now()` was reset every time the MV3
// service worker restarted (every ~30s of inactivity), so "Session" in the
// System tab almost always showed a few seconds, not the real browser-session
// length. chrome.storage.session persists across SW restarts but is cleared
// when the browser fully closes, so it's a good proxy for "this Chrome session".
async function getSessionStartMs() {
  const { [SESSION_START_KEY]: start } = await chrome.storage.session.get(SESSION_START_KEY);
  if (start) return start;
  const now = Date.now();
  await chrome.storage.session.set({ [SESSION_START_KEY]: now });
  return now;
}

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

// ─── Startup ──────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  const existing = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const merged = { ...DEFAULT_SETTINGS };
  for (const [k, v] of Object.entries(existing)) {
    if (v !== undefined) merged[k] = v;
  }
  await chrome.storage.local.set(merged);

  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options.html') });
  }

  // FIX #6: Remove existing menu items first to prevent "duplicate id" error on extension update
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'checkLinkRisk',
    title: 'Check this link with Ads Refiner',
    contexts: ['link']
  });
});

// ─── Navigation Listener ──────────────────────────────────────────────────────

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // FIX #1: Skip sub-frames, the warning page itself, AND all extension pages
  if (details.frameId !== 0) return;
  if (details.url.startsWith('chrome-extension://')) return;  // <-- CRITICAL FIX
  if (details.url.startsWith('chrome://')) return;
  if (details.url.startsWith('about:')) return;
  if (details.url.startsWith(WARNING_PAGE)) return;

  const { enabled, warnLinks } = await chrome.storage.local.get(['enabled', 'warnLinks']);
  if (!enabled || !warnLinks) return;

  const allowed = await consumeAllowedUrl(details.url);
  if (allowed) return;

  const whitelist = await loadWhitelist();
  const risk = getUrlRisk(details.url, { whitelist });
  if (risk.whitelisted || risk.level === 'safe') return;

  const urlObj = new URL(details.url);
  await updateReputation(urlObj.hostname, { type: 'flagged', reason: risk.reasons[0] });
  await logEvent('url_blocked', { url: details.url, level: risk.level, reasons: risk.reasons });
  await incrementCounter('urlsBlocked');

  const warningUrl = buildWarningUrl(details.url, risk);
  await chrome.tabs.update(details.tabId, { url: warningUrl });
});

// Record reputation for all completed navigations
chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  try {
    const url = new URL(details.url);
    if (['http:', 'https:'].includes(url.protocol)) {
      await updateReputation(url.hostname, { type: 'visit' });
    }
  } catch { /* ignore */ }
});

// ─── Ad/Tracker block history (Chrome declarativeNetRequest) ────────────────
// BUG FIX: Chrome's MV3 declarativeNetRequest blocks ad/tracker requests
// entirely at the network layer, so unlike background-firefox.js (which uses
// the old blocking webRequest API and explicitly calls logEvent/incrementCounter
// for 'ad_blocked'/'tracker_blocked'), this file had NO code path that ever
// recorded an ad/tracker block. Counters stayed at 0 forever and the dashboard
// "block history" log never showed any ad_blocked/tracker_blocked entries,
// even though ads/trackers were in fact being blocked.
// onRuleMatchedDebug reports every DNR match (ruleset id + matched request)
// and is available for extensions loaded unpacked/in developer mode — which
// matches this extension's documented install method.
const RULESET_TO_EVENT = {
  ads_refiner_rules: { type: 'ad_blocked', counter: 'adsBlocked' },
  trackers_refiner_rules: { type: 'tracker_blocked', counter: 'trackersBlocked' }
};

if (chrome.declarativeNetRequest.onRuleMatchedDebug) {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
    const mapping = RULESET_TO_EVENT[info.rule?.rulesetId];
    if (!mapping) return;
    await logEvent(mapping.type, { url: info.request?.url, tabId: info.request?.tabId });
    await incrementCounter(mapping.counter);
  });
} else {
  // Feedback API unavailable (e.g. extension installed from the Web Store,
  // where onRuleMatchedDebug is disabled by Chrome) — block history for
  // ads/trackers won't populate, but blocking itself still works fine.
  console.debug('[AdsRefiner] onRuleMatchedDebug unavailable — ad/tracker block history disabled.');
}

// ─── Download Listener ────────────────────────────────────────────────────────

chrome.downloads.onCreated.addListener(async (item) => {
  await handleDownload(item);
});

chrome.downloads.onChanged.addListener(async (delta) => {
  if (!delta.filename?.current) return;
  const [item] = await chrome.downloads.search({ id: delta.id });
  if (item) await handleDownload(item);
});

async function handleDownload(item) {
  const { enabled, blockRiskyDownloads } = await chrome.storage.local.get(['enabled', 'blockRiskyDownloads']);
  if (!enabled || !blockRiskyDownloads) return;

  const risk = isDangerousDownload(item);
  if (!risk.dangerous) return;

  await chrome.downloads.cancel(item.id).catch(() => {});
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
  await showThreatNotification(`Blocked dangerous download: ${threat.filename || 'unknown file'}`);
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'checkLinkRisk' || !info.linkUrl) return;
  const whitelist = await loadWhitelist();
  const risk = getUrlRisk(info.linkUrl, { whitelist });

  // FIX #2: Only open warning page for non-safe URLs
  if (risk.level === 'safe') {
    await chrome.notifications.create('ar-safe-link', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('src/icons/icon128.png'),
      title: 'Ads Refiner — Link looks safe',
      message: `No threats detected for: ${info.linkUrl.slice(0, 80)}`,
      priority: 0
    });
    return;
  }

  const warningUrl = buildWarningUrl(info.linkUrl, risk);
  chrome.tabs.create({ url: warningUrl });
});

// ─── Notification Handler ─────────────────────────────────────────────────────

chrome.notifications.onClicked.addListener(async (id) => {
  if (id !== NOTIFICATION_ID) return;
  await chrome.tabs.create({ url: chrome.runtime.getURL('src/popup.html?scan=1') });
  await chrome.notifications.clear(id);
});

// ─── Message Handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // FIX #7: Guard against SW being killed mid-message (MV3 service worker lifecycle)
  handleMessage(message)
    .then((result) => {
      try { sendResponse(result); } catch (_) { /* port closed — SW was recycled */ }
    })
    .catch((err) => {
      try { sendResponse({ ok: false, error: err.message }); } catch (_) {}
    });
  return true;  // keep message channel open for async response
});

async function handleMessage(msg) {
  switch (msg?.type) {
    case 'CHECK_URL': {
      const whitelist = await loadWhitelist();
      const risk = getUrlRisk(msg.url, { whitelist });
      const rep = await getReputation(new URL(msg.url).hostname).catch(() => null);
      return { ...risk, reputation: rep };
    }
    case 'ALLOW_URL':        return allowUrl(msg.url);
    case 'RUN_SCAN':         return runBrowserSafetyCheck();
    case 'IGNORE_THREAT':    return ignoreThreat(msg.createdAt);
    case 'DELETE_THREAT':    return deleteThreat(msg.createdAt, msg.threat);
    case 'GET_SETTINGS':     return chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
    case 'SET_SETTINGS':     return saveSettings(msg.settings || {});
    case 'WHITELIST_ADD':    return addToWhitelist(msg.domain);
    case 'WHITELIST_REMOVE': return removeFromWhitelist(msg.domain);
    case 'WHITELIST_GET':    return getWhitelist();
    case 'GET_LOG':          return getLog(msg.filter);
    case 'CLEAR_LOG':        return clearLog();
    case 'EXPORT_LOG_JSON':  return exportAsJson();
    case 'EXPORT_LOG_CSV':   return exportAsCsv();
    case 'GET_COUNTERS':     return getCounters();
    case 'GET_REPUTATION':   return getAllReputation();
    case 'CHECK_BREACH':     return checkDomainBreach(msg.domain);
    case 'OPEN_DASHBOARD':
      await chrome.tabs.create({ url: DASHBOARD_PAGE });
      return { ok: true };
    case 'RECORD_TIME':     return recordSiteTime(msg.host, msg.ms);
    case 'GET_SITE_TIME'    :   return getSiteTime();
    case 'CLEAR_SITE_TIME': return clearSiteTime();
    case 'GET_SESSION_MS':  return { ms: Date.now() - await getSessionStartMs() };
    default:
      return { ok: false, error: 'Unknown message type.' };
  }
}

// ─── URL Allow List (session) ─────────────────────────────────────────────────

async function allowUrl(url) {
  const { allowedUrls = {} } = await chrome.storage.session.get('allowedUrls');
  allowedUrls[url] = Date.now() + 5 * 60 * 1000;
  await chrome.storage.session.set({ allowedUrls });
  return { ok: true };
}

async function consumeAllowedUrl(url) {
  const { allowedUrls = {} } = await chrome.storage.session.get('allowedUrls');
  const exp = allowedUrls[url];
  if (!exp) return false;
  delete allowedUrls[url];
  await chrome.storage.session.set({ allowedUrls });
  return exp > Date.now();
}

// ─── Threat Management ────────────────────────────────────────────────────────

async function recordThreat(threat) {
  const { blockedDownloads = [] } = await chrome.storage.local.get('blockedDownloads');
  const deduped = blockedDownloads.filter((t) => !(t.id === threat.id && t.url === threat.url));
  deduped.unshift(threat);
  await chrome.storage.local.set({
    [LAST_ALERT_KEY]: threat,
    blockedDownloads: deduped.slice(0, 100)
  });
}

async function showThreatNotification(message = 'A potential threat was detected.') {
  await chrome.notifications.create(NOTIFICATION_ID, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('src/icons/icon128.png'),
    title: 'Ads Refiner — Threat Blocked',
    message,
    priority: 2
  });
}

async function ignoreThreat(createdAt) {
  if (!createdAt) return { ok: true };
  const { blockedDownloads = [] } = await chrome.storage.local.get('blockedDownloads');
  await chrome.storage.local.set({
    blockedDownloads: blockedDownloads.filter((t) => t.createdAt !== createdAt)
  });
  return { ok: true };
}

async function deleteThreat(createdAt, suppliedThreat) {
  const { blockedDownloads = [] } = await chrome.storage.local.get('blockedDownloads');
  const threat = blockedDownloads.find((t) => t.createdAt === createdAt) ?? suppliedThreat;
  if (threat?.source === 'Open tab' && threat.tabId) {
    await chrome.tabs.remove(threat.tabId).catch(() => {});
  } else if (threat?.id) {
    await chrome.downloads.removeFile(threat.id).catch(() => {});
    await chrome.downloads.erase({ id: threat.id }).catch(() => {});
  }
  return ignoreThreat(createdAt);
}

// ─── Safety Scan ──────────────────────────────────────────────────────────────

async function runBrowserSafetyCheck() {
  const whitelist = await loadWhitelist();
  const [downloads = [], tabs = []] = await Promise.all([
    chrome.downloads.search({ limit: 50, orderBy: ['-startTime'] }),
    chrome.tabs.query({})
  ]);

  const suspiciousDownloads = downloads
    .map((item) => ({ item, risk: isDangerousDownload(item) }))
    .filter(({ risk }) => risk.dangerous)
    .map(({ item, risk }) => ({
      id: item.id,
      filename: item.filename || 'unknown file',
      url: item.finalUrl || item.url,
      reasons: risk.reasons,
      createdAt: item.startTime || new Date().toISOString(),
      state: item.state,
      source: 'Recent download'
    }));

  const suspiciousTabs = tabs
    .map((tab) => ({
      tab,
      risk: tab.url ? getUrlRisk(tab.url, { whitelist }) : { level: 'safe', score: 0, reasons: [] }
    }))
    .filter(({ risk }) => risk.level !== 'safe' && !risk.whitelisted)
    .map(({ tab, risk }) => ({
      id: tab.id,
      title: tab.title || tab.url,
      url: tab.url,
      reasons: risk.reasons,
      level: risk.level,
      score: risk.score,
      source: 'Open tab'
    }));

  const lastScan = {
    scannedAt: new Date().toISOString(),
    suspiciousDownloads,
    suspiciousTabs
  };

  await chrome.storage.local.set({ lastScan });
  return lastScan;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function saveSettings(settings) {
  const allowed = new Set(Object.keys(DEFAULT_SETTINGS));
  const safe = Object.fromEntries(
    Object.entries(settings).filter(([k, v]) => allowed.has(k) && v !== undefined)
  );
  await chrome.storage.local.set(safe);
  await syncRulesets(safe);
  return { ok: true };
}

async function syncRulesets(settings) {
  const { blockAds, blockTrackers, enabled } = {
    ...(await chrome.storage.local.get(['blockAds', 'blockTrackers', 'enabled'])),
    ...settings
  };

  const enableIds = [];
  const disableIds = [];

  if (enabled && blockAds) enableIds.push('ads_refiner_rules');
  else disableIds.push('ads_refiner_rules');

  if (enabled && blockTrackers) enableIds.push('trackers_refiner_rules');
  else disableIds.push('trackers_refiner_rules');

  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: enableIds,
    disableRulesetIds: disableIds
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildWarningUrl(target, risk) {
  const u = new URL(WARNING_PAGE);
  u.searchParams.set('target', target);
  u.searchParams.set('level', risk.level);
  u.searchParams.set('score', String(risk.score ?? 0));
  u.searchParams.set('reasons', JSON.stringify(risk.reasons));
  return u.href;
}

// FIX #7: Wrap top-level SW init in a try/catch — any uncaught module error
// silently kills the entire MV3 service worker with no visible failure.
async function initServiceWorker() {
  try {
    await syncRulesets({});
  } catch (err) {
    console.error('[AdsRefiner] Service worker init failed:', err);
  }
}

// FIX #7: Use self.addEventListener('activate') to ensure SW is fully installed
// before running init — avoids race on first install where storage is empty.
self.addEventListener('activate', () => {
  initServiceWorker();
});

// Also run immediately for already-active SW (extension update scenario)
initServiceWorker();

// ─── Site Time Tracking ───────────────────────────────────────────────────────

const SITE_TIME_KEY = 'siteTime';

// BUG FIX: Serialise all recordSiteTime writes with a promise chain.
// Without this, two rapid RECORD_TIME messages (blur + pagehide firing together)
// both read the same stale storage value and the second write silently drops the first.
let _siteTimeWriteChain = Promise.resolve();

function recordSiteTime(host, ms) {
  // Validate before queuing
  if (!host || !ms || ms <= 0) return Promise.resolve({ ok: false });

  // Chain onto the previous write — reads always see the latest committed data
  _siteTimeWriteChain = _siteTimeWriteChain.then(() => _doRecordSiteTime(host, ms));
  return _siteTimeWriteChain;
}

async function _doRecordSiteTime(host, ms) {
  const today = new Date().toISOString().slice(0, 10);
  const { [SITE_TIME_KEY]: data = {} } = await chrome.storage.local.get(SITE_TIME_KEY);

  if (!data[host]) data[host] = { total: 0, days: {} };
  data[host].total += ms;
  data[host].days[today] = (data[host].days[today] ?? 0) + ms;

  // Keep only last 90 days per host to avoid unbounded growth
  const days = data[host].days;
  const dayKeys = Object.keys(days).sort();
  if (dayKeys.length > 90) {
    for (const old of dayKeys.slice(0, dayKeys.length - 90)) delete days[old];
  }

  await chrome.storage.local.set({ [SITE_TIME_KEY]: data });
  return { ok: true };
}

async function getSiteTime() {
  // Wait for any pending write to finish before reading
  await _siteTimeWriteChain;
  const { [SITE_TIME_KEY]: data = {} } = await chrome.storage.local.get(SITE_TIME_KEY);
  return data;
}

async function clearSiteTime() {
  await _siteTimeWriteChain;
  await chrome.storage.local.set({ [SITE_TIME_KEY]: {} });
  return { ok: true };
}
