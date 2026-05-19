const api = globalThis.adsRefinerApi;
const params = new URLSearchParams(window.location.search);
const target = params.get('target') || 'Unknown link';
const reasons = JSON.parse(params.get('reasons') || '[]');

document.getElementById('target').textContent = target;
document.getElementById('reasons').append(...(reasons.length ? reasons : ['Ads Refiner found suspicious signs in this link.']).map((reason) => {
  const item = document.createElement('li');
  item.textContent = reason;
  return item;
}));

document.getElementById('goBack').addEventListener('click', () => {
  if (history.length > 1) {
    history.back();
    return;
  }

  window.location.href = 'about:blank';
});

document.getElementById('continue').addEventListener('click', async () => {
  await api.runtime.sendMessage({ type: 'ALLOW_URL', url: target });
  window.location.href = target;
});
