const test = require('node:test');
const assert = require('node:assert/strict');

const {
  filterDeviceModelsBySeries,
  syncDeviceSeriesSelection,
  deriveSeriesIdForDeviceModel
} = require('../../frontend/src/utils/deviceModelSeries');

const models = [
  { id: 1, device_model: '4371', series_id: 11 },
  { id: 2, device_model: '4336', series_id: 11 },
  { id: 3, device_model: 'bk1', series_id: 22 }
];

test('filterDeviceModelsBySeries returns only matching series models', () => {
  const out = filterDeviceModelsBySeries(models, 11);
  assert.deepEqual(out.map(item => item.device_model), ['4371', '4336']);
});

test('deriveSeriesIdForDeviceModel infers series from selected model', () => {
  assert.equal(deriveSeriesIdForDeviceModel(models, 'bk1'), 22);
  assert.equal(deriveSeriesIdForDeviceModel(models, 'unknown'), null);
});

test('syncDeviceSeriesSelection clears model when it no longer belongs to selected series', () => {
  const out = syncDeviceSeriesSelection({
    selectedSeriesId: 22,
    deviceModel: '4371',
    models
  });

  assert.equal(out.device_series_id, 22);
  assert.equal(out.device_model, '');
});

test('syncDeviceSeriesSelection keeps model when it matches selected series', () => {
  const out = syncDeviceSeriesSelection({
    selectedSeriesId: 11,
    deviceModel: '4336',
    models
  });

  assert.equal(out.device_series_id, 11);
  assert.equal(out.device_model, '4336');
});
