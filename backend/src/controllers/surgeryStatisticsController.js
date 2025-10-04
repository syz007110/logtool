const LogEntry = require('../models/log_entry');
const Log = require('../models/log');
const SurgeryAnalyzer = require('../services/surgeryAnalyzer');
const { Op } = require('sequelize');

// 格式化为UTC时间（用于写库，统一为UTC）
function formatUtcDateTime(dateLike) {
  if (!dateLike) return null;
  try {
    if (typeof dateLike === 'string') {
      const s = dateLike.trim();
      // 数据库常见格式：YYYY-MM-DD HH:mm:ss -> 严格按UTC解析
      if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(s)) {
        return new Date(s.replace(' ', 'T') + 'Z');
      }
      // 已是ISO UTC格式
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(s)) {
        return new Date(s);
      }
    }
    const d = new Date(dateLike);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch (_) {
    return null;
  }
}

// 格式化时间为UTC格式（用于API返回，保持UTC时间格式）
function formatTimeForDisplay(dateLike) {
  if (!dateLike) return null;
  
  let d;
  if (dateLike instanceof Date) {
    d = dateLike;
  } else if (typeof dateLike === 'string') {
    // 如果是UTC格式字符串，需要正确处理
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(dateLike)) {
      // 数据库中的UTC格式，添加Z标识符
      d = new Date(dateLike.replace(' ', 'T') + 'Z');
    } else {
      d = new Date(dateLike);
    }
  } else {
    d = new Date(dateLike);
  }
  
  if (Number.isNaN(d.getTime())) return null;
  
  // 直接返回UTC时间的ISO字符串格式，让前端处理时区转换
  return d.toISOString();
}

// 递归规范化 structured_data 内所有时间戳为Date对象
function normalizeStructuredDataTimestamps(node) {
  if (node == null) return node;
  if (Array.isArray(node)) {
    return node.map((item) => normalizeStructuredDataTimestamps(item));
  }
  if (typeof node === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (value == null) { out[key] = value; continue; }
      const lowerKey = String(key).toLowerCase();
      const isTimeKey = lowerKey.endsWith('time') || lowerKey.endsWith('timestamp') ||
        lowerKey === 'start_time' || lowerKey === 'end_time' || lowerKey === 'on_time' || lowerKey === 'off_time';
      if (isTimeKey && (typeof value === 'string' || typeof value === 'number' || value instanceof Date)) {
        const formatted = formatUtcDateTime(value);
        out[key] = formatted !== null ? formatted : value;
      } else {
        out[key] = normalizeStructuredDataTimestamps(value);
      }
    }
    return out;
  }
  // 原始类型直接返回
  return node;
}

// 辅助：格式化时间为YYYYMMDDHHMM
function formatTimeForId(dateStr) {
  if (!dateStr) return '000000000000';
  // 确保使用UTC解析生成稳定ID
  let d;
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(dateStr)) {
    d = new Date(dateStr.replace(' ', 'T') + 'Z');
  } else {
    d = new Date(dateStr);
  }
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes())
  );
}

// 辅助：从 surgery_id 提取设备编号前缀（device_id 字符串）
function extractDeviceIdFromSurgeryId(surgeryId) {
  if (!surgeryId || typeof surgeryId !== 'string') return 'UNKNOWN';
  const parts = surgeryId.split('-');
  if (parts.length <= 1) return surgeryId;
  return parts.slice(0, parts.length - 1).join('-');
}

// 辅助：构建surgeries表行预览（去除重复字段）
function buildPostgresRowPreview(surgery, deviceId) {
  // 确保 structured_data 存在
  let structured = surgery.postgresql_structure || null;
  if (!structured) {
    try {
      const analyzer = new SurgeryAnalyzer();
      structured = analyzer.toPostgreSQLStructure(surgery);
    } catch (_) {}
  }
  structured = normalizeStructuredDataTimestamps(structured);
  
  // 构建干净的PostgreSQL格式数据，避免重复字段
  const postgresqlData = {
    surgery_id: surgery.surgery_id || `${deviceId || 'UNKNOWN'}-${formatTimeForId(surgery.surgery_start_time)}`,
    source_log_ids: Array.isArray(surgery.source_log_ids)
      ? surgery.source_log_ids
      : (surgery.log_id ? [surgery.log_id] : []),
    device_ids: deviceId ? [String(deviceId)] : [],
    log_entry_start_id: surgery.log_entry_start_id || null,
    log_entry_end_id: surgery.log_entry_end_id || null,
    start_time: formatUtcDateTime(surgery.surgery_start_time),
    end_time: formatUtcDateTime(surgery.surgery_end_time),
    has_fault: (structured?.surgery_stats?.has_fault) ?? (surgery.has_error || false),
    is_remote: surgery.is_remote_surgery || false,
    success: (structured?.surgery_stats?.success) ?? !(surgery.has_error || false)
  };
  
  // 清理structured_data中的重复字段，只保留核心分析数据
  if (structured) {
    const cleanStructuredData = { ...structured };
    
    // 移除可能与顶层字段重复的信息
    delete cleanStructuredData.surgery_id;
    delete cleanStructuredData.start_time;
    delete cleanStructuredData.end_time;
    delete cleanStructuredData.device_id;
    delete cleanStructuredData.device_ids;
    delete cleanStructuredData.source_log_ids;
    
    postgresqlData.structured_data = cleanStructuredData;
  } else {
    postgresqlData.structured_data = null;
  }
  
  return postgresqlData;
}

