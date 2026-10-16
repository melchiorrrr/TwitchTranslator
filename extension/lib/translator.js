// All chat text and translation caches in this module live only in memory.
export const PROVIDER_NAME = 'Google Translate (unofficial)';
export const GOOGLE_TRANSLATE_URL =
  'https://translate.googleapis.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=en';
export const INPUT_LIMITS = Object.freeze({ texts: 50, textLength: 2000, totalLength: 30000 });

export function normalizeTexts(texts) {
  if (!Array.isArray(texts) || texts.length > INPUT_LIMITS.texts) {
    throw new TypeError(`Provide an array of at most ${INPUT_LIMITS.texts} messages.`);
  }
  let totalLength = 0;
  for (const text of texts) {
    if (typeof text !== 'string' || text.length > INPUT_LIMITS.textLength) {
      throw new TypeError(`Each message must be text of at most ${INPUT_LIMITS.textLength} characters.`);
    }
    totalLength += text.length;
  }
  if (totalLength > INPUT_LIMITS.totalLength) {
    throw new TypeError(`A translation batch may contain at most ${INPUT_LIMITS.totalLength} characters.`);
  }
  return texts.slice();
}

export function buildGoogleUrl() {
  return GOOGLE_TRANSLATE_URL;
}

export function buildGoogleRequest(texts, signal) {
  const body = new URLSearchParams();
  for (const text of texts) body.append('q', text);
  return {
    url: buildGoogleUrl(),
    options: {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: body.toString(),
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal,
    },
  };
}

// The /t endpoint returns one [translation, detected-language] pair per q.
// Reject shape changes rather than silently assigning a translation to the wrong chat line.
export function parseGoogleResponse(value, expectedCount) {
  let rows = value;
  if (expectedCount === 1 && Array.isArray(rows) && typeof rows[0] === 'string') rows = [rows];
  if (!Array.isArray(rows) || rows.length !== expectedCount) {
    throw new Error('The translation service returned an unexpected response.');
  }
  return rows.map((row) => {
    if (
      !Array.isArray(row) || typeof row[0] !== 'string' || row[0].length > 20000 ||
      typeof row[1] !== 'string' || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(row[1])
    ) {
      throw new Error('The translation service returned an unexpected response.');
    }
    return { translatedText: row[0], sourceLanguage: row[1].toLowerCase() };
  });
}

function resultFor(text, status, error) {
  return { text, translatedText: text, sourceLanguage: null, status, ...(error ? { error } : {}) };
}

