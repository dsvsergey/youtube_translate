# YouTube Live Translate

**English** | [Українська](README.uk.md)

A Chrome extension that translates YouTube subtitles while you watch, shows the translation over the video, and reads it aloud while ducking the original audio.

## Installation

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Open any YouTube video. Settings are available from the extension icon.

## Turning translation on and off

- The translate button in the YouTube player controls (next to the settings gear) — blue means on.
- Keyboard shortcut **Alt+Shift+T** (can be changed at `chrome://extensions/shortcuts`).
- The **Enabled** switch in the extension popup.

When translation is off, the extension icon shows an **OFF** badge.

## How it works

- **Regular videos.** `src/inject.js` intercepts the `/api/timedtext` response that the player itself fetches (YouTube rejects a direct request without a signed token). If subtitles are off, the extension clicks the CC button once so the player loads them. Words are merged into sentences based on punctuation, pauses and length (`src/lib.js`) and translated ahead of time in batches — about 40 phrases ahead of the playback position.
- **Live streams and fallback.** If the subtitles can't be intercepted (for example, during a live stream), the extension reads the captions the player displays on screen, picks out the new words, and translates them when a sentence ends or a pause occurs.
- **Videos without subtitles — Deepgram.** If a video has been playing for 6 s with no subtitles (or 1.5 s if the player has no CC button at all), `src/stt.js` captures the audio straight from the video (`video.captureStream()`) and streams it through MediaRecorder (webm/opus) to Deepgram's streaming WebSocket. Finished phrases (`speech_final` / `UtteranceEnd`) are translated and spoken. As soon as subtitles appear, speech recognition stops so no money is wasted. Requires an API key from console.deepgram.com: you enter it in the settings, and it is stored in `chrome.storage.local` and not synced to other devices. Model: `nova-3` for auto-detect and English, `nova-2` for other languages.
- **Voice-over.** Web Speech API (`speechSynthesis`). The speech rate automatically increases (up to 2×) if a phrase doesn't fit in the gap before the next one. If the voice-over falls far behind, the queue is reset. While speaking, the video volume is lowered; pausing the video pauses the voice-over, and seeking stops it.
- **Translation.** Google's free `clients5.google.com/translate_a/t` endpoint (no key required); requests are sent from `src/background.js`.

## Limitations

- Without subtitles, the translation lags the speech by 1–3 s: audio can't be recognized ahead of time.
- Language auto-detect (`multi`) supports only en, es, fr, de, ru, pt, ja, it, nl, hi. For Ukrainian and other languages, select the video language manually.
- Voice quality depends on the voices installed on your system. On macOS, Ukrainian has the "Lesya" voice. You can add more voices in System Settings → Accessibility → Spoken Content.
- The Google endpoint is unofficial and may rate-limit requests.

## Tests

```sh
node --test tests/*.test.js
```
