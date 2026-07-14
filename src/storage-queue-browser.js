// src/storage-queue-browser.js — Shared serialized write queue (Firefox / non-module contexts)
// Mirrors storage-queue.js exactly (see that file for the full rationale):
// unserialized read-modify-write calls on the same storage key race and
// silently drop updates when they interleave, which is exactly what happens
// when onBeforeRequest fires logEvent()/incrementCounter() once per blocked
// request without awaiting them (it can't — blocking webRequest listeners
// must return synchronously).
//
// As with the module version, the promise returned to the caller is kept
// separate from the promise used to advance the queue, so:
//   - a failed write is reported to its caller (not silently treated as a
//     success), and
//   - that same failure doesn't leave the queue permanently rejected for
//     every future write on the same key.

(function initAdsRefinerStorageQueue(g) {
  'use strict';

  var queues = new Map();

  function enqueueStorageWrite(queueKey, fn) {
    var prev = queues.get(queueKey) || Promise.resolve();
    var result = prev.then(fn);
    queues.set(queueKey, result.catch(function (err) {
      console.error('[AdsRefiner] storage write error (' + queueKey + '):', err);
    }));
    return result;
  }

  g.adsRefinerStorageQueue = { enqueueStorageWrite: enqueueStorageWrite };
})(globalThis);
