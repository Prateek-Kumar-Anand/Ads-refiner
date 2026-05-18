import { getUrlRisk, isDangerousDownload } from './safety.js';

const LAST_ALERT_KEY = 'lastThreatAlert';
const WARNING_PAGE = chrome.runtime.getURL('src/warning.html');
const NOTIFICATION_ID = 'ads-refiner-threat-alert';

chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    enabled: true,
    blockedDownloads: [],
    lastScan: null
  });
});

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0 || details.url.startsWith(WARNING_PAGE)) {
    return;
  }

  const { enabled = true } = await chrome.storage.local.get('enabled');
  if (!enabled) {
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

  const warningUrl = new URL(WARNING_PAGE);
  warningUrl.searchParams.set('target', details.url);
  warningUrl.searchParams.set('level', risk.level);
  warningUrl.searchParams.set('reasons', JSON.stringify(risk.reasons));
  await chrome.tabs.update(details.tabId, { url: warningUrl.href });
});

chrome.downloads.onCreated.addListener(async (downloadItem) => {
  const { enabled = true } = await chrome.storage.local.get('enabled');
  if (!enabled) {
    return;
  }

  const risk = isDangerousDownload(downloadItem);
  if (!risk.dangerous) {
    return;
  }

  await chrome.downloads.cancel(downloadItem.id).catch(() => undefined);
  await recordThreat({
    id: downloadItem.id,
    url: downloadItem.finalUrl || downloadItem.url,
    filename: downloadItem.filename || 'unknown file',
    reasons: risk.reasons,
    createdAt: new Date().toISOString()
  });

  await showThreatNotification();
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId !== NOTIFICATION_ID) {
    return;
  }

  await runBrowserSafetyCheck();
  await chrome.tabs.create({ url: chrome.runtime.getURL('src/popup.html?scan=1') });
  await chrome.notifications.clear(notificationId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'CHECK_URL') {
    sendResponse(getUrlRisk(message.url));
    return true;
  }

  if (message?.type === 'ALLOW_URL') {
    allowUrl(message.url).then(sendResponse);
    return true;
  }

  if (message?.type === 'RUN_SCAN') {
    runBrowserSafetyCheck().then(sendResponse);
    return true;
  }

  if (message?.type === 'IGNORE_THREAT') {
    ignoreThreat(message.createdAt).then(sendResponse);
    return true;
  }

  if (message?.type === 'DELETE_THREAT') {
    deleteThreat(message.createdAt, message.threat).then(sendResponse);
    return true;
  }

  return false;
});

async function allowUrl(url) {
  const { allowedUrls = {} } = await chrome.storage.session.get('allowedUrls');
  allowedUrls[url] = Date.now() + 2 * 60 * 1000;
  await chrome.storage.session.set({ allowedUrls });
  return { ok: true };
}

async function consumeAllowedUrl(url) {
  const { allowedUrls = {} } = await chrome.storage.session.get('allowedUrls');
  const expiresAt = allowedUrls[url];
  if (!expiresAt) {
    return false;
  }

  delete allowedUrls[url];
  await chrome.storage.session.set({ allowedUrls });
  return expiresAt > Date.now();
}

async function recordThreat(threat) {
  const { blockedDownloads = [] } = await chrome.storage.local.get('blockedDownloads');
  blockedDownloads.unshift(threat);
  await chrome.storage.local.set({
    [LAST_ALERT_KEY]: threat,
    blockedDownloads: blockedDownloads.slice(0, 50)
  });
}

async function showThreatNotification() {
  await chrome.notifications.create(NOTIFICATION_ID, {
    type: 'basic',
    iconUrl: 'src/icon.svg',
    title: 'Ads Refiner warning',
    message: 'suspecious virus and torjan might be in the system',
    priority: 2
  });
}

async function runBrowserSafetyCheck() {
  const [downloads, tabs] = await Promise.all([
    chrome.downloads.search({ limit: 25, orderBy: ['-startTime'] }),
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
      state: item.state
    }));

  const suspiciousTabs = tabs
    .map((tab) => ({ tab, risk: tab.url ? getUrlRisk(tab.url) : { level: 'safe', reasons: [] } }))
    .filter(({ risk }) => risk.level !== 'safe')
    .map(({ tab, risk }) => ({
      id: tab.id,
      title: tab.title || tab.url,
      url: tab.url,
      reasons: risk.reasons,
      level: risk.level
    }));

  const lastScan = {
    scannedAt: new Date().toISOString(),
    suspiciousDownloads,
    suspiciousTabs
  };

  await chrome.storage.local.set({ lastScan });
  return lastScan;
}

async function ignoreThreat(createdAt) {
  const { blockedDownloads = [] } = await chrome.storage.local.get('blockedDownloads');
  const updated = blockedDownloads.filter((threat) => threat.createdAt !== createdAt);
  await chrome.storage.local.set({ blockedDownloads: updated });
  return { ok: true };
}

async function deleteThreat(createdAt, suppliedThreat) {
  const { blockedDownloads = [] } = await chrome.storage.local.get('blockedDownloads');
  const threat = blockedDownloads.find((item) => item.createdAt === createdAt) || suppliedThreat;

  if (threat?.source === 'Open tab' && threat.tabId) {
    await chrome.tabs.remove(threat.tabId).catch(() => undefined);
  }

  if (threat?.id && threat?.source !== 'Open tab') {
    await chrome.downloads.removeFile(threat.id).catch(() => undefined);
    await chrome.downloads.erase({ id: threat.id }).catch(() => undefined);
  }

  return ignoreThreat(createdAt);
}
