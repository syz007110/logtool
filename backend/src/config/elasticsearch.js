const { Client } = require('@elastic/elasticsearch');

let _client = null;

function boolFromEnv(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null) return defaultValue;
  const s = String(raw).trim().toLowerCase();
  if (!s) return defaultValue;
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function getElasticsearchConfig() {
  const node = String(process.env.ELASTICSEARCH_URL || 'http://127.0.0.1:9200').trim();
  const username = String(process.env.ELASTICSEARCH_USERNAME || '').trim();
  const password = String(process.env.ELASTICSEARCH_PASSWORD || '').trim();
  const apiKey = String(process.env.ELASTICSEARCH_API_KEY || '').trim();

  const requestTimeout = Number.parseInt(process.env.ELASTICSEARCH_REQUEST_TIMEOUT_MS || '30000', 10);
  const maxRetries = Number.parseInt(process.env.ELASTICSEARCH_MAX_RETRIES || '3', 10);

  const tlsRejectUnauthorized = boolFromEnv('ELASTICSEARCH_TLS_REJECT_UNAUTHORIZED', true);

  const cfg = {
    node,
    maxRetries: Number.isFinite(maxRetries) ? maxRetries : 3,
    requestTimeout: Number.isFinite(requestTimeout) ? requestTimeout : 30000
  };

  if (apiKey) {
    cfg.auth = { apiKey };
  } else if (username || password) {
    cfg.auth = { username, password };
  }

  // Only set TLS options when using https
  if (String(node).startsWith('https://')) {
    cfg.tls = { rejectUnauthorized: !!tlsRejectUnauthorized };
  }

  return cfg;
}

function getElasticsearchClient() {
  if (_client) return _client;
  const cfg = getElasticsearchConfig();
  _client = new Client(cfg);
  return _client;
}

async function pingElasticsearch() {
  const client = getElasticsearchClient();
  try {
    // ES client v8: ping returns boolean in some setups, or throws on failure
    await client.ping();
    return { ok: true };
  } catch (e) {
    return { ok: false, message: String(e?.message || e), code: e?.code || '' };
  }
}

module.exports = {
  getElasticsearchConfig,
  getElasticsearchClient,
  pingElasticsearch
};

