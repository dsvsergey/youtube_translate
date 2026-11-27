// UI strings with a user-selectable language (setting `uiLang`: 'auto' | 'en' | 'uk').
// chrome.i18n can only follow the browser language, so for an explicit choice we load
// the same _locales/<lang>/messages.json ourselves. 'auto' falls back to chrome.i18n.
globalThis.YTLT_I18N = (() => {
  const LANGS = ['en', 'uk'];
  let dict = null;
  let current = 'auto';
  const listeners = [];

  async function fetchMessages(lang) {
    // Extension pages can read their own files; content scripts ask the background.
    if (location.protocol === 'chrome-extension:') {
      const res = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
      return res.json();
    }
    return chrome.runtime.sendMessage({ type: 'messages', lang });
  }

  async function load(lang) {
    current = LANGS.includes(lang) ? lang : 'auto';
    try {
      dict = current === 'auto' ? null : await fetchMessages(current);
    } catch {
      dict = null;
    }
  }

  function t(key, subs = []) {
    const entry = dict?.[key];
    if (!entry) return chrome.i18n.getMessage(key, subs);
    return entry.message.replace(/\$(\d)/g, (_, n) => subs[n - 1] ?? '');
  }

  function lang() {
    return current === 'auto' ? chrome.i18n.getUILanguage() : current;
  }

  const ready = new Promise((resolve) => {
    chrome.storage.sync.get({ uiLang: 'auto' }, ({ uiLang }) => load(uiLang).then(resolve));
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.uiLang) return;
    load(changes.uiLang.newValue).then(() => listeners.forEach((fn) => fn()));
  });

  return { t, lang, ready, onChange: (fn) => listeners.push(fn) };
})();
