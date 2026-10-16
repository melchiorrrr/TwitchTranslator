import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TranslationEngine, normalizeTexts, parseGoogleResponse, buildGoogleRequest, GOOGLE_TRANSLATE_URL,
} from '../extension/lib/translator.js';

class Clock {
  time = 0;
  id = 0;
  timers = new Map();
  now = () => this.time;
  setTimer = (callback, delay = 0) => {
    const id = ++this.id;
    this.timers.set(id, { callback, at: this.time + Math.max(0, delay) });
    return id;
  };
  clearTimer = (id) => this.timers.delete(id);
  async flush() {
    for (let index = 0; index < 16; index += 1) await Promise.resolve();
  }
  async tick(milliseconds) {
    const target = this.time + milliseconds;
    await this.flush();
    for (let count = 0; count < 10000; count += 1) {
      const next = [...this.timers.entries()].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next || next[1].at > target) break;
      this.time = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
      await this.flush();
      if (count === 9999) throw new Error('The scheduler did not become idle.');
    }
    this.time = target;
    await this.flush();
  }
}

function response(rows, status = 200, headers = {}) {
  return { ok: status >= 200 && status < 300, status,
    text: async () => JSON.stringify(rows), headers: { get: (key) => headers[key] ?? null } };
}

function setup(overrides = {}) {
  const clock = new Clock();
  const calls = [];
  const engine = new TranslationEngine({
    now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer,
    batchWindowMs: 10, minIntervalMs: 20,
    fetchFn: async (url, options) => {
      const texts = new URLSearchParams(options.body).getAll('q');
      calls.push({ url, options, texts, at: clock.time });
      return response(texts.map((text) => [`English: ${text}`, 'de']));
    },
    ...overrides,
  });
  return { engine, clock, calls };
}

test('validates batches without accepting objects, excessive text, or huge arrays', () => {
  assert.deepEqual(normalizeTexts([' Hallo ', '你好']), [' Hallo ', '你好']);
  assert.throws(() => normalizeTexts('hello'), /array/);
  assert.throws(() => normalizeTexts([{}]), /Each message/);
  assert.throws(() => normalizeTexts(['x'.repeat(2001)]), /Each message/);
  assert.throws(() => normalizeTexts(Array(51).fill('hello')), /array/);
  assert.throws(() => normalizeTexts(Array(20).fill('x'.repeat(2000))), /30000/);
});

test('parser preserves each detected language and rejects truncated or changed response shapes', () => {
  assert.deepEqual(parseGoogleResponse([['Hello', 'DE'], ['Hello', 'zh-CN'], ['hi', 'en']], 3), [
    { translatedText: 'Hello', sourceLanguage: 'de' },
    { translatedText: 'Hello', sourceLanguage: 'zh-cn' },
    { translatedText: 'hi', sourceLanguage: 'en' },
  ]);
  assert.deepEqual(parseGoogleResponse(['Hello', 'fr'], 1), [{ translatedText: 'Hello', sourceLanguage: 'fr' }]);
  assert.throws(() => parseGoogleResponse([['hello', 'de']], 2), /unexpected/);
  assert.throws(() => parseGoogleResponse([['hello']], 1), /unexpected/);
  assert.throws(() => parseGoogleResponse([['hello', '<script>']], 1), /unexpected/);
  assert.throws(() => parseGoogleResponse({ translatedText: 'hello' }, 1), /unexpected/);
});

test('chat text is form-encoded in a POST body to one fixed host without credentials or URL text', () => {
  const request = buildGoogleRequest(['你好 & hello', 'a=b? #+%']);
  assert.equal(request.url, GOOGLE_TRANSLATE_URL);
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.referrerPolicy, 'no-referrer');
  assert.equal(request.options.cache, 'no-store');
  assert.deepEqual(new URLSearchParams(request.options.body).getAll('q'), ['你好 & hello', 'a=b? #+%']);
  assert.ok(!request.url.includes('你好'));
});

