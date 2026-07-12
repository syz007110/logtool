const Device = require('../models/device');
const DeviceSeriesDict = require('../models/device_series_dict');
const { normalizeSeriesCode } = require('./registry');

function parsePositiveInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function resolveSeriesCodeFromId(seriesId) {
  const id = parsePositiveInt(seriesId);
  if (!id) return null;
  const row = await DeviceSeriesDict.findByPk(id, { attributes: ['id', 'series_code'] });
  return row ? normalizeSeriesCode(row.series_code) : null;
}

async function resolveSeriesCodeFromDeviceId(deviceId) {
  const id = String(deviceId || '').trim();
  if (!id) return null;
  const device = await Device.findOne({
    where: { device_id: id },
    attributes: ['device_id', 'series_id']
  });
  if (!device || !device.series_id) return null;
  return resolveSeriesCodeFromId(device.series_id);
}

/**
 * Prefer explicit seriesId; else deviceId → devices.series_id.
 * Throws Error with statusCode 400 when unresolved (do not fall back to SR).
 */
async function resolveSeriesCodeForRequest({ seriesId, deviceId } = {}) {
  const fromSeries = await resolveSeriesCodeFromId(seriesId);
  if (fromSeries) return fromSeries;
  const fromDevice = await resolveSeriesCodeFromDeviceId(deviceId);
  if (fromDevice) return fromDevice;
  const err = new Error('无法解析设备系列，请选择系列或绑定设备系列');
  err.statusCode = 400;
  err.code = 'SERIES_CONTEXT_REQUIRED';
  throw err;
}

module.exports = {
  parsePositiveInt,
  resolveSeriesCodeFromId,
  resolveSeriesCodeFromDeviceId,
  resolveSeriesCodeForRequest
};
