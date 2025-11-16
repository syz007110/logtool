/**
 * 智能工作进程
 * 根据分配的角色执行不同的任务
 */

const { logProcessingQueue } = require('../config/queue');

class SmartWorker {
  constructor(workerId) {
    this.workerId = workerId;
    this.role = null;
    this.isMonitorEnabled = false;
    this.isInitialized = false;
    this.heartbeatInterval = null;
    
    console.log(`🤖 智能工作进程 ${workerId} 初始化`);
  }
  
  /**
   * 启动工作进程
   */
  async start() {
    try {
      console.log(`🚀 工作进程 ${this.workerId} 启动中...`);
      
      // 初始化队列处理器
      await this.initializeQueueProcessor();
      
      // 监听主进程消息
      this.setupMessageHandlers();
      
      // 启动心跳机制
      this.startHeartbeat();
      
      // 发送准备就绪消息
      this.sendReadyMessage();
      
      // 等待角色分配
      console.log(`⏳ 工作进程 ${this.workerId} 等待角色分配...`);
      
    } catch (error) {
      console.error(`❌ 工作进程 ${this.workerId} 启动失败:`, error);
      process.exit(1);
    }
  }
  
  /**
   * 初始化队列处理器
   */
  async initializeQueueProcessor() {
    try {
      // 加载可控的队列处理控制器
      this.queueController = require('./queueProcessor');
      // 默认全部先暂停，由角色切换控制精确启停
      await this.queueController.stopRealtime().catch(() => {});
      await this.queueController.stopHistorical().catch(() => {});
      await this.queueController.stopLogProcessing().catch(() => {});
      await this.queueController.stopSurgery().catch(() => {});
      console.log(`📋 工作进程 ${this.workerId} 队列控制器已就绪（默认暂停）`);
      
    } catch (error) {
      console.error(`❌ 工作进程 ${this.workerId} 队列处理器启动失败:`, error);
      throw error;
    }
  }
  
  /**
   * 设置消息处理器
   */
  setupMessageHandlers() {
    process.on('message', async (message) => {
      try {
        await this.handleMessage(message);
      } catch (error) {
        console.error(`❌ 工作进程 ${this.workerId} 处理消息失败:`, error);
      }
    });
  }
  
  /**
   * 处理主进程消息
   */
  async handleMessage(message) {
    const { type, role, timestamp } = message;
    
    switch (type) {
      case 'ROLE_ASSIGNMENT':
        await this.handleRoleAssignment(role);
        break;
        
      case 'MONITOR_ENABLE':
        await this.handleMonitorEnable();
        break;
        
      case 'MONITOR_DISABLE':
        await this.handleMonitorDisable();
        break;
        
      default:
        console.log(`📨 工作进程 ${this.workerId} 收到未知消息类型: ${type}`);
    }
  }
  
  /**
   * 处理角色分配
   */
  async handleRoleAssignment(role) {
    try {
      console.log(`🎭 工作进程 ${this.workerId} 分配角色: ${role}`);
      
      // 如果角色没有变化，跳过
      if (this.role === role) {
        console.log(`⏭️ 工作进程 ${this.workerId} 角色未变化，跳过`);
        return;
      }
      
      // 停止当前角色相关服务
      await this.stopCurrentRole();
      
      // 设置新角色
      this.role = role;
      
      // 启动新角色相关服务
      await this.startNewRole();
      
      console.log(`✅ 工作进程 ${this.workerId} 角色切换完成: ${role}`);
      
    } catch (error) {
      console.error(`❌ 工作进程 ${this.workerId} 角色分配失败:`, error);
    }
  }
  
