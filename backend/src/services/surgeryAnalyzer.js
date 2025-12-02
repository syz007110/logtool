const faultMappings = require('../config/FaultMappings.json');

// 器械类型映射
const INSTRUMENT_TYPES = faultMappings['3'];
const STATE_MACHINE_STATES = faultMappings['1'];

// 内窥镜类型集合（这些类型之间的转换不算更换器械，只是图像识别更新类型）
const ENDOSCOPE_TYPES = new Set([9, 10, 11, 23, 24]);

/**
 * 手术分析器类
 * 负责将日志条目分析为结构化的手术数据
 */
class SurgeryAnalyzer {
  constructor() {
    this.reset();
  }

  /**
   * 重置分析器状态
   */
  reset() {
    // 手术相关状态
    this.surgeries = [];
    this.currentSurgery = null;
    this.surgeryCount = 0;
    this.surgeryStarted = false;
    
    // 系统状态
    this.isPowerOn = false;
    this.currentState = 0;
    
    // 故障相关状态
    this.errFlag = false;
    this.errRecover = false;
    this.activeAlarms = new Map(); // 活跃故障记录
    this.alarmDetails = [];
    
    // 器械状态
    this.armStates = [-1, -1, -1, -1]; // 4个工具臂的器械状态
    this.armInsts = [0, 0, 0, 0]; // 4个工具臂的器械类型
    this.armInstsHistory = []; // 器械类型历史记录
    this.armUDIs = ['', '', '', '']; // 4个工具臂的UDI码
    this.armUDIHistory = [[], [], [], []]; // 每个工具臂的UDI码历史记录
    
    // 事件记录
    this.powerEvents = [];
    this.stateMachineChanges = [];
    this.networkLatencyData = [];
    
    // 时间记录
    this.powerOnTimes = [];
    this.shutdownTimes = [];
    this.previousSurgeryEndTime = null;
    
    // 网络状态
    this.isRemoteSurgery = false;
    
    // 统计信息
    this.footPedalStats = { energy: 0, clutch: 0, camera: 0 };
    this.handClutchStats = { arm1: 0, arm2: 0, arm3: 0, arm4: 0 };
    
    // 脚踏和离合触发状态追踪
    this.endoscopePedalState = 0;      // 内窥镜脚踏状态（705E的p1）
    this.endoscopePedalState526 = 0;   // 内窥镜脚踏状态（526E的p1）
    this.armSwitchPedalState = 0;      // 臂切换脚踏状态（704E的p1）
    this.armSwitchPedalState527 = 0;   // 臂切换脚踏状态（527E的p1）
    this.footClutchState = 0;          // 脚离合状态（706E的p1）
    this.footClutchState525 = 0;       // 脚离合状态（525E的p1）
    this.leftHandClutchState = 0;      // 左手离合状态（70AE且p3=1的p1）
    this.rightHandClutchState = 0;     // 右手离合状态（70AE且p3=2的p1）
    
    // 脚踏和离合触发次数统计
    this.endoscopePedalCount = 0;      // 内窥镜脚踏触发次数
    this.armSwitchCount = 0;           // 臂切换脚踏触发次数
    this.footClutchCount = 0;          // 脚离合触发次数
    this.leftHandClutchCount = 0;      // 左手离合触发次数
    this.rightHandClutchCount = 0;     // 右手离合触发次数

    // 脚离合按下时间追踪（706E/525E）
    this.footClutchLastPress706 = null;
    this.footClutchLastPress525 = null;
    
    // 内窥镜脚踏按下时间追踪（705E/526E）
    this.endoscopePedalLastPress705 = null;
    this.endoscopePedalLastPress526 = null;
    
    // 臂切换脚踏按下时间追踪（704E/527E）
    this.armSwitchLastPress704 = null;
    this.armSwitchLastPress527 = null;
  }

