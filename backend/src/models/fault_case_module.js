const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

// 故障案例模块字典表
// 表：fault_case_modules
const FaultCaseModule = sequelize.define('fault_case_modules', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  module_key: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  name_zh: { type: DataTypes.STRING(100), allowNull: false },
  name_en: { type: DataTypes.STRING(120), allowNull: false },
  description: { type: DataTypes.STRING(255), allowNull: true },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = FaultCaseModule;


