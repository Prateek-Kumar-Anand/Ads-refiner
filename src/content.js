// src/content.js — Content Script (Chrome + Firefox compatible)
// BUG FIX #7: Two separate overlapping 'click' listeners merged into ONE.
//             Previously both fired for every anchor click causing UX conflicts.
// BUG FIX #8: Dead code (RISKY_MIME_TYPES constant) removed.

'use strict';

const _rt = (typeof browser !== 'undefined' ? browser : chrome).runtime;
const WARNING_CLASS = 'ads-refiner-warning-badge';

// ─── Cosmetic Ad Blocking ─────────────────────────────────────────────────────

const AD_SELECTORS = [
  '[id="ad"]','[id="ads"]','[id="advertisement"]',
  '[id^="ad-"]','[id^="ads-"]','[id$="-ad"]','[id$="-ads"]',
  '[id*="-ad-"]','[id*="_ad_"]',
  '[class~="ad"]','[class~="ads"]','[class~="advert"]',
  '[class*=" ad "]','[class*=" ads "]',
  '[class^="ad-"]','[class^="ads-"]',
  '[class*="advert"]','[class*="advertisement"]',
  '[class*="adsbygoogle"]',
  '[class*="sponsor-"]','[class*="sponsored-"]',
  '[class*="-sponsor"]','[class*="ad_slot"]',
  '[class*="ad-slot"]','[class*="ad-unit"]',
  '[class*="banner-ad"]','[class*="display-ad"]',
  '[data-ad]','[data-ad-slot]','[data-ad-unit]',
  '[data-google-query-id]',
  'iframe[src*="doubleclick.net"]',
  'iframe[src*="googlesyndication.com"]',
  'iframe[src*="adnxs.com"]',
  'iframe[src*="rubiconproject.com"]',
  'iframe[src*="/ads/"]',
  'iframe[src*="ad.html"]',
  'ins.adsbygoogle',
  'div[aria-label="Advertisement"]',
  'div[aria-label="Ads"]',
  'section[aria-label="Sponsored"]',
];

let cosmeticEnabled = true;

function hideLikelyAds() {
  if (!cosmeticEnabled) return;
  for (const selector of AD_SELECTORS) {
    try {
      document.querySelectorAll(selector).forEach((el) => {
        if (!el.hasAttribute('data-ar-hidden')) {
          el.setAttribute('data-ar-hidden', 'true');
        }
      });
    } catch { /* invalid selector on some pages — skip */ }
  }
}

// ─── Quick local risk check (lightweight, no network) ─────────────────────────

function quickRiskCheck(href) {
  try {
    const url = new URL(href);
    const h = url.hostname.toLowerCase();
    const p = url.pathname.toLowerCase();

    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
      return { level: 'dangerous', reasons: ['Non-standard protocol: ' + url.protocol] };
    }
    if (href.includes('@') && url.protocol !== 'mailto:') {
      return { level: 'suspicious', reasons: ['URL contains "@" — destination may be hidden.'] };
    }
    if (h.includes('xn--')) {
      return { level: 'suspicious', reasons: ['Punycode domain — may impersonate a trusted site.'] };
    }
    const dangerousExts = ['.exe','.msi','.bat','.ps1','.vbs','.js','.scr','.hta','.dmg','.apk'];
    const ext = p.split('?')[0].split('#')[0].match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase();
    if (ext && dangerousExts.includes(ext)) {
      return { level: 'dangerous', reasons: [`High-risk file type: ${ext}`] };
    }
    return { level: 'safe', reasons: [] };
  } catch {
    return { level: 'safe', reasons: [] };
  }
}

function showInlineWarning(anchor, risk) {
  removeInlineWarning(anchor);
  const badge = document.createElement('span');
  badge.className = WARNING_CLASS;
  badge.setAttribute('role', 'alert');
  badge.textContent = `⚠ Ads Refiner: ${risk.level} link — click again to continue`;
  badge.title = risk.reasons.join('\n');
  anchor.insertAdjacentElement('afterend', badge);
  setTimeout(() => badge.remove(), 9000);
}

