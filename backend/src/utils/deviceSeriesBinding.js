const Device = require('../models/device');
const DeviceModelDict = require('../models/device_model_dict');
const DeviceSeriesDict = require('../models/device_series_dict');

function parseSeriesId(value) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}

/**
 * Validate device_model_id against series and upsert
 * devices.series_id / device_model_id.
 * Used by log upload and motion-data upload so parsing can rely on devices.series_id.
 */
async function ensureDeviceModelAndSeries({
  deviceId,
  deviceModelId,
  seriesId,
  required = true
} = {}) {
  const normalizedDeviceId = String(deviceId || '').trim();
  if (!normalizedDeviceId || normalizedDeviceId === '0000-00') {
    return { ok: true, skipped: true };
  }

  const normalizedModelId = deviceModelId === undefined || deviceModelId === null || deviceModelId === ''
    ? null
    : Number(deviceModelId);
  const resolvedSeriesId = parseSeriesId(seriesId);

  if (normalizedModelId !== null && (!Number.isInteger(normalizedModelId) || normalizedModelId <= 0)) {
    const err = new Error('device_model_id 必须为正整数');
    err.statusCode = 400;
    throw err;
  }

  if (normalizedModelId === null) {
    if (!required) return { ok: true, skipped: true };
    const err = new Error('device_model_id 必填');
    err.statusCode = 400;
    throw err;
  }

  if (!resolvedSeriesId) {
    const err = new Error('series_id 必须为正整数');
    err.statusCode = 400;
    throw err;
  }

  const series = await DeviceSeriesDict.findByPk(resolvedSeriesId);
  if (!series) {
    const err = new Error('series_id 无效');
    err.statusCode = 400;
    throw err;
  }

  let matchedModel = null;
  if (normalizedModelId !== null) {
    matchedModel = typeof DeviceModelDict.findByPk === 'function'
      ? await DeviceModelDict.findByPk(normalizedModelId)
      : await DeviceModelDict.findOne({ where: { id: normalizedModelId } });
    if (!matchedModel) {
      const err = new Error('device_model_id 无效');
      err.statusCode = 400;
      throw err;
    }
    if (!matchedModel.is_active) {
      const err = new Error('所选设备型号已停用');
      err.statusCode = 400;
      throw err;
    }
    if (parseSeriesId(matchedModel.series_id) !== resolvedSeriesId) {
      const err = new Error('所选设备型号不属于当前设备系列');
      err.statusCode = 400;
      throw err;
    }
  }
  if (!matchedModel) {
    const err = new Error('所选设备型号不属于当前设备系列');
    err.statusCode = 400;
    throw err;
  }

  const resolvedModelName = String(matchedModel.device_model || '').trim();
  const resolvedModelId = Number(matchedModel.id);

  const existing = await Device.findOne({ where: { device_id: normalizedDeviceId } });
  if (existing) {
    const existingSeriesId = parseSeriesId(existing.series_id);
    if (existingSeriesId && existingSeriesId !== resolvedSeriesId) {
      const err = new Error(
        `设备 ${normalizedDeviceId} 已绑定系列 ${existingSeriesId}，与当前系列 ${resolvedSeriesId} 冲突`
      );
      err.statusCode = 409;
      throw err;
    }

    const updates = { updated_at: new Date() };
    if (!existingSeriesId) updates.series_id = resolvedSeriesId;
    if (Object.prototype.hasOwnProperty.call(existing, 'device_model_id') && Number(existing.device_model_id) !== resolvedModelId) {
      updates.device_model_id = resolvedModelId;
    }
    if (Object.keys(updates).length > 1) {
      await existing.update(updates);
    }
    return {
      ok: true,
      created: false,
      device: existing,
      series_id: parseSeriesId(existing.series_id) || resolvedSeriesId,
      device_model_id: resolvedModelId,
      device_model: resolvedModelName
    };
  }

  const created = await Device.create({
    device_id: normalizedDeviceId,
    series_id: resolvedSeriesId,
    device_model_id: resolvedModelId,
    device_key: null,
    created_at: new Date(),
    updated_at: new Date()
  });

  return {
    ok: true,
    created: true,
    device: created,
    series_id: resolvedSeriesId,
    device_model_id: resolvedModelId,
    device_model: resolvedModelName
  };
}

module.exports = {
  parseSeriesId,
  ensureDeviceModelAndSeries
};
