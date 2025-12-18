const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const ErrorCodeAnalysisCategory = sequelize.define('error_code_analysis_categories', {
  error_code_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    primaryKey: true,
    comment: '故障码ID'
  },
  analysis_category_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    primaryKey: true,
    comment: '分析分类ID'
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

ErrorCodeAnalysisCategory.sequelize = sequelize;

module.exports = ErrorCodeAnalysisCategory;