// 辅助：构建将要写入surgeries表的标准行（去除重复字段）
function buildDbRowFromSurgery(surgery) {
  const devicePrefix = extractDeviceIdFromSurgeryId(surgery.surgery_id);
  // 确保 structured_data 存在
  let structured = surgery.postgresql_structure || null;
  if (!structured) {
    try {
      const analyzer = new SurgeryAnalyzer();
      structured = analyzer.toPostgreSQLStructure(surgery);
    } catch (_) {}
  }
  structured = normalizeStructuredDataTimestamps(structured);
  const hasFault = (structured?.surgery_stats?.has_fault) ?? (surgery.has_error || false);
  
  // 构建干净的PostgreSQL格式数据，避免重复字段
  const postgresqlData = {
    surgery_id: surgery.surgery_id,
    source_log_ids: Array.isArray(surgery.source_log_ids)
      ? surgery.source_log_ids
      : (surgery.log_id ? [surgery.log_id] : []),
    device_ids: devicePrefix ? [devicePrefix] : [],
    log_entry_start_id: surgery.log_entry_start_id || null,
    log_entry_end_id: surgery.log_entry_end_id || null,
    start_time: formatUtcDateTime(surgery.surgery_start_time),
    end_time: formatUtcDateTime(surgery.surgery_end_time),
    has_fault: hasFault,
    is_remote: surgery.is_remote_surgery || false,
    success: (structured?.surgery_stats?.success) ?? !hasFault
  };
  
  // 清理structured_data中的重复字段，只保留核心分析数据
  if (structured) {
    const cleanStructuredData = { ...structured };
    
    // 移除可能与顶层字段重复的信息
    delete cleanStructuredData.surgery_id;
    delete cleanStructuredData.start_time;
    delete cleanStructuredData.end_time;
    delete cleanStructuredData.device_id;
    delete cleanStructuredData.device_ids;
    delete cleanStructuredData.source_log_ids;
    
    postgresqlData.structured_data = cleanStructuredData;
  } else {
    postgresqlData.structured_data = null;
  }
  
  return postgresqlData;
}

// 任务队列管理
const analysisTasks = new Map();
let taskCounter = 0;

// 获取当前活跃的分析任务数量
const getActiveAnalysisCount = async () => {
  let activeCount = 0;
  for (const [taskId, task] of analysisTasks) {
    if (task.status === 'processing') {
      activeCount++;
    }
  }
  return activeCount;
};

// 创建分析任务
const createAnalysisTask = (logIds, userId) => {
  const taskId = ++taskCounter;
  const task = {
    id: taskId,
    logIds: logIds,
    userId: userId,
    status: 'pending',
    progress: 0,
    result: null,
    error: null,
    createdAt: new Date(),
    startedAt: null,
    completedAt: null
  };
  
  analysisTasks.set(taskId, task);
  return taskId;
};

// 更新任务状态
const updateTaskStatus = (taskId, status, progress = null, result = null, error = null) => {
  const task = analysisTasks.get(taskId);
  if (task) {
    task.status = status;
    if (progress !== null) task.progress = progress;
    if (result !== null) task.result = result;
    if (error !== null) task.error = error;
    
    if (status === 'processing' && !task.startedAt) {
      task.startedAt = new Date();
    } else if (status === 'completed' || status === 'failed') {
      task.completedAt = new Date();
    }
  }
};

// 清理已完成的任务（保留最近100个）
const cleanupCompletedTasks = () => {
  const completedTasks = Array.from(analysisTasks.entries())
    .filter(([id, task]) => task.status === 'completed' || task.status === 'failed')
    .sort((a, b) => b[1].completedAt - a[1].completedAt);
  
  // 保留最近100个已完成的任务
  if (completedTasks.length > 100) {
    const toDelete = completedTasks.slice(100);
    toDelete.forEach(([taskId]) => {
      analysisTasks.delete(taskId);
    });
  }
};

/**
 * 分析手术数据的主要函数
 * @param {Array} logEntries - 日志条目数组
 * @param {Object} options - 分析选项
 * @returns {Array} 手术数据数组
 */
function analyzeSurgeries(logEntries, options = {}) {
  const analyzer = new SurgeryAnalyzer();
  const surgeries = analyzer.analyze(logEntries);
  
  // 如果需要PostgreSQL结构化数据
  if (options.includePostgreSQLStructure) {
    surgeries.forEach(surgery => {
      surgery.postgresql_structure = analyzer.toPostgreSQLStructure(surgery);
    });
  }
  
  // 保存到全局变量，供导出功能使用
  global.currentSurgeries = surgeries;
  
  return surgeries;
}

