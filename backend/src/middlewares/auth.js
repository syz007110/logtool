const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  console.log('=== 认证中间件调试信息 ===');
  console.log('请求路径:', req.path);
  console.log('Authorization头:', req.headers['authorization']);
  console.log('JWT_SECRET存在:', !!process.env.JWT_SECRET);
  
  let token = req.headers['authorization']?.split(' ')[1];
  // 允许下载等GET请求通过查询参数携带token，便于直接导航下载
  if (!token && req.method === 'GET' && req.query && req.query.token) {
    console.log('使用query token进行认证');
    token = req.query.token;
  }
  if (!token) {
    console.log('❌ Token缺失');
    return res.status(401).json({ message: '未登录或token缺失' });
  }
  
  console.log('Token:', token.substring(0, 50) + '...');
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Token验证成功');
    req.user = decoded;
    next();
  } catch (err) {
    console.log('❌ Token验证失败:', err.message);
    return res.status(401).json({ message: 'token无效或已过期' });
  }
}; 