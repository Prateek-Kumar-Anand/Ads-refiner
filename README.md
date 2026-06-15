<div align="center">

<img src="src/icons/icon128.png" width="96" height="96" alt="Ads Refiner logo" />

# 🛡️ Ads Refiner — Safe Link Guard

**A 100% free, privacy-first Chrome extension that blocks ads & trackers, warns you before phishing links, stops risky downloads, and shows you exactly what's happening on every site you visit.**

<p>
  <img src="https://img.shields.io/badge/Manifest-V3-4f46e5?style=for-the-badge&logo=googlechrome&logoColor=white" />
  <img src="https://img.shields.io/badge/Chrome-116%2B-4f46e5?style=for-the-badge&logo=googlechrome&logoColor=white" />
  <img src="https://img.shields.io/badge/Price-100%25%20Free-059669?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Accounts-None%20Required-059669?style=for-the-badge" />
</p>

</div>

---

## ✨ Why Ads Refiner?

No sign-ups. No API keys. No subscriptions. No data leaving your browser. Ads Refiner runs entirely **locally**, using Chrome's native `declarativeNetRequest` API for blazing-fast ad/tracker blocking — plus a built-in safety layer that watches links and downloads so you don't have to.

---

## 🚀 Features

### 🧱 Ad & Tracker Blocking
- 🚫 Blocks ad-network and tracker requests using fast, native **`declarativeNetRequest`** rules (`rules/ads.json`, `rules/trackers.json`)
- 🎭 **Cosmetic blocking** — automatically hides leftover ad containers/slots injected into pages
- 🔢 Live counters for **ads blocked**, **trackers blocked**, and **URLs checked**

### ⚠️ Suspicious Link Guard
- 🔍 Scans clicked links and top-level navigation for red flags:
  - Non-HTTPS pages
  - Raw IP-address URLs
  - Punycode / lookalike domains
  - Misleading `@` links
  - High-risk executable download types
- 🖐️ Shows a **warning interstitial** before you land on a suspicious page — choose **Go back** or **Go on anyway**

### ⬇️ Download Protection
- 🛑 Automatically **cancels risky downloads** (e.g. suspicious executables)
- 🔔 Sends a desktop notification when a risky download is blocked
- 🧹 Opens a **Safety Panel** to review flagged tabs/downloads and choose **Ignore it** or **Solve it by deleting**

### 📊 Analytics Dashboard
- 📈 **Block-type breakdown** chart (ads vs. trackers vs. links vs. downloads)
- 📅 **7-day activity** timeline chart
- 🌐 **Domain reputation** tracking, stored locally
- ✅ **Whitelist manager** — exempt trusted domains in one click
- ⬇️ **Export your data** as JSON or CSV, or clear the log anytime

### 🖥️ System Dashboard
- 🟢 **Live RAM usage** monitor with a real-time progress bar
- ⏱️ **Per-site time tracking** — see how much time you spend on each domain today and all-time
- 📊 Session & daily stats at a glance from the popup's **System** tab

### ⚙️ Full Control via Settings
Every protection layer can be toggled independently:

| Toggle | What it does |
|---|---|
| 🛡 Enable protection | Master on/off switch |
| 🧱 Block ads | Network-level ad blocking |
| 🎯 Block trackers | Network-level tracker blocking |
| ⚠️ Warn on suspicious links | Phishing/lookalike-link interstitial |
| ⬇️ Block risky downloads | Cancels high-risk file downloads |
| 🎭 Cosmetic ad blocking | Hides ad containers in the page DOM |

### 🔒 Privacy-Respecting by Design
- 🖼️ Canvas-generated **letter avatars** instead of fetching real favicons (no third-party favicon leaks)
- 💾 All stats, logs, and whitelists are stored **locally** via `chrome.storage` — nothing is sent anywhere

---

## 📦 Installation

> Not yet on the Chrome Web Store? Load it manually — takes less than a minute:

1. **Download or clone** this repository
   ```bash
   git clone https://github.com/Prateek-Kumar-Anand/Ads-refiner-extension.git
   ```
2. Open Chrome and go to `chrome://extensions`
3. Toggle on **Developer mode** (top-right)
4. Click **Load unpacked**
5. Select the cloned project folder
6. 📌 Pin **Ads Refiner** to your toolbar — and you're protected!

---

## 🖱️ Usage

Click the toolbar icon to open the popup, which has two tabs:

- **🛡 Protection** — live stats, all the on/off toggles, your whitelist, a list of recently flagged items, and a **🔍 Scan browser now** button
- **🖥 System** — RAM usage, today's/session stats, and per-site time spent (with a link to the full **System Dashboard**)

From the popup you can also jump into:
- **📊 Analytics Dashboard** — deep dive into block history, charts, reputation & exports
- **⚙️ Settings** — fine-tune every protection toggle

If a link looks suspicious, you'll see a **warning page** first — letting you back out safely or proceed at your own risk. If a risky download is blocked, a notification will let you review and resolve it from the Safety Panel.

---

## 🔐 Permissions — and Why They're Needed

| Permission | Why Ads Refiner needs it |
|---|---|
| `declarativeNetRequest` | Block ad & tracker requests natively, without slowing down page loads |
| `webNavigation` | Detect top-level navigation to check links before the page loads |
| `tabs` | Inspect URLs/tabs to power the Safety Panel and System Dashboard |
| `downloads` | Detect and cancel risky downloads |
| `storage` | Save your settings, stats, whitelist, and logs locally |
| `notifications` | Alert you when a risky download is blocked |
| `contextMenus` | Right-click menu actions |
| `<all_urls>` (host permission) | Apply ad-blocking and link-safety checks on any site you visit |

> ⚠️ **Note:** Browser extensions can't scan your entire operating system or delete arbitrary system files. Ads Refiner focuses on what Chrome exposes to extensions — URLs, open tabs, and downloads.

---

## 🗂️ Project Structure

```text
Ads-refiner-extension/
├── manifest.json              # Extension config — permissions, rules, service worker
├── rules/
│   ├── ads.json                # Static ad-blocking network rules
│   └── trackers.json           # Static tracker-blocking network rules
└── src/
    ├── background.js           # Core service worker — navigation, downloads, notifications
    ├── content.js               # Cosmetic ad hiding + in-page link checks
    ├── timetracker.js           # Per-site time tracking
    ├── favicon.js               # Privacy-safe canvas favicons
    ├── reputation.js            # Domain reputation logic
    ├── whitelist.js             # Whitelist management
    ├── safety.js                # URL & download risk heuristics
    ├── popup.html / popup.js    # Toolbar popup (Protection + System tabs)
    ├── options.html / options.js# Settings page
    ├── dashboard.html / .js     # Analytics dashboard
    ├── system-dashboard.html/.js# RAM & time-tracking dashboard
    └── warning.html / warning.js# Suspicious-link interstitial
```

---

## 🛠️ Tech Stack

<p>
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" />
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" />
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" />
  <img src="https://img.shields.io/badge/Chrome%20Extensions%20API-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white" />
</p>

Built with **vanilla JS** — no frameworks, no build step, no bloat.

---

## 🤝 Contributing

Found a bug or have an idea for a new safety check? Issues and pull requests are welcome! 🙌

---

## 📄 License

Free to use, modify, and distribute.

---

<div align="center">

⭐ **If Ads Refiner keeps your browsing cleaner and safer, consider starring the repo!** ⭐

</div>
