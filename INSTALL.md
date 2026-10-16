# Twitch English

Automatically translate Twitch chat into English in Helium or another Chromium browser. No account, API key, subscription, or build step is required.

## Install

1. Extract the extension ZIP into a permanent folder. Keep all extracted files together.
2. Open `chrome://extensions` in Helium.
3. Enable **Developer mode**.
4. Click **Load unpacked** and choose the extracted folder containing `manifest.json`.
5. Refresh open Twitch tabs. Pin **Twitch English** in the extensions menu to open its settings easily.

The ZIP must be extracted before installation. Keep the extracted folder after installation; the browser loads the extension from it.

## Choose your languages

Open the extension popup and expand **Do not translate**. **Deutsch (German) and English are selected by default.** Search for other languages and check those you want to leave unchanged. Uncheck German to translate it into English. English always stays unchanged because it is the output language.

The popup also provides global and per-channel pause controls, translations below the original or replacement text, source-language labels, recent-history translation, Fast/Gentle speed, a connection test, and a cache-clear button.

## Update

Extract a newer release over the same extension folder, click **Reload** for Twitch English on `chrome://extensions`, then refresh Twitch. Your settings are saved separately in the browser.

This unpacked release does not install updates automatically.

## Service and privacy

Translation uses an unofficial Google Translate endpoint. Message text may be sent to Google for translation and language detection. Requests omit cookies. The extension has no analytics, developer-operated server, accounts, or persistent chat logs. Settings stay in your browser; translations are cached only in memory. See **PRIVACY.md** for details.

The endpoint currently works without payment or an API key, but availability, limits, language detection, translation quality, and speed are not guaranteed. Rate limits pause new requests temporarily; very busy chats may have skipped messages. Excluding a language does not guarantee that its text stays on your device: uncertain messages may still be sent for language detection.

If nothing translates, check the global switch, channel pause, and language exclusions, then use **Test connection**. Reload the extension and refresh Twitch after updating its files. Twitch layout changes or other extensions that replace chat can require compatibility updates.

Independent project; not affiliated with Twitch, Google, or Helium. Distributed under the included **LICENSE**.
