const t = (key, subs) => YTLT_I18N.t(key, subs);

const DEFAULTS = {
  enabled: true,
  targetLang: 'uk',
  speak: true,
  showOriginal: true,
  duckVolume: 0.2,
  rate: 1.1,
  voiceName: '',
  fontSize: 24,
  sttEnabled: true,
  sttLanguage: 'multi',
  uiLang: 'auto',
};

// Donation links shown at the bottom of the popup. The section stays hidden
// while the list is empty. Example: { labelKey: 'donateKofi', url: 'https://ko-fi.com/<name>' }
const DONATE_LINKS = [
  { labelKey: 'donateMonobank', url: 'https://send.monobank.ua/jar/27v9C8zo1L' },
];

const $ = (id) => document.getElementById(id);

// UI language: browser language by default, or the one picked in the header (see src/i18n.js).
function applyI18n() {
  document.documentElement.lang = YTLT_I18N.lang();
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const a of document.querySelectorAll('#donateLinks a')) a.textContent = t(a.dataset.labelKey);
  $('enabledLabel').textContent = t($('enabled').checked ? 'translationOn' : 'translationOff');
  fillVoices($('targetLang').value, $('voiceName').value);
}
const outputs = {
  rate: (v) => `${(+v).toFixed(2)}×`,
  duckVolume: (v) => `${Math.round(v * 100)}%`,
  fontSize: (v) => `${v}px`,
};
const outputIds = { rate: 'rateOut', duckVolume: 'duckOut', fontSize: 'fontOut' };

function fillVoices(lang, selected) {
  const select = $('voiceName');
  const base = lang.split('-')[0].toLowerCase();
  const voices = speechSynthesis.getVoices()
    .filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(base));
  select.replaceChildren(new Option(t('voiceAuto'), ''));
  for (const v of voices) select.add(new Option(`${v.name} (${v.lang})`, v.name));
  select.value = voices.some((v) => v.name === selected) ? selected : '';
}

YTLT_I18N.ready.then(() => chrome.storage.sync.get(DEFAULTS, (s) => {
  for (const key of Object.keys(DEFAULTS)) {
    const el = $(key);
    if (!el || key === 'voiceName') continue;
    if (el.type === 'checkbox') el.checked = s[key]; else el.value = s[key];
    if (outputs[key]) $(outputIds[key]).value = outputs[key](s[key]);

    el.addEventListener('input', () => {
      const value = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value;
      if (outputs[key]) $(outputIds[key]).value = outputs[key](value);
      const patch = { [key]: value };
      if (key === 'targetLang') {
        patch.voiceName = '';
        fillVoices(value, '');
      }
      chrome.storage.sync.set(patch);
    });
  }

  renderEnabled(s.enabled);
  $('enabled').addEventListener('change', (e) => renderEnabled(e.target.checked));
  fillVoices(s.targetLang, s.voiceName);
  speechSynthesis.onvoiceschanged = () => fillVoices($('targetLang').value, $('voiceName').value || s.voiceName);
  $('voiceName').addEventListener('change', (e) => chrome.storage.sync.set({ voiceName: e.target.value }));
  applyI18n();
}));

YTLT_I18N.onChange(applyI18n);

// Kept in local storage: an API key shouldn't sync across devices.
chrome.storage.local.get({ deepgramKey: '' }, ({ deepgramKey }) => {
  const input = $('deepgramKey');
  input.value = deepgramKey;
  input.addEventListener('change', () => chrome.storage.local.set({ deepgramKey: input.value.trim() }));
});

if (DONATE_LINKS.length) {
  const box = $('donateLinks');
  for (const { labelKey, url } of DONATE_LINKS) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.dataset.labelKey = labelKey;
    a.textContent = t(labelKey);
    box.append(a);
  }
  $('support').hidden = false;
}

function renderEnabled(on) {
  $('enabled').checked = on;
  $('enabledLabel').textContent = t(on ? 'translationOn' : 'translationOff');
  document.body.classList.toggle('is-off', !on);
}

// Keep the switch in sync when translation is toggled from the player or the shortcut.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.enabled) renderEnabled(changes.enabled.newValue);
});
