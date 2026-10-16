# Twitch Translator

A free Chrome extension for Helium that automatically adds English translations to Twitch chat. No API key, account, subscription, or build step is required. [Helium supports Chromium extensions](https://helium.computer/).

![screenshot](https://github.com/melchiorrrr/TwitchTranslator/blob/main/screenshot.png?raw=true)

## Install in Helium/Chromium based browser

1. Keep the extension files in a permanent folder. If using this source repository, use its `extension` folder.
2. Open `chrome://extensions` in Helium.
3. Enable **Developer mode**, click **Load unpacked**, and select the **extension** folder containing `manifest.json`.
4. Refresh any open Twitch tabs. Pin **Twitch English** from the browser's extensions menu for easy access.
5. Open a Twitch stream and use the extension popup to adjust translation settings.

If using `Twitch-English-v1.1.0.zip` (or the unversioned `Twitch-English.zip` copy), extract it first and select the extracted folder containing `manifest.json`. Loading a ZIP directly does not install an unpacked extension. Keep that folder after installation; Helium loads the extension from it. See [INSTALL.md](INSTALL.md) for instructions included with the finished extension.

After updating the files, click the extension's reload button on `chrome://extensions`, then refresh Twitch.

## What it does

- Detects the source language and translates supported chat into English. **Deutsch (German) and English stay unchanged by default.**
- Offers a searchable **Do not translate** language selector in the popup. Add languages you understand or uncheck German to translate it too. English is always left unchanged because it is the output language.
- Displays the translation **below** the original by default, or lets you **replace** the message text with an original-text toggle.
- Preserves Twitch usernames, badges, emotes, and original links.
- Offers a global switch and a pause control for the current channel.
- Lets you show the detected language and optionally translate up to the latest **40 existing messages** when starting.
- Includes **Fast** and **Gentle** speeds, live statistics, a translation test, and a memory-cache clear control.

The extension batches requests and reuses recent translations to reduce waiting and repeated network calls. Fast mode favors responsiveness; Gentle mode sends requests less often. In very busy chats, the bounded queue favors newer messages, so some messages may remain untranslated. Original messages remain readable when translation is unavailable.

Language exclusions also update existing translations immediately, including restoring the original text in replacement mode. Removing an exclusion reuses an existing translation when available, or translates previously excluded messages already processed in the current chat. The recent-history setting still controls whether untouched older messages are translated.

The German/English defaults also apply when upgrading from version 1.0 without a saved language selection. Your other settings are preserved. Exclusions follow the **detected** language: short, ambiguous or mixed-language messages may be misidentified.

## Free service and practical limits

Translations use an **unofficial, undocumented Google Translate endpoint** at `translate.googleapis.com`. It currently accepts requests without an API key or payment. This extension does not use the supported Google Cloud Translation API, which [requires a project, credentials, and billing](https://docs.cloud.google.com/translate/docs/setup).

There is no guaranteed free quota, response time, uptime, or continued access for this endpoint. Google can rate-limit, block, change, or remove it. The extension backs off after rate limits; waiting or switching to Gentle mode may help. A successful test confirms service access at that moment.

Translation covers the languages the provider recognizes; it cannot promise every language. Short words, slang, mixed-language messages, names, and jokes may be detected or translated incorrectly. An ambiguous message can be mistaken for English and left unchanged.

## Privacy and permissions

Chat message text may be sent to Google for translation and source-language detection. When the browser confidently identifies an excluded language locally, that message needs no Google request. Short or uncertain messages can still be sent to Google to identify their language; exclusions control what is displayed. Google receives your IP address as part of the normal network connection. Requests omit cookies. The extension has no telemetry, advertising, accounts, or persistent chat logs. Settings stay in local browser storage; translations are cached only in memory. See [PRIVACY.md](PRIVACY.md).

Permissions are limited to local settings storage, Twitch pages (`https://twitch.tv/*` and `https://*.twitch.tv/*`), and translation requests to `https://translate.googleapis.com/*`.

## Troubleshooting

- **No translations:** Check that the extension is enabled globally and for this channel, check **Do not translate**, refresh Twitch, and use the popup's translation test. German and English messages do not receive a translation by default. The connection test uses a fixed Spanish phrase and bypasses language exclusions.
- **Rate limit or network error:** Leave the original chat visible and try again later. Gentle mode reduces request frequency. A VPN, firewall, or provider outage may affect access.
- **Extension was updated:** Reload it on `chrome://extensions`, then refresh Twitch. Existing tabs otherwise retain the old content script.
- **Chat layout changed:** Twitch can change its page structure. If the translation test works but new chat messages do not translate, the extension may need a selector update.

This is an independent project, unaffiliated with Twitch, Google, or Helium. It has not been installed in your Helium profile. Other extensions that replace Twitch's chat DOM, such as 7TV, may require additional compatibility work.

## Development

The extension uses Manifest V3 and plain JavaScript. Edit files under `extension/`; there is no compilation step.

With Node.js installed, run these commands from the repository root:

```sh
npm test
npm run check
npm run package
```

`npm run package` creates these GitHub Release assets under `dist/` using Windows PowerShell and built-in .NET ZIP support:

- `Twitch-English-v1.1.0.zip`: finished extension, with `manifest.json` at the archive root, installation instructions, privacy notice, and license.
- `Twitch-English-v1.1.0-source.zip`: source, documentation, build scripts, and tests.
- `SHA256SUMS.txt`: checksums of both ZIP files.
- `RELEASE-NOTES-v1.1.0.md`: release description ready to paste into GitHub.

The script reads the version from the manifest and checks it against `package.json`. Archive entries use fixed timestamps and contain no Git metadata, local QA profiles, captures, or extracted release copies. It also refreshes the unversioned ZIP copies in the repository root. Attach the versioned ZIPs and checksums to a GitHub Release tagged `v1.1.0`; use [RELEASE-NOTES.md](RELEASE-NOTES.md) for its description. The unpacked extension does not automatically update from GitHub.

The Node tests exercise translation scheduling, input validation, caching, timeouts, rate limits, settings and background-message security. The resource check verifies manifest files, permissions and JavaScript syntax.

Version 1.1 browser QA on 16 October 2026 verified German/English default exclusions, language search and persistence, removing and restoring German, and adding/removing French in replacement mode. Existing cached translations returned without another request. Previously excluded new messages also translated after removing their exclusion with recent-history translation disabled. The connection test still worked with Spanish excluded. All 26 Node tests passed.

Version 1.0 browser QA on 15 October 2026 loaded the actual extension in a separate Chromium profile and checked a simulated chat fixture plus a public live Twitch popout chat. German, Japanese, Spanish, French and Russian messages translated; English and emote-only messages stayed unchanged. Controls, original-text reveal, channel pause, edited rows and split text fragments were also checked. The live chat check observed 19 translated rows among 37 visible messages; this is a snapshot, not a promised translation ratio. A sample batch took about one second. These checks do not establish compatibility with every Twitch layout or Helium version. Browser QA tooling such as the Playwright CLI is not bundled with the extension. The fixture is at `tests/fixtures/twitch-chat.html`.

Licensed under MIT; see [LICENSE](LICENSE).
