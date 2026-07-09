const { Op } = require('sequelize');
const DeviceSeriesDict = require('../models/device_series_dict');

const listDeviceSeries = async (req, res) => {
  try {
    const { search = '', includeInactive = 'false' } = req.query;
    const where = {};

    if (String(includeInactive).toLowerCase() !== 'true') {
      where.is_active = true;
    }

    if (search) {
      where[Op.or] = [
        { series_code: { [Op.like]: `%${search}%` } },
        { series_name_zh: { [Op.like]: `%${search}%` } },
        { series_name_en: { [Op.like]: `%${search}%` } }
      ];
    }

    const rows = await DeviceSeriesDict.findAll({
      where,
      order: [['sort_order', 'ASC'], ['id', 'ASC']]
    });

    return res.json({ series: rows });
  } catch (e) {
    return res.status(500).json({ message: '获取设备系列列表失败', error: e.message });
  }
};

module.exports = {
  listDeviceSeries
};
