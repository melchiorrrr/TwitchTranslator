import { SETTINGS_DEFAULTS, normalizeSettings, normalizeLanguage, isLanguageExcluded, getChannel } from './lib/shared.js';

// Local names keep the language picker quick and usable without another request.
const LANGUAGE_CATALOG = [
  ['af', 'Afrikaans'], ['sq', 'Albanian', 'Shqip'], ['am', 'Amharic', 'አማርኛ'],
  ['ar', 'Arabic', 'العربية'], ['hy', 'Armenian', 'Հայերեն'], ['as', 'Assamese', 'অসমীয়া'],
  ['ay', 'Aymara'], ['az', 'Azerbaijani', 'Azərbaycan'], ['bm', 'Bambara'],
  ['eu', 'Basque', 'Euskara'], ['be', 'Belarusian', 'Беларуская'], ['bn', 'Bengali', 'বাংলা'],
  ['bho', 'Bhojpuri'], ['bs', 'Bosnian', 'Bosanski'], ['bg', 'Bulgarian', 'Български'],
  ['ca', 'Catalan', 'Català'], ['ceb', 'Cebuano'], ['ny', 'Chichewa', 'Nyanja'],
  ['zh', 'Chinese (all variants)', '中文 汉语 漢語'], ['co', 'Corsican'], ['hr', 'Croatian', 'Hrvatski'],
  ['cs', 'Czech', 'Čeština'], ['da', 'Danish', 'Dansk'], ['dv', 'Dhivehi'],
  ['doi', 'Dogri'], ['nl', 'Dutch', 'Nederlands'], ['en', 'English'],
  ['eo', 'Esperanto'], ['et', 'Estonian', 'Eesti'], ['ee', 'Ewe'],
  ['fil', 'Filipino', 'Tagalog'], ['fi', 'Finnish', 'Suomi'], ['fr', 'French', 'Français'],
  ['fy', 'Frisian', 'Frysk'], ['gl', 'Galician', 'Galego'], ['ka', 'Georgian', 'ქართული'],
  ['de', 'Deutsch (German)', 'Deutsch'], ['el', 'Greek', 'Ελληνικά'], ['gn', 'Guarani'],
  ['gu', 'Gujarati', 'ગુજરાતી'], ['ht', 'Haitian Creole', 'Kreyòl'], ['ha', 'Hausa'],
  ['haw', 'Hawaiian', 'ʻŌlelo Hawaiʻi'], ['he', 'Hebrew', 'עברית'], ['hi', 'Hindi', 'हिन्दी'],
  ['hmn', 'Hmong'], ['hu', 'Hungarian', 'Magyar'], ['is', 'Icelandic', 'Íslenska'],
  ['ig', 'Igbo'], ['ilo', 'Ilocano'], ['id', 'Indonesian', 'Bahasa Indonesia'],
  ['ga', 'Irish', 'Gaeilge'], ['it', 'Italian', 'Italiano'], ['ja', 'Japanese', '日本語'],
  ['jv', 'Javanese', 'Basa Jawa'], ['kn', 'Kannada', 'ಕನ್ನಡ'], ['kk', 'Kazakh', 'Қазақша'],
  ['km', 'Khmer', 'ខ្មែរ'], ['rw', 'Kinyarwanda'], ['gom', 'Konkani'],
  ['ko', 'Korean', '한국어'], ['kri', 'Krio'], ['ku', 'Kurdish (Kurmanji)', 'Kurdî'],
  ['ckb', 'Kurdish (Sorani)', 'کوردی'], ['ky', 'Kyrgyz', 'Кыргызча'], ['lo', 'Lao', 'ລາວ'],
  ['la', 'Latin', 'Latina'], ['lv', 'Latvian', 'Latviešu'], ['ln', 'Lingala'],
  ['lt', 'Lithuanian', 'Lietuvių'], ['lg', 'Luganda'], ['lb', 'Luxembourgish', 'Lëtzebuergesch'],
  ['mk', 'Macedonian', 'Македонски'], ['mai', 'Maithili'], ['mg', 'Malagasy'],
  ['ms', 'Malay', 'Bahasa Melayu'], ['ml', 'Malayalam', 'മലയാളം'], ['mt', 'Maltese', 'Malti'],
  ['mi', 'Māori', 'Maori'], ['mr', 'Marathi', 'मराठी'], ['mni-mtei', 'Meiteilon (Manipuri)'],
  ['lus', 'Mizo'], ['mn', 'Mongolian', 'Монгол'], ['my', 'Myanmar (Burmese)', 'မြန်မာ'],
  ['ne', 'Nepali', 'नेपाली'], ['no', 'Norwegian', 'Norsk Bokmål Nynorsk'], ['or', 'Odia (Oriya)', 'ଓଡ଼ିଆ'],
  ['om', 'Oromo'], ['ps', 'Pashto', 'پښتو'], ['fa', 'Persian', 'فارسی Farsi'],
  ['pl', 'Polish', 'Polski'], ['pt', 'Portuguese', 'Português'], ['pa', 'Punjabi', 'ਪੰਜਾਬੀ'],
  ['qu', 'Quechua'], ['ro', 'Romanian', 'Română'], ['ru', 'Russian', 'Русский'],
  ['sm', 'Samoan'], ['sa', 'Sanskrit', 'संस्कृतम्'], ['gd', 'Scots Gaelic', 'Gàidhlig'],
  ['nso', 'Sepedi', 'Northern Sotho'], ['sr', 'Serbian', 'Српски Srpski'], ['st', 'Sesotho', 'Southern Sotho'],
  ['sn', 'Shona'], ['sd', 'Sindhi', 'سنڌي'], ['si', 'Sinhala', 'සිංහල'],
  ['sk', 'Slovak', 'Slovenčina'], ['sl', 'Slovenian', 'Slovenščina'], ['so', 'Somali', 'Soomaali'],
  ['es', 'Spanish', 'Español'], ['su', 'Sundanese'], ['sw', 'Swahili', 'Kiswahili'],
  ['sv', 'Swedish', 'Svenska'], ['tg', 'Tajik', 'Тоҷикӣ'], ['ta', 'Tamil', 'தமிழ்'],
  ['tt', 'Tatar', 'Татар'], ['te', 'Telugu', 'తెలుగు'], ['th', 'Thai', 'ไทย'],
  ['ti', 'Tigrinya', 'ትግርኛ'], ['ts', 'Tsonga'], ['tr', 'Turkish', 'Türkçe'],
  ['tk', 'Turkmen', 'Türkmençe'], ['ak', 'Twi', 'Akan'], ['uk', 'Ukrainian', 'Українська'],
  ['ur', 'Urdu', 'اردو'], ['ug', 'Uyghur', 'ئۇيغۇرچە'], ['uz', 'Uzbek', 'Oʻzbek'],
  ['vi', 'Vietnamese', 'Tiếng Việt'], ['cy', 'Welsh', 'Cymraeg'], ['xh', 'Xhosa', 'isiXhosa'],
  ['yi', 'Yiddish', 'ייִדיש'], ['yo', 'Yoruba', 'Yorùbá'], ['zu', 'Zulu', 'isiZulu'],
];

