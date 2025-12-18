const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const FeedbackImage = sequelize.define('feedback_images', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  feedback_id: { type: DataTypes.INTEGER, allowNull: false },
  url: { type: DataTypes.STRING(255), allowNull: false },
  storage_key: { type: DataTypes.STRING(255), allowNull: true },
  width: { type: DataTypes.INTEGER, allowNull: true },
  height: { type: DataTypes.INTEGER, allowNull: true },
  size_bytes: { type: DataTypes.INTEGER, allowNull: true },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  timestamps: false
});

module.exports = FeedbackImage;

