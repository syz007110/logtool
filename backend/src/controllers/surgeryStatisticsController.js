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
  
  // 为每场手术单独记录关机时间
  const surgeryShutdownTimes = new Map(); // key: surgery_id, value: [shutdown_times]
  
  // 记录每场手术的开机时间
  const surgeryPowerOnTimes = new Map(); // key: surgery_id, value: [power_on_times]

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
   
    // 安全报警检查 - 支持故障去重处理
    if (errCodeSuffix && /[ABC]$/i.test(errCodeSuffix)) {
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
      
      // 检查是否需要清空当前手术（距离上次关机超过30分钟）
      const lastPowerOff = powerEvents.filter(e => e.type === 'power_off').pop();
      let shouldClearSurgery = false;
      
      if (lastPowerOff && currentSurgery) {
        const timeDiff = Math.floor((new Date(entry.timestamp) - new Date(lastPowerOff.timestamp)) / 1000 / 60);
        shouldClearSurgery = timeDiff >= 30;
        console.log(`距离上次关机${timeDiff}分钟，${shouldClearSurgery ? '清空当前手术，准备新手术' : '保持当前手术'}`);
      }
      
      // 如果需要清空当前手术，重置所有状态
      if (shouldClearSurgery) {
        console.log(`清空当前手术 ${currentSurgery.surgery_id} 的所有状态`);
        
        // 清空全局开机时间列表，只保留当前的开机时间
        console.log(`清空前全局开机时间列表: ${PowerOnTimes.length} 个`, PowerOnTimes);
        PowerOnTimes = [entry.timestamp]; // 只保留当前的开机时间
        console.log(`清空后全局开机时间列表: ${PowerOnTimes.length} 个`, PowerOnTimes);
        
        currentSurgery = null;
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
        // 只有在不清空手术的情况下才添加开机时间
        // 记录所有开机时间
        PowerOnTimes.push(entry.timestamp); 
      }
      
      //开机标志位
      isPowerOn = true;
      // 记录开机事件
      powerEvents.push({
        type: 'power_on',
        timestamp: entry.timestamp,
        surgery_id: currentSurgery ? currentSurgery.surgery_id : null,
        isRestart: !shouldClearSurgery // 如果不是清空手术，则认为是重启
      });
      
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
          // 添加当前关机时间到手术的关机时间列表
          currentSurgery.shutdown_times.push(entry.timestamp);
          
          // 为当前手术记录关机时间
          if (!surgeryShutdownTimes.has(currentSurgery.surgery_id)) {
            surgeryShutdownTimes.set(currentSurgery.surgery_id, []);
          }
          surgeryShutdownTimes.get(currentSurgery.surgery_id).push(entry.timestamp);
          
          console.log(`为手术 ${currentSurgery.surgery_id} 记录关机时间: ${entry.timestamp}, 当前关机时间数量: ${currentSurgery.shutdown_times.length}`);
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
      
      // 手术开始判断
      if (currentState === 20 && surgeryStarted === false) {
        console.log(`检测到手术开始: 状态=${newState}, 开机状态=${isPowerOn}, 时间=${entry.timestamp}`)
        console.log(`手术开始时的器械类型: ${armInsts}`);
        //手术是否开始标志位
        surgeryStarted = true;
        
        // 检查是否是重启后的手术继续
        const lastPowerOff = powerEvents.filter(e => e.type === 'power_off').pop();
        const lastPowerOn = powerEvents.filter(e => e.type === 'power_on').pop();
        let isRestart = false;
        
        if (lastPowerOff && lastPowerOn && currentSurgery) {
          const timeDiff = Math.floor((new Date(lastPowerOn.timestamp) - new Date(lastPowerOff.timestamp)) / 1000 / 60);
          isRestart = timeDiff < 30;
          console.log(`距离上次关机${timeDiff}分钟，${isRestart ? '判定为重启' : '判定为新手术'}`);
        }
        
        // 手术开始时，检查是否已有手术前的手术对象
        if (!currentSurgery) {
          surgeryCount++;
          currentSurgery = {
            id: surgeryCount,
            surgery_id: `Surgery-${surgeryCount.toString().padStart(2, '0')}`,
            log_id: entry.log_id,
            power_on_times: [],
            shutdown_times: [],
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
            error_recovery_time: 0
          };
          console.log(`手术开始时创建新手术对象: ${currentSurgery.surgery_id}`);
        } else if (currentSurgery.is_pre_surgery) {
          // 如果已有手术前的手术对象，将其转换为正式手术对象
          console.log(`将手术前的手术对象 ${currentSurgery.surgery_id} 转换为正式手术对象`);
          currentSurgery.is_pre_surgery = false;
          
          // 更新手术前安装的器械标记
          for (let armIndex = 0; armIndex < 4; armIndex++) {
            const armUsageKey = `arm${armIndex + 1}_usage`;
            const currentUsage = currentSurgery[armUsageKey] || [];
            currentUsage.forEach(usage => {
              if (usage.is_pre_surgery) {
                usage.is_pre_surgery = false;
                console.log(`更新器械 ${usage.instrumentName} 标记：从手术前安装转为手术中使用`);
              }
            });
          }
          
          // 为新手术分配开机时间
          if (PowerOnTimes && PowerOnTimes.length > 0) {
            // 找到该手术时间范围内的所有开机时间
            const surgeryStartTime = new Date(entry.timestamp).getTime();
            let surgeryPowerOnTimesArray = [];
            
            console.log(`开始为手术分配开机时间，手术开始时间: ${entry.timestamp}`);
            console.log(`全局开机时间列表: ${PowerOnTimes.length} 个`, PowerOnTimes);
            console.log(`全局关机时间列表: ${ShutDownTimes.length} 个`, ShutDownTimes);
            
            // 查找手术开始时间之前的所有开机时间
            for (let i = 0; i < PowerOnTimes.length; i++) {
              const powerOnTime = new Date(PowerOnTimes[i]).getTime();
              if (powerOnTime <= surgeryStartTime) {
                console.log(`检查开机时间 ${PowerOnTimes[i]} (索引${i})，时间戳: ${powerOnTime}`);
                
                // 检查这个开机时间是否应该被包含在当前手术中
                let shouldInclude = true;
                
                // 查找该开机时间之前的最近关机时间
                const previousShutdownTime = ShutDownTimes
                  .filter(shutdownTime => new Date(shutdownTime).getTime() < powerOnTime)
                  .pop();
                
                if (previousShutdownTime) {
                  const timeDiff = powerOnTime - new Date(previousShutdownTime).getTime();
                  const timeDiffMinutes = timeDiff / (1000 * 60);
                  
                  console.log(`找到上一个关机时间: ${previousShutdownTime}，间隔: ${timeDiffMinutes}分钟`);
                  
                  // 如果距离上次关机超过30分钟，检查是否需要只保留最近的开机时间
                  if (timeDiffMinutes > 30) {
                    // 查找该关机时间之后的所有开机时间
                    const subsequentPowerOnTimes = PowerOnTimes.filter(poTime => {
                      const poTimestamp = new Date(poTime).getTime();
                      return poTimestamp > new Date(previousShutdownTime).getTime() && 
                             poTimestamp <= surgeryStartTime;
                    });
                    
                    console.log(`关机后找到 ${subsequentPowerOnTimes.length} 个开机时间:`, subsequentPowerOnTimes);
                    
                    // 如果当前开机时间不是最近的一个，则跳过
                    if (subsequentPowerOnTimes.length > 0) {
                      const latestPowerOnTime = subsequentPowerOnTimes[subsequentPowerOnTimes.length - 1];
                      if (PowerOnTimes[i] !== latestPowerOnTime) {
                        shouldInclude = false;
                        console.log(`跳过开机时间 ${PowerOnTimes[i]}，距离上次关机${timeDiffMinutes}分钟，保留最近的开机时间 ${latestPowerOnTime}`);
                      } else {
                        console.log(`保留开机时间 ${PowerOnTimes[i]}，这是最近的开机时间`);
                      }
                    }
                  }
                  // 如果距离上次关机小于30分钟，保留所有开机时间
                  else {
                    console.log(`保留开机时间 ${PowerOnTimes[i]}，距离上次关机${timeDiffMinutes}分钟 < 30分钟（重启）`);
                  }
                } else {
                  // 没有找到之前的关机时间，保留该开机时间
                  console.log(`保留开机时间 ${PowerOnTimes[i]}，没有找到之前的关机时间`);
                }
                
                if (shouldInclude) {
                  surgeryPowerOnTimesArray.push(PowerOnTimes[i]);
                  console.log(`已添加开机时间 ${PowerOnTimes[i]} 到手术开机时间列表`);
                }
              } else {
                console.log(`跳过开机时间 ${PowerOnTimes[i]}，晚于手术开始时间`);
              }
            }
            
            currentSurgery.power_on_times = surgeryPowerOnTimesArray;
            surgeryPowerOnTimes.set(currentSurgery.surgery_id, surgeryPowerOnTimesArray);
            console.log(`为手术 ${currentSurgery.surgery_id} 分配开机时间: ${surgeryPowerOnTimesArray.length} 个`, surgeryPowerOnTimesArray);
          }
        } else if (!isRestart) {
          // 如果不是重启，说明是新手术，需要清空当前手术并创建新的
          console.log(`检测到新手术开始，清空当前手术 ${currentSurgery.surgery_id} 并创建新手术`);
          
          // 将当前手术添加到手术列表（如果还没有添加过）
          const isAlreadyAdded = surgeries.some(surgery => surgery.surgery_id === currentSurgery.surgery_id);
          if (!isAlreadyAdded) {
            surgeries.push(currentSurgery);
            console.log(`将手术 ${currentSurgery.surgery_id} 添加到手术列表`);
          } else {
            console.log(`手术 ${currentSurgery.surgery_id} 已经存在于手术列表中，跳过添加`);
          }
          
          // 创建新手术
          surgeryCount++;
          currentSurgery = {
            id: surgeryCount,
            surgery_id: `Surgery-${surgeryCount.toString().padStart(2, '0')}`,
            log_id: entry.log_id,
            power_on_times: [],
            shutdown_times: [],
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
            error_recovery_time: 0
          };
          console.log(`创建新手术对象: ${currentSurgery.surgery_id}`);
          
          // 为新手术分配开机时间
          if (PowerOnTimes && PowerOnTimes.length > 0) {
            // 找到该手术时间范围内的所有开机时间
            const surgeryStartTime = new Date(entry.timestamp).getTime();
            let surgeryPowerOnTimesArray = [];
            
            // 查找手术开始时间之前的所有开机时间
            for (let i = 0; i < PowerOnTimes.length; i++) {
              const powerOnTime = new Date(PowerOnTimes[i]).getTime();
              if (powerOnTime <= surgeryStartTime) {
                // 检查这个开机时间是否应该被包含在当前手术中
                let shouldInclude = true;
                
                // 查找该开机时间之前的最近关机时间
                const previousShutdownTime = ShutDownTimes
                  .filter(shutdownTime => new Date(shutdownTime).getTime() < powerOnTime)
                  .pop();
                
                if (previousShutdownTime) {
                  const timeDiff = powerOnTime - new Date(previousShutdownTime).getTime();
                  const timeDiffMinutes = timeDiff / (1000 * 60);
                  
                  // 如果距离上次关机超过30分钟，检查是否需要只保留最近的开机时间
                  if (timeDiffMinutes > 30) {
                    // 查找该关机时间之后的所有开机时间
                    const subsequentPowerOnTimes = PowerOnTimes.filter(poTime => {
                      const poTimestamp = new Date(poTime).getTime();
                      return poTimestamp > new Date(previousShutdownTime).getTime() && 
                             poTimestamp <= surgeryStartTime;
                    });
                    
                    // 如果当前开机时间不是最近的一个，则跳过
                    if (subsequentPowerOnTimes.length > 0) {
                      const latestPowerOnTime = subsequentPowerOnTimes[subsequentPowerOnTimes.length - 1];
                      if (PowerOnTimes[i] !== latestPowerOnTime) {
                        shouldInclude = false;
                        console.log(`跳过开机时间 ${PowerOnTimes[i]}，距离上次关机${timeDiffMinutes}分钟，保留最近的开机时间 ${latestPowerOnTime}`);
                      }
                    }
                  }
                  // 如果距离上次关机小于30分钟，保留所有开机时间
                  else {
                    console.log(`保留开机时间 ${PowerOnTimes[i]}，距离上次关机${timeDiffMinutes}分钟 < 30分钟（重启）`);
                  }
                } else {
                  // 没有找到之前的关机时间，保留该开机时间
                  console.log(`保留开机时间 ${PowerOnTimes[i]}，没有找到之前的关机时间`);
                }
                
                if (shouldInclude) {
                  surgeryPowerOnTimesArray.push(PowerOnTimes[i]);
                }
              }
            }
            
            currentSurgery.power_on_times = surgeryPowerOnTimesArray;
            surgeryPowerOnTimes.set(currentSurgery.surgery_id, surgeryPowerOnTimesArray);
            console.log(`为手术 ${currentSurgery.surgery_id} 分配开机时间: ${surgeryPowerOnTimesArray.length} 个`, surgeryPowerOnTimesArray);
          }
          
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
        }
        
        // 设置手术开始时间
        currentSurgery.surgery_start_time = entry.timestamp;
      }
      
      // 故障恢复判断
      if (p1 === 0 && p2 === 1 && errFlag) {
        errFlag = false;
        errRecover = true;

        console.log('故障已恢复，更新当前活跃故障记录状态');
        
        // 处理故障恢复：取消激活状态，修改状态为"已处理"
        const recoveredCodes = []
        const recoveredKeys = []
        
        // 查找所有激活状态的故障
        activeAlarms.forEach((alarm, alarmKey) => {
          if (alarm.isActive === true) {
            // 取消激活状态
            alarm.isActive = false;
            // 修改状态为"已处理"
            alarm.status = '已处理';
            alarm.recoveryTime = entry.timestamp;
            recoveredCodes.push(alarm.code); // 提取故障码
            recoveredKeys.push(alarmKey); // 记录要删除的键
            
            console.log(`故障恢复: ${alarm.code}, 取消激活状态，状态改为"已处理"`);
          }
        });
        
        // 从活跃故障记录中删除已处理的故障
        recoveredKeys.forEach(key => {
          activeAlarms.delete(key);
        });
        
        // 更新报警详情列表中对应故障的状态
        alarmDetails.forEach(detail => {
          if (detail.isActive === true && recoveredCodes.includes(detail.code)) {
            detail.isActive = false;
            detail.status = '已处理';
            detail.recoveryTime = entry.timestamp;
          }
        });
      
        console.log(`已处理 ${recoveredCodes.length} 个激活状态的故障`);
        console.log(`剩余活跃故障数量: ${activeAlarms.size}`);
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
           // 如果还没有手术对象，创建一个临时的来记录器械使用时间
           if (!currentSurgery) {
             console.log(`系统开机但未开始手术，创建临时手术对象记录器械使用时间`);
             surgeryCount++;
             currentSurgery = {
               id: surgeryCount,
               surgery_id: `Surgery-${surgeryCount.toString().padStart(2, '0')}`,
               log_id: entry.log_id,
               power_on_times: [...PowerOnTimes], // 复制当前的开机时间
               shutdown_times: [],
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
               is_pre_surgery: true // 标记为手术前状态
             };
             console.log(`创建临时手术对象: ${currentSurgery.surgery_id} 用于记录手术前器械使用时间`);
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
               startTime: entry.timestamp,
               endTime: null,  // 拔下时间待定
               duration: 0,    // 使用时长待计算
               armIndex: armIndex,  // 记录工具臂索引
               is_pre_surgery: !surgeryStarted // 标记是否为手术前安装的器械
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
     
     // 手术结束判断：检查是否满足结束条件（500e错误码特定条件）
     if (errCodeSuffix === '500e' && p2 !== 0 && p3 === 0) {

       // 检查所有器械状态=0或-1 且当前 state 在特定值范围内（10、12、13 或 30）
       const allInstrumentsRemoved = armInsts.every(instrument => instrument === 0 || instrument === -1);
       const hasValidEndState = currentState === 10 || currentState === 12 || currentState === 13;

       if (allInstrumentsRemoved && hasValidEndState) {
         console.log(`满足手术结束条件: 器械类型=${armInsts}, 当前状态=${currentState}(${getStateMachineStateName(currentState.toString())}), 时间=${entry.timestamp}`);
         if (currentSurgery) {
           currentSurgery.surgery_end_time = entry.timestamp;
           
           // 计算手术总时长
           currentSurgery.total_duration = Math.floor(
             (new Date(currentSurgery.surgery_end_time) - new Date(currentSurgery.surgery_start_time)) / 1000 / 60
           );
           
           // 处理手术结束时还未拔下的器械
           for (let armIndex = 0; armIndex < 4; armIndex++) {
             const armUsageKey = `arm${armIndex + 1}_usage`;
             const currentUsage = currentSurgery[armUsageKey] || [];
             if (currentUsage.length > 0) {
               const lastUsage = currentUsage[currentUsage.length - 1];
               if (lastUsage && lastUsage.endTime === null) {
                 lastUsage.endTime = currentSurgery.surgery_end_time;
                 lastUsage.duration = Math.floor((new Date(lastUsage.endTime) - new Date(lastUsage.startTime)) / 1000 / 60);
                 console.log(`手术正常结束时处理工具臂${armIndex + 1}未拔下器械: ${lastUsage.instrumentName}, 总使用时长: ${lastUsage.duration}分钟`);
               }
             }
           }
           
           // 设置手术的最终数据
           currentSurgery.alarm_count = alarmDetails.length;
           currentSurgery.alarm_details = [...alarmDetails]; // 复制数组
           currentSurgery.state_machine_changes = [...stateMachineChanges]; // 复制数组
           currentSurgery.foot_pedal_stats = { ...footPedalStats }; // 复制对象
           currentSurgery.hand_clutch_stats = { ...handClutchStats }; // 复制对象
           
           // 使用手术专属的关机时间，而不是所有关机时间
           const surgerySpecificShutdownTimes = surgeryShutdownTimes.get(currentSurgery.surgery_id) || [];
           
           // 添加手术结束时间之后的所有关机时间
           const surgeryEndTime = new Date(currentSurgery.surgery_end_time).getTime();
           const allShutdownTimes = [...surgerySpecificShutdownTimes];
           
           // 查找手术结束时间之后的所有关机时间
           for (const shutdownTime of ShutDownTimes) {
             const shutdownTimestamp = new Date(shutdownTime).getTime();
             if (shutdownTimestamp >= surgeryEndTime && !allShutdownTimes.includes(shutdownTime)) {
               allShutdownTimes.push(shutdownTime);
             }
           }
           
           currentSurgery.shutdown_times = allShutdownTimes;
           
           // 重新计算手术的开机时间，包含手术期间的所有开机时间
           const surgeryStartTime = new Date(currentSurgery.surgery_start_time).getTime();
           const surgeryEndTimeForPowerOn = new Date(currentSurgery.surgery_end_time).getTime();
           let finalPowerOnTimes = [];
           
           // 查找手术时间范围内的所有开机时间
           for (let i = 0; i < PowerOnTimes.length; i++) {
             const powerOnTime = new Date(PowerOnTimes[i]).getTime();
             if (powerOnTime <= surgeryEndTimeForPowerOn) {
               // 检查这个开机时间是否应该被包含在当前手术中
               let shouldInclude = true;
               
               // 查找该开机时间之前的最近关机时间
               const previousShutdownTime = ShutDownTimes
                 .filter(shutdownTime => new Date(shutdownTime).getTime() < powerOnTime)
                 .pop();
               
               if (previousShutdownTime) {
                 const timeDiff = powerOnTime - new Date(previousShutdownTime).getTime();
                 const timeDiffMinutes = timeDiff / (1000 * 60);
                 
                 // 如果距离上次关机超过30分钟，检查是否需要只保留最近的开机时间
                 if (timeDiffMinutes > 30) {
                   // 查找该关机时间之后的所有开机时间
                   const subsequentPowerOnTimes = PowerOnTimes.filter(poTime => {
                     const poTimestamp = new Date(poTime).getTime();
                     return poTimestamp > new Date(previousShutdownTime).getTime() && 
                            poTimestamp <= surgeryEndTimeForPowerOn;
                   });
                   
                   // 如果当前开机时间不是最近的一个，则跳过
                   if (subsequentPowerOnTimes.length > 0) {
                     const latestPowerOnTime = subsequentPowerOnTimes[subsequentPowerOnTimes.length - 1];
                     if (PowerOnTimes[i] !== latestPowerOnTime) {
                       shouldInclude = false;
                     }
                   }
                 }
                 // 如果距离上次关机小于30分钟，保留所有开机时间
               }
               
               if (shouldInclude) {
                 // 检查是否已经包含这个开机时间（去重）
                 const isDuplicate = finalPowerOnTimes.some(existingTime => 
                   new Date(existingTime).getTime() === powerOnTime
                 );
                 
                 if (!isDuplicate) {
                   finalPowerOnTimes.push(PowerOnTimes[i]);
                 } else {
                   console.log(`跳过重复的开机时间: ${PowerOnTimes[i]}`);
                 }
               }
             }
           }
           
           currentSurgery.power_on_times = finalPowerOnTimes;
           
           // 设置最后一条日志时间，用于时间轴计算
           currentSurgery.last_log_time = sortedLogEntries[sortedLogEntries.length - 1].timestamp;
           
           console.log(`手术 ${currentSurgery.surgery_id} 正常完成，关机时间: ${allShutdownTimes.length} 个，开机时间: ${finalPowerOnTimes.length} 个`);
           
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
         // 只有在下次开机距离上次关机超过30分钟或下次手术开始时才清空
         console.log(`手术结束，保持当前手术对象 ${currentSurgery.surgery_id} 用于后续关机事件`);
         
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
              // 修正 UDI 码生成逻辑：用处理后的 p1，加上 p2, p3, p4 （p4 作为 ASCII 字符）
              udi = `${formattedP1}${p2}${p3}${String.fromCharCode(p4)}`;
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
   }
   
   // 如果还有未完成的手术，检查是否有关机时间作为手术结束时间
   // 检查当前手术是否已经在surgeries数组中（避免重复添加）
   const isAlreadyAdded = surgeries.some(surgery => surgery.surgery_id === currentSurgery?.surgery_id);
   if (currentSurgery && !currentSurgery.surgery_end_time && !isAlreadyAdded) {
     console.log(`手术未正常结束，检查是否有关机时间可用作手术结束时间`)
     
     // 查找手术开始时间之后的关机时间
     const surgeryStartTime = new Date(currentSurgery.surgery_start_time).getTime();
     let shutdownTimeForSurgery = null;
     let nextPowerOnTime = null;
     
     if (ShutDownTimes && ShutDownTimes.length > 0) {
       for (const shutdownTime of ShutDownTimes) {
         const shutdownTimestamp = new Date(shutdownTime).getTime();
         if (shutdownTimestamp > surgeryStartTime) {
           // 找到关机时间后，检查是否有后续的开机时间
           if (PowerOnTimes && PowerOnTimes.length > 0) {
             for (const powerOnTime of PowerOnTimes) {
               const powerOnTimestamp = new Date(powerOnTime).getTime();
               if (powerOnTimestamp > shutdownTimestamp) {
                 nextPowerOnTime = powerOnTime;
                 break; // 找到关机后的第一个开机时间
               }
             }
           }
           
           // 如果有关机后的开机时间，检查时间间隔
           if (nextPowerOnTime) {
             const timeDiff = Math.floor((new Date(nextPowerOnTime) - new Date(shutdownTime)) / 1000 / 60);
             console.log(`关机时间: ${shutdownTime}, 下次开机时间: ${nextPowerOnTime}, 间隔: ${timeDiff}分钟`);
             
             if (timeDiff < 30) {
               console.log(`关机到开机间隔${timeDiff}分钟 < 30分钟，判定为重启，不使用此关机时间作为手术结束时间`);
               // 继续查找下一个关机时间
               continue;
             } else {
               console.log(`关机到开机间隔${timeDiff}分钟 >= 30分钟，判定为手术结束，使用关机时间作为手术结束时间`);
               shutdownTimeForSurgery = shutdownTime;
               break; // 使用这个关机时间作为手术结束时间
             }
           } else {
             // 没有找到后续开机时间，使用关机时间作为手术结束时间
             console.log(`未找到关机后的开机时间，使用关机时间作为手术结束时间: ${shutdownTime}`);
             shutdownTimeForSurgery = shutdownTime;
             break;
           }
         }
       }
     }
     
     // 如果没有找到合适的关机时间，使用最后一条日志作为结束
     if (!shutdownTimeForSurgery) {
       console.log(`未找到合适的关机时间，使用最后一条日志作为结束时间`)
       const lastEntry = logEntries[logEntries.length - 1];
       currentSurgery.surgery_end_time = lastEntry.timestamp;
     } else {
       console.log(`使用关机时间作为手术结束时间: ${shutdownTimeForSurgery}`)
       currentSurgery.surgery_end_time = shutdownTimeForSurgery;
     }
     
     currentSurgery.total_duration = Math.floor(
       (currentSurgery.surgery_end_time - currentSurgery.surgery_start_time) / 1000 / 60
     );
     
     // 处理手术结束时还未拔下的器械
     for (let armIndex = 0; armIndex < 4; armIndex++) {
       const armUsageKey = `arm${armIndex + 1}_usage`;
       const currentUsage = currentSurgery[armUsageKey] || [];
       if (currentUsage.length > 0) {
         const lastUsage = currentUsage[currentUsage.length - 1];
         if (lastUsage && lastUsage.endTime === null) {
           lastUsage.endTime = currentSurgery.surgery_end_time;
           lastUsage.duration = Math.floor((new Date(lastUsage.endTime) - new Date(lastUsage.startTime)) / 1000 / 60);
           console.log(`手术异常结束时处理工具臂${armIndex + 1}未拔下器械: ${lastUsage.instrumentName}, 总使用时长: ${lastUsage.duration}分钟`);
         }
       }
     }
     
     currentSurgery.alarm_count = alarmDetails.length;
     currentSurgery.alarm_details = alarmDetails;
     console.log(`手术 ${currentSurgery.surgery_id} 异常完成，故障统计:`, {
       alarm_count: currentSurgery.alarm_count,
       alarm_details_length: alarmDetails.length,
       alarm_details: alarmDetails.map(d => ({ code: d.code, status: d.status }))
     });
     currentSurgery.state_machine_changes = stateMachineChanges;
     currentSurgery.foot_pedal_stats = footPedalStats;
     currentSurgery.hand_clutch_stats = handClutchStats;
     
     // 使用手术专属的关机时间，而不是所有关机时间
     const surgerySpecificShutdownTimes = surgeryShutdownTimes.get(currentSurgery.surgery_id) || [];
     
     // 添加手术开始时间之后的所有关机时间
     const surgeryStartTimeForShutdown = new Date(currentSurgery.surgery_start_time).getTime();
     const allShutdownTimes = [...surgerySpecificShutdownTimes];
     
     // 查找手术开始时间之后的所有关机时间
     for (const shutdownTime of ShutDownTimes) {
       const shutdownTimestamp = new Date(shutdownTime).getTime();
       if (shutdownTimestamp >= surgeryStartTimeForShutdown && !allShutdownTimes.includes(shutdownTime)) {
         allShutdownTimes.push(shutdownTime);
       }
     }
     
     currentSurgery.shutdown_times = allShutdownTimes;
     
     // 重新计算手术的开机时间，包含手术期间的所有开机时间
     const surgeryStartTimeForPowerOn = new Date(currentSurgery.surgery_start_time).getTime();
     const surgeryEndTimeForPowerOn = new Date(currentSurgery.surgery_end_time).getTime();
     let finalPowerOnTimes = [];
     
     // 查找手术时间范围内的所有开机时间
     for (let i = 0; i < PowerOnTimes.length; i++) {
       const powerOnTime = new Date(PowerOnTimes[i]).getTime();
       if (powerOnTime <= surgeryEndTimeForPowerOn) {
         // 检查这个开机时间是否应该被包含在当前手术中
         let shouldInclude = true;
         
         // 查找该开机时间之前的最近关机时间
         const previousShutdownTime = ShutDownTimes
           .filter(shutdownTime => new Date(shutdownTime).getTime() < powerOnTime)
           .pop();
         
         if (previousShutdownTime) {
           const timeDiff = powerOnTime - new Date(previousShutdownTime).getTime();
           const timeDiffMinutes = timeDiff / (1000 * 60);
           
           // 如果距离上次关机超过30分钟，检查是否需要只保留最近的开机时间
           if (timeDiffMinutes > 30) {
             // 查找该关机时间之后的所有开机时间
             const subsequentPowerOnTimes = PowerOnTimes.filter(poTime => {
               const poTimestamp = new Date(poTime).getTime();
               return poTimestamp > new Date(previousShutdownTime).getTime() && 
                      poTimestamp <= surgeryEndTimeForPowerOn;
             });
             
             // 如果当前开机时间不是最近的一个，则跳过
             if (subsequentPowerOnTimes.length > 0) {
               const latestPowerOnTime = subsequentPowerOnTimes[subsequentPowerOnTimes.length - 1];
               if (PowerOnTimes[i] !== latestPowerOnTime) {
                 shouldInclude = false;
               }
             }
           }
           // 如果距离上次关机小于30分钟，保留所有开机时间
         }
         
         if (shouldInclude) {
           // 检查是否已经包含这个开机时间（去重）
           const isDuplicate = finalPowerOnTimes.some(existingTime => 
             new Date(existingTime).getTime() === powerOnTime
           );
           
           if (!isDuplicate) {
             finalPowerOnTimes.push(PowerOnTimes[i]);
           } else {
             console.log(`跳过重复的开机时间: ${PowerOnTimes[i]}`);
           }
         }
       }
     }
     
     currentSurgery.power_on_times = finalPowerOnTimes;
     
     // 设置最后一条日志时间，用于时间轴计算
     currentSurgery.last_log_time = sortedLogEntries[sortedLogEntries.length - 1].timestamp;
     
     console.log(`手术 ${currentSurgery.surgery_id} 异常完成，关机时间: ${allShutdownTimes.length} 个，开机时间: ${finalPowerOnTimes.length} 个`);
     
     // 将异常完成的手术添加到手术列表中（如果还没有添加过）
     const isAlreadyAddedForAbnormal = surgeries.some(surgery => surgery.surgery_id === currentSurgery.surgery_id);
     if (!isAlreadyAddedForAbnormal) {
       surgeries.push(currentSurgery);
       console.log(`完成手术: ${currentSurgery.surgery_id}, 时长: ${currentSurgery.total_duration} 分钟 (使用${shutdownTimeForSurgery ? '关机时间' : '最后一条日志'}作为结束)`);
     } else {
       console.log(`手术 ${currentSurgery.surgery_id} 已经存在于手术列表中，跳过添加`);
     }
   }
   
   // 记录所有手术的开机和关机时间信息
   console.log(`完成 ${surgeries.length} 场手术的开机和关机时间记录`);
   console.log(`记录到的电源事件: ${powerEvents.length} 个`, powerEvents.slice(0, 5));
   
   surgeries.forEach((surgery, surgeryIndex) => {
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