const CAPABILITIES = Object.freeze({
  MOTION_PARSE: 'motion_parse',
  SURGERY_ANALYZE: 'surgery_analyze'
});

const ALL_CAPABILITIES = Object.freeze([
  CAPABILITIES.MOTION_PARSE,
  CAPABILITIES.SURGERY_ANALYZE
]);

module.exports = { CAPABILITIES, ALL_CAPABILITIES };