// 获取指定日志的手术统计数据（实时分析）
const getAllSurgeryStatistics = async (req, res) => {
  try {
    const { logIds, includePostgreSQLStructure } = req.query;
    
    let logs;
    if (logIds) {
      // 如果指定了日志ID，只分析指定的日志
      const logIdArray = logIds.split(',').map(id => parseInt(id.trim()));
      logs = await Log.findAll({
        where: { id: { [Op.in]: logIdArray } },
        order: [['original_name', 'DESC']]
      });
      console.log(`分析指定的 ${logs.length} 个日志文件`);
    } else {
      // 如果没有指定，分析所有日志
      logs = await Log.findAll({
        order: [['original_name', 'DESC']]
      });
      console.log(`分析所有 ${logs.length} 个日志文件`);
    }

    const allSurgeries = [];
    let surgeryIdCounter = 1;

    // 辅助：计算某个手术在给定条目集合中的来源日志与条目范围
    // 优先使用：手术开始时间前的第一个开机时间 ---- 手术结束时间后的第一个关机时间
    // 回退使用：手术开始时间 ---- 手术结束时间
    const computeSourceAndEntryRange = (surgery, entries) => {
      try {
        // 获取手术开始和结束时间
        const surgeryStart = new Date(surgery.surgery_start_time).getTime();
        const surgeryEnd = new Date(surgery.surgery_end_time).getTime();
        
        if (!Number.isFinite(surgeryStart) || !Number.isFinite(surgeryEnd)) {
          return { sourceLogIds: [], minEntryId: null, maxEntryId: null };
        }

        // 获取开机和关机时间
        const powerOnTimes = surgery.power_on_times || [];
        const shutdownTimes = surgery.shutdown_times || [];

        // 确定时间窗口的起止点
        let windowStart = surgeryStart;
        let windowEnd = surgeryEnd;

        // 查找手术开始时间前的第一个开机时间
        const validPowerOnTimes = powerOnTimes
          .map(time => new Date(time).getTime())
          .filter(time => Number.isFinite(time) && time <= surgeryStart)
          .sort((a, b) => b - a); // 降序排列，取最近的
        
        if (validPowerOnTimes.length > 0) {
          windowStart = validPowerOnTimes[0]; // 最近的（最大的）开机时间
        }

        // 查找手术结束时间后的第一个关机时间
        const validShutdownTimes = shutdownTimes
          .map(time => new Date(time).getTime())
          .filter(time => Number.isFinite(time) && time >= surgeryEnd)
          .sort((a, b) => a - b); // 升序排列，取最近的
        
        if (validShutdownTimes.length > 0) {
          windowEnd = validShutdownTimes[0]; // 最近的（最小的）关机时间
        }

        // 过滤在时间窗口内的日志条目
        const involved = entries.filter(e => {
          const t = new Date(e.timestamp).getTime();
          return Number.isFinite(t) && t >= windowStart && t <= windowEnd;
        });

        // 提取涉及的日志ID
        const sourceLogIds = Array.from(new Set(involved.map(e => e.log_id).filter(Boolean)));
        
        // 提取日志条目ID范围
        const ids = involved.map(e => e.id).filter(id => 
          typeof id === 'number' || (typeof id === 'string' && id.trim() !== '')
        );
        const minEntryId = ids.length ? Math.min(...ids.map(n => Number(n))) : null;
        const maxEntryId = ids.length ? Math.max(...ids.map(n => Number(n))) : null;

        return { sourceLogIds, minEntryId, maxEntryId };
      } catch (_) {
        return { sourceLogIds: [], minEntryId: null, maxEntryId: null };
      }
    };

    // 分析每个日志
    for (const log of logs) {
      console.log(`开始分析日志: ${log.filename} (ID: ${log.id})`)
      const logEntries = await LogEntry.findAll({
        where: { log_id: log.id },
        order: [['timestamp', 'ASC']]
      });

      console.log(`日志 ${log.filename} 包含 ${logEntries.length} 个条目`)
      
      if (logEntries.length > 0) {
        const surgeries = analyzeSurgeries(logEntries, { 
          includePostgreSQLStructure: true 
        });
        console.log(`从日志 ${log.filename} 分析出 ${surgeries.length} 场手术`)
        
        // 为每个手术分配唯一ID，并生成surgery_id与预览行
        surgeries.forEach(surgery => {
          surgery.id = surgeryIdCounter++;
          surgery.log_filename = log.filename;
          const deviceDisplayId = (log && log.device_id !== undefined && log.device_id !== null) ? String(log.device_id) : 'UNKNOWN';
          surgery.device_id = deviceDisplayId;
          surgery.device_ids = deviceDisplayId ? [deviceDisplayId] : [];
          surgery.surgery_id = `${deviceDisplayId}-${formatTimeForId(surgery.surgery_start_time)}`;
          // 计算来源日志与条目范围（基于开机/关机时间的扩展时间窗口）
          const { sourceLogIds, minEntryId, maxEntryId } = computeSourceAndEntryRange(surgery, logEntries);
          // 使用计算出的时间窗口确定source_log_ids
          surgery.source_log_ids = sourceLogIds.length ? sourceLogIds : [log.id];
          surgery.log_entry_start_id = minEntryId;
          surgery.log_entry_end_id = maxEntryId;
          if (includePostgreSQLStructure === 'true') {
            surgery.postgresql_row_preview = buildPostgresRowPreview(surgery, deviceDisplayId);
          }
        });
        
        allSurgeries.push(...surgeries);
      }
    }

    console.log(`分析完成，共发现 ${allSurgeries.length} 场手术`)
    const dbRows = allSurgeries.map(s => buildDbRowFromSurgery(s));
    res.json({
      success: true,
      data: dbRows,
      message: `成功分析出 ${dbRows.length} 场手术数据库行`
    });

  } catch (error) {
    console.error('获取手术统计数据失败:', error);
    res.status(500).json({ message: '获取手术统计数据失败', error: error.message });
  }
};

