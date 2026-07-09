const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    },
    send(payload) {
      this.body = payload;
      return this;
    }
  };
}

function loadErrorCodeController(stubs) {
  const controllerPath = path.resolve(__dirname, '../src/controllers/errorCodeController.js');
  const errorCodePath = path.resolve(__dirname, '../src/models/error_code.js');
  const i18nPath = path.resolve(__dirname, '../src/models/i18n_error_code.js');
  const analysisCategoryPath = path.resolve(__dirname, '../src/models/analysis_category.js');
  const relationPath = path.resolve(__dirname, '../src/models/error_code_analysis_category.js');
  const techImagePath = path.resolve(__dirname, '../src/models/tech_solution_image.js');
  const deviceSeriesPath = path.resolve(__dirname, '../src/models/device_series_dict.js');
  const modelsIndexPath = path.resolve(__dirname, '../src/models/index.js');
  const opLoggerPath = path.resolve(__dirname, '../src/utils/operationLogger.js');
  const cachePath = path.resolve(__dirname, '../src/services/errorCodeCache.js');
  const cacheSyncPath = path.resolve(__dirname, '../src/services/errorCodeCacheSyncService.js');
  const indexServicePath = path.resolve(__dirname, '../src/services/errorCodeIndexService.js');
  const searchServicePath = path.resolve(__dirname, '../src/services/errorCodeSearchService.js');
  const unifiedServicePath = path.resolve(__dirname, '../src/services/errorCodeUnifiedService.js');
  const mirrorServicePath = path.resolve(__dirname, '../src/services/errorCodeMirrorSyncService.js');

  delete require.cache[controllerPath];
  require.cache[errorCodePath] = { exports: stubs.ErrorCode };
  require.cache[i18nPath] = { exports: stubs.I18nErrorCode || {} };
  require.cache[analysisCategoryPath] = { exports: stubs.AnalysisCategory || {} };
  require.cache[relationPath] = { exports: stubs.ErrorCodeAnalysisCategory || {} };
  require.cache[techImagePath] = { exports: stubs.TechSolutionImage || {} };
  require.cache[deviceSeriesPath] = { exports: stubs.DeviceSeriesDict || { findByPk: async () => ({ id: 1 }) } };
  require.cache[modelsIndexPath] = { exports: { sequelize: stubs.sequelize || { transaction: async (fn) => fn({}) } } };
  require.cache[opLoggerPath] = { exports: { logOperation: async () => {} } };
  require.cache[cachePath] = { exports: stubs.errorCodeCache || { reloadCache: async () => {} } };
  require.cache[cacheSyncPath] = { exports: stubs.errorCodeCacheSyncService || { publishReload: async () => {} } };
  require.cache[indexServicePath] = { exports: stubs.indexService || { indexErrorCodeToEs: async () => {}, deleteErrorCodeFromEs: async () => {} } };
  require.cache[searchServicePath] = { exports: stubs.searchService || { searchByKeywords: async () => ({ ok: true, items: [] }), searchByCode: async () => ({ ok: false, item: null }) } };
  require.cache[unifiedServicePath] = { exports: stubs.unifiedService || { searchErrorCodesUnified: async () => ({ errorCodes: [], total: 0 }) } };
  require.cache[mirrorServicePath] = { exports: stubs.mirrorService || { syncMirrorErrorCodeBySourceId: async () => null, isMirrorSubsystem: () => false } };

  return require(controllerPath);
}

function loadErrorCodeCache(stubs) {
  const cachePath = path.resolve(__dirname, '../src/services/errorCodeCache.js');
  const errorCodePath = path.resolve(__dirname, '../src/models/error_code.js');
  const i18nPath = path.resolve(__dirname, '../src/models/i18n_error_code.js');

  delete require.cache[cachePath];
  require.cache[errorCodePath] = { exports: stubs.ErrorCode };
  require.cache[i18nPath] = { exports: stubs.I18nErrorCode || {} };

  return require(cachePath);
}

function loadLogParsingService(stubs) {
  const servicePath = path.resolve(__dirname, '../src/services/logParsingService.js');
  const cachePath = path.resolve(__dirname, '../src/services/errorCodeCache.js');
  const parserPath = path.resolve(__dirname, '../src/utils/optimizedExplanationParser.js');

  delete require.cache[servicePath];
  require.cache[cachePath] = { exports: stubs.errorCodeCache };
  require.cache[parserPath] = {
    exports: {
      optimizedExplanationParser: {
        initialize: async () => {},
        parseExplanation: (template) => template
      }
    }
  };

  return require(servicePath);
}

