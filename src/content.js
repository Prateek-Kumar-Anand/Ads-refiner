// src/content.js — Content Script (Chrome MV3)
// Fixes applied:
//  #7  Two overlapping click listeners merged into ONE
//  #8  Dead code (RISKY_MIME_TYPES) removed
//  #XSS innerHTML replaced with safe DOM construction throughout

'use strict';

// FIX #6: Use shared CR shim (crossbrowser.js)
const _rt = CR.runtime;
const WARNING_CLASS = 'ads-refiner-warning-badge';

// ─── Cosmetic Ad Blocking ─────────────────────────────────────────────────────

const AD_SELECTORS = [
  '[id="ad"],[id="ads"],[id="advertisement"]',
  '[id^="ad-"],[id^="ads-"],[id$="-ad"],[id$="-ads"]',
  '[id*="-ad-"],[id*="_ad_"]',
  '[class~="ad"],[class~="ads"],[class~="advert"]',
  '[class^="ad-"],[class^="ads-"]',
  '[class*="advert"],[class*="advertisement"],[class*="adsbygoogle"]',
  '[class*="sponsor-"],[class*="sponsored-"],[class*="-sponsor"]',
  '[class*="ad_slot"],[class*="ad-slot"],[class*="ad-unit"]',
  '[class*="banner-ad"],[class*="display-ad"]',
  '[data-ad],[data-ad-slot],[data-ad-unit],[data-google-query-id]',
  'iframe[src*="doubleclick.net"]',
  'iframe[src*="googlesyndication.com"]',
  'iframe[src*="adnxs.com"]',
  'iframe[src*="rubiconproject.com"]',
  'iframe[src*="/ads/"],iframe[src*="ad.html"]',
  'ins.adsbygoogle',
  'div[aria-label="Advertisement"],div[aria-label="Ads"]',
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
    } catch { /* invalid selector on edge-case pages — skip */ }
  }
}

// ─── Quick local risk check (no network) ─────────────────────────────────────
// FIX #4: Removed local extension list — it was a subset of safety.js DANGEROUS_EXTENSIONS
// and caused inconsistency (.js was flagged by background but not here).
// quickRiskCheck only does STRUCTURAL URL checks (protocol, @, punycode).
// Full extension + scoring check is done by the background via CHECK_URL.

function quickRiskCheck(href) {
  try {
    const url = new URL(href);
    const h = url.hostname.toLowerCase();

    // Non-http/https protocols (data:, javascript:, ftp:, etc.)
    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
      return { level: 'dangerous', reasons: ['Non-standard protocol: ' + url.protocol] };
    }
    // Credential-hiding @ in URL (not mailto)
    if (href.includes('@') && url.protocol !== 'mailto:') {
      return { level: 'suspicious', reasons: ['URL contains "@" — destination may be hidden.'] };
    }
    // Punycode homograph
    if (h.includes('xn--')) {
      return { level: 'suspicious', reasons: ['Punycode domain — may impersonate a trusted site.'] };
    }
    return { level: 'safe', reasons: [] };
  } catch {
    return { level: 'safe', reasons: [] };
  }
}

// ─── Inline warning badge (safe DOM — no innerHTML) ───────────────────────────

function showInlineWarning(anchor, risk) {
  removeInlineWarning(anchor);
  const badge = document.createElement('span');
  badge.className = WARNING_CLASS;
  badge.setAttribute('role', 'alert');
  // textContent only — no HTML injection possible
  badge.textContent = '\u26a0 Ads Refiner: ' + risk.level + ' link \u2014 click again to continue';
  badge.title = risk.reasons.join('\n');
  anchor.insertAdjacentElement('afterend', badge);
  setTimeout(() => badge.remove(), 9000);
}

function removeInlineWarning(anchor) {
  const next = anchor.nextElementSibling;
  if (next?.classList.contains(WARNING_CLASS)) next.remove();
}

// ─── Risky download extensions ────────────────────────────────────────────────

// FIX #5: .js not here — would block legitimate CDN/script hrefs with download attr
// FIX #5: .zip/.rar/.7z removed — archives are common legit downloads (false positive rate too high)
const RISKY_DL_EXTS = [
  '.exe', '.msi', '.bat', '.ps1', '.vbs', '.scr', '.hta',
  '.dmg', '.apk', '.dll', '.iso', '.jar'
];
const WARNED_DOWNLOADS = new Set();
const pendingWarnings = new WeakMap();  // BUG FIX: WeakMap so we can delete entries

// ─── Download overlay builder (safe DOM — no innerHTML) ───────────────────────
// FIX #XSS: was using innerHTML with `ext` from the page URL — now pure DOM

function buildDownloadOverlay(ext, href) {
  const wrap = document.createElement('div');
  wrap.className = 'ar-sandbox-warning';

  const title = document.createElement('strong');
  title.textContent = '\u26a0 Ads Refiner \u2014 Download Warning';

  const br = document.createElement('br');

  const body = document.createElement('span');
  // ext is constrained to /\.[a-z0-9]+$/i already — but we still use textContent
  body.textContent =
    'This file type (' + (ext || 'unknown') + ') can run code on your device. ' +
    'Only download from sources you fully trust.';

  const btns = document.createElement('div');
  btns.className = 'ar-sandbox-btns';

  const cancel = document.createElement('button');
  cancel.className = 'ar-btn-cancel';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => wrap.remove());

  const proceed = document.createElement('button');
  proceed.className = 'ar-btn-continue';
  proceed.textContent = 'Download anyway';
  proceed.addEventListener('click', () => {
    wrap.remove();
    window.location.assign(href);
  });

  btns.append(cancel, proceed);
  wrap.append(title, br, body, btns);
  return wrap;
}

// ─── MERGED click handler (FIX #7) ───────────────────────────────────────────

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
    document.body.appendChild(buildDownloadOverlay(ext, href));
    return;
  }

  // ── Branch B: Suspicious-link interception ─────────────────────────────────
  if (anchor.dataset.arAllowed === 'true') return;
  if (pendingWarnings.has(anchor)) {  // WeakMap.has() is valid
    anchor.dataset.arAllowed = 'true';
    return;
  }

  const risk = quickRiskCheck(href);
  if (risk.level === 'safe') return;

  e.preventDefault();
  e.stopPropagation();
  showInlineWarning(anchor, risk);
  pendingWarnings.set(anchor, true);  // BUG FIX: set() not add()

  _rt.sendMessage({ type: 'CHECK_URL', url: href }, (result) => {
    // BUG FIX: always clean up pendingWarnings so link is usable again
    pendingWarnings.delete(anchor);
    if (!result || result.level === 'safe') {
      // Background says safe — remove badge and allow
      removeInlineWarning(anchor);
      return;
    }
    const u = new URL(_rt.getURL('src/warning.html'));
    u.searchParams.set('target', href);
    u.searchParams.set('level', result.level);
    u.searchParams.set('score', String(result.score ?? 0));
    u.searchParams.set('reasons', JSON.stringify(result.reasons ?? []));
    window.location.assign(u.href);
  });
}, true);

// ─── MutationObserver (debounced via rAF) ────────────────────────────────────

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
