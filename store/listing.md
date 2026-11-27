# Chrome Web Store listing

Text and answers to paste into the Developer Dashboard.

## Package

Upload `dist/youtube-live-translate-v<version>.zip` (build with `./scripts/build.sh`).

## Store listing

**Name:** YouTube Live Translate

**Summary (≤132 chars):**
Translates YouTube videos in real time: subtitles on top of the video and a voice-over in your language.

**Category:** Accessibility (alternative: Education)

**Language:** English (default) + Ukrainian — the extension name and description come from `_locales/`, so add a Ukrainian listing too.

**Description:**

Watch YouTube videos in any language with a live translation in your own.

• Translated subtitles over the video, with the original line underneath (optional)
• Voice-over: the translation is read aloud, and the original audio is lowered while it speaks
• Works with regular videos, auto-generated captions and live streams
• Videos without any subtitles: speech is recognised with Deepgram (requires your own Deepgram API key, paid per use)
• One-click on/off: a button in the YouTube player or Alt+Shift+T
• 13 target languages, adjustable voice, speech speed, font size and original volume

How to use: open a YouTube video. Translation starts on its own; settings are in the extension icon.

Privacy: no accounts, no analytics. Caption text is sent to Google Translate; audio is sent to Deepgram only if you enable it with your own key.

**Screenshots (1280×800 or 640×400, 1–5):**
1. Video with the translated subtitle and the original line
2. Extension popup with settings
3. Player controls with the translation toggle button

**Small promo tile (440×280):** optional.

## Privacy practices tab

**Single purpose:**
Translate the speech and subtitles of YouTube videos into the user's language and show/read the translation while the video plays.

**Permission justifications:**
- `storage` — saves the user's settings (target language, voice, speed, on/off) and the optional Deepgram API key.
- Host permission `https://clients5.google.com/*` — sends subtitle text to Google Translate to translate it.
- Content scripts on `https://www.youtube.com/*` — read the video's captions, show the translated subtitle over the player, read it aloud and add the on/off button.

**Remote code:** No, I am not using remote code.

**Data usage — collected data types:** "Website content" (caption text and video audio, sent to the translation / speech-recognition services to provide the feature). Nothing else.

**Certifications (tick all three):**
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:**
https://github.com/dsvsergey/youtube_translate/blob/main/PRIVACY.md

## Distribution

**Visibility:** Unlisted (installable by link only) or Public.