test('createErrorCode duplicate check uses series_id + subsystem + code', async () => {
  let capturedWhere = null;
  const controller = loadErrorCodeController({
    ErrorCode: {
      findOne: async ({ where }) => {
        capturedWhere = where;
        return { id: 9 };
      }
    },
    DeviceSeriesDict: { findByPk: async () => ({ id: 2 }) }
  });

  const req = {
    body: {
      series_id: 2,
      subsystem: '1',
      code: '0X010A',
      is_axis_error: false,
      is_arm_error: false,
      category: 'software'
    },
    t: (key) => key,
    user: null
  };
  const res = createRes();

  await controller.createErrorCode(req, res);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(capturedWhere, { series_id: 2, subsystem: '1', code: '0X010A' });
});

test('updateErrorCode duplicate check uses target series_id + subsystem + code', async () => {
  let capturedWhere = null;
  const controller = loadErrorCodeController({
    ErrorCode: {
      findByPk: async () => ({
        id: 1,
        series_id: 1,
        subsystem: '1',
        code: '0X010A',
        category: 'software',
        update: async () => {}
      }),
      findOne: async ({ where }) => {
        capturedWhere = where;
        return { id: 9 };
      }
    },
    DeviceSeriesDict: { findByPk: async () => ({ id: 2 }) }
  });

  const req = {
    params: { id: '1' },
    body: {
      series_id: 2,
      subsystem: '1',
      code: '0X010A',
      is_axis_error: false,
      is_arm_error: false,
      category: 'software'
    },
    t: (key) => key,
    user: null
  };
  const res = createRes();

  await controller.updateErrorCode(req, res);

  assert.equal(res.statusCode, 409);
  assert.equal(capturedWhere.series_id, 2);
  assert.equal(capturedWhere.subsystem, '1');
  assert.equal(capturedWhere.code, '0X010A');
  assert.deepEqual(capturedWhere.id, { [require('sequelize').Op.ne]: '1' });
});

test('getErrorCodeByCodeAndSubsystem mysql fallback uses series_id when provided', async () => {
  let capturedWhere = null;
  const controller = loadErrorCodeController({
    ErrorCode: {
      findOne: async ({ where }) => {
        capturedWhere = where;
        return null;
      }
    },
    DeviceSeriesDict: { findByPk: async () => ({ id: 2 }) },
    searchService: {
      searchByKeywords: async () => ({ ok: true, items: [] }),
      searchByCode: async () => ({ ok: false, item: null })
    }
  });

  const req = {
    query: { code: '0X010A', subsystem: '1', series_id: '2' },
    headers: {},
    t: (key) => key
  };
  const res = createRes();

  await controller.getErrorCodeByCodeAndSubsystem(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(capturedWhere, { code: '0X010A', subsystem: '1', series_id: 2 });
});

test('errorCodeCache distinguishes identical subsystem+code across series', async () => {
  const cache = loadErrorCodeCache({
    ErrorCode: {
      findAll: async () => ([
        {
          id: 1,
          series_id: 1,
          subsystem: '1',
          code: '0X010A',
          i18nContents: [{ short_message: 'sr', explanation: 'sr-exp' }]
        },
        {
          id: 2,
          series_id: 2,
          subsystem: '1',
          code: '0X010A',
          i18nContents: [{ short_message: 'sa', explanation: 'sa-exp' }]
        }
      ])
    }
  });

  await cache.loadAllErrorCodes();

  assert.equal(cache.findErrorCode('1', '0X010A', 1)?.id, 1);
  assert.equal(cache.findErrorCode('1', '0X010A', 2)?.id, 2);
  assert.equal(cache.findErrorCode('1', '0X010A'), null);
});

test('renderEntryExplanation prefers series-specific explanation when series_id is present', () => {
  const calls = [];
  const logParsingService = loadLogParsingService({
    errorCodeCache: {
      findErrorCode: (subsystem, code, seriesId) => {
        calls.push({ subsystem, code, seriesId });
        return { explanation: `series-${seriesId}` };
      },
      loadAllErrorCodes: async () => {}
    }
  });

  const result = logParsingService.renderEntryExplanation({
    error_code: '10010A',
    series_id: 2,
    explanation: 'fallback'
  });

  assert.equal(result.explanation, 'series-2');
  assert.deepEqual(calls[0], { subsystem: '1', code: '0X010A', seriesId: 2 });
});
