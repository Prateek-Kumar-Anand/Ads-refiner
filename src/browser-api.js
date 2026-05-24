// src/browser-api.js — Cross-browser API compatibility layer (IIFE)
// Shared core: provides a unified Promise-based API for Chrome and Firefox.

(function initAdsRefinerApi(g) {
  'use strict';

  const raw = g.browser || g.chrome;
  const isFirefox = Boolean(g.browser);

  // Wraps a callback-based call in a Promise (for Chrome)
  function cbCall(ns, method) {
    const args = Array.prototype.slice.call(arguments, 2);
    return new Promise(function(resolve, reject) {
      if (!ns || !ns[method]) { resolve(undefined); return; }
      args.push(function(result) {
        const err = raw.runtime && raw.runtime.lastError;
        if (err) { reject(new Error(err.message)); return; }
        resolve(result);
      });
      ns[method].apply(ns, args);
    });
  }

  function call(ns, method) {
    const args = Array.prototype.slice.call(arguments, 2);
    if (!ns || !ns[method]) return Promise.resolve(undefined);
    if (isFirefox) return Promise.resolve(ns[method].apply(ns, args));
    return cbCall.apply(null, [ns, method].concat(args));
  }

  function safeCall(ns, method) {
    const args = Array.prototype.slice.call(arguments, 2);
    return call.apply(null, [ns, method].concat(args)).catch(function() { return undefined; });
  }

  function storageArea(name) {
    // Prefer real session storage; fall back to local for Firefox MV2
    const area = (raw.storage && raw.storage[name]) || (raw.storage && raw.storage.local);
    return {
      get: function(keys) { return call(area, 'get', keys); },
      set: function(values) { return call(area, 'set', values); },
      remove: function(keys) { return call(area, 'remove', keys); }
    };
  }

  g.adsRefinerApi = {
    raw: raw,
    isFirefox: isFirefox,

    runtime: {
      getURL: function(path) { return raw.runtime.getURL(path); },
      sendMessage: function(msg) { return call(raw.runtime, 'sendMessage', msg); },
      onMessage: raw.runtime.onMessage,
      onInstalled: raw.runtime.onInstalled,
      lastError: raw.runtime.lastError
    },

    storage: {
      local: storageArea('local'),
      session: storageArea('session')
    },

    tabs: {
      create: function(d) { return call(raw.tabs, 'create', d); },
      query: function(q) { return call(raw.tabs, 'query', q); },
      remove: function(id) { return safeCall(raw.tabs, 'remove', id); },
      update: function(id, props) { return call(raw.tabs, 'update', id, props); },
      get: function(id) { return call(raw.tabs, 'get', id); }
    },

    downloads: {
      cancel: function(id) { return safeCall(raw.downloads, 'cancel', id); },
      erase: function(q) { return safeCall(raw.downloads, 'erase', q); },
      onChanged: raw.downloads && raw.downloads.onChanged,
      onCreated: raw.downloads && raw.downloads.onCreated,
      removeFile: function(id) { return safeCall(raw.downloads, 'removeFile', id); },
      search: function(q) { return call(raw.downloads, 'search', q); }
    },

    notifications: {
      clear: function(id) { return safeCall(raw.notifications, 'clear', id); },
      create: function(id, opts) { return call(raw.notifications, 'create', id, opts); },
      onClicked: raw.notifications && raw.notifications.onClicked
    },

    webNavigation: {
      onBeforeNavigate: raw.webNavigation && raw.webNavigation.onBeforeNavigate,
      onCompleted: raw.webNavigation && raw.webNavigation.onCompleted
    },

    webRequest: {
      onBeforeRequest: raw.webRequest && raw.webRequest.onBeforeRequest
    },

    contextMenus: {
      create: function(props) {
        if (raw.contextMenus && raw.contextMenus.create) raw.contextMenus.create(props);
      },
      onClicked: raw.contextMenus && raw.contextMenus.onClicked
    }
  };
})(globalThis);
