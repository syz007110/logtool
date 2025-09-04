class WebSocketClient {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000; // 初始重连延迟1秒
    this.maxReconnectDelay = 30000; // 最大重连延迟30秒
    this.isConnecting = false;
    this.subscriptions = new Map(); // 存储设备订阅
    this.messageHandlers = new Map(); // 存储消息处理器
    this.connectionStatus = 'disconnected'; // disconnected, connecting, connected
    
    // 绑定方法到实例
    this.handleMessage = this.handleMessage.bind(this);
    this.handleClose = this.handleClose.bind(this);
    this.handleError = this.handleError.bind(this);
    this.handleOpen = this.handleOpen.bind(this);
  }

  // 连接到 WebSocket 服务器
  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('WebSocket 已连接');
      return;
    }

    if (this.isConnecting) {
      console.log('WebSocket 正在连接中...');
      return;
    }

    this.isConnecting = true;
    this.connectionStatus = 'connecting';

    try {
      // 获取当前协议和主机
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      
      // 前端运行在 8080 端口，后端在 3000 端口
      // 智能选择后端地址：本地开发用 localhost，网络环境用实际 IP
      let backendHost;
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        backendHost = 'localhost'; // 本地开发环境
      } else {
        backendHost = window.location.hostname; // 网络环境，使用当前主机名
      }
      const backendPort = process.env.VUE_APP_BACKEND_PORT || '3000';
      const wsUrl = `${protocol}//${backendHost}:${backendPort}`;

      console.log(`🔌 正在连接 WebSocket: ${wsUrl}`);
      console.log(`📍 当前页面地址: ${window.location.href}`);
      console.log(`🌐 协议: ${protocol}`);
      console.log(`🏠 前端主机: ${window.location.host}`);
      console.log(`🔌 后端地址: ${backendHost}:${backendPort}`);
      console.log(`🔍 网络环境: ${window.location.hostname === 'localhost' ? '本地开发' : '网络环境'}`);
      console.log(`🔍 建议连接: ${window.location.hostname === 'localhost' ? 'ws://localhost:3000' : 'ws://10.129.44.141:3000'}`);
      
      this.ws = new WebSocket(wsUrl);
      
      // 添加更多事件监听器用于调试
      this.ws.addEventListener('open', (event) => {
        console.log('🔌 WebSocket 连接事件触发: open', event);
        clearTimeout(connectionTimeout);
      });
      
      this.ws.addEventListener('error', (event) => {
        console.log('🔌 WebSocket 错误事件触发: error', event);
      });
      
      this.ws.addEventListener('close', (event) => {
        console.log('🔌 WebSocket 关闭事件触发: close', event);
      });
      
      this.ws.onopen = this.handleOpen;
      this.ws.onmessage = this.handleMessage;
      this.ws.onclose = this.handleClose;
      this.ws.onerror = this.handleError;
      
      // 设置连接超时
      const connectionTimeout = setTimeout(() => {
        console.log('⏰ WebSocket 连接超时检查，当前状态:', this.ws.readyState);
        if (this.ws.readyState === WebSocket.CONNECTING) {
          console.error('WebSocket 连接超时，当前状态:', this.ws.readyState);
          this.ws.close();
          this.handleConnectionTimeout();
        }
      }, 10000); // 10秒超时
    } catch (error) {
      console.error('WebSocket 连接失败:', error);
      this.isConnecting = false;
      this.connectionStatus = 'disconnected';
      this.scheduleReconnect();
    }
  }

  // 处理连接打开
  handleOpen(event) {
    console.log('🔌 WebSocket 连接成功');
    this.isConnecting = false;
    this.connectionStatus = 'connected';
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;

    // 重新订阅之前的设备
    this.resubscribeAll();
    
    // 发送心跳
    this.startHeartbeat();
    
    // 触发连接成功事件
    this.triggerEvent('connection', {
      status: 'connected',
      timestamp: Date.now()
    });
  }

  // 处理消息
  handleMessage(event) {
    try {
      const message = JSON.parse(event.data);
      console.log('📨 收到 WebSocket 消息:', message);

      switch (message.type) {
        case 'connection':
          console.log('✅ WebSocket 连接确认:', message.message);
          break;
          
        case 'subscription_confirmed':
          console.log('✅ 设备订阅确认:', message.deviceId, message.message);
          break;
          
        case 'log_status_change':
          this.handleLogStatusChange(message);
          break;
          
        case 'batch_status_change':
          this.handleBatchStatusChange(message);
          break;
          
        case 'pong':
          // 心跳响应，无需处理
          break;
          
        default:
          console.log('未知消息类型:', message.type);
      }
    } catch (error) {
      console.error('解析 WebSocket 消息失败:', error);
    }
  }

  // 处理日志状态变化
  handleLogStatusChange(message) {
    const { deviceId, logId, oldStatus, newStatus, timestamp } = message;
    console.log(`🔄 日志状态变化: 设备 ${deviceId}, 日志 ${logId}, ${oldStatus} → ${newStatus}`);
    
    // 触发状态变化事件
    this.triggerEvent('logStatusChange', {
      deviceId,
      logId,
      oldStatus,
      newStatus,
      timestamp
    });
  }

  // 处理批量状态变化
  handleBatchStatusChange(message) {
    const { deviceId, changes, timestamp } = message;
    console.log(`🔄 批量状态变化: 设备 ${deviceId}, ${changes.length} 个变化`);
    
    // 触发批量状态变化事件
    this.triggerEvent('batchStatusChange', {
      deviceId,
      changes,
      timestamp
    });
  }

  // 处理连接关闭
  handleClose(event) {
    console.log('🔌 WebSocket 连接关闭:', event.code, event.reason);
    this.connectionStatus = 'disconnected';
    this.isConnecting = false;
    
    // 停止心跳
    this.stopHeartbeat();
    
    // 触发断开连接事件
    this.triggerEvent('disconnection', {
      status: 'disconnected',
      code: event.code,
      reason: event.reason,
      timestamp: Date.now()
    });
    
    // 如果不是正常关闭，尝试重连
    if (event.code !== 1000) {
      this.scheduleReconnect();
    }
  }

  // 处理连接错误
  handleError(error) {
    console.error('❌ WebSocket 连接错误:', error);
    this.connectionStatus = 'disconnected';
    this.isConnecting = false;
  }
  
  // 处理连接超时
  handleConnectionTimeout() {
    console.error('⏰ WebSocket 连接超时');
    this.connectionStatus = 'disconnected';
    this.isConnecting = false;
    this.scheduleReconnect();
  }

  // 订阅设备状态更新
  subscribeToDevice(deviceId) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket 未连接，无法订阅设备');
      return false;
    }

    if (this.subscriptions.has(deviceId)) {
      console.log(`设备 ${deviceId} 已订阅`);
      return true;
    }

    try {
      const message = {
        type: 'subscribe_device',
        deviceId
      };
      
      this.ws.send(JSON.stringify(message));
      this.subscriptions.set(deviceId, true);
      console.log(`📡 订阅设备 ${deviceId} 状态更新`);
      return true;
    } catch (error) {
      console.error(`订阅设备 ${deviceId} 失败:`, error);
      return false;
    }
  }

  // 取消订阅设备状态更新
  unsubscribeFromDevice(deviceId) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    if (!this.subscriptions.has(deviceId)) {
      return true;
    }

    try {
      const message = {
        type: 'unsubscribe_device',
        deviceId
      };
      
      this.ws.send(JSON.stringify(message));
      this.subscriptions.delete(deviceId);
      console.log(`📡 取消订阅设备 ${deviceId} 状态更新`);
      return true;
    } catch (error) {
      console.error(`取消订阅设备 ${deviceId} 失败:`, error);
      return false;
    }
  }

  // 重新订阅所有设备
  resubscribeAll() {
    for (const deviceId of this.subscriptions.keys()) {
      this.subscribeToDevice(deviceId);
    }
  }

  // 启动心跳
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        } catch (error) {
          console.error('发送心跳失败:', error);
        }
      }
    }, 30000); // 每30秒发送一次心跳
  }

  // 停止心跳
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // 安排重连
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('WebSocket 重连次数已达上限，停止重连');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
    
    console.log(`🔄 ${delay}ms 后尝试重连 WebSocket (第 ${this.reconnectAttempts} 次)`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  // 断开连接
  disconnect() {
    if (this.ws) {
      this.ws.close(1000, '用户主动断开');
    }
    this.stopHeartbeat();
    this.connectionStatus = 'disconnected';
    this.isConnecting = false;
  }

  // 添加事件监听器
  on(event, handler) {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, []);
    }
    this.messageHandlers.get(event).push(handler);
  }

  // 移除事件监听器
  off(event, handler) {
    if (this.messageHandlers.has(event)) {
      const handlers = this.messageHandlers.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  // 触发事件
  triggerEvent(event, data) {
    if (this.messageHandlers.has(event)) {
      this.messageHandlers.get(event).forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`事件处理器 ${event} 执行失败:`, error);
        }
      });
    }
  }

  // 获取连接状态
  getConnectionStatus() {
    return this.connectionStatus;
  }

  // 检查是否已连接
  isConnected() {
    return this.connectionStatus === 'connected';
  }

  // 获取订阅的设备列表
  getSubscribedDevices() {
    return Array.from(this.subscriptions.keys());
  }
}

// 创建单例实例
const websocketClient = new WebSocketClient();

// 自动连接
websocketClient.connect();

export default websocketClient;
