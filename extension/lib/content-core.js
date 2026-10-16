/* Shared by the isolated content script and the extension's ES modules. */
(() => {
  const SETTINGS_DEFAULTS = Object.freeze({
    enabled: true,
    displayMode: 'below',
    showLanguage: true,
    translateHistory: true,
    disabledChannels: [],
    excludedLanguages: Object.freeze(['de', 'en']),
    speed: 'fast',
  });

  const LANGUAGE_ALIASES = Object.freeze({ iw: 'he', jw: 'jv', in: 'id', ji: 'yi', tl: 'fil' });
  function normalizeLanguage(value) {
    if (typeof value !== 'string' || value.length > 63) return null;
    const language = value.trim().replace(/_/g, '-').toLowerCase();
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(language)) return null;
    const parts = language.split('-');
    parts[0] = LANGUAGE_ALIASES[parts[0]] || parts[0];
    try {
      return Intl.getCanonicalLocales(parts.join('-'))[0].toLowerCase();
    } catch { return null; }
  }

  function isLanguageExcluded(language, excludedLanguages = SETTINGS_DEFAULTS.excludedLanguages) {
    const normalized = normalizeLanguage(language);
    if (!normalized || !Array.isArray(excludedLanguages)) return false;
    return excludedLanguages.some(value => {
      const excluded = normalizeLanguage(value);
      return excluded && (normalized === excluded || normalized.startsWith(`${excluded}-`));
    });
  }

  function normalizeSettings(value = {}) {
    const raw = value && typeof value === 'object' ? value : {};
    const languages = Array.isArray(raw.excludedLanguages) ? raw.excludedLanguages : SETTINGS_DEFAULTS.excludedLanguages;
    const excludedLanguages = [...new Set(languages.map(normalizeLanguage).filter(Boolean))].slice(0, 300);
    // English is the fixed target language, so it always stays in its original form.
    if (!excludedLanguages.includes('en')) excludedLanguages.push('en');
    return {
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
      displayMode: raw.displayMode === 'replace' ? 'replace' : 'below',
      showLanguage: typeof raw.showLanguage === 'boolean' ? raw.showLanguage : true,
      translateHistory: typeof raw.translateHistory === 'boolean' ? raw.translateHistory : true,
      disabledChannels: Array.isArray(raw.disabledChannels)
        ? [...new Set(raw.disabledChannels.filter(channel => typeof channel === 'string' && /^[a-z0-9_]{1,25}$/i.test(channel)).map(channel => channel.toLowerCase()))].slice(0, 500)
        : [],
      excludedLanguages,
      speed: raw.speed === 'gentle' ? 'gentle' : 'fast',
    };
  }

  const RESERVED = new Set(['directory', 'downloads', 'settings', 'inventory', 'wallet', 'subscriptions', 'search', 'videos', 'turbo', 'jobs', 'p', 'friends', 'following', 'messages', 'login', 'signup', 'activate', 'drops', 'collections', 'products', 'checkout']);
  function getChannel(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || !/(^|\.)twitch\.tv$/i.test(url.hostname)) return null;
      const parts = url.pathname.split('/').filter(Boolean);
      let channel = ['popout', 'embed', 'moderator'].includes(parts[0]) ? parts[1] : parts[0];
      if (!channel || RESERVED.has(channel.toLowerCase()) || !/^[a-z0-9_]{1,25}$/i.test(channel)) return null;
      return channel.toLowerCase();
    } catch { return null; }
  }

  const EMOTES = new Set(['kappa', 'kappapride', 'pog', 'pogchamp', 'poggers', 'lul', 'lulw', 'kekw', 'omegalul', 'pepega', 'pepehands', 'copium', 'hopium', 'monkas', 'monkaw', 'feelsbadman', 'feelsgoodman', 'sadge', 'widepeepohappy', 'residentSleeper'.toLowerCase(), 'notlikethis', 'biblethump', '4head', '5head', 'wutface', 'kreygasm', 'seemsgood', 'gg', 'ggwp', 'ez', 'lol', 'lmao', 'rofl', 'xd', 'o7', 'www']);
  function shouldTranslate(text) {
    if (typeof text !== 'string' || text.length > 2000) return false;
    const words = text.replace(/https?:\/\/\S+|www\.\S+|@[\p{L}\p{N}_]+/gu, ' ').trim();
    if (!/\p{L}/u.test(words) || /^[!/]\S+(?:\s|$)/u.test(words)) return false;
    return words.split(/\s+/u).some(word => !EMOTES.has(word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')));
  }

  globalThis.TwitchEnglishCore = Object.freeze({ SETTINGS_DEFAULTS, normalizeSettings, normalizeLanguage, isLanguageExcluded, getChannel, shouldTranslate });
})();
