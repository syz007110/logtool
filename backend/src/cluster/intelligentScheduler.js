/**
 * 智能集群调度器
 * 根据时段动态调整进程分配：
 * - 高峰时段：1个进程处理历史日志，其余处理用户请求
 * - 非高峰时段(02:00-07:00)：50%进程处理历史日志，其余处理用户请求
 * - 确保只有一个进程进行目录监控
 * - 切换前确保队列任务完成
 */

const EventEmitter = require('events');
const { logProcessingQueue } = require('../config/queue');

class IntelligentScheduler extends EventEmitter {
  constructor() {
    super();
    
    // 时段配置（ENV 可覆盖）
    const peakStart = parseInt(process.env.PEAK_HOURS_START) || 8;
    const peakEnd = parseInt(process.env.PEAK_HOURS_END) || 1;
    const offPeakStart = parseInt(process.env.OFF_PEAK_HOURS_START) || 2;
    const offPeakEnd = parseInt(process.env.OFF_PEAK_HOURS_END) || 7;
    this.timeConfig = {
      peakHours: { start: peakStart, end: peakEnd },
      offPeakHours: { start: offPeakStart, end: offPeakEnd }
    };
    
    // 进程分配配置（ENV 可覆盖）
    this.allocationConfig = {
      peak: {
        monitorWorkers: 1,
        historyLogWorkers: (process.env.PEAK_HISTORY_LOG_WORKERS && !isNaN(parseFloat(process.env.PEAK_HISTORY_LOG_WORKERS)))
          ? parseFloat(process.env.PEAK_HISTORY_LOG_WORKERS)
          : 1,
        userRequestWorkers: (process.env.PEAK_USER_REQUEST_WORKERS && !isNaN(parseFloat(process.env.PEAK_USER_REQUEST_WORKERS)))
          ? parseFloat(process.env.PEAK_USER_REQUEST_WORKERS)
          : null // 其余
      },
      offPeak: {
        monitorWorkers: 1,
        historyLogWorkers: (process.env.OFF_PEAK_HISTORY_LOG_WORKERS && !isNaN(parseFloat(process.env.OFF_PEAK_HISTORY_LOG_WORKERS)))
          ? parseFloat(process.env.OFF_PEAK_HISTORY_LOG_WORKERS)
          : 0.5,
        userRequestWorkers: (process.env.OFF_PEAK_USER_REQUEST_WORKERS && !isNaN(parseFloat(process.env.OFF_PEAK_USER_REQUEST_WORKERS)))
          ? parseFloat(process.env.OFF_PEAK_USER_REQUEST_WORKERS)
          : 0.5
      }
    };
    
    // 状态管理
    this.currentMode = null;
    this.isManualMode = false; // 添加手动模式标志
    this.workers = new Map();
    this.monitorWorker = null;
    this.isTransitioning = false;
    this.transitionQueue = [];
    
    // 队列状态
    this.queueStats = {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0
    };
    
    // 启动定时器
    this.scheduleTimer = null;
    this.queueCheckInterval = null;
    
    console.log('🧠 智能调度器初始化完成');
  }
  
  /**
   * 启动智能调度器
   */
  start() {
    console.log('🚀 启动智能调度器...');
    
    // 立即执行一次调度
    this.schedule();
    
    // 如果工作进程已存在，立即分配角色
    if (this.workers.size > 0) {
      console.log('🎯 为现有工作进程分配初始角色...');
      this.reallocateWorkers(this.currentMode);
    }
    
    // 每分钟检查一次时段变化
    this.scheduleTimer = setInterval(() => {
      this.schedule();
    }, 60000); // 1分钟
    
    // 每30秒检查队列状态
    this.queueCheckInterval = setInterval(() => {
      this.checkQueueStatus();
    }, 30000); // 30秒
    
    console.log('✅ 智能调度器已启动');
  }
  
  /**
   * 停止智能调度器
   */
  stop() {
    if (this.scheduleTimer) {
      clearInterval(this.scheduleTimer);
      this.scheduleTimer = null;
    }
    
    if (this.queueCheckInterval) {
      clearInterval(this.queueCheckInterval);
      this.queueCheckInterval = null;
    }
    
    console.log('🛑 智能调度器已停止');
  }
  