test('batches messages, keeps order, detects English and leaves non-letter messages unsent', async () => {
  const { engine, clock, calls } = setup();
  engine.fetchFn = async (url, options) => {
    calls.push({ texts: new URLSearchParams(options.body).getAll('q') });
    return response([['How are you?', 'es'], ['ENGLISH AUTOCORRECTION', 'en'], ['Twitch', 'de']]);
  };
  const promise = engine.translateMany(['¿Cómo estás?', ' this is English ', 'Twitch', '123 👋', '  ']);
  await clock.tick(10);
  const results = await promise;
  assert.deepEqual(calls[0].texts, ['¿Cómo estás?', 'this is English', 'Twitch']);
  assert.deepEqual(results.map((result) => result.status), ['translated', 'english', 'unchanged', 'skipped', 'skipped']);
  assert.equal(results[0].translatedText, 'How are you?');
  assert.equal(results[1].translatedText, ' this is English ');
  assert.equal(results[1].text, ' this is English ');
  assert.equal(results[2].sourceLanguage, 'de');
  assert.equal(engine.getStatus().translated, 1);
  engine.dispose();
});

test('deduplicates pending work and caches successful translations in memory', async () => {
  const { engine, clock, calls } = setup();
  const first = engine.translateMany(['Hallo', ' Hallo ']);
  const second = engine.translateMany(['Hallo']);
  await clock.tick(10);
  assert.equal((await first).length, 2);
  assert.equal((await second)[0].translatedText, 'English: Hallo');
  assert.deepEqual(calls[0].texts, ['Hallo']);
  const cached = await engine.translateMany(['Hallo']);
  assert.equal(cached[0].sourceLanguage, 'de');
  assert.equal(calls.length, 1);
  assert.equal(engine.getStatus().cacheHits, 1);
  engine.clearCache();
  const third = engine.translateMany(['Hallo']);
  await clock.tick(20);
  await third;
  assert.equal(calls.length, 2);
  engine.dispose();
});

test('LRU cache evicts old entries, refreshes access order, and expires by age', async () => {
  const { engine, clock, calls } = setup({ maxCacheEntries: 2, cacheTtlMs: 100 });
  const first = engine.translateMany(['eins', 'zwei']);
  await clock.tick(10);
  await first;
  await engine.translateMany(['eins']);
  const third = engine.translateMany(['drei']);
  await clock.tick(20);
  await third;
  assert.ok(engine.cache.has('eins'));
  assert.ok(!engine.cache.has('zwei'));
  await clock.tick(100);
  const expired = engine.translateMany(['eins']);
  await clock.tick(10);
  await expired;
  assert.equal(calls.length, 3);
  engine.dispose();
});

test('bounded queue favors newer chat messages and splits batches by character budget', async () => {
  const { engine, clock, calls } = setup({ maxQueueSize: 3, maxBatchChars: 7 });
  const promise = engine.translateMany(['oldest', 'older', 'eins', 'zwei', 'drei']);
  await clock.tick(100);
  const results = await promise;
  assert.deepEqual(results.map((result) => result.status), ['busy', 'busy', 'translated', 'translated', 'translated']);
  assert.deepEqual(calls.map((call) => call.texts), [['eins'], ['zwei'], ['drei']]);
  assert.equal(engine.getStatus().queued, 0);
  engine.dispose();
});

test('global pacing and request concurrency hold even with overlapping batches', async () => {
  const { engine, clock } = setup({ maxBatchSize: 1, maxConcurrency: 2 });
  const starts = [];
  let active = 0;
  let peak = 0;
  engine.fetchFn = (url, options) => {
    const texts = new URLSearchParams(options.body).getAll('q');
    starts.push(clock.time);
    active += 1;
    peak = Math.max(peak, active);
    return new Promise((resolve) => clock.setTimer(() => {
      active -= 1;
      resolve(response(texts.map((text) => [`English: ${text}`, 'de'])));
    }, 50));
  };
  const promise = engine.translateMany(['eins', 'zwei', 'drei', 'vier', 'fünf']);
  await clock.tick(200);
  assert.equal((await promise).length, 5);
  assert.equal(peak, 2);
  assert.deepEqual(starts, [10, 30, 60, 80, 110]);
  assert.equal(engine.getStatus().averageLatencyMs, 50);
  assert.equal(engine.getStatus().inFlight, 0);
  engine.dispose();
});

