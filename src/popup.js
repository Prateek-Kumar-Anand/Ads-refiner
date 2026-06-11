// src/popup.js — Popup controller
// Fixes: #3 openOptionsPage void return, tab switching, system panel, safe DOM

'use strict';

// FIX #6: Use shared CR shim (crossbrowser.js)
const _rt = CR.runtime;
const _cr = CR;  // FIX #6: CR defined in crossbrowser.js
const _st = _cr.storage.local;
const $   = (id) => document.getElementById(id);

// ─── Init ─────────────────────────────────────────────────────────────────────

// FIX #3: Guards toggle events from firing before init() has set checkbox state
let _initialized = false;

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

  // FIX #3: Signal that init is complete so toggle handlers are safe to fire
  _initialized = true;
}

// ─── Toggles ──────────────────────────────────────────────────────────────────

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
    // FIX #3: Ignore change events that fire before init() has set checkbox state
    if (!_initialized) return;
    await sendMsg({ type: 'SET_SETTINGS', settings: { [key]: $(id).checked } });
    if (key === 'enabled') updateStatus($(id).checked);
  });
}

// ─── Scan ─────────────────────────────────────────────────────────────────────

$('scan').addEventListener('click', runScan);

async function runScan() {
  $('scan').disabled = true;
  $('scan').textContent = '\u29d7 Scanning\u2026';
  const result = await sendMsg({ type: 'RUN_SCAN' });
  const stored = await _st.get('blockedDownloads');
  renderThreats(stored.blockedDownloads || [], result);
  $('scan').disabled = false;
  $('scan').textContent = '\uD83D\uDD0D Scan browser now';
}

// ─── Whitelist quick-add ──────────────────────────────────────────────────────

$('btnWhitelistAdd').addEventListener('click', async () => {
  const val = $('whitelistInput').value.trim();
  if (!val) return;
  const result = await sendMsg({ type: 'WHITELIST_ADD', domain: val });
  flash($('btnWhitelistAdd'), result?.ok ? '\u2713 Added' : '\u2717 Invalid');
  if (result?.ok) $('whitelistInput').value = '';
});

// ─── Export / log ─────────────────────────────────────────────────────────────

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
  flash($('btnClearLog'), '\u2713 Cleared');
});

// ─── Header buttons ───────────────────────────────────────────────────────────

$('btnDashboard').addEventListener('click', () => sendMsg({ type: 'OPEN_DASHBOARD' }));

// FIX #3: openOptionsPage returns void — original code used ?? which always fired BOTH branches
$('btnOptions').addEventListener('click', () => {
  if (_cr.runtime.openOptionsPage) {
    _cr.runtime.openOptionsPage();
  } else {
    _cr.tabs.create({ url: _rt.getURL('src/options.html') });
  }
});

// ─── Tab switching ────────────────────────────────────────────────────────────

const TAB_MAIN   = $('tabMain');
const TAB_SYS    = $('tabSys');
const PANEL_MAIN = $('mainPanel');
const PANEL_SYS  = $('sysPanel');

// BUG FIX: Set explicit initial display so interval check is reliable from frame 1
// Without this, PANEL_SYS.style.display === '' (unset) and the interval fires immediately
PANEL_SYS.style.display  = 'none';
PANEL_MAIN.style.display = '';

function switchTab(showMain) {
  // FIX #2: Unified tab state — one function controls both tabs and both panels
  TAB_MAIN.classList.toggle('active', showMain);
  TAB_SYS.classList.toggle('active', !showMain);
  // Use display directly — avoids the hidden/active dual-class confusion
  PANEL_MAIN.style.display = showMain ? '' : 'none';
  PANEL_SYS.style.display  = showMain ? 'none' : '';
}

TAB_MAIN.addEventListener('click', () => switchTab(true));

TAB_SYS.addEventListener('click', () => {
  switchTab(false);
  loadSysPanel();
});

// ─── System panel ─────────────────────────────────────────────────────────────

const TODAY_KEY = new Date().toISOString().slice(0, 10);
let _sysBusy = false;

function fmtMs(ms) {
  if (!ms || ms < 1000) return '0s';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h >= 1) return h + 'h ' + (m % 60) + 'm';
  if (m >= 1) return m + 'm';
  return s + 's';
}

function fmtMb(bytes) {
  return Math.round(bytes / 1024 / 1024) + ' MB';
}

function favicon(host) {
  // FIX #1: No external request — privacy-safe local letter-avatar
  return makeFaviconDataUri(host);
}

async function loadSysPanel() {
  if (_sysBusy) return;
  _sysBusy = true;
  try {
    const [sessionRes, siteData] = await Promise.all([
      sendMsg({ type: 'GET_SESSION_MS' }),
      sendMsg({ type: 'GET_SITE_TIME' }),
    ]);

    $('sysSession').textContent = fmtMs(sessionRes?.ms ?? 0);

    const data    = siteData ?? {};
    const todayMs = Object.values(data).reduce((s, h) => s + (h.days?.[TODAY_KEY] ?? 0), 0);
    $('sysToday').textContent = fmtMs(todayMs);

    renderSysSiteRows(data);
    loadSysRam();
  } finally {
    _sysBusy = false;
  }
}

