const { CAPABILITIES, ALL_CAPABILITIES } = require('./capabilities');
const { createSeriesFeatureUnsupportedError } = require('./errors');
const srMotionParseStrategy = require('./motion/srMotionParseStrategy');
const srSurgeryAnalyzeStrategy = require('./surgery/srSurgeryAnalyzeStrategy');

const REGISTRY = Object.freeze({
  SR: Object.freeze({
    [CAPABILITIES.MOTION_PARSE]: srMotionParseStrategy,
    [CAPABILITIES.SURGERY_ANALYZE]: srSurgeryAnalyzeStrategy
  })
});

function normalizeSeriesCode(seriesCode) {
  return String(seriesCode || '').trim().toUpperCase();
}

function resolve(seriesCode, capability) {
  const code = normalizeSeriesCode(seriesCode);
  const cap = String(capability || '').trim();
  const entry = REGISTRY[code];
  const strategy = entry && entry[cap] ? entry[cap] : null;
  if (strategy && strategy.supported) {
    return { supported: true, seriesCode: code, capability: cap, strategy };
  }
  return { supported: false, seriesCode: code, capability: cap, strategy: null };
}

function getCapabilities(seriesCode) {
  const out = {};
  for (const cap of ALL_CAPABILITIES) {
    out[cap] = resolve(seriesCode, cap).supported;
  }
  return out;
}

function assertSeriesCapability(seriesCode, capability) {
  const resolved = resolve(seriesCode, capability);
  if (!resolved.supported) {
    throw createSeriesFeatureUnsupportedError({
      seriesCode: resolved.seriesCode,
      capability: resolved.capability
    });
  }
  return resolved.strategy;
}

module.exports = {
  REGISTRY,
  normalizeSeriesCode,
  resolve,
  getCapabilities,
  assertSeriesCapability
};
