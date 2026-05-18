# Ads-refiner

Ads Refiner is a Chrome/Chromium Manifest V3 browser extension that blocks common ad network requests, hides obvious ad containers, warns before opening suspicious links, and cancels risky browser downloads.

## Features

- Blocks common ad and tracking requests with `declarativeNetRequest` rules.
- Hides likely ad slots injected into pages.
- Checks clicked links and top-level navigation for suspicious signals such as non-HTTPS pages, raw IP addresses, punycode domains, misleading `@` links, and high-risk executable download types.
- Shows a warning page that lets the user choose **Go back** or **Go on anyway** before visiting a suspicious link.
- Cancels risky downloads and shows this notification message: `suspecious virus and torjan might be in the system`.
- Opens a safety panel from the notification so the user can review suspicious browser downloads and tabs, then choose **Ignore it** or **Solve it by deleting**.

> Browser extensions cannot scan the entire operating system or remove arbitrary system files. This project focuses on browser-accessible protection: URLs, open tabs, and downloads that Chrome exposes to extensions.

## Load the extension locally

1. Open Chrome or any Chromium browser.
2. Go to `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select this repository folder.

## Project structure

```text
manifest.json          Extension permissions, service worker, popup, and rule configuration
rules/ads.json         Static ad-blocking network rules
src/background.js      Link navigation, download blocking, notification, and scan logic
src/content.js         Page-level ad hiding and clicked-link checks
src/popup.html         Safety panel UI
src/warning.html       Suspicious-link interstitial UI
src/safety.js          Shared URL and download risk heuristics
```
