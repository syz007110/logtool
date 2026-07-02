const fs = require('fs');
const path = require('path');

const PROMPTS_ROOT = path.join(__dirname, 'prompts');
const MANIFEST_PATH = path.join(PROMPTS_ROOT, 'manifest.json');

const fileCache = new Map();
let manifestCache = null;

function resolveOrchestratorPromptLang(tag) {
  const s = String(tag || 'zh').trim().toLowerCase();
  return s.startsWith('en') ? 'en' : 'zh';
}

function loadManifest() {
  if (manifestCache) return manifestCache;
  manifestCache = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  return manifestCache;
}

function getLangConfig(lang) {
  const manifest = loadManifest();
  const langKey = resolveOrchestratorPromptLang(lang);
  const config = manifest?.langs?.[langKey];
  if (!config || typeof config !== 'object') {
    const err = new Error(`orchestrator prompts lang not found: ${langKey}`);
    err.code = 'MISSING_ORCHESTRATOR_PROMPTS_LANG';
    throw err;
  }
  return { manifest, langKey, config };
}

function getBlockFileName(langKey, blockKey) {
  const { config } = getLangConfig(langKey);
  const fileName = String(config[blockKey] || '').trim();
  return fileName;
}

function readPromptFile(relativePath) {
  const abs = path.join(PROMPTS_ROOT, relativePath);
  if (!fs.existsSync(abs)) {
    const err = new Error(`orchestrator prompt file not found: ${relativePath}`);
    err.code = 'MISSING_ORCHESTRATOR_PROMPT_FILE';
    throw err;
  }
  const stat = fs.statSync(abs);
  const cacheKey = `${abs}:${stat.mtimeMs}`;
  if (fileCache.has(cacheKey)) return fileCache.get(cacheKey);
  const text = fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '');
  fileCache.clear();
  fileCache.set(cacheKey, text);
  return text;
}

function readLangBlock(lang, blockKey) {
  const { langKey } = getLangConfig(lang);
  const fileName = getBlockFileName(langKey, blockKey);
  if (!fileName) {
    const err = new Error(`orchestrator block not configured: ${blockKey}`);
    err.code = 'MISSING_ORCHESTRATOR_PROMPT_BLOCK';
    throw err;
  }
  return readPromptFile(path.join(langKey, fileName));
}

function loadSystemPrompt(lang) {
  const { langKey } = getLangConfig(lang);
  const systemPrompt = readLangBlock(lang, 'system').trim();
  if (!systemPrompt) {
    const err = new Error('orchestrator system prompt is empty');
    err.code = 'MISSING_ORCHESTRATOR_PROMPTS_SYSTEM';
    throw err;
  }
  return { langKey, systemPrompt };
}

function loadMemoryPrompt(lang) {
  try {
    return readLangBlock(lang, 'memory').trim();
  } catch (error) {
    if (error?.code === 'MISSING_ORCHESTRATOR_PROMPT_FILE'
      || error?.code === 'MISSING_ORCHESTRATOR_PROMPT_BLOCK') {
      return '';
    }
    throw error;
  }
}

function loadPromptBlocks(lang) {
  const { langKey, manifest } = getLangConfig(lang);
  return {
    langKey,
    blocks: manifest.blocks || {},
    system: loadSystemPrompt(lang).systemPrompt,
    memory: loadMemoryPrompt(lang)
  };
}

function clearPromptCache() {
  fileCache.clear();
  manifestCache = null;
}

module.exports = {
  PROMPTS_ROOT,
  resolveOrchestratorPromptLang,
  loadManifest,
  getLangConfig,
  loadSystemPrompt,
  loadMemoryPrompt,
  loadPromptBlocks,
  clearPromptCache
};
