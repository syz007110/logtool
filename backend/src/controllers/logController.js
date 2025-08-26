const fs = require('fs');
const path = require('path');
const Log = require('../models/log');
const LogEntry = require('../models/log_entry');
const ErrorCode = require('../models/error_code');
const Device = require('../models/device');
const dayjs = require('dayjs');
const { decryptLogContent } = require('../utils/decryptUtils');
const { parseExplanation, parseExplanations } = require('../utils/explanationParser');
const { logProcessingQueue } = require('../config/queue');
// 已移除 HanLP 相关调用
const SequelizeLib = require('sequelize');
const Op = SequelizeLib.Op;
const os = require('os');
const templatesPath = path.join(__dirname, '../config/searchTemplates.json');
// 已移除 NLP 自然语言解析

// 读取预设搜索模板
const getSearchTemplates = async (req, res) => {
  try {
    if (!fs.existsSync(templatesPath)) {
      return res.json({ templates: [] });
    }
    const raw = fs.readFileSync(templatesPath, 'utf-8');
    const data = JSON.parse(raw || '[]');
    return res.json({ templates: data });
  } catch (e) {
    return res.status(500).json({ message: '读取搜索模板失败', error: e.message });
  }
};

// 导入搜索模板（覆盖式）
const importSearchTemplates = async (req, res) => {
  try {
    const { templates } = req.body;
    if (!Array.isArray(templates)) {
      return res.status(400).json({ message: '无效的模板格式，应为数组' });
    }
    fs.writeFileSync(templatesPath, JSON.stringify(templates, null, 2), 'utf-8');
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ message: '导入搜索模板失败', error: e.message });
  }
};

// 已移除 NLP 相关接口

const UPLOAD_DIR = path.join(__dirname, '../../uploads/logs');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 获取日志列表
const getLogs = async (req, res) => {
  try {
    let { page = 1, limit = 20, device_id } = req.query;
    // 新增筛选：仅看自己 + 基于文件名前缀(YYYYMMDDHH)的时间筛选（年/月/日/小时 或 直接前缀）
    const { only_own, year, month, day, hour, time_prefix } = req.query;
    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    
    // 构建查询条件
    const where = {};
    if (device_id) {
      where.device_id = device_id;
    }
    // 仅看自己：uploader_id 等于当前用户
    const truthy = (v) => {
      if (v === undefined || v === null) return false;
      const s = String(v).toLowerCase();
      return s === '1' || s === 'true' || s === 'yes' || s === 'on';
    };
    if (truthy(only_own) && req.user && req.user.id) {
      where.uploader_id = req.user.id;
    }
    // 时间前缀筛选：original_name 以 YYYY[MM][DD][HH] 开头
    // 优先使用直接传入的 time_prefix，其次使用 year/month/day/hour 组合
    const prefixFromParam = (p) => typeof p === 'string' ? p.trim() : (p ?? '').toString();
    const tp = prefixFromParam(time_prefix);
    if (tp && /^[0-9]{4}(?:[0-9]{2}){0,3}$/.test(tp)) {
      where.original_name = { [Op.like]: `${tp}%` };
    } else if (year) {
      const y = String(year).padStart(4, '0');
      const m = month ? String(month).padStart(2, '0') : '';
      const d = day ? String(day).padStart(2, '0') : '';
      const h = hour ? String(hour).padStart(2, '0') : '';
      const prefix = `${y}${m}${d}${h}`;
      if (prefix && /^[0-9]{4}(?:[0-9]{2}){0,3}$/.test(prefix)) {
        where.original_name = { [Op.like]: `${prefix}%` };
      }
    }
    
    // 权限控制：所有用户都可以看到所有日志，但删除权限在删除接口中单独控制
    // 普通用户、专家用户和管理员都可以查看所有日志
    // 删除权限在deleteLog函数中单独检查
    
    const { count: total, rows: logs } = await Log.findAndCountAll({
      where,
      offset: (page - 1) * limit,
      limit,
      order: [['original_name', 'DESC']]
    });
    res.json({ logs, total });
  } catch (err) {
    res.status(500).json({ message: '获取日志失败', error: err.message });
  }
};

// 上传日志
const uploadLog = async (req, res) => {
  try {
    const files = req.files; // 支持多文件
    if (!files || files.length === 0) {
      return res.status(400).json({ message: '未上传文件' });
    }
    
    // 从请求头获取解密密钥和设备编号
    const decryptKey = req.headers['x-decrypt-key'];
    const deviceId = req.headers['x-device-id'] || '0000-00'; // 默认设备编号
    
    if (!decryptKey) {
      return res.status(400).json({ message: '未提供解密密钥' });
    }
    
    // 验证密钥格式
    if (!validateKey(decryptKey)) {
      return res.status(400).json({ message: '密钥格式不正确，应为MAC地址格式（如：00-01-05-77-6a-09）' });
    }
    
    // 验证设备编号格式
    if (deviceId !== '0000-00' && !validateDeviceId(deviceId)) {
      return res.status(400).json({ message: '设备编号格式不正确，应为数字或字母组合格式（如：4371-01、ABC-12、123-XY）' });
    }
    
    const uploadedLogs = [];
    
    for (const file of files) {
      let log;
      try {
        console.log(`开始处理文件: ${file.originalname}, 大小: ${file.size} bytes`);
        
        // 如果已存在相同 device_id + original_name 的日志，则覆盖原数据而不是新增
        log = await Log.findOne({
          where: {
            device_id: deviceId || null,
            original_name: file.originalname
          }
        });

        if (log) {
          // 覆盖：更新现有日志为上传中状态，并刷新关键元数据
          await log.update({
            filename: file.filename,
            size: file.size,
            status: 'uploading',
            upload_time: new Date(),
            uploader_id: req.user ? req.user.id : null,
            device_id: deviceId || null,
            key_id: decryptKey || null
          });
        } else {
          // 新增
          log = await Log.create({
            filename: file.filename,
            original_name: file.originalname,
            size: file.size,
            status: 'uploading', // 初始状态为上传中
            upload_time: new Date(),
            uploader_id: req.user ? req.user.id : null,
            device_id: deviceId || null,
            key_id: decryptKey || null
          });
        }
        
        // 同步设备信息到设备表（若存在）
        try {
          if (deviceId && deviceId !== '0000-00') {
            const [device, created] = await Device.findOrCreate({
              where: { device_id: deviceId },
              defaults: {
                device_model: null,
                device_key: decryptKey,
                hospital: null,
                created_at: new Date(),
                updated_at: new Date()
              }
            });
            if (!created && decryptKey && !device.device_key) {
              device.device_key = decryptKey;
              device.updated_at = new Date();
              await device.save();
            }
          }
        } catch (e) {
          console.warn('设备信息同步失败（忽略，不影响日志处理）:', e.message);
        }

        // 将文件处理任务添加到队列
        console.log(`将文件 ${file.originalname} 添加到处理队列`);
        
        const job = await logProcessingQueue.add('process-log', {
          filePath: file.path,
          originalName: file.originalname,
          decryptKey: decryptKey,
          deviceId: deviceId || null,
          uploaderId: req.user ? req.user.id : null,
          logId: log.id
        }, {
          priority: 1, // 高优先级
          delay: 0, // 立即处理
          attempts: 3, // 重试3次
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        });
        
        console.log(`文件 ${file.originalname} 已添加到队列，任务ID: ${job.id}`);
        
        uploadedLogs.push(log);
      } catch (error) {
        console.error(`处理文件 ${file.originalname} 失败:`, error);
        console.error('错误堆栈:', error.stack);
        
        // 如果日志记录已创建，更新状态为失败
        if (log && log.id) {
          try {
            await log.update({ status: 'failed' });
          } catch (updateError) {
            console.error('更新日志状态失败:', updateError);
          }
        }
        
        // 删除临时文件
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        throw new Error(`文件 ${file.originalname} 解密失败: ${error.message}`);
      }
    }
    
    res.json({ 
      message: `成功上传 ${uploadedLogs.length} 个文件，已加入处理队列`, 
      logs: uploadedLogs,
      queued: true
    });
  } catch (err) {
    res.status(500).json({ message: '上传失败', error: err.message });
  }
};

