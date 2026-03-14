const { Op } = require('sequelize');
const HospitalMaster = require('../models/hospital_master');
const GeoCountry = require('../models/geo_country');
const GeoRegion = require('../models/geo_region');
const Device = require('../models/device');
const { normalizePagination, MAX_PAGE_SIZE } = require('../constants/pagination');

const listHospitals = async (req, res) => {
  try {
    const { search = '', country_code, region_code, status } = req.query;
    const { page, limit } = normalizePagination(req.query.page, req.query.limit, MAX_PAGE_SIZE.STANDARD);
    const where = {};

    if (country_code) where.country_code = String(country_code).trim();
    if (region_code) where.region_code = String(region_code).trim();
    if (status !== undefined && status !== null && status !== '') {
      where.status = String(status) === '1' || String(status).toLowerCase() === 'true';
    }
    if (search) {
      const like = { [Op.like]: `%${search}%` };
      where[Op.or] = [
        { hospital_code: like },
        { hospital_name_std: like }
      ];
    }

    const { count: total, rows } = await HospitalMaster.findAndCountAll({
      where,
      include: [
        { model: GeoCountry, as: 'Country', attributes: ['country_code', 'country_name'], required: false },
        { model: GeoRegion, as: 'Region', attributes: ['region_code', 'region_name'], required: false }
      ],
      offset: (page - 1) * limit,
      limit,
      order: [['updated_at', 'DESC']]
    });

    res.json({ hospitals: rows, total, page, limit });
  } catch (error) {
    res.status(500).json({ message: '获取医院列表失败', error: error.message });
  }
};

const createHospital = async (req, res) => {
  try {
    const hospital_code = String(req.body?.hospital_code || '').trim();
    const hospital_name_std = String(req.body?.hospital_name_std || '').trim();
    const country_code = String(req.body?.country_code || '').trim();
    const region_code = req.body?.region_code ? String(req.body.region_code).trim() : null;
    const status = req.body?.status !== undefined ? !!req.body.status : true;
    const source_system = req.body?.source_system ? String(req.body.source_system).trim() : null;
    const source_key = req.body?.source_key ? String(req.body.source_key).trim() : null;

    if (!hospital_code || !hospital_name_std || !country_code) {
      return res.status(400).json({ message: 'hospital_code、hospital_name_std、country_code 不能为空' });
    }

    const country = await GeoCountry.findByPk(country_code);
    if (!country) return res.status(400).json({ message: '国家编码不存在' });

    if (region_code) {
      const region = await GeoRegion.findOne({ where: { country_code, region_code } });
      if (!region) return res.status(400).json({ message: '区域编码不存在或与国家不匹配' });
    }

    const codeExisted = await HospitalMaster.findOne({ where: { hospital_code } });
    if (codeExisted) return res.status(409).json({ message: '医院编码已存在' });

    const created = await HospitalMaster.create({
      hospital_code,
      hospital_name_std,
      country_code,
      region_code,
      status,
      source_system,
      source_key,
      created_at: new Date(),
      updated_at: new Date()
    });

    res.json({ hospital: created, message: req.t('shared.created') });
  } catch (error) {
    res.status(500).json({ message: '创建医院失败', error: error.message });
  }
};

const updateHospital = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await HospitalMaster.findByPk(id);
    if (!record) return res.status(404).json({ message: req.t('shared.notFound') });

    const updates = {};
    if (req.body?.hospital_code !== undefined) updates.hospital_code = String(req.body.hospital_code || '').trim();
    if (req.body?.hospital_name_std !== undefined) updates.hospital_name_std = String(req.body.hospital_name_std || '').trim();
    if (req.body?.country_code !== undefined) updates.country_code = String(req.body.country_code || '').trim();
    if (req.body?.region_code !== undefined) updates.region_code = req.body.region_code ? String(req.body.region_code).trim() : null;
    if (req.body?.status !== undefined) updates.status = !!req.body.status;
    if (req.body?.source_system !== undefined) updates.source_system = req.body.source_system ? String(req.body.source_system).trim() : null;
    if (req.body?.source_key !== undefined) updates.source_key = req.body.source_key ? String(req.body.source_key).trim() : null;

    const nextCode = updates.hospital_code ?? record.hospital_code;
    const nextName = updates.hospital_name_std ?? record.hospital_name_std;
    const nextCountry = updates.country_code ?? record.country_code;
    const nextRegion = updates.region_code !== undefined ? updates.region_code : record.region_code;

    if (!nextCode || !nextName || !nextCountry) {
      return res.status(400).json({ message: 'hospital_code、hospital_name_std、country_code 不能为空' });
    }

    const country = await GeoCountry.findByPk(nextCountry);
    if (!country) return res.status(400).json({ message: '国家编码不存在' });

    if (nextRegion) {
      const region = await GeoRegion.findOne({ where: { country_code: nextCountry, region_code: nextRegion } });
      if (!region) return res.status(400).json({ message: '区域编码不存在或与国家不匹配' });
    }

    if (nextCode !== record.hospital_code) {
      const codeExisted = await HospitalMaster.findOne({ where: { hospital_code: nextCode } });
      if (codeExisted) return res.status(409).json({ message: '医院编码已存在' });
    }

    Object.assign(record, updates, { updated_at: new Date() });
    await record.save();
    res.json({ hospital: record, message: req.t('shared.updated') });
  } catch (error) {
    res.status(500).json({ message: '更新医院失败', error: error.message });
  }
};

const deleteHospital = async (req, res) => {
  try {
    const { id } = req.params;
    const record = await HospitalMaster.findByPk(id);
    if (!record) return res.status(404).json({ message: req.t('shared.notFound') });

    const inUseCount = await Device.count({ where: { hospital_id: id } });
    if (inUseCount > 0) {
      return res.status(409).json({ message: '该医院已绑定设备，无法删除' });
    }

    await record.destroy();
    res.json({ message: req.t('shared.deleted') });
  } catch (error) {
    res.status(500).json({ message: '删除医院失败', error: error.message });
  }
};

module.exports = {
  listHospitals,
  createHospital,
  updateHospital,
  deleteHospital
};
