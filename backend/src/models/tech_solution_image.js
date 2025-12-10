const { DataTypes } = require('sequelize');
const { sequelize } = require('./index');

const TechSolutionImage = sequelize.define('tech_solution_images', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  error_code_id: { type: DataTypes.INTEGER, allowNull: false },
  url: { type: DataTypes.TEXT, allowNull: false },
  storage: { type: DataTypes.ENUM('local', 'oss'), defaultValue: 'local' },
  filename: { type: DataTypes.STRING(255) },
  original_name: { type: DataTypes.STRING(255) },
  file_type: { type: DataTypes.STRING(50) },
  object_key: { type: DataTypes.STRING(512) },
  size_bytes: { type: DataTypes.INTEGER },
  mime_type: { type: DataTypes.STRING(100) },
  width: { type: DataTypes.INTEGER },
  height: { type: DataTypes.INTEGER },
  sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  timestamps: false
});

TechSolutionImage.sequelize = sequelize;

module.exports = TechSolutionImage;

