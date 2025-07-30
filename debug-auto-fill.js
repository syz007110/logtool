const axios = require('axios');

// 配置
const BASE_URL = 'http://localhost:3000/api';

// 测试函数
async function testAutoFillAPI() {
  console.log('开始测试自动填充API...\n');

  // 首先测试登录获取token
  console.log('1. 测试登录...');
  try {
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      username: 'admin',
      password: 'admin123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ 登录成功，获取到token');
    
    // 设置请求头
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 测试自动填充设备编号
    console.log('\n2. 测试自动填充设备编号...');
    try {
      const deviceIdResponse = await axios.get(`${BASE_URL}/logs/auto-fill/device-id`, {
        params: { key: '00-01-05-77-6a-09' },
        headers
      });
      console.log('✅ 自动填充设备编号成功:', deviceIdResponse.data);
    } catch (error) {
      console.log('❌ 自动填充设备编号失败:');
      console.log('   状态码:', error.response?.status);
      console.log('   错误信息:', error.response?.data || error.message);
      console.log('   请求URL:', error.config?.url);
    }

    // 测试自动填充密钥
    console.log('\n3. 测试自动填充密钥...');
    try {
      const keyResponse = await axios.get(`${BASE_URL}/logs/auto-fill/key`, {
        params: { device_id: '4371-01' },
        headers
      });
      console.log('✅ 自动填充密钥成功:', keyResponse.data);
    } catch (error) {
      console.log('❌ 自动填充密钥失败:');
      console.log('   状态码:', error.response?.status);
      console.log('   错误信息:', error.response?.data || error.message);
      console.log('   请求URL:', error.config?.url);
    }

    // 测试日志列表（验证基本路由是否工作）
    console.log('\n4. 测试日志列表...');
    try {
      const logsResponse = await axios.get(`${BASE_URL}/logs`, {
        headers
      });
      console.log('✅ 日志列表成功:', logsResponse.data);
    } catch (error) {
      console.log('❌ 日志列表失败:');
      console.log('   状态码:', error.response?.status);
      console.log('   错误信息:', error.response?.data || error.message);
    }

  } catch (loginError) {
    console.log('❌ 登录失败:', loginError.response?.data || loginError.message);
    console.log('请确保后端服务正在运行，并且有可用的测试账户');
  }
}

// 运行测试
testAutoFillAPI().catch(console.error); 