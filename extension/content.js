(() => {
  'use strict';
  if (globalThis.__twitchEnglishLoaded) return;
  globalThis.__twitchEnglishLoaded = true;
  const { normalizeSettings, getChannel, shouldTranslate, isLanguageExcluded } = globalThis.TwitchEnglishCore;
  const ROW_SELECTOR = '[data-a-target="chat-line-message"], [data-test-selector="chat-line-message"], .chat-line__message';
  const BODY_SELECTOR = '[data-a-target="chat-line-message-body"], .chat-line__message--message';
  const PART_SELECTOR = '.text-fragment, .link-fragment, .mention-fragment, [data-a-target="chat-message-text"], [data-test-selector="chat-message-text"]';
  const states = new WeakMap();
  const dirty = new Set();
  let settings = normalizeSettings();
  let channel = getChannel(location.href);
  let previousPath = location.pathname;
  let generation = 0;
  let active = 0;
  let timer = null;
  let alive = true;

  function enabled() {
    return alive && settings.enabled && !settings.disabledChannels.includes(channel);
  }

  function readMessage(row) {
    const wrapper = row.querySelector(BODY_SELECTOR);
    const elements = wrapper ? [wrapper] : [...row.querySelectorAll(PART_SELECTOR)].filter(element => !element.parentElement?.closest(PART_SELECTOR));
    // Read actual text nodes; emote alt text, badges, usernames and controls stay out.
    const texts = [];
    for (const element of elements) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          return node.parentElement?.closest('.tce-translation, button, script, style, [data-a-target="chat-message-username"], .chat-author__display-name')
            ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        },
      });
      while (walker.nextNode()) texts.push(walker.currentNode.nodeValue);
    }
    return { text: texts.join('').replace(/\s+/gu, ' ').trim(), elements };
  }

  function restore(row) {
    row.querySelectorAll('.tce-translation').forEach(element => element.remove());
    row.querySelectorAll('.tce-original-hidden').forEach(element => element.classList.remove('tce-original-hidden'));
    row.classList.remove('tce-replace');
  }

  function restoreAll() {
    document.querySelectorAll('.tce-translation').forEach(element => element.remove());
    document.querySelectorAll('.tce-original-hidden').forEach(element => element.classList.remove('tce-original-hidden'));
    document.querySelectorAll('.tce-replace').forEach(element => element.classList.remove('tce-replace'));
  }

  function render(row, state) {
    restore(row);
    if (!enabled() || state.generation !== generation || state.result?.status !== 'translated' || !state.result.translatedText
      || isLanguageExcluded(state.result.sourceLanguage, settings.excludedLanguages) || readMessage(row).text !== state.text) return;
    const output = document.createElement('span');
    output.className = 'tce-translation';
    output.lang = 'en';
    output.dir = 'auto';
    if (settings.showLanguage) {
      const label = document.createElement('span');
      label.className = 'tce-language';
      const source = state.result.sourceLanguage || 'auto';
      label.textContent = `${source.toUpperCase()} → EN`;
      try { label.title = `${new Intl.DisplayNames(['en'], { type: 'language' }).of(source)} to English`; }
      catch { label.title = 'Translated to English'; }
      output.append(label);
    }
    const translated = document.createElement('span');
    translated.className = 'tce-text';
    translated.textContent = state.result.translatedText;
    output.append(translated);
    if (settings.displayMode === 'replace') {
      row.classList.add('tce-replace');
      // Hide only plain text fragments. Original emotes, mentions and links remain interactive.
      const candidates = [...row.querySelectorAll('.text-fragment')];
      const hidden = candidates.length ? candidates.filter(element => !element.querySelector('img, a, button')) : state.elements.filter(element => !element.querySelector('img, a, button'));
      hidden.forEach(element => element.classList.add('tce-original-hidden'));
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'tce-original-button';
      toggle.textContent = 'original';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.title = 'Show the original message';
      toggle.addEventListener('click', event => {
        event.stopPropagation();
        const expand = toggle.getAttribute('aria-expanded') !== 'true';
        hidden.forEach(element => element.classList.toggle('tce-original-hidden', !expand));
        toggle.setAttribute('aria-expanded', String(expand));
        toggle.textContent = expand ? 'hide original' : 'original';
      });
      output.append(toggle);
    }
    row.append(output);
  }

  function queue(row) {
    if (!enabled() || !(row instanceof Element) || !row.isConnected) return;
    dirty.delete(row);
    dirty.add(row);
    while (dirty.size > 160) dirty.delete(dirty.values().next().value);
    schedule();
  }

  function collect(node) {
    if (!(node instanceof Element)) return;
    if (node.closest('.tce-translation')) return;
    const row = node.closest(ROW_SELECTOR);
    if (row) queue(row);
    node.querySelectorAll(ROW_SELECTOR).forEach(queue);
  }

  function schedule() {
    if (!timer && active < 2 && enabled() && dirty.size && !document.hidden) timer = setTimeout(flush, 100);
  }

  async function flush() {
    timer = null;
    if (!enabled() || document.hidden || active >= 2) return;
    const jobs = [];
    while (dirty.size && jobs.length < 24) {
      const row = dirty.values().next().value;
      dirty.delete(row);
      if (!row.isConnected) continue;
      const { text, elements } = readMessage(row);
      const previous = states.get(row);
      if (previous?.text === text && previous.generation === generation) continue;
      restore(row);
      const state = { text, elements, generation, result: null };
      states.set(row, state);
      if (shouldTranslate(text)) jobs.push({ row, state });
    }
    if (!jobs.length) { schedule(); return; }
    active++;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'TRANSLATE', texts: jobs.map(job => job.state.text) });
      if (!response?.ok || !Array.isArray(response.results)) return;
      jobs.forEach(({ row, state }, index) => {
        if (!enabled() || !row.isConnected || state.generation !== generation || states.get(row) !== state || readMessage(row).text !== state.text) return;
        state.result = response.results[index];
        // Preferences can change while language detection or translation is pending.
        // An excluded response has no translation to display; request it again if now allowed.
        if (state.result?.status === 'excluded' && !isLanguageExcluded(state.result.sourceLanguage, settings.excludedLanguages)) {
          states.delete(row);
          queue(row);
          return;
        }
        render(row, state);
      });
    } catch (error) {
      // Reloading an unpacked extension invalidates existing isolated worlds.
      if (/context invalidated|extension.*invalid/i.test(String(error))) stop();
    } finally {
      active--;
      schedule();
    }
  }

  function scan(history = settings.translateHistory) {
    if (!enabled()) return;
    const rows = [...document.querySelectorAll(ROW_SELECTOR)];
    // Older backlog is deliberately left alone so new chat stays responsive.
    const recent = new Set(history ? rows.slice(-40) : []);
    for (const row of rows) {
      const state = states.get(row);
      if (recent.has(row)) {
        if (state?.generation === generation && state.result) render(row, state);
        else queue(row);
      } else if (!state || state.generation !== generation) {
        states.set(row, { ...readMessage(row), generation, result: null });
      }
    }
  }

  function settingsChanged(changes, area) {
    if (area !== 'local' || !changes.settings) return;
    const before = settings;
    settings = normalizeSettings(changes.settings.newValue);
    const wasEnabled = before.enabled && !before.disabledChannels.includes(channel);
    const exclusionsChanged = before.excludedLanguages.join(',') !== settings.excludedLanguages.join(',');
    if (wasEnabled !== enabled() || before.translateHistory !== settings.translateHistory) {
      generation++;
      dirty.clear();
      restoreAll();
      scan();
    } else {
      document.querySelectorAll(ROW_SELECTOR).forEach(row => {
        const state = states.get(row);
        if (!state?.result) return;
        if (exclusionsChanged && state.generation === generation && state.result.status === 'excluded'
          && !isLanguageExcluded(state.result.sourceLanguage, settings.excludedLanguages)) {
          states.delete(row);
          queue(row);
        } else render(row, state);
      });
    }
  }

  const observer = new MutationObserver(records => {
    if (!enabled()) return;
    for (const record of records) {
      if (record.target.parentElement?.closest('.tce-translation')) continue;
      if (record.type === 'characterData') collect(record.target.parentElement);
      else {
        const owner = record.target instanceof Element ? record.target.closest(ROW_SELECTOR) : null;
        if (owner) queue(owner);
        record.addedNodes.forEach(collect);
      }
    }
  });

  let navigationTimer;
  function stop() {
    alive = false;
    observer.disconnect();
    clearTimeout(timer);
    clearInterval(navigationTimer);
    dirty.clear();
    restoreAll();
    chrome.storage.onChanged.removeListener(settingsChanged);
  }

  async function start() {
    try {
      const stored = await chrome.storage.local.get('settings');
      settings = normalizeSettings(stored.settings);
      chrome.storage.onChanged.addListener(settingsChanged);
      observer.observe(document.body, { childList: true, characterData: true, subtree: true });
      scan();
      navigationTimer = setInterval(() => {
        if (!chrome.runtime.id) { stop(); return; }
        if (location.pathname === previousPath) return;
        previousPath = location.pathname;
        channel = getChannel(location.href);
        generation++;
        dirty.clear();
        restoreAll();
        scan();
      }, 1000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
    } catch { stop(); }
  }
  start();
})();
