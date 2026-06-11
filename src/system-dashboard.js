// src/system-dashboard.js — System Dashboard Controller
// RAM uses performance.memory fallback (processes permission removed for CWS compliance)

'use strict';

// FIX #6: Use shared CR shim (crossbrowser.js)
const _rt = CR.runtime;
const $   = (id) => document.getElementById(id);
const TODAY = new Date().toISOString().slice(0, 10);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function send(msg) {
  return new Promise((res) => _rt.sendMessage(msg, (r) => res(r ?? null)));
}

function fmtMs(ms) {
  if (!ms || ms < 1000) return '0s';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h >= 1) return h + 'h ' + (m % 60) + 'm';
  if (m >= 1) return m + 'm ' + (s % 60) + 's';
  return s + 's';
}

function fmtMb(bytes) {
  return Math.round(bytes / 1024 / 1024) + ' MB';
}

function favicon(host) {
  // FIX #1: Local letter-avatar — no external request to Google
  return makeFaviconDataUri(host);
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── RAM (performance.memory fallback — no processes permission needed) ───────

function loadRam() {
  if (performance.memory) {
    const used  = performance.memory.usedJSHeapSize;
    const total = performance.memory.totalJSHeapSize;
    const limit = performance.memory.jsHeapSizeLimit;
    const pct   = Math.round((used / limit) * 100);

    $('ramTotal').textContent   = fmtMb(used);
    $('ramLargest').textContent = fmtMb(total);
    $('ramProcesses').textContent = fmtMb(limit);

    const bar = $('ramBar');
    bar.style.width = pct + '%';
    bar.classList.remove('warn', 'danger');
    if (pct >= 80)      bar.classList.add('danger');
    else if (pct >= 55) bar.classList.add('warn');

    $('ramPct').textContent = fmtMb(used) + ' used of ' + fmtMb(limit) + ' limit (' + pct + '%)';
    $('ramNote').textContent = 'JS heap — used / allocated / limit. Updates every 5 seconds.';
    $('ramUpdated').textContent = 'updated ' + new Date().toLocaleTimeString();
  } else {
    $('ramTotal').textContent    = 'N/A';
    $('ramNote').textContent     = 'performance.memory not available in this browser.';
  }
}

// ─── Session time ─────────────────────────────────────────────────────────────

async function loadSessionTime() {
  const result = await send({ type: 'GET_SESSION_MS' });
  const ms = result?.ms ?? 0;
  $('sessionTime').textContent = fmtMs(ms);
  $('sessionSub').textContent  = 'started ' + new Date(Date.now() - ms).toLocaleTimeString();
}

// ─── Site time ────────────────────────────────────────────────────────────────

let _siteData  = {};
let _todaySort = 'today';

async function loadSiteTime() {
  _siteData = (await send({ type: 'GET_SITE_TIME' })) ?? {};
  renderSummaryStats();
  renderTodayTable();
  renderAllTimeTable();
}

function renderSummaryStats() {
  const hosts = Object.values(_siteData);
  const todayMs = hosts.reduce((s, h) => s + (h.days?.[TODAY] ?? 0), 0);
  $('todayTotal').textContent = fmtMs(todayMs);
  $('todaySub').textContent   =
    Object.keys(_siteData).filter((k) => (_siteData[k].days?.[TODAY] ?? 0) > 0).length +
    ' sites today';

  const allMs = hosts.reduce((s, h) => s + (h.total ?? 0), 0);
  $('allTimeTotal').textContent = fmtMs(allMs);
  $('sitesTracked').textContent = Object.keys(_siteData).length + ' sites tracked';
}

function renderTodayTable() {
  let rows = Object.entries(_siteData)
    .map(([host, d]) => ({ host, ms: d.days?.[TODAY] ?? 0, total: d.total ?? 0 }))
    .filter((r) => r.ms > 0);

  rows.sort((a, b) => (_todaySort === 'total' ? b.total - a.total : b.ms - a.ms));

  const tbody = $('todayBody');
  tbody.innerHTML = '';

  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.className = 'empty-state';
    td.textContent = 'No site data recorded today yet. Browse some websites and come back.';
    tr.append(td);
    tbody.append(tr);
    return;
  }

  const maxMs = rows[0].ms;
  for (const row of rows) {
    const pct = Math.round((row.ms / maxMs) * 100);
    const tr  = document.createElement('tr');

    // Site cell
    const tdSite = document.createElement('td');
    const img = document.createElement('img');
    img.className = 'site-favicon';
    img.src = favicon(row.host);
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = function() { this.style.display = 'none'; };
    const strong = document.createElement('strong');
    strong.textContent = row.host;
    tdSite.append(img, strong);

    // Time cell
    const tdTime = document.createElement('td');
    tdTime.style.whiteSpace = 'nowrap';
    tdTime.textContent = fmtMs(row.ms);

    // Bar cell
    const tdBar = document.createElement('td');
    const barSpan = document.createElement('span');
    barSpan.className = 'inline-bar';
    barSpan.style.width = Math.max(4, pct) + 'px';
    const pctSpan = document.createElement('span');
    pctSpan.style.cssText = 'font-size:0.75rem;color:var(--muted)';
    pctSpan.textContent = pct + '%';
    tdBar.append(barSpan, pctSpan);

    tr.append(tdSite, tdTime, tdBar);
    tbody.append(tr);
  }
}

