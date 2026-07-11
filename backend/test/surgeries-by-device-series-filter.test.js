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

function loadController(stubs) {
  const controllerPath = path.resolve(__dirname, '../src/controllers/surgeriesController.js');
  const devicePath = path.resolve(__dirname, '../src/models/device.js');
  const hospitalPath = path.resolve(__dirname, '../src/models/hospital_master.js');
  const surgeryPath = path.resolve(__dirname, '../src/models/surgery.js');
  const logPath = path.resolve(__dirname, '../src/models/log.js');
  const pendingPath = path.resolve(__dirname, '../src/models/surgeryExportPending.js');
  const metaPath = path.resolve(__dirname, '../src/models/surgeryAnalysisTaskMeta.js');
  const queuePath = path.resolve(__dirname, '../src/config/queue.js');
  const pgPath = path.resolve(__dirname, '../src/config/postgresql.js');

  delete require.cache[controllerPath];
  delete require.cache[pgPath];

  require.cache[devicePath] = { id: devicePath, filename: devicePath, loaded: true, exports: stubs.Device };
  require.cache[hospitalPath] = { id: hospitalPath, filename: hospitalPath, loaded: true, exports: stubs.HospitalMaster || {} };
  require.cache[surgeryPath] = { id: surgeryPath, filename: surgeryPath, loaded: true, exports: stubs.Surgery || {} };
  require.cache[logPath] = { id: logPath, filename: logPath, loaded: true, exports: stubs.Log || {} };
  require.cache[pendingPath] = { id: pendingPath, filename: pendingPath, loaded: true, exports: stubs.SurgeryExportPending || {} };
  require.cache[metaPath] = { id: metaPath, filename: metaPath, loaded: true, exports: stubs.SurgeryAnalysisTaskMeta || {} };
  require.cache[queuePath] = { id: queuePath, filename: queuePath, loaded: true, exports: { logProcessingQueue: {} } };
  require.cache[pgPath] = {
    id: pgPath,
    filename: pgPath,
    loaded: true,
    exports: { postgresqlSequelize: stubs.postgresqlSequelize }
  };

  return require(controllerPath);
}

test('listSurgeriesByDevice returns empty when series has no devices', async () => {
  const controller = loadController({
    Device: {
      findAll: async () => []
    },
    postgresqlSequelize: {
      query: async () => {
        throw new Error('should not query postgres when series has no devices');
      }
    }
  });

  const req = { query: { series_id: '2', page: '1', limit: '20' } };
  const res = createRes();
  await controller.listSurgeriesByDevice(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.device_groups, []);
  assert.equal(res.body.pagination.total, 0);
});

test('listSurgeriesByDevice rejects invalid series_id', async () => {
  const controller = loadController({
    Device: { findAll: async () => [] },
    postgresqlSequelize: { query: async () => [] }
  });
  const req = { query: { series_id: 'bad' } };
  const res = createRes();
  await controller.listSurgeriesByDevice(req, res);
  assert.equal(res.statusCode, 400);
});

test('listSurgeriesByDevice passes series device ids into postgres bind', async () => {
  const binds = [];
  const controller = loadController({
    Device: {
      findAll: async (options) => {
        if (options?.where?.series_id === 2) {
          return [{ device_id: 'A-1' }, { device_id: 'A-2' }];
        }
        if (options?.where?.device_id) {
          return [
            { device_id: 'A-1', device_model: 'M1', series_id: 2, HospitalMaster: { hospital_name_std: 'H1' } }
          ];
        }
        return [];
      }
    },
    postgresqlSequelize: {
      query: async (sql, options) => {
        if (String(sql).includes('information_schema')) {
          return [{ exists: false }];
        }
        binds.push(options.bind);
        return [{
          device_id: 'A-1',
          surgery_count: 3,
          latest_surgery_time: '2026-01-01',
          pending_confirm_count: 0,
          total_groups: 1
        }];
      }
    }
  });

  const req = { query: { series_id: '2', page: '1', limit: '20' } };
  const res = createRes();
  await controller.listSurgeriesByDevice(req, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(binds[0][0], ['A-1', 'A-2']);
  assert.equal(res.body.device_groups[0].device_id, 'A-1');
  assert.equal(res.body.device_groups[0].series_id, 2);
});
