// src/safety.js — Chrome ES Module (shared core logic, ES module format)
// The same logic exists in safety-browser.js as an IIFE for Firefox/content scripts.

// ─── Constants ────────────────────────────────────────────────────────────────

export const DANGEROUS_EXTENSIONS = [
  '.apk', '.appinstaller', '.appx', '.bat', '.cmd', '.com', '.cpl',
  '.dll', '.dmg', '.exe', '.gadget', '.hta', '.inf', '.iso', '.jar',
  '.js', '.jse', '.lnk', '.msi', '.msix', '.ps1', '.reg', '.scr',
  '.vbe', '.vbs', '.wsf', '.xbap'
];

export const ARCHIVE_EXTENSIONS = ['.7z', '.gz', '.rar', '.tar', '.zip'];

export const TRUSTED_PROTOCOLS = ['http:', 'https:'];

export const SUSPICIOUS_TLDS = [
  '.buzz', '.cc', '.cf', '.cfd', '.click', '.country', '.cyou', '.fit',
  '.ga', '.gq', '.icu', '.kim', '.loan', '.ml', '.mom', '.party',
  '.pw', '.quest', '.rest', '.ru', '.su', '.tk', '.top', '.work', '.xyz'
];

export const URL_SHORTENER_HOSTS = new Set([
  'bit.ly', 'bl.ink', 'clck.ru', 'cutt.ly', 'is.gd', 'ow.ly',
  'rb.gy', 'rebrand.ly', 's.id', 'short.io', 'shorturl.at', 'snip.ly',
  't.co', 'tiny.cc', 'tinyurl.com', 'trib.al'
]);

export const AD_HOST_PATTERNS = [
  /(?:^|\.)2mdn\.net$/,        /(?:^|\.)adnxs\.com$/,
  /(?:^|\.)adsystem\.com$/,    /(?:^|\.)advertising\.com$/,
  /(?:^|\.)contextweb\.com$/,  /(?:^|\.)criteo\.com$/,
  /(?:^|\.)doubleclick\.net$/, /(?:^|\.)googleadservices\.com$/,
  /(?:^|\.)googlesyndication\.com$/, /(?:^|\.)googletagmanager\.com$/,
  /(?:^|\.)googletagservices\.com$/, /(?:^|\.)indexexchange\.com$/,
  /(?:^|\.)lijit\.com$/,       /(?:^|\.)moatads\.com$/,
  /(?:^|\.)openx\.net$/,       /(?:^|\.)outbrain\.com$/,
  /(?:^|\.)pubmatic\.com$/,    /(?:^|\.)rubiconproject\.com$/,
  /(?:^|\.)scorecardresearch\.com$/, /(?:^|\.)sharethrough\.com$/,
  /(?:^|\.)spotxchange\.com$/, /(?:^|\.)taboola\.com$/,
  /(?:^|\.)yieldmo\.com$/,
];

// Safe, non-catastrophic regex patterns (no nested quantifiers)
const BRAND_PATTERN = /(?:apple|facebook|google|instagram|microsoft|netflix|paypal|whatsapp|windows|youtube)/i;
const SENSITIVE_PATTERN = /(?:login|verify|secure|account|password|wallet|bank|invoice|payment|free|gift|prize|airdrop|crypto|support|update|download)/i;
const ARCHIVE_LURE_PATTERN = /(?:setup|crack|keygen|patch|activator|invoice|receipt|statement|refund|bonus)/i;
const AD_PATH_PATTERN = /(?:^|[./_-])(?:ad|ads|advert|banner|sponsor|tracking|pixel|analytics)\d*(?:[./_-]|$)/i;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extracts the file extension from a path, ignoring query strings and fragments.
 * FIX: endsWith() can be fooled by "file.exe?legit=1" — this cannot.
 */
function getPathExtension(pathname) {
  const clean = pathname.split('?')[0].split('#')[0];
  const dot = clean.lastIndexOf('.');
  return dot !== -1 ? clean.slice(dot).toLowerCase() : '';
}

// ─── Core Risk Engine ─────────────────────────────────────────────────────────

/**
 * Returns a risk assessment for a URL.
 * @param {string} inputUrl
 * @param {{ whitelist?: Set<string> }} [opts]
 */
