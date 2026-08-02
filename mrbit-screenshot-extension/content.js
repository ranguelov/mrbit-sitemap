// MrBit Screenshot Helper — content script (bridge between the sitemap page and the extension).
//
// Runs in an ISOLATED world at document_start, i.e. BEFORE the page's own inline script.
// That means a single "I'm here" announcement would be missed, because the page has not
// registered its 'mrbit-ext-ready' listener yet. So we announce repeatedly for the first
// few seconds AND answer every 'mrbit-ext-ping' the page sends.
//
// Protocol (CustomEvents on window):
//   ext  -> page : mrbit-ext-ready      { version }
//   page -> ext  : mrbit-ext-ping
//   page -> ext  : mrbit-ext-screenshot { url, id, width?, height? }
//   ext  -> page : mrbit-ext-result     { id, ok, dataUrl?, error? }

(() => {
  'use strict';

  const VERSION = (() => {
    try { return chrome.runtime.getManifest().version; } catch (e) { return '?'; }
  })();

  function announce() {
    try {
      window.dispatchEvent(new CustomEvent('mrbit-ext-ready', {
        detail: { version: VERSION }
      }));
    } catch (e) { /* page gone */ }
  }

  // The page asks — we answer.
  window.addEventListener('mrbit-ext-ping', announce);

  // ...and we also announce unprompted, several times, to cover any injection order.
  announce();
  document.addEventListener('DOMContentLoaded', announce);
  window.addEventListener('load', announce);
  let ticks = 0;
  const timer = setInterval(() => {
    announce();
    if (++ticks >= 24) clearInterval(timer); // ~6s
  }, 250);

  // Screenshot request from the page.
  window.addEventListener('mrbit-ext-screenshot', (e) => {
    const d = (e && e.detail) || {};

    function reply(detail) {
      window.dispatchEvent(new CustomEvent('mrbit-ext-result', {
        detail: Object.assign({ id: d.id, ok: false }, detail)
      }));
    }

    if (!d.url) return reply({ error: 'No URL supplied' });

    try {
      chrome.runtime.sendMessage(
        { type: 'mrbit-capture', url: d.url, width: d.width, height: d.height },
        (res) => {
          const lastErr = chrome.runtime.lastError;
          if (lastErr) {
            return reply({ error: 'Extension background error: ' + lastErr.message });
          }
          if (!res) {
            return reply({ error: 'No response from extension background' });
          }
          reply({ ok: !!res.ok, dataUrl: res.dataUrl, error: res.error });
        }
      );
    } catch (err) {
      // Happens if the extension was reloaded/updated while the page stayed open.
      reply({ error: 'Extension context invalidated — reload this page. (' + err.message + ')' });
    }
  });

  console.log('[mrbit-ext] content script ready, v' + VERSION + ' @ ' + location.protocol);
})();