function loadSysRam() {
  if (performance.memory) {
    const used  = performance.memory.usedJSHeapSize;
    const limit = performance.memory.jsHeapSizeLimit;
    const pct   = Math.round((used / limit) * 100);
    $('sysRam').textContent    = fmtMb(used);
    $('sysRamPct').textContent = pct + '% heap';
    renderRamBar(pct);
    $('sysRamSub').textContent = 'JS heap: ' + fmtMb(used) + ' / ' + fmtMb(limit);
  } else {
    $('sysRam').textContent    = 'N/A';
    $('sysRamSub').textContent = 'Not available';
  }
}

function renderRamBar(pct) {
  const bar = $('sysRamBar');
  bar.style.width = pct + '%';
  bar.classList.remove('warn', 'danger');
  if (pct >= 80)      bar.classList.add('danger');
  else if (pct >= 55) bar.classList.add('warn');
}

function renderSysSiteRows(data) {
  const rows = Object.entries(data)
    .map(([host, d]) => ({ host, ms: d.days?.[TODAY_KEY] ?? 0 }))
    .filter((r) => r.ms > 0)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 8);

  const container = $('sysSiteRows');
  container.innerHTML = '';

  if (!rows.length) {
    const div = document.createElement('div');
    div.className = 'empty-sys';
    div.textContent = 'No site time recorded today yet.';
    container.append(div);
    return;
  }

  const maxMs = rows[0].ms;
  for (const row of rows) {
    const div = document.createElement('div');
    div.className = 'site-row';

    const img = document.createElement('img');
    img.src = favicon(row.host);
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = function() { this.style.visibility = 'hidden'; };

    const hostSpan = document.createElement('span');
    hostSpan.className = 's-host';
    hostSpan.title = row.host;
    hostSpan.textContent = row.host;  // textContent — safe

    const timeSpan = document.createElement('span');
    timeSpan.className = 's-time';
    timeSpan.textContent = fmtMs(row.ms);

    div.append(img, hostSpan, timeSpan);
    container.append(div);
  }
}

// Open full system dashboard in new tab
$('sysOpenFull').addEventListener('click', () => {
  _cr.tabs.create({ url: _rt.getURL('src/system-dashboard.html') });
});

// Live refresh every 5s while sys tab is open
setInterval(() => {
  if (PANEL_SYS.style.display !== 'none') loadSysPanel();  // BUG FIX: 'none' is now always explicit
}, 5000);

// ─── Threats ──────────────────────────────────────────────────────────────────

function renderThreats(blocked, lastScan) {
  const items = [
    ...blocked.map((t) => ({ ...t, source: t.source || 'Blocked download' })),
    ...(lastScan?.suspiciousDownloads ?? []),
    ...(lastScan?.suspiciousTabs ?? []),
  ];

  const seen   = new Set();
  const unique = items.filter((t) => {
    const key = t.url + '|' + t.createdAt;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const el = $('threats');
  el.replaceChildren();
  $('threatCount').textContent = unique.length ? '(' + unique.length + ')' : '';

  if (!unique.length) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = '\u2705 No suspicious items found.';
    el.append(p);
    return;
  }

  for (const item of unique) el.append(buildThreatCard(item));
}

function buildThreatCard(item) {
  const card = document.createElement('article');
  card.className = 'threat';

  const header = document.createElement('div');
  header.className = 'threat-header';

  const title = document.createElement('h3');
  title.textContent = item.title || item.filename || item.url || 'Suspicious item';

  const badge = document.createElement('span');
  badge.className = 'risk-badge risk-' + (item.level || 'dangerous');
  badge.textContent = item.level || 'blocked';

  header.append(title, badge);

  const src = document.createElement('p');
  src.className = 'source';
  src.textContent = item.source ?? '';

  const ul = document.createElement('ul');
  const reasons = item.reasons?.length ? item.reasons : ['Suspicious behaviour detected.'];
  for (const r of reasons) {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

// FIX #7: Retry sendMessage once if the service worker is sleeping (MV3 lifecycle).
// Chrome may kill the SW after 30s of inactivity — the first message wakes it up,
// the second one gets a real response.
function sendMsg(msg, retries = 1) {
  return new Promise((res) => {
    _rt.sendMessage(msg, (result) => {
      const err = CR.runtime.lastError;
      if (err && retries > 0) {
        // SW was inactive — wait a tick and retry once
        setTimeout(() => sendMsg(msg, 0).then(res), 200);
      } else {
        res(result ?? null);
      }
    });
  });
}

function updateStatus(on) {
  $('status').textContent = on
    ? '\uD83D\uDFE2 Protection active \u2014 ads, trackers and threats blocked.'
    : '\uD83D\uDD34 Protection is paused.';
}

function fmt(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n); }

function dlText(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  // BUG FIX: Revoke the blob URL after a tick to free memory
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function flash(btn, msg) {
  const orig = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = orig; }, 1600);
}

init();
