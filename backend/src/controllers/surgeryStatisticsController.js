const LogEntry = require('../models/log_entry');
const Log = require('../models/log');
const SurgeryAnalyzer = require('../services/surgeryAnalyzer');
const { Op } = require('sequelize');

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
  
  // 打印准备写入surgeries表的数据
  console.log('\n' + '='.repeat(80));
  console.log('手术分析完成 - 准备写入surgeries表的数据:');
  console.log('='.repeat(80));
  
  surgeries.forEach((surgery, index) => {
    console.log(`\n--- 手术 ${index + 1}: ${surgery.surgery_id} ---`);
    
    // 构建完整的surgeries表数据
    const surgeriesData = {
      surgery_id: surgery.surgery_id,
      device_ids: [surgery.log_id],
      start_time: surgery.surgery_start_time,
      end_time: surgery.surgery_end_time,
      is_remote: surgery.is_remote_surgery || false,
      structured_data: surgery.postgresql_structure || analyzer.toPostgreSQLStructure(surgery),
      last_analyzed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    console.log('surgeries表数据:');
    console.log(JSON.stringify(surgeriesData, null, 2));
    
    console.log('\n' + '-'.repeat(60));
  });
  
  console.log(`\n总计: ${surgeries.length} 场手术数据准备写入`);
  console.log('='.repeat(80) + '\n');
  
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
          includePostgreSQLStructure: includePostgreSQLStructure === 'true' 
        });
        console.log(`从日志 ${log.filename} 分析出 ${surgeries.length} 场手术`)
        
        // 为每个手术分配唯一ID
        surgeries.forEach(surgery => {
          surgery.id = surgeryIdCounter++;
          surgery.log_filename = log.filename;
        });
        
        allSurgeries.push(...surgeries);
      }
    }

    console.log('分析完成，手术数据:', allSurgeries)
    res.json({
      success: true,
      data: allSurgeries,
      message: `成功分析出 ${allSurgeries.length} 场手术数据`
    });

  } catch (error) {
    console.error('获取手术统计数据失败:', error);
    res.status(500).json({ message: '获取手术统计数据失败', error: error.message });
  }
};

// 使用前端传递的已排序日志条目进行分析
const analyzeSortedLogEntries = async (req, res) => {
  try {
    const { logEntries, includePostgreSQLStructure } = req.body;
    
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
      includePostgreSQLStructure: includePostgreSQLStructure === true 
    });
    console.log(`从已排序日志条目分析出 ${surgeries.length} 场手术`);

    // 为每个手术分配唯一ID
    surgeries.forEach((surgery, index) => {
      surgery.id = index + 1;
      surgery.log_filename = '已排序日志条目';
    });

    console.log('分析完成，手术数据:', surgeries);
    res.json({
      success: true,
      data: surgeries,
      message: `成功分析出 ${surgeries.length} 场手术数据（使用已排序日志条目）`
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

// 通过日志ID列表直接分析手术数据
const analyzeByLogIds = async (req, res) => {
  try {
    const { logIds, includePostgreSQLStructure } = req.body;
    
    if (!logIds || !Array.isArray(logIds) || logIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供有效的日志ID列表'
      });
    }

    console.log(`开始通过日志ID列表分析手术数据，共 ${logIds.length} 个日志文件`);
    
    // 检查并发限制
    const activeAnalysisCount = await getActiveAnalysisCount();
    const maxConcurrentAnalysis = 3; // 最大并发分析数
    
    if (activeAnalysisCount >= maxConcurrentAnalysis) {
      return res.status(429).json({
        success: false,
        message: `当前系统繁忙，已有 ${activeAnalysisCount} 个分析任务在进行中，请稍后再试`
      });
    }
    
    // 创建异步任务
    const taskId = createAnalysisTask(logIds, req.user.id);
    
    // 立即返回任务ID
    res.json({
      success: true,
      taskId: taskId,
      message: '分析任务已创建，请稍后查询结果'
    });
    
    // 异步执行分析任务
    processAnalysisTask(taskId, logIds, includePostgreSQLStructure);
    
  } catch (error) {
    console.error('创建分析任务失败:', error);
    res.status(500).json({ 
      success: false,
      message: '创建分析任务失败', 
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
    
    // 为每个手术分配唯一ID
    surgeries.forEach((surgery, index) => {
      surgery.id = index + 1;
      surgery.log_filename = `批量日志分析 (${logIds.length}个文件)`;
    });
    
    // 更新任务为完成状态
    updateTaskStatus(taskId, 'completed', 100, surgeries);
    
    // 清理已完成的任务
    cleanupCompletedTasks();
    
    console.log('分析完成，手术数据:', surgeries);
    
  } catch (error) {
    console.error('处理分析任务失败:', error);
    updateTaskStatus(taskId, 'failed', 100, null, error.message);
  }
};

// 查询分析任务状态
const getAnalysisTaskStatus = async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = analysisTasks.get(parseInt(taskId));
    
    if (!task) {
      return res.status(404).json({
        success: false,
        message: '任务不存在'
      });
    }
    
    // 检查权限：只能查看自己的任务
    if (task.userId !== req.user.id && req.user.role_id !== 1) { // 管理员可以查看所有任务
      return res.status(403).json({
        success: false,
        message: '无权查看此任务'
      });
    }
    
    res.json({
      success: true,
      data: {
        id: task.id,
        status: task.status,
        progress: task.progress,
        result: task.result,
        error: task.error,
        createdAt: task.createdAt,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        logIds: task.logIds
      }
    });
    
  } catch (error) {
    console.error('查询任务状态失败:', error);
    res.status(500).json({
      success: false,
      message: '查询任务状态失败',
      error: error.message
    });
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
        });
        
        allSurgeries.push(...surgeries);
      }
    }

    // 转换为PostgreSQL插入语句
    const postgresqlData = allSurgeries.map(surgery => ({
      surgery_id: surgery.surgery_id,
      device_ids: [surgery.log_id], // 可以根据需要调整
      start_time: surgery.surgery_start_time,
      end_time: surgery.surgery_end_time,
      is_remote: surgery.is_remote_surgery || false,
      structured_data: surgery.postgresql_structure,
      last_analyzed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

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
    const { id } = req.params;
    
    // 获取当前分析的手术数据
    const surgery = global.currentSurgeries?.find(s => s.id.toString() === id);
    
    if (!surgery) {
      return res.status(404).json({
        success: false,
        message: '未找到指定的手术数据'
      });
    }

    // 转换为PostgreSQL结构化数据
    const Surgery = require('../models/surgery');
    const postgresqlData = {
      surgery_id: surgery.surgery_id,
      device_ids: [surgery.log_id],
      start_time: surgery.surgery_start_time,
      end_time: surgery.surgery_end_time,
      is_remote: surgery.is_remote_surgery || false,
      structured_data: surgery.postgresql_structure || null,
      last_analyzed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

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