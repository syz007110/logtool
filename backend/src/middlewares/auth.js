const jwt = require('jsonwebtoken');

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
    /^\/api\/jira\/attachment\/proxy$/
  ];

  return allowPatterns.some((pattern) => pattern.test(fullPath));
}

module.exports = function (req, res, next) {
  let token = extractBearerToken(req);
  if (!token && canUseQueryToken(req)) {
    token = String(req.query.token || '').trim();
  }

  if (!token) {
    return res.status(401).json({ message: '未登录或token缺失' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'token无效或已过期' });
  }
};
