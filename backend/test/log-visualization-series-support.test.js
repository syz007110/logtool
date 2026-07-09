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

function loadLogController(stubs) {
  const controllerPath = path.resolve(__dirname, '../src/controllers/logController.js');
  const logPath = path.resolve(__dirname, '../src/models/log.js');
  const errorCodePath = path.resolve(__dirname, '../src/models/error_code.js');
  const analysisCategoryPath = path.resolve(__dirname, '../src/models/analysis_category.js');
  const modelsIndexPath = path.resolve(__dirname, '../src/models/index.js');
  const devicePath = path.resolve(__dirname, '../src/models/device.js');
  const hospitalPath = path.resolve(__dirname, '../src/models/hospital_master.js');
  const decryptPath = path.resolve(__dirname, '../src/utils/decryptUtils.js');
  const deviceKeyPath = path.resolve(__dirname, '../src/services/deviceKeyService.js');
  const timeExtractorPath = path.resolve(__dirname, '../src/utils/logTimeExtractor.js');
  const logParsingPath = path.resolve(__dirname, '../src/services/logParsingService.js');
  const queuePath = path.resolve(__dirname, '../src/config/queue.js');
  const queueManagerPath = path.resolve(__dirname, '../src/services/queueManager.js');
  const cachePath = path.resolve(__dirname, '../src/config/cache.js');
  const websocketPath = path.resolve(__dirname, '../src/services/websocketService.js');
  const errorCodeCachePath = path.resolve(__dirname, '../src/services/errorCodeCache.js');
  const batchInsertPath = path.resolve(__dirname, '../src/utils/batchInsertHelper.js');
  const clickhousePath = path.resolve(__dirname, '../src/config/clickhouse.js');
  const paginationPath = path.resolve(__dirname, '../src/constants/pagination.js');
  const advancedFiltersPath = path.resolve(__dirname, '../src/workers/batchAdvancedFilters.js');

  delete require.cache[controllerPath];
  require.cache[logPath] = { exports: stubs.Log };
  require.cache[errorCodePath] = { exports: stubs.ErrorCode };
  require.cache[analysisCategoryPath] = { exports: {} };
  require.cache[modelsIndexPath] = { exports: { sequelize: {}, Op: require('sequelize').Op } };
  require.cache[devicePath] = { exports: stubs.Device };
  require.cache[hospitalPath] = { exports: {} };
  require.cache[decryptPath] = { exports: { decryptLogContent: () => [] } };
  require.cache[deviceKeyPath] = { exports: { getKeyForDeviceAndDate: async () => null } };
  require.cache[timeExtractorPath] = { exports: { extractTimeFromFileName: () => null } };
  require.cache[logParsingPath] = { exports: { renderEntryExplanation: () => null, ensureCacheReady: async () => {} } };
  require.cache[queuePath] = { exports: { logProcessingQueue: {}, csvExportQueue: {}, realtimeProcessingQueue: {} } };
  require.cache[queueManagerPath] = { exports: {} };
  require.cache[cachePath] = { exports: { cacheManager: {} } };
  require.cache[websocketPath] = { exports: {} };
  require.cache[errorCodeCachePath] = { exports: {} };
  require.cache[batchInsertPath] = { exports: { batchInsertHelper: async () => ({}) } };
  require.cache[clickhousePath] = { exports: { getClickHouseClient: () => stubs.clickhouseClient } };
  require.cache[paginationPath] = { exports: { normalizePagination: () => ({ page: 1, limit: 20 }), MAX_PAGE_SIZE: 1000 } };
  require.cache[advancedFiltersPath] = { exports: { parseAdvancedFilterPayload: () => null, buildAdvancedFilterExpression: () => '' } };

  return require(controllerPath);
}

test('getVisualizationData uses device series when loading parameter meanings', async () => {
  let capturedWhere = null;
  let queryCount = 0;
  const clickhouseClient = {
    query: async () => ({
      json: async () => {
        queryCount += 1;
        if (queryCount === 1) {
          return [{ startTime: '2026-01-01 00:00:00', endTime: '2026-01-01 00:10:00' }];
        }
        return [{ timestamp: '2026-01-01 00:00:01', param_value: '12' }];
      }
    })
  };

  const controller = loadLogController({
    Log: {
      findAll: async () => [{ id: 1, version: 2, device_id: 'DEV-1' }]
    },
    Device: {
      findAll: async () => [{ device_id: 'DEV-1', series_id: 3 }]
    },
    ErrorCode: {
      findOne: async ({ where }) => {
        capturedWhere = where;
        return { param1: '扭矩' };
      }
    },
    clickhouseClient
  });

  const req = {
    query: {
      log_ids: '1',
      error_code: '1010A',
      parameter_index: '1',
      subsystem: '1'
    },
    t: (key) => key,
    user: { role_id: 1, id: 7 }
  };
  const res = createRes();

  await controller.getVisualizationData(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(capturedWhere, { code: '0X010A', subsystem: '1', series_id: 3 });
  assert.equal(res.body.data.paramName, '扭矩');
});
