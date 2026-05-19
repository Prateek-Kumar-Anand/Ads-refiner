import './browser-api.js';
import { getUrlRisk, isDangerousDownload, isLikelyAdUrl } from './safety.js';

const api = globalThis.adsRefinerApi;
const LAST_ALERT_KEY = 'lastThreatAlert';
const WARNING_PAGE = api.runtime.getURL('src/warning.html');
const NOTIFICATION_ID = 'ads-refiner-threat-alert';
const DEFAULT_SETTINGS = {
  enabled: true,
  blockAds: true,
  blockTrackers: true,
  popupKiller: true,
  readerMode: true,
  sponsorBlock: true,
  warnLinks: true,
  blockRiskyDownloads: true,
  blockedDownloads: [],
  lastScan: null
};

let runtimeSettings = { ...DEFAULT_SETTINGS };

api.runtime.onInstalled.addListener(async () => {
  const existing = await api.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  await saveSettings({ ...DEFAULT_SETTINGS, ...removeUndefined(existing) });
});

loadSettings();
api.raw.storage?.onChanged?.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }

  const nextSettings = {};
  for (const key of ['enabled', 'blockAds', 'blockTrackers', 'popupKiller', 'readerMode', 'sponsorBlock', 'warnLinks', 'blockRiskyDownloads']) {
    if (changes[key]) {
      nextSettings[key] = changes[key].newValue;
    }
  }

  if (Object.keys(nextSettings).length) {
    runtimeSettings = { ...runtimeSettings, ...nextSettings };
    updateAdRuleset().catch(() => undefined);
  }
});

api.webNavigation.onBeforeNavigate?.addListener(async (details) => {
  if (details.frameId !== 0 || details.url.startsWith(WARNING_PAGE)) {
    return;
  }

  const { enabled = true, warnLinks = true } = await api.storage.local.get(['enabled', 'warnLinks']);
  if (!enabled || !warnLinks) {
    return;
  }

  const allowed = await consumeAllowedUrl(details.url);
  if (allowed) {
    return;
  }

  const risk = getUrlRisk(details.url);
  if (risk.level === 'safe') {
    return;
  }

  const warningUrl = createWarningUrl(details.url, risk);
  await api.tabs.update(details.tabId, { url: warningUrl.href });
});

api.webRequest.onBeforeRequest?.addListener(
  (details) => {
    if (!runtimeSettings.enabled || !runtimeSettings.blockAds || !details.url || !isLikelyAdUrl(details.url)) {
      return {};
    }

    return { cancel: true };
  },
  { urls: ['<all_urls>'] },
  ['blocking']
);

api.downloads.onCreated?.addListener(async (downloadItem) => {
  const { enabled = true, blockRiskyDownloads = true } = await api.storage.local.get(['enabled', 'blockRiskyDownloads']);
  if (!enabled || !blockRiskyDownloads) {
    return;
  }

  const risk = isDangerousDownload(downloadItem);
  if (!risk.dangerous) {
    return;
  }

  await stopAndRecordDownload(downloadItem, risk.reasons);
});

api.downloads.onChanged?.addListener(async (downloadDelta) => {
  if (!downloadDelta.filename?.current) {
    return;
  }

  const { enabled = true, blockRiskyDownloads = true } = await api.storage.local.get(['enabled', 'blockRiskyDownloads']);
  if (!enabled || !blockRiskyDownloads) {
    return;
  }

  const [downloadItem] = await api.downloads.search({ id: downloadDelta.id });
  if (!downloadItem) {
    return;
  }

  const risk = isDangerousDownload(downloadItem);
  if (risk.dangerous) {
    await stopAndRecordDownload(downloadItem, risk.reasons);
  }
});

api.notifications.onClicked?.addListener(async (notificationId) => {
  if (notificationId !== NOTIFICATION_ID) {
    return;
  }

  await runBrowserSafetyCheck();
  await api.tabs.create({ url: api.runtime.getURL('src/popup.html?scan=1') });
  await api.notifications.clear(notificationId);
});

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const response = handleMessage(message);

  if (globalThis.browser) {
    return response;
  }

  response.then(sendResponse).catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function handleMessage(message) {
  if (message?.type === 'CHECK_URL') {
    return getUrlRisk(message.url);
  }

  if (message?.type === 'ALLOW_URL') {
    return allowUrl(message.url);
  }

  if (message?.type === 'SET_SETTINGS') {
    return saveSettings(message.settings || {});
  }

  if (message?.type === 'RUN_SCAN') {
    return runBrowserSafetyCheck();
  }

  if (message?.type === 'IGNORE_THREAT') {
    return ignoreThreat(message.createdAt);
  }

  if (message?.type === 'DELETE_THREAT') {
    return deleteThreat(message.createdAt, message.threat);
  }

  return { ok: false, error: 'Unknown message type.' };
}

async function allowUrl(url) {
  const { allowedUrls = {} } = await api.storage.session.get('allowedUrls');
  allowedUrls[url] = Date.now() + 2 * 60 * 1000;
  await api.storage.session.set({ allowedUrls });
  return { ok: true };
}

