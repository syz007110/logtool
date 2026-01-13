/**
 * 应用层重定向中间件
 * 将请求重定向到云服务器
 * 
 * 使用方法：
 * 1. 在 backend/.env 中添加：
 *    REDIRECT_TO_CLOUD_ENABLED=true
 *    CLOUD_SERVER_URL=http://42.121.15.87
 * 
 * 2. 在 backend/src/app.js 中引入：
 *    const redirectToCloud = require('./middlewares/redirectToCloud');
 *    if (process.env.REDIRECT_TO_CLOUD_ENABLED === 'true') {
 *      app.use(redirectToCloud);
 *    }
 * 
 * 优点：
 * - 不需要修改 Nginx 配置
 * - 可以更灵活地控制重定向逻辑
 * - 可以添加日志、统计等功能
 * 
 * 缺点：
 * - 需要重启后端服务
 * - 会增加后端处理开销
 */

function boolEnvTrue(name) {
  return String(process.env[name] || '').toLowerCase() === 'true';
}

function getCloudServerUrl() {
  const url = String(process.env.CLOUD_SERVER_URL || '').trim();
  if (!url) {
    console.warn('[redirect-to-cloud] CLOUD_SERVER_URL 未配置，重定向功能已禁用');
    return null;
  }
  // 确保 URL 以 / 结尾（用于拼接路径）
  return url.replace(/\/+$/, '');
}

/**
 * 判断是否应该重定向此请求
 * @param {Object} req - Express 请求对象
 * @returns {boolean}
 */
function shouldRedirect(req) {
  // 排除健康检查接口（避免影响监控）
  if (req.path === '/health' || req.path.startsWith('/health/')) {
    return false;
  }
  
  // 排除 WebSocket 升级请求（WebSocket 需要特殊处理）
  if (req.headers.upgrade === 'websocket') {
    return false;
  }
  
  // 可以根据需要添加更多排除条件
  // 例如：排除某些内部接口
  // if (req.path.startsWith('/internal/')) {
  //   return false;
  // }
  
  return true;
}

/**
 * 重定向中间件
 */
function redirectToCloudMiddleware(req, res, next) {
  // 检查是否启用重定向
  if (!boolEnvTrue('REDIRECT_TO_CLOUD_ENABLED')) {
    return next();
  }
  
  // 获取云服务器 URL
  const cloudServerUrl = getCloudServerUrl();
  if (!cloudServerUrl) {
    return next();
  }
  
  // 判断是否应该重定向
  if (!shouldRedirect(req)) {
    return next();
  }
  
  // 构建重定向 URL
  const redirectUrl = `${cloudServerUrl}${req.originalUrl || req.url}`;
  
  // 记录重定向日志（可选）
  if (boolEnvTrue('REDIRECT_TO_CLOUD_LOG')) {
    console.log(`[redirect-to-cloud] ${req.method} ${req.originalUrl} -> ${redirectUrl}`);
  }
  
  // 执行重定向
  // 301 永久重定向（浏览器会缓存）
  // 302 临时重定向（不缓存，适合测试阶段）
  const statusCode = boolEnvTrue('REDIRECT_TO_CLOUD_PERMANENT') ? 301 : 302;
  res.redirect(statusCode, redirectUrl);
}

module.exports = redirectToCloudMiddleware;
