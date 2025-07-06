const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  console.log('=== 认证中间件调试信息 ===');
  console.log('请求路径:', req.path);
  console.log('Authorization头:', req.headers['authorization']);
  console.log('JWT_SECRET存在:', !!process.env.JWT_SECRET);
  
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) {
    console.log('❌ Token缺失');
    return res.status(401).json({ message: '未登录或token缺失' });
  }
  
  console.log('Token:', token.substring(0, 50) + '...');
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Token验证成功');
    console.log('解码后的用户信息:', decoded);
    req.user = decoded;
    next();
  } catch (err) {
    console.log('❌ Token验证失败:', err.message);
    return res.status(401).json({ message: 'token无效或已过期' });
  }
}; 