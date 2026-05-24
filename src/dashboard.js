// src/dashboard.js — Analytics Dashboard Controller

'use strict';

const _rt = (typeof browser !== 'undefined' ? browser : chrome).runtime;
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
  container.innerHTML = '';

  if (!sorted.length) {
    container.innerHTML = '<p style="color:var(--muted);font-size:0.85rem">No events yet.</p>';
    return;
  }

  for (const [type, count] of sorted) {
    const pct = Math.round((count / max) * 100);
    const label = type.replace(/_/g, ' ');
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${label}">${label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
      <span class="bar-val">${fmt(count)}</span>`;
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
  tbody.innerHTML = '';

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:1rem">No events.</td></tr>';
    return;
  }

  for (const e of rows.slice(0, 200)) {
    const tr = document.createElement('tr');
    const time = new Date(e.timestamp).toLocaleString();
    const details = e.url || e.filename || JSON.stringify(e).slice(0, 80);
    const level = e.level ?? '';
    const typeClass = e.type?.includes('download') ? 'badge-dl' :
                      e.type?.includes('tracker')  ? 'badge-tracker' : 'badge-url';
    tr.innerHTML = `
      <td style="white-space:nowrap;font-size:0.75rem">${time}</td>
      <td><span class="badge ${typeClass}">${(e.type ?? '').replace(/_/g,' ')}</span></td>
      <td>${escHtml(String(details))}</td>
      <td><span style="font-weight:700;color:${level === 'dangerous' ? 'var(--danger)' : level === 'suspicious' ? '#b45309' : 'var(--safe)'}">${level}</span></td>`;
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
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1rem">No reputation data yet.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  for (const e of entries) {
    const score = e.score ?? 50;
    const color = score >= 80 ? '#047857' : score >= 50 ? '#b45309' : '#c2410c';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escHtml(e.domain)}</strong></td>
      <td>
        <span class="trust-bar" style="background:linear-gradient(to right,${color} ${score}%,var(--border) ${score}%)"></span>
        <span style="font-size:0.78rem;margin-left:0.4rem;color:${color}">${score}/100</span>
      </td>
      <td>${e.visits ?? 0}</td>
      <td style="color:${e.flagCount > 0 ? 'var(--danger)' : 'var(--muted)'}">${e.flagCount ?? 0}</td>
      <td>${e.hasKnownBreach ? '<span style="color:var(--danger)">⚠ Yes</span>' : '—'}</td>
      <td style="font-size:0.75rem;white-space:nowrap">${e.lastUpdated ? new Date(e.lastUpdated).toLocaleDateString() : '—'}</td>`;
    tbody.append(tr);
  }
}

// ─── Whitelist Manager ────────────────────────────────────────────────────────

let _whitelist = [];

function renderWhitelist(list) {
  _whitelist = list;
  const el = $('wlList');
  el.innerHTML = '';
  if (!list.length) {
    el.innerHTML = '<p style="color:var(--muted);font-size:0.85rem">No domains whitelisted.</p>';
    return;
  }
  for (const domain of list) {
    const div = document.createElement('div');
    div.className = 'wl-item';
    div.innerHTML = `<span>${escHtml(domain)}</span><button title="Remove" data-domain="${escAttr(domain)}">✕</button>`;
    div.querySelector('button').onclick = async () => {
      await send({ type: 'WHITELIST_REMOVE', domain });
      renderWhitelist(_whitelist.filter((d) => d !== domain));
    };
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

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) { return escHtml(s); }

// Boot
load();
