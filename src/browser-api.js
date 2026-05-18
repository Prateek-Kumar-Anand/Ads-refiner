(function initAdsRefinerApi(globalScope) {
  const raw = globalScope.browser || globalScope.chrome;
  const usesPromiseApi = Boolean(globalScope.browser);

  function callbackCall(namespace, method, ...args) {
    return new Promise((resolve, reject) => {
      namespace[method](...args, (result) => {
        const error = raw.runtime?.lastError;
        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve(result);
      });
    });
  }

  function call(namespace, method, ...args) {
    if (!namespace?.[method]) {
      return Promise.resolve(undefined);
    }

    if (usesPromiseApi) {
      return Promise.resolve(namespace[method](...args));
    }

    return callbackCall(namespace, method, ...args);
  }

  function storageArea(areaName) {
    const area = raw.storage?.[areaName] || raw.storage?.local;
    return {
      get(keys) {
        return call(area, 'get', keys);
      },
      set(values) {
        return call(area, 'set', values);
      }
    };
  }

  function safeCall(namespace, method, ...args) {
    return call(namespace, method, ...args).catch(() => undefined);
  }

  globalScope.adsRefinerApi = {
    raw,
    runtime: {
      getURL: (path) => raw.runtime.getURL(path),
      sendMessage: (message) => call(raw.runtime, 'sendMessage', message),
      onMessage: raw.runtime.onMessage,
      onInstalled: raw.runtime.onInstalled
    },
    storage: {
      local: storageArea('local'),
      session: storageArea('session')
    },
    tabs: {
      create: (details) => call(raw.tabs, 'create', details),
      query: (queryInfo) => call(raw.tabs, 'query', queryInfo),
      remove: (tabId) => safeCall(raw.tabs, 'remove', tabId),
      update: (tabId, updateProperties) => call(raw.tabs, 'update', tabId, updateProperties)
    },
    downloads: {
      cancel: (downloadId) => safeCall(raw.downloads, 'cancel', downloadId),
      erase: (query) => safeCall(raw.downloads, 'erase', query),
      onChanged: raw.downloads?.onChanged,
      onCreated: raw.downloads?.onCreated,
      removeFile: (downloadId) => safeCall(raw.downloads, 'removeFile', downloadId),
      search: (query) => call(raw.downloads, 'search', query)
    },
    notifications: {
      clear: (notificationId) => safeCall(raw.notifications, 'clear', notificationId),
      create: (notificationId, options) => call(raw.notifications, 'create', notificationId, options),
      onClicked: raw.notifications?.onClicked
    },
    webNavigation: {
      onBeforeNavigate: raw.webNavigation?.onBeforeNavigate
    },
    webRequest: {
      onBeforeRequest: raw.webRequest?.onBeforeRequest
    }
  };
})(globalThis);
