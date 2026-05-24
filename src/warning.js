// src/warning.js — Warning page controller (fully on-device + free HIBP check)

'use strict';

const _rt = (typeof browser !== 'undefined' ? browser : chrome).runtime;
const params  = new URLSearchParams(window.location.search);
const target  = params.get('target') || 'Unknown link';
const level   = params.get('level')  || 'suspicious';
const score   = parseInt(params.get('score') || '0', 10);
const reasons = (() => {
  try { return JSON.parse(params.get('reasons') || '[]'); }
  catch { return []; }
})();

// ─── Populate ─────────────────────────────────────────────────────────────────

document.getElementById('target').textContent = target;
document.getElementById('headingText').textContent =
  level === 'dangerous' ? '⚠ Dangerous link blocked' : '⚠ Suspicious link detected';

document.getElementById('stripe').className = `warning-stripe stripe-${level}`;

const badge = document.getElementById('levelBadge');
badge.className = `level-badge badge-${level}`;
badge.textContent = level;

const ring = document.getElementById('scoreRing');
ring.className = `score-ring ring-${level}`;
ring.textContent = score > 0 ? score : '!';
ring.title = `Risk score: ${score}/100`;

const ul = document.getElementById('reasons');
for (const r of reasons.length ? reasons : ['Ads Refiner detected signs of a suspicious or malicious link.']) {
  const li = document.createElement('li');
  li.textContent = r;
  ul.append(li);
}

// ─── Async enrichment (all free) ─────────────────────────────────────────────

(async function enrich() {
  let hostname = '';
  try { hostname = new URL(target).hostname; } catch { return; }

  // Reputation (stored locally, no network)
  const repResult = await sendMsg({ type: 'CHECK_URL', url: target }).catch(() => null);
  if (repResult?.reputation) {
    const rep = repResult.reputation;
    const s = rep.score ?? 50;
    const color = s >= 80 ? '#047857' : s >= 50 ? '#b45309' : '#c2410c';
    const label = s >= 80 ? 'Trusted' : s >= 50 ? 'Neutral' : s >= 25 ? 'Suspicious' : 'Dangerous';
    document.getElementById('trustScore').textContent = `${s}/100`;
    document.getElementById('trustScore').style.color = color;
    document.getElementById('trustLabel').textContent = label;
    document.getElementById('trustBox').style.display = 'flex';
  }

  // HaveIBeenPwned breach check — 100% free, public endpoint, no API key
  const breaches = await sendMsg({ type: 'CHECK_BREACH', domain: hostname }).catch(() => []);
  if (Array.isArray(breaches) && breaches.length) {
    const names = breaches.slice(0, 3).map((b) => `${b.Name} (${b.BreachDate})`).join(', ');
    const data  = breaches[0]?.DataClasses?.slice(0,4).join(', ') ?? 'personal information';
    document.getElementById('breachDetail').textContent =
      `Known breaches: ${names}. Data exposed may include: ${data}.`;
    document.getElementById('breachBox').style.display = 'block';
  }
})();

// ─── Actions ─────────────────────────────────────────────────────────────────

document.getElementById('goBack').addEventListener('click', () => {
  history.length > 1 ? history.back() : (window.location.href = 'about:blank');
});

document.getElementById('continue').addEventListener('click', async () => {
  await sendMsg({ type: 'ALLOW_URL', url: target });
  window.location.href = target;
});

document.getElementById('btnWhitelist').addEventListener('click', async () => {
  let hostname = '';
  try { hostname = new URL(target).hostname; } catch { return; }
  const result = await sendMsg({ type: 'WHITELIST_ADD', domain: hostname });
  const msg = document.getElementById('wlMsg');
  if (result?.ok) {
    msg.textContent = `✓ ${hostname} added to whitelist — won't be flagged again.`;
    document.getElementById('btnWhitelist').disabled = true;
  } else {
    msg.textContent = '✗ Could not add to whitelist.';
  }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sendMsg(msg) {
  return new Promise((res) => {
    try { _rt.sendMessage(msg, (r) => res(r ?? null)); }
    catch { res(null); }
  });
}
