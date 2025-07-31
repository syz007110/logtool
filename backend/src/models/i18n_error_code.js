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
  short_message: { 
    type: DataTypes.TEXT 
  },
  user_hint: { 
    type: DataTypes.TEXT 
  },
  operation: { 
    type: DataTypes.TEXT 
  },
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