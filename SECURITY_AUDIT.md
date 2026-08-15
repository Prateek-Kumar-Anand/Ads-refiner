# Ads Refiner — Security & Bug Audit (v2.0.1 → v2.0.2)

Full review of both manifests, all background/content scripts, all extension
pages, the declarativeNetRequest rule sets, and the README's claims. Findings
below are ranked by real-world impact. "Verified safe" items are included so
this reads as a real audit trail, not just a list of problems.

---

## Fixed — privacy / disclosure

### 1. Warning page falsely claimed zero network activity
`warning.html` told users *"All checks run entirely on your device — no data
is sent to any server,"* while the same page's script (`warning.js`) silently
queries the HaveIBeenPwned API with the domain of every flagged link
(`checkDomainBreach` in `safety.js` / `background-firefox.js`). The same
blanket claim was repeated in `options.html`'s footer note.
**Fix:** corrected both to accurately disclose the lookup; added a new
**Privacy → Data breach lookups** toggle (`breachCheck`, on by default to
preserve current behavior) so users can turn it off. The gate lives in the
`CHECK_BREACH` message handler in both `background.js` and
`background-firefox.js`, so it can't be bypassed by any caller.

---

## Fixed — real vulnerabilities

### 2. Open navigation via the warning page's `target` parameter
`warning.html` is `web_accessible_resources`-exposed on `<all_urls>` (required
for the extension's own redirect flow) — which means **any website** can link
or iframe it directly with fully attacker-chosen query parameters, bypassing
`content.js` entirely. The "Proceed anyway" button did
`window.location.href = target` with no protocol check, so a crafted link
could set `target=javascript:...`. Modern extension-page CSP (`script-src
'self'`, no `unsafe-inline`) should block `javascript:` navigation today, but
that's an implicit backstop, not a guarantee.
**Fix:** `warning.js` now allow-lists `http:`/`https:`/`mailto:` before
either the enrichment fetch or the navigation runs, so this is safe by
construction rather than by CSP alone.

### 3. CSV export vulnerable to formula injection (CWE-1236)
`exportAsCsv()` (`logger.js`) and `exportCsv()` (`background-firefox.js`)
quoted values but didn't neutralize a leading `= + - @`. A malicious page's
`download="=cmd|'/c calc'!A0.exe"` filename could reach the blocked-downloads
log and execute as a formula when the exported CSV is opened in Excel/Sheets.
**Fix:** added a `csvFormulaGuard()` that prefixes such cells with `'`.

### 4. Whitelist entries could silently store the wrong domain
`normalizeDomain()` in `whitelist.js`/`whitelist-browser.js` validated input
with `new URL()` but then stored the *raw, un-parsed string*. Typing
`evil.com@trusted.com` is valid userinfo syntax (parses to host
`trusted.com`) but was saved verbatim as `evil.com@trusted.com` — an entry
that can never match a real page's hostname. Not an active bypass (it fails
closed), but a confusing, broken entry that doesn't do what it looks like it
does. Same issue for `example.com:8080` (port is silently useless).
**Fix:** now rejects anything that isn't a bare hostname (no userinfo, no
port) and stores the canonical parsed `.hostname`.

### 5. Whitelisting a domain could make its links permanently unclickable
`content.js`'s fast local heuristic (punycode, `@` in the URL) doesn't know
about the whitelist. If a whitelisted domain tripped that heuristic, every
click intercepted → background correctly said "safe" → but the code only
removed the warning badge and never marked the link allowed, so the *next*
click repeated the same cycle forever — a real usability bug that defeated
the whitelist feature for affected domains.
**Fix:** the anchor is now marked allowed as soon as the background reports
safe/whitelisted, so a follow-up click goes straight through.

---

## Fixed — hardening (not exploitable today, but fragile)

### 6. No sender validation on the message listeners
Neither `background.js` nor `background-firefox.js` checked `sender.id`
before acting on a message. In practice `onMessage` can only be reached by
this extension's own content scripts and pages (no `externally_connectable`
is declared), so this wasn't an open door — but every handler behind it
performs a privileged action (storage, downloads, tabs, history), so it's
worth being explicit rather than relying entirely on that platform default.
**Fix:** both listeners now reject anything where `sender.id` doesn't match
the extension's own ID.

### 7. Inconsistent escaping in the dashboard's log table
`dashboard.js` built log rows with a template literal passed to `innerHTML`,
escaping the `details` field but interpolating `type` and `level` raw. Today
those two fields only ever hold fixed, extension-generated strings (verified
by tracing every `logEvent()` call site), so this wasn't currently
exploitable — but the dashboard runs with full extension privilege
(`history`, `downloads`, `tabs`), and mixing escaped/unescaped values in one
template is exactly the kind of thing that silently becomes an XSS the next
time someone adds a new event type.
**Fix:** rewrote all dynamic row-building in `dashboard.js` (log table,
reputation table, whitelist list) to safe DOM construction (`createElement`
+ `textContent`) instead of `innerHTML`, matching the pattern already used
correctly in `popup.js` and `system-dashboard.js`. Removed the now-unused
`escHtml`/`escAttr` helpers.

### 8. Unnecessary code exposure on every page (Firefox)
`browser-api.js`, `safety-browser.js`, and `whitelist-browser.js` were
injected as content scripts into **every website** the user visits, but
`content.js`/`timetracker.js` never reference the globals they set up
(confirmed by grep) — they're only actually used by `background-firefox.html`,
which loads them separately. They were also listed in
`web_accessible_resources`, making them directly fetchable by any site
(extension-fingerprinting surface), which content scripts never need to be.
**Fix:** removed all three from `manifest.firefox.json`'s `content_scripts`
and `web_accessible_resources`. `background-firefox.html` loads them via its
own relative `<script>` tags, which is unaffected by this change.
*Note: Firefox's scoped `"matches"` form for `web_accessible_resources` is
MV3-only — this manifest is intentionally MV2, where the key is all-or-nothing.
`dashboard.html`/`dashboard.js`/`styles.css`/`warning.html`/`warning.js` are
left as-is rather than risk breaking resource loading with an unsupported format.*

---

## Verified — already safe

- No `eval`/`new Function`, no remote script loading (every `<script src>`
  is a local relative path); default strict extension-page CSP is intact in
  both manifests (never weakened).
- `favicon.js` generates initials locally via canvas — confirmed no request
  to Google's favicon service (an older, since-fixed version of this exact
  extension did leak visited hostnames that way).
- `popup.js` and `system-dashboard.js` consistently use `textContent`/DOM
  building for attacker-influenced data (tab titles from `document.title`,
  which a malicious page fully controls) — no XSS there.
- Reputation scores/visit counts/flag counts are always arithmetic, never
  attacker-settable strings, so their use in `dashboard.js` was already safe
  independent of the `innerHTML` cleanup above.
- `rules/ads.json` and `rules/trackers.json`: block-type rules only, no
  `redirect` rules, globally unique IDs, no ID collisions between the two
  rulesets.
- No hardcoded API keys/secrets anywhere in the codebase.
- No inline HTML event-handler attributes (`onclick="..."` etc.) anywhere —
  would have silently failed under the default CSP anyway.

---

## Changed files
`manifest.json`, `manifest.firefox.json`, `background.js`,
`background-firefox.js`, `content.js`, `dashboard.js`, `logger.js`,
`warning.html`, `warning.js`, `whitelist.js`, `whitelist-browser.js`,
`options.html`, `options.js`. Version bumped to **2.0.2** in both manifests.
