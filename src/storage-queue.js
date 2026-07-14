// src/storage-queue.js — Shared serialized write queue for chrome.storage.local
//
// BUG FIX (Concurrent Storage Writes Silently Lost):
// chrome.storage.local has no transactions. logger.js (logEvent,
// incrementCounter) and reputation.js (updateReputation) each did a plain
// get() -> mutate in memory -> set(). That's fine for one call at a time,
// but declarativeNetRequest's onRuleMatchedDebug listener fires once PER
// BLOCKED REQUEST — a single ad-heavy page load can trigger dozens of
// logEvent()+incrementCounter() calls within milliseconds of each other.
// When two of those interleave, both read the same stale counters/log
// object and the second write silently clobbers the first, so "ads
// blocked" / "trackers blocked" undercount and entries vanish from the
// event log / analytics dashboard — exactly the failure this extension's
// headline feature (live block counters) is supposed to report correctly.
//
// Fix: route every read-modify-write mutation for a given storage key
// through a per-key promise chain so they always execute serially and each
// read sees the latest committed data.
//
// IMPORTANT: the promise returned to the caller must stay independent from
// the promise used to keep the queue alive. If a write throws and we don't
// separate these:
//   - swallowing the error on the returned promise makes failures look like
//     silent successes to the caller
//   - NOT swallowing it on the queue's own continuation would leave that
//     queue permanently rejected, so every future write on the same key
//     would silently fail forever (a `.then()` chained onto a promise that
//     already rejected never runs its fulfillment handler)
// So we keep two promises per key: `result` (returned as-is, may reject)
// and a caught copy used only to advance the queue.

const queues = new Map();

export function enqueueStorageWrite(queueKey, fn) {
  const prev = queues.get(queueKey) ?? Promise.resolve();
  const result = prev.then(fn);
  queues.set(
    queueKey,
    result.catch((err) => {
      console.error(`[AdsRefiner] storage write error (${queueKey}):`, err);
    })
  );
  return result;
}
