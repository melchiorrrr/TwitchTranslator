import { SETTINGS_DEFAULTS, normalizeSettings, normalizeLanguage, isLanguageExcluded, getChannel } from './lib/shared.js';
import { TranslationEngine, normalizeTexts } from './lib/translator.js';

const engine = new TranslationEngine({ enabled: SETTINGS_DEFAULTS.enabled, speed: SETTINGS_DEFAULTS.speed });
let currentSettings = normalizeSettings(SETTINGS_DEFAULTS);
let settingsRevision = 0;

function applySettings(settings) {
  currentSettings = normalizeSettings(settings);
  engine.setSettings(currentSettings);
}

// Register all listeners during service-worker evaluation, before awaiting storage.
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.settings) {
    settingsRevision += 1;
    applySettings(changes.settings.newValue);
  }
});

const initialRevision = settingsRevision;
const ready = chrome.storage.local.get('settings').then((stored) => {
  if (settingsRevision === initialRevision) applySettings(stored.settings);
}).catch(() => {
  // If storage is temporarily unavailable, the extension still works with defaults.
});

function isTwitchSender(sender) {
  if (sender.id && sender.id !== chrome.runtime.id) return false;
  try {
    const url = new URL(sender.url);
    return url.protocol === 'https:' && (url.hostname === 'twitch.tv' || url.hostname.endsWith('.twitch.tv'));
  } catch { return false; }
}

function isExtensionSender(sender) {
  if (sender.id && sender.id !== chrome.runtime.id) return false;
  return typeof sender.url === 'string' && sender.url.startsWith(chrome.runtime.getURL(''));
}

function localLanguage(text) {
  if (text.length < 24 || typeof chrome.i18n?.detectLanguage !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const timeout = setTimeout(() => finish(null), 500);
    try {
      chrome.i18n.detectLanguage(text, (result) => {
        if (chrome.runtime.lastError) { finish(null); return; }
        const top = result?.languages?.[0];
        finish(result?.isReliable === true && top?.percentage >= 90 ? normalizeLanguage(top.language) : null);
      });
    } catch { finish(null); }
  });
}

function excludedResult(text, sourceLanguage) {
  return { text, translatedText: text, sourceLanguage, status: 'excluded' };
}

async function translate(texts, { applyExclusions = true } = {}) {
  const input = normalizeTexts(texts);
  if (!engine.enabled || !input.length) {
    return { ok: true, results: await engine.translateMany(input), stats: engine.getStatus() };
  }
  const detected = applyExclusions ? await Promise.all(input.map(localLanguage)) : input.map(() => null);
  const rawResults = new Array(input.length);
  // A setting may change while another message waits on the provider. If a locally
  // excluded language was just enabled, translate it before returning the batch.
  while (engine.enabled) {
    const indices = input.flatMap((_, index) => !rawResults[index] &&
      !(applyExclusions && isLanguageExcluded(detected[index], currentSettings.excludedLanguages)) ? [index] : []);
    if (!indices.length) break;
    const translated = await engine.translateMany(indices.map(index => input[index]));
    indices.forEach((index, offset) => { rawResults[index] = translated[offset]; });
  }
  const results = input.map((text, index) => {
    if (!engine.enabled) return {
      text, translatedText: text, sourceLanguage: null, status: 'skipped', error: 'Translation is disabled.',
    };
    const raw = rawResults[index];
    if (!raw) return excludedResult(text, detected[index]);
    // Filter a copy of the raw result. Cache entries remain usable when the user
    // removes an exclusion, and the newest settings also apply to pending work.
    return applyExclusions && isLanguageExcluded(raw.sourceLanguage, currentSettings.excludedLanguages)
      ? excludedResult(text, raw.sourceLanguage) : raw;
  });
  return { ok: true, results, stats: engine.getStatus() };
}

async function handleMessage(message, sender) {
  if (!message || typeof message !== 'object') return { ok: false, error: 'Invalid extension request.' };
  await ready;
  switch (message.type) {
    case 'TRANSLATE': {
      if (!isTwitchSender(sender)) return { ok: false, error: 'Chat translation is available only on Twitch.' };
      const input = normalizeTexts(message.texts);
      const channel = getChannel(sender.url);
      if (channel && currentSettings.disabledChannels.includes(channel)) {
        return { ok: true, results: input.map((text) => ({
          text, translatedText: text, sourceLanguage: null, status: 'skipped',
          error: 'Translation is paused for this channel.',
        })), stats: engine.getStatus() };
      }
      return translate(input);
    }
    case 'TEST_TRANSLATION':
      if (!isExtensionSender(sender)) return { ok: false, error: 'Open the extension popup to run a translation test.' };
      return translate(['Hola, ¿cómo estás?'], { applyExclusions: false });
    case 'GET_STATUS':
      if (!isTwitchSender(sender) && !isExtensionSender(sender)) return { ok: false, error: 'This page cannot access extension status.' };
      return { ok: true, stats: engine.getStatus() };
    case 'CLEAR_CACHE':
      if (!isExtensionSender(sender)) return { ok: false, error: 'Open the extension popup to clear the cache.' };
      engine.clearCache();
      return { ok: true, stats: engine.getStatus() };
    default:
      return { ok: false, error: 'Unknown extension request.' };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((error) => {
    sendResponse({ ok: false, error: error instanceof TypeError ? error.message : 'Translation could not be completed.' });
  });
  return true;
});