  /**
   * 根据当前时间确定调度模式
   */
  getCurrentTimeBasedMode() {
    const now = new Date();
    const hour = now.getHours();
    return this.isPeakTime(hour) ? 'peak' : 'offPeak';
  }
  
  /**
   * 执行调度
   */
  async schedule() {
    try {
      // 如果是手动模式，跳过自动调度
      if (this.isManualMode) {
        console.log('🎯 当前为手动模式，跳过自动调度');
        return;
      }
      
      const newMode = this.getCurrentTimeBasedMode();
      
      // 如果模式没有变化，跳过调度
      if (newMode === this.currentMode && !this.isTransitioning) {
        return;
      }
      
      console.log(`🔄 检测到时段变化: ${this.currentMode} -> ${newMode}`);
      
      // 如果正在切换中，加入队列等待
      if (this.isTransitioning) {
        console.log('⏳ 正在切换中，加入等待队列...');
        this.transitionQueue.push(newMode);
        return;
      }
      
      // 开始切换
      await this.transitionToMode(newMode);
      
    } catch (error) {
      console.error('❌ 调度执行失败:', error);
    }
  }
  
  /**
   * 切换到指定模式
   */
  async transitionToMode(targetMode) {
    try {
      this.isTransitioning = true;
      this.lastTransitionTime = Date.now();
      console.log(`🔄 开始切换到 ${targetMode} 模式...`);
      
      // 1. 等待队列任务完成
      await this.waitForQueueCompletion();
      
      // 2. 重新分配进程
      await this.reallocateWorkers(targetMode);
      
      // 3. 更新模式
      this.currentMode = targetMode;
      
      console.log(`✅ 成功切换到 ${targetMode} 模式`);
      
      // 4. 处理等待队列
      if (this.transitionQueue.length > 0) {
        const nextMode = this.transitionQueue.shift();
        setTimeout(() => this.transitionToMode(nextMode), 1000);
      }
      
    } catch (error) {
      console.error(`❌ 切换到 ${targetMode} 模式失败:`, error);
    } finally {
      this.isTransitioning = false;
      this.lastTransitionTime = null;
    }
  }
  
  /**
   * 等待队列任务完成
   */
  async waitForQueueCompletion() {
    console.log('⏳ 等待队列任务完成...');
    
    const maxWaitTime = 300000; // 5分钟最大等待时间
    const checkInterval = 5000; // 5秒检查一次
    let waitTime = 0;
    
    while (waitTime < maxWaitTime) {
      const stats = await this.getQueueStats();
      
      console.log(`📊 队列状态: 等待=${stats.waiting}, 活跃=${stats.active}, 完成=${stats.completed}, 失败=${stats.failed}`);
      
      // 如果队列为空，可以切换
      if (stats.waiting === 0 && stats.active === 0) {
        console.log('✅ 队列任务已完成，可以切换');
        return;
      }
      
      // 等待一段时间后再次检查
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waitTime += checkInterval;
    }
    
    console.warn('⚠️ 等待超时，强制切换模式');
  }
  