test('HTTP 429 enters cooldown, drains pending work and never includes failed latency in averages', async () => {
  const { engine, clock } = setup({ maxBatchSize: 1, maxConcurrency: 1 });
  engine.fetchFn = async () => response(null, 429, { 'retry-after': '45' });
  const promise = engine.translateMany(['eins', 'zwei']);
  await clock.tick(10);
  assert.deepEqual((await promise).map((result) => result.status), ['error', 'busy']);
  const stats = engine.getStatus();
  assert.equal(stats.cooldownUntil, 45010);
  assert.equal(stats.averageLatencyMs, 0);
  assert.equal(stats.errors, 1);
  assert.equal(stats.queued, 0);
  assert.equal((await engine.translateMany(['drei']))[0].status, 'busy');
  assert.equal(engine.getStatus().requests, 1);
  await clock.tick(45000);
  engine.fetchFn = async () => response([['three', 'de']]);
  const retry = engine.translateMany(['drei']);
  await clock.tick(10);
  assert.equal((await retry)[0].status, 'translated');
  assert.equal(engine.getStatus().cooldownUntil, 0);
  assert.equal(engine.getStatus().lastError, null);
  engine.dispose();
});

test('repeated 5xx failures back off and malformed provider output is not cached', async () => {
  const { engine, clock } = setup();
  engine.fetchFn = async () => response([], 503);
  const first = engine.translateMany(['eins']);
  await clock.tick(10);
  assert.equal((await first)[0].status, 'error');
  assert.equal(engine.getStatus().cooldownUntil, 4010);
  await clock.tick(4000);
  const second = engine.translateMany(['zwei']);
  await clock.tick(10);
  await second;
  assert.equal(engine.getStatus().cooldownUntil, 12020);
  await clock.tick(8000);
  engine.fetchFn = async () => response([['missing language']]);
  const malformed = engine.translateMany(['drei']);
  await clock.tick(10);
  assert.equal((await malformed)[0].status, 'error');
  assert.equal(engine.cache.size, 0);
  engine.dispose();
});

test('request timeout resolves callers, releases capacity and starts cooldown', async () => {
  const { engine, clock } = setup({ requestTimeoutMs: 50 });
  let signal;
  engine.fetchFn = (url, options) => { signal = options.signal; return new Promise(() => {}); };
  const promise = engine.translateMany(['eins']);
  await clock.tick(60);
  const [result] = await promise;
  assert.equal(result.status, 'error');
  assert.match(result.error, /timed out/);
  assert.equal(signal.aborted, true);
  assert.equal(engine.getStatus().inFlight, 0);
  assert.equal(engine.getStatus().queued, 0);
  engine.dispose();
});