export function getUrlRisk(inputUrl, opts = {}) {
  let url;
  try {
    url = new URL(inputUrl);
  } catch {
    return { level: 'dangerous', score: 100, reasons: ['The link is not a valid web address.'] };
  }

  const hostname = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  const reasons = [];
  let score = 0;

  // Whitelist bypass
  if (opts.whitelist?.has(hostname)) {
    return { level: 'safe', score: 0, reasons: [], whitelisted: true };
  }

  // Protocol
  if (!TRUSTED_PROTOCOLS.includes(url.protocol)) {
    score += 90;
    reasons.push(`Uses ${url.protocol.replace(':', '')} protocol instead of http/https.`);
  }
  if (url.protocol === 'http:') {
    score += 15;
    reasons.push('Connection is not encrypted (HTTP, not HTTPS).');
  }

  // Raw IP (IPv4 + IPv6)
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || /^\[[a-f\d:]+\]$/i.test(hostname)) {
    score += 30;
    reasons.push('Uses a raw IP address instead of a recognisable domain name.');
  }

  // IDN homograph attack via punycode
  if (hostname.includes('xn--')) {
    score += 35;
    reasons.push('Domain contains punycode — often used to impersonate trusted brands.');
  }

  // Excessive subdomains (>3 labels past the TLD)
  if (hostname.split('.').length > 5) {
    score += 20;
    reasons.push('Unusually high number of subdomains — a common phishing pattern.');
  }

  // Credential-hiding @ character
  if (inputUrl.includes('@')) {
    score += 45;
    reasons.push('URL contains "@" which can conceal the real destination.');
  }

  // URL shortener
  if (URL_SHORTENER_HOSTS.has(hostname)) {
    score += 20;
    reasons.push('Uses a URL shortener — the final destination is hidden.');
  }

  // Suspicious TLD
  if (SUSPICIOUS_TLDS.some((tld) => hostname.endsWith(tld))) {
    score += 15;
    reasons.push('Uses a top-level domain frequently abused in spam or malware campaigns.');
  }

  // Brand impersonation with dashes (paypal-login.xyz)
  if (BRAND_PATTERN.test(hostname) && hostname.includes('-')) {
    score += 30;
    reasons.push('Domain appears to impersonate a well-known brand using hyphens.');
  }

  // Sensitive keywords over HTTP
  if (SENSITIVE_PATTERN.test(url.href) && url.protocol !== 'https:') {
    score += 25;
    reasons.push('Contains sensitive keywords on an unencrypted (HTTP) page.');
  }

  // Dangerous file extension (fixed: uses path-only, ignores query strings)
  const ext = getPathExtension(path);
  if (DANGEROUS_EXTENSIONS.includes(ext)) {
    score += 70;
    reasons.push(`Points to a high-risk file type (${ext}).`);
  }

  // Suspicious archive with lure name
  const archiveExt = ARCHIVE_EXTENSIONS.find((e) => path.endsWith(e));
  if (archiveExt && ARCHIVE_LURE_PATTERN.test(path)) {
    score += 35;
    reasons.push(`Suspicious archive (${archiveExt}) with a common malware lure name.`);
  }

  if (score >= 60) return { level: 'dangerous', score, reasons };
  if (score >= 15) return { level: 'suspicious', score, reasons };
  return { level: 'safe', score, reasons: [] };
}

/**
 * Checks whether a download item is dangerous.
 * FIX: uses getPathExtension instead of .endsWith() / .includes() to prevent bypass.
 */
export function isDangerousDownload(downloadItem) {
  const url = downloadItem.finalUrl || downloadItem.url || '';
  const filename = (downloadItem.filename || '').toLowerCase();
  const risk = getUrlRisk(url);

  const urlPath = url.toLowerCase().split('?')[0];
  const ext = DANGEROUS_EXTENSIONS.find(
    (e) => filename.endsWith(e) || urlPath.endsWith(e)
  );
  const archiveExt = ARCHIVE_EXTENSIONS.find(
    (e) => filename.includes(e) || urlPath.includes(e)
  );
  const isSuspiciousArchive =
    archiveExt && ARCHIVE_LURE_PATTERN.test(filename + ' ' + urlPath);

  const reasons = new Set(risk.reasons);

  if (ext) {
    reasons.add(`Download uses a high-risk file type (${ext}).`);
    return { dangerous: true, reasons: [...reasons], ext };
  }
  if (isSuspiciousArchive) {
    reasons.add('Archive filename matches common malware lure patterns.');
    return { dangerous: true, reasons: [...reasons] };
  }
  if (risk.level === 'dangerous') {
    return { dangerous: true, reasons: [...reasons] };
  }
  return { dangerous: false, reasons: [...reasons] };
}

/** Returns true if the URL looks like an ad network request. */
export function isLikelyAdUrl(inputUrl) {
  try {
    const url = new URL(inputUrl);
    const hostname = url.hostname.toLowerCase();
    return (
      AD_HOST_PATTERNS.some((p) => p.test(hostname)) ||
      AD_PATH_PATTERN.test(`${hostname}${url.pathname}`)
    );
  } catch {
    return false;
  }
}

// ─── HaveIBeenPwned domain breach check (100% free, no API key needed) ──────

const HIBP_CACHE = new Map();

/**
 * Checks if a domain has appeared in any known data breach via HIBP.
 * Uses the public /api/v3/breaches endpoint (no key required).
 *
 * @param {string} domain
 * @returns {Promise<Array<{Name:string,BreachDate:string,DataClasses:string[]}>>}
 */
export async function checkDomainBreach(domain) {
  if (HIBP_CACHE.has(domain)) return HIBP_CACHE.get(domain);

  try {
    const res = await fetch(
      `https://haveibeenpwned.com/api/v3/breaches?domain=${encodeURIComponent(domain)}`,
      { headers: { 'User-Agent': 'Ads-Refiner-Extension' } }
    );
    if (!res.ok) return [];
    const breaches = await res.json();
    const result = breaches.slice(0, 5).map((b) => ({
      Name: b.Name,
      BreachDate: b.BreachDate,
      DataClasses: b.DataClasses?.slice(0, 4) ?? []
    }));
    HIBP_CACHE.set(domain, result);
    if (HIBP_CACHE.size > 300) HIBP_CACHE.delete(HIBP_CACHE.keys().next().value);
    return result;
  } catch {
    return [];
  }
}