function removeInlineWarning(anchor) {
  const next = anchor.nextElementSibling;
  if (next?.classList.contains(WARNING_CLASS)) next.remove();
}

// ─── Risky download extensions ────────────────────────────────────────────────

const RISKY_DL_EXTS = [
  '.exe','.msi','.bat','.ps1','.vbs','.js','.scr','.hta',
  '.dmg','.apk','.dll','.iso','.jar','.zip','.rar','.7z'
];
const WARNED_DOWNLOADS = new Set();
const pendingWarnings = new WeakSet();

// ─── MERGED click handler (FIX #7) ───────────────────────────────────────────
// Was previously TWO separate handlers that both fired for every anchor click.
// Merged into ONE to prevent conflicts when a link is both suspicious AND a download.

document.addEventListener('click', (e) => {
  const anchor = e.target.closest?.('a[href]');
  if (!anchor) return;

  const href = anchor.href || '';
  if (!href || href.startsWith('javascript:') || href.startsWith('#')) return;

  const hasDownload = anchor.hasAttribute('download');
  const ext = href.split('?')[0].split('#')[0].match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase();

  // ── Branch A: Risky download overlay (takes priority) ──────────────────────
  if (hasDownload && ext && RISKY_DL_EXTS.includes(ext) && !WARNED_DOWNLOADS.has(href)) {
    e.preventDefault();
    e.stopPropagation();
    WARNED_DOWNLOADS.add(href);

    const msg = document.createElement('div');
    msg.className = 'ar-sandbox-warning';
    msg.innerHTML =
      `<strong>⚠ Ads Refiner — Download Warning</strong><br>` +
      `This file type (<code>${ext}</code>) can run code on your device.<br>` +
      `Only download from sources you fully trust.` +
      `<div class="ar-sandbox-btns">` +
        `<button class="ar-btn-cancel">Cancel</button>` +
        `<button class="ar-btn-continue">Download anyway</button>` +
      `</div>`;
    document.body.appendChild(msg);
    msg.querySelector('.ar-btn-cancel').onclick   = () => msg.remove();
    msg.querySelector('.ar-btn-continue').onclick = () => { msg.remove(); window.location.assign(href); };
    return;
  }

  // ── Branch B: Suspicious-link interception ─────────────────────────────────
  if (anchor.dataset.arAllowed === 'true') return;
  if (pendingWarnings.has(anchor)) {
    anchor.dataset.arAllowed = 'true';
    return;
  }

  const risk = quickRiskCheck(href);
  if (risk.level === 'safe') return;

  e.preventDefault();
  e.stopPropagation();
  showInlineWarning(anchor, risk);
  pendingWarnings.add(anchor);

  // Full background check — redirect to warning page if confirmed risky
  _rt.sendMessage({ type: 'CHECK_URL', url: href }, (result) => {
    if (!result || result.level === 'safe') return;
    const u = new URL(_rt.getURL('src/warning.html'));
    u.searchParams.set('target', href);
    u.searchParams.set('level', result.level);
    u.searchParams.set('score', String(result.score ?? 0));
    u.searchParams.set('reasons', JSON.stringify(result.reasons ?? []));
    window.location.assign(u.href);
  });
}, true);

// ─── MutationObserver (debounced) ────────────────────────────────────────────

let rafPending = false;
const observer = new MutationObserver(() => {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { hideLikelyAds(); rafPending = false; });
});

function startObserver() {
  const root = document.documentElement || document.body;
  if (root) observer.observe(root, { childList: true, subtree: true });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

_rt.sendMessage({ type: 'GET_SETTINGS' }, (settings) => {
  cosmeticEnabled = settings?.cosmeticBlocking !== false && settings?.enabled !== false;
  if (cosmeticEnabled) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', hideLikelyAds, { once: true });
    } else {
      hideLikelyAds();
    }
    startObserver();
  }
});
