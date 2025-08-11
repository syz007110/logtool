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

// 计算与时间线一致的起止时间（最早-最晚事件）
function computeTimelineRangeForSurgery(surgery, globalLastLogTime) {
  if (!surgery) return { start: null, end: null };

  // 起点：连台优先使用上一台结束时间；否则使用开机时间与手术开始时间中的最早者
  let start = null;
  if (surgery.is_consecutive_surgery && surgery.previous_surgery_end_time) {
    start = new Date(surgery.previous_surgery_end_time);
  } else {
    const startCandidates = [];
    if (Array.isArray(surgery.power_on_times)) {
      surgery.power_on_times.forEach(t => t && startCandidates.push(new Date(t).getTime()));
    } else if (surgery.power_on_time) {
      startCandidates.push(new Date(surgery.power_on_time).getTime());
    }
    if (surgery.surgery_start_time) startCandidates.push(new Date(surgery.surgery_start_time).getTime());
    if (startCandidates.length > 0) {
      start = new Date(Math.min(...startCandidates));
    }
  }

  // 终点：在关机、手术结束、最后日志中取最晚者
  const endCandidates = [];
  if (Array.isArray(surgery.shutdown_times)) {
    surgery.shutdown_times.forEach(t => t && endCandidates.push(new Date(t).getTime()));
  } else if (surgery.power_off_time) {
    endCandidates.push(new Date(surgery.power_off_time).getTime());
  }
  if (surgery.surgery_end_time) endCandidates.push(new Date(surgery.surgery_end_time).getTime());
  if (surgery.last_log_time) endCandidates.push(new Date(surgery.last_log_time).getTime());
  if (globalLastLogTime) endCandidates.push(new Date(globalLastLogTime).getTime());

  const end = endCandidates.length > 0 ? new Date(Math.max(...endCandidates)) : null;

  return { start, end };
}

// 查找指定时间之前的最近UDI码
function findNearestUDI(udiHistory, targetTime) {
  if (!udiHistory || udiHistory.length === 0) return '未知';
  
  const targetTimestamp = new Date(targetTime).getTime();
  
  // 从最新的记录开始向前查找
  for (let i = udiHistory.length - 1; i >= 0; i--) {
    const recordTime = new Date(udiHistory[i].timestamp).getTime();
    if (recordTime <= targetTimestamp) {
      return udiHistory[i].udi;
    }
  }
  
  return '未知';
}

// 生成故障唯一标识
function generateAlarmKey(errCode, timestamp) {
  return `${errCode}_${timestamp.getTime()}`;
}

// 从故障标识中提取故障码
function extractErrCodeFromKey(alarmKey) {
  return alarmKey.split('_')[0];
}

