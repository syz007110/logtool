const WebSocket = require('ws');
const { EventEmitter } = require('events');

class WebSocketService extends EventEmitter {
  constructor() {
    super();
    this.wss = null;
    this.clients = new Map(); // 存储连接的客户端
    this.deviceSubscriptions = new Map(); // 设备订阅关系
    this.logStatusCache = new Map(); // 日志状态缓存
  }

  // 初始化 WebSocket 服务器
  initialize(server) {
    console.log('🔌 正在初始化 WebSocket 服务器...');
    console.log('🔌 服务器信息:', server.address());
    
    this.wss = new WebSocket.Server({ server });
    
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

  // 推送日志状态变化
  pushLogStatusChange(deviceId, logId, newStatus, oldStatus) {
    // 检查状态是否真的发生了变化
    const cacheKey = `${deviceId}:${logId}`;
    const cachedStatus = this.logStatusCache.get(cacheKey);
    
    if (cachedStatus === newStatus) {
      return; // 状态没有变化，不推送
    }
    
    // 更新缓存
    this.logStatusCache.set(cacheKey, newStatus);
    
    // 推送给订阅该设备的客户端
    const subscribers = this.deviceSubscriptions.get(deviceId);
    if (subscribers) {
      const message = {
        type: 'log_status_change',
        deviceId,
        logId,
        oldStatus,
        newStatus,
        timestamp: Date.now()
      };
      
      subscribers.forEach(clientId => {
        this.sendToClient(clientId, message);
      });
      
      console.log(`📡 推送状态变化: 设备 ${deviceId}, 日志 ${logId}, ${oldStatus} → ${newStatus}`);
    }
  }

  // 推送批量状态变化
  pushBatchStatusChange(deviceId, changes) {
    const subscribers = this.deviceSubscriptions.get(deviceId);
    if (subscribers) {
      const message = {
        type: 'batch_status_change',
        deviceId,
        changes,
        timestamp: Date.now()
      };
      
      subscribers.forEach(clientId => {
        this.sendToClient(clientId, message);
      });
      
      console.log(`📡 推送批量状态变化: 设备 ${deviceId}, ${changes.length} 个变化`);
    }
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
