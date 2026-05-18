const api = globalThis.adsRefinerApi;
const WARNING_CLASS = 'ads-refiner-link-warning';


function getLocalUrlRisk(inputUrl) {
  try {
    const url = new URL(inputUrl);
    const reasons = [];
    const hostname = url.hostname.toLowerCase();
    const pathname = url.pathname.toLowerCase();
    const dangerousExtension = ['.apk', '.appinstaller', '.appx', '.bat', '.cmd', '.com', '.cpl', '.dll', '.dmg', '.exe', '.hta', '.iso', '.jar', '.js', '.jse', '.lnk', '.msi', '.msix', '.ps1', '.reg', '.scr', '.vbe', '.vbs', '.wsf']
      .find((extension) => pathname.endsWith(extension));

    if (!['http:', 'https:'].includes(url.protocol)) reasons.push('The link does not use http or https.');
    if (url.protocol === 'http:') reasons.push('The link is not encrypted with HTTPS.');
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) reasons.push('The link uses a raw IP address.');
    if (hostname.includes('xn--')) reasons.push('The domain may be imitating another website.');
    if (hostname.split('.').length > 5) reasons.push('The domain has many subdomains.');
    if (/(bit\.ly|tinyurl\.com|t\.co|cutt\.ly|shorturl\.at)$/.test(hostname)) reasons.push('The link uses a URL shortener.');
    if (/(\.buzz|\.click|\.quest|\.top|\.work|\.xyz)$/.test(hostname)) reasons.push('The link uses a domain ending commonly abused by spam or malware campaigns.');
    if (dangerousExtension) reasons.push(`The link points to a high-risk download type (${dangerousExtension}).`);

    if (reasons.length >= 2 || dangerousExtension || !['http:', 'https:'].includes(url.protocol)) {
      return { level: 'dangerous', reasons };
    }

    if (reasons.length === 1) {
      return { level: 'suspicious', reasons };
    }

    return { level: 'safe', reasons: [] };
  } catch {
    return { level: 'dangerous', reasons: ['The link is not a valid web address.'] };
  }
}

const adSelectors = [
  '[id^="ad-"]', '[id*="-ad-"]', '[class*=" ad-"]', '[class*=" ads-"]',
  '[class*="advert"]', '[class*="sponsor"]', 'iframe[src*="/ads/"]',
  'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]'
];

function hideLikelyAds() {
  for (const selector of adSelectors) {
    document.querySelectorAll(selector).forEach((element) => {
      element.setAttribute('data-ads-refiner-hidden', 'true');
    });
  }
}

function showInlineWarning(anchor, risk) {
  removeInlineWarning(anchor);

  const warning = document.createElement('span');
  warning.className = WARNING_CLASS;
  warning.textContent = `Ads Refiner: ${risk.level} link. Click again to continue.`;
  warning.title = risk.reasons.join('\n');
  anchor.insertAdjacentElement('afterend', warning);
  setTimeout(() => warning.remove(), 8000);
}

function removeInlineWarning(anchor) {
  const next = anchor.nextElementSibling;
  if (next?.classList.contains(WARNING_CLASS)) {
    next.remove();
  }
}

document.addEventListener('click', (event) => {
  const anchor = event.target.closest?.('a[href]');
  if (!anchor || anchor.dataset.adsRefinerAllowed === 'true') {
    return;
  }

  const risk = getLocalUrlRisk(anchor.href);
  if (risk.level === 'safe') {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  showInlineWarning(anchor, risk);

  const warningUrl = new URL(api.runtime.getURL('src/warning.html'));
  warningUrl.searchParams.set('target', anchor.href);
  warningUrl.searchParams.set('level', risk.level);
  warningUrl.searchParams.set('reasons', JSON.stringify(risk.reasons));
  window.location.assign(warningUrl.href);
}, true);

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hideLikelyAds, { once: true });
} else {
  hideLikelyAds();
}

const observer = new MutationObserver(hideLikelyAds);

function startObserver() {
  const root = document.documentElement || document.body;
  if (root) {
    observer.observe(root, {
      childList: true,
      subtree: true
    });
  }
}

if (document.documentElement || document.body) {
  startObserver();
} else {
  document.addEventListener('DOMContentLoaded', startObserver, { once: true });
}
