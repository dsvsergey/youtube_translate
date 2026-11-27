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
};

// Donation links shown at the bottom of the popup. The section stays hidden
// while the list is empty. Example: { label: '☕ Ko-fi', url: 'https://ko-fi.com/<name>' }
const DONATE_LINKS = [
  { label: '💛 Підтримати (monobank)', url: 'https://send.monobank.ua/jar/27v9C8zo1L' },
];

const $ = (id) => document.getElementById(id);
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
  select.replaceChildren(new Option('Автоматично', ''));
  for (const v of voices) select.add(new Option(`${v.name} (${v.lang})`, v.name));
  select.value = voices.some((v) => v.name === selected) ? selected : '';
}

chrome.storage.sync.get(DEFAULTS, (s) => {
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

  fillVoices(s.targetLang, s.voiceName);
  speechSynthesis.onvoiceschanged = () => fillVoices($('targetLang').value, $('voiceName').value || s.voiceName);
  $('voiceName').addEventListener('change', (e) => chrome.storage.sync.set({ voiceName: e.target.value }));
});

// Kept in local storage: an API key shouldn't sync across devices.
chrome.storage.local.get({ deepgramKey: '' }, ({ deepgramKey }) => {
  const input = $('deepgramKey');
  input.value = deepgramKey;
  input.addEventListener('change', () => chrome.storage.local.set({ deepgramKey: input.value.trim() }));
});

if (DONATE_LINKS.length) {
  const box = $('donateLinks');
  for (const { label, url } of DONATE_LINKS) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = label;
    box.append(a);
  }
  $('support').hidden = false;
}