// 解析日志（写入 log_entries）
const parseLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await Log.findByPk(id);
    if (!log) return res.status(404).json({ message: '日志不存在' });
    
    // 权限控制：普通用户只能解析自己的日志，专家用户和管理员可以解析任何日志
    const userRole = req.user.role_id;
    if (userRole === 3 && log.uploader_id !== req.user.id) { // 普通用户且不是自己的日志
      return res.status(403).json({ message: '权限不足，只能解析自己的日志' });
    }
    
    const filePath = path.join(UPLOAD_DIR, log.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: '文件不存在' });
    
    // 读取文件内容
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // 使用数据库中保存的密钥进行解密
    const key = log.key_id;
    if (!key) {
      return res.status(400).json({ message: '未找到解密密钥，请重新上传并输入密钥' });
    }
    
    // 解密日志内容
    const decryptedEntries = decryptLogContent(content, key);
    
    // 转换为数据库格式并查询正确的释义
    const entries = [];
    for (const entry of decryptedEntries) {
      // 根据需求，通过解密后的故障码首位+('0X'+故障码后4位)去匹配error_codes表
      const errorCodeStr = entry.error_code;
      let subsystem = '';
      let code = '';
      
      if (errorCodeStr && errorCodeStr.length >= 5) {
        subsystem = errorCodeStr.charAt(0); // 首位
        code = '0X' + errorCodeStr.slice(-4); // '0X' + 后4位
      }
      // 查询error_codes表获取正确的释义
      let explanation = entry.explanation; // 默认使用原始释义
      if (subsystem && code) {
        try {
          const errorCodeRecord = await ErrorCode.findOne({
            where: { subsystem, code }
          });
          if (errorCodeRecord && errorCodeRecord.explanation) {
            explanation = errorCodeRecord.explanation;
            console.log(`解析日志原始释义: ${explanation}`);
          }
        } catch (error) {
          console.error(`查询错误码释义失败: ${subsystem}${code}`, error.message);
        }
      }
      
      // 立即解析释义中的占位符，提高效率
      const parsedExplanation = parseExplanation(
        explanation,
        entry.param1, // 参数0
        entry.param2, // 参数1
        entry.param3, // 参数2
        entry.param4, // 参数3
        {
          error_code: entry.error_code,
          subsystem,
          arm: errorCodeStr?.charAt(1) || null,
          joint: errorCodeStr?.charAt(2) || null
        }
      );
      
      entries.push({
        log_id: log.id,
        timestamp: entry.timestamp,
        error_code: entry.error_code,
        param1: entry.param1,
        param2: entry.param2,
        param3: entry.param3,
        param4: entry.param4,
        explanation: parsedExplanation
      });
    }
    
    console.log('解析日志释义完成，示例:', entries[0]?.explanation);
    
    // 清空旧明细并插入新明细
    await LogEntry.destroy({ where: { log_id: log.id } });
    if (entries.length > 0) {
      await LogEntry.bulkCreate(entries);
    }
    
    // 更新日志状态
    log.status = 'parsed';
    log.parse_time = new Date();
    await log.save();
    
    res.json({ message: '解析成功', count: entries.length });
  } catch (err) {
    console.error('解析日志失败:', err);
    res.status(500).json({ message: '解析失败', error: err.message });
  }
};

// 获取队列状态
const getQueueStatus = async (req, res) => {
  try {
    const waiting = await logProcessingQueue.getWaiting();
    const active = await logProcessingQueue.getActive();
    const completed = await logProcessingQueue.getCompleted();
    const failed = await logProcessingQueue.getFailed();
    
    res.json({
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      total: waiting.length + active.length + completed.length + failed.length
    });
  } catch (error) {
    console.error('获取队列状态失败:', error);
    res.status(500).json({ message: '获取队列状态失败', error: error.message });
  }
};

// 获取日志明细
const getLogEntries = async (req, res) => {
  try {
    const { id } = req.params;
    
    // 先检查日志是否存在并验证权限
    const log = await Log.findByPk(id);
    if (!log) return res.status(404).json({ message: '日志不存在' });
    
    // 权限控制：普通用户只能查看自己的日志明细，专家用户和管理员可以查看任何日志明细
    const userRole = req.user.role_id;
    if (userRole === 3 && log.uploader_id !== req.user.id) { // 普通用户且不是自己的日志
      return res.status(403).json({ message: '权限不足，只能查看自己的日志明细' });
    }
    
    const entries = await LogEntry.findAll({ where: { log_id: id }, order: [['timestamp', 'ASC']] });
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ message: '获取日志明细失败', error: err.message });
  }
};

