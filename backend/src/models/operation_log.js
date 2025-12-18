const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const OperationLog = sequelize.define('operation_logs', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  operation: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.TEXT },
  user_id: { type: DataTypes.INTEGER },
  username: { type: DataTypes.STRING(100) },
  time: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  status: { type: DataTypes.STRING(50), defaultValue: 'success' },
  ip: { type: DataTypes.STRING(50) },
  user_agent: { type: DataTypes.STRING(255) },
  details: { 
    type: DataTypes.TEXT,
    get() {
      const value = this.getDataValue('details');
      if (value === null || value === undefined) return null;
      if (typeof value === 'object') return value;
      if (typeof value === 'string') {
        const s = value.trim();
        const looksJson = (s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'));
        if (looksJson) {
          try {
            return JSON.parse(s);
          } catch (_) {
            // 解析失败则回退为原始字符串包装
            return { rawData: s };
          }
        }
        // 非 JSON 字符串，直接返回包装，避免告警噪音
        return { rawData: s };
      }
      return value;
    },
    set(value) {
      if (value === null || value === undefined) {
        this.setDataValue('details', null);
      } else {
        this.setDataValue('details', JSON.stringify(value));
      }
    }
  }
}, {
  timestamps: false
});

module.exports = OperationLog; 