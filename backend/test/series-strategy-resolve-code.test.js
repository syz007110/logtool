const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadResolver(stubs) {
  const resolverPath = path.resolve(__dirname, '../src/seriesStrategies/resolveSeriesCode.js');
  const devicePath = path.resolve(__dirname, '../src/models/device.js');
  const seriesPath = path.resolve(__dirname, '../src/models/device_series_dict.js');
  delete require.cache[resolverPath];
  require.cache[devicePath] = { exports: stubs.Device };
  require.cache[seriesPath] = { exports: stubs.DeviceSeriesDict };
  return require(resolverPath);
}

test('resolveSeriesCodeFromId returns series_code', async () => {
  const { resolveSeriesCodeFromId } = loadResolver({
    Device: {},
    DeviceSeriesDict: {
      findByPk: async (id) => (id === 2 ? { id: 2, series_code: 'SR' } : null)
    }
  });
  assert.equal(await resolveSeriesCodeFromId(2), 'SR');
});

test('resolveSeriesCodeFromDeviceId uses devices.series_id', async () => {
  const { resolveSeriesCodeFromDeviceId } = loadResolver({
    Device: {
      findOne: async () => ({ device_id: '4371-01', series_id: 2 })
    },
    DeviceSeriesDict: {
      findByPk: async () => ({ id: 2, series_code: 'sr' })
    }
  });
  assert.equal(await resolveSeriesCodeFromDeviceId('4371-01'), 'SR');
});

test('resolveSeriesCodeForRequest prefers seriesId over deviceId', async () => {
  const { resolveSeriesCodeForRequest } = loadResolver({
    Device: {
      findOne: async () => ({ device_id: 'x', series_id: 1 })
    },
    DeviceSeriesDict: {
      findByPk: async (id) => {
        if (id === 2) return { id: 2, series_code: 'SR' };
        if (id === 1) return { id: 1, series_code: 'SA' };
        return null;
      }
    }
  });
  assert.equal(
    await resolveSeriesCodeForRequest({ seriesId: 2, deviceId: 'x' }),
    'SR'
  );
});

test('resolveSeriesCodeForRequest throws when series cannot be resolved', async () => {
  const { resolveSeriesCodeForRequest } = loadResolver({
    Device: { findOne: async () => null },
    DeviceSeriesDict: { findByPk: async () => null }
  });
  await assert.rejects(
    () => resolveSeriesCodeForRequest({ seriesId: null, deviceId: 'missing' }),
    /系列/
  );
});