// 使用前端传递的已排序日志条目进行分析
const analyzeSortedLogEntries = async (req, res) => {
  try {
    const { logEntries } = req.body;
    
    if (!logEntries || !Array.isArray(logEntries) || logEntries.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供有效的日志条目数据'
      });
    }

    console.log(`开始分析前端传递的 ${logEntries.length} 条已排序日志条目`);
    
    // 验证日志条目数据结构
    const requiredFields = ['timestamp', 'error_code', 'param1', 'param2', 'param3', 'param4'];
    const isValidEntry = logEntries.every(entry => 
      requiredFields.every(field => entry.hasOwnProperty(field))
    );
    
    if (!isValidEntry) {
      return res.status(400).json({
        success: false,
        message: '日志条目数据格式不正确，缺少必要字段'
      });
    }

    // 使用新的分析器进行分析
    const surgeries = analyzeSurgeries(logEntries, { 
      includePostgreSQLStructure: true 
    });
    console.log(`从已排序日志条目分析出 ${surgeries.length} 场手术`);

    // 通过log_id尝试获取device_id（如存在），生成surgery_id与预览行
    const uniqueLogIds = Array.from(new Set((logEntries || []).map(e => e.log_id).filter(Boolean)));
    const logMap = new Map();
    if (uniqueLogIds.length > 0) {
      const logs = await Log.findAll({ where: { id: { [Op.in]: uniqueLogIds } } });
      logs.forEach(l => logMap.set(l.id, l));
    }

    surgeries.forEach((surgery, index) => {
      surgery.id = index + 1;
      surgery.log_filename = '已排序日志条目';
      const deviceDisplayId = surgery.log_id && logMap.get(surgery.log_id) && logMap.get(surgery.log_id).device_id !== undefined && logMap.get(surgery.log_id).device_id !== null
        ? String(logMap.get(surgery.log_id).device_id)
        : 'UNKNOWN';
      surgery.device_id = deviceDisplayId;
      surgery.device_ids = deviceDisplayId ? [deviceDisplayId] : [];
      surgery.surgery_id = `${deviceDisplayId}-${formatTimeForId(surgery.surgery_start_time)}`;
      // 计算来源日志与条目范围（基于开机/关机时间的扩展时间窗口）
      try {
        // 获取手术开始和结束时间
        const surgeryStart = new Date(surgery.surgery_start_time).getTime();
        const surgeryEnd = new Date(surgery.surgery_end_time).getTime();
        
        if (Number.isFinite(surgeryStart) && Number.isFinite(surgeryEnd)) {
          // 获取开机和关机时间
          const powerOnTimes = surgery.power_on_times || [];
          const shutdownTimes = surgery.shutdown_times || [];

          // 确定时间窗口的起止点
          let windowStart = surgeryStart;
          let windowEnd = surgeryEnd;

          // 查找手术开始时间前的第一个开机时间
          const validPowerOnTimes = powerOnTimes
            .map(time => new Date(time).getTime())
            .filter(time => Number.isFinite(time) && time <= surgeryStart)
            .sort((a, b) => b - a); // 降序排列，取最近的
          
          if (validPowerOnTimes.length > 0) {
            windowStart = validPowerOnTimes[0]; // 最近的（最大的）开机时间
          }

          // 查找手术结束时间后的第一个关机时间
          const validShutdownTimes = shutdownTimes
            .map(time => new Date(time).getTime())
            .filter(time => Number.isFinite(time) && time >= surgeryEnd)
            .sort((a, b) => a - b); // 升序排列，取最近的
          
          if (validShutdownTimes.length > 0) {
            windowEnd = validShutdownTimes[0]; // 最近的（最小的）关机时间
          }

          // 过滤在时间窗口内的日志条目
          const involved = (logEntries || []).filter(e => {
            const t = new Date(e.timestamp).getTime();
            return Number.isFinite(t) && t >= windowStart && t <= windowEnd;
          });

          // 提取涉及的日志ID
          const sourceLogIds = Array.from(new Set(involved.map(e => e.log_id).filter(Boolean)));
          surgery.source_log_ids = sourceLogIds.length ? sourceLogIds : [];
          
          // 提取日志条目ID范围
          const ids = involved.map(e => e.id).filter(id => typeof id !== 'undefined');
          if (ids.length) {
            const numeric = ids.map(n => Number(n)).filter(v => Number.isFinite(v));
            surgery.log_entry_start_id = numeric.length ? Math.min(...numeric) : null;
            surgery.log_entry_end_id = numeric.length ? Math.max(...numeric) : null;
          } else {
            surgery.log_entry_start_id = null;
            surgery.log_entry_end_id = null;
          }
        } else {
          surgery.source_log_ids = [];
          surgery.log_entry_start_id = null;
          surgery.log_entry_end_id = null;
        }
      } catch (_) {
        surgery.source_log_ids = [];
        surgery.log_entry_start_id = null;
        surgery.log_entry_end_id = null;
      }
      if (includePostgreSQLStructure === true) {
        surgery.postgresql_row_preview = buildPostgresRowPreview(surgery, deviceDisplayId);
      }
    });

    console.log(`分析完成，共发现 ${surgeries.length} 场手术`);
    const dbRows = surgeries.map(s => buildDbRowFromSurgery(s));
    res.json({
      success: true,
      data: dbRows,
      message: `成功分析出 ${dbRows.length} 场手术数据库行（使用已排序日志条目）`
    });

  } catch (error) {
    console.error('分析已排序日志条目失败:', error);
    res.status(500).json({ 
      success: false,
      message: '分析已排序日志条目失败', 
      error: error.message 
    });
  }
};

// 导出手术报告PDF（占位符）
const exportSurgeryReport = async (req, res) => {
  try {
    const { id } = req.params;
    
    res.json({
      success: true,
      message: '手术报告导出功能开发中',
      data: {
        surgery_id: `Surgery-${id}`,
        download_url: `/api/surgery-statistics/${id}/report.pdf`
      }
    });
    
  } catch (error) {
    console.error('导出手术报告失败:', error);
    res.status(500).json({ message: '导出手术报告失败', error: error.message });
  }
};

// 通过日志ID列表直接分析手术数据（加入Redis队列，不改变分析逻辑）
const { surgeryAnalysisQueue } = require('../config/queue');
const analyzeByLogIds = async (req, res) => {
  try {
    const { logIds, includePostgreSQLStructure } = req.body;
    
    if (!logIds || !Array.isArray(logIds) || logIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供有效的日志ID列表'
      });
    }

    console.log(`[手术统计] 用户 ${req.user.id} 请求分析 ${logIds.length} 个日志文件（加入队列）`);

    const job = await surgeryAnalysisQueue.add('analyze-surgeries', {
      logIds,
      userId: req.user.id,
      includePostgreSQLStructure: includePostgreSQLStructure === true
    }, {
      priority: 1,
      attempts: 2,
      backoff: { type: 'exponential', delay: 3000 },
      removeOnComplete: 100,
      removeOnFail: 50
    });

    return res.json({
      success: true,
      taskId: job.id,
      message: '手术分析任务已加入队列，请稍后查询结果'
    });

  } catch (error) {
    console.error('创建手术分析队列任务失败:', error);
    res.status(500).json({ 
      success: false,
      message: '创建手术分析任务失败', 
      error: error.message 
    });
  }
};