  /**
   * 处理监控启用
   */
  async handleMonitorEnable() {
    try {
      if (this.isMonitorEnabled) {
        console.log(`⏭️ 工作进程 ${this.workerId} 监控已启用，跳过`);
        return;
      }
      
      console.log(`👁️ 工作进程 ${this.workerId} 启用目录监控...`);
      
      // 初始化监控服务
      await this.initializeMonitorServices();
      
      // 启动监控服务
      await this.startMonitorServices();
      
      this.isMonitorEnabled = true;
      console.log(`✅ 工作进程 ${this.workerId} 目录监控已启用`);
      
    } catch (error) {
      console.error(`❌ 工作进程 ${this.workerId} 启用监控失败:`, error);
    }
  }
  
  /**
   * 处理监控禁用
   */
  async handleMonitorDisable() {
    try {
      if (!this.isMonitorEnabled) {
        console.log(`⏭️ 工作进程 ${this.workerId} 监控已禁用，跳过`);
        return;
      }
      
      console.log(`👁️ 工作进程 ${this.workerId} 禁用目录监控...`);
      
      // 停止监控服务
      await this.stopMonitorServices();
      
      this.isMonitorEnabled = false;
      console.log(`✅ 工作进程 ${this.workerId} 目录监控已禁用`);
      
    } catch (error) {
      console.error(`❌ 工作进程 ${this.workerId} 禁用监控失败:`, error);
    }
  }
  
  /**
   * 停止当前角色相关服务
   */
  async stopCurrentRole() {
    try {
      if (this.role === 'monitor') {
        console.log(`🛑 工作进程 ${this.workerId} 停止监控和历史日志处理服务...`);
        // 停止监控服务
        await this.stopMonitorServices();
        // 停止历史日志处理相关服务
        await this.queueController.stopRealtime();
        await this.queueController.stopHistorical();
        await this.queueController.stopLogProcessing();
        await this.queueController.stopSurgery();
      } else if (this.role === 'historyLog') {
        console.log(`🛑 工作进程 ${this.workerId} 停止历史日志处理服务...`);
        // 停止历史日志处理相关服务
        await this.queueController.stopHistorical();
      } else if (this.role === 'userRequest') {
        console.log(`🛑 工作进程 ${this.workerId} 停止用户请求处理服务...`);
        // 停止用户请求处理相关服务
        await this.queueController.stopRealtime();
        await this.queueController.stopLogProcessing();
        await this.queueController.stopSurgery();
      } else if (this.role === 'general' || this.role == null) {
        console.log(`🛑 工作进程 ${this.workerId} 停止通用进程服务...`);
        // 停止所有队列消费
        await this.queueController.stopRealtime();
        await this.queueController.stopHistorical();
        await this.queueController.stopLogProcessing();
        await this.queueController.stopSurgery();
      }
      
    } catch (error) {
      console.error(`❌ 工作进程 ${this.workerId} 停止当前角色服务失败:`, error);
    }
  }
  
  /**
   * 启动新角色相关服务
   */
  async startNewRole() {
    try {
      if (this.role === 'monitor') {
        console.log(`🚀 工作进程 ${this.workerId} 启动监控服务(仅监控与投递，不消费队列)...`);
        // 启动监控服务
        await this.startMonitorServices();
        // 监控角色不消费任何队列
        await this.queueController.stopRealtime();
        await this.queueController.stopHistorical();
        await this.queueController.stopLogProcessing();
        await this.queueController.stopSurgery();
        
      } else if (this.role === 'historyLog') {
        console.log(`🚀 工作进程 ${this.workerId} 启动历史日志处理服务（仅业务逻辑，不消费历史队列）...`);
        // 启动历史日志处理相关服务（不消费队列，历史队列仅由通用进程消费）
        await this.startHistoryLogServices();
        await this.queueController.stopRealtime();
        await this.queueController.stopHistorical();
        await this.queueController.startLogProcessing();
        await this.queueController.startSurgery();
        
      } else if (this.role === 'userRequest') {
        console.log(`🚀 工作进程 ${this.workerId} 启动用户请求处理服务...`);
        // 启动用户请求处理相关服务
        await this.startUserRequestServices();
        // 用户进程不参与历史处理队列
        await this.queueController.startRealtime();
        await this.queueController.stopHistorical();
        await this.queueController.startLogProcessing();
        await this.queueController.startSurgery();
      } else if (this.role === 'general' || this.role == null) {
        // 通用进程：参与所有队列任务（包括历史处理队列）
        console.log(`🚀 工作进程 ${this.workerId} 启动通用进程服务（参与所有队列）...`);
        await this.queueController.startRealtime();
        await this.queueController.startHistorical();
        await this.queueController.startLogProcessing();
        await this.queueController.startSurgery();
      } else {
        // 未知角色，默认作为通用进程处理
        console.log(`⚠️ 工作进程 ${this.workerId} 未知角色 ${this.role}，默认作为通用进程处理...`);
        await this.queueController.startRealtime();
        await this.queueController.startHistorical();
        await this.queueController.startLogProcessing();
        await this.queueController.startSurgery();
      }
      
    } catch (error) {
      console.error(`❌ 工作进程 ${this.workerId} 启动新角色服务失败:`, error);
    }
  }
  
