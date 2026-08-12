<div align="center">

<img src="src/icons/icon128.png" width="96" height="96" alt="Ads Refiner logo" />

# 🛡️ Ads Refiner — Safe Link Guard

**A free, privacy-first browser extension that blocks ads and trackers, warns about suspicious links, blocks risky downloads, and helps you understand what is happening in your browser.**

<p>
  <img src="https://img.shields.io/badge/Manifest-V3-4f46e5?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Chrome-116%2B-4f46e5?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Chrome 116+" />
  <img src="https://img.shields.io/badge/Price-100%25%20Free-059669?style=for-the-badge" alt="100% free" />
  <img src="https://img.shields.io/badge/Accounts-None%20Required-059669?style=for-the-badge" alt="No accounts required" />
</p>

</div>

---

## ✨ What is Ads Refiner?

Ads Refiner is a lightweight browser extension for safer, cleaner browsing. It uses Chrome's native `declarativeNetRequest` API to block ad and tracker requests quickly, then adds local safety checks for suspicious links, risky downloads, whitelist management, dashboards, and browsing statistics.

No sign-ups, API keys, subscriptions, or cloud accounts are required. Your settings, logs, counters, whitelist, and dashboard data stay in your browser through local extension storage.

---

## 🚀 Features

### 🧱 Ad and Tracker Blocking

- Blocks known ad-network requests with static rules from `rules/ads.json`.
- Blocks known tracker requests with static rules from `rules/trackers.json`.
- Hides leftover page ad containers with cosmetic blocking.
- Shows live counters for blocked ads, blocked trackers, and checked URLs.

### ⚠️ Suspicious Link Guard

Ads Refiner checks clicked links and top-level navigation for warning signs, including:

- Non-HTTPS pages.
- Raw IP-address URLs.
- Punycode and lookalike-domain patterns.
- Misleading links that include `@` characters.
- High-risk executable download types.

When a link looks suspicious, Ads Refiner shows a warning page before you continue.

### ⬇️ Download Protection

- Detects risky download URLs and file types.
- Cancels suspicious downloads when protection is enabled.
- Shows a desktop notification for blocked downloads.
- Lets you review flagged items from the Safety Panel.

### 📊 Analytics Dashboard

- View a breakdown of blocked ads, trackers, suspicious links, and risky downloads.
- Review recent security events and browsing-safety history.
- Track domain reputation locally.
- Export activity data as JSON or CSV.
- Clear stored logs when you want a fresh start.

### 🖥️ System Dashboard

- Monitor browser RAM usage from the extension dashboard.
- Track time spent per site for the current day and all time.
- Review session and daily browsing stats.

### ⚙️ User Controls

Each protection layer can be enabled or disabled independently:

| Setting | Purpose |
| --- | --- |
| Enable protection | Master on/off switch for Ads Refiner protections. |
| Block ads | Enables network-level ad blocking. |
| Block trackers | Enables network-level tracker blocking. |
| Warn on suspicious links | Shows an interstitial before suspicious links. |
| Block risky downloads | Cancels high-risk downloads. |
| Cosmetic ad blocking | Hides visible ad slots left on pages. |

---

## 🔒 Privacy

Ads Refiner is designed to avoid unnecessary external requests:

- Data is stored locally with `chrome.storage`.
- Dashboard stats and logs are kept on your device.
- Letter-based favicons are generated locally with canvas instead of fetching third-party favicon images.
- No account is required to use the extension.

---

## 📦 Installation

### Chrome / Chromium-based browsers

1. Download or clone this repository:

   ```bash
   git clone https://github.com/Prateek-Kumar-Anand/Ads-refiner-extension.git
   ```

2. Open `chrome://extensions` in your browser.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the cloned project folder.
6. Pin **Ads Refiner** to your toolbar.

### Firefox build files

This repository also includes Firefox-oriented files such as `manifest.firefox.json` and `src/background-firefox.js`. Use those files when packaging or testing the Firefox variant.

---

## 🖱️ Usage

Click the Ads Refiner toolbar icon to open the popup.

- **Protection tab**: View live stats, toggle protections, manage the whitelist, review recent flagged items, and run a browser scan.
- **System tab**: View RAM usage, session stats, daily stats, and per-site time tracking.

Additional pages are available from the popup:

- **Analytics Dashboard** for charts, history, reputation data, export tools, and log cleanup.
- **Settings** for configuring every protection option.
- **System Dashboard** for RAM and time-tracking details.

If Ads Refiner detects a suspicious link, it opens a warning page first. If a download looks risky, Ads Refiner can cancel it and notify you.

---

## 🔐 Permissions

| Permission | Why it is needed |
| --- | --- |
| `declarativeNetRequest` | Blocks ad and tracker requests using native browser rules. |
| `declarativeNetRequestFeedback` | Reads rule-match feedback for local stats and diagnostics. |
| `downloads` | Detects and cancels risky downloads. |
| `notifications` | Alerts you when a risky download is blocked. |
| `storage` | Saves settings, logs, counters, and whitelist entries locally. |
| `history` | Supports local browser scan and history-aware safety checks. |
| `tabs` | Reads tab URLs for safety checks and dashboard features. |
| `webNavigation` | Checks top-level navigation before pages load. |
| `contextMenus` | Adds right-click extension actions. |
| `<all_urls>` | Allows protection and content scripts to run on visited sites. |

> **Note:** Browser extensions cannot scan your whole operating system or delete arbitrary system files. Ads Refiner only works with browser-exposed data such as tabs, URLs, page content, and downloads.

---

## 🗂️ Project Structure

```text
Ads-refiner-extension/
├── manifest.json                 # Chrome extension manifest
├── manifest.firefox.json         # Firefox-oriented manifest
├── rules/
│   ├── ads.json                   # Static ad-blocking rules
│   └── trackers.json              # Static tracker-blocking rules
└── src/
    ├── background.js              # Chrome service worker
    ├── background-firefox.js      # Firefox background script
    ├── browser-api.js             # Browser API helpers
    ├── content.js                 # Cosmetic blocking and in-page link checks
    ├── content.css                # Content-script styles
    ├── dashboard.html / .js       # Analytics dashboard
    ├── favicon.js                 # Privacy-safe generated favicons
    ├── options.html / .js         # Settings page
    ├── popup.html / .js           # Toolbar popup UI
    ├── reputation.js              # Domain reputation helpers
    ├── safety.js                  # URL and download risk checks
    ├── system-dashboard.html / .js# System dashboard
    ├── timetracker.js             # Per-site time tracking
    ├── warning.html / .js         # Suspicious-link warning page
    └── whitelist.js               # Whitelist management
```

---

## 🛠️ Tech Stack

- JavaScript
- HTML
- CSS
- Chrome Extensions Manifest V3
- Native `declarativeNetRequest` rules

Ads Refiner uses vanilla JavaScript and does not require a build step.

---

## 🤝 Contributing

Bug reports, ideas, and pull requests are welcome. If you find a problem or want to suggest a new safety check, open an issue with clear reproduction steps or a detailed feature request.

---

<div align="center">

⭐ **Stay safe, browse cleanly, and enjoy Ads Refiner!** ⭐

</div>