// 异步处理分析任务
const processAnalysisTask = async (taskId, logIds, includePostgreSQLStructure = false) => {
  try {
    // 更新任务状态为处理中
    updateTaskStatus(taskId, 'processing', 0);
    
    // 获取所有日志的条目数据
    const allLogEntries = [];
    let processedLogs = 0;
    const logIdToDeviceId = new Map();
    
    for (const logId of logIds) {
      try {
        // 更新进度
        const progress = Math.round((processedLogs / logIds.length) * 80); // 80%用于数据获取
        updateTaskStatus(taskId, 'processing', progress);
        
        // 获取单个日志的所有条目
        const logEntries = await LogEntry.findAll({
          where: { log_id: logId },
          order: [['timestamp', 'ASC']],
          raw: true
        });
        
        // 为每个条目添加日志文件名信息
        const logInfo = await Log.findByPk(logId);
        const logName = logInfo ? logInfo.original_name : `日志${logId}`;
        if (logInfo && logInfo.device_id) {
          logIdToDeviceId.set(logId, logInfo.device_id);
        }
        
        const entriesWithLogName = logEntries.map(entry => ({
          ...entry,
          log_name: logName
        }));
        
        allLogEntries.push(...entriesWithLogName);
        processedLogs++;
        
        console.log(`日志 ${logName} (ID: ${logId}) 包含 ${logEntries.length} 条记录`);
        
      } catch (error) {
        console.error(`获取日志ID ${logId} 的条目失败:`, error);
        processedLogs++;
        // 继续处理其他日志，不中断整个分析过程
      }
    }
    
    if (allLogEntries.length === 0) {
      updateTaskStatus(taskId, 'failed', 100, null, '未找到任何日志条目数据');
      return;
    }
    
    console.log(`总共获取到 ${allLogEntries.length} 条日志条目`);
    
    // 更新进度到90%
    updateTaskStatus(taskId, 'processing', 90);
    
    // 使用新的分析器进行分析
    const surgeries = analyzeSurgeries(allLogEntries, { 
      includePostgreSQLStructure: includePostgreSQLStructure === true 
    });
    console.log(`从日志ID列表分析出 ${surgeries.length} 场手术`);
    
    // 为每个手术分配唯一ID与surgery_id
    surgeries.forEach((surgery, index) => {
      surgery.id = index + 1;
      surgery.log_filename = `批量日志分析 (${logIds.length}个文件)`;
      const deviceDisplayId = surgery.log_id && logIdToDeviceId.get(surgery.log_id) !== undefined && logIdToDeviceId.get(surgery.log_id) !== null
        ? String(logIdToDeviceId.get(surgery.log_id))
        : 'UNKNOWN';
      surgery.device_id = deviceDisplayId;
      surgery.device_ids = deviceDisplayId ? [deviceDisplayId] : [];
      surgery.surgery_id = `${deviceDisplayId}-${formatTimeForId(surgery.surgery_start_time)}`;
      // 计算来源日志与条目范围（基于开机/关机时间的扩展时间窗口）
      try {
        // 获取手术开始和结束时间
        const surgeryStart = new Date(surgery.surgery_start_time).getTime();
        const surgeryEnd = new Date(surgery.surgery_end_time).getTime();
        
        if (Number.isFinite(surgeryStart) && Number.isFinite(surgeryEnd)) {
          // 获取开机和关机时间
          const powerOnTimes = surgery.power_on_times || [];
          const shutdownTimes = surgery.shutdown_times || [];

          // 确定时间窗口的起止点
          let windowStart = surgeryStart;
          let windowEnd = surgeryEnd;

          // 查找手术开始时间前的第一个开机时间
          const validPowerOnTimes = powerOnTimes
            .map(time => new Date(time).getTime())
            .filter(time => Number.isFinite(time) && time <= surgeryStart)
            .sort((a, b) => b - a); // 降序排列，取最近的
          
          if (validPowerOnTimes.length > 0) {
            windowStart = validPowerOnTimes[0]; // 最近的（最大的）开机时间
          }

          // 查找手术结束时间后的第一个关机时间
          const validShutdownTimes = shutdownTimes
            .map(time => new Date(time).getTime())
            .filter(time => Number.isFinite(time) && time >= surgeryEnd)
            .sort((a, b) => a - b); // 升序排列，取最近的
          
          if (validShutdownTimes.length > 0) {
            windowEnd = validShutdownTimes[0]; // 最近的（最小的）关机时间
          }

          // 过滤在时间窗口内的日志条目
          const involved = allLogEntries.filter(e => {
            const t = new Date(e.timestamp).getTime();
            return Number.isFinite(t) && t >= windowStart && t <= windowEnd;
          });

          // 提取涉及的日志ID
          const sourceLogIds = Array.from(new Set(involved.map(e => e.log_id).filter(Boolean)));
          surgery.source_log_ids = sourceLogIds.length ? sourceLogIds : [];
          
          // 提取日志条目ID范围
          const ids = involved.map(e => e.id).filter(id => typeof id !== 'undefined');
          if (ids.length) {
            const numeric = ids.map(n => Number(n)).filter(v => Number.isFinite(v));
            surgery.log_entry_start_id = numeric.length ? Math.min(...numeric) : null;
            surgery.log_entry_end_id = numeric.length ? Math.max(...numeric) : null;
          } else {
            surgery.log_entry_start_id = null;
            surgery.log_entry_end_id = null;
          }
        } else {
          surgery.source_log_ids = [];
          surgery.log_entry_start_id = null;
          surgery.log_entry_end_id = null;
        }
      } catch (_) {
        surgery.source_log_ids = [];
        surgery.log_entry_start_id = null;
        surgery.log_entry_end_id = null;
      }
      
      // 如果需要PostgreSQL结构化数据，生成postgresql_row_preview
      if (includePostgreSQLStructure === true) {
        surgery.postgresql_row_preview = buildPostgresRowPreview(surgery, deviceDisplayId);
      }
    });
    
    // 更新任务为完成状态
    updateTaskStatus(taskId, 'completed', 100, surgeries);
    
    // 清理已完成的任务
    cleanupCompletedTasks();
    
    console.log(`分析完成（任务 ${taskId}），生成 ${surgeries.length} 条数据库行`);
    
  } catch (error) {
    console.error('处理分析任务失败:', error);
    updateTaskStatus(taskId, 'failed', 100, null, error.message);
  }
};

// 查询分析任务状态（从Redis队列读取状态）
const getAnalysisTaskStatus = async (req, res) => {
  try {
    const { taskId } = req.params;
    const job = await surgeryAnalysisQueue.getJob(taskId);
    if (!job) {
      return res.status(404).json({ success: false, message: '任务不存在或已过期' });
    }

    const state = await job.getState();
    const progress = await job.progress();
    let payload = {
      id: job.id,
      status: state,
      progress: progress,
      createdAt: job.timestamp,
      data: job.data
    };

    if (state === 'completed') {
      payload.result = job.returnvalue?.surgeries || job.returnvalue || null;
    } else if (state === 'failed') {
      payload.error = job.failedReason || '任务失败';
    }

    return res.json({ success: true, data: payload });
  } catch (error) {
    console.error('查询队列任务状态失败:', error);
    res.status(500).json({ success: false, message: '查询任务状态失败', error: error.message });
  }
};

