const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('unified preview passes lang and normalized series_id', async () => {
  let captured = null;
  const unifiedPath = path.resolve(__dirname, '../src/services/errorCodeUnifiedService.js');
  const searchPath = path.resolve(__dirname, '../src/services/errorCodeSearchService.js');
  const errorCodePath = path.resolve(__dirname, '../src/models/error_code.js');
  const i18nPath = path.resolve(__dirname, '../src/models/i18n_error_code.js');
  const analysisPath = path.resolve(__dirname, '../src/models/analysis_category.js');
  const previewPath = path.resolve(__dirname, '../src/utils/explanationPreview.js');

  delete require.cache[unifiedPath];
  require.cache[searchPath] = {
    exports: {
      searchByKeywords: async () => ({ ok: true, items: [] }),
      searchByCode: async () => ({ ok: false, item: null })
    }
  };
  require.cache[errorCodePath] = {
    exports: {
      findAndCountAll: async () => ({ count: 0, rows: [] }),
      findAll: async () => []
    }
  };
  require.cache[i18nPath] = { exports: { findAll: async () => [] } };
  require.cache[analysisPath] = { exports: {} };
  require.cache[previewPath] = {
    exports: {
      buildExplanationPreview: async (args) => {
        captured = args;
        return { explanation: 'x', prefix: 'p' };
      }
    }
  };

  const { searchErrorCodesUnified } = require(unifiedPath);
  await searchErrorCodesUnified({
    q: '141010A',
    series_id: '2',
    preview: 1,
    acceptLanguage: 'en-US',
    page: 1,
    limit: 10,
    t: (k) => k
  });

  assert.ok(captured);
  assert.equal(captured.lang, 'en');
  assert.equal(captured.series_id, 2);
});
