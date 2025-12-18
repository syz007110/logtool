const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const Feedback = sequelize.define('feedbacks', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: true },
  title: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.STRING(500), allowNull: false },
  status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'open' },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  timestamps: false
});

module.exports = Feedback;