// 获取用户的任务列表
const getUserAnalysisTasks = async (req, res) => {
  try {
    const userId = req.user.id;
    const isAdmin = req.user.role_id === 1;
    
    const userTasks = Array.from(analysisTasks.values())
      .filter(task => isAdmin || task.userId === userId)
      .map(task => ({
        id: task.id,
        status: task.status,
        progress: task.progress,
        createdAt: task.createdAt,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        logIds: task.logIds
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
    
    res.json({
      success: true,
      data: userTasks
    });
    
  } catch (error) {
    console.error('获取任务列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取任务列表失败',
      error: error.message
    });
  }
};

// 导出PostgreSQL结构化数据
const exportPostgreSQLData = async (req, res) => {
  try {
    const { logIds } = req.query;
    
    let logs;
    if (logIds) {
      const logIdArray = logIds.split(',').map(id => parseInt(id.trim()));
      logs = await Log.findAll({
        where: { id: { [Op.in]: logIdArray } },
        order: [['original_name', 'DESC']]
      });
    } else {
      logs = await Log.findAll({
        order: [['original_name', 'DESC']]
      });
    }

    const allSurgeries = [];
    let surgeryIdCounter = 1;

    for (const log of logs) {
      const logEntries = await LogEntry.findAll({
        where: { log_id: log.id },
        order: [['timestamp', 'ASC']]
      });

      if (logEntries.length > 0) {
        const surgeries = analyzeSurgeries(logEntries, { includePostgreSQLStructure: true });
        
        surgeries.forEach(surgery => {
          surgery.id = surgeryIdCounter++;
          surgery.log_filename = log.filename;
          const deviceId = log.device_id;
          surgery.device_id = deviceId;
          surgery.surgery_id = `${deviceId || 'UNKNOWN'}-${formatTimeForId(surgery.surgery_start_time)}`;
        });
        
        allSurgeries.push(...surgeries);
      }
    }

    // 转换为PostgreSQL插入语句
    const postgresqlData = allSurgeries.map(s => buildDbRowFromSurgery(s));

    res.json({
      success: true,
      data: postgresqlData,
      message: `成功生成 ${postgresqlData.length} 条PostgreSQL结构化数据`
    });

  } catch (error) {
    console.error('导出PostgreSQL数据失败:', error);
    res.status(500).json({ message: '导出PostgreSQL数据失败', error: error.message });
  }
};

// 查询PostgreSQL中的手术数据
const getPostgreSQLSurgeries = async (req, res) => {
  try {
    const Surgery = require('../models/surgery');
    const { limit = 100, offset = 0 } = req.query;
    
    const surgeries = await Surgery.findAll({
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']]
    });
    
    const total = await Surgery.count();
    
    res.json({
      success: true,
      data: surgeries,
      total,
      message: `成功查询到 ${surgeries.length} 条手术数据`
    });
    
  } catch (error) {
    console.error('查询PostgreSQL手术数据失败:', error);
    res.status(500).json({ 
      success: false,
      message: '查询PostgreSQL手术数据失败', 
      error: error.message 
    });
  }
};

// 标准化时间格式，统一转换为UTC时间格式进行比较（忽略毫秒）
function normalizeTimeForComparison(timeStr) {
  if (!timeStr) return null;
  
  try {
    let date;
    
    // 处理不同的时间格式
    if (typeof timeStr === 'string') {
      // 如果是数据库UTC格式 YYYY-MM-DD HH:mm:ss，转换为ISO格式
      if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(timeStr)) {
        // 数据库中的UTC格式，添加Z标识符
        date = new Date(timeStr.replace(' ', 'T') + 'Z');
      }
      // 如果是ISO格式 YYYY-MM-DDTHH:mm:ss.fffZ，直接解析
      else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(timeStr)) {
        date = new Date(timeStr);
      } else {
        // 其他格式直接解析
        date = new Date(timeStr);
      }
    } else {
      date = new Date(timeStr);
    }
    
    if (isNaN(date.getTime())) return timeStr;
    
    // 统一转换为UTC时间格式进行比较，忽略毫秒
    const pad = (n) => String(n).padStart(2, '0');
    return (
      date.getUTCFullYear() + '-' +
      pad(date.getUTCMonth() + 1) + '-' +
      pad(date.getUTCDate()) + ' ' +
      pad(date.getUTCHours()) + ':' +
      pad(date.getUTCMinutes()) + ':' +
      pad(date.getUTCSeconds())
    );
  } catch (error) {
    console.warn('时间标准化失败:', timeStr, error);
    return timeStr;
  }
}

// 比较两个时间值是否相同（忽略毫秒差异）
function compareTimeValues(time1, time2) {
  if (!time1 && !time2) return true;
  if (!time1 || !time2) return false;
  
  const normalized1 = normalizeTimeForComparison(time1);
  const normalized2 = normalizeTimeForComparison(time2);
  
  return normalized1 === normalized2;
}

// 递归比较对象，对时间字段进行特殊处理
function deepCompareWithTimeNormalization(obj1, obj2, path = '') {
  if (obj1 === obj2) return true;
  if (obj1 == null || obj2 == null) return false;
  if (typeof obj1 !== typeof obj2) return false;
  
  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) return false;
    for (let i = 0; i < obj1.length; i++) {
      if (!deepCompareWithTimeNormalization(obj1[i], obj2[i], `${path}[${i}]`)) {
        return false;
      }
    }
    return true;
  }
  
  if (typeof obj1 === 'object') {
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    
    if (keys1.length !== keys2.length) return false;
    
    for (const key of keys1) {
      if (!keys2.includes(key)) return false;
      
      const currentPath = path ? `${path}.${key}` : key;
      const val1 = obj1[key];
      const val2 = obj2[key];
      
      // 检查是否为时间字段
      if (key.toLowerCase().includes('time') || key.toLowerCase().includes('timestamp')) {
        if (!compareTimeValues(val1, val2)) {
          return false;
        }
      } else {
        if (!deepCompareWithTimeNormalization(val1, val2, currentPath)) {
          return false;
        }
      }
    }
    return true;
  }
  
  // 基本类型直接比较
  return obj1 === obj2;
}

