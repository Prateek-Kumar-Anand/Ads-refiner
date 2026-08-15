// src/dashboard.js — Analytics Dashboard Controller

'use strict';

// FIX #6: Use shared CR shim (crossbrowser.js)
const _rt = CR.runtime;
const $ = (id) => document.getElementById(id);

// ─── Main Load ────────────────────────────────────────────────────────────────

async function load() {
  const [counters, log, reputation, whitelist] = await Promise.all([
    send({ type: 'GET_COUNTERS' }),
    send({ type: 'GET_LOG', filter: {} }),
    send({ type: 'GET_REPUTATION' }),
    send({ type: 'WHITELIST_GET' }),
  ]);

  renderStats(counters ?? {}, log ?? []);
  renderTypeChart(log ?? []);
  renderActivityChart(log ?? []);
  renderLog(log ?? []);
  renderReputation(reputation ?? {});
  renderWhitelist(whitelist ?? []);
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function renderStats(c, log) {
  $('sAds').textContent      = fmt(c.adsBlocked ?? 0);
  $('sTrackers').textContent = fmt(c.trackersBlocked ?? 0);
  $('sUrls').textContent     = fmt(c.urlsBlocked ?? 0);
  $('sDownloads').textContent= fmt(c.downloadsBlocked ?? 0);
  $('sLogEvents').textContent= fmt(log.length);
}

// ─── Type Bar Chart ───────────────────────────────────────────────────────────

function renderTypeChart(log) {
  const counts = {};
  for (const e of log) counts[e.type] = (counts[e.type] ?? 0) + 1;

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = sorted[0]?.[1] ?? 1;

  const container = $('typeChart');
  container.replaceChildren();

  if (!sorted.length) {
    const p = document.createElement('p');
    p.style.cssText = 'color:var(--muted);font-size:0.85rem';
    p.textContent = 'No events yet.';
    container.append(p);
    return;
  }

  for (const [type, count] of sorted) {
    const pct = Math.round((count / max) * 100);
    const label = type.replace(/_/g, ' ');
    const row = document.createElement('div');
    row.className = 'bar-row';
    // Safe DOM: label comes from log event type stored by extension itself
    // but we still use textContent to be defensive
    const labelSpan = document.createElement('span');
    labelSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    labelSpan.title = label;
    labelSpan.textContent = label;
    const track = document.createElement('div');
    track.className = 'bar-track';
    const fill = document.createElement('div');
    fill.className = 'bar-fill';
    fill.style.width = pct + '%';
    track.append(fill);
    const val = document.createElement('span');
    val.className = 'bar-val';
    val.textContent = fmt(count);
    row.append(labelSpan, track, val);
    container.append(row);
  }
}

// ─── Activity Canvas Chart (last 7 days) ─────────────────────────────────────

function renderActivityChart(log) {
  const canvas = $('activityCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 360;
  const H = 180;
  canvas.width = W * devicePixelRatio;
  canvas.height = H * devicePixelRatio;
  ctx.scale(devicePixelRatio, devicePixelRatio);

  // Build day buckets
  const days = 7;
  const buckets = Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return { label: d.toLocaleDateString(undefined, { weekday: 'short' }), count: 0 };
  });

  const now = Date.now();
  for (const e of log) {
    const age = Math.floor((now - new Date(e.timestamp).getTime()) / 86400000);
    if (age < days) buckets[days - 1 - age].count++;
  }

  const max = Math.max(...buckets.map((b) => b.count), 1);
  const pad = { top: 10, bottom: 28, left: 10, right: 10 };
  const barW = (W - pad.left - pad.right) / days;

  // Get CSS vars for theming
  const style = getComputedStyle(document.documentElement);
  const accentColor = style.getPropertyValue('--accent').trim() || '#4f46e5';
  const mutedColor  = style.getPropertyValue('--muted').trim() || '#6b7280';
  const borderColor = style.getPropertyValue('--border').trim() || '#d1d5db';

  ctx.clearRect(0, 0, W, H);

  // Grid line
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, H - pad.bottom);
  ctx.lineTo(W - pad.right, H - pad.bottom);
  ctx.stroke();

  // Bars
  buckets.forEach((b, i) => {
    const barH = ((b.count / max) * (H - pad.top - pad.bottom));
    const x = pad.left + i * barW + barW * 0.15;
    const y = H - pad.bottom - barH;
    const bw = barW * 0.7;

    ctx.fillStyle = accentColor;
    ctx.globalAlpha = 0.85;
    // Rounded top
    const r = Math.min(4, bw / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + bw - r, y);
    ctx.quadraticCurveTo(x + bw, y, x + bw, y + r);
    ctx.lineTo(x + bw, H - pad.bottom);
    ctx.lineTo(x, H - pad.bottom);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Label
    ctx.fillStyle = mutedColor;
    ctx.font = `${Math.max(10, barW * 0.35)}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(b.label, x + bw / 2, H - 8);

    // Count above bar
    if (b.count > 0) {
      ctx.fillStyle = accentColor;
      ctx.font = `bold ${Math.max(9, barW * 0.3)}px system-ui`;
      ctx.fillText(b.count, x + bw / 2, Math.max(y - 4, pad.top + 4));
    }
  });
}

// ─── Event Log Table ──────────────────────────────────────────────────────────

let _allLog = [];

function renderLog(log) {
  _allLog = log;
  applyLogFilter();
}

function applyLogFilter() {
  const type = $('logFilter').value;
  const rows = type ? _allLog.filter((e) => e.type === type) : _allLog;
  $('logMeta').textContent = `${rows.length} entries`;

  const tbody = $('logBody');
  tbody.replaceChildren();

  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.style.cssText = 'text-align:center;color:var(--muted);padding:1rem';
    td.textContent = 'No events.';
    tr.append(td);
    tbody.append(tr);
    return;
  }

  // SECURITY FIX: this row used to build markup with a template literal and
  // innerHTML, escaping `details` but interpolating `type`/`level` raw next
  // to it. Both happen to only ever hold extension-generated literal strings
  // today, but mixing escaped and unescaped values in one template is a
  // regression trap in a page that runs with full extension privileges
  // (history, downloads, tabs). Build every cell as safe DOM instead so
  // there's no innerHTML path left to accidentally reintroduce.
  for (const e of rows.slice(0, 200)) {
    const time = new Date(e.timestamp).toLocaleString();
    const details = e.url || e.filename || JSON.stringify(e).slice(0, 80);
    const level = e.level ?? '';
    const typeClass = e.type?.includes('download') ? 'badge-dl' :
                      e.type?.includes('tracker')  ? 'badge-tracker' : 'badge-url';

    const tr = document.createElement('tr');

    const tdTime = document.createElement('td');
    tdTime.style.cssText = 'white-space:nowrap;font-size:0.75rem';
    tdTime.textContent = time;

    const tdType = document.createElement('td');
    const typeBadge = document.createElement('span');
    typeBadge.className = `badge ${typeClass}`;
    typeBadge.textContent = (e.type ?? '').replace(/_/g, ' ');
    tdType.append(typeBadge);

    const tdDetails = document.createElement('td');
    tdDetails.textContent = String(details);

    const tdLevel = document.createElement('td');
    const levelSpan = document.createElement('span');
    levelSpan.style.fontWeight = '700';
    levelSpan.style.color = level === 'dangerous' ? 'var(--danger)' : level === 'suspicious' ? '#b45309' : 'var(--safe)';
    levelSpan.textContent = level;
    tdLevel.append(levelSpan);

    tr.append(tdTime, tdType, tdDetails, tdLevel);
    tbody.append(tr);
  }
}

$('logFilter').addEventListener('change', applyLogFilter);

$('btnClearLog').addEventListener('click', async () => {
  if (!confirm('Clear all log events?')) return;
  await send({ type: 'CLEAR_LOG' });
  _allLog = [];
  applyLogFilter();
  $('sLogEvents').textContent = '0';
});

// ─── Reputation Table ─────────────────────────────────────────────────────────

function renderReputation(rep) {
  const tbody = $('repBody');
  const entries = Object.values(rep).sort((a, b) => b.flagCount - a.flagCount).slice(0, 100);

  if (!entries.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.style.cssText = 'text-align:center;color:var(--muted);padding:1rem';
    td.textContent = 'No reputation data yet.';
    tr.append(td);
    tbody.append(tr);
    return;
  }

  tbody.replaceChildren();
  for (const e of entries) {
    const score = e.score ?? 50;
    const color = score >= 80 ? '#047857' : score >= 50 ? '#b45309' : '#c2410c';
    const tr = document.createElement('tr');

    const tdDomain = document.createElement('td');
    const strong = document.createElement('strong');
    strong.textContent = e.domain;
    tdDomain.append(strong);

    const tdScore = document.createElement('td');
    const bar = document.createElement('span');
    bar.className = 'trust-bar';
    bar.style.background = `linear-gradient(to right,${color} ${score}%,var(--border) ${score}%)`;
    const scoreLabel = document.createElement('span');
    scoreLabel.style.cssText = `font-size:0.78rem;margin-left:0.4rem;color:${color}`;
    scoreLabel.textContent = `${score}/100`;
    tdScore.append(bar, scoreLabel);

    const tdVisits = document.createElement('td');
    tdVisits.textContent = e.visits ?? 0;

    const tdFlags = document.createElement('td');
    tdFlags.style.color = e.flagCount > 0 ? 'var(--danger)' : 'var(--muted)';
    tdFlags.textContent = e.flagCount ?? 0;

    const tdBreach = document.createElement('td');
    if (e.hasKnownBreach) {
      const span = document.createElement('span');
      span.style.color = 'var(--danger)';
      span.textContent = '⚠ Yes';
      tdBreach.append(span);
    } else {
      tdBreach.textContent = '—';
    }

    const tdLast = document.createElement('td');
    tdLast.style.cssText = 'font-size:0.75rem;white-space:nowrap';
    tdLast.textContent = e.lastUpdated ? new Date(e.lastUpdated).toLocaleDateString() : '—';

    tr.append(tdDomain, tdScore, tdVisits, tdFlags, tdBreach, tdLast);
    tbody.append(tr);
  }
}

// ─── Whitelist Manager ────────────────────────────────────────────────────────

let _whitelist = [];

function renderWhitelist(list) {
  _whitelist = list;
  const el = $('wlList');
  el.replaceChildren();
  if (!list.length) {
    const p = document.createElement('p');
    p.style.cssText = 'color:var(--muted);font-size:0.85rem';
    p.textContent = 'No domains whitelisted.';
    el.append(p);
    return;
  }
  for (const domain of list) {
    const div = document.createElement('div');
    div.className = 'wl-item';
    const span = document.createElement('span');
    span.textContent = domain;
    const button = document.createElement('button');
    button.title = 'Remove';
    button.dataset.domain = domain;
    button.textContent = '✕';
    button.onclick = async () => {
      await send({ type: 'WHITELIST_REMOVE', domain });
      renderWhitelist(_whitelist.filter((d) => d !== domain));
    };
    div.append(span, button);
    el.append(div);
  }
}

$('wlAdd').addEventListener('click', async () => {
  const val = $('wlInput').value.trim();
  if (!val) return;
  const result = await send({ type: 'WHITELIST_ADD', domain: val });
  if (result?.ok) {
    $('wlInput').value = '';
    const updated = await send({ type: 'WHITELIST_GET' });
    renderWhitelist(updated ?? []);
  } else {
    alert('Invalid domain. Enter a hostname like "example.com".');
  }
});

// ─── Export ───────────────────────────────────────────────────────────────────

$('btnExportJson').addEventListener('click', async () => {
  const json = await send({ type: 'EXPORT_LOG_JSON' });
  dl(json, 'ads-refiner-log.json', 'application/json');
});
$('btnExportCsv').addEventListener('click', async () => {
  const csv = await send({ type: 'EXPORT_LOG_CSV' });
  dl(csv, 'ads-refiner-log.csv', 'text/csv');
});
$('btnRefresh').addEventListener('click', load);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function send(msg) {
  return new Promise((res) => _rt.sendMessage(msg, (r) => res(r)));
}

function fmt(n) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);
}

function dl(content, name, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
}

// Boot
load();
