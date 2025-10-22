const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const AnalysisCategory = sequelize.define('analysis_categories', {
  id: { 
    type: DataTypes.INTEGER, 
    autoIncrement: true, 
    primaryKey: true 
  },
  category_key: { 
    type: DataTypes.STRING(100), 
    allowNull: false,
    unique: true,
    comment: '分类唯一标识，如 Devices, IO_Signals 等'
  },
  name_zh: { 
    type: DataTypes.STRING(100), 
    allowNull: false,
    comment: '中文名称'
  },
  name_en: { 
    type: DataTypes.STRING(100), 
    allowNull: false,
    comment: '英文名称'
  },
  sort_order: { 
    type: DataTypes.INTEGER, 
    defaultValue: 0,
    comment: '排序顺序'
  },
  is_active: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: true,
    comment: '是否启用'
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

AnalysisCategory.sequelize = sequelize;

module.exports = AnalysisCategory;

