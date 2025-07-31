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
      if (!value) return null;
      try {
        return JSON.parse(value);
      } catch (error) {
        console.warn('解析操作日志 details 失败:', error.message);
        return { rawData: value };
      }
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