const elements = {
  enabled: document.querySelector('#enabled'),
  channelName: document.querySelector('#channel-name'),
  channelToggle: document.querySelector('#channel-toggle'),
  showLanguage: document.querySelector('#show-language'),
  translateHistory: document.querySelector('#translate-history'),
  speed: document.querySelector('#speed'),
  excludedSummary: document.querySelector('#excluded-summary'),
  excludedCount: document.querySelector('#excluded-count'),
  languageList: document.querySelector('#language-list'),
  languageSearch: document.querySelector('#language-search'),
  languageEmpty: document.querySelector('#language-empty'),
  languageSearchStatus: document.querySelector('#language-search-status'),
  status: document.querySelector('#activity-status'),
  statusDot: document.querySelector('#status-dot'),
  translated: document.querySelector('#stat-translated'),
  queued: document.querySelector('#stat-queued'),
  latency: document.querySelector('#stat-latency'),
  serviceNote: document.querySelector('#service-note'),
  test: document.querySelector('#test-connection'),
  clear: document.querySelector('#clear-cache'),
  message: document.querySelector('#action-message'),
};

let settings = normalizeSettings(SETTINGS_DEFAULTS);
let currentChannel = null;
let statusStats = null;
let settingsWrites = Promise.resolve();
let refreshInProgress = false;
let lastConnectionError = '';
const numbers = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const languageOptions = [];

function searchable(value) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function buildLanguageOptions() {
  const ordered = LANGUAGE_CATALOG.slice().sort((first, second) => {
    const priority = (code) => code === 'de' ? 0 : code === 'en' ? 1 : 2;
    return priority(first[0]) - priority(second[0]) || first[1].localeCompare(second[1], 'en');
  });
  const fragment = document.createDocumentFragment();
  for (const [code, name, nativeName = ''] of ordered) {
    const label = document.createElement('label');
    label.className = 'language-option';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'check';
    input.value = code;
    input.name = 'excluded-language';
    input.disabled = code === 'en';
    const title = document.createElement('span');
    title.className = 'language-option-name';
    title.textContent = name;
    const tag = document.createElement('span');
    tag.className = 'language-option-code';
    tag.textContent = code;
    tag.setAttribute('aria-hidden', 'true');
    if (code === 'en') input.setAttribute('aria-description', 'English is always left as-is.');
    label.append(input, title, tag);
    fragment.append(label);
    languageOptions.push({ code, name, label, input, search: searchable(`${code} ${name} ${nativeName}`) });
    input.addEventListener('change', () => {
      const excluded = input.checked;
      saveSettings((current) => ({
        excludedLanguages: excluded
          ? [...new Set([...current.excludedLanguages, code])]
          : current.excludedLanguages.filter((entry) => normalizeLanguage(entry).split('-')[0] !== code.split('-')[0]),
      }));
    });
  }
  elements.languageList.append(fragment);
}

