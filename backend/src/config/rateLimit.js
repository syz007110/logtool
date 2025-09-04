const rateLimit = require('express-rate-limit');

// 从环境变量读取配置，提供默认值
const getRateLimitConfig = () => {
  return {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1分钟
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 10, // 每分钟最多10次请求
    skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS === 'true',
    skipFailedRequests: process.env.RATE_LIMIT_SKIP_FAILED_REQUESTS === 'true',
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: '请求过于频繁，请稍后再试',
      retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000) / 1000)
    },
    handler: (req, res) => {
      res.status(429).json({
        error: '请求过于频繁',
        message: '请稍后再试',
        retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000) / 1000),
        timestamp: new Date().toISOString()
      });
    }
  };
};

// 创建简化的速率限制器（避免IPv6问题）
const createSimpleRateLimiters = () => {
  const baseConfig = getRateLimitConfig();
  
  return {
    // 通用API限制
    general: rateLimit({
      ...baseConfig,
      windowMs: baseConfig.windowMs,
      max: baseConfig.max
    }),
    
    // 批量搜索限制（更严格）
    batchSearch: rateLimit({
      ...baseConfig,
      windowMs: baseConfig.windowMs,
      max: Math.floor(baseConfig.max / 2), // 批量搜索限制更严格
      message: {
        error: '批量搜索请求过于频繁，请稍后再试',
        retryAfter: Math.ceil(baseConfig.windowMs / 1000)
      }
    }),
    
    // 用户特定限制（简化版本）
    userSpecific: rateLimit({
      ...baseConfig,
      windowMs: baseConfig.windowMs,
      max: baseConfig.max,
      keyGenerator: (req) => {
        // 基于用户ID的速率限制，如果用户未登录则使用IP地址
        if (req.user && req.user.id) {
          return `user:${req.user.id}`;
        }
        // 简化处理：直接使用IP地址字符串
        return `ip:${req.ip || req.connection?.remoteAddress || 'unknown'}`;
      },
      message: {
        error: '您的请求过于频繁，请稍后再试',
        retryAfter: Math.ceil(baseConfig.windowMs / 1000)
      }
    }),
    
    // 管理员限制（更宽松）
    admin: rateLimit({
      ...baseConfig,
      windowMs: baseConfig.windowMs,
      max: baseConfig.max * 2, // 管理员限制更宽松
      skip: (req) => {
        // 跳过非管理员用户
        return !req.user || req.user.role_id !== 1;
      }
    })
  };
};

// 创建不同的速率限制器
const createRateLimiters = () => {
  try {
    const baseConfig = getRateLimitConfig();
    
    return {
      // 通用API限制
      general: rateLimit({
        ...baseConfig,
        windowMs: baseConfig.windowMs,
        max: baseConfig.max
      }),
      
      // 批量搜索限制（更严格）
      batchSearch: rateLimit({
        ...baseConfig,
        windowMs: baseConfig.windowMs,
        max: Math.floor(baseConfig.max / 2), // 批量搜索限制更严格
        message: {
          error: '批量搜索请求过于频繁，请稍后再试',
          retryAfter: Math.ceil(baseConfig.windowMs / 1000)
        }
      }),
      
      // 用户特定限制
      userSpecific: rateLimit({
        ...baseConfig,
        windowMs: baseConfig.windowMs,
        max: baseConfig.max,
        keyGenerator: (req) => {
          // 基于用户ID的速率限制，如果用户未登录则使用IP地址
          if (req.user && req.user.id) {
            return `user:${req.user.id}`;
          }
          // 使用 ipKeyGenerator 辅助函数处理IPv6地址，避免代理头部问题
          try {
            return rateLimit.ipKeyGenerator(req);
          } catch (error) {
            // 如果ipKeyGenerator失败，使用简化版本
            const clientIP = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
            return `ip:${clientIP}`;
          }
        },
        message: {
          error: '您的请求过于频繁，请稍后再试',
          retryAfter: Math.ceil(baseConfig.windowMs / 1000)
        }
      }),
      
      // 管理员限制（更宽松）
      admin: rateLimit({
        ...baseConfig,
        windowMs: baseConfig.windowMs,
        max: baseConfig.max * 2, // 管理员限制更宽松
        skip: (req) => {
          // 跳过非管理员用户
          return !req.user || req.user.role_id !== 1;
        }
      })
    };
  } catch (error) {
    console.warn('高级速率限制器创建失败，使用简化版本:', error.message);
    return createSimpleRateLimiters();
  }
};

// 创建禁用的速率限制器（作为最后的备选方案）
const createDisabledRateLimiters = () => {
  // 返回空的中间件函数，不进行任何限制
  const noopMiddleware = (req, res, next) => next();
  
  return {
    general: noopMiddleware,
    batchSearch: noopMiddleware,
    userSpecific: noopMiddleware,
    admin: noopMiddleware
  };
};

// 主函数：尝试创建速率限制器，失败时降级
const createRateLimitersWithFallback = () => {
  try {
    console.log('尝试创建高级速率限制器...');
    return createRateLimiters();
  } catch (error) {
    console.warn('高级速率限制器创建失败，尝试简化版本:', error.message);
    try {
      return createSimpleRateLimiters();
    } catch (simpleError) {
      console.warn('简化速率限制器也失败，禁用速率限制:', simpleError.message);
      return createDisabledRateLimiters();
    }
  }
};

module.exports = {
  createRateLimiters,
  createSimpleRateLimiters,
  createDisabledRateLimiters,
  createRateLimitersWithFallback,
  getRateLimitConfig
};
