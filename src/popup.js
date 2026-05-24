// src/popup.js
// BUG FIX #3: openOptionsPage() returns void — using ?? caused BOTH branches to fire,
//             opening options page twice. Fixed with proper if/else.
// BUG FIX #7: Two overlapping click listeners merged into one in content.js (see content.js)

'use strict';

const _rt = (typeof browser !== 'undefined' ? browser : chrome).runtime;
const _st = (typeof browser !== 'undefined' ? browser : chrome).storage.local;
const $ = (id) => document.getElementById(id);

async function init() {
  const [settings, counters, stored] = await Promise.all([
    sendMsg({ type: 'GET_SETTINGS' }),
    sendMsg({ type: 'GET_COUNTERS' }),
    _st.get(['blockedDownloads', 'lastScan']),
  ]);

  $('tgEnabled').checked   = settings?.enabled              !== false;
  $('tgAds').checked       = settings?.blockAds             !== false;
  $('tgTrackers').checked  = settings?.blockTrackers        !== false;
  $('tgLinks').checked     = settings?.warnLinks            !== false;
  $('tgDownloads').checked = settings?.blockRiskyDownloads  !== false;
  $('tgCosmetic').checked  = settings?.cosmeticBlocking     !== false;

  updateStatus(settings?.enabled !== false);

  $('statAds').textContent      = fmt(counters?.adsBlocked      ?? 0);
  $('statTrackers').textContent = fmt(counters?.trackersBlocked ?? 0);
  $('statUrls').textContent     = fmt(counters?.urlsBlocked     ?? 0);

  renderThreats(stored.blockedDownloads || [], stored.lastScan);

  if (new URLSearchParams(location.search).get('scan') === '1') runScan();
}

const TOGGLE_MAP = {
  tgEnabled:   'enabled',
  tgAds:       'blockAds',
  tgTrackers:  'blockTrackers',
  tgLinks:     'warnLinks',
  tgDownloads: 'blockRiskyDownloads',
  tgCosmetic:  'cosmeticBlocking',
};

for (const [id, key] of Object.entries(TOGGLE_MAP)) {
  $(id).addEventListener('change', async () => {
    await sendMsg({ type: 'SET_SETTINGS', settings: { [key]: $(id).checked } });
    if (key === 'enabled') updateStatus($(id).checked);
  });
}

$('scan').addEventListener('click', runScan);

async function runScan() {
  $('scan').disabled = true;
  $('scan').textContent = '⏳ Scanning…';
  const result = await sendMsg({ type: 'RUN_SCAN' });
  const stored = await _st.get('blockedDownloads');
  renderThreats(stored.blockedDownloads || [], result);
  $('scan').disabled = false;
  $('scan').textContent = '🔍 Scan browser now';
}

$('btnWhitelistAdd').addEventListener('click', async () => {
  const val = $('whitelistInput').value.trim();
  if (!val) return;
  const result = await sendMsg({ type: 'WHITELIST_ADD', domain: val });
  flash($('btnWhitelistAdd'), result?.ok ? '✓ Added' : '✗ Invalid');
  if (result?.ok) $('whitelistInput').value = '';
});

$('btnExportJson').addEventListener('click', async () => {
  const json = await sendMsg({ type: 'EXPORT_LOG_JSON' });
  dlText(json, 'ads-refiner-log.json', 'application/json');
});
$('btnExportCsv').addEventListener('click', async () => {
  const csv = await sendMsg({ type: 'EXPORT_LOG_CSV' });
  dlText(csv, 'ads-refiner-log.csv', 'text/csv');
});
$('btnClearLog').addEventListener('click', async () => {
  if (!confirm('Clear all event logs?')) return;
  await sendMsg({ type: 'CLEAR_LOG' });
  flash($('btnClearLog'), '✓ Cleared');
});

$('btnDashboard').addEventListener('click', () => sendMsg({ type: 'OPEN_DASHBOARD' }));

// FIX #3: Was: rt.runtime.openOptionsPage?.() ?? rt.tabs.create(...)
// openOptionsPage() returns void (undefined), so ?? ALWAYS fired the right side too,
// resulting in two tabs opening every time. Now correctly uses if/else.
$('btnOptions').addEventListener('click', () => {
  const rt = typeof browser !== 'undefined' ? browser : chrome;
  if (rt.runtime.openOptionsPage) {
    rt.runtime.openOptionsPage();
  } else {
    rt.tabs.create({ url: _rt.getURL('src/options.html') });
  }
});

function renderThreats(blocked, lastScan) {
  const items = [
    ...blocked.map((t) => ({ ...t, source: t.source || 'Blocked download' })),
    ...(lastScan?.suspiciousDownloads ?? []),
    ...(lastScan?.suspiciousTabs ?? []),
  ];

  const seen = new Set();
  const unique = items.filter((t) => {
    const key = `${t.url}|${t.createdAt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const el = $('threats');
  el.replaceChildren();
  $('threatCount').textContent = unique.length ? `(${unique.length})` : '';

  if (!unique.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = '✅ No suspicious items found.';
    el.append(p);
    return;
  }

  for (const item of unique) el.append(buildCard(item));
}

function buildCard(item) {
  const card = document.createElement('article');
  card.className = 'threat';

  const header = document.createElement('div');
  header.className = 'threat-header';

  const title = document.createElement('h3');
  title.textContent = item.title || item.filename || item.url || 'Suspicious item';

  const badge = document.createElement('span');
  badge.className = `risk-badge risk-${item.level || 'dangerous'}`;
  badge.textContent = item.level || 'blocked';

  header.append(title, badge);

  const src = document.createElement('p');
  src.className = 'source';
  src.textContent = item.source ?? '';

  const ul = document.createElement('ul');
  for (const r of item.reasons?.length ? item.reasons : ['Suspicious behaviour detected.']) {
    const li = document.createElement('li');
    li.textContent = r;
    ul.append(li);
  }

  const acts = document.createElement('div');
  acts.className = 'actions compact';
  acts.style.marginTop = '0.4rem';

  const ign = document.createElement('button');
  ign.className = 'button neutral action-sm';
  ign.textContent = 'Ignore';
  ign.onclick = async () => {
    await sendMsg({ type: 'IGNORE_THREAT', createdAt: item.createdAt });
    card.remove();
  };

  const del = document.createElement('button');
  del.className = 'button danger action-sm';
  del.textContent = 'Delete';
  del.onclick = async () => {
    await sendMsg({ type: 'DELETE_THREAT', threat: item, createdAt: item.createdAt });
    card.remove();
  };

  acts.append(ign, del);
  card.append(header, src, ul, acts);
  return card;
}

function sendMsg(msg) {
  return new Promise((res) => _rt.sendMessage(msg, (r) => res(r ?? null)));
}
function updateStatus(on) {
  $('status').textContent = on
    ? '🟢 Protection active — ads, trackers and threats blocked.'
    : '🔴 Protection is paused.';
}
function fmt(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }
function dlText(content, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
}
function flash(btn, msg) {
  const orig = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = orig; }, 1600);
}

init();