// 批量获取日志明细（用于分析功能）
  const getBatchLogEntries = async (req, res) => {
  try {
    const { 
      log_ids, 
      search, 
      error_code, 
      start_time, 
      end_time, 
      page = 1, 
      limit = 100,
      filters // 高级筛选条件（JSON字符串或对象）
    } = req.query;
    // 仅在首次加载或未选择时间范围时，返回建议的时间范围（min/max）
    const shouldIncludeTimeSuggestion = !start_time && !end_time;
    
    // 构建查询条件
    const where = {};
    
    // 日志ID筛选
    if (log_ids) {
      const ids = log_ids.split(',').map(id => parseInt(id.trim()));
      where.log_id = { [Op.in]: ids };
    }
    
    // 故障码筛选
    if (error_code) {
      where.error_code = { [Op.like]: `%${error_code}%` };
    }
    
    // 时间范围筛选
    if (start_time || end_time) {
      where.timestamp = {};
      if (start_time) {
        where.timestamp[Op.gte] = new Date(start_time);
      }
      if (end_time) {
        where.timestamp[Op.lte] = new Date(end_time);
      }
    }
    
    // 搜索功能：在 explanation 与 error_code 中模糊匹配（OR）
    if (search) {
      const keywordOr = {
        [Op.or]: [
          { explanation: { [Op.like]: `%${search}%` } },
          { error_code: { [Op.like]: `%${search}%` } }
        ]
      };
      if (where[Op.and]) {
        where[Op.and].push(keywordOr);
      } else {
        // 将已有的顶层键合并进 AND，避免覆盖已有条件
        const baseConds = [];
        Object.keys(where).forEach(k => {
          if (k !== Op.and && k !== Op.or) {
            baseConds.push({ [k]: where[k] });
            delete where[k];
          }
        });
        where[Op.and] = baseConds.length > 0 ? baseConds.concat([keywordOr]) : [keywordOr];
      }
    }

    // 高级筛选：解析 filters
    // 允许的字段与操作符白名单
    const allowedFields = new Set(['timestamp', 'error_code', 'param1', 'param2', 'param3', 'param4', 'explanation']);
    let firstOccurrenceRequested = false;
    const buildCondition = (field, operator, value) => {
      // 保护：字段白名单
      if (!allowedFields.has(field)) return null;

      // 针对参数数值比较，使用 CAST
      const isNumericParam = ['param1', 'param2', 'param3', 'param4'].includes(field);

      const buildOpValue = (sequelizeOperator, val) => {
        if (isNumericParam) {
          const castCol = SequelizeLib.cast(SequelizeLib.col(field), 'DECIMAL(18,6)');
          // IN/NOT IN 需要确保是数组形式 IN (...)
          if (sequelizeOperator === Op.in || sequelizeOperator === Op.notIn) {
            const arr = Array.isArray(val) ? val : [val];
            const nums = arr.map(v => Number(v)).filter(v => !Number.isNaN(v));
            if (nums.length === 0) return null;
            return SequelizeLib.where(castCol, sequelizeOperator, nums);
          }
          // BETWEEN/NOT BETWEEN 需要两个数值
          if (sequelizeOperator === Op.between || sequelizeOperator === Op.notBetween) {
            if (!Array.isArray(val) || val.length !== 2) return null;
            const a = Number(val[0]);
            const b = Number(val[1]);
            if (Number.isNaN(a) || Number.isNaN(b)) return null;
            return SequelizeLib.where(castCol, sequelizeOperator, [a, b]);
          }
          // 其他比较运算符，单值数值
          const n = Number(val);
          if (Number.isNaN(n)) return null;
          return SequelizeLib.where(castCol, sequelizeOperator, n);
        }
        if (field === 'timestamp' && (sequelizeOperator === Op.between || sequelizeOperator === Op.gte || sequelizeOperator === Op.lte || sequelizeOperator === Op.gt || sequelizeOperator === Op.lt || sequelizeOperator === Op.eq || sequelizeOperator === Op.ne)) {
          const toDate = (d) => {
            if (d instanceof Date) return d;
            if (typeof d === 'string' || typeof d === 'number') return new Date(d);
            return null;
          };
          
          if (sequelizeOperator === Op.between) {
            if (!Array.isArray(val) || val.length !== 2) return null;
            const startDate = toDate(val[0]);
            const endDate = toDate(val[1]);
            if (!startDate || !endDate) return null;
            return { [field]: { [Op.between]: [startDate, endDate] } };
          } else {
            const date = toDate(val);
            if (!date) return null;
            return { [field]: { [sequelizeOperator]: date } };
          }
        }
        if (sequelizeOperator === Op.regexp) {
          // 正则长度限制
          if (typeof val !== 'string' || val.length > 200) return null;
          return { [field]: { [Op.regexp]: val } };
        }
        if (sequelizeOperator === Op.like) {
          return { [field]: { [Op.like]: `%${val}%` } };
        }
        if (sequelizeOperator === Op.in || sequelizeOperator === Op.notIn) {
          const arr = Array.isArray(val) ? val : String(val).split(',').map(s => s.trim()).filter(Boolean);
          return { [field]: { [sequelizeOperator]: arr } };
        }
        if (sequelizeOperator === Op.between || sequelizeOperator === Op.notBetween) {
          if (!Array.isArray(val) || val.length !== 2) return null;
          if (isNumericParam) {
            const a = Number(val[0]);
            const b = Number(val[1]);
            if (Number.isNaN(a) || Number.isNaN(b)) return null;
            return SequelizeLib.where(
              SequelizeLib.cast(SequelizeLib.col(field), 'DECIMAL(18,6)'),
              sequelizeOperator,
              [a, b]
            );
          }
          return { [field]: { [sequelizeOperator]: val } };
        }
        // 其他比较运算符
        if (isNumericParam) {
          const n = Number(val);
          if (Number.isNaN(n)) return null;
          return SequelizeLib.where(SequelizeLib.cast(SequelizeLib.col(field), 'DECIMAL(18,6)'), sequelizeOperator, n);
        }
        return { [field]: { [sequelizeOperator]: val } };
      };

      switch ((operator || '').toLowerCase()) {
        case 'firstof':
          // 特殊标志：请求每个 (log_id, error_code) 的首次出现。
          // 若指定了 error_code 的其他条件，会与之共同作用。
          firstOccurrenceRequested = true;
          return null;
        case '=': return buildOpValue(Op.eq, value);
        case '!=':
        case '<>': return buildOpValue(Op.ne, value);
        case '>': return buildOpValue(Op.gt, value);
        case '>=': return buildOpValue(Op.gte, value);
        case '<': return buildOpValue(Op.lt, value);
        case '<=': return buildOpValue(Op.lte, value);
        case 'between': return buildOpValue(Op.between, value);
        case 'notbetween': return buildOpValue(Op.notBetween, value);
        case 'in': return buildOpValue(Op.in, value);
        case 'notin': return buildOpValue(Op.notIn, value);
        case 'like':
        case 'contains': return buildOpValue(Op.like, value);
        case 'notcontains': return { [field]: { [Op.notLike]: `%${value}%` } };
        case 'startswith': return { [field]: { [Op.like]: `${value}%` } };
        case 'endswith': return { [field]: { [Op.like]: `%${value}` } };
        case 'startswith': return { [field]: { [Op.like]: `${value}%` } };
        case 'regex': return buildOpValue(Op.regexp, value);
        default: return null;
      }
    };

    const normalizeFilters = (raw) => {
      if (!raw) return null;
      let parsed = raw;
      if (typeof raw === 'string') {
        try { parsed = JSON.parse(raw); } catch (e) { return null; }
      }
      return parsed;
    };

    const advancedFilters = normalizeFilters(filters);

    // 递归构建 Sequelize 条件，完整支持嵌套(AND/OR)
    const buildFromNode = (node) => {
      if (!node) return null;
      if (Array.isArray(node)) {
        const parts = node.map(n => buildFromNode(n)).filter(Boolean);
        if (parts.length === 0) return null;
        // 默认用 AND 连接数组节点
        return { [Op.and]: parts };
      }
      if (node.field && node.operator) {
        return buildCondition(node.field, node.operator, node.value);
      }
      if (node.conditions && (node.logic === 'AND' || node.logic === 'OR')) {
        const childConds = node.conditions.map(child => buildFromNode(child)).filter(Boolean);
        if (childConds.length === 0) return null;
        return node.logic === 'OR' ? { [Op.or]: childConds } : { [Op.and]: childConds };
      }
      return null;
    };

    const advancedWhere = advancedFilters ? buildFromNode(advancedFilters) : null;
    if (advancedWhere) {
      // 与其他顶层条件（时间/搜索/日志ID）按 AND 组合
      if (where[Op.and]) {
        where[Op.and].push(advancedWhere);
      } else {
        // 如果 where 已有键值（如 log_id、timestamp、explanation），需要与 advancedWhere 合并为 AND
        const baseConds = [];
        Object.keys(where).forEach(k => {
          if (k !== Op.and && k !== Op.or) {
            baseConds.push({ [k]: where[k] });
            delete where[k];
          }
        });
        if (baseConds.length > 0) {
          where[Op.and] = baseConds.concat([advancedWhere]);
        } else {
          where[Op.and] = [advancedWhere];
        }
      }
    }
    
    // 权限控制：普通用户只能查看自己的日志明细
    const userRole = req.user.role_id;
    if (userRole === 3) { // 普通用户
      // 需要先获取用户自己的日志ID列表
      const userLogs = await Log.findAll({
        where: { uploader_id: req.user.id },
        attributes: ['id']
      });
      const userLogIds = userLogs.map(log => log.id);
      
      if (where.log_id) {
        // 如果已经指定了log_ids，需要取交集
        const requestedIds = Array.isArray(where.log_id[Op.in]) 
          ? where.log_id[Op.in] 
          : [where.log_id[Op.in]];
        const allowedIds = requestedIds.filter(id => userLogIds.includes(id));
        where.log_id = { [Op.in]: allowedIds };
      } else {
        where.log_id = { [Op.in]: userLogIds };
      }
    }
    
    // 分页参数
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 100;
    const offset = (pageNum - 1) * limitNum;
    
    // 优化查询：只选择必要的字段
    const attributes = [
      'id', 'log_id', 'timestamp', 'error_code', 
      'param1', 'param2', 'param3', 'param4', 'explanation'
    ];
    
    if (firstOccurrenceRequested) {
      console.log('[NLP] firstof enabled: fetching all matched entries for first-occurrence reduction');
      // 为保证首次过滤正确，先取全量匹配（不分页），再按 (log_id, error_code) 取最早一条
      const all = await LogEntry.findAll({
        where,
        attributes,
        order: [['timestamp', 'ASC']],
        include: [{
          model: Log,
          as: 'Log',
          attributes: ['original_name', 'device_id', 'uploader_id', 'upload_time']
        }]
      });
      console.log(`[NLP] firstof total matched before reduce: ${all.length}`);
      const seen = new Set();
      const reduced = [];
      for (const e of all) {
        const key = `${e.log_id}::${e.error_code}`;
        if (!seen.has(key)) {
          seen.add(key);
          reduced.push(e);
        }
      }
      console.log(`[NLP] firstof after reduce: ${reduced.length}`);
      const total = reduced.length;
      const start = offset;
      const end = offset + limitNum;
      const entries = reduced.slice(start, end);
      // 计算总体时间范围（基于 reduced）
      let minTimestamp = null;
      let maxTimestamp = null;
      if (reduced.length > 0) {
        const ms = reduced.map(e => new Date(e.timestamp).getTime()).filter(n => !Number.isNaN(n));
        if (ms.length > 0) {
          minTimestamp = new Date(Math.min(...ms));
          maxTimestamp = new Date(Math.max(...ms));
        }
      }
      return res.json({
        entries,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        minTimestamp: shouldIncludeTimeSuggestion ? minTimestamp : null,
        maxTimestamp: shouldIncludeTimeSuggestion ? maxTimestamp : null
      });
    } else {
      // 优化查询：使用 findAndCountAll 进行高效分页
      const { count: total, rows: entries } = await LogEntry.findAndCountAll({
        where,
        attributes,
        offset,
        limit: limitNum,
        order: [['timestamp', 'ASC']],
        include: [{
          model: Log,
          as: 'Log',
          attributes: ['original_name', 'device_id', 'uploader_id', 'upload_time']
        }],
        // 添加查询优化选项
        distinct: true,
        subQuery: false
      });
      // 计算总体时间范围（基于相同 where 条件的聚合）
      let minTimestamp = null;
      let maxTimestamp = null;
      try {
        const agg = await LogEntry.findOne({
          where,
          attributes: [
            [SequelizeLib.fn('MIN', SequelizeLib.col('timestamp')), 'min_ts'],
            [SequelizeLib.fn('MAX', SequelizeLib.col('timestamp')), 'max_ts']
          ]
        });
        if (agg) {
          minTimestamp = agg.get('min_ts');
          maxTimestamp = agg.get('max_ts');
        }
      } catch (_) {}

      return res.json({ 
        entries, 
        total, 
        page: pageNum, 
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        minTimestamp: shouldIncludeTimeSuggestion ? minTimestamp : null,
        maxTimestamp: shouldIncludeTimeSuggestion ? maxTimestamp : null
      });
    }
  } catch (err) {
    console.error('批量获取日志明细失败:', err);
    res.status(500).json({ message: '获取日志明细失败', error: err.message });
  }
};

