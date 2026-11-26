// Pure helpers shared by the content script and the Node tests.
globalThis.YTLT = (() => {
  const WORD_MAX_MS = 1500;

  // Returns time-ordered tokens: { t, end, text, newEvent } (milliseconds).
  function parseTimedText(raw) {
    const text = (raw || '').trim();
    if (text.startsWith('{')) return parseJson3(JSON.parse(text));
    if (text.startsWith('<') && typeof DOMParser !== 'undefined') return parseXml(text);
    return [];
  }

  function parseJson3(data) {
    const tokens = [];
    for (const ev of data.events || []) {
      if (!ev.segs) continue;
      const start = ev.tStartMs || 0;
      const end = start + (ev.dDurationMs || 0);
      const segs = ev.segs.filter((s) => s.utf8 && s.utf8.trim());
      segs.forEach((s, i) => {
        const t = start + (s.tOffsetMs || 0);
        const next = segs[i + 1];
        const segEnd = next ? start + (next.tOffsetMs || 0) : end;
        tokens.push({
          t,
          end: Math.min(Math.max(segEnd, t), t + Math.max(WORD_MAX_MS, segs.length === 1 ? end - start : 0)),
          text: s.utf8.replace(/\n/g, ' '),
          newEvent: i === 0,
        });
      });
    }
    return tokens.sort((a, b) => a.t - b.t);
  }

  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    const tokens = [];
    // srv3: <p t="ms" d="ms"><s t="offset">word</s></p>
    for (const p of doc.querySelectorAll('p')) {
      const start = +p.getAttribute('t') || 0;
      const end = start + (+p.getAttribute('d') || 0);
      const parts = [...p.querySelectorAll('s')];
      if (parts.length) {
        parts.forEach((s, i) => {
          const t = start + (+s.getAttribute('t') || 0);
          const next = parts[i + 1];
          const segEnd = next ? start + (+next.getAttribute('t') || 0) : end;
          if (s.textContent.trim()) tokens.push({ t, end: Math.min(Math.max(segEnd, t), t + WORD_MAX_MS), text: s.textContent, newEvent: i === 0 });
        });
      } else if (p.textContent.trim()) {
        tokens.push({ t: start, end, text: p.textContent.replace(/\n/g, ' '), newEvent: true });
      }
    }
    // srv1: <text start="sec" dur="sec">line</text>
    for (const el of doc.querySelectorAll('text')) {
      const t = Math.round((+el.getAttribute('start') || 0) * 1000);
      const end = t + Math.round((+el.getAttribute('dur') || 0) * 1000);
      if (el.textContent.trim()) tokens.push({ t, end, text: el.textContent.replace(/\n/g, ' '), newEvent: true });
    }
    return tokens.sort((a, b) => a.t - b.t);
  }

  const SENTENCE_END = /[.!?…。！？]["'»”)\]]*$/;
  const SOFT_END = /[,;:—–]["'»”)\]]*$/;

  // Merges tokens into speakable phrases: split on sentence punctuation, long pauses or length.
  function groupCues(tokens, { maxChars = 160, pauseMs = 1300 } = {}) {
    const cues = [];
    let cur = null;
    const flush = () => {
      if (!cur) return;
      const text = cur.text.replace(/\s+/g, ' ').trim();
      if (text) cues.push({ start: cur.start, end: Math.max(cur.end, cur.start + 600), text });
      cur = null;
    };
    for (const tok of tokens) {
      if (cur && tok.t - cur.end > pauseMs) flush();
      if (!cur) {
        cur = { start: tok.t, end: tok.end, text: tok.text };
      } else {
        const needsSpace = tok.newEvent && !/\s$/.test(cur.text) && !/^\s/.test(tok.text);
        cur.text += (needsSpace ? ' ' : '') + tok.text;
        cur.end = Math.max(cur.end, tok.end);
      }
      const trimmed = cur.text.trim();
      if ((SENTENCE_END.test(trimmed) && trimmed.length >= 12) ||
          (SOFT_END.test(trimmed) && trimmed.length >= maxChars * 0.6) ||
          trimmed.length >= maxChars) {
        flush();
      }
    }
    flush();
    return cues;
  }

  // Index of the last cue with start <= timeMs, or -1.
  function findCueIndex(cues, timeMs) {
    let lo = 0, hi = cues.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cues[mid].start <= timeMs) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  const words = (s) => (s || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');

  // For rolling live captions: the words of `cur` that were not already at the end of `prev`.
  function newSuffix(prev, cur) {
    const a = words(prev), b = words(cur);
    if (!b.length) return '';
    for (let k = Math.min(a.length, b.length); k > 0; k--) {
      let match = true;
      for (let i = 0; i < k; i++) {
        if (norm(a[a.length - k + i]) !== norm(b[i])) { match = false; break; }
      }
      if (match) return b.slice(k).join(' ');
    }
    return b.join(' ');
  }

  // Speech rate so that `text` fits into `availableMs`, never slower than `baseRate`.
  function fitRate(text, availableMs, baseRate = 1, maxRate = 2) {
    const CHARS_PER_SEC = 14;
    const needMs = (text.length / CHARS_PER_SEC) * 1000 / baseRate;
    if (availableMs <= 0 || needMs <= availableMs) return baseRate;
    return Math.min(maxRate, baseRate * needMs / availableMs);
  }

  function videoIdFromUrl(href) {
    try {
      const u = new URL(href);
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const m = u.pathname.match(/^\/(?:shorts|live|embed)\/([\w-]{6,})/);
      return m ? m[1] : null;
    } catch (_) {
      return null;
    }
  }

  return { parseTimedText, parseJson3, groupCues, findCueIndex, newSuffix, fitRate, videoIdFromUrl };
})();

if (typeof module !== 'undefined') module.exports = globalThis.YTLT;
