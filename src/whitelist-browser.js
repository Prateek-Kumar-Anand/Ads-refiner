// src/whitelist-browser.js — Domain whitelist IIFE (Firefox / content scripts)

(function initAdsRefinerWhitelist(g) {
  'use strict';

  var api = g.adsRefinerApi || null;

  // BUG FIX: addToWhitelist/removeFromWhitelist used to do a plain
  // get-then-set with no serialization, so two near-simultaneous calls could
  // race and one write would silently clobber the other — same class of bug
  // fixed in whitelist.js (Chrome) via storage-queue.js. This file is loaded
  // both from background-firefox.html (where storage-queue-browser.js is
  // available) and as a content script (where it isn't, though nothing in
  // content.js currently calls these functions there) — so fall back to
  // running unserialized rather than throwing if the queue isn't present.
  function enqueue(queueKey, fn) {
    if (g.adsRefinerStorageQueue) return g.adsRefinerStorageQueue.enqueueStorageWrite(queueKey, fn);
    return fn();
  }

  function normalizeDomain(input) {
    if (!input) return null;
    try {
      var raw = input.trim().toLowerCase().replace(/^https?:\/\//i, '').split('/')[0];
      new URL('https://' + raw);
      return raw;
    } catch (_) { return null; }
  }

  function getStorage() {
    return api ? api.storage.local : {
      get: function(k) {
        return new Promise(function(res) {
          var obj = {}; obj[k] = undefined;
          (globalThis.browser || globalThis.chrome).storage.local.get(k, function(r) { res(r); });
        });
      },
      set: function(v) {
        return new Promise(function(res) {
          (globalThis.browser || globalThis.chrome).storage.local.set(v, res);
        });
      }
    };
  }

  var STORAGE_KEY = 'domainWhitelist';

  function loadWhitelist() {
    return getStorage().get(STORAGE_KEY).then(function(result) {
      var list = result[STORAGE_KEY] || [];
      return new Set(list.map(function(d) { return d.toLowerCase().trim(); }).filter(Boolean));
    });
  }

  function addToWhitelist(domain) {
    var clean = normalizeDomain(domain);
    if (!clean) return Promise.resolve({ ok: false, error: 'Invalid domain.' });
    return enqueue('domainWhitelist', function() {
      return getStorage().get(STORAGE_KEY).then(function(result) {
        var list = result[STORAGE_KEY] || [];
        if (!list.includes(clean)) {
          list.push(clean);
          return getStorage().set({ [STORAGE_KEY]: list }).then(function() {
            return { ok: true, domain: clean };
          });
        }
        return { ok: true, domain: clean };
      });
    });
  }

  function removeFromWhitelist(domain) {
    var clean = normalizeDomain(domain);
    return enqueue('domainWhitelist', function() {
      return getStorage().get(STORAGE_KEY).then(function(result) {
        var list = (result[STORAGE_KEY] || []).filter(function(d) { return d !== clean; });
        return getStorage().set({ [STORAGE_KEY]: list }).then(function() {
          return { ok: true };
        });
      });
    });
  }

  function getWhitelist() {
    return getStorage().get(STORAGE_KEY).then(function(result) {
      return result[STORAGE_KEY] || [];
    });
  }

  g.adsRefinerWhitelist = {
    loadWhitelist: loadWhitelist,
    addToWhitelist: addToWhitelist,
    removeFromWhitelist: removeFromWhitelist,
    getWhitelist: getWhitelist
  };
})(globalThis);
