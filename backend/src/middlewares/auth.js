const jwt = require('jsonwebtoken');
const { authenticationService } = require('../services/authenticationService');
const { getAuthConfig } = require('../config/auth');

function unauthorized(req, res, message) {
  if (req?.apiContractErrors) {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message,
      requestId: req.requestId || ''
    });
  }
  return res.status(401).json({ message });
}

function extractBearerToken(req) {
  const authHeader = String(req?.headers?.authorization || '').trim();
  if (!authHeader.toLowerCase().startsWith('bearer ')) return '';
  return authHeader.slice(7).trim();
}

function canUseQueryToken(req) {
  if (req?.method !== 'GET') return false;
  const tokenInQuery = String(req?.query?.token || '').trim();
  if (!tokenInQuery) return false;

  const fullPath = `${String(req?.baseUrl || '')}${String(req?.path || '')}`;

  // 仅允许在浏览器难以附加 Authorization 头的资源型 GET 接口中使用 query token
  const allowPatterns = [
    /^\/api\/oss\/(tech-solution|fault-cases|kb|motion-data|agent-assets)$/,
    /^\/api\/smart-search\/mknowledge-assets\/[^/]+\/[^/]+$/,
    /^\/api\/jira\/attachment\/proxy$/,
    /^\/api\/error-codes\/export\/xml$/,
    /^\/api\/error-codes\/export\/csv$/,
    /^\/api\/logs\/[^/]+\/download$/,
    /^\/api\/logs\/batch\/download\/[^/]+\/result$/,
    /^\/api\/logs\/entries\/export\/[^/]+\/result$/,
    /^\/api\/motion-data\/files\/[^/]+\/download\/raw$/,
    /^\/api\/motion-data\/files\/[^/]+\/download\/parsed$/,
    /^\/api\/motion-data\/task\/[^/]+\/download$/,
    /^\/api\/motion-data\/[^/]+\/download-csv$/
  ];

  return allowPatterns.some((pattern) => pattern.test(fullPath));
}

module.exports = async function (req, res, next) {
  let token = extractBearerToken(req);
  if (!token && canUseQueryToken(req)) {
    token = String(req.query.token || '').trim();
  }

  if (!token) {
    return unauthorized(req, res, '未登录或token缺失');
  }

  try {
    const jwtSecret = getAuthConfig().jwtSecret;
    if (!jwtSecret) throw new Error('JWT_SECRET is required');
    const decoded = jwt.verify(token, jwtSecret);
    const user = await authenticationService.getAuthenticatedUser(decoded.id);
    const allowedWhilePasswordChangeRequired = [
      '/api/auth/complete-initial-password',
      '/api/auth/me'
    ].includes(`${String(req.baseUrl || '')}${String(req.path || '')}`);
    if (user.mustChangePassword && !allowedWhilePasswordChangeRequired) {
      return res.status(403).json({ code: 'PASSWORD_CHANGE_REQUIRED', message: '请先修改初始密码' });
    }
    req.user = decoded;
    req.user.username = user.username;
    next();
  } catch (err) {
    if (err?.code === 'FORBIDDEN') return res.status(403).json({ code: 'FORBIDDEN', message: '账户不可用' });
    return unauthorized(req, res, 'token无效或已过期');
  }
};
