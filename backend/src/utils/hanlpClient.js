const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

let CONFIG = null;
function loadConfig() {
  if (CONFIG) return CONFIG;
  try {
    const p = path.join(__dirname, '../config/nlpConfig.json');
    const raw = fs.readFileSync(p, 'utf-8');
    CONFIG = JSON.parse(raw);
  } catch (_) {
    CONFIG = { useHanLP: false, endpoint: '', apiKey: '', timeoutMs: 1500, debug: false };
  }
  return CONFIG;
}

function doRequest(method, endpoint, pathName, body, headers = {}, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    try {
      const parsed = url.parse(endpoint);
      const isHttps = parsed.protocol === 'https:';
      const client = isHttps ? https : http;
      const req = client.request({
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port,
        path: (parsed.pathname ? parsed.pathname.replace(/\/$/, '') : '') + pathName,
        method,
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers)
      }, (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json);
          } catch (e) {
            resolve(null);
          }
        });
      });
      req.on('error', (err) => reject(err));
      req.setTimeout(timeoutMs, () => {
        try { req.destroy(new Error('Request timeout')); } catch (_) {}
        reject(new Error('Request timeout'));
      });
      if (body) req.write(JSON.stringify(body));
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

async function segmentWithHanLP(text, userWords = []) {
  const cfg = loadConfig();
  if (!cfg || !cfg.useHanLP || !cfg.endpoint) return null;
  const payload = {
    text: String(text || ''),
    // 常见HanLP REST服务可能不支持动态词典，这里作为hint传入，服务端如忽略也不影响
    customDictionary: Array.from(new Set((cfg.custom_words || []).concat(userWords || [])))
  };
  const headers = {};
  if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;

  // 兼容多种常见REST路径：优先 tok/fine，其次 tok/coarse，其次 /segment，最后兼容自建 /parse
  const pathsToTry = ['/tok/fine', '/tok/coarse', '/segment', '/parse'];
  for (const p of pathsToTry) {
    try {
      const resp = await doRequest('POST', cfg.endpoint, p, payload, headers, cfg.timeoutMs || 1500);
      if (!resp) continue;
      // 兼容多种响应格式
      let tokens = null;
      if (Array.isArray(resp)) tokens = resp;
      else if (Array.isArray(resp.tokens)) tokens = resp.tokens;
      else if (resp.data && Array.isArray(resp.data)) tokens = resp.data;
      else if (resp['tok/fine'] && Array.isArray(resp['tok/fine'])) tokens = resp['tok/fine'];
      else if (resp.result && Array.isArray(resp.result)) tokens = resp.result;
      if (Array.isArray(tokens)) {
        if (cfg.debug) console.log(`[NLP] HanLP used via ${p}, tokens=${tokens.length}`);
        return tokens.map(String);
      }
    } catch (e) { /* try next */ }
  }
  if (cfg.debug) console.warn('[NLP] HanLP request failed, will fallback');
  return null;
}

module.exports = {
  loadConfig,
  segmentWithHanLP,
  analyzeWithHanLP: async function analyzeWithHanLP(text, userWords = []) {
    const cfg = loadConfig();
    if (!cfg || !cfg.useHanLP || !cfg.endpoint) return null;
    const payload = {
      text: String(text || ''),
      customDictionary: Array.from(new Set((cfg.custom_words || []).concat(userWords || [])))
    };
    const headers = {};
    if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;
    try {
      const resp = await doRequest('POST', cfg.endpoint, '/nlp', payload, headers, cfg.timeoutMs || 1500);
      if (resp && typeof resp === 'object') {
        const out = {
          tokens: Array.isArray(resp.tokens) ? resp.tokens.map(String) : null,
          pos: Array.isArray(resp.pos) ? resp.pos.map(String) : null,
          ner: Array.isArray(resp.ner) ? resp.ner : null,
          dep: resp.dep != null ? resp.dep : null,
          keywords: Array.isArray(resp.keywords) ? resp.keywords.map(String) : null
        };
        if (cfg.debug) console.log('[NLP] HanLP /nlp used');
        return out;
      }
    } catch (e) {
      if (cfg.debug) console.warn('[NLP] HanLP /nlp request failed');
    }
    return null;
  }
};


