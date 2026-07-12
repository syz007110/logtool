const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { attachCapabilitiesToSeriesRows } = require('../src/seriesStrategies/attachCapabilities');

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

function stubModule(modulePath, exports) {
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports
  };
}

function loadSurgeryStatisticsController(stubs) {
  const controllerPath = path.resolve(__dirname, '../src/controllers/surgeryStatisticsController.js');
  const logPath = path.resolve(__dirname, '../src/models/log.js');
  const surgeryPath = path.resolve(__dirname, '../src/models/surgery.js');
  const pendingPath = path.resolve(__dirname, '../src/models/surgeryExportPending.js');
  const metaPath = path.resolve(__dirname, '../src/models/surgeryAnalysisTaskMeta.js');
  const analyzerPath = path.resolve(__dirname, '../src/services/surgeryAnalyzer.js');
  const permissionPath = path.resolve(__dirname, '../src/middlewares/permission.js');
  const queuePath = path.resolve(__dirname, '../src/config/queue.js');
  const devicePath = path.resolve(__dirname, '../src/models/device.js');
  const seriesPath = path.resolve(__dirname, '../src/models/device_series_dict.js');
  const resolverPath = path.resolve(__dirname, '../src/seriesStrategies/resolveSeriesCode.js');

  [
    controllerPath,
    logPath,
    surgeryPath,
    pendingPath,
    metaPath,
    analyzerPath,
    permissionPath,
    queuePath,
    devicePath,
    seriesPath,
    resolverPath
  ].forEach((modulePath) => {
    delete require.cache[modulePath];
  });

  stubModule(logPath, stubs.Log);
  stubModule(surgeryPath, {});
  stubModule(pendingPath, {});
  stubModule(metaPath, {});
  stubModule(permissionPath, { userHasDbPermission: async () => false });
  stubModule(queuePath, { surgeryAnalysisQueue: {} });
  stubModule(devicePath, stubs.Device);
  stubModule(seriesPath, stubs.DeviceSeriesDict);
  stubModule(analyzerPath, class SurgeryAnalyzer {
    analyze() {
      return [];
    }

    toPostgreSQLStructure() {
      return {};
    }
  });

  return require(controllerPath);
}

test('attachCapabilitiesToSeriesRows adds SR flags', () => {
  const out = attachCapabilitiesToSeriesRows([
    { id: 1, series_code: 'SR', series_name_zh: 'SR' },
    { id: 2, series_code: 'SA', series_name_zh: 'SA' }
  ]);
  assert.equal(out[0].capabilities.motion_parse, true);
  assert.equal(out[0].capabilities.surgery_analyze, true);
  assert.equal(out[1].capabilities.motion_parse, false);
  assert.equal(out[1].capabilities.surgery_analyze, false);
});

test('sorted surgery analysis prefers log device series over request series_id', async () => {
  const controller = loadSurgeryStatisticsController({
    Log: {
      findByPk: async (id) => (Number(id) === 10 ? { id: 10, device_id: 'DEV-SA' } : null),
      findAll: async () => []
    },
    Device: {
      findOne: async ({ where }) => (
        where?.device_id === 'DEV-SA'
          ? { device_id: 'DEV-SA', series_id: 1 }
          : null
      )
    },
    DeviceSeriesDict: {
      findByPk: async (id) => {
        if (Number(id) === 1) return { id: 1, series_code: 'SA' };
        if (Number(id) === 2) return { id: 2, series_code: 'SR' };
        return null;
      }
    }
  });

  const req = {
    body: {
      series_id: 2,
      logEntries: [{
        id: 1,
        log_id: 10,
        timestamp: '2026-01-01 00:00:00',
        error_code: '0',
        param1: '0',
        param2: '0',
        param3: '0',
        param4: '0'
      }]
    }
  };
  const res = createRes();

  await controller.analyzeSortedLogEntries(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body?.code, 'SERIES_FEATURE_UNSUPPORTED');
  assert.equal(res.body?.series_code, 'SA');
});