function renderAllTimeTable() {
  let rows = Object.entries(_siteData).map(([host, d]) => {
    const daysVisited = Object.keys(d.days ?? {}).length;
    const avgMs = daysVisited > 0 ? Math.round((d.total ?? 0) / daysVisited) : 0;
    return { host, total: d.total ?? 0, daysVisited, avgMs };
  });

  rows.sort((a, b) => b.total - a.total);

  const tbody = $('allTimeBody');
  tbody.innerHTML = '';

  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'empty-state';
    td.textContent = 'No all-time data yet.';
    tr.append(td);
    tbody.append(tr);
    return;
  }

  const maxTotal = rows[0].total;
  for (const row of rows.slice(0, 100)) {
    const pct = Math.round((row.total / maxTotal) * 100);
    const tr  = document.createElement('tr');

    const tdSite = document.createElement('td');
    const img = document.createElement('img');
    img.className = 'site-favicon';
    img.src = favicon(row.host);
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = function() { this.style.display = 'none'; };
    const strong = document.createElement('strong');
    strong.textContent = row.host;
    tdSite.append(img, strong);

    const tdTotal = document.createElement('td');
    tdTotal.style.whiteSpace = 'nowrap';
    const barSpan = document.createElement('span');
    barSpan.className = 'inline-bar';
    barSpan.style.width = Math.max(4, Math.round(pct * 0.7)) + 'px';
    const timeText = document.createTextNode(fmtMs(row.total));
    tdTotal.append(barSpan, timeText);

    const tdDays = document.createElement('td');
    tdDays.style.color = 'var(--muted)';
    tdDays.textContent = row.daysVisited + 'd';

    const tdAvg = document.createElement('td');
    tdAvg.style.color = 'var(--muted)';
    tdAvg.textContent = fmtMs(row.avgMs) + '/day';

    tr.append(tdSite, tdTotal, tdDays, tdAvg);
    tbody.append(tr);
  }
}

// ─── Events ───────────────────────────────────────────────────────────────────

$('btnRefresh').addEventListener('click', loadAll);

$('btnClearTime').addEventListener('click', async () => {
  if (!confirm('Clear all time-tracking data? This cannot be undone.')) return;
  await send({ type: 'CLEAR_SITE_TIME' });
  _siteData = {};
  renderSummaryStats();
  renderTodayTable();
  renderAllTimeTable();
});

$('todaySort').addEventListener('change', () => {
  _todaySort = $('todaySort').value;
  renderTodayTable();
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function loadAll() {
  loadRam();
  await Promise.all([loadSessionTime(), loadSiteTime()]);
}

setInterval(() => { loadRam(); loadSessionTime(); }, 5000);

loadAll();
