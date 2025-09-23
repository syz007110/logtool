const { parseExplanation: legacyParseExplanation, buildPrefixFromContext } = require('./explanationParser');

// 兼容层：提供与 optimizedExplanationParser 相同的接口
const optimizedExplanationParser = {
  async initialize() {
    // 目前无需额外初始化，保留接口以兼容调用方
    return;
  },

  /**
   * 解析释义（兼容新接口：params 为数组）
   * @param {string} template
   * @param {Array} params [p1, p2, p3, p4]
   * @param {Object} context
   */
  parseExplanation(template, params = [], context = null) {
    const [p1, p2, p3, p4] = params;
    return legacyParseExplanation(template, p1, p2, p3, p4, context);
  },

  buildPrefixFromContext
};

module.exports = { optimizedExplanationParser };


