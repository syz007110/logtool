const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const Role = sequelize.define('roles', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  description: { type: DataTypes.STRING(255) }
}, {
  timestamps: false
});

module.exports = Role; 