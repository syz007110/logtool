const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

function loadI18nController(stubs) {
  const controllerPath = path.resolve(__dirname, '../src/controllers/i18nErrorCodeController.js');
  const i18nPath = path.resolve(__dirname, '../src/models/i18n_error_code.js');
  const errorCodePath = path.resolve(__dirname, '../src/models/error_code.js');
  const deviceSeriesPath = path.resolve(__dirname, '../src/models/device_series_dict.js');
  const modelsIndexPath = path.resolve(__dirname, '../src/models/index.js');
  const opLoggerPath = path.resolve(__dirname, '../src/utils/operationLogger.js');
  const cachePath = path.resolve(__dirname, '../src/services/errorCodeCache.js');
  const cacheSyncPath = path.resolve(__dirname, '../src/services/errorCodeCacheSyncService.js');
  const translationPath = path.resolve(__dirname, '../src/services/translationService.js');
  const paginationPath = path.resolve(__dirname, '../src/constants/pagination.js');
  const indexServicePath = path.resolve(__dirname, '../src/services/errorCodeIndexService.js');
  const languagePath = path.resolve(__dirname, '../src/config/i18nLanguages.js');

  delete require.cache[controllerPath];
  require.cache[i18nPath] = { exports: stubs.I18nErrorCode };
  require.cache[errorCodePath] = { exports: stubs.ErrorCode };
  require.cache[deviceSeriesPath] = { exports: stubs.DeviceSeriesDict };
  require.cache[modelsIndexPath] = { exports: { sequelize: stubs.sequelize || {} } };
  require.cache[opLoggerPath] = { exports: { logOperation: async () => {} } };
  require.cache[cachePath] = { exports: { reloadCache: async () => {} } };
  require.cache[cacheSyncPath] = { exports: { publishReload: async () => {} } };
  require.cache[translationPath] = { exports: { translateFields: async () => ({}) } };
  require.cache[paginationPath] = { exports: { normalizePagination: () => ({ page: 1, limit: 20 }), MAX_PAGE_SIZE: { STANDARD: 100 } } };
  require.cache[indexServicePath] = { exports: { indexErrorCodeToEs: async () => {}, deleteErrorCodeFromEs: async () => {} } };
  require.cache[languagePath] = { exports: { getPredefinedLanguages: () => ['zh', 'en'] } };

  return require(controllerPath);
}

function loadMirrorService(stubs) {
  const servicePath = path.resolve(__dirname, '../src/services/errorCodeMirrorSyncService.js');
  const errorCodePath = path.resolve(__dirname, '../src/models/error_code.js');
  const i18nPath = path.resolve(__dirname, '../src/models/i18n_error_code.js');

  delete require.cache[servicePath];
  require.cache[errorCodePath] = { exports: stubs.ErrorCode };
  require.cache[i18nPath] = { exports: stubs.I18nErrorCode };

  return require(servicePath);
}

test('upsertI18nErrorCode locates main error code by series_id + subsystem + code', async () => {
  let capturedWhere = null;
  const controller = loadI18nController({
    ErrorCode: {
      findOne: async ({ where }) => {
        capturedWhere = where;
        return { id: 12, code: '0X010A', series_id: 2 };
      }
    },
    I18nErrorCode: {
      findOne: async () => null,
      findAll: async () => [],
      create: async (payload) => payload
    },
    DeviceSeriesDict: {
      findByPk: async (id) => ({ id })
    }
  });

  const req = {
    body: {
      series_id: 2,
      subsystem: '1',
      code: '0X010A',
      lang: 'en',
      short_message: 's',
      user_hint: 'u',
      operation: ''
    },
    t: (key) => key,
    user: null
  };
  const res = createRes();

  await controller.upsertI18nErrorCode(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(capturedWhere, { series_id: 2, subsystem: '1', code: '0X010A' });
});

test('upsertI18nErrorCode rejects missing series_id when locating by subsystem and code', async () => {
  const controller = loadI18nController({
    ErrorCode: {},
    I18nErrorCode: {},
    DeviceSeriesDict: {
      findByPk: async () => null
    }
  });

  const req = {
    body: {
      subsystem: '1',
      code: '0X010A',
      lang: 'en',
      short_message: 's',
      user_hint: 'u',
      operation: ''
    },
    t: (key) => key,
    user: null
  };
  const res = createRes();

  await controller.upsertI18nErrorCode(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'series_id 必须为正整数');
});

test('syncMirrorErrorCodeBySourceId keeps mirror lookup inside same series', async () => {
  let capturedWhere = null;
  const service = loadMirrorService({
    ErrorCode: {
      findByPk: async () => ({
        id: 5,
        series_id: 3,
        subsystem: '1',
        code: '0X010A',
        is_axis_error: false,
        is_arm_error: false,
        solution: '',
        for_expert: '',
        for_novice: '',
        related_log: '',
        level: '',
        category: '',
      }),
      findOne: async ({ where }) => {
        capturedWhere = where;
        return {
          id: 6,
          update: async () => {}
        };
      }
    },
    I18nErrorCode: {
      findAll: async () => [],
      findOne: async () => null,
      create: async () => {}
    }
  });

  const result = await service.syncMirrorErrorCodeBySourceId({
    sourceErrorCodeId: 5,
    transaction: {}
  });

  assert.equal(result.synced, true);
  assert.deepEqual(capturedWhere, { series_id: 3, subsystem: '8', code: '0X010A' });
});

test('getSubsystems forwards series_id filter to ErrorCode distinct query', async () => {
  let capturedOptions = null;
  const controller = loadI18nController({
    ErrorCode: {
      findAll: async (options) => {
        capturedOptions = options;
        return [{ subsystem: '1' }];
      }
    },
    I18nErrorCode: {},
    DeviceSeriesDict: {
      findByPk: async (id) => ({ id })
    },
    sequelize: {
      fn: (...args) => ({ fnArgs: args }),
      col: (name) => ({ colName: name })
    }
  });

  const req = {
    query: { series_id: '2' },
    t: (key) => key
  };
  const res = createRes();

  await controller.getSubsystems(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(capturedOptions.where.series_id, 2);
});

test('getSubsystems rejects invalid series_id', async () => {
  const controller = loadI18nController({
    ErrorCode: {},
    I18nErrorCode: {},
    DeviceSeriesDict: {
      findByPk: async () => null
    },
    sequelize: {
      fn: (...args) => ({ fnArgs: args }),
      col: (name) => ({ colName: name })
    }
  });

  const req = {
    query: { series_id: 'bad' },
    t: (key) => key
  };
  const res = createRes();

  await controller.getSubsystems(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'series_id 必须为正整数');
});