// 更新工具臂上最近的"待更新"器械记录
function updatePendingInstrumentUDI(currentSurgery, armIndex, udi) {
  if (!currentSurgery) return;
  
  const armUsageKey = `arm${armIndex + 1}_usage`;
  const currentUsage = currentSurgery[armUsageKey] || [];
  
  // 查找该工具臂上最近的"待更新"记录
  // 优先查找未完成的记录（endTime为null），如果没有则查找最近的已完成记录
  let foundActive = false;
  
  // 先查找未完成的记录
  for (let i = currentUsage.length - 1; i >= 0; i--) {
    if (currentUsage[i].udi === '待更新' && currentUsage[i].endTime === null && currentUsage[i].armIndex === armIndex) {
      currentUsage[i].udi = udi;
      console.log(`更新工具臂${armIndex + 1}活跃器械 ${currentUsage[i].instrumentName} 的UDI码: ${udi}`);
      foundActive = true;
      break;
    }
  }
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
    duration: Math.floor((maxTime - minTime) / 1000 / 60) + '分钟',
    isCrossDay: minTime.getDate() !== maxTime.getDate() || 
                minTime.getMonth() !== maxTime.getMonth() || 
                minTime.getFullYear() !== maxTime.getFullYear()
  });
  
  // 确保日志条目按时间戳排序
  const sortedLogEntries = logEntries.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return timeA - timeB;
  });
  
  console.log('日志条目已按时间戳排序，时间范围:', {
    start: sortedLogEntries[0].timestamp,
    end: sortedLogEntries[sortedLogEntries.length - 1].timestamp,
    count: sortedLogEntries.length
  });
  
  const surgeries = [];
  let currentSurgery = null;
  let surgeryCount = 0;
  let surgeryStarted = false; // 标记手术是否已经开始
  
  let isPowerOn = false;
        
  let errFlag = false;
  let errRecover = false;
  let Trecover = null;
  
  const armStates = [-1, -1, -1, -1]; // 4个工具臂的器械状态
  const armInsts = [0, 0, 0, 0]; // 4个工具臂的器械类型
  const armUDIs = ['', '', '', '']; // 4个工具臂的UDI码
  const armUDIHistory = [[], [], [], []]; // 每个工具臂的UDI码历史记录
  
  const stateMachineChanges = [];
  let currentState = 0; // 当前状态机状态
  const alarmRecords = new Set();
  const alarmDetails = [];
  
  // 故障记录：记录未恢复的故障（允许相同故障码在不同时间出现）
  const activeAlarms = new Map(); // 记录未恢复的故障，key为故障码，value为最新的故障信息
  
  const footPedalStats = { energy: 0, clutch: 0, camera: 0 };
  const handClutchStats = { arm1: 0, arm2: 0, arm3: 0, arm4: 0 };
  
  // 记录所有开机和关机事件，用于后续计算
  const powerEvents = [];
  
  // 记录所有开机和关机时间，用于手术创建时设置开机时间
  let PowerOnTimes = [];
  let ShutDownTimes = [];
  


  // 使用排序后的日志条目进行分析
  for (let i = 0; i < sortedLogEntries.length; i++) {
    const entry = sortedLogEntries[i];
    const errCode = entry.error_code;
    // 取错误码的后4位进行匹配
    const errCodeSuffix = errCode ? errCode.slice(-4) : '';
    
    const p1 = parseInt(entry.param1) || 0;
    const p2 = parseInt(entry.param2) || 0;
    const p3 = parseInt(entry.param3) || 0;
    const p4 = parseInt(entry.param4) || 0;
   
    // 安全报警检查（仅A/B类故障计入未处理，等待故障恢复后改为已处理）
    if (errCodeSuffix && /[AB]$/i.test(errCodeSuffix)) {
      //故障手术
      errFlag = true;
      // 记录新的故障（允许相同故障码在不同时间出现）
      const alarmInfo = {
        time: entry.timestamp,
        type: errCodeSuffix.endsWith('A') ? '错误' : errCodeSuffix.endsWith('B') ? '警告' : '信息',
        code: errCode,
        message: entry.explanation || `故障码: ${errCode}`,
        status: '未处理',
        isActive: true  // 激活状态
      };
      
      // 生成唯一的故障标识（故障码+时间戳）
      const alarmKey = generateAlarmKey(errCode, entry.timestamp);
      
      // 将故障信息添加到活跃故障记录（以故障码+时间戳为key）
      activeAlarms.set(alarmKey, alarmInfo);
      
      // 添加到报警详情列表
      alarmDetails.push(alarmInfo);
           
      if (currentSurgery) {
        currentSurgery.has_error = true;
      }
      
      console.log(`检测到故障: ${errCode}, 类型: ${alarmInfo.type}, 时间: ${entry.timestamp}, 唯一标识: ${alarmKey}`);
      console.log(`当前活跃故障数量: ${activeAlarms.size}`);
    }
    
    // 开机事件处理 - 支持两种开机条件
    // 情况1：errCode后四位为"A01E"
    // 情况2：errcode是否为570e 且 p1=0 且 p2≠0
    if (((errCodeSuffix === 'A01E') || (errCodeSuffix === '570e' && p1 === 0 && p2 !== 0)) && (isPowerOn === false)){
      console.log(`检测到开机事件: 时间=${entry.timestamp}`);
      //开机标志位
      errFlag = false;
      isPowerOn = true;
      // 获取最后一个关机时间
      const lastPowerOff = powerEvents.filter(e => e.type === 'power_off').pop();
      let shouldClearSurgery = false;
      //检查距离上次关机超过30分钟
      if (lastPowerOff && currentSurgery) {
        const timeDiff = Math.floor((new Date(entry.timestamp) - new Date(lastPowerOff.timestamp)) / 1000 / 60);
        shouldClearSurgery = timeDiff >= 30;
        console.log(`距离上次关机${timeDiff}分钟，${shouldClearSurgery ? '清空当前手术，准备新手术' : '保持当前手术'}`);
      }
      
      // 如果需要清空当前手术，重置所有状态
      if (shouldClearSurgery) {
        currentSurgery = null;
        console.log(`清空当前手术的所有状态`);
        // 保留全局开机时间数组用于后续分析，但不再复制给新手术
        PowerOnTimes.push(entry.timestamp);
               
        surgeryStarted = false;
        errFlag = false;
        armStates.fill(-1);
        armInsts.fill(-1);
        armUDIs.fill('');
        armUDIHistory.forEach(history => history.length = 0);
        stateMachineChanges.length = 0;
        currentState = -1;
        alarmDetails.length = 0;
        alarmRecords.clear();
        activeAlarms.clear();
      } else {
        // 重启需要记录开机时间
        PowerOnTimes.push(entry.timestamp);
        // 如果有当前手术，将开机时间记录到手术中
        if (currentSurgery) {
          if (!currentSurgery.power_on_times) {
            currentSurgery.power_on_times = [];
          }
          currentSurgery.power_on_times.push(entry.timestamp);
          console.log(`为手术 ${currentSurgery.surgery_id} 记录开机时间: ${entry.timestamp}, 当前开机时间数量: ${currentSurgery.power_on_times.length}`);
        }
      }

      // 记录开机事件
      powerEvents.push({
        type: 'power_on',
        timestamp: entry.timestamp,
        surgery_id: currentSurgery ? currentSurgery.surgery_id : null,
        isRestart: !shouldClearSurgery // 如果不是清空手术，则认为是重启
      });

      shouldClearSurgery = false;
      // 开机时不创建新手术，只记录开机时间
      // 新手术的创建将在手术开始时进行
      console.log(`开机事件记录: ${entry.timestamp}, 当前手术: ${currentSurgery ? currentSurgery.surgery_id : '无'}`);
    }
    // 关机事件处理 - 支持两种关机条件
     // 情况1：errCode后四位为 'A02E'
     // 情况2：检查errcode=310e且p2=31
    if ((errCodeSuffix === 'A02E')|| (errCodeSuffix === '310e' && p2 === 31)){
       console.log(`检测到A02E关机事件: 时间=${entry.timestamp}`);
       isPowerOn = false;
       errFlag = false;
       // 记录关机事件
       powerEvents.push({
         type: 'power_off',
         timestamp: entry.timestamp,
         surgery_id: currentSurgery ? currentSurgery.surgery_id : null
       });
       // 记录关机时间，无论是否有手术对象
       ShutDownTimes.push(entry.timestamp); // 记录所有关机时间
             //更新手术信息
      if (currentSurgery) {
        // 初始化关机时间数组
        if (!currentSurgery.shutdown_times) {
          currentSurgery.shutdown_times = [];
        }
        // 初始化开机时间数组（防止未定义错误）
        if (!currentSurgery.power_on_times) {
          currentSurgery.power_on_times = [];
        }
        // 添加当前关机时间到手术的关机时间列表
        currentSurgery.shutdown_times.push(entry.timestamp);
                 //清空手术开机和关机时间，
        if(surgeryStarted === false){
          PowerOnTimes = [];
          ShutDownTimes = [];
        }
        console.log(`为手术 ${currentSurgery.surgery_id} 记录关机时间: ${entry.timestamp}, 
         当前关机时间数量: ${currentSurgery.shutdown_times.length}, 当前开机时间数量: ${currentSurgery.power_on_times.length}`);

      }

      
     }

         // 状态机事件处理
     if (errCodeSuffix === '310e') {

       const newState = p2;
       // 更新当前状态机状态
       currentState = newState;
       
       stateMachineChanges.push({
         time: entry.timestamp,
         state: newState,
         stateName: getStateMachineStateName(newState.toString())
       });
      
      
      // 故障恢复判断
      if (p1 === 0 && p2 === 1 && errFlag) {
        errFlag = false;
        errRecover = true;

        console.log('故障已恢复，更新当前活跃故障记录状态');
        
        // 处理故障恢复：仅将最近一次触发的激活报警标记为"已处理"
        let processedCount = 0;

        // 从报警详情列表末尾向前查找最近一个处于激活状态的报警
        for (let i = alarmDetails.length - 1; i >= 0; i--) {
          const detail = alarmDetails[i];
          if (detail && detail.isActive === true) {
            // 更新详情项
            detail.isActive = false;
            detail.status = '已处理';
            detail.recoveryTime = entry.timestamp;

            // 同步更新到活跃故障记录并移除该条
            try {
              const alarmKey = generateAlarmKey(detail.code, new Date(detail.time));
              const active = activeAlarms.get(alarmKey);
              if (active) {
                active.isActive = false;
                active.status = '已处理';
                active.recoveryTime = entry.timestamp;
                activeAlarms.delete(alarmKey);
              }
            } catch (e) {
              console.warn('根据报警详情生成键失败，已跳过活跃故障同步:', e);
            }

            processedCount = 1;
            console.log(`故障恢复: ${detail.code}, 仅将最近一次触发的报警标记为"已处理"`);
            break;
          }
        }

        if (processedCount === 0) {
          console.log('未找到处于激活状态的报警用于恢复处理');
        }

        console.log(`已处理 ${processedCount} 个激活状态的故障`);
        console.log(`剩余活跃故障数量: ${activeAlarms.size}`);
      }
    }
    
    // 器械状态更新
     if (errCodeSuffix === '500e') {
       const armIndex = p1 - 1;
       if (armIndex >= 0 && armIndex < 4) {
         armStates[armIndex] = p3; // 更新工具臂的器械状态
       }
    }
    
    // 器械类型变化记录
     if (errCodeSuffix === '501e') {
       const armIndex = p1;
       if (armIndex >= 0 && armIndex < 4) {
         console.log(`更新器械类型: 臂${armIndex + 1}, 器械类型=${p3}, 时间=${entry.timestamp}`);
         armInsts[armIndex] = p3; // 更新工具臂的器械类型
         
         // 修改逻辑：只要系统开机就记录器械使用时间，不依赖于手术对象的存在
         if (isPowerOn) {
           // 连台手术场景：上一台已结束但下一台尚未正式开始。如果发生器械安装事件，归属到下一台的临时对象。
           if (!currentSurgery || (currentSurgery && currentSurgery.surgery_end_time)) {
             const prevEnd = currentSurgery ? currentSurgery.surgery_end_time : null;
             if (!currentSurgery) {
               console.log(`系统开机但未开始手术，创建临时手术对象记录器械使用时间`);
             } else {
               console.log(`上一台手术(${currentSurgery.surgery_id})已结束，创建新的临时手术对象记录连台间隙的器械安装事件`);
             }
             surgeryCount++;
             currentSurgery = {
               id: surgeryCount,
               surgery_id: `Surgery-${surgeryCount.toString().padStart(2, '0')}`,
               log_id: entry.log_id,
               // 连台：使用上一台手术的结束时间作为新时间轴起点；否则使用全局开机时间
               power_on_times: prevEnd ? [prevEnd] : [...PowerOnTimes],
               shutdown_times: [...ShutDownTimes],
               arm1_usage: [],
               arm2_usage: [],
               arm3_usage: [],
               arm4_usage: [],
               arm1_total_activation: { startTime: null, endTime: null },
               arm2_total_activation: { startTime: null, endTime: null },
               arm3_total_activation: { startTime: null, endTime: null },
               arm4_total_activation: { startTime: null, endTime: null },
               is_pre_surgery: true, // 手术开始前的临时容器
               is_consecutive_surgery: !!prevEnd,
               previous_surgery_end_time: prevEnd
             };
             console.log(`创建临时手术对象: ${currentSurgery.surgery_id} 用于记录手术前/连台间隙器械使用时间`);
           }
           
           const armUsageKey = `arm${armIndex + 1}_usage`;
           const armActivationKey = `arm${armIndex + 1}_total_activation`;
           const currentUsage = currentSurgery[armUsageKey] || [];
           
           if (p3 > 0) {
             // 器械插上 - 记录开始时间
             // 由于UDI码通常在器械插上后记录，先使用"待更新"标记
             console.log(`工具臂${armIndex + 1}插上器械: ${getInstrumentTypeName(p3.toString())}, 时间: ${entry.timestamp}`);
             currentUsage.push({
               instrumentType: p3,
               instrumentName: getInstrumentTypeName(p3.toString()),
               udi: '待更新',  // 初始标记为待更新
               startTime: entry.timestamp,  // 器械使用时间从实际插上时间开始
               endTime: null,  // 拔下时间待定
               duration: 0,    // 使用时长待计算
               armIndex: armIndex,  // 记录工具臂索引
               is_pre_surgery: !surgeryStarted // 标记是否为手术前安装的器械（仅用于分类，不影响使用时间计算）
             });
             
             // 更新工具臂总激活时间
             if (currentSurgery && currentSurgery[armActivationKey] && currentSurgery[armActivationKey].startTime === null) {
               currentSurgery[armActivationKey].startTime = entry.timestamp;
             }
           } else {
  
             // 器械拔下 - 找到最近的未完成记录并设置结束时间
             if (currentUsage.length > 0) {
               const lastUsage = currentUsage[currentUsage.length - 1];
               if (lastUsage && lastUsage.endTime === null) {
                 lastUsage.endTime = entry.timestamp;
                 lastUsage.duration = Math.floor((new Date(lastUsage.endTime) - new Date(lastUsage.startTime)) / 1000 / 60); // 分钟
                 console.log(`工具臂${armIndex + 1}拔下器械: ${lastUsage.instrumentName}, UDI: ${lastUsage.udi}, 使用时长: ${lastUsage.duration}分钟`);
                 
                 // 更新工具臂总激活时间
                 if (currentSurgery && currentSurgery[armActivationKey]) {
                   currentSurgery[armActivationKey].endTime = entry.timestamp;
                 }
               }
             }
           }
           
           if (currentSurgery) {
             currentSurgery[armUsageKey] = currentUsage;
           }
         }
       }
     }
     
     // 手术开始判断
     if (currentState === 20 && surgeryStarted === false) {  
      // 手术开始时，检查是否已有手术前的手术对象，通常不会这样
      if (!currentSurgery) {
        //手术是否开始标志位
        surgeryStarted = true;
        surgeryCount++;
        currentSurgery = {
          id: surgeryCount,
          surgery_id: `Surgery-${surgeryCount.toString().padStart(2, '0')}`,
          log_id: entry.log_id,
          power_on_times: [...PowerOnTimes], // 复制全局开机时间
          shutdown_times: [...ShutDownTimes], // 复制全局关机时间
          arm1_usage: [],
          arm2_usage: [],
          arm3_usage: [],
          arm4_usage: [],
          arm1_total_activation: { startTime: null, endTime: null },
          arm2_total_activation: { startTime: null, endTime: null },
          arm3_total_activation: { startTime: null, endTime: null },
          arm4_total_activation: { startTime: null, endTime: null },
          alarm_details: [],
          state_machine_changes: [],
          foot_pedal_stats: {},
          hand_clutch_stats: {},
          error_recovery_time: 0,
          is_pre_surgery: false,
          surgery_start_time: entry.timestamp,
          surgery_end_time: null,
          total_duration: 0,
          alarm_count: 0,
          alarm_details: [],
          state_machine_changes: [],
        };
        // 重置所有状态
        errFlag = false;
        armStates.fill(-1);
        armInsts.fill(-1);
        armUDIs.fill('');
        armUDIHistory.forEach(history => history.length = 0);
        stateMachineChanges.length = 0;
        currentState = -1;
        alarmDetails.length = 0;
        alarmRecords.clear();
        activeAlarms.clear();
        console.log(`手术开始时创建新手术对象: ${currentSurgery.surgery_id}, 包含开机时间: ${currentSurgery.power_on_times.length} 个`, currentSurgery.power_on_times);
      } else if (currentSurgery.is_pre_surgery) {
         //手术是否开始标志位
         surgeryStarted = true;
        // 如果已有手术前的手术对象，将其转换为正式手术对象,通常情况，安装了器械还没开始手术
        // 更新全局时间数据到手术对象
        currentSurgery.power_on_times = [...PowerOnTimes];
        currentSurgery.shutdown_times = [...ShutDownTimes];
        console.log(`将手术前的手术对象 ${currentSurgery.surgery_id} 转换为正式手术对象,当前开机时间数量: ${currentSurgery.power_on_times.length}, 关机时间数量: ${currentSurgery.shutdown_times.length}`);
        currentSurgery.is_pre_surgery = false;
        // 设置手术开始时间
        currentSurgery.surgery_start_time = entry.timestamp;
        console.log(`手术开始时间: ${currentSurgery.surgery_start_time}`);
      }else if(currentSurgery.is_pre_surgery === false){
        // 如果已有手术对象，且不是手术前的手术对象，重启
        if(surgeryStarted){
          currentSurgery.is_pre_surgery = false;
        }// 连台
        else{
          // 连台手术：记录上一台手术结束时间
          let previousSurgeryEndTime = null;
          if (currentSurgery && currentSurgery.surgery_end_time) {
            previousSurgeryEndTime = currentSurgery.surgery_end_time;
            console.log(`连台手术：记录上一台手术 ${currentSurgery.surgery_id} 结束时间: ${previousSurgeryEndTime}`);        
          }
          
          currentSurgery = null;
          //手术是否开始标志位 
          surgeryCount++;
          surgeryStarted = true;
          currentSurgery = {
            id: surgeryCount,
            surgery_id: `Surgery-${surgeryCount.toString().padStart(2, '0')}`,
            log_id: entry.log_id,
            power_on_times: previousSurgeryEndTime ? [previousSurgeryEndTime] : [...PowerOnTimes], // 连台手术：用上一台手术结束时间替换开机时间
            shutdown_times: [...ShutDownTimes], // 复制全局关机时间
            arm1_usage: [],
            arm2_usage: [],
            arm3_usage: [],
            arm4_usage: [],
            arm1_total_activation: { startTime: null, endTime: null },
            arm2_total_activation: { startTime: null, endTime: null },
            arm3_total_activation: { startTime: null, endTime: null },
            arm4_total_activation: { startTime: null, endTime: null },
            alarm_details: [],
            state_machine_changes: [],
            foot_pedal_stats: {},
            hand_clutch_stats: {},
            error_recovery_time: 0,
            is_pre_surgery: false,
            surgery_start_time: entry.timestamp,
            surgery_end_time: null,
            total_duration: 0,
            alarm_count: alarmDetails.length,
            alarm_details: [...alarmDetails],
            state_machine_changes: [],
            is_consecutive_surgery: previousSurgeryEndTime !== null, // 标记是否为连台手术
            previous_surgery_end_time: previousSurgeryEndTime // 记录上一台手术结束时间
          }     
          if (previousSurgeryEndTime) {
            console.log(`连台手术，手术开始时间: ${currentSurgery.surgery_start_time}，开机时间已替换为上一台手术结束时间: ${previousSurgeryEndTime}`);
          } else {
            console.log(`连台手术，手术开始时间: ${currentSurgery.surgery_start_time}`);
          }
        }
      }          
    } 
     
     // 手术结束判断：检查是否满足结束条件（500e错误码特定条件）
     if (errCodeSuffix === '500e' && p2 !== 0 && p3 === 0) {

       // 检查所有器械状态=0或-1 且当前 state 在特定值范围内（10、12、13 或 30）
       const allarmStateZero = armStates.every(armStates => armStates === 0 || armStates === -1);
       const hasValidEndState = currentState === 10 || currentState === 12 || currentState === 13;

       if (allarmStateZero && hasValidEndState) {
         console.log(`满足手术结束条件: 器械状态=${armStates}, 当前状态=${currentState}(${getStateMachineStateName(currentState.toString())}), 时间=${entry.timestamp}`);
         if (currentSurgery) {
           currentSurgery.surgery_end_time = entry.timestamp;
           
           // 计算手术总时长
           currentSurgery.total_duration = Math.floor(
             (new Date(currentSurgery.surgery_end_time) - new Date(currentSurgery.surgery_start_time)) / 1000 / 60
           );
           
           // 设置手术的最终数据
           currentSurgery.alarm_count = alarmDetails.length;
           currentSurgery.alarm_details = [...alarmDetails]; // 复制数组
           
           // 状态机变化：使用与时间线一致的时间范围（最早-最晚事件）
           const { start: tlStart, end: tlEnd } = computeTimelineRangeForSurgery(currentSurgery, sortedLogEntries[sortedLogEntries.length - 1]?.timestamp);
           const tlStartMs = tlStart ? tlStart.getTime() : null;
           const tlEndMs = tlEnd ? tlEnd.getTime() : null;
           const filteredChanges = stateMachineChanges.filter(change => {
             const changeTime = new Date(change.time).getTime();
             // 连台：如果有上一台结束时间，严格从上一台结束时间开始；否则用计算的起点
             const startBoundary = tlStartMs;
             return (startBoundary === null || changeTime >= startBoundary) && (tlEndMs === null || changeTime <= tlEndMs);
           });
           currentSurgery.state_machine_changes = [...filteredChanges];
           console.log(`手术 ${currentSurgery.surgery_id} 状态机变化(时间线范围): ${filteredChanges.length} 个`);
          

             
          // 设置最后一条日志时间，用于时间轴计算
          currentSurgery.last_log_time = sortedLogEntries[sortedLogEntries.length - 1].timestamp;
          
          console.log(`手术 ${currentSurgery.surgery_id} 正常完成，关机时间: ${currentSurgery.shutdown_times.length} 个，开机时间: ${currentSurgery.power_on_times.length} 个`);
           
           // 将完成的手术添加到手术列表中（如果还没有添加过）
           const isAlreadyAdded = surgeries.some(surgery => surgery.surgery_id === currentSurgery.surgery_id);
           if (!isAlreadyAdded) {
             surgeries.push(currentSurgery);
             console.log(`完成手术: ${currentSurgery.surgery_id}, 时长: ${currentSurgery.total_duration} 分钟`);
           } else {
             console.log(`手术 ${currentSurgery.surgery_id} 已经存在于手术列表中，跳过添加`);
           }
         }
         
         // 手术结束时不清空当前手术对象，保持数据用于后续可能的关机事件
         if (currentSurgery) {
           console.log(`手术结束，保持当前手术对象 ${currentSurgery.surgery_id} 用于后续关机事件`);
         } else {
           console.log('手术结束，当前无手术对象，保持为空以等待后续关机事件');
         }
         
         // 重置手术开始标志，但不清空手术对象
         surgeryStarted = false;
       }
     }
    
         // UDI码记录
     if (errCodeSuffix === '510e') {
       const armIndex = errCode.charAt(1)-3;
       if (armIndex >= 0 && armIndex < 4) {
          // 处理 p1：取高 8 位转为 ASCII，若是 'F' 或 'D'，则用它拼接低 8 位（十六进制大写）；否则用原始 p1（十六进制大写，不做拆分）
          const highByte = (p1 >> 8) & 0xFF;
          const lowByte = p1 & 0xFF;
          const highChar = String.fromCharCode(highByte);
          let formattedP1;
          let udi;
          if (highChar === 'F' || highChar === 'D') {
            // 拼接 highChar + 低 8 位（以两位十六进制，不足补 0）
            const lowHex = lowByte.toString(16).toUpperCase().padStart(2, '0');
            formattedP1 = `${highChar}${lowHex}`;
            // p2：分别取高 8 位和低 8 位，转换为大写十六进制，拼接
            const p2HighHex = ((p2 >> 8) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
            const p2LowHex  = (p2 & 0xFF).toString(16).toUpperCase().padStart(2, '0');
            const formattedP2 = `${p2HighHex}${p2LowHex}`;
            // 修正 UDI 码生成逻辑：用处理后的 p1，加上 p2, p3, p4 （p4 作为 ASCII 字符）
            udi = `${formattedP1}${formattedP2}${p3}${p4}`;
          } else {
              // 原样输出 p1 的十进制表示
              formattedP1 = String(p1);
              // p2 补零为 3 位
              const p2Padded = String(p2).padStart(3, '0');
              if ((armInsts[armIndex] === 9) || (armInsts[armIndex] === 10) || (armInsts[armIndex] === 11))
              {
                // 修正 UDI 码生成逻辑：用处理后的 p1，加上 p2, p3, p4 （p4 作为 ASCII 字符）
                udi = `ECO${p3}${String.fromCharCode(p4)}-${formattedP1}${p2Padded}`;
              }else if(armInsts[armIndex] === 17){
                const p3Padded = String(p3).padStart(3, '0');
                const p4Padded = String(p4).padStart(3, '0');
                // 修正 UDI 码生成逻辑：用处理后的 p1，加上 p2, p3, p4 （p4 作为 ASCII 字符）
                udi = `F${formattedP1}${p2}${p3Padded}${p4Padded}`;
              }
              else{
                // 修正 UDI 码生成逻辑：用处理后的 p1，加上 p2, p3, p4 （p4 作为 ASCII 字符）
                udi = `IN${p3}${String.fromCharCode(p4)}-${formattedP1}${p2Padded}`;
              }
          }

          // 更新当前UDI码并保存到历史记录
          armUDIs[armIndex] = udi; // 更新工具臂的UDI码
          armUDIHistory[armIndex].push({
            udi: udi,
            timestamp: entry.timestamp
          });
          
          // 更新该工具臂上最近的"待更新"器械记录
          updatePendingInstrumentUDI(currentSurgery, armIndex, udi);
          
          console.log(`记录工具臂${armIndex + 1}的UDI码: ${udi}, 时间: ${entry.timestamp}`);
        }
     }

     // 处理无使用次数事件：errCodeSuffix = '2c2d'
     // 依据需求：armIndex = errCode.charAt(1) - 3
     if (errCodeSuffix === '2c2d') {
       const armIndex = errCode.charAt(1) - 3;
       if (armIndex >= 0 && armIndex < 4) {
         console.log(`检测到2c2d（无使用次数）: 臂${armIndex + 1}, 时间=${entry.timestamp}，清除该臂的器械类型并回退最近一次使用记录`);
         // 重置该工具臂的器械类型为0（无器械）
         armInsts[armIndex] = 0;
         // 删除对应臂 currentUsage 上一个添加的事件
         if (currentSurgery) {
           const armUsageKey = `arm${armIndex + 1}_usage`;
           const currentUsage = currentSurgery[armUsageKey] || [];
           if (currentUsage.length > 0) {
             const removed = currentUsage.pop();
             console.log(`移除工具臂${armIndex + 1}最近一次使用记录:`, {
               instrumentName: removed.instrumentName,
               startTime: removed.startTime,
               endTime: removed.endTime,
               udi: removed.udi
             });
             currentSurgery[armUsageKey] = currentUsage;
           } else {
             console.log(`工具臂${armIndex + 1}无可回退的使用记录`);
           }
         }
       }
     }
   }
   
  // 处理未完成的手术：如果没有手术结束时间，使用最后一条日志时间作为手术结束时间，并计算总时长
  if (currentSurgery && !currentSurgery.surgery_end_time) {
    const lastLogTime = sortedLogEntries[sortedLogEntries.length - 1].timestamp;
    currentSurgery.surgery_end_time = lastLogTime;
    currentSurgery.last_log_time = lastLogTime;
    if (currentSurgery.surgery_start_time) {
      currentSurgery.total_duration = Math.floor(
        (new Date(currentSurgery.surgery_end_time) - new Date(currentSurgery.surgery_start_time)) / 1000 / 60
      );
    }
    console.log(`手术 ${currentSurgery.surgery_id}，手术结束时间(暂用最后日志时间): ${currentSurgery.surgery_end_time}`);
  } else if (currentSurgery) {
    // 记录最后日志时间，便于前端时间轴兜底
    currentSurgery.last_log_time = sortedLogEntries[sortedLogEntries.length - 1].timestamp;
    console.log(`手术 ${currentSurgery.surgery_id}，手术未结束标记: ${currentSurgery.surgery_end_time}`);
  }

  // 若当前无手术对象，则跳过后续汇总与入列逻辑
  if (currentSurgery) {
    // 将完成的手术添加到手术列表中（如果还没有添加过）
    const isAlreadyAdded = surgeries.some(surgery => surgery.surgery_id === currentSurgery.surgery_id);
    if (!isAlreadyAdded) {
      surgeries.push(currentSurgery);
      console.log(`完成手术: ${currentSurgery.surgery_id}, 时长: ${currentSurgery.total_duration} 分钟`);
    } else {
      console.log(`手术 ${currentSurgery.surgery_id} 已经存在于手术列表中，跳过添加`);
    }

    currentSurgery.alarm_count = alarmDetails.length;
    currentSurgery.alarm_details = alarmDetails;
    console.log(`手术 ${currentSurgery.surgery_id} 异常完成，故障统计:`, {
      alarm_count: currentSurgery.alarm_count,
      alarm_details_length: alarmDetails.length,
      alarm_details: alarmDetails.map(d => ({ code: d.code, status: d.status }))
    });

    // 状态机变化：使用与时间线一致的时间范围（最早-最晚事件）
    const { start: tlStart2, end: tlEnd2 } = computeTimelineRangeForSurgery(currentSurgery, sortedLogEntries[sortedLogEntries.length - 1]?.timestamp);
    const tlStartMs2 = tlStart2 ? tlStart2.getTime() : null;
    const tlEndMs2 = tlEnd2 ? tlEnd2.getTime() : null;
    const surgeryStateChanges = stateMachineChanges.filter(change => {
      const changeTime = new Date(change.time).getTime();
      // 连台：如果有上一台结束时间，严格从上一台结束时间开始；否则用计算的起点
      const startBoundary2 = tlStartMs2;
      return (startBoundary2 === null || changeTime >= startBoundary2) && (tlEndMs2 === null || changeTime <= tlEndMs2);
    });
    currentSurgery.state_machine_changes = surgeryStateChanges;
    console.log(`手术 ${currentSurgery.surgery_id} 状态机变化(时间线范围): ${surgeryStateChanges.length} 个`);
    currentSurgery.foot_pedal_stats = footPedalStats;
    currentSurgery.hand_clutch_stats = handClutchStats;
  } else {
    console.log('当前无手术对象，无需汇总与入列处理');
  }
     
   // 兜底处理：为未闭合的器械使用段补充 endTime，使前端可见
   const globalLastLogTime = sortedLogEntries[sortedLogEntries.length - 1]?.timestamp;
   surgeries.forEach((surgery, surgeryIndex) => {
     const fallbackEnd = surgery.surgery_end_time || surgery.last_log_time || globalLastLogTime;
     ['arm1_usage','arm2_usage','arm3_usage','arm4_usage'].forEach(key => {
       const usages = surgery[key] || [];
       usages.forEach(u => {
         if (u && u.startTime && !u.endTime && fallbackEnd) {
           const startMs = new Date(u.startTime).getTime();
           const endMs = new Date(fallbackEnd).getTime();
           const adjustedEndMs = Math.max(startMs + 1000, endMs); // 至少1秒
           u.endTime = new Date(adjustedEndMs).toISOString();
           const durationSeconds = Math.max(1, Math.floor((adjustedEndMs - startMs) / 1000));
           u.duration_seconds = durationSeconds;
           u.duration = Math.floor(durationSeconds / 60);
         }
       });
       surgery[key] = usages;
     });
     console.log(`手术 ${surgery.surgery_id}: 开机时间数量=${surgery.power_on_times ? surgery.power_on_times.length : 0}, 关机时间数量=${surgery.shutdown_times ? surgery.shutdown_times.length : 0}`);
   });
   
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

// 新增：通过日志ID列表直接分析手术数据
const analyzeByLogIds = async (req, res) => {
  try {
    const { logIds } = req.body;
    
    if (!logIds || !Array.isArray(logIds) || logIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供有效的日志ID列表'
      });
    }

    console.log(`开始通过日志ID列表分析手术数据，共 ${logIds.length} 个日志文件`);
    
    // 获取所有日志的条目数据
    const allLogEntries = [];
    
    for (const logId of logIds) {
      try {
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
        
        console.log(`日志 ${logName} (ID: ${logId}) 包含 ${logEntries.length} 条记录`);
        
      } catch (error) {
        console.error(`获取日志ID ${logId} 的条目失败:`, error);
        // 继续处理其他日志，不中断整个分析过程
      }
    }
    
    if (allLogEntries.length === 0) {
      return res.status(400).json({
        success: false,
        message: '未找到任何日志条目数据'
      });
    }
    
    console.log(`总共获取到 ${allLogEntries.length} 条日志条目`);
    
    // 按时间戳排序所有条目
    const sortedLogEntries = allLogEntries.sort((a, b) => 
      new Date(a.timestamp) - new Date(b.timestamp)
    );
    
    console.log('日志条目已按时间戳排序，时间范围:', {
      start: sortedLogEntries[0].timestamp,
      end: sortedLogEntries[sortedLogEntries.length - 1].timestamp,
      count: sortedLogEntries.length
    });
    
    // 使用已排序的日志条目进行分析
    const surgeries = analyzeSurgeries(sortedLogEntries);
    console.log(`从日志ID列表分析出 ${surgeries.length} 场手术`);
    
    // 为每个手术分配唯一ID
    surgeries.forEach((surgery, index) => {
      surgery.id = index + 1;
      surgery.log_filename = `批量日志分析 (${logIds.length}个文件)`;
    });
    
    console.log('分析完成，手术数据:', surgeries);
    res.json({
      success: true,
      data: surgeries,
      message: `成功分析出 ${surgeries.length} 场手术数据（来自 ${logIds.length} 个日志文件，共 ${sortedLogEntries.length} 条记录）`
    });
    
  } catch (error) {
    console.error('通过日志ID列表分析手术数据失败:', error);
    res.status(500).json({ 
      success: false,
      message: '通过日志ID列表分析手术数据失败', 
      error: error.message 
    });
  }
};

module.exports = {
  getAllSurgeryStatistics,
  analyzeSortedLogEntries,
  analyzeByLogIds,
  exportSurgeryReport,
  analyzeSurgeries
};