# Twitch English privacy

Twitch English translates Twitch chat using Google's servers. It does not run translations entirely on your device.

## Data sent to Google

The extension sends extracted chat message text to `https://translate.googleapis.com/` with the requested target language, English, and automatic source-language detection. Text can include names, mentions, or URLs typed inside a message. It does not separately send the message author's Twitch username, badges, Twitch account information, or browsing history.

Messages confidently identified locally as an excluded language need no translation request. Uncertain or short messages can still be sent to Google to detect their source language before the exclusion is applied. Selecting **Do not translate** therefore controls which translations appear; it does not guarantee that text in a selected language stays entirely on your device.

Google receives your IP address and normal connection information when you contact its servers. Translation requests use `credentials: "omit"`, so browser cookies are not included. Google's handling of those requests is governed by [Google's privacy policy](https://policies.google.com/privacy).

The endpoint is unofficial and undocumented. The privacy or data-use assurances published for the paid Google Cloud Translation API should not be assumed to apply to this endpoint.

## Data kept locally

- Preferences, including language exclusions and channel pauses, are saved in `chrome.storage.local` in your browser profile. The extension does not sync them to an account.
- Recent message text, translations, and detected languages may be held in a bounded **memory-only cache** to avoid duplicate requests. The popup provides a cache-clear control. The cache is not written to browser storage and disappears when the extension's background worker stops or is reloaded.
- Runtime counters and connection status support the popup's live statistics.

The extension does not create persistent chat logs. It has no developer-operated backend, analytics, telemetry, advertising, or account system. It does not transmit chat to the extension's developer.

## Access and control

The extension requests:

| Permission | Purpose |
| --- | --- |
| `storage` | Save preferences locally. |
| `https://twitch.tv/*` and `https://*.twitch.tv/*` | Read chat messages and display translations on Twitch. |
| `https://translate.googleapis.com/*` | Request translations from Google. |

Pause translation globally or for a channel to stop scheduling new translations there. A request already sent may finish. Removing the extension stops its activity and removes its local extension settings through the browser's normal extension-removal process.

Twitch English is an independent extension, unaffiliated with Twitch, Google, or Helium.