// 比对两个手术数据的差异
function compareSurgeryData(newData, existingData) {
  const differences = [];
  
  // 比对基础字段
  const basicFields = [
    'start_time', 'end_time', 'has_fault', 'is_remote', 'success',
    'source_log_ids', 'device_ids', 'log_entry_start_id', 'log_entry_end_id'
  ];
  
  basicFields.forEach(field => {
    const newValue = newData[field];
    const existingValue = existingData[field];
    
    let isDifferent = false;
    
    // 对时间字段进行特殊处理
    if (field === 'start_time' || field === 'end_time') {
      const normalizedNew = normalizeTimeForComparison(newValue);
      const normalizedExisting = normalizeTimeForComparison(existingValue);
      
      // 添加调试日志
      if (field === 'start_time') {
        console.log(`🔧 时间比对 - ${field}:`);
        console.log(`  新数据原始值: ${newValue}`);
        console.log(`  新数据标准化后: ${normalizedNew}`);
        console.log(`  数据库原始值: ${existingValue}`);
        console.log(`  数据库标准化后: ${normalizedExisting}`);
        console.log(`  是否不同: ${normalizedNew !== normalizedExisting}`);
      }
      
      isDifferent = normalizedNew !== normalizedExisting;
    } else {
      // 其他字段使用原有的JSON比较方式
      isDifferent = JSON.stringify(newValue) !== JSON.stringify(existingValue);
    }
    
    if (isDifferent) {
      differences.push({
        field: field,
        fieldName: getFieldDisplayName(field),
        oldValue: existingValue,
        newValue: newValue,
        type: 'basic'
      });
    }
  });
  
  // 比对结构化数据
  if (newData.structured_data || existingData.structured_data) {
    const structuredDiff = compareStructuredData(
      newData.structured_data, 
      existingData.structured_data
    );
    differences.push(...structuredDiff);
  }
  
  return differences;
}

// 比对结构化数据的差异
function compareStructuredData(newStructured, existingStructured) {
  const differences = [];
  
  if (!newStructured && !existingStructured) return differences;
  if (!newStructured || !existingStructured) {
    differences.push({
      field: 'structured_data',
      fieldName: '手术详细数据',
      oldValue: existingStructured,
      newValue: newStructured,
      type: 'structured'
    });
    return differences;
  }
  
  // 使用新的深度比较函数进行整体比较
  if (!deepCompareWithTimeNormalization(newStructured, existingStructured)) {
    differences.push({
      field: 'structured_data',
      fieldName: '手术详细数据',
      oldValue: existingStructured,
      newValue: newStructured,
      type: 'structured'
    });
  }
  
  return differences;
}

// 比对器械使用数据
function compareArmsData(newArms, existingArms) {
  const differences = [];
  
  if (!newArms && !existingArms) return differences;
  if (!newArms || !existingArms) {
    differences.push({
      field: 'arms',
      fieldName: '器械使用数据',
      oldValue: existingArms,
      newValue: newArms,
      type: 'arms'
    });
    return differences;
  }
  
  // 比对每个器械臂
  for (let i = 0; i < Math.max(newArms.length, existingArms.length); i++) {
    const newArm = newArms[i];
    const existingArm = existingArms[i];
    const armId = i + 1;
    
    if (!newArm || !existingArm) {
      differences.push({
        field: `arm${armId}`,
        fieldName: `器械臂${armId}`,
        oldValue: existingArm,
        newValue: newArm,
        type: 'arm'
      });
      continue;
    }
    
    // 比对器械使用记录数量
    const newUsageCount = newArm.instrument_usage?.length || 0;
    const existingUsageCount = existingArm.instrument_usage?.length || 0;
    
    if (newUsageCount !== existingUsageCount) {
      differences.push({
        field: `arm${armId}_usage_count`,
        fieldName: `器械臂${armId}使用次数`,
        oldValue: existingUsageCount,
        newValue: newUsageCount,
        type: 'usage_count'
      });
    }
  }
  
  return differences;
}

// 比对手术统计数据
function compareSurgeryStats(newStats, existingStats) {
  const differences = [];
  
  if (!newStats && !existingStats) return differences;
  if (!newStats || !existingStats) {
    differences.push({
      field: 'surgery_stats',
      fieldName: '手术统计数据',
      oldValue: existingStats,
      newValue: newStats,
      type: 'stats'
    });
    return differences;
  }
  
  // 比对故障数据
  const statsFields = ['success', 'left_hand_clutch', 'right_hand_clutch', 'foot_clutch', 'endoscope_pedal'];
  statsFields.forEach(field => {
    const newValue = newStats[field];
    const existingValue = existingStats[field];
    
    if (newValue !== existingValue) {
      differences.push({
        field: `stats_${field}`,
        fieldName: getStatsFieldDisplayName(field),
        oldValue: existingValue,
        newValue: newValue,
        type: 'stats_field'
      });
    }
  });
  
  // 比对故障列表
  const newFaultCount = newStats.faults?.length || 0;
  const existingFaultCount = existingStats.faults?.length || 0;
  
  if (newFaultCount !== existingFaultCount) {
    differences.push({
      field: 'fault_count',
      fieldName: '故障数量',
      oldValue: existingFaultCount,
      newValue: newFaultCount,
      type: 'fault_count'
    });
  }
  
  return differences;
}

// 获取字段显示名称
function getFieldDisplayName(field) {
  const fieldNames = {
    'start_time': '开始时间',
    'end_time': '结束时间',
    'has_fault': '是否有故障',
    'is_remote': '是否远程手术',
    'success': '手术是否成功',
    'source_log_ids': '来源日志ID',
    'device_ids': '设备ID',
    'log_entry_start_id': '起始日志条目ID',
    'log_entry_end_id': '结束日志条目ID'
  };
  return fieldNames[field] || field;
}

// 获取统计字段显示名称
function getStatsFieldDisplayName(field) {
  const fieldNames = {
    'success': '手术成功',
    'left_hand_clutch': '左手离合次数',
    'right_hand_clutch': '右手离合次数',
    'foot_clutch': '脚踏离合次数',
    'endoscope_pedal': '内窥镜脚踏次数'
  };
  return fieldNames[field] || field;
}

