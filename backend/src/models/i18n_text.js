const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const I18nText = sequelize.define('i18n_texts', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  key_name: { type: DataTypes.STRING(100), allowNull: false },
  lang: { type: DataTypes.STRING(10), allowNull: false },
  text: { type: DataTypes.TEXT },
}, {
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['key_name', 'lang']
    }
  ]
});

module.exports = I18nText; 