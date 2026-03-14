const { Op } = require('sequelize');
const GeoCountry = require('../models/geo_country');
const GeoRegion = require('../models/geo_region');

const listCountries = async (req, res) => {
  try {
    const { includeInactive = 'false', search = '' } = req.query;
    const where = {};
    if (String(includeInactive).toLowerCase() !== 'true') {
      where.status = true;
    }
    if (search) {
      const like = { [Op.like]: `%${search}%` };
      where[Op.or] = [
        { country_code: like },
        { country_name: like },
        { country_name_en: like }
      ];
    }

    const countries = await GeoCountry.findAll({
      where,
      order: [['country_name', 'ASC']]
    });
    res.json({ countries });
  } catch (error) {
    res.status(500).json({ message: '获取国家字典失败', error: error.message });
  }
};

const listRegions = async (req, res) => {
  try {
    const { includeInactive = 'false', country_code, search = '' } = req.query;
    const where = {};
    if (String(includeInactive).toLowerCase() !== 'true') {
      where.status = true;
    }
    if (country_code) {
      where.country_code = String(country_code).trim();
    }
    if (search) {
      const like = { [Op.like]: `%${search}%` };
      where[Op.or] = [
        { region_code: like },
        { region_name: like }
      ];
    }

    const regions = await GeoRegion.findAll({
      where,
      order: [['country_code', 'ASC'], ['region_name', 'ASC']]
    });
    res.json({ regions });
  } catch (error) {
    res.status(500).json({ message: '获取区域字典失败', error: error.message });
  }
};

module.exports = {
  listCountries,
  listRegions
};
