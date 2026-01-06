const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

// 故障案例模块映射（1对多）
// 表：fault_case_module_mappings
const FaultCaseModuleMapping = sequelize.define('fault_case_module_mappings', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  module_id: { type: DataTypes.INTEGER, allowNull: false },
  source_field: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'default' },
  source_value: { type: DataTypes.STRING(100), allowNull: false },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = FaultCaseModuleMapping;


