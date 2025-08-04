const LogEntry = require('../models/log_entry');
const Log = require('../models/log');
const faultMappings = require('../config/FaultMappings.json');
const { Op } = require('sequelize');

// 器械类型映射
const INSTRUMENT_TYPES = faultMappings['3'];
const STATE_MACHINE_STATES = faultMappings['1'];

// 安全解析 JSON 的辅助函数
function safeJsonParse(value) {
  if (!value) return null;
  if (typeof value === 'object' && value !== null) return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      return { rawData: value };
    }
  }
  return value;
}

// 获取器械类型名称
function getInstrumentTypeName(typeCode) {
  return INSTRUMENT_TYPES[typeCode] || '未知器械';
}

// 获取状态机状态名称
function getStateMachineStateName(stateCode) {
  return STATE_MACHINE_STATES[stateCode] || '未知状态';
}



// 分析手术数据的主要函数
function analyzeSurgeries(logEntries) {
  console.log(`开始分析 ${logEntries.length} 个日志条目`)
  
  // 检查数据来源
  const logSources = new Set(logEntries.map(entry => entry.log_name || 'unknown'));
  console.log('日志来源:', Array.from(logSources));
  
  // 检查时间范围
  const timestamps = logEntries.map(entry => new Date(entry.timestamp));
  const minTime = new Date(Math.min(...timestamps));
  const maxTime = new Date(Math.max(...timestamps));
  console.log('数据时间范围:', {
    start: minTime.toISOString(),
    end: maxTime.toISOString(),
    duration: Math.floor((maxTime - minTime) / 1000 / 60) + '分钟'
  });
  
  const surgeries = [];
  let currentSurgery = null;
  let surgeryCount = 0;
  
  let isPowerOn = false;
  let errFlag = false;
  let errSurgical = false;
  let errSurgicalRecover = false;
  let errRecover = false;
  let Tstart = null;
  let Tdur = null;
  let Terr = null;
  let Trecover = null;
  
  const armStates = [-1, -1, -1, -1];
  const armInsts = [-1, -1, -1, -1];
  const armUDIs = ['', '', '', ''];
  
  const stateMachineChanges = [];
  const alarmRecords = new Set();
  const alarmDetails = [];
  
  const footPedalStats = { energy: 0, clutch: 0, camera: 0 };
  const handClutchStats = { arm1: 0, arm2: 0, arm3: 0, arm4: 0 };

     for (let i = 0; i < logEntries.length; i++) {
     const entry = logEntries[i];
     const errCode = entry.error_code;
     // 取错误码的后4位进行匹配
     const errCodeSuffix = errCode ? errCode.slice(-4) : '';
     const p1 = parseInt(entry.param1) || 0;
     const p2 = parseInt(entry.param2) || 0;
     const p3 = parseInt(entry.param3) || 0;
     const p4 = parseInt(entry.param4) || 0;
    
         // 安全报警检查
     if (errCodeSuffix && /[ABC]$/i.test(errCodeSuffix)) {
       const alarmKey = `${errCode}_${entry.timestamp}`;
       if (!alarmRecords.has(alarmKey)) {
         alarmRecords.add(alarmKey);
         alarmDetails.push({
           time: entry.timestamp,
           type: errCodeSuffix.endsWith('A') ? '错误' : '警告',
           code: errCode,
           message: entry.explanation || `故障码: ${errCode}`,
           status: '已处理'
         });
       }
     }
    
         // 开机事件处理
     if (errCodeSuffix === '570e' && p1 === 0 && p2 !== 0) {
       console.log(`检测到570e开机事件: p1=${p1}, p2=${p2}, 时间=${entry.timestamp}`)
       if (i + 1 < logEntries.length) {
         const nextEntry = logEntries[i + 1];
         const nextErrCodeSuffix = nextEntry.error_code ? nextEntry.error_code.slice(-4) : '';
         if (nextErrCodeSuffix === '571e' && parseInt(nextEntry.param1) === 0 && parseInt(nextEntry.param2) !== 0) {
           console.log(`检测到571e开机确认事件: p1=${nextEntry.param1}, p2=${nextEntry.param2}, 时间=${nextEntry.timestamp}`)
           isPowerOn = true;
           Tstart = entry.timestamp;
           Tdur = entry.timestamp;
           
           if (currentSurgery) {
             currentSurgery.power_on_time = entry.timestamp;
           }
         }
       }
     }
    
         // 关机事件处理
     if (errCodeSuffix === '310e' && p2 === 31) {
       if (currentSurgery) {
         currentSurgery.power_off_time = entry.timestamp;
         console.log(`检测到关机事件，时间=${entry.timestamp}`)
       }
       errFlag = false;
       errSurgical = false;
     }
    
         // 故障事件处理
     if (errCodeSuffix && /[ab]$/i.test(errCodeSuffix)) {
       errFlag = true;
       errSurgical = true;
       Terr = entry.timestamp;
       Tdur = entry.timestamp;
       errSurgicalRecover = false;
     }
    
         // 状态机事件处理
     if (errCodeSuffix === '310e') {
       const newState = p2;
       stateMachineChanges.push({
         time: entry.timestamp,
         state: newState,
         stateName: getStateMachineStateName(newState.toString())
       });
      
      // 手术开始判断
      if (newState === 20 && isPowerOn) {
        console.log(`检测到手术开始: 状态=${newState}, 开机状态=${isPowerOn}, 时间=${entry.timestamp}`)
        if (!currentSurgery) {
          surgeryCount++;
          currentSurgery = {
            id: surgeryCount, // 临时ID
            surgery_id: `Surgery-${surgeryCount.toString().padStart(2, '0')}`,
            log_id: entry.log_id,
            surgery_start_time: entry.timestamp,
            arm1_usage: [],
            arm2_usage: [],
            arm3_usage: [],
            arm4_usage: [],
            alarm_details: [],
            state_machine_changes: [],
            foot_pedal_stats: {},
            hand_clutch_stats: {},
            has_error: false,
            error_recovery_time: 0
          };
          console.log(`创建新手术: ${currentSurgery.surgery_id}`)
        }
      }
      
      // 故障恢复判断
      if (p1 === 0 && p2 === 1 && errFlag) {
        Trecover = entry.timestamp;
        errFlag = false;
        errSurgicalRecover = true;
        errRecover = true;
        
        if (currentSurgery) {
          currentSurgery.has_error = true;
        }
      }
      
      // 故障恢复后重新进入主从控制
      if (errRecover && newState === 20) {
        errRecover = false;
        if (Trecover && currentSurgery) {
          const errRecoverTime = Math.floor((entry.timestamp - Trecover) / 1000 / 60);
          currentSurgery.error_recovery_time = errRecoverTime;
        }
      }
    }
    
         // 手术结束判断
     if (errCodeSuffix === '500e' && p3 === 0) {
       const armIndex = p1 - 1;
       if (armIndex >= 0 && armIndex < 4) {
         armStates[armIndex] = p2;
       }
      
      if (armStates.every(state => state === 0) && (p2 === 13 || p2 === 10 || p2 === 12)) {
        if (currentSurgery) {
          console.log(`检测到手术结束: 工具臂状态=${armStates}, p2=${p2}, 时间=${entry.timestamp}`)
          currentSurgery.surgery_end_time = entry.timestamp;
          currentSurgery.total_duration = Math.floor(
            (currentSurgery.surgery_end_time - currentSurgery.surgery_start_time) / 1000 / 60
          );
          
          currentSurgery.alarm_count = alarmDetails.length;
          currentSurgery.alarm_details = alarmDetails;
          currentSurgery.state_machine_changes = stateMachineChanges;
          currentSurgery.foot_pedal_stats = footPedalStats;
          currentSurgery.hand_clutch_stats = handClutchStats;
          
          surgeries.push(currentSurgery);
          console.log(`完成手术: ${currentSurgery.surgery_id}, 时长: ${currentSurgery.total_duration} 分钟`)
          currentSurgery = null;
          armStates.fill(-1);
          armInsts.fill(-1);
          armUDIs.fill('');
          stateMachineChanges.length = 0;
          alarmDetails.length = 0;
          alarmRecords.clear();
        }
      }
    }
    
              // 器械状态变化记录
     if (errCodeSuffix === '501e') {
       const armIndex = p1;
       if (armIndex >= 0 && armIndex < 4) {
         armInsts[armIndex] = p3;
         
         if (currentSurgery) {
           const armUsageKey = `arm${armIndex + 1}_usage`;
           const currentUsage = currentSurgery[armUsageKey] || [];
           
           // 只有当安装了有效器械时才记录（p3 > 0）
           if (p3 > 0) {
             currentUsage.push({
               instrumentType: p3,
               instrumentName: getInstrumentTypeName(p3.toString()),
               previousType: p2,
               previousName: getInstrumentTypeName(p2.toString()),
               time: entry.timestamp,
               udi: armUDIs[armIndex]
             });
           }
           
           currentSurgery[armUsageKey] = currentUsage;
         }
       }
     }
    
         // UDI码记录
     if (errCodeSuffix === '510e') {
       const armIndex = p1;
       if (armIndex >= 0 && armIndex < 4) {
         const udi = `${p1}${p2}${p3}${String.fromCharCode(p4)}`;
         armUDIs[armIndex] = udi;
       }
     }
    
         // 脚踏信号统计
     if (errCodeSuffix === '600e') {
       if (p1 === 1) footPedalStats.energy++;
       else if (p1 === 2) footPedalStats.clutch++;
       else if (p1 === 3) footPedalStats.camera++;
     }
    
         // 手离合信号统计
     if (errCodeSuffix === '610e') {
       if (p1 >= 1 && p1 <= 4) {
         const armKey = `arm${p1}`;
         if (handClutchStats[armKey] !== undefined) {
           handClutchStats[armKey]++;
         }
       }
     }
     }
   
   // 如果还有未完成的手术，用最后一条日志作为结束
   if (currentSurgery) {
     console.log(`手术未正常结束，使用最后一条日志作为结束时间`)
     const lastEntry = logEntries[logEntries.length - 1];
     currentSurgery.surgery_end_time = lastEntry.timestamp;
     currentSurgery.total_duration = Math.floor(
       (currentSurgery.surgery_end_time - currentSurgery.surgery_start_time) / 1000 / 60
     );
     
     currentSurgery.alarm_count = alarmDetails.length;
     currentSurgery.alarm_details = alarmDetails;
     currentSurgery.state_machine_changes = stateMachineChanges;
     currentSurgery.foot_pedal_stats = footPedalStats;
     currentSurgery.hand_clutch_stats = handClutchStats;
     
     surgeries.push(currentSurgery);
     console.log(`完成手术: ${currentSurgery.surgery_id}, 时长: ${currentSurgery.total_duration} 分钟 (使用最后一条日志作为结束)`)
   }
   
   console.log(`分析完成，共发现 ${surgeries.length} 场手术`)
   return surgeries;
 }

