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

function loadDeviceModelController(stubs) {
  const controllerPath = path.resolve(__dirname, '../src/controllers/deviceModelController.js');
  const modelPath = path.resolve(__dirname, '../src/models/device_model_dict.js');
  const devicePath = path.resolve(__dirname, '../src/models/device.js');
  const seriesPath = path.resolve(__dirname, '../src/models/device_series_dict.js');

  delete require.cache[controllerPath];
  require.cache[modelPath] = { exports: stubs.DeviceModelDict };
  require.cache[devicePath] = { exports: stubs.Device };
  require.cache[seriesPath] = { exports: stubs.DeviceSeriesDict };

  return require(controllerPath);
}

function loadDeviceController(stubs) {
  const controllerPath = path.resolve(__dirname, '../src/controllers/deviceController.js');
  const devicePath = path.resolve(__dirname, '../src/models/device.js');
  const deviceKeyPath = path.resolve(__dirname, '../src/models/deviceKey.js');
  const logPath = path.resolve(__dirname, '../src/models/log.js');
  const hospitalPath = path.resolve(__dirname, '../src/models/hospital_master.js');
  const modelDictPath = path.resolve(__dirname, '../src/models/device_model_dict.js');
  const geoRegionPath = path.resolve(__dirname, '../src/models/geo_region.js');
  const loggerPath = path.resolve(__dirname, '../src/utils/operationLogger.js');
  const keyServicePath = path.resolve(__dirname, '../src/services/deviceKeyService.js');

  delete require.cache[controllerPath];
  require.cache[devicePath] = { exports: stubs.Device };
  require.cache[deviceKeyPath] = { exports: stubs.DeviceKey || {} };
  require.cache[logPath] = { exports: stubs.Log || {} };
  require.cache[hospitalPath] = { exports: stubs.HospitalMaster };
  require.cache[modelDictPath] = { exports: stubs.DeviceModelDict };
  require.cache[geoRegionPath] = { exports: stubs.GeoRegion || {} };
  require.cache[loggerPath] = { exports: { logOperation: async () => {} } };
  require.cache[keyServicePath] = {
    exports: {
      getDeviceKeys: async () => [],
      addDeviceKey: async () => ({}),
      updateDeviceKey: async () => ({}),
      deleteDeviceKey: async () => {}
    }
  };

  return require(controllerPath);
}

test('listDeviceModels forwards series_id filter to query', async () => {
  let capturedWhere = null;
  const controller = loadDeviceModelController({
    DeviceModelDict: {
      findAndCountAll: async (options) => {
        capturedWhere = options.where;
        return { count: 0, rows: [] };
      }
    },
    Device: {},
    DeviceSeriesDict: {}
  });

  const req = { query: { series_id: '22', page: '1', limit: '20' } };
  const res = createRes();

  await controller.listDeviceModels(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(capturedWhere.series_id, 22);
});

test('listDevices rejects invalid series_id', async () => {
  const controller = loadDeviceController({
    Device: {},
    HospitalMaster: {},
    DeviceModelDict: {}
  });

  const req = { query: { series_id: 'bad' }, t: (key) => key };
  const res = createRes();

  await controller.listDevices(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(String(res.body?.message || ''), /series_id/i);
});

test('createDevice rejects mismatched series_id and device_model', async () => {
  const controller = loadDeviceController({
    Device: {
      findOne: async ({ where }) => {
        if (where?.device_id === 'AA-01') return null;
        return null;
      },
      rawAttributes: {},
      create: async () => ({ id: 1 })
    },
    HospitalMaster: {},
    DeviceModelDict: {
      findOne: async ({ where }) => (
        where?.device_model === '4371' && where?.series_id === 2
          ? null
          : { id: 11, device_model: '4371', series_id: 1 }
      )
    }
  });

  const req = {
    body: { device_id: 'AA-01', device_model: '4371', series_id: 2 },
    t: (key) => key,
    user: null,
    ip: '',
    headers: {}
  };
  const res = createRes();

  await controller.createDevice(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(String(res.body?.message || ''), /设备系列|series_id/i);
});

test('updateDevice rejects mismatched series_id and effective device_model', async () => {
  const controller = loadDeviceController({
    Device: {
      findByPk: async () => ({
        id: 1,
        device_id: 'AA-01',
        device_model: '4371',
        device_key: '',
        hospital_id: null,
        save: async () => {}
      }),
      findOne: async ({ where }) => {
        if (where?.device_id) return null;
        return null;
      }
    },
    HospitalMaster: {},
    DeviceModelDict: {
      findOne: async ({ where }) => (
        where?.device_model === '4371' && where?.series_id === 2
          ? null
          : { id: 11, device_model: '4371', series_id: 1 }
      )
    }
  });

  const req = {
    params: { id: '1' },
    body: { series_id: 2 },
    t: (key) => key,
    user: null,
    ip: '',
    headers: {}
  };
  const res = createRes();

  await controller.updateDevice(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(String(res.body?.message || ''), /设备系列|series_id/i);
});

test('createDevice persists series_id when provided', async () => {
  let createdPayload = null;
  const controller = loadDeviceController({
    Device: {
      findOne: async () => null,
      rawAttributes: { hospital_code: {} },
      create: async (payload) => {
        createdPayload = payload;
        return { id: 1, ...payload };
      }
    },
    HospitalMaster: {},
    DeviceModelDict: {
      findOne: async () => ({ id: 11, device_model: '4371', series_id: 2 })
    }
  });

  const req = {
    body: { device_id: 'AA-01', device_model: '4371', series_id: 2 },
    t: (key) => key,
    user: null,
    ip: '',
    headers: {}
  };
  const res = createRes();

  await controller.createDevice(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(createdPayload.series_id, 2);
});

test('updateDevice persists series_id when provided', async () => {
  const deviceRecord = {
    id: 1,
    device_id: 'AA-01',
    device_model: '4371',
    device_key: '',
    hospital_id: null,
    series_id: null,
    save: async function save() {
      return this;
    }
  };
  const controller = loadDeviceController({
    Device: {
      findByPk: async () => deviceRecord,
      findOne: async () => null
    },
    HospitalMaster: {},
    DeviceModelDict: {
      findOne: async () => ({ id: 11, device_model: '4371', series_id: 2 })
    }
  });

  const req = {
    params: { id: '1' },
    body: { series_id: 2 },
    t: (key) => key,
    user: null,
    ip: '',
    headers: {}
  };
  const res = createRes();

  await controller.updateDevice(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(deviceRecord.series_id, 2);
});
