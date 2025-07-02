const ErrorCode = require('../models/error_code');

// 新增故障码
const createErrorCode = async (req, res) => {
  try {
    const data = req.body;
    const exist = await ErrorCode.findOne({ where: { code: data.code } });
    if (exist) return res.status(409).json({ message: '故障码已存在' });
    const errorCode = await ErrorCode.create(data);
    res.status(201).json({ message: '创建成功', errorCode });
  } catch (err) {
    res.status(500).json({ message: '创建失败', error: err.message });
  }
};

// 查询故障码（支持简单和高级搜索）
const getErrorCodes = async (req, res) => {
  try {
    const { code, subsystem, level, category, keyword } = req.query;
    const where = {};
    if (code) where.code = code;
    if (subsystem) where.subsystem = subsystem;
    if (level) where.level = level;
    if (category) where.category = category;
    if (keyword) {
      where[ErrorCode.sequelize.Op.or] = [
        { short_message: { [ErrorCode.sequelize.Op.like]: `%${keyword}%` } },
        { short_message_en: { [ErrorCode.sequelize.Op.like]: `%${keyword}%` } },
        { user_hint: { [ErrorCode.sequelize.Op.like]: `%${keyword}%` } },
        { user_hint_en: { [ErrorCode.sequelize.Op.like]: `%${keyword}%` } },
        { code: { [ErrorCode.sequelize.Op.like]: `%${keyword}%` } }
      ];
    }
    const errorCodes = await ErrorCode.findAll({ where });
    res.json({ errorCodes });
  } catch (err) {
    res.status(500).json({ message: '查询失败', error: err.message });
  }
};

// 更新故障码
const updateErrorCode = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const errorCode = await ErrorCode.findByPk(id);
    if (!errorCode) return res.status(404).json({ message: '未找到故障码' });
    await errorCode.update(data);
    res.json({ message: '更新成功', errorCode });
  } catch (err) {
    res.status(500).json({ message: '更新失败', error: err.message });
  }
};

// 删除故障码
const deleteErrorCode = async (req, res) => {
  try {
    const { id } = req.params;
    const errorCode = await ErrorCode.findByPk(id);
    if (!errorCode) return res.status(404).json({ message: '未找到故障码' });
    await errorCode.destroy();
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ message: '删除失败', error: err.message });
  }
};

module.exports = {
  createErrorCode,
  getErrorCodes,
  updateErrorCode,
  deleteErrorCode
}; 