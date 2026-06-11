// src/safety-browser.js — Firefox IIFE (mirrors safety.js exactly, for script-tag loading)
// Shared core: any logic change here must be reflected in safety.js and vice-versa.

(function initAdsRefinerSafety(g) {
  'use strict';

  // ─── Constants ───────────────────────────────────────────────────────────────

  // FIX #5: .js/.jse removed from general dangerous list (false positives on CDN scripts)
  const DANGEROUS_EXTENSIONS = [
    '.apk', '.appinstaller', '.appx', '.bat', '.cmd', '.com', '.cpl',
    '.dll', '.dmg', '.exe', '.gadget', '.hta', '.inf', '.iso', '.jar',
    '.lnk', '.msi', '.msix', '.ps1', '.reg', '.scr',
    '.vbe', '.vbs', '.wsf', '.xbap'
  ];
  const DOWNLOAD_ONLY_DANGEROUS = ['.js', '.jse'];

  const ARCHIVE_EXTENSIONS = ['.7z', '.gz', '.rar', '.tar', '.zip'];
  const TRUSTED_PROTOCOLS = ['http:', 'https:'];

  const SUSPICIOUS_TLDS = [
    '.buzz', '.cc', '.cf', '.cfd', '.click', '.country', '.cyou', '.fit',
    '.ga', '.gq', '.icu', '.kim', '.loan', '.ml', '.mom', '.party',
    '.pw', '.quest', '.rest', '.ru', '.su', '.tk', '.top', '.work', '.xyz'
  ];

  const URL_SHORTENER_HOSTS = new Set([
    'bit.ly', 'bl.ink', 'clck.ru', 'cutt.ly', 'is.gd', 'ow.ly',
    'rb.gy', 'rebrand.ly', 's.id', 'short.io', 'shorturl.at', 'snip.ly',
    't.co', 'tiny.cc', 'tinyurl.com', 'trib.al'
  ]);

  const AD_HOST_PATTERNS = [
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

  // Safe regex — no nested quantifiers, no catastrophic backtracking
  const BRAND_PATTERN = /(?:apple|facebook|google|instagram|microsoft|netflix|paypal|whatsapp|windows|youtube)/i;
  const SENSITIVE_PATTERN = /(?:login|verify|secure|account|password|wallet|bank|invoice|payment|free|gift|prize|airdrop|crypto|support|update|download)/i;
  const ARCHIVE_LURE_PATTERN = /(?:setup|crack|keygen|patch|activator|invoice|receipt|statement|refund|bonus)/i;
  const AD_PATH_PATTERN = /(?:^|[./_-])(?:ad|ads|advert|banner|sponsor|tracking|pixel|analytics)\d*(?:[./_-]|$)/i;

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function getPathExtension(pathname) {
    var clean = pathname.split('?')[0].split('#')[0];
    var dot = clean.lastIndexOf('.');
    return dot !== -1 ? clean.slice(dot).toLowerCase() : '';
  }

  // ─── Core Risk Engine ─────────────────────────────────────────────────────────

  function getUrlRisk(inputUrl, opts) {
    opts = opts || {};
    var url;
    try { url = new URL(inputUrl); }
    catch (_) { return { level: 'dangerous', score: 100, reasons: ['The link is not a valid web address.'] }; }

    var hostname = url.hostname.toLowerCase();
    var path = url.pathname.toLowerCase();
    var reasons = [];
    var score = 0;

    if (opts.whitelist && opts.whitelist.has(hostname)) {
      return { level: 'safe', score: 0, reasons: [], whitelisted: true };
    }

    if (!TRUSTED_PROTOCOLS.includes(url.protocol)) {
      score += 90;
      reasons.push('Uses ' + url.protocol.replace(':', '') + ' protocol instead of http/https.');
    }
    if (url.protocol === 'http:') {
      score += 15;
      reasons.push('Connection is not encrypted (HTTP, not HTTPS).');
    }
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || /^\[[a-f\d:]+\]$/i.test(hostname)) {
      score += 30;
      reasons.push('Uses a raw IP address instead of a recognisable domain name.');
    }
    if (hostname.includes('xn--')) {
      score += 35;
      reasons.push('Domain contains punycode — often used to impersonate trusted brands.');
    }
    if (hostname.split('.').length > 5) {
      score += 20;
      reasons.push('Unusually high number of subdomains — a common phishing pattern.');
    }
    if (inputUrl.includes('@')) {
      score += 45;
      reasons.push('URL contains "@" which can conceal the real destination.');
    }
    if (URL_SHORTENER_HOSTS.has(hostname)) {
      score += 20;
      reasons.push('Uses a URL shortener — the final destination is hidden.');
    }
    if (SUSPICIOUS_TLDS.some(function(tld) { return hostname.endsWith(tld); })) {
      score += 15;
      reasons.push('Uses a top-level domain frequently abused in spam or malware campaigns.');
    }
    if (BRAND_PATTERN.test(hostname) && hostname.includes('-')) {
      score += 30;
      reasons.push('Domain appears to impersonate a well-known brand using hyphens.');
    }
    if (SENSITIVE_PATTERN.test(url.href) && url.protocol !== 'https:') {
      score += 25;
      reasons.push('Contains sensitive keywords on an unencrypted (HTTP) page.');
    }

    var ext = getPathExtension(path);
    if (DANGEROUS_EXTENSIONS.includes(ext)) {
      score += 70;
      reasons.push('Points to a high-risk file type (' + ext + ').');
    }

    var archiveExt = ARCHIVE_EXTENSIONS.find(function(e) { return path.endsWith(e); });
    if (archiveExt && ARCHIVE_LURE_PATTERN.test(path)) {
      score += 35;
      reasons.push('Suspicious archive (' + archiveExt + ') with a common malware lure name.');
    }

    if (score >= 60) return { level: 'dangerous', score: score, reasons: reasons };
    if (score >= 15) return { level: 'suspicious', score: score, reasons: reasons };
    return { level: 'safe', score: 0, reasons: [] };
  }

  function isDangerousDownload(downloadItem) {
    var url = downloadItem.finalUrl || downloadItem.url || '';
    var filename = (downloadItem.filename || '').toLowerCase();
    var risk = getUrlRisk(url);
    var urlPath = url.toLowerCase().split('?')[0];
    // FIX #5: include .js/.jse for explicit downloads
    var allDangerousForDownload = DANGEROUS_EXTENSIONS.concat(DOWNLOAD_ONLY_DANGEROUS);
    var ext = allDangerousForDownload.find(function(e) { return filename.endsWith(e) || urlPath.endsWith(e); });
    var archiveExt = ARCHIVE_EXTENSIONS.find(function(e) { return filename.includes(e) || urlPath.includes(e); });
    var isSuspiciousArchive = archiveExt && ARCHIVE_LURE_PATTERN.test(filename + ' ' + urlPath);
    var reasons = new Set(risk.reasons);

    if (ext) {
      reasons.add('Download uses a high-risk file type (' + ext + ').');
      return { dangerous: true, reasons: Array.from(reasons), ext: ext };
    }
    if (isSuspiciousArchive) {
      reasons.add('Archive filename matches common malware lure patterns.');
      return { dangerous: true, reasons: Array.from(reasons) };
    }
    if (risk.level === 'dangerous') return { dangerous: true, reasons: Array.from(reasons) };
    return { dangerous: false, reasons: Array.from(reasons) };
  }

  function isLikelyAdUrl(inputUrl) {
    try {
      var url = new URL(inputUrl);
      var hostname = url.hostname.toLowerCase();
      return AD_HOST_PATTERNS.some(function(p) { return p.test(hostname); }) ||
             AD_PATH_PATTERN.test(hostname + url.pathname);
    } catch (_) { return false; }
  }

  // ─── Export ──────────────────────────────────────────────────────────────────

  g.adsRefinerSafety = {
    getUrlRisk: getUrlRisk,
    isDangerousDownload: isDangerousDownload,
    isLikelyAdUrl: isLikelyAdUrl,
    DANGEROUS_EXTENSIONS: DANGEROUS_EXTENSIONS
  };
})(globalThis);
