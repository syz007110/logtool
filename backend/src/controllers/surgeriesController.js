const { Op, Sequelize } = require('sequelize');
const Surgery = require('../models/surgery');
const LogEntry = require('../models/log_entry');
const Log = require('../models/log');
const Device = require('../models/device');

// 列表：支持 device_id 模糊筛选与分页
exports.listSurgeries = async (req, res) => {
  try {
    const { device_id, page = 1, limit = 20, type, time_range_start, time_range_end } = req.query;
    const where = {};
    if (device_id) {
      // 精确匹配包含该设备编号的手术（PostgreSQL ARRAY contains）
      where.device_ids = { [Op.contains]: [String(device_id)] };
    }

    if (type === 'fault') {
      where.has_fault = { [Op.is]: true };
    } else if (type === 'remote') {
      where.is_remote = true;
    }

    const parseTimePrefixToDate = (value, isEnd = false) => {
      if (!value || typeof value !== 'string') return null;
      const normalized = value.trim();
      const match = normalized.match(/^(\d{4})(\d{2})(\d{2})(\d{2})?$/);
      if (!match) return null;
      const [, yearStr, monthStr, dayStr, hourStr] = match;
      const year = Number(yearStr);
      const month = Number(monthStr);
      const day = Number(dayStr);
      if ([year, month, day].some(num => Number.isNaN(num))) return null;
      let hour = 0;
      let minute = 0;
      let second = 0;
      let millisecond = 0;
      if (hourStr != null) {
        hour = Number(hourStr);
        if (Number.isNaN(hour)) hour = 0;
      }
      if (isEnd) {
        if (hourStr == null) {
          hour = 23;
        }
        minute = 59;
        second = 59;
        millisecond = 999;
      }
      const iso = `${yearStr}-${monthStr}-${dayStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}Z`;
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return null;
      if (millisecond && minute === 59 && second === 59) {
        date.setUTCMilliseconds(millisecond);
      }
      return date;
    };

    const startDate = parseTimePrefixToDate(time_range_start, false);
    const endDate = parseTimePrefixToDate(time_range_end, true);
    if (startDate && endDate) {
      where.start_time = { [Op.between]: [startDate, endDate] };
    } else if (startDate) {
      where.start_time = { [Op.gte]: startDate };
    } else if (endDate) {
      where.start_time = { [Op.lte]: endDate };
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    const { rows, count } = await Surgery.findAndCountAll({
      where,
      order: [['start_time', 'DESC']],
      limit: limitNum,
      offset
    });

    // 附带医院名称（仅基于 surgery.device_ids 与设备表关联，不额外要求设备权限）
    try {
      // 收集所有出现的设备编号
      const allDeviceIds = Array.from(new Set((rows || []).flatMap(r => Array.isArray(r.device_ids) ? r.device_ids : []).filter(Boolean)));
      let deviceIdToHospital = new Map();
      if (allDeviceIds.length > 0) {
        const devices = await Device.findAll({ where: { device_id: { [Op.in]: allDeviceIds } }, attributes: ['device_id', 'hospital'] });
        deviceIdToHospital = new Map(devices.map(d => [d.device_id, d.hospital || null]));
      }

      // 为每条手术记录附加 hospital_names（数组）与 hospital_name（首个非空）
      rows.forEach(r => {
        const ids = Array.isArray(r.device_ids) ? r.device_ids : [];
        const hospitals = ids.map(id => deviceIdToHospital.get(id) || null).filter(h => h);
        // 注意：直接修改实例不会丢失字段；返回时序列化为JSON
        r.setDataValue('hospital_names', hospitals);
        r.setDataValue('hospital_name', hospitals.length > 0 ? hospitals[0] : null);
      });
    } catch (e) {
      // 附加失败不影响主体数据
    }

    res.json({ success: true, data: rows, total: count, page: pageNum, limit: limitNum });
  } catch (error) {
    console.error('listSurgeries error:', error);
    res.status(500).json({ success: false, message: '获取手术数据失败', error: error.message });
  }
};

// 获取单条
exports.getSurgeryById = async (req, res) => {
  try {
    const { id: rawId } = req.params;
    let item = null;

    // 先尝试按主键（数值型）查找
    if (rawId && /^\d+$/.test(rawId)) {
      item = await Surgery.findByPk(Number(rawId));
    }

    // 如果主键未找到，再按 surgery_id（字符型）查找
    if (!item && rawId) {
      item = await Surgery.findOne({ where: { surgery_id: rawId } });
    }

    if (!item) {
      return res.status(404).json({ success: false, message: '未找到手术数据' });
    }

    res.json({ success: true, data: item });
  } catch (error) {
    console.error('getSurgeryById error:', error);
    res.status(500).json({ success: false, message: '获取手术数据失败', error: error.message });
  }
};

// 删除
exports.deleteSurgery = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const item = await Surgery.findByPk(id);
    if (!item) return res.status(404).json({ success: false, message: '未找到手术数据' });
    await item.destroy();
    // 操作日志
    try {
      const { logOperation } = require('../utils/operationLogger');
      await logOperation({
        operation: '删除手术数据',
        description: `删除手术: ${item.surgery_id || id}`,
        user_id: req.user?.id,
        username: req.user?.username,
        ip: req.ip,
        user_agent: req.headers['user-agent'],
        details: { id, surgery_id: item.surgery_id || null }
      });
    } catch (_) {}

    res.json({ success: true, message: '删除成功' });
  } catch (error) {
    console.error('deleteSurgery error:', error);
    res.status(500).json({ success: false, message: '删除手术数据失败', error: error.message });
  }
};

// 通过手术记录上的日志条目ID范围提取日志条目
exports.getLogEntriesByRange = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const item = await Surgery.findByPk(id);
    if (!item) return res.status(404).json({ success: false, message: '未找到手术数据' });

    const startId = item.log_entry_start_id;
    const endId = item.log_entry_end_id;
    if (!startId || !endId) {
      return res.status(400).json({ success: false, message: '该手术缺少日志条目范围' });
    }

    const entries = await LogEntry.findAll({
      where: { id: { [Op.between]: [startId, endId] } },
      order: [['timestamp', 'ASC']],
      include: [{ model: Log, as: 'Log', attributes: ['original_name', 'device_id'] }]
    });
    res.json({ success: true, entries });
  } catch (error) {
    console.error('getLogEntriesByRange error:', error);
    res.status(500).json({ success: false, message: '获取日志条目失败', error: error.message });
  }
};