async function consumeAllowedUrl(url) {
  const { allowedUrls = {} } = await api.storage.session.get('allowedUrls');
  const expiresAt = allowedUrls[url];
  if (!expiresAt) {
    return false;
  }

  delete allowedUrls[url];
  await api.storage.session.set({ allowedUrls });
  return expiresAt > Date.now();
}

async function stopAndRecordDownload(downloadItem, reasons) {
  await api.downloads.cancel(downloadItem.id);
  await recordThreat({
    id: downloadItem.id,
    url: downloadItem.finalUrl || downloadItem.url,
    filename: downloadItem.filename || 'unknown file',
    reasons,
    createdAt: new Date().toISOString(),
    source: 'Blocked download'
  });

  await showThreatNotification();
}

async function recordThreat(threat) {
  const { blockedDownloads = [] } = await api.storage.local.get('blockedDownloads');
  const withoutDuplicate = blockedDownloads.filter((item) => item.id !== threat.id || item.url !== threat.url);
  withoutDuplicate.unshift(threat);
  await api.storage.local.set({
    [LAST_ALERT_KEY]: threat,
    blockedDownloads: withoutDuplicate.slice(0, 50)
  });
}

async function showThreatNotification() {
  await api.notifications.create(NOTIFICATION_ID, {
    type: 'basic',
    iconUrl: api.runtime.getURL('src/icon.png'),
    title: 'Ads Refiner warning',
    message: 'suspicious virus and trojan might be in the system',
    priority: 2
  });
}

async function runBrowserSafetyCheck() {
  const [downloads = [], tabs = []] = await Promise.all([
    api.downloads.search({ limit: 50, orderBy: ['-startTime'] }),
    api.tabs.query({})
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
    .map((tab) => ({ tab, risk: tab.url ? getUrlRisk(tab.url) : { level: 'safe', reasons: [] } }))
    .filter(({ risk }) => risk.level !== 'safe')
    .map(({ tab, risk }) => ({
      id: tab.id,
      title: tab.title || tab.url,
      url: tab.url,
      reasons: risk.reasons,
      level: risk.level,
      source: 'Open tab'
    }));

  const lastScan = {
    scannedAt: new Date().toISOString(),
    suspiciousDownloads,
    suspiciousTabs
  };

  await api.storage.local.set({ lastScan });
  return lastScan;
}

async function ignoreThreat(createdAt) {
  if (!createdAt) {
    return { ok: true };
  }

  const { blockedDownloads = [] } = await api.storage.local.get('blockedDownloads');
  const updated = blockedDownloads.filter((threat) => threat.createdAt !== createdAt);
  await api.storage.local.set({ blockedDownloads: updated });
  return { ok: true };
}

async function deleteThreat(createdAt, suppliedThreat) {
  const { blockedDownloads = [] } = await api.storage.local.get('blockedDownloads');
  const threat = blockedDownloads.find((item) => item.createdAt === createdAt) || suppliedThreat;

  if (threat?.source === 'Open tab' && threat.tabId) {
    await api.tabs.remove(threat.tabId);
  }

  if (threat?.id && threat?.source !== 'Open tab') {
    await api.downloads.removeFile(threat.id);
    await api.downloads.erase({ id: threat.id });
  }

  return ignoreThreat(createdAt);
}

function createWarningUrl(target, risk) {
  const warningUrl = new URL(WARNING_PAGE);
  warningUrl.searchParams.set('target', target);
  warningUrl.searchParams.set('level', risk.level);
  warningUrl.searchParams.set('reasons', JSON.stringify(risk.reasons));
  return warningUrl;
}

async function loadSettings() {
  const storedSettings = await api.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  runtimeSettings = { ...DEFAULT_SETTINGS, ...removeUndefined(storedSettings) };
  await updateAdRuleset();
  return runtimeSettings;
}

async function saveSettings(settings) {
  const safeSettings = pickSettings(settings);
  runtimeSettings = { ...runtimeSettings, ...safeSettings };
  await api.storage.local.set(safeSettings);
  await updateAdRuleset();
  return { ok: true, settings: runtimeSettings };
}

async function updateAdRuleset() {
  const dnr = api.raw.declarativeNetRequest;
  if (!dnr?.updateEnabledRulesets) {
    return;
  }

  const shouldEnableAds = runtimeSettings.enabled && runtimeSettings.blockAds;
  const shouldEnableTrackers = runtimeSettings.enabled && runtimeSettings.blockTrackers;
  const update = {
    enableRulesetIds: [
      ...(shouldEnableAds ? ['ads_refiner_rules'] : []),
      ...(shouldEnableTrackers ? ['tracker_rules'] : [])
    ],
    disableRulesetIds: [
      ...(!shouldEnableAds ? ['ads_refiner_rules'] : []),
      ...(!shouldEnableTrackers ? ['tracker_rules'] : [])
    ]
  };

  if (globalThis.browser) {
    await dnr.updateEnabledRulesets(update);
    return;
  }

  await new Promise((resolve, reject) => {
    dnr.updateEnabledRulesets(update, () => {
      const error = api.raw.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}

function pickSettings(settings = {}) {
  return Object.fromEntries(
    Object.entries(settings).filter(([key, value]) => Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key) && value !== undefined)
  );
}

function removeUndefined(values = {}) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined));
}
