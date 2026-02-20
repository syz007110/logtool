const SUPPORTED_LANGUAGE_CODES = Object.freeze([
  'zh',
  'en',
  'fr',
  'de',
  'es',
  'it',
  'pt',
  'nl',
  'sk',
  'ro',
  'da',
  'lv',
  'ru'
]);

const LANGUAGE_CODE_MAP = Object.freeze(
  SUPPORTED_LANGUAGE_CODES.reduce((acc, code) => {
    acc[code] = code;
    return acc;
  }, Object.create(null))
);

function mapLanguageCode(input, options = {}) {
  const { fallback = 'zh', keepUnknown = false } = options;
  const code = String(input || '').trim().toLowerCase();
  if (!code) return fallback;
  if (LANGUAGE_CODE_MAP[code]) return LANGUAGE_CODE_MAP[code];
  return keepUnknown ? code : fallback;
}

function getPredefinedLanguages(t) {
  return SUPPORTED_LANGUAGE_CODES.map(code => ({
    value: code,
    label: t(`shared.languageNames.${code}`)
  }));
}

module.exports = {
  SUPPORTED_LANGUAGE_CODES,
  LANGUAGE_CODE_MAP,
  mapLanguageCode,
  getPredefinedLanguages
};
