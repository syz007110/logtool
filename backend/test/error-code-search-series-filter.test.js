const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadSearchService({ searchImpl }) {
  const searchServicePath = path.resolve(__dirname, '../src/services/errorCodeSearchService.js');
  const esConfigPath = path.resolve(__dirname, '../src/config/elasticsearch.js');
  const indexServicePath = path.resolve(__dirname, '../src/services/errorCodeIndexService.js');

  delete require.cache[searchServicePath];
  delete require.cache[esConfigPath];
  delete require.cache[indexServicePath];

  require.cache[esConfigPath] = {
    exports: {
      getElasticsearchClient: () => ({
        ping: async () => true,
        search: searchImpl
      })
    }
  };
  require.cache[indexServicePath] = {
    exports: {
      ensureErrorCodeIndex: async () => ({ ok: true }),
      getErrorCodeIndexName: () => 'error_codes_index'
    }
  };

  return require(searchServicePath);
}

function loadUnifiedService({ searchByKeywords }) {
  const unifiedPath = path.resolve(__dirname, '../src/services/errorCodeUnifiedService.js');
  const searchServicePath = path.resolve(__dirname, '../src/services/errorCodeSearchService.js');
  const errorCodePath = path.resolve(__dirname, '../src/models/error_code.js');
  const i18nPath = path.resolve(__dirname, '../src/models/i18n_error_code.js');
  const analysisCategoryPath = path.resolve(__dirname, '../src/models/analysis_category.js');
  const previewPath = path.resolve(__dirname, '../src/utils/explanationPreview.js');

  delete require.cache[unifiedPath];
  require.cache[searchServicePath] = {
    exports: {
      searchByKeywords,
      searchByCode: async () => ({ ok: false, item: null })
    }
  };
  require.cache[errorCodePath] = {
    exports: {
      findAndCountAll: async () => ({ count: 0, rows: [] }),
      findAll: async () => []
    }
  };
  require.cache[i18nPath] = {
    exports: {
      findAll: async () => []
    }
  };
  require.cache[analysisCategoryPath] = { exports: {} };
  require.cache[previewPath] = {
    exports: {
      buildExplanationPreview: async () => null
    }
  };

  return require(unifiedPath);
}

test('searchByKeywords adds series_id term filter when provided', async () => {
  let capturedQuery = null;
  const { searchByKeywords } = loadSearchService({
    searchImpl: async (payload) => {
      capturedQuery = payload?.query;
      return { hits: { hits: [], total: { value: 0 } } };
    }
  });

  const result = await searchByKeywords({
    keywords: ['通信异常'],
    lang: 'zh',
    limit: 10,
    series_id: 2
  });

  assert.equal(result.ok, true);
  assert.ok(capturedQuery);
  const filters = capturedQuery.bool.filter || [];
  assert.ok(
    filters.some((f) => f.term && f.term.series_id === 2),
    `expected series_id filter, got ${JSON.stringify(filters)}`
  );
  assert.ok(
    filters.some((f) => f.term && f.term.lang === 'zh'),
    'lang filter should remain'
  );
});

test('searchByKeywords omits series_id filter when series_id not provided', async () => {
  let capturedQuery = null;
  const { searchByKeywords } = loadSearchService({
    searchImpl: async (payload) => {
      capturedQuery = payload?.query;
      return { hits: { hits: [], total: { value: 0 } } };
    }
  });

  await searchByKeywords({
    keywords: ['通信异常'],
    lang: 'zh',
    limit: 10
  });

  const filters = capturedQuery.bool.filter || [];
  assert.equal(
    filters.some((f) => f.term && Object.prototype.hasOwnProperty.call(f.term, 'series_id')),
    false
  );
});

test('searchErrorCodesUnified passes series_id into searchByKeywords for keyword search', async () => {
  let capturedArgs = null;
  const { searchErrorCodesUnified } = loadUnifiedService({
    searchByKeywords: async (args) => {
      capturedArgs = args;
      return { ok: true, items: [] };
    }
  });

  await searchErrorCodesUnified({
    q: '通信异常',
    series_id: 2,
    page: 1,
    limit: 10,
    acceptLanguage: 'zh'
  });

  assert.ok(capturedArgs);
  assert.equal(capturedArgs.series_id, 2);
});

test('searchErrorCodesUnified passes series_id into searchByKeywords for type/full code ES path', async () => {
  let capturedArgs = null;
  const { searchErrorCodesUnified } = loadUnifiedService({
    searchByKeywords: async (args) => {
      capturedArgs = args;
      return { ok: true, items: [] };
    }
  });

  await searchErrorCodesUnified({
    q: '141010A',
    series_id: '2',
    page: 1,
    limit: 10,
    acceptLanguage: 'zh'
  });

  assert.ok(capturedArgs);
  assert.equal(capturedArgs.series_id, 2);
});