class ProviderError extends Error {
  constructor(message, { status = 0, retryAfterMs = 0 } = {}) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function retryAfterMs(response, now) {
  const header = response.headers?.get?.('retry-after');
  if (!header) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

export class TranslationEngine {
  constructor(options = {}) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.now = options.now ?? Date.now;
    this.setTimer = options.setTimer ?? globalThis.setTimeout.bind(globalThis);
    this.clearTimer = options.clearTimer ?? globalThis.clearTimeout.bind(globalThis);
    this.batchWindowMs = options.batchWindowMs ?? 120;
    this.intervalOverride = options.minIntervalMs;
    this.maxConcurrency = options.maxConcurrency ?? 2;
    this.maxQueueSize = options.maxQueueSize ?? 120;
    this.maxBatchSize = options.maxBatchSize ?? 8;
    this.maxBatchChars = options.maxBatchChars ?? 2500;
    this.maxQueueAgeMs = options.maxQueueAgeMs ?? 15000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 8000;
    this.maxCacheEntries = options.maxCacheEntries ?? 1200;
    this.cacheTtlMs = options.cacheTtlMs ?? 30 * 60 * 1000;
    this.enabled = options.enabled !== false;
    this.speed = options.speed === 'gentle' ? 'gentle' : 'fast';
    this.queue = [];
    this.pending = new Map();
    this.cache = new Map();
    this.activeControllers = new Set();
    this.timer = null;
    this.inFlight = 0;
    this.lastStartedAt = -Infinity;
    this.cooldownUntil = 0;
    this.failureStreak = 0;
    this.lastError = null;
    this.counters = { translated: 0, cacheHits: 0, requests: 0, errors: 0 };
    this.successfulRequests = 0;
    this.successfulLatencyMs = 0;
    this.cancelGeneration = 0;
    this.disposed = false;
  }

  get minIntervalMs() {
    return this.intervalOverride ?? (this.speed === 'gentle' ? 750 : 250);
  }

  setSettings(settings = {}) {
    this.speed = settings.speed === 'gentle' ? 'gentle' : 'fast';
    this.enabled = settings.enabled !== false;
    if (!this.enabled) {
      this.cancelGeneration += 1;
      this._cancelTimer();
      this._drainQueue('skipped', 'Translation is disabled.');
      for (const controller of this.activeControllers) controller.abort();
    } else {
      this._schedule();
    }
  }

  getStatus() {
    return {
      ...this.counters,
      queued: this.queue.length,
      inFlight: this.inFlight,
      averageLatencyMs: this.successfulRequests
        ? Math.round(this.successfulLatencyMs / this.successfulRequests) : 0,
      cooldownUntil: this.cooldownUntil > this.now() ? this.cooldownUntil : 0,
      lastError: this.lastError,
      provider: PROVIDER_NAME,
      enabled: this.enabled,
      speed: this.speed,
      cacheEntries: this.cache.size,
    };
  }

  clearCache() {
    this.cache.clear();
  }

  translate(texts) {
    return this.translateMany(texts);
  }

  translateMany(texts) {
    const input = normalizeTexts(texts);
    return Promise.all(input.map((text) => this._translateOne(text)));
  }

  _translateOne(originalText) {
    if (this.disposed || !this.enabled) {
      return Promise.resolve(resultFor(originalText, 'skipped', 'Translation is disabled.'));
    }
    const text = originalText.trim();
    if (!text || !/\p{L}/u.test(text)) return Promise.resolve(resultFor(originalText, 'skipped'));
    const cached = this.cache.get(text);
    if (cached && this.now() - cached.cachedAt < this.cacheTtlMs) {
      // Reinsert to update the LRU order without extending the entry's lifetime.
      this.cache.delete(text);
      this.cache.set(text, cached);
      this.counters.cacheHits += 1;
      return Promise.resolve({ ...cached.result, text: originalText,
        ...(cached.result.status === 'english' ? { translatedText: originalText } : {}) });
    }
    if (cached) this.cache.delete(text);
    const existing = this.pending.get(text);
    if (existing) return existing.promise.then((result) => this._forOriginal(result, originalText));
    if (this.now() < this.cooldownUntil) {
      return Promise.resolve(resultFor(originalText, 'busy', 'The translation service is cooling down.'));
    }
    while (this.queue.length >= this.maxQueueSize) {
      const oldest = this.queue.shift();
      this._settle(oldest, resultFor(oldest.text, 'busy', 'Chat is moving too quickly; this older message was skipped.'));
    }
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    const job = { text, promise, resolve, enqueuedAt: this.now(), settled: false };
    this.pending.set(text, job);
    this.queue.push(job);
    this._schedule();
    return promise.then((result) => this._forOriginal(result, originalText));
  }

  _forOriginal(result, text) {
    return { ...result, text, ...(result.status !== 'translated' ? { translatedText: text } : {}) };
  }

  _settle(job, result) {
    if (job.settled) return;
    job.settled = true;
    if (this.pending.get(job.text) === job) this.pending.delete(job.text);
    job.resolve(result);
  }

  _drainQueue(status, error) {
    for (const job of this.queue.splice(0)) this._settle(job, resultFor(job.text, status, error));
  }

  _cancelTimer() {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }

  _schedule() {
    this._cancelTimer();
    if (this.disposed || !this.enabled || !this.queue.length || this.inFlight >= this.maxConcurrency) return;
    if (this.now() < this.cooldownUntil) {
      this._drainQueue('busy', 'The translation service is cooling down.');
      return;
    }
    const nextAt = Math.max(
      this.lastStartedAt + this.minIntervalMs,
      this.queue[0].enqueuedAt + this.batchWindowMs,
    );
    this.timer = this.setTimer(() => {
      this.timer = null;
      this._pump();
    }, Math.max(0, nextAt - this.now()));
  }

  _pump() {
    if (this.disposed || !this.enabled || this.inFlight >= this.maxConcurrency) return;
    const now = this.now();
    while (this.queue.length && now - this.queue[0].enqueuedAt > this.maxQueueAgeMs) {
      const expired = this.queue.shift();
      this._settle(expired, resultFor(expired.text, 'busy', 'This message waited too long and was skipped.'));
    }
    if (!this.queue.length) return;
    if (now < this.cooldownUntil || now < this.lastStartedAt + this.minIntervalMs) {
      this._schedule();
      return;
    }
    const batch = [];
    let characters = 0;
    while (this.queue.length && batch.length < this.maxBatchSize) {
      const next = this.queue[0];
      if (batch.length && characters + next.text.length > this.maxBatchChars) break;
      batch.push(this.queue.shift());
      characters += next.text.length;
    }
    this.inFlight += 1;
    this.counters.requests += 1;
    this.lastStartedAt = now;
    void this._runBatch(batch);
    this._schedule();
  }

  async _runBatch(batch) {
    const controller = new AbortController();
    this.activeControllers.add(controller);
    const startedAt = this.now();
    const generation = this.cancelGeneration;
    let timeout;
    try {
      const timedOut = new Promise((_, reject) => {
        timeout = this.setTimer(() => {
          controller.abort();
          reject(new ProviderError('The translation request timed out.'));
        }, this.requestTimeoutMs);
      });
      const request = buildGoogleRequest(batch.map((job) => job.text), controller.signal);
      const operation = (async () => {
        const response = await this.fetchFn(request.url, request.options);
        if (!response.ok) {
          throw new ProviderError(`The translation service returned HTTP ${response.status}.`, {
            status: response.status,
            retryAfterMs: retryAfterMs(response, this.now()),
          });
        }
        const body = await response.text();
        if (body.length > 256 * 1024) throw new ProviderError('The translation service returned an oversized response.');
        let value;
        try { value = JSON.parse(body); }
        catch { throw new ProviderError('The translation service returned an unexpected response.'); }
        return parseGoogleResponse(value, batch.length);
      })();
      const rows = await Promise.race([operation, timedOut]);
      if (!this.enabled || this.disposed || generation !== this.cancelGeneration) {
        for (const job of batch) this._settle(job, resultFor(job.text, 'skipped', 'Translation is disabled.'));
        return;
      }
      this.successfulRequests += 1;
      this.successfulLatencyMs += Math.max(0, this.now() - startedAt);
      if (this.now() >= this.cooldownUntil) {
        this.failureStreak = 0;
        this.lastError = null;
      }
      for (let index = 0; index < batch.length; index += 1) {
        const job = batch[index];
        const row = rows[index];
        const english = /^en(?:-|$)/.test(row.sourceLanguage);
        const status = english ? 'english'
          : !row.translatedText.trim() || row.translatedText.trim() === job.text ? 'unchanged' : 'translated';
        const result = {
          text: job.text,
          translatedText: status === 'translated' ? row.translatedText : job.text,
          sourceLanguage: row.sourceLanguage,
          status,
        };
        if (status === 'translated') this.counters.translated += 1;
        this.cache.set(job.text, { result, cachedAt: this.now() });
        while (this.cache.size > this.maxCacheEntries) this.cache.delete(this.cache.keys().next().value);
        this._settle(job, result);
      }
    } catch (error) {
      if (!this.enabled || this.disposed || generation !== this.cancelGeneration) {
        for (const job of batch) this._settle(job, resultFor(job.text, 'skipped', 'Translation is disabled.'));
      } else {
        this.counters.errors += batch.length;
        this.failureStreak += 1;
        const limited = error.status === 429 || error.status === 403;
        const base = limited ? 30000 : error.status >= 400 && error.status < 500 ? 60000 : 4000;
        const backoff = Math.min(120000, base * 2 ** Math.min(5, this.failureStreak - 1));
        const wait = Math.max(backoff, Math.min(10 * 60 * 1000, error.retryAfterMs || 0));
        this.cooldownUntil = Math.max(this.cooldownUntil, this.now() + wait);
        // Do not surface remote response text, which can contain chat messages.
        this.lastError = error instanceof ProviderError ? error.message
          : error.message === 'The translation service returned an unexpected response.' ? error.message
          : 'The translation service could not be reached.';
        for (const job of batch) this._settle(job, resultFor(job.text, 'error', this.lastError));
        this._drainQueue('busy', 'The translation service is cooling down.');
      }
    } finally {
      if (timeout !== undefined) this.clearTimer(timeout);
      this.activeControllers.delete(controller);
      this.inFlight -= 1;
      this._schedule();
    }
  }

  dispose() {
    this.disposed = true;
    this.enabled = false;
    this._cancelTimer();
    this._drainQueue('skipped', 'Translation is disabled.');
    for (const controller of this.activeControllers) controller.abort();
    this.cache.clear();
  }
}