// 导出单个手术的结构化数据
const exportSingleSurgeryData = async (req, res) => {
  try {
    console.log(`🔧 收到导出手术数据请求: ${req.body?.surgery_id || 'unknown'}`);
    
    // 直接使用前端传递的完整手术数据
    const surgeryData = req.body;
    
    if (!surgeryData) {
      return res.status(400).json({
        success: false,
        message: '未提供手术数据'
      });
    }

    // 转换为PostgreSQL结构化数据
    const Surgery = require('../models/surgery');
    const postgresqlData = buildDbRowFromSurgery(surgeryData);

    // 检查是否已存在相同ID的手术数据
    const existingSurgery = await Surgery.findOne({
      where: { surgery_id: postgresqlData.surgery_id }
    });

    if (existingSurgery) {
      // 存在相同ID，返回比对结果供用户确认
      console.log(`🔧 找到已存在的手术数据: ${postgresqlData.surgery_id}`);
      console.log(`🔧 数据库原始数据 start_time: ${existingSurgery.start_time} (类型: ${typeof existingSurgery.start_time})`);
      
      // 比对时使用原始UTC数据（plain 对象），确保准确性
      const existingPlain = existingSurgery.get ? existingSurgery.get({ plain: true }) : existingSurgery;
      console.log(`🔧 Plain对象 start_time: ${existingPlain.start_time} (类型: ${typeof existingPlain.start_time})`);
      
      const differences = compareSurgeryData(postgresqlData, existingPlain);
      
      // 显示时转换为本地时间格式，提高可读性
      const convertTimeFields = (data) => {
        if (!data) return data;
        const converted = { ...data };
        if (converted.start_time) {
          console.log(`🔧 后端转换时间 - 输入: ${converted.start_time} (类型: ${typeof converted.start_time})`);
          converted.start_time = formatTimeForDisplay(converted.start_time);
          console.log(`🔧 后端转换时间 - 输出: ${converted.start_time}`);
        }
        if (converted.end_time) {
          converted.end_time = formatTimeForDisplay(converted.end_time);
        }
        return converted;
      };
      
      res.json({
        success: false,
        needsConfirmation: true,
        surgery_id: postgresqlData.surgery_id,
        existingData: convertTimeFields(existingPlain),
        newData: convertTimeFields(postgresqlData),
        differences: differences,
        message: `数据库中已存在手术ID为 ${postgresqlData.surgery_id} 的手术数据，检测到 ${differences.length} 处差异`
      });
    } else {
      // 不存在相同ID，直接创建
      try {
        const savedSurgery = await Surgery.create(postgresqlData);
        console.log('手术数据已存储到PostgreSQL:', savedSurgery.surgery_id);
        
        // 转换时间字段为本地时间格式
        const convertTimeFields = (data) => {
          if (!data) return data;
          const converted = { ...data };
          if (converted.start_time) {
            converted.start_time = formatTimeForDisplay(converted.start_time);
          }
          if (converted.end_time) {
            converted.end_time = formatTimeForDisplay(converted.end_time);
          }
          return converted;
        };
        
        res.json({
          success: true,
          data: {
            ...convertTimeFields(postgresqlData),
            postgresql_id: savedSurgery.id
          },
          message: '手术结构化数据已成功导出并存储到PostgreSQL数据库'
        });
      } catch (dbError) {
        console.warn('PostgreSQL存储失败，仅返回数据:', dbError.message);
        
        // 转换时间字段为本地时间格式
        const convertTimeFields = (data) => {
          if (!data) return data;
          const converted = { ...data };
          if (converted.start_time) {
            converted.start_time = formatTimeForDisplay(converted.start_time);
          }
          if (converted.end_time) {
            converted.end_time = formatTimeForDisplay(converted.end_time);
          }
          return converted;
        };
        
        res.json({
          success: true,
          data: convertTimeFields(postgresqlData),
          message: '手术结构化数据导出成功（PostgreSQL存储失败）'
        });
      }
    }

  } catch (error) {
    console.error('导出单个手术数据失败:', error);
    res.status(500).json({ message: '导出单个手术数据失败', error: error.message });
  }
};

// 确认覆盖手术数据
const confirmOverrideSurgeryData = async (req, res) => {
  try {
    const { surgeryData, confirmOverride } = req.body;
    
    if (!surgeryData) {
      return res.status(400).json({
        success: false,
        message: '未提供手术数据'
      });
    }
    
    if (!confirmOverride) {
      return res.status(400).json({
        success: false,
        message: '需要用户确认覆盖操作'
      });
    }

    // 转换为PostgreSQL结构化数据
    const Surgery = require('../models/surgery');
    const postgresqlData = buildDbRowFromSurgery(surgeryData);

    // 更新现有数据
    const existingSurgery = await Surgery.findOne({
      where: { surgery_id: postgresqlData.surgery_id }
    });

    if (!existingSurgery) {
      return res.status(404).json({
        success: false,
        message: '未找到要覆盖的手术数据'
      });
    }

    // 执行覆盖操作
    const updatedSurgery = await existingSurgery.update(postgresqlData);
    console.log('手术数据已覆盖:', updatedSurgery.surgery_id);
    
    // 转换时间字段为本地时间格式
    const convertTimeFields = (data) => {
      if (!data) return data;
      const converted = { ...data };
      if (converted.start_time) {
        converted.start_time = formatTimeForDisplay(converted.start_time);
      }
      if (converted.end_time) {
        converted.end_time = formatTimeForDisplay(converted.end_time);
      }
      return converted;
    };
    
    res.json({
      success: true,
      data: {
        ...convertTimeFields(postgresqlData),
        postgresql_id: updatedSurgery.id
      },
      message: '手术数据已成功覆盖到PostgreSQL数据库'
    });

  } catch (error) {
    console.error('覆盖手术数据失败:', error);
    res.status(500).json({ 
      success: false,
      message: '覆盖手术数据失败', 
      error: error.message 
    });
  }
};

module.exports = {
  getAllSurgeryStatistics,
  analyzeSortedLogEntries,
  analyzeByLogIds,
  exportSurgeryReport,
  analyzeSurgeries,
  getAnalysisTaskStatus,
  getUserAnalysisTasks,
  exportPostgreSQLData,
  exportSingleSurgeryData,
  confirmOverrideSurgeryData,
  getPostgreSQLSurgeries
};