const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

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

function loadMotionController(stubs) {
  const controllerPath = path.resolve(__dirname, '../src/controllers/motionDataController.js');
  delete require.cache[controllerPath];

  const originalLoad = Module._load;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (parent && path.resolve(parent.filename) === path.resolve(controllerPath)) {
      const map = {
        '../models': { sequelize: stubs.sequelize },
        '../config/queue': { motionDataQueue: { add: async () => ({ id: 1 }) } },
        '../services/websocketService': { pushMotionDataTaskStatus: () => {} },
        '../utils/operationLogger': { logOperation: async () => {} },
        '../models/motion_data_file': stubs.MotionDataFile || {},
        '../config/motionDataStorage': {
          buildRawObjectKey: () => 'raw',
          buildParsedObjectKey: () => 'parsed'
        },
        '../utils/deviceSeriesBinding': {
          ensureDeviceModelAndSeries: async () => ({ ok: true })
        }
      };
      if (Object.prototype.hasOwnProperty.call(map, request)) {
        return map[request];
      }
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    return require(controllerPath);
  } finally {
    Module._load = originalLoad;
  }
}

test('listMotionDataFilesByDevice filters by series_id', async () => {
  const queries = [];
  const controller = loadMotionController({
    sequelize: {
      QueryTypes: { SELECT: 'SELECT' },
      query: async (sql, options) => {
        queries.push({
          sql: String(sql),
          replacements: { ...(options?.replacements || {}) }
        });
        if (String(sql).includes('COUNT(*) AS total')) return [{ total: 1 }];
        return [{
          device_id: '4371-01',
          hospital_name: 'H1',
          series_id: 2,
          data_count: 3,
          latest_upload_time: '2026-01-01'
        }];
      }
    }
  });

  const req = { query: { series_id: '2', page: '1', limit: '20' } };
  const res = createRes();
  await controller.listMotionDataFilesByDevice(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(queries.length, 2);
  assert.equal(queries[0].replacements.seriesId, 2);
  assert.match(queries[0].sql, /INNER JOIN devices d/i);
  assert.match(queries[0].sql, /d\.series_id = :seriesId/);
  assert.equal(res.body.device_groups[0].series_id, 2);
  assert.equal(res.body.device_groups[0].device_id, '4371-01');
});

test('listMotionDataFilesByDevice rejects invalid series_id', async () => {
  const controller = loadMotionController({
    sequelize: {
      QueryTypes: { SELECT: 'SELECT' },
      query: async () => []
    }
  });
  const req = { query: { series_id: 'bad' } };
  const res = createRes();
  await controller.listMotionDataFilesByDevice(req, res);
  assert.equal(res.statusCode, 400);
});
