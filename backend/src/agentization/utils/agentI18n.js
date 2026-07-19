const path = require('path');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const zhBundle = require('../../locales/zh/translation.json');
const enBundle = require('../../locales/en/translation.json');

const I18NEXT_BACKEND_PATH = path.resolve(__dirname, '../../locales/{{lng}}/translation.json');

let backendInitPromise = null;

function resolveAgentLng(input) {
  const raw = String(input || '').trim().toLowerCase();
  return raw.startsWith('en') ? 'en' : 'zh';
}

async function ensureAgentI18n() {
  if (i18next.isInitialized) return;
  for (let i = 0; i < 50; i += 1) {
    await new Promise((r) => setTimeout(r, 20));
    if (i18next.isInitialized) return;
  }
  if (!backendInitPromise) {
    backendInitPromise = i18next.use(Backend).init({
      fallbackLng: 'zh',
      preload: ['zh', 'en'],
      backend: { loadPath: I18NEXT_BACKEND_PATH },
      interpolation: { escapeValue: false }
    });
  }
  try {
    await backendInitPromise;
  } catch (error) {
    if (i18next.isInitialized) return;
    backendInitPromise = null;
    throw error;
  }
}

function getAgentFixedT(language) {
  const lng = resolveAgentLng(language);
  if (i18next.isInitialized) {
    return i18next.getFixedT(lng);
  }
  const bundle = lng === 'en' ? enBundle : zhBundle;
  return (key, params = {}) => {
    const value = String(key || '')
      .split('.')
      .reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), bundle);
    if (typeof value !== 'string') return String(key || '');
    return value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(params?.[name] ?? ''));
  };
}

module.exports = {
  ensureAgentI18n,
  getAgentFixedT,
  resolveAgentLng
};
