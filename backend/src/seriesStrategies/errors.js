function createSeriesFeatureUnsupportedError({ seriesCode, capability }) {
  const err = new Error('该系列目前无此功能');
  err.code = 'SERIES_FEATURE_UNSUPPORTED';
  err.statusCode = 403;
  err.seriesCode = seriesCode || null;
  err.capability = capability || null;
  return err;
}

function sendSeriesFeatureUnsupported(res, err) {
  const status = err.statusCode || 403;
  return res.status(status).json({
    message: err.message || '该系列目前无此功能',
    code: 'SERIES_FEATURE_UNSUPPORTED',
    capability: err.capability || null,
    series_code: err.seriesCode || null
  });
}

function isSeriesFeatureUnsupportedError(err) {
  return Boolean(err && err.code === 'SERIES_FEATURE_UNSUPPORTED');
}

module.exports = {
  createSeriesFeatureUnsupportedError,
  sendSeriesFeatureUnsupported,
  isSeriesFeatureUnsupportedError
};
