// Optional nodejieba segmenter. Falls back gracefully if not installed.
const path = require('path');
const fs = require('fs');
// 移除 HanLP 客户端依赖

let jieba = null;
try {
  // eslint-disable-next-line import/no-extraneous-dependencies
  jieba = require('nodejieba');
} catch (_) {
  jieba = null;
}

let CUSTOM_WORDS = [];
let CFG_CUSTOM = [];
function loadCustomWords() {
  try {
    const cfgPath = path.join(__dirname, '../config/nlpMappings.json');
    const raw = fs.readFileSync(cfgPath, 'utf-8');
    const cfg = JSON.parse(raw);
    const words = new Set();
    const collect = (obj) => {
      if (!obj) return;
      Object.values(obj).forEach((arr) => {
        if (Array.isArray(arr)) arr.forEach((w) => words.add(String(w)));
      });
    };
    collect(cfg.fields);
    collect(cfg.operators);
    collect(cfg.units);
    if (cfg.time_phrases) Object.keys(cfg.time_phrases).forEach((k) => words.add(k));
    // domain hints
    ['状态机', '故障码', '错误码', '之间', '之一', '不包含', '包含', '相关', '有关', '关于']
      .forEach((w) => words.add(w));
    CUSTOM_WORDS = Array.from(words);
    // 同时读取 nlpConfig.json 中的自定义词
    try {
      const cfg2 = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/nlpConfig.json'), 'utf-8'));
      if (Array.isArray(cfg2.custom_words)) {
        CFG_CUSTOM = cfg2.custom_words.map(String);
        for (const w of CFG_CUSTOM) words.add(w);
        CUSTOM_WORDS = Array.from(words);
      }
    } catch (_) {}
  } catch (_) {
    CUSTOM_WORDS = [];
  }
}

let initialized = false;
function init() {
  if (initialized) return;
  loadCustomWords();
  if (jieba && CUSTOM_WORDS.length > 0) {
    try {
      CUSTOM_WORDS.forEach((w) => {
        try { jieba.insertWord(w); } catch (_) { /* ignore */ }
      });
    } catch (_) { /* ignore */ }
  }
  initialized = true;
}

async function segmentAsync(text) {
  init();
  // 1) 尝试 nodejieba
  if (jieba) {
    try {
      return jieba.cut(String(text || ''), true);
    } catch (_) {}
  }
  // 2) 最终兜底：按空白拆分
  return String(text || '').trim().split(/\s+/).filter(Boolean);
}

function segment(text) {
  // 根据配置决定是否在同步调用时后台触发异步分词
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../config/nlpConfig.json'), 'utf-8'));
    if (cfg && cfg.backgroundSegment) {
      void segmentAsync(text);
    }
  } catch (_) { /* ignore */ }
  if (jieba) {
    try { return jieba.cut(String(text || ''), true); } catch (_) {}
  }
  return String(text || '').trim().split(/\s+/).filter(Boolean);
}

module.exports = { segment, segmentAsync };

// 提供一个可选的综合分析 API，供上层调试或增强解析使用
async function analyze(text) {
  init();
  // 简化：仅返回 tokens，其余为空
  const toks = await segmentAsync(text);
  return { tokens: toks, pos: null, ner: null, dep: null, keywords: null };
}

module.exports.analyze = analyze;


