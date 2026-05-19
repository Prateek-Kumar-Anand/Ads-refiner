export const DANGEROUS_FILE_EXTENSIONS = [
  '.apk', '.bat', '.cmd', '.com', '.cpl', '.dll', '.dmg', '.exe', '.hta',
  '.iso', '.jar', '.js', '.jse', '.msi', '.ps1', '.scr', '.vbe', '.vbs', '.wsf'
];

export const TRUSTED_PROTOCOLS = ['http:', 'https:'];

export function getUrlRisk(inputUrl) {
  let url;
  try {
    url = new URL(inputUrl);
  } catch {
    return {
      level: 'dangerous',
      reasons: ['The link is not a valid web address.']
    };
  }

  const reasons = [];
  const hostname = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();

  if (!TRUSTED_PROTOCOLS.includes(url.protocol)) {
    reasons.push(`The link uses the ${url.protocol.replace(':', '')} protocol instead of http or https.`);
  }

  if (url.protocol === 'http:') {
    reasons.push('The link is not encrypted with HTTPS.');
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    reasons.push('The link uses a raw IP address instead of a recognizable domain.');
  }

  if (hostname.includes('xn--')) {
    reasons.push('The domain contains punycode, which can be used to imitate trusted brands.');
  }

  if (hostname.split('.').length > 5) {
    reasons.push('The domain has many subdomains, a common phishing sign.');
  }

  if (/@/.test(inputUrl)) {
    reasons.push('The link contains an @ symbol, which can hide the real destination.');
  }

  if (/(login|verify|secure|account|password|wallet|bank|free|gift|prize)/i.test(url.href) && url.protocol !== 'https:') {
    reasons.push('The link combines sensitive words with a non-HTTPS destination.');
  }

  const dangerousExtension = DANGEROUS_FILE_EXTENSIONS.find((extension) => path.endsWith(extension));
  if (dangerousExtension) {
    reasons.push(`The link points to a high-risk download type (${dangerousExtension}).`);
  }

  if (reasons.length >= 2 || dangerousExtension || !TRUSTED_PROTOCOLS.includes(url.protocol)) {
    return { level: 'dangerous', reasons };
  }

  if (reasons.length === 1) {
    return { level: 'suspicious', reasons };
  }

  return { level: 'safe', reasons: [] };
}

export function isDangerousDownload(downloadItem) {
  const url = downloadItem.finalUrl || downloadItem.url || '';
  const filename = (downloadItem.filename || '').toLowerCase();
  const risk = getUrlRisk(url);
  const riskyExtension = DANGEROUS_FILE_EXTENSIONS.find((extension) => filename.endsWith(extension) || url.toLowerCase().split('?')[0].endsWith(extension));

  if (riskyExtension) {
    return {
      dangerous: true,
      reasons: [`The download uses a high-risk file type (${riskyExtension}).`, ...risk.reasons]
    };
  }

  if (risk.level === 'dangerous') {
    return {
      dangerous: true,
      reasons: risk.reasons
    };
  }

  return {
    dangerous: false,
    reasons: risk.reasons
  };
}
