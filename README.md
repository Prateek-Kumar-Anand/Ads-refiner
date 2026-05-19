# Ads-refiner

Ads Refiner is a cross-browser WebExtension that blocks common ad/tracking resources, hides obvious ad containers, warns before opening suspicious links, and cancels risky browser downloads.

## Platform support

- **Windows:** load `manifest.json` in Chrome, Edge, Brave, or other Chromium browsers.
- **Android:** load `manifest.firefox.json` in Firefox for Android or another Android browser that supports standard WebExtensions. Chrome for Android does not support the same unpacked extension workflow as desktop Chromium, so the Android build is Firefox/WebExtension focused.

## Features

- Blocks common ad and tracking requests with Chromium `declarativeNetRequest` rules and a Firefox `webRequestBlocking` fallback.
- Hides likely ad slots injected into pages.
- Checks clicked links and top-level navigation for suspicious signals such as non-HTTPS pages, raw IP addresses, punycode domains, misleading `@` links, URL shorteners, abused top-level domains, brand-impersonation patterns, malware lure words, suspicious archives, and high-risk executable download types.
- Shows a warning page that lets the user choose **Go back** or **Go on anyway** before visiting a suspicious link.
- Cancels risky downloads and shows this notification message: `suspecious virus and torjan might be in the system`.
- Opens a safety panel from the notification so the user can review suspicious browser downloads and tabs, then choose **Ignore it** or **Solve it by deleting**.
- Provides separate toggles for ad blocking, suspicious-link warnings, and risky-download blocking.

> Browser extensions cannot scan the entire operating system or remove arbitrary system files. This project focuses on browser-accessible protection: URLs, open tabs, and downloads that the browser exposes to extensions.

## Load the Windows/Chromium extension locally

1. Open Chrome, Edge, Brave, or another Chromium browser on Windows.
2. Go to `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this repository folder. Chromium uses `manifest.json` automatically.

## Load the Android/Firefox extension for testing

1. Use Firefox for Android or another Android browser with WebExtension support.
2. Package this folder while using `manifest.firefox.json` as the extension manifest.
3. Install the packaged extension through the browser's supported developer/testing flow.

## Project structure

```text
manifest.json                 Chromium MV3 manifest for Windows desktop browsers
manifest.firefox.json         Firefox MV2 manifest for Android/Desktop WebExtension support
rules/ads.json                Static Chromium ad-blocking network rules
src/browser-api.js            Chrome/browser promise compatibility wrapper
src/background.js             Chromium MV3 service worker logic
src/background-firefox.html   Firefox background page loader
src/background-firefox.js     Firefox/Android background logic
src/content.js                Page-level ad hiding and clicked-link checks
src/popup.html                Safety panel UI
src/warning.html              Suspicious-link interstitial UI
src/safety.js                 Chromium module URL and download risk heuristics
src/safety-browser.js         Firefox classic-script URL and download risk heuristics
```