// 获取指定日志的手术统计数据（实时分析）
const getAllSurgeryStatistics = async (req, res) => {
  try {
    const { logIds } = req.query;
    
    let logs;
    if (logIds) {
      // 如果指定了日志ID，只分析指定的日志
      const logIdArray = logIds.split(',').map(id => parseInt(id.trim()));
      logs = await Log.findAll({
        where: { id: { [Op.in]: logIdArray } },
        order: [['upload_time', 'DESC']]
      });
      console.log(`分析指定的 ${logs.length} 个日志文件`);
    } else {
      // 如果没有指定，分析所有日志
      logs = await Log.findAll({
        order: [['upload_time', 'DESC']]
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
        // 显示前几个日志条目的信息
        console.log('前5个日志条目:', logEntries.slice(0, 5).map(entry => ({
          error_code: entry.error_code,
          param1: entry.param1,
          param2: entry.param2,
          param3: entry.param3,
          timestamp: entry.timestamp
        })))
        
        // 查找关键错误码（后4位）
        const keyErrorCodes = ['570e', '571e', '310e', '500e', '501e', '510e', '600e', '610e'];
        const foundErrorCodes = new Set();
        logEntries.forEach(entry => {
          const errCodeSuffix = entry.error_code ? entry.error_code.slice(-4) : '';
          if (keyErrorCodes.includes(errCodeSuffix)) {
            foundErrorCodes.add(entry.error_code);
          }
        });
        console.log('找到的关键错误码:', Array.from(foundErrorCodes));
        
        // 显示所有310e状态机事件
        const stateMachineEvents = logEntries.filter(entry => {
          const errCodeSuffix = entry.error_code ? entry.error_code.slice(-4) : '';
          return errCodeSuffix === '310e';
        });
        console.log(`找到 ${stateMachineEvents.length} 个状态机事件(310e):`, stateMachineEvents.slice(0, 10).map(entry => ({
          param1: entry.param1,
          param2: entry.param2,
          timestamp: entry.timestamp
        })));
        
        const surgeries = analyzeSurgeries(logEntries);
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

// 新增：使用前端传递的已排序日志条目进行分析
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

    // 确保日志条目按时间戳排序
    const sortedLogEntries = logEntries.sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    );

    console.log('日志条目已按时间戳排序，时间范围:', {
      start: sortedLogEntries[0].timestamp,
      end: sortedLogEntries[sortedLogEntries.length - 1].timestamp,
      count: sortedLogEntries.length
    });

    // 显示前几个日志条目的信息
    console.log('前5个日志条目:', sortedLogEntries.slice(0, 5).map(entry => ({
      error_code: entry.error_code,
      param1: entry.param1,
      param2: entry.param2,
      param3: entry.param3,
      timestamp: entry.timestamp
    })));
    
    // 查找关键错误码（后4位）
    const keyErrorCodes = ['570e', '571e', '310e', '500e', '501e', '510e', '600e', '610e'];
    const foundErrorCodes = new Set();
    sortedLogEntries.forEach(entry => {
      const errCodeSuffix = entry.error_code ? entry.error_code.slice(-4) : '';
      if (keyErrorCodes.includes(errCodeSuffix)) {
        foundErrorCodes.add(entry.error_code);
      }
    });
    console.log('找到的关键错误码:', Array.from(foundErrorCodes));
    
    // 显示所有310e状态机事件
    const stateMachineEvents = sortedLogEntries.filter(entry => {
      const errCodeSuffix = entry.error_code ? entry.error_code.slice(-4) : '';
      return errCodeSuffix === '310e';
    });
    console.log(`找到 ${stateMachineEvents.length} 个状态机事件(310e):`, stateMachineEvents.slice(0, 10).map(entry => ({
      param1: entry.param1,
      param2: entry.param2,
      timestamp: entry.timestamp
    })));

    // 使用已排序的日志条目进行分析
    const surgeries = analyzeSurgeries(sortedLogEntries);
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

module.exports = {
  getAllSurgeryStatistics,
  analyzeSortedLogEntries,
  exportSurgeryReport
}; 