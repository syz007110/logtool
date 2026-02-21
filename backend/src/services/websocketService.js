const WebSocket = require('ws');
const { EventEmitter } = require('events');
const redis = require('redis');

class WebSocketService extends EventEmitter {
  constructor() {
    super();
    this.wss = null;
    this.clients = new Map(); // 存储连接的客户端
    this.deviceSubscriptions = new Map(); // 设备订阅关系
    this.logStatusCache = new Map(); // 日志状态缓存

    // Redis Pub/Sub
    this.pubClient = null;
    this.subClient = null;
    this.subscribed = false;
    this.processId = `pid_${process.pid}`;
  }

  getRedisClientOptions() {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT, 10) || 6379;
    const password = process.env.REDIS_PASSWORD || undefined;
    const db = parseInt(process.env.REDIS_DB, 10) || 0;
    const url = process.env.REDIS_URL || `redis://${host}:${port}`;
    const clientOpts = { url };
    if (password) clientOpts.password = password;
    if (Number.isFinite(db)) clientOpts.database = db;
    return clientOpts;
  }

  async ensurePublisher() {
    try {
      if (this.pubClient && this.pubClient.isOpen) return;
      const clientOpts = this.getRedisClientOptions();
      this.pubClient = redis.createClient(clientOpts);
      this.pubClient.on('error', (e) => console.error('Redis PUB 错误:', e.message));
      await this.pubClient.connect();
    } catch (e) {
      console.error('初始化 Redis 发布者失败（将本地广播降级）:', e.message);
    }
  }

  // 初始化 WebSocket 服务器
  initialize(server) {
    console.log('🔌 正在初始化 WebSocket 服务器...');
    console.log('🔌 服务器信息:', server.address());
    
    // 将 WebSocket 监听固定在 /ws，避免与 HTTP 根路径 '/' 冲突
    this.wss = new WebSocket.Server({ server, path: '/ws' });
    
    this.wss.on('connection', (ws, req) => {
      console.log('🔌 收到新的 WebSocket 连接请求');
      console.log('🔌 请求头:', req.headers);
      console.log('🔌 请求URL:', req.url);
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      console.error('🔌 WebSocket 服务器错误:', error);
    });

    console.log('🔌 WebSocket 服务器已启动');

    // 初始化 Redis Pub/Sub（仅在有 WebSocket 服务的进程中订阅）
    this.initializePubSub();
  }

  // 初始化 Redis Pub/Sub
  async initializePubSub() {
    const clientOpts = this.getRedisClientOptions();

    try {
      // 发布客户端（主进程也需要发布能力）
      await this.ensurePublisher();

      // 订阅客户端（仅在有 wss 的进程中）
      this.subClient = redis.createClient(clientOpts);
      this.subClient.on('error', (e) => console.error('Redis SUB 错误:', e.message));
      await this.subClient.connect();

      // 订阅三个频道
      const LOG_CH = 'ws:log_status_change';
      const BATCH_CH = 'ws:batch_status_change';
      const MOTION_DATA_CH = 'ws:motion_data_task_status';
      const LOG_TASK_CH = 'ws:log_task_status';
      const SURGERY_TASK_CH = 'ws:surgery_task_status';

      await this.subClient.subscribe(LOG_CH, (message) => {
        try {
          const data = JSON.parse(message);
          // 忽略无效数据
          if (!data || !data.deviceId || !data.logId) return;
          // 使用统一广播逻辑
          this.broadcastLogStatusChange(data);
        } catch (e) {
          console.error('订阅处理失败(LOG_CH):', e.message);
        }
      });

      await this.subClient.subscribe(BATCH_CH, (message) => {
        try {
          const data = JSON.parse(message);
          if (!data || !data.deviceId || !Array.isArray(data.changes)) return;
          this.broadcastBatchStatusChange(data);
        } catch (e) {
          console.error('订阅处理失败(BATCH_CH):', e.message);
        }
      });

      await this.subClient.subscribe(MOTION_DATA_CH, (message) => {
        try {
          const data = JSON.parse(message);
          if (!data || !data.taskId) return;
          this.broadcastMotionDataTaskStatus(data);
        } catch (e) {
          console.error('订阅处理失败(MOTION_DATA_CH):', e.message);
        }
      });

      await this.subClient.subscribe(LOG_TASK_CH, (message) => {
        try {
          const data = JSON.parse(message);
          if (!data || !data.taskId) return;
          this.broadcastLogTaskStatus(data);
        } catch (e) {
          console.error('订阅处理失败(LOG_TASK_CH):', e.message);
        }
      });

      await this.subClient.subscribe(SURGERY_TASK_CH, (message) => {
        try {
          const data = JSON.parse(message);
          if (!data || !data.taskId) return;
          this.broadcastSurgeryTaskStatus(data);
        } catch (e) {
          console.error('订阅处理失败(SURGERY_TASK_CH):', e.message);
        }
      });

      this.subscribed = true;
      console.log('🔔 WebSocket 跨进程订阅已就绪 (Redis Pub/Sub)');
    } catch (err) {
      console.error('初始化 Redis Pub/Sub 失败:', err.message);
      // 降级：仍允许本进程内推送（仅当有本地订阅者时生效）
    }
  }

  // 处理新连接
  handleConnection(ws, req) {
    const clientId = this.generateClientId();
    this.clients.set(clientId, ws);
    
    console.log(`🔗 新的 WebSocket 连接: ${clientId}`);

    // 发送连接确认
    ws.send(JSON.stringify({
      type: 'connection',
      clientId,
      message: '连接成功'
    }));

    // 处理消息
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        this.handleMessage(clientId, message);
      } catch (error) {
        console.error('WebSocket 消息解析错误:', error);
      }
    });

    // 处理连接关闭
    ws.on('close', () => {
      this.handleDisconnection(clientId);
    });

    // 处理错误
    ws.on('error', (error) => {
      console.error(`WebSocket 连接错误 (${clientId}):`, error);
      this.handleDisconnection(clientId);
    });
  }

  // 处理客户端消息
  handleMessage(clientId, message) {
    switch (message.type) {
      case 'subscribe_device':
        this.subscribeToDevice(clientId, message.deviceId);
        break;
      case 'unsubscribe_device':
        this.unsubscribeFromDevice(clientId, message.deviceId);
        break;
      case 'ping':
        this.sendToClient(clientId, { type: 'pong', timestamp: Date.now() });
        break;
      default:
        console.log(`未知消息类型: ${message.type}`);
    }
  }

  // 订阅设备状态更新
  subscribeToDevice(clientId, deviceId) {
    if (!this.deviceSubscriptions.has(deviceId)) {
      this.deviceSubscriptions.set(deviceId, new Set());
    }
    
    this.deviceSubscriptions.get(deviceId).add(clientId);
    console.log(`📡 客户端 ${clientId} 订阅设备 ${deviceId} 状态更新`);
    
    // 发送订阅确认
    this.sendToClient(clientId, {
      type: 'subscription_confirmed',
      deviceId,
      message: '订阅成功'
    });
  }

  // 取消订阅设备状态更新
  unsubscribeFromDevice(clientId, deviceId) {
    const subscribers = this.deviceSubscriptions.get(deviceId);
    if (subscribers) {
      subscribers.delete(clientId);
      if (subscribers.size === 0) {
        this.deviceSubscriptions.delete(deviceId);
      }
    }
    console.log(`📡 客户端 ${clientId} 取消订阅设备 ${deviceId}`);
  }

  // 处理连接断开
  handleDisconnection(clientId) {
    // 清理客户端订阅
    for (const [deviceId, subscribers] of this.deviceSubscriptions) {
      subscribers.delete(clientId);
      if (subscribers.size === 0) {
        this.deviceSubscriptions.delete(deviceId);
      }
    }
    
    this.clients.delete(clientId);
    console.log(`🔌 WebSocket 连接断开: ${clientId}`);
  }

  // 推送日志状态变化（发布到 Redis 频道，主进程订阅后广播）
  async pushLogStatusChange(deviceId, logId, newStatus, oldStatus) {
    // 状态缓存：仅用于抑制重复状态（跨进程用 Redis，仍保留本地缓存）
    const cacheKey = `${deviceId}:${logId}`;
    const cachedStatus = this.logStatusCache.get(cacheKey);
    if (cachedStatus === newStatus) {
      return;
    }
    this.logStatusCache.set(cacheKey, newStatus);

    const payload = JSON.stringify({
      deviceId,
      logId,
      oldStatus,
      newStatus,
      timestamp: Date.now(),
      source: this.processId
    });

    const channel = 'ws:log_status_change';
    try {
      await this.ensurePublisher();
      if (this.pubClient && this.pubClient.isOpen) {
        await this.pubClient.publish(channel, payload);
      } else {
        // 无 Redis 时退化为本地广播（仅影响本进程）
        this.broadcastLogStatusChange(JSON.parse(payload));
      }
    } catch (e) {
      console.error('发布日志状态变化失败:', e.message);
      this.broadcastLogStatusChange(JSON.parse(payload));
    }
  }

  // 推送批量状态变化（发布到 Redis 频道）
  async pushBatchStatusChange(deviceId, changes) {
    const payload = JSON.stringify({
      deviceId,
      changes,
      timestamp: Date.now(),
      source: this.processId
    });
    const channel = 'ws:batch_status_change';
    try {
      await this.ensurePublisher();
      if (this.pubClient && this.pubClient.isOpen) {
        await this.pubClient.publish(channel, payload);
      } else {
        this.broadcastBatchStatusChange(JSON.parse(payload));
      }
    } catch (e) {
      console.error('发布批量状态变化失败:', e.message);
      this.broadcastBatchStatusChange(JSON.parse(payload));
    }
  }

  // 统一广播单条状态变化到本进程内的 WebSocket 客户端
  broadcastLogStatusChange(data) {
    const { deviceId, logId, oldStatus, newStatus, timestamp } = data || {};
    if (!deviceId) return;
    const subscribers = this.deviceSubscriptions.get(deviceId);
    if (subscribers && subscribers.size > 0) {
      const message = {
        type: 'log_status_change',
        deviceId,
        logId,
        oldStatus,
        newStatus,
        timestamp
      };
      subscribers.forEach(clientId => this.sendToClient(clientId, message));
      console.log(`📡 推送状态变化: 设备 ${deviceId}, 日志 ${logId}, ${oldStatus} → ${newStatus}`);
    }
  }

  // 统一广播批量状态变化到本进程内的 WebSocket 客户端
  broadcastBatchStatusChange(data) {
    const { deviceId, changes, timestamp } = data || {};
    if (!deviceId) return;
    const subscribers = this.deviceSubscriptions.get(deviceId);
    if (subscribers && subscribers.size > 0) {
      const message = {
        type: 'batch_status_change',
        deviceId,
        changes,
        timestamp
      };
      subscribers.forEach(clientId => this.sendToClient(clientId, message));
      console.log(`📡 推送批量状态变化: 设备 ${deviceId}, ${changes?.length || 0} 个变化`);
    }
  }

  // 推送MotionData任务状态变化（发布到 Redis 频道）
  async pushMotionDataTaskStatus(taskId, status, progress, userId, result = null, error = null) {
    const payload = JSON.stringify({
      taskId,
      status,
      progress,
      userId,
      result,
      error,
      timestamp: Date.now(),
      source: this.processId
    });
    const channel = 'ws:motion_data_task_status';
    try {
      await this.ensurePublisher();
      if (this.pubClient && this.pubClient.isOpen) {
        await this.pubClient.publish(channel, payload);
      } else {
        this.broadcastMotionDataTaskStatus(JSON.parse(payload));
      }
    } catch (e) {
      console.error('发布MotionData任务状态变化失败:', e.message);
      this.broadcastMotionDataTaskStatus(JSON.parse(payload));
    }
  }

  // 广播MotionData任务状态变化到所有客户端（不依赖设备订阅）
  broadcastMotionDataTaskStatus(data) {
    const { taskId, status, progress, userId, result, error, timestamp } = data || {};
    if (!taskId) return;
    
    const message = {
      type: 'motion_data_task_status',
      taskId,
      status,
      progress,
      userId,
      result,
      error,
      timestamp
    };
    
    // 广播给所有连接的客户端（MotionData任务不依赖设备订阅）
    this.broadcast(message);
    console.log(`📡 推送MotionData任务状态: 任务 ${taskId}, 状态 ${status}, 进度 ${progress}%`);
  }

  // 推送日志队列任务状态变化（发布到 Redis 频道）
  async pushLogTaskStatus(taskId, status, progress = 0, data = null, error = null) {
    const payload = JSON.stringify({
      taskId,
      status,
      progress,
      data,
      error,
      timestamp: Date.now(),
      source: this.processId
    });
    const channel = 'ws:log_task_status';
    try {
      await this.ensurePublisher();
      if (this.pubClient && this.pubClient.isOpen) {
        await this.pubClient.publish(channel, payload);
      } else {
        this.broadcastLogTaskStatus(JSON.parse(payload));
      }
    } catch (e) {
      console.error('发布日志任务状态变化失败:', e.message);
      this.broadcastLogTaskStatus(JSON.parse(payload));
    }
  }

  // 广播日志队列任务状态变化到所有客户端
  broadcastLogTaskStatus(data) {
    const { taskId, status, progress, error, timestamp } = data || {};
    if (!taskId) return;
    this.broadcast({
      type: 'log_task_status',
      taskId,
      status,
      progress,
      error,
      timestamp
    });
  }

  // 推送手术分析任务状态变化（发布到 Redis 频道）
  async pushSurgeryTaskStatus(taskId, status, progress = 0, data = null, error = null, deviceId = null) {
    const payload = JSON.stringify({
      taskId,
      status,
      progress,
      deviceId: String(deviceId || '').trim() || null,
      data,
      error,
      timestamp: Date.now(),
      source: this.processId
    });
    const channel = 'ws:surgery_task_status';
    try {
      await this.ensurePublisher();
      if (this.pubClient && this.pubClient.isOpen) {
        await this.pubClient.publish(channel, payload);
      } else {
        this.broadcastSurgeryTaskStatus(JSON.parse(payload));
      }
    } catch (e) {
      console.error('发布手术任务状态变化失败:', e.message);
      this.broadcastSurgeryTaskStatus(JSON.parse(payload));
    }
  }

  // 广播手术分析任务状态变化到所有客户端
  broadcastSurgeryTaskStatus(data) {
    const { taskId, status, progress, error, timestamp } = data || {};
    const deviceId = String(data?.deviceId || '').trim() || null;
    if (!taskId) return;
    const message = {
      type: 'surgery_task_status',
      taskId,
      deviceId,
      status,
      progress,
      error,
      timestamp
    };
    if (deviceId) {
      const subscribers = this.deviceSubscriptions.get(deviceId);
      if (subscribers && subscribers.size > 0) {
        subscribers.forEach(clientId => this.sendToClient(clientId, message));
        return;
      }
    }
    this.broadcast(message);
  }

  // 推送给特定客户端
  sendToClient(clientId, message) {
    const ws = this.clients.get(clientId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
      } catch (error) {
        console.error(`发送消息到客户端 ${clientId} 失败:`, error);
        this.handleDisconnection(clientId);
      }
    }
  }

  // 广播消息给所有客户端
  broadcast(message) {
    this.clients.forEach((ws, clientId) => {
      this.sendToClient(clientId, message);
    });
  }

  // 生成客户端ID
  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // 获取连接统计信息
  getStats() {
    return {
      totalClients: this.clients.size,
      totalSubscriptions: this.deviceSubscriptions.size,
      deviceSubscriptions: Object.fromEntries(
        Array.from(this.deviceSubscriptions.entries()).map(([deviceId, subscribers]) => [
          deviceId,
          subscribers.size
        ])
      )
    };
  }

  // 清理过期的状态缓存
  cleanupExpiredCache() {
    const now = Date.now();
    const expireTime = 24 * 60 * 60 * 1000; // 24小时
    
    for (const [key, timestamp] of this.logStatusCache.entries()) {
      if (now - timestamp > expireTime) {
        this.logStatusCache.delete(key);
      }
    }
  }
}

// 创建单例实例
const websocketService = new WebSocketService();

// 定期清理过期缓存
setInterval(() => {
  websocketService.cleanupExpiredCache();
}, 60 * 60 * 1000); // 每小时清理一次

module.exports = websocketService;