test('disabling immediately resolves queued work and aborts in-flight network requests', async () => {
  const { engine, clock, calls } = setup();
  const queued = engine.translateMany(['eins']);
  engine.setSettings({ enabled: false });
  assert.equal((await queued)[0].status, 'skipped');
  await clock.tick(50);
  assert.equal(calls.length, 0);
  engine.setSettings({ enabled: true, speed: 'gentle' });
  assert.equal(engine.speed, 'gentle');
  engine.fetchFn = (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  const inFlight = engine.translateMany(['zwei']);
  await clock.tick(10);
  engine.setSettings({ enabled: false });
  await clock.flush();
  assert.equal((await inFlight)[0].status, 'skipped');
  assert.equal(engine.getStatus().errors, 0);
  assert.equal(engine.getStatus().cooldownUntil, 0);
  engine.dispose();
});

test('a quick disable/re-enable does not turn a cancelled request into a provider failure', async () => {
  const { engine, clock } = setup();
  engine.fetchFn = (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
  const promise = engine.translateMany(['eins']);
  await clock.tick(10);
  engine.setSettings({ enabled: false });
  engine.setSettings({ enabled: true });
  await clock.flush();
  assert.equal((await promise)[0].status, 'skipped');
  assert.equal(engine.getStatus().errors, 0);
  assert.equal(engine.getStatus().cooldownUntil, 0);
  engine.dispose();
});

test('background validates senders, honors paused channels, registers early, and detects English locally', async () => {
  const previousChrome = globalThis.chrome;
  const previousFetch = globalThis.fetch;
  const listeners = {};
  const networkTexts = [];
  let resolveSettings;
  globalThis.chrome = {
    runtime: {
      id: 'test-id', lastError: undefined,
      getURL: (path) => `chrome-extension://test-id/${path}`,
      onMessage: { addListener: (listener) => { listeners.message = listener; } },
    },
    storage: {
      local: { get: () => new Promise((resolve) => { resolveSettings = resolve; }) },
      onChanged: { addListener: (listener) => { listeners.storage = listener; } },
    },
    i18n: { detectLanguage: (text, callback) => callback({
      isReliable: true, languages: [{ language: 'en', percentage: 99 }],
    }) },
  };
  globalThis.fetch = async (url, options) => {
    networkTexts.push(new URLSearchParams(options.body).getAll('q'));
    return response([['Hello, how are you?', 'es']]);
  };
  try {
    await import('../extension/background.js?background-test');
    assert.equal(typeof listeners.message, 'function');
    assert.equal(typeof listeners.storage, 'function');
    const send = (message, url, id = 'test-id') => new Promise((resolve) => {
      assert.equal(listeners.message(message, { id, url }, resolve), true);
    });
    const popup = 'chrome-extension://test-id/popup.html';
    const twitch = 'https://www.twitch.tv/channel';
    const pendingStatus = send({ type: 'GET_STATUS' }, popup);
    resolveSettings({ settings: { enabled: false } });
    assert.equal((await pendingStatus).stats.enabled, false);
    assert.equal((await send({ type: 'TRANSLATE', texts: ['Hallo'] }, twitch)).results[0].status, 'skipped');
    for (const url of ['https://www.twitch.tv.evil.invalid/a', 'http://twitch.tv/a', 'https://evil.invalid/twitch.tv']) {
      assert.equal((await send({ type: 'TRANSLATE', texts: ['Hallo'] }, url)).ok, false);
    }
    assert.equal((await send({ type: 'TRANSLATE', texts: ['Hallo'] }, twitch, 'another-id')).ok, false);
    assert.equal((await send({ type: 'TEST_TRANSLATION' }, twitch)).ok, false);
    assert.equal((await send({ type: 'CLEAR_CACHE' }, twitch)).ok, false);
    listeners.storage({ settings: { newValue: { enabled: true, speed: 'fast', disabledChannels: ['Paused_Channel'] } } }, 'local');
    for (const pausedUrl of ['https://www.twitch.tv/paused_channel', 'https://www.twitch.tv/popout/paused_channel/chat']) {
      const paused = await send({ type: 'TRANSLATE', texts: ['Hallo zusammen!'] }, pausedUrl);
      assert.equal(paused.ok, true);
      assert.equal(paused.results[0].status, 'skipped');
      assert.equal(paused.results[0].translatedText, 'Hallo zusammen!');
      assert.match(paused.results[0].error, /paused for this channel/);
    }
    assert.equal(networkTexts.length, 0);
    const english = await send({ type: 'TRANSLATE', texts: ['This is a sufficiently long English chat message.'] }, twitch);
    assert.equal(english.results[0].status, 'excluded');
    assert.equal(english.results[0].sourceLanguage, 'en');
    assert.equal(networkTexts.length, 0);
    const translated = await send({ type: 'TEST_TRANSLATION', texts: ['Injected custom text'] }, popup);
    assert.equal(translated.results[0].status, 'translated');
    assert.deepEqual(networkTexts, [['Hola, ¿cómo estás?']]);
    assert.equal((await send({ type: 'CLEAR_CACHE' }, popup)).stats.cacheEntries, 0);
    assert.equal((await send({ type: 'TRANSLATE', texts: [{}] }, twitch)).ok, false);
  } finally {
    globalThis.chrome = previousChrome;
    globalThis.fetch = previousFetch;
  }
});

let backgroundImport = 0;
async function backgroundHarness(initialSettings = {}, options = {}) {
  const previousChrome = globalThis.chrome;
  const previousFetch = globalThis.fetch;
  const listeners = {};
  const networkTexts = [];
  let settings = initialSettings;
  globalThis.chrome = {
    runtime: {
      id: 'language-test', lastError: undefined,
      getURL: path => `chrome-extension://language-test/${path}`,
      onMessage: { addListener: listener => { listeners.message = listener; } },
    },
    storage: {
      local: { get: async () => ({ settings }) },
      onChanged: { addListener: listener => { listeners.storage = listener; } },
    },
    i18n: { detectLanguage: options.detectLanguage ?? ((text, callback) => callback({ isReliable: false, languages: [] })) },
  };
  globalThis.fetch = async (url, requestOptions) => {
    const texts = new URLSearchParams(requestOptions.body).getAll('q');
    networkTexts.push(texts);
    return options.fetchFn ? options.fetchFn(texts, requestOptions)
      : response(texts.map(text => [`English: ${text}`, 'de']));
  };
  await import(`../extension/background.js?language-test-${++backgroundImport}`);
  return {
    networkTexts,
    send: (message, url = 'https://www.twitch.tv/channel') => new Promise(resolve => {
      listeners.message(message, { id: 'language-test', url }, resolve);
    }),
    setSettings: patch => {
      settings = { ...settings, ...patch };
      listeners.storage({ settings: { newValue: settings } }, 'local');
    },
    cleanup: () => {
      listeners.storage({ settings: { newValue: { enabled: false } } }, 'local');
      globalThis.chrome = previousChrome;
      globalThis.fetch = previousFetch;
    },
  };
}

async function until(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('The mocked background operation did not start.');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

test('default German and English exclusions skip reliable local matches without a network request', async () => {
  const german = 'Dies ist eine ausreichend lange deutsche Nachricht.';
  const english = 'This is a sufficiently long English chat message.';
  const spanish = 'Este es un mensaje de chat en español bastante largo.';
  const harness = await backgroundHarness({}, {
    detectLanguage: (text, callback) => callback({ isReliable: true, languages: [{
      language: text === german ? 'de-DE' : text === english ? 'en-GB' : 'es', percentage: 99,
    }] }),
    fetchFn: texts => response(texts.map(() => ['This is a Spanish chat message.', 'es'])),
  });
  try {
    const result = await harness.send({ type: 'TRANSLATE', texts: [german, english, spanish] });
    assert.deepEqual(result.results.map(item => item.status), ['excluded', 'excluded', 'translated']);
    assert.equal(result.results[0].translatedText, german);
    assert.equal(result.results[0].sourceLanguage, 'de-de');
    assert.equal(result.results[1].sourceLanguage, 'en-gb');
    assert.deepEqual(harness.networkTexts, [[spanish]]);
  } finally { harness.cleanup(); }
});

test('short and uncertain excluded-language messages are filtered after provider detection', async () => {
  const messages = ['Guten Abend!', 'Dies ist eine längere Nachricht mit unsicherer Erkennung.'];
  const harness = await backgroundHarness({}, {
    detectLanguage: (text, callback) => callback({ isReliable: true, languages: [{ language: 'de', percentage: 88 }] }),
    fetchFn: texts => response(texts.map(() => ['Good evening!', 'de'])),
  });
  try {
    const result = await harness.send({ type: 'TRANSLATE', texts: messages });
    assert.deepEqual(result.results.map(item => item.status), ['excluded', 'excluded']);
    assert.deepEqual(result.results.map(item => item.translatedText), messages);
    assert.ok(result.results.every(item => item.sourceLanguage === 'de' && item.error === undefined));
    assert.deepEqual(harness.networkTexts, [messages]);
    assert.equal(result.stats.cacheEntries, 2);
  } finally { harness.cleanup(); }
});

test('adding and removing Spanish exclusions reuses raw cache and connection test bypasses exclusions', async () => {
  const harness = await backgroundHarness({ excludedLanguages: [] }, {
    fetchFn: texts => response(texts.map(() => ['Hello, how are you?', 'es'])),
  });
  try {
    const message = { type: 'TRANSLATE', texts: ['Hola, amigo'] };
    const first = await harness.send(message);
    assert.equal(first.results[0].status, 'translated');
    harness.setSettings({ excludedLanguages: ['es'] });
    const excluded = await harness.send(message);
    assert.deepEqual(excluded.results[0], {
      text: 'Hola, amigo', translatedText: 'Hola, amigo', sourceLanguage: 'es', status: 'excluded',
    });
    harness.setSettings({ excludedLanguages: [] });
    const restored = await harness.send(message);
    assert.equal(restored.results[0].status, 'translated');
    assert.equal(restored.results[0].translatedText, 'Hello, how are you?');
    assert.equal(restored.stats.cacheHits, 2);
    assert.equal(harness.networkTexts.length, 1);
    harness.setSettings({ excludedLanguages: ['es'] });
    const testResult = await harness.send({ type: 'TEST_TRANSLATION' }, 'chrome-extension://language-test/popup.html');
    assert.equal(testResult.results[0].status, 'translated');
    assert.deepEqual(harness.networkTexts[1], ['Hola, ¿cómo estás?']);
    harness.setSettings({ enabled: false });
    assert.equal((await harness.send({ type: 'TEST_TRANSLATION' }, 'chrome-extension://language-test/popup.html')).results[0].status, 'skipped');
    assert.equal(harness.networkTexts.length, 2);
  } finally { harness.cleanup(); }
});

test('language settings changed during local detection are applied before deciding to send text', async () => {
  const callbacks = [];
  const harness = await backgroundHarness({}, {
    detectLanguage: (text, callback) => { callbacks.push(callback); },
  });
  try {
    const allowed = harness.send({ type: 'TRANSLATE', texts: ['Diese Nachricht ist auf Deutsch und ausreichend lang.'] });
    await until(() => callbacks.length === 1);
    harness.setSettings({ excludedLanguages: [] });
    callbacks[0]({ isReliable: true, languages: [{ language: 'de', percentage: 99 }] });
    assert.equal((await allowed).results[0].status, 'translated');
    const excluded = harness.send({ type: 'TRANSLATE', texts: ['Auch diese andere Nachricht ist eindeutig auf Deutsch.'] });
    await until(() => callbacks.length === 2);
    harness.setSettings({ excludedLanguages: ['de'] });
    callbacks[1]({ isReliable: true, languages: [{ language: 'de', percentage: 99 }] });
    assert.equal((await excluded).results[0].status, 'excluded');
    assert.equal(harness.networkTexts.length, 1);
  } finally { harness.cleanup(); }
});

test('provider results use latest exclusions for both adding and removing a language in flight', async () => {
  const pending = [];
  const harness = await backgroundHarness({ excludedLanguages: [] }, {
    fetchFn: () => new Promise(resolve => { pending.push(resolve); }),
  });
  try {
    const german = harness.send({ type: 'TRANSLATE', texts: ['Guten Abend!'] });
    await until(() => pending.length === 1);
    harness.setSettings({ excludedLanguages: ['de'] });
    pending[0](response([['Good evening!', 'de']]));
    assert.equal((await german).results[0].status, 'excluded');
    harness.setSettings({ excludedLanguages: ['es'] });
    const spanish = harness.send({ type: 'TRANSLATE', texts: ['Buenos días'] });
    await until(() => pending.length === 2);
    harness.setSettings({ excludedLanguages: [] });
    pending[1](response([['Good morning', 'es']]));
    assert.equal((await spanish).results[0].status, 'translated');
    const cachedGerman = await harness.send({ type: 'TRANSLATE', texts: ['Guten Abend!'] });
    assert.equal(cachedGerman.results[0].status, 'translated');
    assert.equal(cachedGerman.results[0].translatedText, 'Good evening!');
    assert.equal(harness.networkTexts.length, 2);
  } finally { harness.cleanup(); }
});

test('a local exclusion removed while another message translates is filled before the batch returns', async () => {
  const german = 'Diese Nachricht wird zunächst lokal als Deutsch erkannt.';
  const pending = [];
  const harness = await backgroundHarness({}, {
    detectLanguage: (text, callback) => callback({ isReliable: true, languages: [{ language: 'de', percentage: 99 }] }),
    fetchFn: () => new Promise(resolve => { pending.push(resolve); }),
  });
  try {
    const batch = harness.send({ type: 'TRANSLATE', texts: [german, 'Buenos días'] });
    await until(() => pending.length === 1);
    assert.deepEqual(harness.networkTexts[0], ['Buenos días']);
    harness.setSettings({ excludedLanguages: [] });
    pending[0](response([['Good morning', 'es']]));
    await until(() => pending.length === 2);
    assert.deepEqual(harness.networkTexts[1], [german]);
    pending[1](response([['This message was initially detected as German.', 'de']]));
    const result = await batch;
    assert.deepEqual(result.results.map(item => item.status), ['translated', 'translated']);
    assert.deepEqual(result.results.map(item => item.sourceLanguage), ['de', 'es']);
  } finally { harness.cleanup(); }
});