  /**
   * 分析日志条目
   * @param {Array} logEntries - 日志条目数组
   * @returns {Array} 手术数据数组
   */
  analyze(logEntries) {
    console.log(`开始分析 ${logEntries.length} 个日志条目`);
    
    // 确保日志条目按时间戳排序
    const sortedLogEntries = [...logEntries].sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return timeA - timeB;
    });

    // 遍历每个日志条目
    for (let i = 0; i < sortedLogEntries.length; i++) {
      const entry = sortedLogEntries[i];
      this.processLogEntry(entry, i, sortedLogEntries);
    }

    // 最终处理
    this.finalizeAnalysis(sortedLogEntries);
    
    console.log(`分析完成，共发现 ${this.surgeries.length} 场手术`);
    return this.surgeries;
  }

  /**
   * 处理单个日志条目
   * @param {Object} entry - 日志条目
   * @param {number} index - 条目索引
   * @param {Array} allEntries - 所有日志条目
   */
  processLogEntry(entry, index, allEntries) {
    const errCode = entry.error_code;
    const errCodeSuffix = errCode ? errCode.slice(-4) : '';
    const p1 = parseInt(entry.param1) || 0;
    const p2 = parseInt(entry.param2) || 0;
    const p3 = parseInt(entry.param3) || 0;
    const p4 = parseInt(entry.param4) || 0;

    // 处理网络事件
    this.processNetworkEvents(errCodeSuffix, p1, p3, entry);
    
    // 处理故障事件
    this.processFaultEvents(errCodeSuffix, errCode, entry);
    
    // 处理开机事件
    this.processPowerOnEvents(errCodeSuffix, p1, p2, entry, index, allEntries);
    
    // 处理关机事件
    this.processPowerOffEvents(errCodeSuffix, p1, p2, entry, index, allEntries);
    
    // 处理状态机事件
    this.processStateMachineEvents(errCodeSuffix, p1, p2, entry);
    
    // 处理器械状态更新
    this.processInstrumentStateEvents(errCodeSuffix, p1, p3, entry);
    
    // 处理器械类型变化
    this.processInstrumentTypeEvents(errCodeSuffix, p1, p3, entry);
    
    // 处理手术开始
    this.processSurgeryStartEvents(entry);
    
    // 处理手术结束
    this.processSurgeryEndEvents(errCodeSuffix, p2, p3, entry);
    
    // 处理UDI码
    this.processUDIEvents(errCodeSuffix, errCode, p1, p2, p3, p4, entry);
    
    // 处理无使用次数事件
    this.processNoUsageEvents(errCodeSuffix, errCode, entry);
    
    // 处理脚踏和离合触发事件
    this.processPedalAndClutchEvents(errCodeSuffix, p1, p3, entry);
  }

  /**
   * 处理网络事件
   */
  processNetworkEvents(errCodeSuffix, p1, p3, entry) {
    // 检查是否为远程手术
    if (errCodeSuffix === '416d') {
      this.isRemoteSurgery = true;
      if (this.currentSurgery) {
        this.currentSurgery.is_remote_surgery = true;
      }
    }
    
    // 检查网络延时数据
    if (errCodeSuffix === '405e') {
      const latency = p3;
      if (latency > 0) {
        this.networkLatencyData.push({
          timestamp: entry.timestamp,
          latency: latency,
          surgery_id: this.currentSurgery ? this.currentSurgery.surgery_id : null
        });
      }
    }
  }

  /**
   * 处理故障事件
   */
  processFaultEvents(errCodeSuffix, errCode, entry) {
    if (errCodeSuffix && /[AB]$/i.test(errCodeSuffix)) {
      this.errFlag = true;
      
      const existingAlarm = this.activeAlarms.get(errCode);
      
      // 如果已存在且处于活跃状态（未恢复），不新增也不更新时间
      if (existingAlarm && existingAlarm.isActive === true) {
        // 什么都不做，保持原有记录不变
        return;
      }
      
      // 如果不存在或已恢复（isActive=false），创建新的报警记录
      const alarmType = errCodeSuffix.endsWith('A') ? '错误' : errCodeSuffix.endsWith('B') ? '警告' : '信息';
      const alarmInfo = {
        time: entry.timestamp,
        type: alarmType,
        code: errCode,
        message: entry.explanation || `故障码: ${errCode}`,
        status: '未处理',
        isActive: true,
        // 保存参数值（用于后续释义解析）
        param1: entry.param1 || '',
        param2: entry.param2 || '',
        param3: entry.param3 || '',
        param4: entry.param4 || ''
      };
      
      this.activeAlarms.set(errCode, alarmInfo);
      this.alarmDetails.push(alarmInfo);
      
      console.log(`🚨 新增故障报警: 类型=${alarmType}, 错误码=${errCode}, 时间=${entry.timestamp}, 说明=${alarmInfo.message}`);
      
      if (this.currentSurgery) {
        this.currentSurgery.has_error = true;
      }
    }
  }

  /**
   * 处理开机事件
   */
  processPowerOnEvents(errCodeSuffix, p1, p2, entry, index, allEntries) {
    const isPowerOnEvent = (errCodeSuffix === 'A01e') || 
                          (errCodeSuffix === '570e' && p1 === 0 && p2 !== 0);
    
    if (isPowerOnEvent && !this.isPowerOn) {
      console.log(`检测到开机事件: 时间=${entry.timestamp}`);
      
      this.errFlag = false;
      this.isPowerOn = true;
    } else if (isPowerOnEvent && this.isPowerOn) {
      // 检测到开机事件但isPowerOn=true，说明之前有异常关机
      console.log(`检测到异常关机后重启: 时间=${entry.timestamp}, 当前状态=${this.currentState}, 器械状态=${this.armStates}`);
      
      // 记录异常关机信息
      const lastPowerOff = this.powerEvents.filter(e => e.type === 'power_off').pop();
      if (lastPowerOff) {
        const timeSinceLastShutdown = Math.floor((new Date(entry.timestamp) - new Date(lastPowerOff.timestamp)) / 1000 / 60);
        console.log(`距离上次正常关机: ${timeSinceLastShutdown}分钟`);
      } else {
        console.log(`未找到上次正常关机记录`);
      }
      
      // 检查是否有未完成的手术
      if (this.currentSurgery && !this.currentSurgery.surgery_end_time) {
        // 判断是否为异常关机：检查前1分钟以上且前30分钟以内是否存在日志
        const isAbnormalShutdown = this.detectAbnormalShutdown(entry, index, allEntries);
        
        if (isAbnormalShutdown) {
          console.log(`检测到异常关机，清空当前手术数据: ID=${this.currentSurgery.surgery_id}, 开始时间=${this.currentSurgery.surgery_start_time}`);
          
          // 只有正式手术（有开始时间且不是准备手术）才需要处理异常关机
          if (this.currentSurgery.surgery_start_time && !this.currentSurgery.is_pre_surgery) {
            // 异常关机：寻找上一场手术的最后一条日志作为手术结束时间
            const lastLogOfPreviousSurgery = this.findLastLogOfPreviousSurgery(entry, index, allEntries);
            if (lastLogOfPreviousSurgery) {
              this.currentSurgery.surgery_end_time = lastLogOfPreviousSurgery.timestamp;
              this.currentSurgery.total_duration = Math.floor(
                (new Date(this.currentSurgery.surgery_end_time) - new Date(this.currentSurgery.surgery_start_time)) / 1000 / 60
              );
              this.currentSurgery.is_abnormal_shutdown = true; // 标记为异常关机
              console.log(`上一场手术结束时间设置为最后一条日志: ${lastLogOfPreviousSurgery.timestamp}`);
            } else {
              // 如果找不到最后一条日志，使用开机事件时间
              this.currentSurgery.surgery_end_time = entry.timestamp;
              console.log(`未找到上一场手术的最后日志，使用开机事件时间: ${entry.timestamp}`);
            }
            
            // 完成手术数据并添加到列表
            this.finalizeSurgeryData();
            this.addSurgeryToList();
            console.log(`异常关机：手术结束并添加到列表: ID=${this.currentSurgery.surgery_id}`);
          } else {
            console.log(`异常关机：跳过准备手术对象: ID=${this.currentSurgery.surgery_id}, is_pre_surgery=${this.currentSurgery.is_pre_surgery}, has_start_time=${!!this.currentSurgery.surgery_start_time}`);
            // 准备手术对象：只标记结束时间，不添加到列表
            this.currentSurgery.surgery_end_time = entry.timestamp;
          }
          
          // 清空当前手术数据，本次开机作为新手术
          this.resetSurgeryState();
          this.powerOnTimes = [];
          this.shutdownTimes = [];
          this.currentSurgery = null;
          console.log(`异常关机后清空手术对象`);
        } else {
          console.log(`检测到正常重启，继续统计当前手术: ID=${this.currentSurgery.surgery_id}, 开始时间=${this.currentSurgery.surgery_start_time}`);
          // 正常重启：继续统计，不清空手术数据
        }
      }
      
      // 检查器械状态
      const activeArms = this.armStates.filter(state => state !== 0 && state !== -1).length;
      if (activeArms > 0) {
        console.log(`异常关机时活跃器械臂数量: ${activeArms}, 器械状态=${this.armStates}`);
      }
      
      // 检查故障状态
      if (this.errFlag) {
        console.log(`异常关机时存在未恢复故障: errFlag=${this.errFlag}`);
      }
      
      // 重置状态，准备重新开始
      this.errFlag = false;
      this.isPowerOn = true;
    }
    
    if (isPowerOnEvent) {
      // 检查是否需要清空当前手术
      const lastPowerOff = this.powerEvents.filter(e => e.type === 'power_off').pop();
      let shouldClearSurgery = false;
      
      if (lastPowerOff && this.currentSurgery) {
        const timeDiff = Math.floor((new Date(entry.timestamp) - new Date(lastPowerOff.timestamp)) / 1000 / 60);
        
        // 新条件：距离上次关机>30分钟 and 状态机跳转到自检之前（310e and p2=2）之前就有器械类型了
        if (timeDiff >= 30) {
          // 检查状态机是否跳转到自检之前（310e and p2=2）
          const hasSelfCheckBefore = this.stateMachineChanges.some(change => 
            change.state === 2 && new Date(change.time) < new Date(entry.timestamp)
          );
          
          // 检查状态机跳转到自检之前（310e and p2=2）之前就有器械类型了
          const hasInstrumentBeforeSelfCheck = this.stateMachineChanges.some(change => {
            if (change.state === 2) {
              // 找到自检状态，检查在这个时间点之前是否有器械类型
              const selfCheckTime = new Date(change.time);
              return this.armInstsHistory.some(history => 
                new Date(history.timestamp) < selfCheckTime && 
                history.armInsts.some(instType => instType !== 0)
              );
            }
            return false;
          });
          
          // 检查当前有手术对象
          const hasCurrentSurgery = !!this.currentSurgery;
          
          shouldClearSurgery = hasSelfCheckBefore && hasInstrumentBeforeSelfCheck && hasCurrentSurgery;
        }
      }
      
      if (shouldClearSurgery) {
        this.finalizeCurrentSurgery(entry.timestamp);
        this.resetSurgeryState();
      } else {
        this.powerOnTimes.push(entry.timestamp);
        if (this.currentSurgery) {
          if (!this.currentSurgery.power_on_times) {
            this.currentSurgery.power_on_times = [];
          }
          this.currentSurgery.power_on_times.push(entry.timestamp);
        }
      }

      this.powerEvents.push({
        type: 'power_on',
        timestamp: entry.timestamp,
        surgery_id: this.currentSurgery ? this.currentSurgery.surgery_id : null,
        isRestart: !shouldClearSurgery
      });
    }
  }

  /**
   * 处理关机事件
   */
  processPowerOffEvents(errCodeSuffix, p1, p2, entry, index, allEntries) {
    let isShutdownEvent = false;
    
    if (errCodeSuffix === 'A02e') {
      isShutdownEvent = true;
    } else if (errCodeSuffix === '310e' && p2 === 31) {
      const endTimeMs = new Date(entry.timestamp).getTime();
      let canceledByFollowup = false;
      
      // 向后查找30秒内的日志是否出现取消关机的事件
      for (let j = index + 1; j < allEntries.length; j++) {
        const nextEntry = allEntries[j];
        const nextTimeMs = new Date(nextEntry.timestamp).getTime();
        if (nextTimeMs - endTimeMs > 30 * 1000) break;
        
        const nextSuffix = nextEntry.error_code ? nextEntry.error_code.slice(-4) : '';
        const nextP1 = parseInt(nextEntry.param1) || 0;
        const nextP2 = parseInt(nextEntry.param2) || 0;
        
        if (nextSuffix === '310e' && nextP1 === 31 && nextP2 !== 31) {
          canceledByFollowup = true;
          break;
        }
      }
      
      if (!canceledByFollowup) {
        isShutdownEvent = true;
      }
    }

    if (isShutdownEvent) {
      console.log(`检测到关机事件: 时间=${entry.timestamp}`);
      this.isPowerOn = false;
      // errFlag 不复位，保持故障状态
      
      this.powerEvents.push({
        type: 'power_off',
        timestamp: entry.timestamp,
        surgery_id: this.currentSurgery ? this.currentSurgery.surgery_id : null
      });
      
      // 只有在当前有手术时才记录关机事件
      if (this.currentSurgery) {
        this.shutdownTimes.push(entry.timestamp);
        if (!this.currentSurgery.shutdown_times) {
          this.currentSurgery.shutdown_times = [];
        }
        this.currentSurgery.shutdown_times.push(entry.timestamp);
        
        // 关机视为所有器械被拔下：关闭所有未闭合的器械使用段
        this.closeAllOpenInstrumentUsages(entry.timestamp);
        
        if (this.currentSurgery.surgery_end_time) {
          this.finalizeCurrentSurgery(entry.timestamp);
          this.resetSurgeryState();
          this.powerOnTimes = [];
          this.shutdownTimes = [];
          this.currentSurgery = null;
          console.log(`满足手术结束条件，清空手术对象`);
        } else if (!this.surgeryStarted) {
          console.log(`关机时清空未开始的准备手术对象: ID=${this.currentSurgery.surgery_id}, is_pre_surgery=${this.currentSurgery.is_pre_surgery}, surgeryStarted=${this.surgeryStarted}`);
          this.resetSurgeryState();
          this.powerOnTimes = [];
          this.shutdownTimes = [];
          this.currentSurgery = null;
          console.log(`满足手术结束条件，清空手术对象`);
        }
      }else{
        this.powerOnTimes = [];
        this.shutdownTimes = [];
        console.log(`无手术，清空全局时间`);
      }
    }
  }

  /**
   * 处理状态机事件
   */
  processStateMachineEvents(errCodeSuffix, p1, p2, entry) {
    if (errCodeSuffix === '310e') {
      const newState = p2;
      this.currentState = newState;
      
      this.stateMachineChanges.push({
        time: entry.timestamp,
        state: newState,
        stateName: this.getStateMachineStateName(newState.toString())
      });
      
      // 故障恢复判断（errFlag === true）：标记为已处理并清空activeAlarms
      if (p1 === 0 && p2 === 1 && this.errFlag) {
        this.errFlag = false;
        this.errRecover = true;
        
        // 收集所有需要恢复的故障
        const recoveredFaults = [];
        
        // 将所有激活状态的报警标记为"已处理"
        for (const [errCode, alarm] of this.activeAlarms.entries()) {
          if (alarm && alarm.isActive === true) {
            alarm.isActive = false;
            alarm.status = '已处理';
            alarm.recoveryTime = entry.timestamp;
            
            // 同步更新报警详情列表
            for (let i = 0; i < this.alarmDetails.length; i++) {
              const detail = this.alarmDetails[i];
              if (detail && detail.code === errCode && detail.isActive === true) {
                detail.isActive = false;
                detail.status = '已处理';
                detail.recoveryTime = entry.timestamp;
                break;
              }
            }
            
            recoveredFaults.push({
              code: errCode,
              type: alarm.type,
              startTime: alarm.time,
              recoveryTime: entry.timestamp
            });
          }
        }
        
        if (recoveredFaults.length > 0) {
          console.log(`✅ 故障恢复: 时间=${entry.timestamp}, 恢复故障数量=${recoveredFaults.length}`);
          recoveredFaults.forEach(fault => {
            console.log(`   - 错误码=${fault.code}, 类型=${fault.type}, 发生时间=${fault.startTime}, 恢复时间=${fault.recoveryTime}`);
          });
        }
        
        this.activeAlarms.clear();
      } else if (p1 === 0 && p2 === 1 && !this.errFlag) {
        // 状态机跳转到使能状态但errFlag为false：只清空activeAlarms，不标记故障为已处理
        if (this.activeAlarms.size > 0) {
          console.log(`🔄 清空活跃故障Map（状态机使能但无故障标志）: 时间=${entry.timestamp}, 清空故障数量=${this.activeAlarms.size}`);
          this.activeAlarms.clear();
        }
      }
    }
  }

  /**
   * 处理器械状态更新
   */
  processInstrumentStateEvents(errCodeSuffix, p1, p3, entry) {
    if (errCodeSuffix === '500e') {
      const armIndex = p1 ;
      if (armIndex >= 0 && armIndex < 4) {
        this.armStates[armIndex] = p3;
      }
    }
  }

  /**
   * 处理器械类型变化
   */
  processInstrumentTypeEvents(errCodeSuffix, p1, p3, entry) {
    if (errCodeSuffix === '501e') {
      const armIndex = p1;
      if (armIndex >= 0 && armIndex < 4) {
        this.armInsts[armIndex] = p3;
        
        // 记录器械类型历史
        this.armInstsHistory.push({
          timestamp: entry.timestamp,
          armInsts: [...this.armInsts]
        });
        
        if (this.isPowerOn) {
          this.ensureSurgeryObject(entry);
          this.recordInstrumentUsage(armIndex, p3, entry);
        }
      }
    }
  }

  /**
   * 处理手术开始事件
   */
  processSurgeryStartEvents(entry) {
    if (this.currentState === 20 && !this.surgeryStarted) {
      this.surgeryStarted = true;
      
      console.log(`检测到手术开始: 状态=${this.currentState}, 时间=${entry.timestamp}`);
      
      if (!this.currentSurgery) {
        this.createNewSurgery(entry);
      } else if (this.currentSurgery.is_pre_surgery) {
        this.convertToFormalSurgery(entry);
      } else {
        this.handleConsecutiveSurgery(entry);
      }
    }
  }

  /**
   * 处理手术结束事件
   */
  processSurgeryEndEvents(errCodeSuffix, p2, p3, entry) {
    if (errCodeSuffix === '500e' && p2 !== 0 && p3 === 0) {
      const allArmStateZero = this.armStates.every(state => state === 0 || state === -1);
      const hasValidEndState = this.currentState === 10 || this.currentState === 12 || this.currentState === 13;

      // 只有在手术已经开始的情况下才判断结束条件
      if (allArmStateZero && hasValidEndState && this.surgeryStarted) {
        console.log(`满足手术结束条件: 器械状态=${this.armStates}, 当前状态=${this.currentState}, 时间=${entry.timestamp}`);
        
        if (this.currentSurgery) {
          // 只有正式手术才添加到列表
          if (this.currentSurgery.surgery_start_time && !this.currentSurgery.is_pre_surgery) {
            this.currentSurgery.surgery_end_time = entry.timestamp;
            this.previousSurgeryEndTime = this.currentSurgery.surgery_end_time;
            
            this.currentSurgery.total_duration = Math.floor(
              (new Date(this.currentSurgery.surgery_end_time) - new Date(this.currentSurgery.surgery_start_time)) / 1000 / 60
            );
            
            this.finalizeSurgeryData();
            this.addSurgeryToList();
            console.log(`手术结束并添加到列表: ID=${this.currentSurgery.surgery_id}`);
          } else {
            console.log(`满足结束条件但跳过准备手术对象: ID=${this.currentSurgery.surgery_id}, is_pre_surgery=${this.currentSurgery.is_pre_surgery}, has_start_time=${!!this.currentSurgery.surgery_start_time}`);
            // 只标记surgery_end_time，不添加到列表
            this.currentSurgery.surgery_end_time = entry.timestamp;
          }
        }
        
        this.surgeryStarted = false;
      }
    }
  }

  /**
   * 处理UDI码事件
   */
  processUDIEvents(errCodeSuffix, errCode, p1, p2, p3, p4, entry) {
    if (errCodeSuffix === '510e') {
      const armIndex = errCode.charAt(1) - 3;
      if (armIndex >= 0 && armIndex < 4) {
        const udi = this.generateUDI(p1, p2, p3, p4, armIndex);
        
        this.armUDIs[armIndex] = udi;
        this.armUDIHistory[armIndex].push({
          udi: udi,
          timestamp: entry.timestamp
        });
        
        this.updatePendingInstrumentUDI(armIndex, udi);
      }
    }
  }

  /**
   * 处理无使用次数事件
   */
  processNoUsageEvents(errCodeSuffix, errCode, entry) {
    if (errCodeSuffix === '2c2d') {
      const armIndex = errCode.charAt(1) - 3;
      if (armIndex >= 0 && armIndex < 4) {
        this.armInsts[armIndex] = 0;
        
        // 记录器械类型历史
        this.armInstsHistory.push({
          timestamp: entry.timestamp,
          armInsts: [...this.armInsts]
        });
        
        if (this.currentSurgery) {
          const armUsageKey = `arm${armIndex + 1}_usage`;
          const currentUsage = this.currentSurgery[armUsageKey] || [];
          if (currentUsage.length > 0) {
            currentUsage.pop();
            this.currentSurgery[armUsageKey] = currentUsage;
          }
        }
      }
    }
  }

  /**
   * 处理脚踏和离合触发事件
   */
  processPedalAndClutchEvents(errCodeSuffix, p1, p3, entry) {
    // 内窥镜脚踏触发（705E） - 按下释放识别并记录事件
    if (errCodeSuffix === '705e') {
      if (this.endoscopePedalState === 0 && p1 === 1) {
        this.endoscopePedalState = 1;
        this.endoscopePedalLastPress705 = entry.timestamp;
      } else if (this.endoscopePedalState === 1 && p1 === 0) {
        this.endoscopePedalState = 0;
        // 只在手术正式开始后才记录事件
        if (this.currentSurgery && this.surgeryStarted) {
          this.currentSurgery.endoscope_pedal_events.push({ code: '705e', time: entry.timestamp });
        }
      }
    }

    // 内窥镜脚踏触发（526E） - 按下释放识别并记录事件
    if (errCodeSuffix === '526e') {
      if (this.endoscopePedalState526 === 0 && p1 === 1) {
        this.endoscopePedalState526 = 1;
        this.endoscopePedalLastPress526 = entry.timestamp;
      } else if (this.endoscopePedalState526 === 1 && p1 === 0) {
        this.endoscopePedalState526 = 0;
        // 只在手术正式开始后才记录事件
        if (this.currentSurgery && this.surgeryStarted) {
          this.currentSurgery.endoscope_pedal_events.push({ code: '526e', time: entry.timestamp });
        }
      }
    }
    
    // 臂切换脚踏触发（704E） - 按下释放识别并记录事件
    if (errCodeSuffix === '704e') {
      if (this.armSwitchPedalState === 0 && p1 === 1) {
        this.armSwitchPedalState = 1;
        this.armSwitchLastPress704 = entry.timestamp;
      } else if (this.armSwitchPedalState === 1 && p1 === 0) {
        this.armSwitchPedalState = 0;
        // 只在手术正式开始后才记录事件
        if (this.currentSurgery && this.surgeryStarted) {
          this.currentSurgery.arm_switch_events.push({ code: '704e', time: entry.timestamp });
        }
      }
    }

    // 臂切换脚踏触发（527E） - 按下释放识别并记录事件
    if (errCodeSuffix === '527e') {
      if (this.armSwitchPedalState527 === 0 && p1 === 1) {
        this.armSwitchPedalState527 = 1;
        this.armSwitchLastPress527 = entry.timestamp;
      } else if (this.armSwitchPedalState527 === 1 && p1 === 0) {
        this.armSwitchPedalState527 = 0;
        // 只在手术正式开始后才记录事件
        if (this.currentSurgery && this.surgeryStarted) {
          this.currentSurgery.arm_switch_events.push({ code: '527e', time: entry.timestamp });
        }
      }
    }
    
    // 脚离合触发（706E） - 按下释放识别并记录事件
    if (errCodeSuffix === '706e') {
      if (this.footClutchState === 0 && p1 === 1) {
        this.footClutchState = 1;
        this.footClutchLastPress706 = entry.timestamp;
      } else if (this.footClutchState === 1 && p1 === 0) {
        this.footClutchState = 0;
        // 只在手术正式开始后才记录事件
        if (this.currentSurgery && this.surgeryStarted) {
          this.currentSurgery.foot_clutch_events.push({ code: '706e', time: entry.timestamp });
        }
      }
    }

    // 脚离合触发（525E） - 按下释放识别并记录事件
    if (errCodeSuffix === '525e') {
      if (this.footClutchState525 === 0 && p1 === 1) {
        this.footClutchState525 = 1;
        this.footClutchLastPress525 = entry.timestamp;
      } else if (this.footClutchState525 === 1 && p1 === 0) {
        this.footClutchState525 = 0;
        // 只在手术正式开始后才记录事件
        if (this.currentSurgery && this.surgeryStarted) {
          this.currentSurgery.foot_clutch_events.push({ code: '525e', time: entry.timestamp });
        }
      }
    }
    
    // 左手离合触发（70AE且p3=1）
    if (errCodeSuffix === '70ae' && p3 === 1) {
      if (this.leftHandClutchState === 0 && p1 === 1) {
        // 从0变为1，进入按下状态
        this.leftHandClutchState = 1;
      } else if (this.leftHandClutchState === 1 && p1 === 0) {
        // 从1变为0，完成一次触发
        this.leftHandClutchState = 0;
        this.leftHandClutchCount++;
        // 只在手术正式开始后才统计到手术对象
        if (this.currentSurgery && this.surgeryStarted) {
          this.currentSurgery.left_hand_clutch_count = (this.currentSurgery.left_hand_clutch_count || 0) + 1;
        }
      }
    }
    
    // 右手离合触发（70AE且p3=2）
    if (errCodeSuffix === '70ae' && p3 === 2) {
      if (this.rightHandClutchState === 0 && p1 === 1) {
        // 从0变为1，进入按下状态
        this.rightHandClutchState = 1;
      } else if (this.rightHandClutchState === 1 && p1 === 0) {
        // 从1变为0，完成一次触发
        this.rightHandClutchState = 0;
        this.rightHandClutchCount++;
        // 只在手术正式开始后才统计到手术对象
        if (this.currentSurgery && this.surgeryStarted) {
          this.currentSurgery.right_hand_clutch_count = (this.currentSurgery.right_hand_clutch_count || 0) + 1;
        }
      }
    }
  }

  /**
   * 确保手术对象存在
   */
  ensureSurgeryObject(entry) {
    if (!this.currentSurgery || (this.currentSurgery && this.currentSurgery.surgery_end_time)) {
      const prevEnd = this.currentSurgery ? this.currentSurgery.surgery_end_time : null;
      
      this.surgeryCount++;
      this.currentSurgery = {
        id: this.surgeryCount,
        surgery_id: `Surgery-${this.surgeryCount.toString().padStart(2, '0')}`,
        log_id: entry.log_id,
        power_on_times: prevEnd ? [prevEnd] : [...this.powerOnTimes],
        shutdown_times: [...this.shutdownTimes],
        arm1_usage: [],
        arm2_usage: [],
        arm3_usage: [],
        arm4_usage: [],
        arm1_total_activation: { startTime: null, endTime: null },
        arm2_total_activation: { startTime: null, endTime: null },
        arm3_total_activation: { startTime: null, endTime: null },
        arm4_total_activation: { startTime: null, endTime: null },
        is_pre_surgery: true,
        is_consecutive_surgery: !!prevEnd,
        previous_surgery_end_time: prevEnd,
        is_remote_surgery: this.isRemoteSurgery,
        network_latency_data: [],
        // 脚踏和离合触发次数统计
        endoscope_pedal_count: 0,
        arm_switch_count: 0,
        foot_clutch_count: 0,
        left_hand_clutch_count: 0,
        right_hand_clutch_count: 0,
        foot_clutch_events: [],
        endoscope_pedal_events: [],
        arm_switch_events: []
      };
      
      console.log(`创建准备手术对象: ID=${this.currentSurgery.surgery_id}, 时间=${entry.timestamp}, 前一台结束时间=${prevEnd || '无'}`);
    }
  }

  /**
   * 记录器械使用
   */
  recordInstrumentUsage(armIndex, instrumentType, entry) {
    const armUsageKey = `arm${armIndex + 1}_usage`;
    const armActivationKey = `arm${armIndex + 1}_total_activation`;
    const currentUsage = this.currentSurgery[armUsageKey] || [];
    
    if (instrumentType > 0) {
      const instrumentName = this.getInstrumentTypeName(instrumentType.toString());
      
      // 检查是否存在未结束的使用记录
      const lastUsage = currentUsage.length > 0 ? currentUsage[currentUsage.length - 1] : null;
      const hasActiveUsage = lastUsage && lastUsage.endTime === null;
      
      // 检查是否是内窥镜类型之间的转换（图像主机获取更新，非更换器械）
      if (hasActiveUsage && 
          ENDOSCOPE_TYPES.has(lastUsage.instrumentType) && 
          ENDOSCOPE_TYPES.has(instrumentType)) {
        // 内窥镜类型更新：只更新类型和名称，不创建新记录，UDI和时间保持不变
        console.log(`📷 器械类型更新（图像识别）: 工具臂${armIndex + 1} - ${lastUsage.instrumentName}(${lastUsage.instrumentType}) → ${instrumentName}(${instrumentType}), 时间: ${entry.timestamp}`);
        lastUsage.instrumentType = instrumentType;
        lastUsage.instrumentName = instrumentName;
        // UDI保持不变，startTime保持不变
      } else {
        // 正常器械插上：创建新记录
        console.log(`🔧 器械插上: 工具臂${armIndex + 1} - ${instrumentName} (类型: ${instrumentType}), 时间: ${entry.timestamp}`);
        
        currentUsage.push({
          instrumentType: instrumentType,
          instrumentName: instrumentName,
          udi: null,
          startTime: entry.timestamp,
          endTime: null,
          duration: 0,
          armIndex: armIndex,
          is_pre_surgery: !this.surgeryStarted
        });
        
        if (this.currentSurgery[armActivationKey] && this.currentSurgery[armActivationKey].startTime === null) {
          this.currentSurgery[armActivationKey].startTime = entry.timestamp;
        }
      }
    } else {
      // 器械拔下
      if (currentUsage.length > 0) {
        const lastUsage = currentUsage[currentUsage.length - 1];
        if (lastUsage && lastUsage.endTime === null) {
          const instrumentName = lastUsage.instrumentName || '未知器械';
          const duration = Math.floor((new Date(entry.timestamp) - new Date(lastUsage.startTime)) / 1000 / 60);
          console.log(`🔧 器械拔下: 工具臂${armIndex + 1} - ${instrumentName}, 使用时长: ${duration}分钟, 时间: ${entry.timestamp}`);
          
          lastUsage.endTime = entry.timestamp;
          lastUsage.duration = duration;
          
          if (this.currentSurgery[armActivationKey]) {
            this.currentSurgery[armActivationKey].endTime = entry.timestamp;
          }
        }
      }
    }
    
    this.currentSurgery[armUsageKey] = currentUsage;
  }

  /**
   * 在关机等场景下，关闭所有未闭合的器械使用记录，并同步总激活结束时间
   */
  closeAllOpenInstrumentUsages(shutdownTimestamp) {
    if (!this.currentSurgery) return;
    const shutdownMs = new Date(shutdownTimestamp).getTime();
    
    for (let arm = 1; arm <= 4; arm++) {
      const usageKey = `arm${arm}_usage`;
      const activationKey = `arm${arm}_total_activation`;
      const usages = this.currentSurgery[usageKey] || [];
      
      // 关闭未闭合的器械使用段
      for (let i = usages.length - 1; i >= 0; i--) {
        const usage = usages[i];
        if (usage && usage.startTime && usage.endTime === null) {
          const startMs = new Date(usage.startTime).getTime();
          const endMs = Math.max(startMs + 1000, shutdownMs);
          usage.endTime = this.formatRawTimeString(new Date(endMs));
          const durationSeconds = Math.max(1, Math.floor((endMs - startMs) / 1000));
          usage.duration_seconds = durationSeconds;
          usage.duration = Math.floor(durationSeconds / 60);
        }
      }
      this.currentSurgery[usageKey] = usages;
      
      // 同步总激活结束时间
      const activation = this.currentSurgery[activationKey];
      if (activation && activation.startTime && !activation.endTime) {
        activation.endTime = shutdownTimestamp;
      }
    }
    
    // 更新内部臂状态与器械类型为拔下状态，并记录历史
    this.armStates = this.armStates.map(() => 0);
    this.armInsts = this.armInsts.map(() => 0);
    this.armInstsHistory.push({
      timestamp: shutdownTimestamp,
      armInsts: [...this.armInsts]
    });
  }

  /**
   * 创建新手术
   */
  createNewSurgery(entry) {
    this.surgeryCount++;
    this.currentSurgery = {
      id: this.surgeryCount,
      surgery_id: `Surgery-${this.surgeryCount.toString().padStart(2, '0')}`,
      log_id: entry.log_id,
      power_on_times: [...this.powerOnTimes],
      shutdown_times: [...this.shutdownTimes],
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
      is_remote_surgery: this.isRemoteSurgery,
      network_latency_data: [],
      // 脚踏和离合触发次数统计
      endoscope_pedal_count: 0,
      arm_switch_count: 0,
      foot_clutch_count: 0,
      left_hand_clutch_count: 0,
      right_hand_clutch_count: 0,
      foot_clutch_events: [],
      endoscope_pedal_events: [],
      arm_switch_events: []
    };
    
    console.log(`创建新手术: ID=${this.currentSurgery.surgery_id}, 开始时间=${entry.timestamp}`);
    this.resetSurgeryState();
  }

  /**
   * 转换为正式手术
   */
  convertToFormalSurgery(entry) {
    if (this.currentSurgery.is_consecutive_surgery && this.currentSurgery.previous_surgery_end_time) {
      this.currentSurgery.power_on_times = [this.currentSurgery.previous_surgery_end_time];
      this.currentSurgery.shutdown_times = [];
    } else {
      this.currentSurgery.power_on_times = [...this.powerOnTimes];
      this.currentSurgery.shutdown_times = [...this.shutdownTimes];
    }
    
    this.currentSurgery.is_pre_surgery = false;
    this.currentSurgery.surgery_start_time = entry.timestamp;
    
    console.log(`转换为正式手术: ID=${this.currentSurgery.surgery_id}, 开始时间=${entry.timestamp}`);
    this.resetFaultState();
  }

  /**
   * 处理连台手术
   */
  handleConsecutiveSurgery(entry) {
    if (this.currentSurgery && this.currentSurgery.surgery_end_time) {
      this.previousSurgeryEndTime = this.currentSurgery.surgery_end_time;
    }

    this.currentSurgery = null;
    this.surgeryCount++;
    this.surgeryStarted = true;
    
    this.resetFaultState();
    
    this.currentSurgery = {
      id: this.surgeryCount,
      surgery_id: `Surgery-${this.surgeryCount.toString().padStart(2, '0')}`,
      log_id: entry.log_id,
      power_on_times: this.previousSurgeryEndTime ? [this.previousSurgeryEndTime] : [...this.powerOnTimes],
      shutdown_times: this.previousSurgeryEndTime ? [] : [...this.shutdownTimes],
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
      is_consecutive_surgery: this.previousSurgeryEndTime !== null,
      previous_surgery_end_time: this.previousSurgeryEndTime,
      is_remote_surgery: this.isRemoteSurgery,
      network_latency_data: [],
      // 脚踏和离合触发次数统计
      endoscope_pedal_count: 0,
      arm_switch_count: 0,
      foot_clutch_count: 0,
      left_hand_clutch_count: 0,
      right_hand_clutch_count: 0,
      foot_clutch_events: [],
      endoscope_pedal_events: [],
      arm_switch_events: []
    };
    
    console.log(`处理连台手术: ID=${this.currentSurgery.surgery_id}, 开始时间=${entry.timestamp}, 前一台手术结束时间=${this.previousSurgeryEndTime}`);
  }

  /**
   * 生成UDI码
   */
  generateUDI(p1, p2, p3, p4, armIndex) {
    const highByte = (p1 >> 8) & 0xFF;
    const lowByte = p1 & 0xFF;
    const highChar = String.fromCharCode(highByte);
    let formattedP1;
    let udi;
    
    if (highChar === 'F' || highChar === 'D') {
      const lowHex = lowByte.toString(16).toUpperCase().padStart(2, '0');
      formattedP1 = `${highChar}${lowHex}`;
      const p2HighHex = ((p2 >> 8) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
      const p2LowHex = (p2 & 0xFF).toString(16).toUpperCase().padStart(2, '0');
      const formattedP2 = `${p2HighHex}${p2LowHex}`;
      udi = `${formattedP1}${formattedP2}${p3}${p4}`;
    } else {
      formattedP1 = String(p1);
      const p2Padded = String(p2).padStart(3, '0');
      
      if ([9, 10, 11].includes(this.armInsts[armIndex])) {
        udi = `ECO${p3}${String.fromCharCode(p4)}-${formattedP1}${p2Padded}`;
      } else if (this.armInsts[armIndex] === 17) {
        const p3Padded = String(p3).padStart(3, '0');
        const p4Padded = String(p4).padStart(3, '0');
        udi = `F${formattedP1}${p2}${p3Padded}${p4Padded}`;
      } else {
        udi = `IN${p3}${String.fromCharCode(p4)}-${formattedP1}${p2Padded}`;
      }
    }
    
    return udi;
  }

  /**
   * 更新待更新器械的UDI码
   */
  updatePendingInstrumentUDI(armIndex, udi) {
    if (!this.currentSurgery) return;
    
    const armUsageKey = `arm${armIndex + 1}_usage`;
    const currentUsage = this.currentSurgery[armUsageKey] || [];
    
    for (let i = currentUsage.length - 1; i >= 0; i--) {
      if (currentUsage[i].udi === null && currentUsage[i].endTime === null && currentUsage[i].armIndex === armIndex) {
        currentUsage[i].udi = udi;
        break;
      }
    }
  }

  /**
   * 计算手术的实际时间范围（从最早事件到最晚事件）
   * @returns {Object} 包含 earliestTime 和 latestTime 的对象
   */
  calculateSurgeryTimeRange() {
    const times = [];
    
    // 收集所有相关时间
    if (this.currentSurgery.surgery_start_time) {
      times.push(new Date(this.currentSurgery.surgery_start_time).getTime());
    }
    if (this.currentSurgery.surgery_end_time) {
      times.push(new Date(this.currentSurgery.surgery_end_time).getTime());
    }
    if (this.currentSurgery.power_on_times) {
      this.currentSurgery.power_on_times.forEach(time => {
        times.push(new Date(time).getTime());
      });
    }
    if (this.currentSurgery.shutdown_times) {
      this.currentSurgery.shutdown_times.forEach(time => {
        times.push(new Date(time).getTime());
      });
    }
    
    if (times.length === 0) {
      return { earliestTime: null, latestTime: null };
    }
    
    return {
      earliestTime: Math.min(...times),
      latestTime: Math.max(...times)
    };
  }

  /**
   * 完成手术数据
   */
  finalizeSurgeryData() {
    this.currentSurgery.alarm_count = this.alarmDetails.length;
    this.currentSurgery.alarm_details = [...this.alarmDetails];
    
    if (this.isRemoteSurgery) {
      this.currentSurgery.is_remote_surgery = true;
    }
    
    // 计算手术的实际时间范围
    const timeRange = this.calculateSurgeryTimeRange();
    
    // 处理网络统计数据 - 只包含本场手术时间范围内的数据
    const surgeryNetworkData = this.networkLatencyData.filter(data => {
      const dataTime = new Date(data.timestamp).getTime();
      return (timeRange.earliestTime === null || dataTime >= timeRange.earliestTime) && 
             (timeRange.latestTime === null || dataTime <= timeRange.latestTime);
    });
    this.currentSurgery.network_latency_data = surgeryNetworkData;
    
    if (surgeryNetworkData.length > 0) {
      const latencies = surgeryNetworkData.map(data => data.latency);
      this.currentSurgery.network_stats = {
        count: surgeryNetworkData.length,
        min: Math.min(...latencies),
        max: Math.max(...latencies),
        avg: Math.round(latencies.reduce((sum, val) => sum + val, 0) / latencies.length),
        data: surgeryNetworkData
      };
    } else {
      this.currentSurgery.network_stats = null;
    }
    
    // 处理状态机变化 - 只包含本场手术时间范围内的数据
    const filteredChanges = this.stateMachineChanges.filter(change => {
      const changeTime = new Date(change.time).getTime();
      return (timeRange.earliestTime === null || changeTime >= timeRange.earliestTime) && 
             (timeRange.latestTime === null || changeTime <= timeRange.latestTime);
    });
    this.currentSurgery.state_machine_changes = [...filteredChanges];

    // 计算脚离合次数（简化规则：525E若与上一个已计数事件间隔<2s则不计数；706E总是计数）
    if (this.currentSurgery.foot_clutch_events && this.currentSurgery.foot_clutch_events.length > 0) {
      const events = this.currentSurgery.foot_clutch_events
        .map(e => ({ code: e.code, ts: new Date(e.time).getTime() }))
        .sort((a, b) => a.ts - b.ts);

      let count = 0;
      let lastCountedTs = -Infinity;

      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        if (e.code === '525e' && e.ts - lastCountedTs < 2000) {
          continue; // 525E在2秒内不计数
        }
        count++;
        lastCountedTs = e.ts;
      }

      this.currentSurgery.foot_clutch_count = count;
    }

    // 计算内窥镜脚踏次数（简化规则：526E若与上一个已计数事件间隔<2s则不计数；705E总是计数）
    if (this.currentSurgery.endoscope_pedal_events && this.currentSurgery.endoscope_pedal_events.length > 0) {
      const events = this.currentSurgery.endoscope_pedal_events
        .map(e => ({ code: e.code, ts: new Date(e.time).getTime() }))
        .sort((a, b) => a.ts - b.ts);

      let count = 0;
      let lastCountedTs = -Infinity;

      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        if (e.code === '526e' && e.ts - lastCountedTs < 2000) {
          continue; // 526E在2秒内不计数
        }
        count++;
        lastCountedTs = e.ts;
      }

      this.currentSurgery.endoscope_pedal_count = count;
    }

    // 计算臂切换脚踏次数（简化规则：527E若与上一个已计数事件间隔<2s则不计数；704E总是计数）
    if (this.currentSurgery.arm_switch_events && this.currentSurgery.arm_switch_events.length > 0) {
      const events = this.currentSurgery.arm_switch_events
        .map(e => ({ code: e.code, ts: new Date(e.time).getTime() }))
        .sort((a, b) => a.ts - b.ts);

      let count = 0;
      let lastCountedTs = -Infinity;

      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        if (e.code === '527e' && e.ts - lastCountedTs < 2000) {
          continue; // 527E在2秒内不计数
        }
        count++;
        lastCountedTs = e.ts;
      }

      this.currentSurgery.arm_switch_count = count;
    }
  }

  /**
   * 添加手术到列表
   */
  addSurgeryToList() {
    const isAlreadyAdded = this.surgeries.some(surgery => surgery.surgery_id === this.currentSurgery.surgery_id);
    if (!isAlreadyAdded) {
      this.surgeries.push(this.currentSurgery);
    }
  }

  /**
   * 完成当前手术
   */
  finalizeCurrentSurgery(endTime) {
    if (this.currentSurgery && this.currentSurgery.surgery_start_time && !this.currentSurgery.surgery_end_time) {
      this.currentSurgery.surgery_end_time = endTime;
      this.currentSurgery.total_duration = Math.floor(
        (new Date(this.currentSurgery.surgery_end_time) - new Date(this.currentSurgery.surgery_start_time)) / 1000 / 60
      );
      
      this.finalizeSurgeryData();
      this.addSurgeryToList();
    }
  }

  /**
   * 重置手术状态
   */
  resetSurgeryState() {
    this.surgeryStarted = false;
    this.errFlag = false;
    this.armStates.fill(-1);
    this.armInsts.fill(-1);
    this.armUDIs.fill('');
    this.armUDIHistory.forEach(history => history.length = 0);
    this.stateMachineChanges.length = 0;
    this.currentState = -1;
    this.alarmDetails.length = 0;
    this.activeAlarms.clear();
    
    // 重置脚踏和离合触发状态
    this.endoscopePedalState = 0;
    this.endoscopePedalState526 = 0;
    this.armSwitchPedalState = 0;
    this.armSwitchPedalState527 = 0;
    this.footClutchState = 0;
    this.footClutchState525 = 0;
    this.leftHandClutchState = 0;
    this.rightHandClutchState = 0;
    
    // 重置脚踏和离合触发次数
    this.endoscopePedalCount = 0;
    this.armSwitchCount = 0;
    this.footClutchCount = 0;
    this.leftHandClutchCount = 0;
    this.rightHandClutchCount = 0;

    // 重置脚离合按下时间追踪
    this.footClutchLastPress706 = null;
    this.footClutchLastPress525 = null;
    
    // 重置内窥镜脚踏按下时间追踪
    this.endoscopePedalLastPress705 = null;
    this.endoscopePedalLastPress526 = null;
    
    // 重置臂切换脚踏按下时间追踪
    this.armSwitchLastPress704 = null;
    this.armSwitchLastPress527 = null;
  }

  /**
   * 重置故障状态
   */
  resetFaultState() {
    this.errFlag = false;
    this.alarmDetails.length = 0;
    this.activeAlarms.clear();
  }

  /**
   * 最终处理
   */
  finalizeAnalysis(sortedLogEntries) {
    // 处理未完成的手术
    if (this.currentSurgery && !this.currentSurgery.surgery_end_time) {
      const lastLogTime = sortedLogEntries[sortedLogEntries.length - 1].timestamp;
      this.finalizeCurrentSurgery(lastLogTime);
    }

    // 只有真正的手术才添加到列表
    if (this.currentSurgery && !this.currentSurgery.is_pre_surgery) {
      this.addSurgeryToList();
    }

    // 兜底处理：为未闭合的器械使用段补充结束时间
    const globalLastLogTime = sortedLogEntries[sortedLogEntries.length - 1]?.timestamp;
    this.surgeries.forEach(surgery => {
      const fallbackEnd = surgery.surgery_end_time || surgery.last_log_time || globalLastLogTime;
      ['arm1_usage', 'arm2_usage', 'arm3_usage', 'arm4_usage'].forEach(key => {
        const usages = surgery[key] || [];
        usages.forEach(u => {
          if (u && u.startTime && !u.endTime && fallbackEnd) {
            const startMs = new Date(u.startTime).getTime();
            const endMs = new Date(fallbackEnd).getTime();
            const adjustedEndMs = Math.max(startMs + 1000, endMs);
            u.endTime = this.formatRawTimeString(new Date(adjustedEndMs));
            const durationSeconds = Math.max(1, Math.floor((adjustedEndMs - startMs) / 1000));
            u.duration_seconds = durationSeconds;
            u.duration = Math.floor(durationSeconds / 60);
          }
        });
        surgery[key] = usages;
      });
    });

         // 前端已有PostgreSQL数据预览功能，后端不再打印
  }

  

  /**
   * 获取器械类型名称
   */
  getInstrumentTypeName(typeCode) {
    return INSTRUMENT_TYPES[typeCode] || '未知器械';
  }

  /**
   * 获取状态机状态名称
   */
  getStateMachineStateName(stateCode) {
    return STATE_MACHINE_STATES[stateCode] || '未知状态';
  }

  /**
   * 格式化时间为原始时间格式 YYYY-MM-DD HH:mm:ss（无时区信息）
   * @param {string|Date|number} dateLike - 时间值
   * @returns {string|null} 格式化后的时间字符串
   */
  formatRawTimeString(dateLike) {
    if (!dateLike) return null;
    try {
      let d;
      if (typeof dateLike === 'string') {
        // 如果已经是原始时间格式，直接返回
        if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/.test(dateLike)) {
          return dateLike;
        }
        // 如果是ISO格式（带Z），移除Z并按原始时间解析
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(dateLike)) {
          d = new Date(dateLike);
        } else {
          d = new Date(dateLike);
        }
      } else {
        d = new Date(dateLike);
      }
      
      if (isNaN(d.getTime())) return null;
      
      // 格式化为 YYYY-MM-DD HH:mm:ss
      const pad = (n) => String(n).padStart(2, '0');
      const year = d.getFullYear();
      const month = pad(d.getMonth() + 1);
      const day = pad(d.getDate());
      const hours = pad(d.getHours());
      const minutes = pad(d.getMinutes());
      const seconds = pad(d.getSeconds());
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch (_) {
      return null;
    }
  }

  /**
   * 转换为PostgreSQL结构化数据
   * @param {Object} surgery - 手术数据
   * @returns {Object} PostgreSQL结构化数据
   */
  toPostgreSQLStructure(surgery) {
    // 构建power_cycles - 修复时间顺序问题，保留所有关机时间
    const powerCycles = [];
    if (surgery.power_on_times && surgery.shutdown_times) {
      const onTimes = surgery.power_on_times;
      const offTimes = surgery.shutdown_times;
      
      // 智能配对开机和关机时间，处理时间顺序异常的情况，保留所有关机时间
      let onIndex = 0;
      let offIndex = 0;
      
      while (onIndex < onTimes.length || offIndex < offTimes.length) {
        const onTime = onIndex < onTimes.length ? new Date(onTimes[onIndex]) : null;
        const offTime = offIndex < offTimes.length ? new Date(offTimes[offIndex]) : null;
        
        // 如果当前开机时间存在，检查是否有对应的关机时间
        if (onTime) {
          // 查找下一个有效的关机时间（关机时间晚于开机时间）
          let validOffTime = null;
          let validOffIndex = offIndex;
          
          // 先处理所有早于当前开机时间的关机时间（设置为null开机时间）
          while (offIndex < offTimes.length) {
            const currentOffTime = new Date(offTimes[offIndex]);
            if (currentOffTime < onTime) {
              powerCycles.push({
                on_time: null,
                off_time: this.formatRawTimeString(currentOffTime)
              });
              offIndex++;
            } else {
              validOffTime = currentOffTime;
              validOffIndex = offIndex;
              break;
            }
          }
          
          // 为当前开机时间配对有效的关机时间
          powerCycles.push({
            on_time: this.formatRawTimeString(onTime),
            off_time: validOffTime ? this.formatRawTimeString(validOffTime) : null
          });
          
          // 更新索引
          onIndex++;
          if (validOffTime) {
            offIndex = validOffIndex + 1;
          }
        } else if (offTime) {
          // 如果只有关机时间没有对应的开机时间，创建一个null开机时间的记录
          powerCycles.push({
            on_time: null,
            off_time: this.formatRawTimeString(offTime)
          });
          offIndex++;
        }
      }
    } else if (surgery.power_on_times) {
      // 如果只有开机时间没有关机时间
      surgery.power_on_times.forEach(onTime => {
        powerCycles.push({
          on_time: this.formatRawTimeString(new Date(onTime)),
          off_time: null
        });
      });
    } else if (surgery.shutdown_times) {
      // 如果只有关机时间没有开机时间
      surgery.shutdown_times.forEach(offTime => {
        powerCycles.push({
          on_time: null,
          off_time: this.formatRawTimeString(new Date(offTime))
        });
      });
    }

    // 构建arms数据
    const arms = [];
    for (let i = 1; i <= 4; i++) {
      const armUsage = surgery[`arm${i}_usage`] || [];
      const instrumentUsage = armUsage.map(usage => ({
        tool_type: usage.instrumentType, // 使用原始数据（数字类型），不解析为名称
        udi: usage.udi,
        start_time: usage.startTime,
        end_time: usage.endTime,
        energy_activation: [] // 可以后续扩展
      }));

      arms.push({
        arm_id: i,
        instrument_usage: instrumentUsage
      });
    }

    // 构建surgery_stats
    const surgeryStats = {
      // success字段已移除，因为元数据中已经有了
      network_latency_ms: surgery.network_stats ? surgery.network_stats.data.map(d => ({
        time: d.timestamp,
        latency: d.latency
      })) : [],
      faults: surgery.alarm_details ? surgery.alarm_details.map(fault => ({
        timestamp: fault.time,
        error_code: fault.code,
        status: fault.status === '已处理',
        recovery_time: fault.recoveryTime || null,
        param1: fault.param1 || '',
        param2: fault.param2 || '',
        param3: fault.param3 || '',
        param4: fault.param4 || '',
        log_id: surgery.log_id
      })) : [],
      state_machine: (surgery.state_machine_changes || []).map(ch => ({
        time: ch.time,
        state: ch.state // 使用原始数据（数字类型），不解析为名称
      })),
      arm_switch_count: surgery.arm_switch_count || 0,           // 臂切换脚踏触发次数
      left_hand_clutch: surgery.left_hand_clutch_count || 0,    // 左手离合触发次数
      right_hand_clutch: surgery.right_hand_clutch_count || 0,  // 右手离合触发次数
      foot_clutch: surgery.foot_clutch_count || 0,              // 脚离合触发次数
      endoscope_pedal: surgery.endoscope_pedal_count || 0       // 内窥镜脚踏触发次数
    };

    return {
      power_cycles: powerCycles,
      arms: arms,
      surgery_stats: surgeryStats
    };
  }

  /**
   * 检测是否为异常关机
   * 逻辑：检查开机事件前1分钟以上且前30分钟以内是否存在日志
   * @param {Object} powerOnEntry - 开机事件日志条目
   * @param {number} powerOnIndex - 开机事件索引
   * @param {Array} allEntries - 所有日志条目
   * @returns {boolean} true表示异常关机，false表示正常重启
   */
  detectAbnormalShutdown(powerOnEntry, powerOnIndex, allEntries) {
    const powerOnTime = new Date(powerOnEntry.timestamp).getTime();
    const oneMinuteAgo = powerOnTime - 1 * 60 * 1000; // 1分钟前
    const thirtyMinutesAgo = powerOnTime - 30 * 60 * 1000; // 30分钟前
    
    // 向前查找日志，检查1分钟以上且30分钟以内是否有日志
    for (let i = powerOnIndex - 1; i >= 0; i--) {
      const entry = allEntries[i];
      if (!entry || !entry.timestamp) continue;
      
      const entryTime = new Date(entry.timestamp).getTime();
      
      // 如果日志时间在1分钟以内，属于本次开机，继续查找
      if (entryTime >= oneMinuteAgo) {
        continue;
      }
      
      // 如果日志时间在30分钟以外，停止查找
      if (entryTime < thirtyMinutesAgo) {
        break;
      }
      
      // 如果日志时间在1分钟以上且30分钟以内，说明有日志记录，为正常重启
      console.log(`找到1-30分钟内的日志: 时间=${entry.timestamp}, 距离开机=${Math.floor((powerOnTime - entryTime) / 1000 / 60)}分钟`);
      return false; // 正常重启
    }
    
    // 如果1-30分钟内没有找到任何日志，说明是异常关机
    console.log(`1-30分钟内无日志记录，判定为异常关机`);
    return true; // 异常关机
  }

  /**
   * 查找上一场手术的最后一条日志（异常关机发生的时间）
   * 在异常关机情况下，基于30分钟边界继续向前查找，找到的第一个日志就是异常关机发生的时间
   * @param {Object} powerOnEntry - 开机事件日志条目
   * @param {number} powerOnIndex - 开机事件索引
   * @param {Array} allEntries - 所有日志条目
   * @returns {Object|null} 异常关机发生时的最后一条日志，如果没找到则返回null
   */
  findLastLogOfPreviousSurgery(powerOnEntry, powerOnIndex, allEntries) {
    const powerOnTime = new Date(powerOnEntry.timestamp).getTime();
    const oneMinuteAgo = powerOnTime - 1 * 60 * 1000; // 1分钟前
    const thirtyMinutesAgo = powerOnTime - 30 * 60 * 1000; // 30分钟前
    
    console.log(`开始查找异常关机发生时间，开机时间: ${powerOnEntry.timestamp}`);
    console.log(`查找范围: 30分钟前(${new Date(thirtyMinutesAgo).toISOString()}) 到 1分钟前(${new Date(oneMinuteAgo).toISOString()})`);
    
    // 改进逻辑：基于异常关机检测结果，向前查找30分钟边界外的第一个日志
    for (let i = powerOnIndex - 1; i >= 0; i--) {
      const entry = allEntries[i];
      if (!entry || !entry.timestamp) continue;
      
      const entryTime = new Date(entry.timestamp).getTime();
      
      // 跳过1分钟内的日志（属于本次开机）
      if (entryTime >= oneMinuteAgo) {
        continue;
      }
      
      // 跳过1-30分钟窗口内的日志（异常关机检测已经确认这里没有日志）
      if (entryTime >= thirtyMinutesAgo) {
        continue;
      }
      
      // 找到30分钟边界外的第一个日志，这就是异常关机发生的时间
      const minutesFromPowerOn = Math.floor((powerOnTime - entryTime) / 1000 / 60);
      console.log(`找到异常关机发生时间: ${entry.timestamp}, 距离开机=${minutesFromPowerOn}分钟`);
      console.log(`此时间将作为上一场手术的结束时间`);
      return entry;
    }
    
    // 如果30分钟外也没找到日志，返回null，调用方会使用开机事件时间作为fallback
    console.log(`30分钟外未找到任何日志，将使用开机事件时间作为手术结束时间`);
    return null;
  }

  /**
   * 获取距离前一条日志的时间（分钟）
   * @param {Object} currentEntry - 当前日志条目
   * @param {number} currentIndex - 当前日志条目的索引
   * @param {Array} allEntries - 所有日志条目
   * @returns {number} 距离前一条日志的时间（分钟）
   */
  getTimeSinceLastLogEntry(currentEntry, currentIndex, allEntries) {
    if (currentIndex > 0 && allEntries && allEntries.length > 0) {
      const previousEntry = allEntries[currentIndex - 1];
      if (previousEntry && previousEntry.timestamp) {
        const currentTime = new Date(currentEntry.timestamp).getTime();
        const previousTime = new Date(previousEntry.timestamp).getTime();
        return Math.floor((currentTime - previousTime) / 1000 / 60);
      }
    }
    return 0; // 如果没有前一条日志，返回0
  }

  /**
   * 获取前一条日志条目的时间
   * @param {number} currentIndex - 当前日志条目的索引
   * @param {Array} allEntries - 所有日志条目
   * @returns {string} 前一条日志条目的时间戳
   */
  getLastLogEntryTime(currentIndex, allEntries) {
    if (currentIndex > 0 && allEntries && allEntries.length > 0) {
      const previousEntry = allEntries[currentIndex - 1];
      if (previousEntry && previousEntry.timestamp) {
        return previousEntry.timestamp;
      }
    }
    // 如果没有前一条日志，使用当前时间作为fallback
    return new Date().toISOString();
  }
}

module.exports = SurgeryAnalyzer;
