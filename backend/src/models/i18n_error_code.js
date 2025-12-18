const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const I18nErrorCode = sequelize.define('i18n_error_codes', {
  id: { 
    type: DataTypes.INTEGER, 
    autoIncrement: true, 
    primaryKey: true 
  },
  error_code_id: { 
    type: DataTypes.INTEGER, 
    allowNull: false,
    references: {
      model: 'error_codes',
      key: 'id'
    }
  },
  lang: { 
    type: DataTypes.STRING(10), 
    allowNull: false 
  },
  // UI显示字段（由专业翻译团队管理，通过多语言管理模块导入）
  short_message: { 
    type: DataTypes.TEXT,
    comment: '精简提示信息（由多语言管理模块管理）'
  },
  user_hint: { 
    type: DataTypes.TEXT,
    comment: '用户提示信息（由多语言管理模块管理）'
  },
  operation: { 
    type: DataTypes.TEXT,
    comment: '操作信息（由多语言管理模块管理）'
  },
  // 技术说明字段（支持自动翻译+手动修改，在故障码管理模块中编辑）
  detail: {
    type: DataTypes.TEXT,
    comment: '详细信息'
  },
  method: {
    type: DataTypes.TEXT,
    comment: '方法信息'
  },
  param1: {
    type: DataTypes.STRING(100),
    comment: '故障日志记录的参数1'
  },
  param2: {
    type: DataTypes.STRING(100),
    comment: '故障日志记录的参数2'
  },
  param3: {
    type: DataTypes.STRING(100),
    comment: '故障日志记录的参数3'
  },
  param4: {
    type: DataTypes.STRING(100),
    comment: '故障日志记录的参数4'
  },
  tech_solution: {
    type: DataTypes.TEXT,
    comment: '技术解决方案'
  },
  explanation: {
    type: DataTypes.TEXT,
    comment: '说明信息'
  },
  // 注意：solution, level, category 字段不在 i18n_error_codes 表中
  // 这些字段的值是固定的枚举值，只存储在 error_codes 表中，通过前端 i18n 翻译显示
  created_at: { 
    type: DataTypes.DATE, 
    defaultValue: DataTypes.NOW 
  },
  updated_at: { 
    type: DataTypes.DATE, 
    defaultValue: DataTypes.NOW 
  }
}, {
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

I18nErrorCode.sequelize = sequelize;

module.exports = I18nErrorCode; 