const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadHelper(stubs) {
  const helperPath = path.resolve(__dirname, '../src/utils/deviceSeriesBinding.js');
  const devicePath = path.resolve(__dirname, '../src/models/device.js');
  const modelPath = path.resolve(__dirname, '../src/models/device_model_dict.js');
  const seriesPath = path.resolve(__dirname, '../src/models/device_series_dict.js');

  delete require.cache[helperPath];
  require.cache[devicePath] = { exports: stubs.Device };
  require.cache[modelPath] = { exports: stubs.DeviceModelDict };
  require.cache[seriesPath] = { exports: stubs.DeviceSeriesDict };

  return require(helperPath);
}

test('ensureDeviceModelAndSeries rejects missing device_model when required', async () => {
  const helper = loadHelper({
    Device: {},
    DeviceModelDict: {},
    DeviceSeriesDict: { findByPk: async () => ({ id: 2 }) }
  });

  await assert.rejects(
    () => helper.ensureDeviceModelAndSeries({
      deviceId: '4371-01',
      deviceModel: '',
      seriesId: 2,
      required: true
    }),
    /device_model/
  );
});

test('ensureDeviceModelAndSeries creates device with series and model', async () => {
  let created = null;
  const helper = loadHelper({
    Device: {
      findOne: async () => null,
      create: async (payload) => {
        created = payload;
        return payload;
      }
    },
    DeviceModelDict: {
      findOne: async () => ({ id: 9, device_model: '4371', series_id: 2, is_active: true })
    },
    DeviceSeriesDict: {
      findByPk: async () => ({ id: 2 })
    }
  });

  const out = await helper.ensureDeviceModelAndSeries({
    deviceId: '4371-01',
    deviceModel: '4371',
    seriesId: '2',
    required: true
  });

  assert.equal(out.created, true);
  assert.equal(created.device_id, '4371-01');
  assert.equal(created.device_model, '4371');
  assert.equal(created.series_id, 2);
});

test('ensureDeviceModelAndSeries rejects series conflict on existing device', async () => {
  const helper = loadHelper({
    Device: {
      findOne: async () => ({
        device_id: '4371-01',
        series_id: 1,
        device_model: 'old',
        update: async () => {}
      })
    },
    DeviceModelDict: {
      findOne: async () => ({ id: 9, device_model: '4371', series_id: 2, is_active: true })
    },
    DeviceSeriesDict: {
      findByPk: async () => ({ id: 2 })
    }
  });

  await assert.rejects(
    () => helper.ensureDeviceModelAndSeries({
      deviceId: '4371-01',
      deviceModel: '4371',
      seriesId: 2,
      required: true
    }),
    /冲突/
  );
});
