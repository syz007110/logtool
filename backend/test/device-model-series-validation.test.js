const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadControllerWithStubs(stubs) {
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

test('createDeviceModel rejects empty series_id', async () => {
  const controller = loadControllerWithStubs({
    DeviceModelDict: {
      findOne: async () => null,
      create: async () => ({ id: 1 })
    },
    Device: {},
    DeviceSeriesDict: {
      findByPk: async () => null
    }
  });

  const req = {
    body: { device_model: '4371' },
    t: (key) => key
  };
  const res = createRes();

  await controller.createDeviceModel(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(String(res.body?.message || ''), /series_id/i);
});

test('updateDeviceModel rejects invalid series_id', async () => {
  const controller = loadControllerWithStubs({
    DeviceModelDict: {
      findByPk: async () => ({
        id: 1,
        device_model: '4371',
        is_active: true,
        series_id: 1,
        save: async () => {}
      }),
      findOne: async () => null
    },
    Device: {},
    DeviceSeriesDict: {
      findByPk: async () => null
    }
  });

  const req = {
    params: { id: '1' },
    body: { series_id: 999 },
    t: (key) => key
  };
  const res = createRes();

  await controller.updateDeviceModel(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(String(res.body?.message || ''), /series_id/i);
});

test('createDeviceModel rejects duplicate device_model within same series', async () => {
  const controller = loadControllerWithStubs({
    DeviceModelDict: {
      findOne: async ({ where }) => (
        where?.series_id === 2 && where?.device_model === '4371'
          ? { id: 9, series_id: 2, device_model: '4371' }
          : null
      ),
      create: async () => ({ id: 1 })
    },
    Device: {},
    DeviceSeriesDict: {
      findByPk: async () => ({ id: 2 })
    }
  });

  const req = {
    body: { device_model: '4371', series_id: 2 },
    t: (key) => key
  };
  const res = createRes();

  await controller.createDeviceModel(req, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body?.message, '该系列下设备型号已存在');
});

test('updateDeviceModel rejects duplicate device_model within target series excluding self', async () => {
  const controller = loadControllerWithStubs({
    DeviceModelDict: {
      findByPk: async (id) => {
        if (String(id) === '1') {
          return {
            id: 1,
            device_model: '4371',
            is_active: true,
            series_id: 1,
            save: async () => {}
          };
        }
        return null;
      },
      findOne: async ({ where }) => (
        where?.series_id === 2 && where?.device_model === '4371'
          ? { id: 9, series_id: 2, device_model: '4371' }
          : null
      )
    },
    Device: {},
    DeviceSeriesDict: {
      findByPk: async () => ({ id: 2 })
    }
  });

  const req = {
    params: { id: '1' },
    body: { series_id: 2, device_model: '4371' },
    t: (key) => key
  };
  const res = createRes();

  await controller.updateDeviceModel(req, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body?.message, '该系列下设备型号已存在');
});

test('deleteDeviceModel checks device usage by series_id and device_model', async () => {
  let capturedWhere = null;
  let destroyed = false;
  const controller = loadControllerWithStubs({
    DeviceModelDict: {
      findByPk: async () => ({
        id: 1,
        device_model: '4371',
        series_id: 2,
        destroy: async () => {
          destroyed = true;
        }
      })
    },
    Device: {
      rawAttributes: { series_id: {} },
      count: async ({ where }) => {
        capturedWhere = where;
        return 0;
      }
    },
    DeviceSeriesDict: {}
  });

  const req = {
    params: { id: '1' },
    t: (key) => key
  };
  const res = createRes();

  await controller.deleteDeviceModel(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(capturedWhere, { device_model: '4371', series_id: 2 });
  assert.equal(destroyed, true);
});