  /**
   * 获取队列统计信息
   */
  async getQueueStats() {
    try {
      const waiting = await logProcessingQueue.getWaiting();
      const active = await logProcessingQueue.getActive();
      const completed = await logProcessingQueue.getCompleted();
      const failed = await logProcessingQueue.getFailed();
      
      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length
      };
    } catch (error) {
      console.error('❌ 获取队列统计失败:', error);
      return { waiting: 0, active: 0, completed: 0, failed: 0 };
    }
  }
  
  /**
   * 重新分配工作进程
   */
  async reallocateWorkers(targetMode) {
    console.log(`🔄 重新分配工作进程到 ${targetMode} 模式...`);
    
    const config = this.allocationConfig && this.allocationConfig[targetMode] ? this.allocationConfig[targetMode] : null;
    if (!config) {
      console.warn(`[智能调度器] 未找到目标模式(${String(targetMode)})的配置，使用 peak 作为回退`);
      targetMode = 'peak';
    }
    const effectiveConfig = this.allocationConfig[targetMode];
    const totalWorkers = this.workers.size;
    
    // 计算各类型进程数量（主进程承担监控，这里不分配监控工作进程）
    let monitorWorkers = 0;
    let historyLogWorkers;
    let userRequestWorkers;
    
    const availableWorkers = Math.max(0, totalWorkers - monitorWorkers);
    const toCount = (val) => {
      if (val === null || val === undefined) return null; // 表示“其余”
      if (val < 1) {
        // 视为比例
        return Math.max(0, Math.floor(availableWorkers * val));
      }
      return Math.min(availableWorkers, Math.floor(val));
    };
    
    // 通用进程：处理历史日志和其他队列
    const generalWorkers = toCount(effectiveConfig.historyLogWorkers) || 0;
    const remainingAfterGeneral = Math.max(0, availableWorkers - generalWorkers);
    const urw = toCount(effectiveConfig.userRequestWorkers);
    userRequestWorkers = (urw === null) ? remainingAfterGeneral : Math.min(remainingAfterGeneral, urw);
    
    console.log(`📊 进程分配: 监控(主进程)=1, 通用进程=${generalWorkers}, 用户请求=${userRequestWorkers}`);
    
    // 重新分配进程角色
    // 注意：先分配通用进程，再分配用户进程，确保通用进程数量正确
    let monitorCount = 0;
    let generalCount = 0;
    let userRequestCount = 0;
    
    for (const [workerId, worker] of this.workers) {
      if (generalCount < generalWorkers) {
        // 先分配通用进程（参与所有队列，包括历史处理队列）
        await this.assignWorkerRole(workerId, 'general');
        generalCount++;
      } else if (userRequestCount < userRequestWorkers) {
        // 再分配为用户请求处理进程（不参与历史处理队列）
        await this.assignWorkerRole(workerId, 'userRequest');
        userRequestCount++;
      } else {
        // 如果还有剩余进程，默认作为通用进程
        await this.assignWorkerRole(workerId, 'general');
        generalCount++;
      }
    }
    
    console.log(`✅ 进程重新分配完成: 监控=${monitorCount}, 通用=${generalCount}, 用户请求=${userRequestCount}`);
  }
  
  /**
   * 分配工作进程角色
   */
  async assignWorkerRole(workerId, role) {
    try {
      const worker = this.workers.get(workerId);
      if (!worker) return;
      
      // 更新worker对象中的role信息
      worker.role = role;
      
      // 发送角色分配消息给工作进程
      worker.send({
        type: 'ROLE_ASSIGNMENT',
        role: role,
        timestamp: Date.now()
      });
      
      console.log(`👤 工作进程 ${workerId} 分配角色: ${role}`);
      
    } catch (error) {
      console.error(`❌ 分配工作进程 ${workerId} 角色失败:`, error);
    }
  }
  
  /**
   * 分配监控工作进程
   */
  async assignMonitorWorker() {
    try {
      // 如果已有监控进程，先取消
      if (this.monitorWorker) {
        this.monitorWorker.send({
          type: 'MONITOR_DISABLE',
          timestamp: Date.now()
        });
        this.monitorWorker = null;
      }
      
      // 选择第一个工作进程作为监控进程
      const firstWorker = this.workers.values().next().value;
      if (firstWorker) {
        firstWorker.send({
          type: 'MONITOR_ENABLE',
          timestamp: Date.now()
        });
        this.monitorWorker = firstWorker;
        console.log('👁️ 分配监控工作进程完成');
      }
      
    } catch (error) {
      console.error('❌ 分配监控工作进程失败:', error);
    }
  }
  
  /**
   * 注册工作进程
   */
  registerWorker(workerId, worker) {
    this.workers.set(workerId, worker);
    console.log(`📝 注册工作进程: ${workerId}`);
  }
  
  /**
   * 注销工作进程
   */
  unregisterWorker(workerId) {
    this.workers.delete(workerId);
    if (this.monitorWorker && this.monitorWorker.id === workerId) {
      this.monitorWorker = null;
    }
    console.log(`🗑️ 注销工作进程: ${workerId}`);
  }
  
  /**
   * 检查队列状态
   */
  async checkQueueStatus() {
    try {
      const stats = await this.getQueueStats();
      this.queueStats = stats;
      
      // 如果队列积压严重，发出警告
      if (stats.waiting > 100) {
        console.warn(`⚠️ 队列积压严重: ${stats.waiting} 个任务等待处理`);
      }
      
    } catch (error) {
      console.error('❌ 检查队列状态失败:', error);
    }
  }
  
  /**
   * 强制重置切换状态（用于故障恢复）
   */
  resetTransitionState() {
    console.log('🔄 强制重置切换状态...');
    this.isTransitioning = false;
    this.lastTransitionTime = null;
    this.transitionQueue = [];
    console.log('✅ 切换状态已重置');
  }

  /**
   * 手动设置模式（忽略时间自动调度）
   */
  async setManualMode(mode) {
    if (!['peak', 'offPeak'].includes(mode)) {
      throw new Error('无效的模式，必须是 "peak" 或 "offPeak"');
    }
    
    console.log(`🔍 当前状态检查: isTransitioning=${this.isTransitioning}, currentMode=${this.currentMode}, targetMode=${mode}`);
    
    if (this.isTransitioning) {
      console.log('⚠️ 检测到切换状态，尝试重置...');
      // 如果切换状态超过5分钟，强制重置
      const now = Date.now();
      if (this.lastTransitionTime && (now - this.lastTransitionTime) > 300000) {
        console.log('🔄 强制重置切换状态（超过5分钟）');
        this.isTransitioning = false;
        this.lastTransitionTime = null;
      } else {
        throw new Error('正在切换模式中，请稍后再试');
      }
    }
    
    console.log(`🎯 手动切换到 ${mode} 模式...`);
    
    // 如果已经是目标模式，直接返回
    if (this.currentMode === mode) {
      console.log(`✅ 已经是 ${mode} 模式`);
      return { success: true, message: `已经是 ${mode} 模式` };
    }
    
    try {
      // 设置手动模式标志
      this.isManualMode = true;
      
      await this.transitionToMode(mode);
      console.log(`✅ 手动切换到 ${mode} 模式完成`);
      return { 
        success: true, 
        message: `已切换到 ${mode} 模式`,
        mode: mode,
        isManualMode: true,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`❌ 手动切换到 ${mode} 模式失败:`, error);
      // 如果切换失败，重置手动模式标志
      this.isManualMode = false;
      return { 
        success: false, 
        message: `切换失败: ${error.message}`,
        error: error.message
      };
    }
  }
  
  /**
   * 获取当前模式（包括手动模式信息）
   */
  getCurrentMode() {
    const currentHour = new Date().getHours();
    const isPeakTime = this.isPeakTime(currentHour);
    const autoMode = isPeakTime ? 'peak' : 'offPeak';
    
    return {
      autoMode: autoMode,
      currentMode: this.currentMode,
      isManualMode: this.isManualMode || false,
      isTransitioning: this.isTransitioning
    };
  }
  
  /**
   * 检查是否是高峰时段
   */
  isPeakTime(hour) {
    const { peakHours, offPeakHours } = this.timeConfig;
    
    // 高峰时段：08:00 - 01:59
    if (hour >= peakHours.start || hour < peakHours.end) {
      return true;
    }
    
    // 非高峰时段：02:00 - 07:00
    if (hour >= offPeakHours.start && hour < offPeakHours.end) {
      return false;
    }
    
    // 默认按高峰时段处理
    return true;
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    const modeInfo = this.getCurrentMode();
    
    return {
      currentMode: this.currentMode,
      autoMode: modeInfo.autoMode,
      isManualMode: modeInfo.isManualMode,
      isTransitioning: this.isTransitioning,
      // 添加实际应该显示的模式信息
      displayMode: this.isManualMode ? this.currentMode : modeInfo.autoMode,
      workers: {
        total: this.workers.size,
        general: Array.from(this.workers.keys()).filter(id => 
          !this.workers.get(id).role || this.workers.get(id).role === 'general'
        ).length,
        userRequest: Array.from(this.workers.keys()).filter(id => 
          this.workers.get(id).role === 'userRequest'
        ).length
      },
      master: {
        pid: process.pid,
        monitoring: true // 主进程负责监控
      },
      queue: this.queueStats,
      transitionQueue: this.transitionQueue.length
    };
  }
}

module.exports = IntelligentScheduler;