function renderExcludedLanguages() {
  const excluded = settings.excludedLanguages;
  const selected = languageOptions.filter((option) => {
    option.input.checked = option.code === 'en' || isLanguageExcluded(option.code, excluded);
    return option.input.checked;
  });
  const names = selected.map((option) => option.code === 'de' ? 'Deutsch' : option.name);
  elements.excludedSummary.textContent = names.join(', ');
  elements.excludedSummary.title = names.join(', ');
  elements.excludedCount.textContent = String(excluded.length);
  elements.excludedCount.setAttribute('aria-label', `${excluded.length} languages left untranslated`);
}

function filterLanguages() {
  const terms = searchable(elements.languageSearch.value.trim()).split(/\s+/u).filter(Boolean);
  let visible = 0;
  for (const option of languageOptions) {
    option.label.hidden = !terms.every((term) => option.search.includes(term));
    if (!option.label.hidden) visible += 1;
  }
  elements.languageEmpty.hidden = visible > 0;
  elements.languageSearchStatus.textContent = `${visible} ${visible === 1 ? 'language' : 'languages'} found.`;
}

function showMessage(message, isError = false) {
  elements.message.textContent = message;
  elements.message.dataset.error = String(isError);
  elements.message.hidden = !message;
}

function renderSettings() {
  elements.enabled.checked = settings.enabled;
  elements.showLanguage.checked = settings.showLanguage;
  elements.translateHistory.checked = settings.translateHistory;
  elements.speed.value = settings.speed;
  document.querySelectorAll('input[name="display-mode"]').forEach((radio) => {
    radio.checked = radio.value === settings.displayMode;
  });
  const paused = currentChannel && settings.disabledChannels.includes(currentChannel);
  elements.channelName.textContent = currentChannel || 'Open a Twitch channel';
  elements.channelName.title = currentChannel ? `Current channel: ${currentChannel}` : 'Channel controls are available on Twitch channel pages.';
  elements.channelToggle.disabled = !currentChannel;
  elements.channelToggle.textContent = paused ? 'Resume here' : 'Pause here';
  elements.channelToggle.setAttribute('aria-label', currentChannel ? `${paused ? 'Resume' : 'Pause'} translation in ${currentChannel}` : 'Pause translation in this channel');
  elements.channelToggle.setAttribute('aria-pressed', String(Boolean(paused)));
  renderExcludedLanguages();
  renderActivity();
}

function renderActivity() {
  let label = 'Ready for chat';
  let state = 'ready';
  const stats = statusStats;
  const queued = Math.max(0, Number(stats?.queued) || 0);
  const inFlight = Math.max(0, Number(stats?.inFlight) || 0);
  const cooldown = Number(stats?.cooldownUntil) > Date.now();
  const paused = currentChannel && settings.disabledChannels.includes(currentChannel);

  if (!settings.enabled) {
    label = 'Translation is off';
    state = 'paused';
  } else if (paused) {
    label = 'Paused in this channel';
    state = 'paused';
  } else if (lastConnectionError) {
    label = 'Connection unavailable';
    state = 'warning';
  } else if (cooldown) {
    label = 'Waiting for translation service';
    state = 'warning';
  } else if (inFlight > 0 || queued > 0) {
    label = 'Translating chat…';
  } else if (stats?.lastError) {
    label = 'Translation service needs attention';
    state = 'warning';
  } else if (!currentChannel) {
    label = 'Ready · open a Twitch channel';
  }

  elements.status.textContent = label;
  elements.statusDot.dataset.state = state;
  elements.translated.textContent = numbers.format(Math.max(0, Number(stats?.translated) || 0));
  elements.queued.textContent = numbers.format(queued + inFlight);
  const latency = Number(stats?.averageLatencyMs) || 0;
  elements.latency.textContent = latency > 0 ? (latency < 1000 ? `${Math.round(latency)} ms` : `${(latency / 1000).toFixed(1)} s`) : '—';
  elements.translated.title = `${Number(stats?.translated) || 0} translated messages; ${Number(stats?.cacheHits) || 0} cache hits`;
  elements.queued.title = `${queued} waiting; ${inFlight} active requests`;
  const retrySeconds = cooldown ? Math.max(1, Math.ceil((Number(stats.cooldownUntil) - Date.now()) / 1000)) : 0;
  const note = lastConnectionError || (cooldown ? `The free service is taking a break. Retrying in ${retrySeconds}s.` : stats?.lastError || '');
  elements.serviceNote.textContent = note;
  elements.serviceNote.hidden = !note;
}