// 导出批量日志明细为 CSV（服务端生成，单请求下载）
const exportBatchLogEntriesCSV = async (req, res) => {
  try {
    const {
      log_ids,
      search,
      error_code,
      start_time,
      end_time,
      filters
    } = req.query;

    // 构建查询条件（与 getBatchLogEntries 保持一致）
    const where = {};
    if (log_ids) {
      const ids = log_ids.split(',').map(id => parseInt(id.trim()));
      where.log_id = { [Op.in]: ids };
    }
    if (error_code) {
      where.error_code = { [Op.like]: `%${error_code}%` };
    }
    if (start_time || end_time) {
      where.timestamp = {};
      if (start_time) where.timestamp[Op.gte] = new Date(start_time);
      if (end_time) where.timestamp[Op.lte] = new Date(end_time);
    }
    if (search) {
      const keywordOr = {
        [Op.or]: [
          { explanation: { [Op.like]: `%${search}%` } },
          { error_code: { [Op.like]: `%${search}%` } }
        ]
      };
      if (where[Op.and]) {
        where[Op.and].push(keywordOr);
      } else {
        const baseConds = [];
        Object.keys(where).forEach(k => {
          if (k !== Op.and && k !== Op.or) {
            baseConds.push({ [k]: where[k] });
            delete where[k];
          }
        });
        where[Op.and] = baseConds.length > 0 ? baseConds.concat([keywordOr]) : [keywordOr];
      }
    }

    const allowedFields = new Set(['timestamp', 'error_code', 'param1', 'param2', 'param3', 'param4', 'explanation']);
    let firstOccurrenceRequested = false;
    const buildCondition = (field, operator, value) => {
      if (!allowedFields.has(field)) return null;
      const isNumericParam = ['param1', 'param2', 'param3', 'param4'].includes(field);
      const buildOpValue = (sequelizeOperator, val) => {
        if (isNumericParam) {
          const castCol = SequelizeLib.cast(SequelizeLib.col(field), 'DECIMAL(18,6)');
          if (sequelizeOperator === Op.in || sequelizeOperator === Op.notIn) {
            const arr = Array.isArray(val) ? val : [val];
            const nums = arr.map(v => Number(v)).filter(v => !Number.isNaN(v));
            if (nums.length === 0) return null;
            return SequelizeLib.where(castCol, sequelizeOperator, nums);
          }
          if (sequelizeOperator === Op.between || sequelizeOperator === Op.notBetween) {
            if (!Array.isArray(val) || val.length !== 2) return null;
            const a = Number(val[0]); const b = Number(val[1]);
            if (Number.isNaN(a) || Number.isNaN(b)) return null;
            return SequelizeLib.where(castCol, sequelizeOperator, [a, b]);
          }
          const n = Number(val);
          if (Number.isNaN(n)) return null;
          return SequelizeLib.where(castCol, sequelizeOperator, n);
        }
        if (field === 'timestamp' && (sequelizeOperator === Op.between || sequelizeOperator === Op.gte || sequelizeOperator === Op.lte || sequelizeOperator === Op.gt || sequelizeOperator === Op.lt || sequelizeOperator === Op.eq || sequelizeOperator === Op.ne)) {
          const toDate = (d) => {
            if (d instanceof Date) return d; if (typeof d === 'string' || typeof d === 'number') return new Date(d); return null;
          };
          if (sequelizeOperator === Op.between) {
            if (!Array.isArray(val) || val.length !== 2) return null;
            const a = toDate(val[0]); const b = toDate(val[1]);
            if (!a || !b) return null; return { [field]: { [Op.between]: [a, b] } };
          }
          const d = toDate(val); if (!d) return null; return { [field]: { [sequelizeOperator]: d } };
        }
        if (sequelizeOperator === Op.regexp) {
          if (typeof val !== 'string' || val.length > 200) return null; return { [field]: { [Op.regexp]: val } };
        }
        if (sequelizeOperator === Op.like) return { [field]: { [Op.like]: `%${val}%` } };
        if (sequelizeOperator === Op.in || sequelizeOperator === Op.notIn) {
          const arr = Array.isArray(val) ? val : String(val).split(',').map(s => s.trim()).filter(Boolean);
          return { [field]: { [sequelizeOperator]: arr } };
        }
        if (sequelizeOperator === Op.between || sequelizeOperator === Op.notBetween) {
          if (!Array.isArray(val) || val.length !== 2) return null; return { [field]: { [sequelizeOperator]: val } };
        }
        if (isNumericParam) {
          const n = Number(val); if (Number.isNaN(n)) return null; return SequelizeLib.where(SequelizeLib.cast(SequelizeLib.col(field), 'DECIMAL(18,6)'), sequelizeOperator, n);
        }
        return { [field]: { [sequelizeOperator]: val } };
      };
      switch ((operator || '').toLowerCase()) {
        case 'firstof': firstOccurrenceRequested = true; return null;
        case '=': return buildOpValue(Op.eq, value);
        case '!=':
        case '<>': return buildOpValue(Op.ne, value);
        case '>': return buildOpValue(Op.gt, value);
        case '>=': return buildOpValue(Op.gte, value);
        case '<': return buildOpValue(Op.lt, value);
        case '<=': return buildOpValue(Op.lte, value);
        case 'between': return buildOpValue(Op.between, value);
        case 'notbetween': return buildOpValue(Op.notBetween, value);
        case 'in': return buildOpValue(Op.in, value);
        case 'notin': return buildOpValue(Op.notIn, value);
        case 'like':
        case 'contains': return buildOpValue(Op.like, value);
        case 'notcontains': return { [field]: { [Op.notLike]: `%${value}%` } };
        case 'startswith': return { [field]: { [Op.like]: `${value}%` } };
        case 'endswith': return { [field]: { [Op.like]: `%${value}` } };
        case 'regex': return buildOpValue(Op.regexp, value);
        default: return null;
      }
    };

    const normalizeFilters = (raw) => {
      if (!raw) return null; let parsed = raw; if (typeof raw === 'string') { try { parsed = JSON.parse(raw); } catch (e) { return null; } } return parsed;
    };
    const advancedFilters = normalizeFilters(filters);
    const buildFromNode = (node) => {
      if (!node) return null;
      if (Array.isArray(node)) {
        const parts = node.map(n => buildFromNode(n)).filter(Boolean); if (parts.length === 0) return null; return { [Op.and]: parts };
      }
      if (node.field && node.operator) return buildCondition(node.field, node.operator, node.value);
      if (node.conditions && (node.logic === 'AND' || node.logic === 'OR')) {
        const childConds = node.conditions.map(child => buildFromNode(child)).filter(Boolean); if (childConds.length === 0) return null; return node.logic === 'OR' ? { [Op.or]: childConds } : { [Op.and]: childConds };
      }
      return null;
    };
    const advancedWhere = advancedFilters ? buildFromNode(advancedFilters) : null;
    if (advancedWhere) {
      if (where[Op.and]) where[Op.and].push(advancedWhere);
      else {
        const baseConds = []; Object.keys(where).forEach(k => { if (k !== Op.and && k !== Op.or) { baseConds.push({ [k]: where[k] }); delete where[k]; } });
        where[Op.and] = baseConds.length > 0 ? baseConds.concat([advancedWhere]) : [advancedWhere];
      }
    }

    // 权限：普通用户只能下载自己的日志明细
    const userRole = req.user.role_id;
    if (userRole === 3) {
      const userLogs = await Log.findAll({ where: { uploader_id: req.user.id }, attributes: ['id'] });
      const userLogIds = userLogs.map(log => log.id);
      if (where.log_id) {
        const requestedIds = Array.isArray(where.log_id[Op.in]) ? where.log_id[Op.in] : [where.log_id[Op.in]];
        const allowedIds = requestedIds.filter(id => userLogIds.includes(id));
        where.log_id = { [Op.in]: allowedIds };
      } else {
        where.log_id = { [Op.in]: userLogIds };
      }
    }

    // 响应头
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="batch_log_entries_${Date.now()}.csv"`);
    // UTF-8 BOM
    res.write('\uFEFF');
    // 表头
    const headers = ['日志文件','时间戳','故障码','参数1','参数2','参数3','参数4','释义'];
    res.write(headers.join(',') + '\n');

    const attributes = ['id','log_id','timestamp','error_code','param1','param2','param3','param4','explanation'];
    const idToNameCache = new Map();
    const getLogName = async (logId) => {
      if (idToNameCache.has(logId)) return idToNameCache.get(logId);
      const lg = await Log.findByPk(logId, { attributes: ['original_name'] });
      const name = lg?.original_name || '';
      idToNameCache.set(logId, name);
      return name;
    };
    const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const limit = 5000;
    let pageNum = 1;
    while (true) {
      const offset = (pageNum - 1) * limit;
      const rows = await LogEntry.findAll({
        where,
        attributes,
        offset,
        limit,
        order: [['timestamp','ASC']]
      });
      if (!rows || rows.length === 0) break;
      for (const row of rows) {
        const logName = await getLogName(row.log_id);
        const localTs = dayjs(row.timestamp).format('YYYY-MM-DD HH:mm:ss');
        const line = [
          csvEscape(logName),
          csvEscape(localTs),
          csvEscape(row.error_code),
          csvEscape(row.param1),
          csvEscape(row.param2),
          csvEscape(row.param3),
          csvEscape(row.param4),
          csvEscape(row.explanation)
        ].join(',');
        res.write(line + '\n');
      }
      if (rows.length < limit) break;
      pageNum += 1;
    }
    return res.end();
  } catch (err) {
    console.error('导出日志明细CSV失败:', err);
    return res.status(500).json({ message: '导出CSV失败', error: err.message });
  }
};

// 下载日志
const downloadLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await Log.findByPk(id);
    if (!log) return res.status(404).json({ message: '日志不存在' });
    
    // 权限控制：普通用户只能下载自己的日志，专家用户和管理员可以下载任何日志
    const userRole = req.user.role_id;
    if (userRole === 3 && log.uploader_id !== req.user.id) { // 普通用户且不是自己的日志
      return res.status(403).json({ message: '权限不足，只能下载自己的日志' });
    }
    
    // 优先从保存的解密文件中读取
    if (log.decrypted_path && fs.existsSync(log.decrypted_path)) {
      const fileContent = fs.readFileSync(log.decrypted_path, 'utf-8');
      
      // 设置响应头
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(log.decrypted_path)}"`);
      
      // 发送文件内容
      res.send(fileContent);
      return;
    }
    
    // 如果解密文件不存在，从数据库生成
    const entries = await LogEntry.findAll({ 
      where: { log_id: id }, 
      order: [['timestamp', 'ASC']] 
    });
    
    if (entries.length === 0) {
      return res.status(404).json({ message: '日志明细不存在' });
    }
    
    // 生成解密后的文件内容
    const fileContent = entries.map(entry => {
      const localTs = dayjs(entry.timestamp).format('YYYY-MM-DD HH:mm:ss');
      return `${localTs} ${entry.error_code} ${entry.param1} ${entry.param2} ${entry.param3} ${entry.param4} ${entry.explanation}`;
    }).join('\n');
    
    // 设置响应头
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="${log.original_name.replace('.medbot', '_decrypted.txt')}"`);
    
    // 发送文件内容
    res.send(fileContent);
  } catch (err) {
    res.status(500).json({ message: '下载失败', error: err.message });
  }
};

// 重新解析（仅更新释义）并同步更新本地解密文件 - 仅管理员
const reparseLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await Log.findByPk(id);
    if (!log) return res.status(404).json({ message: '日志不存在' });

    // 权限由路由中间件控制，这里不再重复校验角色，避免因 JWT 未包含角色导致误判

    // 标记为解析中，便于前端显示状态
    try {
      log.status = 'parsing';
      await log.save();
    } catch (_) {}

    // 读取现有明细
    const entries = await LogEntry.findAll({ where: { log_id: id }, order: [['timestamp', 'ASC']] });
    if (!entries || entries.length === 0) {
      return res.status(404).json({ message: '该日志没有明细可重新解析' });
    }

    // 为减少数据库查询，按 (subsystem, code) 预取 ErrorCode
    const pairKey = (s, c) => `${s}::${c}`;
    const requiredPairs = new Map();
    for (const e of entries) {
      const errorCodeStr = e.error_code || '';
      if (errorCodeStr.length >= 5) {
        const subsystem = errorCodeStr.charAt(0);
        const code = '0X' + errorCodeStr.slice(-4);
        requiredPairs.set(pairKey(subsystem, code), { subsystem, code });
      }
    }

    const pairList = Array.from(requiredPairs.values());
    const explanationsMap = new Map();
    if (pairList.length > 0) {
      for (const p of pairList) {
        try {
          const rec = await ErrorCode.findOne({ where: { subsystem: p.subsystem, code: p.code } });
          if (rec && rec.explanation) {
            explanationsMap.set(pairKey(p.subsystem, p.code), rec.explanation);
          }
        } catch (_) {}
      }
    }

    // 更新释义（仅 explanation 字段）
    let updatedCount = 0;
    for (const e of entries) {
      const errorCodeStr = e.error_code || '';
      let explanationTemplate = e.explanation || '';
      if (errorCodeStr.length >= 5) {
        const subsystem = errorCodeStr.charAt(0);
        const code = '0X' + errorCodeStr.slice(-4);
        const tpl = explanationsMap.get(pairKey(subsystem, code));
        if (tpl) explanationTemplate = tpl;
        const parsed = parseExplanation(
          explanationTemplate,
          e.param1,
          e.param2,
          e.param3,
          e.param4,
          {
            error_code: e.error_code,
            subsystem,
            arm: errorCodeStr?.charAt(1) || null,
            joint: errorCodeStr?.charAt(2) || null
          }
        );
        if (parsed !== e.explanation) {
          await LogEntry.update({ explanation: parsed }, { where: { id: e.id } });
          updatedCount += 1;
          // 同步内存值，供后续写文件
          e.explanation = parsed;
        }
      }
    }

    // 生成并覆盖本地解密文件
    const decryptedLines = entries.map(r => {
      const localTs = dayjs(r.timestamp).format('YYYY-MM-DD HH:mm:ss');
      return `${localTs} ${r.error_code} ${r.param1} ${r.param2} ${r.param3} ${r.param4} ${r.explanation || ''}`;
    }).join('\n');

    let outPath = log.decrypted_path;
    try {
      if (!outPath) {
        // 若之前未生成过，按设备目录与原始名推导
        let deviceFolder = UPLOAD_DIR;
        if (log.device_id) {
          deviceFolder = path.join(UPLOAD_DIR, log.device_id);
          if (!fs.existsSync(deviceFolder)) fs.mkdirSync(deviceFolder, { recursive: true });
        }
        const decryptedFileName = (log.original_name || `log_${log.id}.medbot`).replace('.medbot', '.txt');
        outPath = path.join(deviceFolder, decryptedFileName);
        log.decrypted_path = outPath;
      }
      fs.writeFileSync(outPath, decryptedLines, 'utf-8');
    } catch (fileErr) {
      console.error('写入解密文件失败:', fileErr);
    }

    // 更新日志元数据
    log.status = 'parsed';
    log.parse_time = new Date();
    await log.save();

    return res.json({ message: '重新解析完成', updated: updatedCount, total: entries.length, output: log.decrypted_path });
  } catch (err) {
    console.error('重新解析失败:', err);
    try {
      const { id } = req.params || {};
      if (id) {
        const log = await Log.findByPk(id);
        if (log) {
          log.status = 'failed';
          await log.save();
        }
      }
    } catch (_) {}
    return res.status(500).json({ message: '重新解析失败', error: err.message });
  }
};

// 批量重新解析（仅更新释义）并同步文件 - 仅管理员
const batchReparseLogs = async (req, res) => {
  try {
    const { logIds } = req.body || {};
    if (!Array.isArray(logIds) || logIds.length === 0) {
      return res.status(400).json({ message: '请提供要重新解析的日志ID列表' });
    }
    // 权限由路由中间件控制，这里不再重复校验角色

    // 将批量重新解析任务添加到队列
    console.log(`将批量重新解析任务添加到队列，日志数量: ${logIds.length}`);
    
    const job = await logProcessingQueue.add('batch-reparse', {
      logIds,
      userId: req.user ? req.user.id : null
    }, {
      priority: 2, // 中等优先级
      delay: 0, // 立即处理
      attempts: 3, // 重试3次
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });
    
    console.log(`批量重新解析任务已添加到队列，任务ID: ${job.id}`);
    
    res.json({ 
      message: `批量重新解析任务已加入队列，任务ID: ${job.id}`, 
      jobId: job.id,
      queued: true,
      logCount: logIds.length
    });
  } catch (err) {
    console.error('批量重新解析失败:', err);
    return res.status(500).json({ message: '批量重新解析失败', error: err.message });
  }
};

// 删除日志
const deleteLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await Log.findByPk(id);
    if (!log) return res.status(404).json({ message: '日志不存在' });
    
    // 权限控制：普通用户只能删除自己的日志，专家用户和管理员可以删除任何日志
    const userRole = req.user.role_id;
    if (userRole === 3 && log.uploader_id !== req.user.id) { // 普通用户且不是自己的日志
      return res.status(403).json({ message: '权限不足，只能删除自己上传的日志' });
    }
    
    // 删除解密文件（如果存在）
    if (log.decrypted_path && fs.existsSync(log.decrypted_path)) {
      fs.unlinkSync(log.decrypted_path);
    }
    
    // 删除相关的日志明细
    await LogEntry.destroy({ where: { log_id: id } });
    
    // 删除日志记录
    await log.destroy();
    res.json({ message: '删除成功' });
  } catch (err) {
    res.status(500).json({ message: '删除失败', error: err.message });
  }
};

// 根据密钥自动填充设备编号（优先从设备表查询，其次从日志表推断）
const autoFillDeviceId = async (req, res) => {
  try {
    const { key } = req.query;
    
    if (!key) {
      return res.status(400).json({ message: '请提供密钥' });
    }
    
    // 1) 设备表
    try {
      const device = await Device.findOne({ where: { device_key: key } });
      if (device && device.device_id) {
        return res.json({ device_id: device.device_id });
      }
    } catch (_) {}

    // 2) 在logs表中查找使用过该密钥的设备编号
    const log = await Log.findOne({
      where: { key_id: key },
      order: [['original_name', 'DESC']], // 获取最新的记录
      attributes: ['device_id']
    });
    
    if (log && log.device_id) {
      res.json({ device_id: log.device_id });
    } else {
      res.json({ device_id: null });
    }
  } catch (err) {
    res.status(500).json({ message: '自动填充失败', error: err.message });
  }
};

// 根据设备编号自动填充密钥（优先从设备表查询，其次从日志表推断）
const autoFillKey = async (req, res) => {
  try {
    const { device_id } = req.query;
    
    if (!device_id) {
      return res.status(400).json({ message: '请提供设备编号' });
    }
    
    // 1) 设备表
    try {
      const device = await Device.findOne({ where: { device_id } });
      if (device && device.device_key) {
        return res.json({ key: device.device_key });
      }
    } catch (_) {}

    // 2) 在logs表中查找该设备编号使用过的密钥
    const log = await Log.findOne({
      where: { device_id: device_id },
      order: [['original_name', 'DESC']], // 获取最新的记录
      attributes: ['key_id']
    });
    
    if (log && log.key_id) {
      res.json({ key: log.key_id });
    } else {
      res.json({ key: null });
    }
  } catch (err) {
    res.status(500).json({ message: '自动填充失败', error: err.message });
  }
};

// 验证密钥格式
const validateKey = (key) => {
  // 密钥格式：mac地址，例如 00-01-05-77-6a-09
  const macAddressRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  return macAddressRegex.test(key);
};

// 验证设备编号格式
const validateDeviceId = (deviceId) => {
  // 设备编号格式：允许数字+字母组合，例如 4371-01、ABC-12、123-XY
  const deviceIdRegex = /^[0-9A-Za-z]+-[0-9A-Za-z]+$/;
  return deviceIdRegex.test(deviceId);
};

    // 批量删除日志
    const batchDeleteLogs = async (req, res) => {
      try {
        const { logIds } = req.body;
        
        if (!logIds || !Array.isArray(logIds) || logIds.length === 0) {
          return res.status(400).json({ message: '请提供要删除的日志ID列表' });
        }
        
        const userRole = req.user.role_id;
        const userId = req.user.id;
        
        // 确保logIds是数字类型
        const numericLogIds = logIds.map(id => parseInt(id)).filter(id => !isNaN(id));
        
        if (numericLogIds.length === 0) {
          return res.status(400).json({ message: '提供的日志ID格式不正确' });
        }
        
        // 获取所有要删除的日志进行权限检查
        const logs = [];
        for (const id of numericLogIds) {
          const log = await Log.findByPk(id);
          if (log) {
            logs.push(log);
          }
        }
        
        if (logs.length === 0) {
          return res.status(404).json({ 
            message: '未找到要删除的日志',
            requestedIds: numericLogIds,
            foundCount: logs.length
          });
        }
        
        // 权限检查：普通用户只能删除自己的日志
        if (userRole === 3) {
          const unauthorizedLogs = logs.filter(log => log.uploader_id !== userId);
          if (unauthorizedLogs.length > 0) {
            return res.status(403).json({ 
              message: '权限不足，只能删除自己上传的日志',
              unauthorizedLogs: unauthorizedLogs.map(log => ({ id: log.id, original_name: log.original_name }))
            });
          }
        }
        
        // 将批量删除任务添加到队列
        console.log(`将批量删除任务添加到队列，日志数量: ${numericLogIds.length}`);
        
        const job = await logProcessingQueue.add('batch-delete', {
          logIds: numericLogIds,
          userId: req.user ? req.user.id : null
        }, {
          priority: 3, // 低优先级
          delay: 0, // 立即处理
          attempts: 3, // 重试3次
          backoff: {
            type: 'exponential',
            delay: 2000
          }
        });
        
        console.log(`批量删除任务已添加到队列，任务ID: ${job.id}`);
        
        res.json({ 
          message: `批量删除任务已加入队列，任务ID: ${job.id}`, 
          jobId: job.id,
          queued: true,
          logCount: numericLogIds.length
        });
      } catch (err) {
        console.error('批量删除失败:', err);
        res.status(500).json({ 
          message: '批量删除失败', 
          error: err.message
        });
      }
    };

// 批量下载日志
const batchDownloadLogs = async (req, res) => {
  try {
    const { logIds } = req.body;
    
    if (!logIds || !Array.isArray(logIds) || logIds.length === 0) {
      return res.status(400).json({ message: '请提供要下载的日志ID列表' });
    }
    
    const userRole = req.user.role_id;
    const userId = req.user.id;
    
    // 确保logIds是数字类型
    const numericLogIds = logIds.map(id => parseInt(id)).filter(id => !isNaN(id));
    
    if (numericLogIds.length === 0) {
      return res.status(400).json({ message: '提供的日志ID格式不正确' });
    }
    
    // 获取所有要下载的日志
    const logs = [];
    for (const id of numericLogIds) {
      const log = await Log.findByPk(id);
      if (log) {
        logs.push(log);
      }
    }
    
    if (logs.length === 0) {
      return res.status(404).json({ 
        message: '未找到要下载的日志',
        requestedIds: numericLogIds,
        foundCount: logs.length
      });
    }
    
    // 权限检查：普通用户只能下载自己的日志
    if (userRole === 3) {
      const unauthorizedLogs = logs.filter(log => log.uploader_id !== userId);
      if (unauthorizedLogs.length > 0) {
        return res.status(403).json({ 
          message: '权限不足，只能下载自己上传的日志',
          unauthorizedLogs: unauthorizedLogs.map(log => ({ id: log.id, original_name: log.original_name }))
        });
      }
    }
    
    // 检查是否所有日志都已解析完成
    const unparsedLogs = logs.filter(log => log.status !== 'parsed');
    if (unparsedLogs.length > 0) {
      return res.status(400).json({ 
        message: '部分日志尚未解析完成，无法下载',
        unparsedLogs: unparsedLogs.map(log => ({ id: log.id, original_name: log.original_name, status: log.status }))
      });
    }
    
    // 创建临时目录用于存放文件
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // 生成ZIP文件名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const zipFileName = `logs_batch_${timestamp}.zip`;
    const zipFilePath = path.join(tempDir, zipFileName);
    
    // 创建ZIP文件
    const archiver = require('archiver');
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // 设置压缩级别
    });
    
    output.on('close', () => {
      console.log(`ZIP文件创建完成: ${zipFilePath}, 大小: ${archive.pointer()} bytes`);
    });
    
    archive.on('error', (err) => {
      throw err;
    });
    
    archive.pipe(output);
    
    // 添加文件到ZIP
    for (const log of logs) {
      try {
        let fileContent = '';
        let fileName = '';
        
        // 优先从保存的解密文件中读取
        if (log.decrypted_path && fs.existsSync(log.decrypted_path)) {
          fileContent = fs.readFileSync(log.decrypted_path, 'utf-8');
          fileName = path.basename(log.decrypted_path);
        } else {
          // 如果解密文件不存在，从数据库生成
          const entries = await LogEntry.findAll({ 
            where: { log_id: log.id }, 
            order: [['timestamp', 'ASC']] 
          });
          
          if (entries.length > 0) {
            fileContent = entries.map(entry => {
              const localTs = dayjs(entry.timestamp).format('YYYY-MM-DD HH:mm:ss');
              return `${localTs} ${entry.error_code} ${entry.param1} ${entry.param2} ${entry.param3} ${entry.param4} ${entry.explanation}`;
            }).join('\n');
            fileName = log.original_name.replace('.medbot', '_decrypted.txt');
          }
        }
        
        if (fileContent) {
          // 在ZIP中创建子目录，按设备编号分组
          const deviceDir = log.device_id || 'unknown';
          const zipPath = `${deviceDir}/${fileName}`;
          archive.append(fileContent, { name: zipPath });
        }
      } catch (error) {
        console.error(`处理日志 ${log.id} 时出错:`, error);
        // 继续处理其他文件
      }
    }
    
    // 完成ZIP文件
    await archive.finalize();
    
    // 等待文件写入完成
    await new Promise((resolve, reject) => {
      output.on('close', resolve);
      output.on('error', reject);
    });
    
    // 设置响应头
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
    res.setHeader('Content-Length', fs.statSync(zipFilePath).size);
    
    // 发送ZIP文件
    const fileStream = fs.createReadStream(zipFilePath);
    fileStream.pipe(res);
    
    // 文件发送完成后删除临时文件
    fileStream.on('end', () => {
      try {
        fs.unlinkSync(zipFilePath);
        console.log(`临时文件已删除: ${zipFilePath}`);
      } catch (error) {
        console.error('删除临时文件失败:', error);
      }
    });
    
  } catch (err) {
    console.error('批量下载失败:', err);
    res.status(500).json({ 
      message: '批量下载失败', 
      error: err.message
    });
  }
};

// 手术统计分析
const analyzeSurgeryData = async (req, res) => {
  try {
    const { logId } = req.params;
    
    // 获取日志信息
    const log = await Log.findByPk(logId);
    if (!log) {
      return res.status(404).json({ message: '日志不存在' });
    }
    
    // 获取日志条目
    const entries = await LogEntry.findAll({
      where: { log_id: logId },
      order: [['timestamp', 'ASC']],
      raw: true
    });
    
    if (entries.length === 0) {
      return res.status(404).json({ message: '日志条目不存在' });
    }
    
    // 为每个条目添加日志文件名信息
    const entriesWithLogName = entries.map(entry => ({
      ...entry,
      log_name: log.original_name
    }));
    
    // 使用更完善的手术分析逻辑
    const { analyzeSurgeries } = require('./surgeryStatisticsController');
    const surgeries = analyzeSurgeries(entriesWithLogName);
    
    // 为每个手术分配唯一ID
    surgeries.forEach((surgery, index) => {
      surgery.id = index + 1;
      surgery.log_filename = log.original_name;
    });
    
    res.json({
      success: true,
      data: surgeries,
      message: `成功分析出 ${surgeries.length} 场手术数据`
    });
  } catch (err) {
    console.error('手术统计分析失败:', err);
    res.status(500).json({ message: '手术统计分析失败', error: err.message });
  }
};

// 从日志条目中分析手术数据
const analyzeSurgeryFromEntries = (entries, log) => {
  const surgeryData = {
    logInfo: {
      id: log.id,
      originalName: log.original_name,
      deviceId: log.device_id,
      uploadTime: log.upload_time,
      parseTime: log.parse_time
    },
    surgeryInfo: {
      startTime: null,
      endTime: null,
      totalDuration: 0,
      powerOnTime: null,
      powerOffTime: null
    },
    toolArms: {
      arm1: { totalActiveTime: 0, tools: [], energyTime: 0 },
      arm2: { totalActiveTime: 0, tools: [], energyTime: 0 },
      arm3: { totalActiveTime: 0, tools: [], energyTime: 0 },
      arm4: { totalActiveTime: 0, tools: [], energyTime: 0 }
    },
    safetyAlarms: [],
    stateMachineChanges: [],
    footPedalSignals: {
      energy: 0,
      clutch: 0,
      camera: 0
    },
    handClutchSignals: {
      arm1: 0,
      arm2: 0,
      arm3: 0,
      arm4: 0
    }
  };
  
  // 分析每个日志条目
  entries.forEach(entry => {
    const timestamp = new Date(entry.timestamp);
    const errorCode = entry.error_code;
    const explanation = entry.explanation || '';
    
    // 分析开机/关机时间
    if (explanation.includes('开机') || explanation.includes('系统启动') || explanation.includes('power on')) {
      if (!surgeryData.surgeryInfo.powerOnTime || timestamp < surgeryData.surgeryInfo.powerOnTime) {
        surgeryData.surgeryInfo.powerOnTime = timestamp;
      }
    }
    
    if (explanation.includes('关机') || explanation.includes('系统关闭') || explanation.includes('power off')) {
      if (!surgeryData.surgeryInfo.powerOffTime || timestamp > surgeryData.surgeryInfo.powerOffTime) {
        surgeryData.surgeryInfo.powerOffTime = timestamp;
      }
    }
    
    // 分析手术开始/结束时间
    if (explanation.includes('手术开始') || explanation.includes('surgery start')) {
      if (!surgeryData.surgeryInfo.startTime || timestamp < surgeryData.surgeryInfo.startTime) {
        surgeryData.surgeryInfo.startTime = timestamp;
      }
    }
    
    if (explanation.includes('手术结束') || explanation.includes('surgery end')) {
      if (!surgeryData.surgeryInfo.endTime || timestamp > surgeryData.surgeryInfo.endTime) {
        surgeryData.surgeryInfo.endTime = timestamp;
      }
    }
    
    // 分析工具臂使用情况
    if (explanation.includes('工具臂1') || explanation.includes('arm 1')) {
      surgeryData.toolArms.arm1.totalActiveTime += 1; // 假设每个条目代表1秒
      if (explanation.includes('能量') || explanation.includes('energy')) {
        surgeryData.toolArms.arm1.energyTime += 1;
      }
    }
    
    if (explanation.includes('工具臂2') || explanation.includes('arm 2')) {
      surgeryData.toolArms.arm2.totalActiveTime += 1;
      if (explanation.includes('能量') || explanation.includes('energy')) {
        surgeryData.toolArms.arm2.energyTime += 1;
      }
    }
    
    if (explanation.includes('工具臂3') || explanation.includes('arm 3')) {
      surgeryData.toolArms.arm3.totalActiveTime += 1;
      if (explanation.includes('能量') || explanation.includes('energy')) {
        surgeryData.toolArms.arm3.energyTime += 1;
      }
    }
    
    if (explanation.includes('工具臂4') || explanation.includes('arm 4')) {
      surgeryData.toolArms.arm4.totalActiveTime += 1;
      if (explanation.includes('能量') || explanation.includes('energy')) {
        surgeryData.toolArms.arm4.energyTime += 1;
      }
    }
    
    // 分析安全报警
    if (explanation.includes('报警') || explanation.includes('警告') || explanation.includes('错误') || 
        explanation.includes('alarm') || explanation.includes('warning') || explanation.includes('error')) {
      surgeryData.safetyAlarms.push({
        timestamp: timestamp,
        type: explanation.includes('错误') || explanation.includes('error') ? 'error' : 'warning',
        message: explanation
      });
    }
    
    // 分析状态机变化
    if (explanation.includes('状态') || explanation.includes('state')) {
      surgeryData.stateMachineChanges.push({
        timestamp: timestamp,
        state: explanation
      });
    }
    
    // 分析脚踏信号
    if (explanation.includes('能量脚踏') || explanation.includes('energy pedal')) {
      surgeryData.footPedalSignals.energy++;
    }
    if (explanation.includes('离合脚踏') || explanation.includes('clutch pedal')) {
      surgeryData.footPedalSignals.clutch++;
    }
    if (explanation.includes('镜头控制') || explanation.includes('camera control')) {
      surgeryData.footPedalSignals.camera++;
    }
    
    // 分析手离合信号
    if (explanation.includes('手离合') && explanation.includes('1')) {
      surgeryData.handClutchSignals.arm1++;
    }
    if (explanation.includes('手离合') && explanation.includes('2')) {
      surgeryData.handClutchSignals.arm2++;
    }
    if (explanation.includes('手离合') && explanation.includes('3')) {
      surgeryData.handClutchSignals.arm3++;
    }
    if (explanation.includes('手离合') && explanation.includes('4')) {
      surgeryData.handClutchSignals.arm4++;
    }
  });
  
  // 计算总手术时长
  if (surgeryData.surgeryInfo.startTime && surgeryData.surgeryInfo.endTime) {
    surgeryData.surgeryInfo.totalDuration = 
      Math.floor((surgeryData.surgeryInfo.endTime - surgeryData.surgeryInfo.startTime) / 1000 / 60); // 分钟
  }
  
  // 模拟工具使用详情（基于实际数据生成）
  surgeryData.toolArms.arm1.tools = generateToolUsage(surgeryData.toolArms.arm1.totalActiveTime, 'arm1');
  surgeryData.toolArms.arm2.tools = generateToolUsage(surgeryData.toolArms.arm2.totalActiveTime, 'arm2');
  surgeryData.toolArms.arm3.tools = generateToolUsage(surgeryData.toolArms.arm3.totalActiveTime, 'arm3');
  surgeryData.toolArms.arm4.tools = generateToolUsage(surgeryData.toolArms.arm4.totalActiveTime, 'arm4');
  
  return surgeryData;
};

// 生成工具使用详情
const generateToolUsage = (totalTime, armId) => {
  const tools = [];
  const toolTypes = [
    { name: '腹腔镜抓钳', udi: 'LAP-GRIP-2023-0515' },
    { name: '电凝钩', udi: 'ELEC-HOOK-7845' },
    { name: '吸引器', udi: 'SUCT-2023-1122' },
    { name: '持针器', udi: 'NEEDLE-5566' },
    { name: '缝合器', udi: 'SUT-2023-4587' },
    { name: '切割吻合器', udi: 'CUT-ANAST-9988' }
  ];
  
  if (totalTime > 0) {
    // 根据总时间分配工具使用
    const tool1 = toolTypes[Math.floor(Math.random() * toolTypes.length)];
    const time1 = Math.floor(totalTime * 0.7);
    tools.push({
      name: tool1.name,
      udi: tool1.udi,
      startTime: '08:50',
      endTime: '10:55',
      duration: time1
    });
    
    if (totalTime > time1) {
      const tool2 = toolTypes[Math.floor(Math.random() * toolTypes.length)];
      const time2 = totalTime - time1;
      tools.push({
        name: tool2.name,
        udi: tool2.udi,
        startTime: '10:55',
        endTime: '11:25',
        duration: time2
      });
    }
  }
  
  return tools;
};

module.exports = {
  getLogs,
  uploadLog,
  parseLog,
  reparseLog,
  batchReparseLogs,
  exportBatchLogEntriesCSV,
  getLogEntries,
  getBatchLogEntries,
  downloadLog,
  deleteLog,
  autoFillDeviceId,
  autoFillKey,
  batchDeleteLogs,
  batchDownloadLogs,
  analyzeSurgeryData,
  getSearchTemplates,
  importSearchTemplates,
  getQueueStatus
}; 