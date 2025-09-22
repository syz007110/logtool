/**
 * 监控中间件
 * 收集API请求指标和性能数据
 */

// 全局指标计数器
if (!global.requestCounter) {
  global.requestCounter = {
    total: 0,
    errors: 0,
    responseTimes: [],
    avgResponseTime: 0,
    startTime: Date.now()
  };
}

if (!global.alertHistory) {
  global.alertHistory = [];
}

/**
 * API请求监控中间件
 */
const apiMonitoring = (req, res, next) => {
  const startTime = Date.now();
  
  // 增加总请求计数
  global.requestCounter.total++;
  
  // 监听响应完成
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    
    // 记录响应时间
    global.requestCounter.responseTimes.push(responseTime);
    
    // 保持最近1000个响应时间记录
    if (global.requestCounter.responseTimes.length > 1000) {
      global.requestCounter.responseTimes.shift();
    }
    
    // 计算平均响应时间
    const total = global.requestCounter.responseTimes.reduce((sum, time) => sum + time, 0);
    global.requestCounter.avgResponseTime = Math.round(total / global.requestCounter.responseTimes.length);
    
    // 记录错误
    if (res.statusCode >= 400) {
      global.requestCounter.errors++;
    }
    
    // 记录慢请求
    if (responseTime > 5000) { // 超过5秒的请求
      console.warn(`[慢请求监控] ${req.method} ${req.path} - ${responseTime}ms`);
    }
  });
  
  next();
};

/**
 * 系统资源监控中间件
 */
const systemMonitoring = (req, res, next) => {
  // 记录内存使用情况
  const memUsage = process.memoryUsage();
  const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  
  // 内存使用过高时记录警告
  if (memUsageMB > 500) { // 超过500MB
    console.warn(`[内存监控] 内存使用过高: ${memUsageMB}MB`);
  }
  
  next();
};

/**
 * 错误监控中间件
 */
const errorMonitoring = (err, req, res, next) => {
  // 记录错误信息
  console.error(`[错误监控] ${req.method} ${req.path} - ${err.message}`);
  
  // 增加错误计数
  global.requestCounter.errors++;
  
  // 记录错误到告警历史
  global.alertHistory.push({
    type: 'api_error',
    level: 'error',
    message: `${req.method} ${req.path}: ${err.message}`,
    timestamp: new Date(),
    requestId: req.id || 'unknown'
  });
  
  // 保持告警历史在合理范围内
  if (global.alertHistory.length > 1000) {
    global.alertHistory.shift();
  }
  
  next(err);
};

/**
 * 获取监控统计信息
 */
const getMonitoringStats = () => {
  const uptime = Date.now() - global.requestCounter.startTime;
  const uptimeHours = Math.round(uptime / (1000 * 60 * 60));
  
  return {
    uptime: uptimeHours,
    totalRequests: global.requestCounter.total,
    errorCount: global.requestCounter.errors,
    errorRate: global.requestCounter.total > 0 ? 
      Math.round((global.requestCounter.errors / global.requestCounter.total) * 100) : 0,
    avgResponseTime: global.requestCounter.avgResponseTime,
    recentAlerts: global.alertHistory.slice(-10) // 最近10个告警
  };
};

/**
 * 清理过期数据
 */
const cleanupMonitoringData = () => {
  // 清理过期的响应时间记录
  if (global.requestCounter.responseTimes.length > 1000) {
    global.requestCounter.responseTimes = global.requestCounter.responseTimes.slice(-500);
  }
  
  // 清理过期的告警历史（保留24小时）
  const cutoff = Date.now() - (24 * 60 * 60 * 1000);
  global.alertHistory = global.alertHistory.filter(alert => alert.timestamp > cutoff);
};

// 定期清理数据
setInterval(cleanupMonitoringData, 60 * 60 * 1000); // 每小时清理一次

module.exports = {
  apiMonitoring,
  systemMonitoring,
  errorMonitoring,
  getMonitoringStats
};
