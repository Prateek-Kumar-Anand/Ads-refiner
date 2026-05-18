(function initAdsRefinerSafety(globalScope) {
  const DANGEROUS_FILE_EXTENSIONS = [
    '.apk', '.appinstaller', '.appx', '.bat', '.cmd', '.com', '.cpl', '.dll', '.dmg', '.exe', '.gadget', '.hta',
    '.inf', '.iso', '.jar', '.js', '.jse', '.lnk', '.msi', '.msix', '.ps1', '.reg', '.scr', '.vbe', '.vbs', '.wsf'
  ];
  const ARCHIVE_EXTENSIONS = ['.7z', '.gz', '.rar', '.tar', '.zip'];
  const TRUSTED_PROTOCOLS = ['http:', 'https:'];
  const SUSPICIOUS_TLDS = ['.buzz', '.click', '.country', '.fit', '.gq', '.kim', '.loan', '.mom', '.party', '.quest', '.rest', '.ru', '.tk', '.top', '.work', '.xyz'];
  const URL_SHORTENER_HOSTS = new Set(['bit.ly', 'cutt.ly', 'is.gd', 'ow.ly', 'rebrand.ly', 's.id', 'shorturl.at', 't.co', 'tiny.cc', 'tinyurl.com', 'trib.al']);
  const SENSITIVE_WORDS = /(login|verify|secure|account|password|wallet|bank|invoice|payment|free|gift|prize|airdrop|crypto|support|update|download)/i;
  const BRAND_IMPERSONATION_WORDS = /(apple|facebook|google|instagram|microsoft|netflix|paypal|whatsapp|windows|youtube)/i;
  const AD_HOST_PATTERNS = [/(^|\.)2mdn\.net$/, /(^|\.)adnxs\.com$/, /(^|\.)adsystem\.com$/, /(^|\.)doubleclick\.net$/, /(^|\.)googlesyndication\.com$/, /(^|\.)googleadservices\.com$/, /(^|\.)googletagmanager\.com$/, /(^|\.)googletagservices\.com$/, /(^|\.)scorecardresearch\.com$/, /(^|\.)taboola\.com$/, /(^|\.)outbrain\.com$/];
  const AD_PATH_PATTERN = /(^|[./_-])(ad|ads|advert|banner|sponsor|sponsored|tracking|pixel|analytics)[0-9]*([./_-]|$)/i;

  function getUrlRisk(inputUrl) {
    let url;
    try {
      url = new URL(inputUrl);
    } catch {
      return { level: 'dangerous', score: 100, reasons: ['The link is not a valid web address.'] };
    }

    const reasons = [];
    const hostname = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    let score = 0;

    if (!TRUSTED_PROTOCOLS.includes(url.protocol)) {
      score += 90;
      reasons.push(`The link uses the ${url.protocol.replace(':', '')} protocol instead of http or https.`);
    }

    if (url.protocol === 'http:') {
      score += 15;
      reasons.push('The link is not encrypted with HTTPS.');
    }

    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || /^\[[a-f0-9:]+]$/i.test(hostname)) {
      score += 30;
      reasons.push('The link uses a raw IP address instead of a recognizable domain.');
    }

    if (hostname.includes('xn--')) {
      score += 35;
      reasons.push('The domain contains punycode, which can be used to imitate trusted brands.');
    }

    if (hostname.split('.').length > 5) {
      score += 20;
      reasons.push('The domain has many subdomains, a common phishing sign.');
    }

    if (/@/.test(inputUrl)) {
      score += 45;
      reasons.push('The link contains an @ symbol, which can hide the real destination.');
    }

    if (URL_SHORTENER_HOSTS.has(hostname)) {
      score += 20;
      reasons.push('The link uses a URL shortener, so the final destination is hidden.');
    }

    if (SENSITIVE_WORDS.test(url.href) && url.protocol !== 'https:') {
      score += 25;
      reasons.push('The link combines sensitive words with a non-HTTPS destination.');
    }

    if (BRAND_IMPERSONATION_WORDS.test(hostname) && hostname.split('-').length > 2) {
      score += 25;
      reasons.push('The domain name looks like it may be imitating a well-known brand.');
    }

    if (SUSPICIOUS_TLDS.some((tld) => hostname.endsWith(tld))) {
      score += 15;
      reasons.push('The link uses a top-level domain commonly abused by spam or malware campaigns.');
    }

    const dangerousExtension = DANGEROUS_FILE_EXTENSIONS.find((extension) => path.endsWith(extension));
    if (dangerousExtension) {
      score += 70;
      reasons.push(`The link points to a high-risk download type (${dangerousExtension}).`);
    }

    const archiveExtension = ARCHIVE_EXTENSIONS.find((extension) => path.endsWith(extension));
    if (archiveExtension && /setup|crack|keygen|patch|activator|invoice|receipt|statement/i.test(path)) {
      score += 35;
      reasons.push(`The link points to a suspicious archive download (${archiveExtension}).`);
    }

    if (score >= 60) return { level: 'dangerous', score, reasons };
    if (score >= 15) return { level: 'suspicious', score, reasons };
    return { level: 'safe', score, reasons: [] };
  }

  function isDangerousDownload(downloadItem) {
    const url = downloadItem.finalUrl || downloadItem.url || '';
    const filename = (downloadItem.filename || '').toLowerCase();
    const risk = getUrlRisk(url);
    const path = `${filename} ${url.toLowerCase().split('?')[0]}`;
    const riskyExtension = DANGEROUS_FILE_EXTENSIONS.find((extension) => path.includes(extension));
    const suspiciousArchive = ARCHIVE_EXTENSIONS.find((extension) => path.includes(extension)) && /setup|crack|keygen|patch|activator|invoice|receipt|statement/i.test(path);

    if (riskyExtension) return { dangerous: true, reasons: [...new Set([`The download uses a high-risk file type (${riskyExtension}).`, ...risk.reasons])] };
    if (suspiciousArchive) return { dangerous: true, reasons: [...new Set(['The archive name matches common malware lure words.', ...risk.reasons])] };
    if (risk.level === 'dangerous') return { dangerous: true, reasons: risk.reasons };
    return { dangerous: false, reasons: risk.reasons };
  }

  function isLikelyAdUrl(inputUrl) {
    try {
      const url = new URL(inputUrl);
      const hostname = url.hostname.toLowerCase();
      return AD_HOST_PATTERNS.some((pattern) => pattern.test(hostname)) || AD_PATH_PATTERN.test(`${hostname}${url.pathname}`);
    } catch {
      return false;
    }
  }

  globalScope.adsRefinerSafety = { getUrlRisk, isDangerousDownload, isLikelyAdUrl };
})(globalThis);
