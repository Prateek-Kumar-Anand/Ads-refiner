const api = globalThis.adsRefinerApi;
const enabled = document.getElementById('enabled');
const status = document.getElementById('status');
const threats = document.getElementById('threats');
const scan = document.getElementById('scan');
const blockAds = document.getElementById('blockAds');
const warnLinks = document.getElementById('warnLinks');
const blockRiskyDownloads = document.getElementById('blockRiskyDownloads');

init();

async function init() {
  const data = await api.storage.local.get(['enabled', 'blockAds', 'warnLinks', 'blockRiskyDownloads', 'blockedDownloads', 'lastScan']);
  enabled.checked = data.enabled !== false;
  blockAds.checked = data.blockAds !== false;
  warnLinks.checked = data.warnLinks !== false;
  blockRiskyDownloads.checked = data.blockRiskyDownloads !== false;
  renderStatus();
  renderThreats(data.blockedDownloads || [], data.lastScan);

  if (new URLSearchParams(location.search).get('scan') === '1') {
    await runScan();
  }
}

[enabled, blockAds, warnLinks, blockRiskyDownloads].forEach((input) => {
  input.addEventListener('change', saveSettings);
});

async function saveSettings() {
  const settings = {
    enabled: enabled.checked,
    blockAds: blockAds.checked,
    warnLinks: warnLinks.checked,
    blockRiskyDownloads: blockRiskyDownloads.checked
  };
  await api.storage.local.set(settings);
  await api.runtime.sendMessage({ type: 'SET_SETTINGS', settings });
  renderStatus();
}

scan.addEventListener('click', runScan);

async function runScan() {
  scan.disabled = true;
  scan.textContent = 'Checking...';
  const result = await api.runtime.sendMessage({ type: 'RUN_SCAN' });
  const data = await api.storage.local.get('blockedDownloads');
  renderThreats(data.blockedDownloads || [], result);
  scan.disabled = false;
  scan.textContent = 'Check browser safety';
}

function renderStatus() {
  if (!enabled.checked) {
    status.textContent = 'Protection is paused.';
    return;
  }

  const activeModules = [
    blockAds.checked && 'ad blocking',
    warnLinks.checked && 'suspicious-link warnings',
    blockRiskyDownloads.checked && 'risky-download blocking'
  ].filter(Boolean);

  status.textContent = activeModules.length
    ? `${activeModules.join(', ')} are on.`
    : 'Protection is enabled, but every module is turned off.';
}

function renderThreats(blockedDownloads, lastScan) {
  const scanDownloads = lastScan?.suspiciousDownloads || [];
  const scanTabs = lastScan?.suspiciousTabs || [];
  threats.replaceChildren();

  const items = [
    ...blockedDownloads.map((item) => ({ ...item, source: 'Blocked download' })),
    ...scanDownloads.map((item) => ({ ...item, source: 'Recent download' })),
    ...scanTabs.map((item) => ({ ...item, source: 'Open tab', title: item.title, tabId: item.id }))
  ];

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No suspicious browser items found.';
    threats.append(empty);
    return;
  }

  for (const item of items) {
    threats.append(createThreatCard(item));
  }
}

function createThreatCard(item) {
  const card = document.createElement('article');
  card.className = 'threat';

  const title = document.createElement('h3');
  title.textContent = item.title || item.filename || item.url || 'Suspicious item';

  const source = document.createElement('p');
  source.className = 'source';
  source.textContent = item.source;

  const reasonList = document.createElement('ul');
  for (const reason of item.reasons || ['Suspicious behavior detected.']) {
    const li = document.createElement('li');
    li.textContent = reason;
    reasonList.append(li);
  }

  const actions = document.createElement('div');
  actions.className = 'actions compact';

  const ignore = document.createElement('button');
  ignore.className = 'button neutral';
  ignore.textContent = 'Ignore it';
  ignore.addEventListener('click', async () => {
    await api.runtime.sendMessage({ type: 'IGNORE_THREAT', createdAt: item.createdAt });
    card.remove();
  });

  const remove = document.createElement('button');
  remove.className = 'button danger';
  remove.textContent = 'Solve it by deleting';
  remove.addEventListener('click', async () => {
    await api.runtime.sendMessage({ type: 'DELETE_THREAT', threat: item, createdAt: item.createdAt });
    card.remove();
  });

  actions.append(ignore, remove);
  card.append(title, source, reasonList, actions);
  return card;
}
