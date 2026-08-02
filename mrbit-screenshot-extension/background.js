// MrBit Screenshot Helper — service worker (MV3).
//
// Opens the requested URL in a small popup window (mobile-ish viewport width),
// waits for it to finish loading, captures the visible area, closes the window.
// Because it uses the user's own browser, the request carries the user's real IP
// (Cato VPN) and cookies — which is the whole point of doing it this way.

'use strict';

const MIN_WIDTH        = 400;   // Chrome refuses to make windows narrower than ~400px
const DEFAULT_WIDTH    = 400;
const DEFAULT_HEIGHT   = 1000;
const LOAD_TIMEOUT_MS  = 30000; // hard cap on waiting for status === 'complete'
const SETTLE_MS        = 2500;  // extra wait for JS / lazy images / banners after load

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'mrbit-capture') return; // not ours

  capture(msg.url, msg.width, msg.height)
    .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
    .catch((err) => {
      console.warn('[mrbit-ext] capture failed:', err);
      sendResponse({ ok: false, error: (err && err.message) || String(err) });
    });

  return true; // keep the message channel open for the async sendResponse
});

async function capture(url, width, height) {
  const w = Math.max(MIN_WIDTH, Number(width) || DEFAULT_WIDTH);
  const h = Number(height) || DEFAULT_HEIGHT;

  let win;
  try {
    win = await chrome.windows.create({
      url,
      type: 'popup',
      focused: false,   // don't steal focus from the sitemap tab
      width: w,
      height: h,
      left: 0,
      top: 0
    });
  } catch (err) {
    throw new Error('Could not open window: ' + err.message);
  }

  const tabId = win.tabs && win.tabs[0] && win.tabs[0].id;
  if (!tabId) {
    await closeWindow(win.id);
    throw new Error('Window opened without a tab');
  }

  try {
    await waitForLoad(tabId, LOAD_TIMEOUT_MS);
    await sleep(SETTLE_MS);
    return await captureWindow(win.id);
  } finally {
    await closeWindow(win.id);
  }
}

// captureVisibleTab can fail on an unfocused window in some Chrome builds.
// Try unfocused first; only if that fails do we briefly focus the window.
async function captureWindow(windowId) {
  try {
    return await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  } catch (firstErr) {
    try {
      await chrome.windows.update(windowId, { focused: true });
      await sleep(500);
      return await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
    } catch (secondErr) {
      throw new Error('captureVisibleTab failed: ' + (secondErr.message || firstErr.message));
    }
  }
}

function waitForLoad(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;

    function done(fn, arg) {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      clearTimeout(timer);
      fn(arg);
    }

    function onUpdated(id, info) {
      if (id === tabId && info.status === 'complete') done(resolve);
    }
    function onRemoved(id) {
      if (id === tabId) done(reject, new Error('Tab was closed before the screenshot'));
    }

    const timer = setTimeout(
      () => done(reject, new Error('Page did not finish loading within ' + Math.round(timeoutMs / 1000) + 's')),
      timeoutMs
    );

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);

    // The tab may already be complete before our listener was attached.
    chrome.tabs.get(tabId).then((tab) => {
      if (tab && tab.status === 'complete') done(resolve);
    }).catch(() => { /* onRemoved will handle it */ });
  });
}

async function closeWindow(windowId) {
  try { await chrome.windows.remove(windowId); } catch (e) { /* already gone */ }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