  /**
   * 启动历史日志处理服务
   */
  async startHistoryLogServices() {
    try {
      console.log(`📊 工作进程 ${this.workerId} 历史日志处理服务已启动`);
      // 这里可以添加历史日志处理相关的逻辑
      
    } catch (error) {
      console.error(`❌ 工作进程 ${this.workerId} 启动历史日志处理服务失败:`, error);
    }
  }
  
  /**
   * 启动用户请求处理服务
   */
  async startUserRequestServices() {
    try {
      console.log(`👥 工作进程 ${this.workerId} 用户请求处理服务已启动`);
      // 这里可以添加用户请求处理相关的逻辑
      
    } catch (error) {
      console.error(`❌ 工作进程 ${this.workerId} 启动用户请求处理服务失败:`, error);
    }
  }
  
  
  /**
   * 启动监控服务
   */
  async startMonitorServices() {
    console.log(`📁 工作进程 ${this.workerId} 监控服务已禁用（使用客户端脚本方案）`);
  }
  
  /**
   * 停止监控服务
   */
  async stopMonitorServices() {
    console.log(`📁 工作进程 ${this.workerId} 监控服务已禁用（使用客户端脚本方案）`);
  }
  
  /**
   * 启动心跳机制
   */
  startHeartbeat() {
    // 每30秒发送一次心跳
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 30000);
  }
  
  /**
   * 发送心跳消息
   */
  sendHeartbeat() {
    if (process.send) {
      process.send({
        type: 'worker_heartbeat',
        workerId: this.workerId,
        timestamp: Date.now(),
        status: this.getStatus()
      });
    }
  }
  
  /**
   * 发送准备就绪消息
   */
  sendReadyMessage() {
    if (process.send) {
      process.send({
        type: 'worker_ready',
        workerId: this.workerId,
        timestamp: Date.now()
      });
    }
  }
  
  /**
   * 获取工作进程状态
   */
  getStatus() {
    return {
      workerId: this.workerId,
      role: this.role,
      isMonitorEnabled: this.isMonitorEnabled,
      isInitialized: this.isInitialized,
      monitor: {
        enabled: false,
        message: '监控服务已禁用（使用客户端脚本方案）'
      }
    };
  }
  
  /**
   * 优雅关闭
   */
  async gracefulShutdown() {
    try {
      console.log(`🛑 工作进程 ${this.workerId} 开始优雅关闭...`);
      
      // 停止心跳
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      
      // 停止监控服务
      if (this.isMonitorEnabled) {
        await this.stopMonitorServices();
      }
      
      // 停止角色相关服务
      await this.stopCurrentRole();
      
      console.log(`✅ 工作进程 ${this.workerId} 优雅关闭完成`);
      
    } catch (error) {
      console.error(`❌ 工作进程 ${this.workerId} 优雅关闭失败:`, error);
    }
  }
}

module.exports = SmartWorker;
