const LogEntry = require('../models/log_entry');
const Log = require('../models/log');
const SurgeryAnalyzer = require('../services/surgeryAnalyzer');
const { Op } = require('sequelize');

// 格式化为UTC时间 YYYY-MM-DD HH:mm:ss（用于写库，统一为UTC）
function formatUtcDateTime(dateLike) {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear() + '-' +
    pad(d.getUTCMonth() + 1) + '-' +
    pad(d.getUTCDate()) + ' ' +
    pad(d.getUTCHours()) + ':' +
    pad(d.getUTCMinutes()) + ':' +
    pad(d.getUTCSeconds())
  );
}

// 递归规范化 structured_data 内所有时间戳为UTC格式 YYYY-MM-DD HH:mm:ss
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
  const d = new Date(dateStr);
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

// 导出单个手术的结构化数据
const exportSingleSurgeryData = async (req, res) => {
  try {
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

    // 尝试存储到PostgreSQL数据库
    try {
      const savedSurgery = await Surgery.create(postgresqlData);
      console.log('手术数据已存储到PostgreSQL:', savedSurgery.surgery_id);
      
      res.json({
        success: true,
        data: {
          ...postgresqlData,
          postgresql_id: savedSurgery.id
        },
        message: '手术结构化数据已成功导出并存储到PostgreSQL数据库'
      });
    } catch (dbError) {
      console.warn('PostgreSQL存储失败，仅返回数据:', dbError.message);
      
      res.json({
        success: true,
        data: postgresqlData,
        message: '手术结构化数据导出成功（PostgreSQL存储失败）'
      });
    }

  } catch (error) {
    console.error('导出单个手术数据失败:', error);
    res.status(500).json({ message: '导出单个手术数据失败', error: error.message });
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
  getPostgreSQLSurgeries
};