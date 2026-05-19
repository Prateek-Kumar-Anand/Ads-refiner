const api = globalThis.adsRefinerApi;
const keys = ['blockTrackers', 'popupKiller', 'readerMode', 'sponsorBlock'];
const saved = document.getElementById('saved');

init();

async function init() {
  const settings = await api.storage.local.get(keys);
  for (const key of keys) {
    document.getElementById(key).checked = settings[key] !== false;
    document.getElementById(key).addEventListener('change', save);
  }
}

async function save() {
  const settings = Object.fromEntries(keys.map((k) => [k, document.getElementById(k).checked]));
  await api.storage.local.set(settings);
  await api.runtime.sendMessage({ type: 'SET_SETTINGS', settings });
  saved.textContent = 'Saved.';
  setTimeout(() => { saved.textContent = ''; }, 1200);
}
