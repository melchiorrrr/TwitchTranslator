import test from 'node:test';
import assert from 'node:assert/strict';
import { SETTINGS_DEFAULTS, normalizeSettings, normalizeLanguage, isLanguageExcluded, getChannel, shouldTranslate } from '../extension/lib/shared.js';

test('normalizes untrusted persisted settings and deduplicates paused channels', () => {
  assert.deepEqual(normalizeSettings({ enabled: false, displayMode: '<script>', speed: 'gentle', disabledChannels: ['Streamer', 'streamer', 'bad/channel', null] }), {
    enabled: false, displayMode: 'below', showLanguage: true, translateHistory: true, speed: 'gentle', disabledChannels: ['streamer'], excludedLanguages: ['de', 'en'],
  });
  assert.equal(normalizeSettings(null).enabled, true);
});

test('defaults and settings migration exclude German and English while preserving existing choices', () => {
  assert.deepEqual(SETTINGS_DEFAULTS.excludedLanguages, ['de', 'en']);
  assert.deepEqual(normalizeSettings().excludedLanguages, ['de', 'en']);
  const migrated = normalizeSettings({
    enabled: false, displayMode: 'replace', showLanguage: false, translateHistory: false,
    speed: 'gentle', disabledChannels: ['My_Channel'],
  });
  assert.deepEqual(migrated, {
    enabled: false, displayMode: 'replace', showLanguage: false, translateHistory: false,
    speed: 'gentle', disabledChannels: ['my_channel'], excludedLanguages: ['de', 'en'],
  });
  assert.deepEqual(normalizeSettings({ excludedLanguages: [] }).excludedLanguages, ['en']);
  assert.deepEqual(normalizeSettings({ excludedLanguages: ['es'] }).excludedLanguages, ['es', 'en']);
  assert.deepEqual(normalizeSettings({ excludedLanguages: ['DE', 'de', 'iw', 'he', null, 'english', '<script>', 'en'] }).excludedLanguages, ['de', 'he', 'en']);
  assert.deepEqual(normalizeSettings({ excludedLanguages: 'es' }).excludedLanguages, ['de', 'en']);
});

test('normalizes regional language tags and legacy provider aliases and rejects invalid codes', () => {
  for (const [input, expected] of [
    [' DE-de ', 'de-de'], ['en_US', 'en-us'], ['iw-IL', 'he-il'], ['jw', 'jv'],
    ['in', 'id'], ['ji', 'yi'], ['tl', 'fil'], ['sr-Latn', 'sr-latn'], ['zh-Hant-TW', 'zh-hant-tw'],
  ]) assert.equal(normalizeLanguage(input), expected, input);
  for (const value of ['', null, {}, 'english', 'e', 'de--de', '<script>', 'https://example.com']) {
    assert.equal(normalizeLanguage(value), null, String(value));
  }
});

test('language exclusions match base languages and their regions without excluding unrelated languages', () => {
  assert.equal(isLanguageExcluded('de-DE', ['de']), true);
  assert.equal(isLanguageExcluded('en-US', ['en']), true);
  assert.equal(isLanguageExcluded('zh-Hant-TW', ['zh']), true);
  assert.equal(isLanguageExcluded('iw', ['he']), true);
  assert.equal(isLanguageExcluded('tl', ['fil']), true);
  assert.equal(isLanguageExcluded('de', ['de-DE']), false);
  assert.equal(isLanguageExcluded('de-AT', ['de-DE']), false);
  assert.equal(isLanguageExcluded('es', ['de', 'en']), false);
  assert.equal(isLanguageExcluded('de-DE'), true);
  assert.equal(isLanguageExcluded(null, ['de']), false);
  assert.equal(isLanguageExcluded('de', []), false);
});

test('finds channels in ordinary, popout, embedded and moderator Twitch URLs', () => {
  for (const url of ['https://www.twitch.tv/Streamer', 'https://www.twitch.tv/popout/Streamer/chat', 'https://www.twitch.tv/embed/Streamer/chat', 'https://www.twitch.tv/moderator/Streamer']) assert.equal(getChannel(url), 'streamer');
  for (const url of ['https://twitch.tv.evil.test/streamer', 'https://www.twitch.tv/directory', 'chrome://extensions', 'https://www.twitch.tv/videos/123']) assert.equal(getChannel(url), null);
});

test('avoids emote-only, link-only and command traffic without skipping short languages', () => {
  for (const text of ['', '12345 🎉', 'KEKW LUL Kappa', 'https://example.com', '@viewer', '!uptime', '/ban user']) assert.equal(shouldTranslate(text), false, text);
  for (const text of ['hola', 'こんにちは', '안녕하세요', 'привет всем', 'مرحبا', '你好', 'Ça va ?', 'Guten Abend!']) assert.equal(shouldTranslate(text), true, text);
});
