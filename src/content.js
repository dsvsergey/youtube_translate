(() => {
  const L = globalThis.YTLT;
  const SOURCE = 'yt-live-translate';
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
  const LOOKAHEAD = 40; // cues translated ahead of the playhead
  const LIVE_IDLE_MS = 1300;
  const LIVE_MAX_CHARS = 140;
  const STT_WAIT_MS = 6000; // playback without any captions before falling back to Deepgram
  const STT_WAIT_NO_CC_MS = 1500; // ...when the player has no captions button at all

  let settings = { ...DEFAULTS };
  let deepgramKey = '';
  const captures = new Map(); // videoId -> raw timedtext
  const state = {
    gen: 0,
    videoId: null,
    cues: [],
    translations: [],
    pending: new Set(),
    lastIdx: -1,
    spokenIdx: -1,
    enabledCcByUs: false,
    ccAttemptAt: 0,
    retryAt: 0,
  };
  const live = { lastText: '', buffer: '', lastChange: 0, clearAt: 0 };
  const speech = { active: 0, savedVolume: null, restoreTimer: null };
  const stt = { client: null, noCaptionMs: 0, lastTick: 0, failed: false };

  // ---------- settings ----------
  chrome.storage.sync.get(DEFAULTS, (s) => { settings = { ...DEFAULTS, ...s }; applySettings(); });
  // The API key stays in local storage so it never syncs to other devices.
  chrome.storage.local.get({ deepgramKey: '' }, (s) => { deepgramKey = s.deepgramKey; });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.deepgramKey) {
      deepgramKey = changes.deepgramKey.newValue || '';
      restartStt();
      return;
    }
    if (area !== 'sync') return;
    const prevLang = settings.targetLang;
    for (const [k, { newValue }] of Object.entries(changes)) settings[k] = newValue;
    if (settings.targetLang !== prevLang) resetTranslations();
    if (changes.sttLanguage || changes.sttEnabled) restartStt();
    applySettings();
    if (changes.enabled) showToast(YTLT_I18N.t(settings.enabled ? 'translationOn' : 'translationOff'));
  });

  function applySettings() {
    const player = getPlayer();
    updateToggleButton();
    if (!settings.enabled) {
      stopStt();
      stopSpeech();
      hideOverlay();
      player?.classList.remove('ytlt-hide-native');
      if (state.enabledCcByUs) { toggleCc(false); state.enabledCcByUs = false; }
      return;
    }
    if (!settings.speak) stopSpeech();
    const overlay = getOverlay();
    if (overlay) overlay.style.setProperty('--ytlt-font-size', `${settings.fontSize}px`);
  }

  // ---------- caption capture ----------
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.source !== SOURCE || e.data.type !== 'timedtext') return;
    let vid = null;
    try { vid = new URL(e.data.url, location.origin).searchParams.get('v'); } catch (_) {}
    vid = vid || L.videoIdFromUrl(location.href);
    if (!vid) return;
    captures.set(vid, e.data.text);
    if (vid === state.videoId) loadCues(e.data.text);
  });

  function loadCues(raw) {
    let cues = [];
    try { cues = L.groupCues(L.parseTimedText(raw)); } catch (err) { console.warn('[YTLT] parse failed', err); }
    if (!cues.length) return;
    state.gen++;
    state.cues = cues;
    state.translations = new Array(cues.length);
    state.pending.clear();
    state.lastIdx = -1;
    state.spokenIdx = -1;
    live.buffer = '';
    stopSpeech();
  }

  function resetForVideo(videoId) {
    state.gen++;
    state.videoId = videoId;
    state.cues = [];
    state.translations = [];
    state.pending.clear();
    state.lastIdx = -1;
    state.spokenIdx = -1;
    state.ccAttemptAt = 0;
    Object.assign(live, { lastText: '', buffer: '', lastChange: 0, clearAt: 0 });
    restartStt();
    stopSpeech();
    hideOverlay();
    if (videoId && captures.has(videoId)) loadCues(captures.get(videoId));
  }

  function resetTranslations() {
    state.gen++;
    state.translations = new Array(state.cues.length);
    state.pending.clear();
    state.spokenIdx = state.lastIdx;
    stopSpeech();
  }

  // ---------- translation ----------
  function translate(texts) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'translate', texts, target: settings.targetLang }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        res?.ok ? resolve(res.result) : reject(new Error(res?.error || 'translate failed'));
      });
    });
  }

  function ensureTranslated(fromIdx) {
    const start = Math.max(0, fromIdx);
    const end = Math.min(state.cues.length, start + LOOKAHEAD);
    if (Date.now() < state.retryAt) return;
    let first = -1;
    for (let i = start; i < end && first < 0; i++) {
      if (state.translations[i] === undefined && !state.pending.has(i)) first = i;
    }
    // Only fetch when the translated window runs low, then grab a full window at once.
    if (first < 0 || first >= start + LOOKAHEAD / 2) return;
    const batch = [];
    for (let i = first; i < Math.min(state.cues.length, first + LOOKAHEAD); i++) {
      if (state.translations[i] === undefined && !state.pending.has(i)) batch.push(i);
    }
    const gen = state.gen;
    batch.forEach((i) => state.pending.add(i));
    translate(batch.map((i) => state.cues[i].text)).then((res) => {
      if (gen !== state.gen) return;
      batch.forEach((i, k) => { state.translations[i] = res[k]; state.pending.delete(i); });
    }, (err) => {
      if (gen !== state.gen) return;
      batch.forEach((i) => state.pending.delete(i));
      state.retryAt = Date.now() + 3000;
      console.warn('[YTLT]', err.message);
    });
  }

  // ---------- main loop ----------
  setInterval(tick, 120);

  function tick() {
    const vid = L.videoIdFromUrl(location.href);
    if (vid !== state.videoId) resetForVideo(vid);
    ensureToggleButton();
    if (!settings.enabled || !vid) return;
    const video = getVideo();
    if (!video) return;

    if (state.cues.length) {
      stopStt();
      getPlayer()?.classList.add('ytlt-hide-native');
      tickCues(video);
    } else {
      maybeEnableCc();
      getPlayer()?.classList.toggle('ytlt-hide-native', !!live.lastText);
      tickLive(video);
      tickStt(video, !!live.lastText);
    }
  }

  function tickCues(video) {
    const t = video.currentTime * 1000;
    const idx = L.findCueIndex(state.cues, t);
    ensureTranslated(idx < 0 ? 0 : idx);

    if (idx < 0) { hideOverlay(); state.lastIdx = idx; return; }
    const cue = state.cues[idx];
    const next = state.cues[idx + 1];
    const visibleUntil = Math.min(next ? next.start : Infinity, cue.end + 1500);
    const tr = state.translations[idx];

    if (t > visibleUntil) hideOverlay();
    else showOverlay(tr ?? '…', cue.text);

    if (idx !== state.lastIdx) {
      // A jump of more than one cue means a seek: drop whatever is still being said.
      if (idx !== state.lastIdx + 1) stopSpeech();
      state.lastIdx = idx;
    }

    // Speak once per cue, as soon as its translation is ready (even if it arrives late).
    if (state.spokenIdx !== idx && tr !== undefined && !video.paused && t < cue.end) {
      state.spokenIdx = idx;
      const available = (next ? next.start : cue.end + 1000) - t;
      speak(tr, available, video);
    }
  }

  function tickLive(video) {
    const now = Date.now();
    const text = [...document.querySelectorAll('#movie_player .ytp-caption-segment')]
      .map((s) => s.textContent).join(' ').replace(/\s+/g, ' ').trim();

    if (text && text !== live.lastText) {
      const added = L.newSuffix(live.lastText, text);
      live.lastText = text;
      live.lastChange = now;
      if (added) {
        live.buffer = `${live.buffer} ${added}`.trim();
        if ((/[.!?…]["'»”)]*$/.test(live.buffer) && live.buffer.length > 20) || live.buffer.length > LIVE_MAX_CHARS) {
          flushLive(video);
        }
      }
    } else if (!text) {
      live.lastText = '';
    }
    if (live.buffer && now - live.lastChange > LIVE_IDLE_MS) flushLive(video);
    if (live.clearAt && now > live.clearAt) { hideOverlay(); live.clearAt = 0; }
  }

  function flushLive(video) {
    const original = live.buffer;
    live.buffer = '';
    if (original && !video.paused) translateAndSay(original, video);
  }

  // For text that arrives in real time (on-screen live captions, Deepgram): show and speak at once.
  function translateAndSay(original, video) {
    const gen = state.gen;
    translate([original]).then(([tr]) => {
      if (gen !== state.gen || !settings.enabled || state.cues.length) return;
      showOverlay(tr, original);
      live.clearAt = Date.now() + 7000;
      speak(tr, 0, video);
    }, (err) => console.warn('[YTLT]', err.message));
  }

  // ---------- speech recognition fallback ----------
  function tickStt(video, hasCaptions) {
    const now = Date.now();
    const dt = stt.lastTick ? Math.min(now - stt.lastTick, 1000) : 0;
    stt.lastTick = now;
    if (hasCaptions) {
      stt.noCaptionMs = 0;
      stopStt();
      return;
    }
    if (!video.paused) stt.noCaptionMs += dt;
    if (stt.client || stt.failed || !settings.sttEnabled || !deepgramKey) return;

    const btn = document.querySelector('#movie_player .ytp-subtitles-button');
    const ccAvailable = btn && btn.style.display !== 'none' && btn.getAttribute('aria-disabled') !== 'true';
    if (stt.noCaptionMs < (ccAvailable ? STT_WAIT_MS : STT_WAIT_NO_CC_MS)) return;

    stt.client = new globalThis.YTLTStt.DeepgramStream({
      key: deepgramKey,
      language: settings.sttLanguage,
      onUtterance: (text) => { if (!video.paused) translateAndSay(text, video); },
      onError: (message) => {
        stt.client = null;
        stt.failed = true;
        showOverlay(message, '');
        live.clearAt = Date.now() + 6000;
      },
    });
    stt.client.start(video);
  }

  function stopStt() {
    if (!stt.client) return;
    stt.client.stop();
    stt.client = null;
  }

  // New video or changed STT settings: forget earlier failures and wait for captions again.
  function restartStt() {
    stopStt();
    stt.failed = false;
    stt.noCaptionMs = 0;
  }

  // Turn on YouTube captions once so the player requests them and we can capture them.
  function maybeEnableCc() {
    if (state.ccAttemptAt && Date.now() - state.ccAttemptAt < 5000) return;
    const btn = document.querySelector('#movie_player .ytp-subtitles-button');
    if (!btn || btn.style.display === 'none') return;
    state.ccAttemptAt = Date.now();
    if (btn.getAttribute('aria-pressed') === 'false') {
      btn.click();
      state.enabledCcByUs = true;
    }
  }

  function toggleCc(on) {
    const btn = document.querySelector('#movie_player .ytp-subtitles-button');
    if (btn && (btn.getAttribute('aria-pressed') === 'true') !== on) btn.click();
  }

  // ---------- speech ----------
  function pickVoice() {
    const voices = speechSynthesis.getVoices();
    const lang = settings.targetLang.toLowerCase();
    if (settings.voiceName) {
      const v = voices.find((x) => x.name === settings.voiceName);
      if (v) return v;
    }
    const matching = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(lang.split('-')[0]));
    return matching.find((v) => /google|natural|online/i.test(v.name)) || matching[0] || null;
  }

  function speak(text, availableMs, video) {
    if (!settings.speak || !text || !('speechSynthesis' in window)) return;
    // Already one utterance waiting behind the current one: we're lagging, skip ahead.
    if (speech.active >= 2) stopSpeech();

    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.lang = voice?.lang || settings.targetLang;
    u.rate = L.fitRate(text, speech.active ? availableMs * 0.7 : availableMs, settings.rate);

    speech.active++;
    u.onstart = () => duck(video);
    const done = () => {
      speech.active = Math.max(0, speech.active - 1);
      if (!speech.active) scheduleRestore(video);
    };
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
  }

  function stopSpeech() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    speech.active = 0;
    scheduleRestore(getVideo(), 0);
  }

  function duck(video) {
    clearTimeout(speech.restoreTimer);
    if (!video || speech.savedVolume !== null) return;
    speech.savedVolume = video.volume;
    video.volume = speech.savedVolume * settings.duckVolume;
  }

  function scheduleRestore(video, delay = 350) {
    clearTimeout(speech.restoreTimer);
    speech.restoreTimer = setTimeout(() => {
      if (speech.active || speech.savedVolume === null) return;
      if (video) video.volume = speech.savedVolume;
      speech.savedVolume = null;
    }, delay);
  }

  // ---------- overlay ----------
  function getPlayer() { return document.querySelector('#movie_player'); }
  function getVideo() { return document.querySelector('#movie_player video'); }

  function getOverlay() {
    const player = getPlayer();
    if (!player) return null;
    let el = player.querySelector('.ytlt-overlay');
    if (!el) {
      el = document.createElement('div');
      el.className = 'ytlt-overlay';
      el.innerHTML = '<div class="ytlt-box"><div class="ytlt-tr"></div><div class="ytlt-orig"></div></div>';
      el.style.setProperty('--ytlt-font-size', `${settings.fontSize}px`);
      player.appendChild(el);
    }
    return el;
  }

  function showOverlay(translation, original) {
    const el = getOverlay();
    if (!el) return;
    el.querySelector('.ytlt-tr').textContent = translation;
    const orig = el.querySelector('.ytlt-orig');
    orig.textContent = settings.showOriginal ? original : '';
    orig.hidden = !settings.showOriginal;
    el.classList.add('ytlt-visible');
  }

  function hideOverlay() {
    getPlayer()?.querySelector('.ytlt-overlay')?.classList.remove('ytlt-visible');
  }

  // ---------- manual on/off ----------
  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0 0 14.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>';

  YTLT_I18N.onChange(updateToggleButton);
  YTLT_I18N.ready.then(updateToggleButton);

  function toggleEnabled() {
    chrome.storage.sync.set({ enabled: !settings.enabled });
  }

  // YouTube rebuilds the controls on navigation, so re-insert the button whenever it's gone.
  function ensureToggleButton() {
    const controls = document.querySelector('#movie_player .ytp-right-controls');
    if (!controls || controls.querySelector('.ytlt-toggle')) return;
    const btn = document.createElement('button');
    btn.className = 'ytp-button ytlt-toggle';
    btn.innerHTML = ICON;
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggleEnabled(); });
    controls.prepend(btn);
    updateToggleButton();
  }

  function updateToggleButton() {
    const btn = document.querySelector('#movie_player .ytlt-toggle');
    if (!btn) return;
    const label = YTLT_I18N.t(settings.enabled ? 'playerTurnOff' : 'playerTurnOn');
    btn.setAttribute('aria-pressed', String(settings.enabled));
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }

  function showToast(text) {
    const player = getPlayer();
    if (!player) return;
    let el = player.querySelector('.ytlt-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'ytlt-toast';
      player.appendChild(el);
    }
    el.textContent = text;
    el.classList.add('ytlt-visible');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('ytlt-visible'), 1200);
  }

  // Pause/seek handling for speech.
  document.addEventListener('pause', (e) => { if (e.target === getVideo()) speechSynthesis.pause(); }, true);
  document.addEventListener('play', (e) => { if (e.target === getVideo()) speechSynthesis.resume(); }, true);
  document.addEventListener('seeking', (e) => {
    if (e.target !== getVideo()) return;
    stopSpeech();
    state.spokenIdx = -1;
    live.buffer = '';
    stt.client?.reset();
  }, true);
})();
