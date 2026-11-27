# Privacy Policy — YouTube Live Translate

_Last updated: November 27, 2026_

YouTube Live Translate is a browser extension that translates YouTube subtitles and speech and reads the translation aloud. It has no servers of its own, no analytics, and no accounts. The developer does not collect, receive or store any of your data.

## What data is processed, and where

| Data | Sent to | Why | When |
|------|---------|-----|------|
| Subtitle / caption text of the video you are watching | Google Translate (`clients5.google.com`) | To translate it into your chosen language | While translation is turned on |
| Audio of the video you are watching | Deepgram (`api.deepgram.com`) | Speech recognition for videos without subtitles | Only if you entered your own Deepgram API key, speech recognition is enabled, and the video has no subtitles |
| Your Deepgram API key | Deepgram, as authentication | To use your Deepgram account | Together with the audio above |

The extension never processes your microphone, your browsing history, your YouTube account, or any page other than youtube.com. Only the video's own audio and captions are processed.

Data sent to Google and Deepgram is handled under their own privacy policies:
- Google: https://policies.google.com/privacy
- Deepgram: https://deepgram.com/privacy

## Data stored on your device

- **Settings** (target language, voice, speed, font size, on/off state) are kept in `chrome.storage.sync`, so Chrome may sync them across your own signed-in browsers.
- **The Deepgram API key** is kept only in `chrome.storage.local` on this device and is never synced.

Translations are cached in memory while the browser is running and are discarded afterwards.

Removing the extension deletes all of this data.

## Selling and sharing

Your data is not sold, not shared with third parties other than the two services listed above, and not used for advertising, profiling or creditworthiness.

## Contact

Questions: open an issue at https://github.com/dsvsergey/youtube_translate/issues
