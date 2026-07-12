const { getCapabilities } = require('./registry');

function attachCapabilitiesToSeriesRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const plain = typeof row.toJSON === 'function' ? row.toJSON() : { ...row };
    return {
      ...plain,
      capabilities: getCapabilities(plain.series_code)
    };
  });
}

module.exports = { attachCapabilitiesToSeriesRows };
