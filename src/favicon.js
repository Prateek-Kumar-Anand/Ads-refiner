// src/favicon.js — Privacy-safe favicon helper
// Issue #1: External favicon fetch (google.com/s2/favicons) leaks every visited
// hostname to Google. Replaced with a local canvas-based letter-avatar fallback.
// No network request made — fully on-device.

'use strict';

/**
 * Returns a data-URI favicon for a hostname.
 * Draws a coloured circle with the first letter of the domain.
 * @param {string} host
 * @returns {string} data-URI PNG
 */
function makeFaviconDataUri(host) {
  const letter = (host.replace(/^www\./, '')[0] || '?').toUpperCase();

  // Deterministic colour from hostname — consistent across sessions
  let hash = 0;
  for (let i = 0; i < host.length; i++) {
    hash = (hash * 31 + host.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  const bg  = 'hsl(' + hue + ',55%,48%)';

  const canvas = document.createElement('canvas');
  canvas.width  = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d');

  // Background circle
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(8, 8, 8, 0, Math.PI * 2);
  ctx.fill();

  // Letter
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 9px system-ui,sans-serif';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 8, 8.5);

  return canvas.toDataURL('image/png');
}

// Export for use in popup.js and system-dashboard.js
if (typeof module !== 'undefined') {
  module.exports = { makeFaviconDataUri };
} else {
  globalThis.makeFaviconDataUri = makeFaviconDataUri;
}
