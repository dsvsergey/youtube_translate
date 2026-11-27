// Translation lives here: the content script on youtube.com can't call Google cross-origin.
const ENDPOINT = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto';
const MAX_BATCH_CHARS = 3500;
const cache = new Map();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'messages' && /^[a-z]{2}$/.test(msg.lang)) {
    fetch(chrome.runtime.getURL(`_locales/${msg.lang}/messages.json`))
      .then((res) => res.json())
      .then(sendResponse, () => sendResponse(null));
    return true;
  }
  if (msg?.type !== 'translate') return;
  translateAll(msg.texts, msg.target).then(
    (result) => sendResponse({ ok: true, result }),
    (err) => sendResponse({ ok: false, error: String(err?.message || err) }),
  );
  return true;
});

async function translateAll(texts, target) {
  const out = new Array(texts.length);
  const missing = [];
  texts.forEach((t, i) => {
    const hit = cache.get(`${target}\u0000${t}`);
    if (hit !== undefined) out[i] = hit; else missing.push(i);
  });

  for (const batch of chunk(missing, (i) => texts[i].length)) {
    const translated = await requestBatch(batch.map((i) => texts[i]), target);
    batch.forEach((i, k) => {
      out[i] = translated[k];
      cache.set(`${target}\u0000${texts[i]}`, translated[k]);
    });
  }
  if (cache.size > 5000) cache.clear();
  return out;
}

function chunk(indices, sizeOf) {
  const batches = [];
  let cur = [], size = 0;
  for (const i of indices) {
    if (cur.length && size + sizeOf(i) > MAX_BATCH_CHARS) {
      batches.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(i);
    size += sizeOf(i);
  }
  if (cur.length) batches.push(cur);
  return batches;
}

async function requestBatch(texts, target) {
  const body = new URLSearchParams();
  texts.forEach((t) => body.append('q', t));
  const res = await fetch(`${ENDPOINT}&tl=${encodeURIComponent(target)}`, { method: 'POST', body });
  if (!res.ok) throw new Error(`Translate HTTP ${res.status}`);
  const data = await res.json();
  // One input → may come back as a bare item; items are ["text", "srcLang"] or "text".
  const items = texts.length === 1 && !Array.isArray(data[0]) && typeof data[0] === 'string' && data.length === 2 ? [data] : data;
  return texts.map((orig, k) => {
    const item = items[k];
    if (Array.isArray(item)) return item[0] ?? orig;
    return typeof item === 'string' ? item : orig;
  });
}

// ---------- manual on/off: keyboard shortcut + "OFF" badge ----------
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-translation') return;
  chrome.storage.sync.get({ enabled: true }, ({ enabled }) => chrome.storage.sync.set({ enabled: !enabled }));
});

function updateBadge(enabled) {
  chrome.action.setBadgeText({ text: enabled ? '' : 'OFF' });
  chrome.action.setBadgeBackgroundColor({ color: '#777' });
}

chrome.storage.sync.get({ enabled: true }, ({ enabled }) => updateBadge(enabled));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.enabled) updateBadge(changes.enabled.newValue);
});
