# Twitch English v1.1.0

Automatically translate supported non-English Twitch chat into English in Helium and other Chromium browsers. No API key, account, or subscription is required.

- **Language exclusions:** German and English are excluded by default. Use the searchable language list to choose which languages stay untranslated.
- **Readable chat:** Show translations below messages or replace their text with an original-text toggle. Usernames, badges, emotes, and original links remain available.
- **Responsive translation:** Request batching, a memory-only cache, and rate-limit backoff reduce repeated requests. Pause globally or for individual channels.
- **Privacy:** Chat message text may be sent to Google for translation. The extension has no developer telemetry, accounts, or persistent chat logs.

Translations use an unofficial, undocumented Google endpoint. Access is currently free without a key, but unlimited usage, continued availability, language detection accuracy, and response times are not guaranteed.

## Downloads

- `Twitch-English-v1.1.0.zip` — extension ready to load unpacked.
- `Twitch-English-v1.1.0-source.zip` — source code, tests, and development scripts.
- `SHA256SUMS.txt` — SHA-256 checksums for both archives.

## Install

1. Download and extract `Twitch-English-v1.1.0.zip` into a folder you will keep.
2. Open `chrome://extensions` in Helium or your Chromium browser and enable **Developer mode**.
3. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
4. Refresh Twitch, then open the extension popup to adjust your settings.

When updating an existing unpacked installation, update its files, reload the extension on `chrome://extensions`, and refresh Twitch.

Validation: **26 automated tests passed**, with browser verification of the extension's popup and simulated Twitch chat flows.
