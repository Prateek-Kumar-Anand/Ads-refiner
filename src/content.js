const api = globalThis.adsRefinerApi;
const WARNING_CLASS = 'ads-refiner-link-warning';
const SETTINGS_KEYS = ['enabled', 'popupKiller', 'readerMode', 'sponsorBlock'];

const adSelectors = [
  '[id^="ad-"]', '[id*="-ad-"]', '[class*=" ad-"]', '[class*=" ads-"]',
  '[class*="advert"]', '[class*="sponsor"]', 'iframe[src*="/ads/"]',
  'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]'
];

const popupKillSelectors = [
  '[id*="cookie"]', '[class*="cookie"]', '[id*="gdpr"]', '[class*="gdpr"]',
  '[id*="newsletter"]', '[class*="newsletter"]', '[class*="modal"]', '[role="dialog"]',
  '[class*="overlay"]', '[id*="overlay"]', '[class*="consent"]', '[id*="consent"]'
];

let runtimeSettings = { enabled: true, popupKiller: true, readerMode: true, sponsorBlock: true };
init();

async function init() {
  runtimeSettings = { ...runtimeSettings, ...(await api.storage.local.get(SETTINGS_KEYS)) };
  hideLikelyAds();
  if (runtimeSettings.popupKiller) killPopups();
  if (runtimeSettings.readerMode) injectReaderButton();
  if (runtimeSettings.sponsorBlock) setupSponsorBlock();
}

function getLocalUrlRisk(inputUrl) {
  try {
    const url = new URL(inputUrl);
    const reasons = [];
    const host = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol)) reasons.push('Non-web protocol.');
    if (url.protocol === 'http:') reasons.push('Not HTTPS.');
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) reasons.push('Raw IP domain.');
    if (host.includes('xn--')) reasons.push('Punycode domain.');
    if (/(bit\.ly|tinyurl\.com|t\.co|cutt\.ly|shorturl\.at)$/.test(host)) reasons.push('URL shortener used.');
    if (/(\.buzz|\.click|\.quest|\.top|\.work|\.xyz)$/.test(host)) reasons.push('Suspicious TLD.');
    return reasons.length >= 2 ? { level: 'dangerous', reasons } : reasons.length ? { level: 'suspicious', reasons } : { level: 'safe', reasons: [] };
  } catch {
    return { level: 'dangerous', reasons: ['Invalid URL.'] };
  }
}

function hideLikelyAds() {
  for (const selector of adSelectors) {
    document.querySelectorAll(selector).forEach((element) => element.setAttribute('data-ads-refiner-hidden', 'true'));
  }
}

function killPopups() {
  for (const selector of popupKillSelectors) {
    document.querySelectorAll(selector).forEach((element) => {
      element.setAttribute('data-ads-refiner-hidden', 'true');
      element.style.display = 'none';
    });
  }
}

function removeInlineWarning(anchor) {
  const next = anchor.nextElementSibling;
  if (next?.classList.contains(WARNING_CLASS)) {
    next.remove();
  }
}

function showInlineWarning(anchor, risk) {
  removeInlineWarning(anchor);
  const warning = document.createElement('span');
  warning.className = WARNING_CLASS;
  warning.textContent = `Ads Refiner: ${risk.level} link detected. Click again to continue.`;
  warning.title = risk.reasons.join('\n');
  anchor.insertAdjacentElement('afterend', warning);
  setTimeout(() => warning.remove(), 8000);
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
  anchor.dataset.adsRefinerAllowed = 'true';
}, true);

let debounceTimer = null;
const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    hideLikelyAds();
    if (runtimeSettings.popupKiller) {
      killPopups();
    }
  }, 200);
});
observer.observe(document.documentElement, { childList: true, subtree: true });

function injectReaderButton() {
  if (document.getElementById('ads-refiner-reader-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'ads-refiner-reader-btn';
  btn.textContent = 'Reader Mode';
  btn.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;padding:8px 12px;background:#102a43;color:#fff;border:none;border-radius:999px;cursor:pointer;';
  btn.addEventListener('click', activateReaderMode);
  document.documentElement.append(btn);
}

function activateReaderMode() {
  const parsed = new Readability(document.cloneNode(true)).parse();
  if (!parsed) return;
  document.body.innerHTML = `<main style="max-width:860px;margin:2rem auto;padding:1rem;font-family:system-ui;line-height:1.7"><h1>${parsed.title}</h1>${parsed.content}</main>`;
}

async function setupSponsorBlock() {
  if (!/youtube\.com$/.test(location.hostname)) return;
  const params = new URLSearchParams(location.search);
  const videoID = params.get('v');
  if (!videoID) return;
  try {
    const response = await fetch(`https://sponsorblock.danielnerenberg.com/api/skipSegments?videoID=${encodeURIComponent(videoID)}`);
    const segments = await response.json();
    const video = document.querySelector('video');
    if (!video || !Array.isArray(segments)) return;
    video.addEventListener('timeupdate', () => {
      for (const segment of segments) {
        const [start, end] = segment;
        if (video.currentTime >= start && video.currentTime < end) {
          video.currentTime = end;
          break;
        }
      }
    });
  } catch {
    // ignore network errors
  }
}