function saveSettings(update) {
  settingsWrites = settingsWrites.catch(() => {}).then(async () => {
    const stored = await chrome.storage.local.get('settings');
    const current = normalizeSettings(stored.settings || SETTINGS_DEFAULTS);
    const next = normalizeSettings({ ...current, ...update(current) });
    await chrome.storage.local.set({ settings: next });
    settings = next;
    renderSettings();
  }).catch((error) => {
    showMessage(`Could not save your setting: ${error.message || 'Please try again.'}`, true);
    renderSettings();
  });
  return settingsWrites;
}

async function request(type) {
  const response = await chrome.runtime.sendMessage({ type });
  if (!response?.ok) {
    throw new Error(response?.error || 'The extension could not reach the translation service.');
  }
  return response;
}

async function refreshStatus() {
  if (refreshInProgress) return;
  refreshInProgress = true;
  try {
    const response = await request('GET_STATUS');
    statusStats = response.stats || null;
    lastConnectionError = '';
  } catch (error) {
    lastConnectionError = error.message || 'Reopen the extension and try again.';
  } finally {
    refreshInProgress = false;
    renderActivity();
  }
}

elements.enabled.addEventListener('change', () => {
  const enabled = elements.enabled.checked;
  saveSettings(() => ({ enabled }));
});
elements.showLanguage.addEventListener('change', () => {
  const showLanguage = elements.showLanguage.checked;
  saveSettings(() => ({ showLanguage }));
});
elements.translateHistory.addEventListener('change', () => {
  const translateHistory = elements.translateHistory.checked;
  saveSettings(() => ({ translateHistory }));
});
elements.speed.addEventListener('change', () => {
  const speed = elements.speed.value;
  saveSettings(() => ({ speed }));
});
elements.languageSearch.addEventListener('input', filterLanguages);
document.querySelectorAll('input[name="display-mode"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    if (radio.checked) saveSettings(() => ({ displayMode: radio.value }));
  });
});
elements.channelToggle.addEventListener('click', async () => {
  const channel = currentChannel;
  if (!channel) return;
  elements.channelToggle.disabled = true;
  await saveSettings((current) => ({
    disabledChannels: current.disabledChannels.includes(channel)
      ? current.disabledChannels.filter((entry) => entry !== channel)
      : [...current.disabledChannels, channel],
  }));
});
elements.test.addEventListener('click', async () => {
  elements.test.disabled = true;
  showMessage('Testing a short translation…');
  try {
    const response = await request('TEST_TRANSLATION');
    const result = response.results?.[0];
    if (!result || result.status !== 'translated' || !result.translatedText) {
      throw new Error(result?.error || 'No translation was returned. Please try again.');
    }
    showMessage(`Connected! “${result.text || 'Hola, ¿cómo estás?'}” → “${result.translatedText}”`);
    if (response.stats) statusStats = response.stats;
    lastConnectionError = '';
  } catch (error) {
    showMessage(`Test failed: ${error.message || 'Please try again in a moment.'}`, true);
  } finally {
    elements.test.disabled = false;
    refreshStatus();
  }
});
elements.clear.addEventListener('click', async () => {
  elements.clear.disabled = true;
  try {
    await request('CLEAR_CACHE');
    showMessage('Translation cache cleared. New messages will be translated again.');
    refreshStatus();
  } catch (error) {
    showMessage(`Could not clear cache: ${error.message || 'Please try again.'}`, true);
  } finally {
    elements.clear.disabled = false;
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    settings = normalizeSettings(changes.settings.newValue || SETTINGS_DEFAULTS);
    renderSettings();
  }
});

async function initialize() {
  renderSettings();
  const results = await Promise.allSettled([
    chrome.storage.local.get('settings'),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);
  if (results[0].status === 'fulfilled') {
    settings = normalizeSettings(results[0].value.settings || SETTINGS_DEFAULTS);
  } else {
    showMessage('Your settings could not be loaded. Reopen the extension to try again.', true);
  }
  if (results[1].status === 'fulfilled') {
    currentChannel = getChannel(results[1].value[0]?.url || '');
  }
  renderSettings();
  await refreshStatus();
}

buildLanguageOptions();
initialize().catch((error) => showMessage(error.message || 'Could not start the extension popup.', true));
const statusTimer = setInterval(refreshStatus, 1000);
window.addEventListener('pagehide', () => clearInterval(statusTimer), { once: true });
