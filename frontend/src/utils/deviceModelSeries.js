function normalizeSeriesId (seriesId) {
  const num = Number(seriesId)
  return Number.isInteger(num) && num > 0 ? num : null
}

function filterDeviceModelsBySeries (models = [], seriesId) {
  const normalizedSeriesId = normalizeSeriesId(seriesId)
  if (!normalizedSeriesId) return Array.isArray(models) ? models : []
  return (Array.isArray(models) ? models : []).filter(item => normalizeSeriesId(item?.series_id) === normalizedSeriesId)
}

function deriveSeriesIdForDeviceModel (models = [], deviceModel = '') {
  const target = String(deviceModel || '').trim()
  if (!target) return null
  const match = (Array.isArray(models) ? models : []).find(item => String(item?.device_model || '').trim() === target)
  return normalizeSeriesId(match?.series_id)
}

function syncDeviceSeriesSelection ({ selectedSeriesId, deviceModel, models = [] }) {
  const normalizedSeriesId = normalizeSeriesId(selectedSeriesId)
  const normalizedModel = String(deviceModel || '').trim()
  if (!normalizedSeriesId) {
    return {
      device_series_id: null,
      device_model: normalizedModel
    }
  }

  const match = (Array.isArray(models) ? models : []).find(item => String(item?.device_model || '').trim() === normalizedModel)
  const matchedSeriesId = normalizeSeriesId(match?.series_id)

  return {
    device_series_id: normalizedSeriesId,
    device_model: matchedSeriesId === normalizedSeriesId ? normalizedModel : ''
  }
}

module.exports = {
  filterDeviceModelsBySeries,
  deriveSeriesIdForDeviceModel,
  syncDeviceSeriesSelection
}
