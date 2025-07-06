const axios = require('axios');

// 配置基础URL
const BASE_URL = 'http://localhost:3000/api';

// 测试数据
const testUser = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'password123'
};

const testErrorCode = {
  code: 'E001',
  description_zh: '测试故障码',
  description_en: 'Test Error Code',
  severity: 'HIGH',
  category: 'SYSTEM'
};

// 存储JWT token
let authToken = '';

// 测试函数
async function testAPI() {
  console.log('🚀 开始测试后端API...\n');

  try {
    // 1. 测试服务器是否运行
    console.log('1. 测试服务器连接...');
    const healthCheck = await axios.get('http://localhost:3000/');
    console.log('✅ 服务器运行正常:', healthCheck.data);
    console.log('');

    // 2. 测试用户注册
    console.log('2. 测试用户注册...');
    try {
      const registerResponse = await axios.post(`${BASE_URL}/auth/register`, testUser);
      console.log('✅ 用户注册成功:', registerResponse.data);
    } catch (error) {
      if (error.response?.status === 409) {
        console.log('⚠️  用户已存在，继续测试登录...');
      } else {
        console.log('❌ 用户注册失败:', error.response?.data || error.message);
      }
    }
    console.log('');

    // 3. 测试用户登录
    console.log('3. 测试用户登录...');
    try {
      const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
        username: testUser.username,
        password: testUser.password
      });
      authToken = loginResponse.data.token;
      console.log('✅ 用户登录成功，获取到JWT token');
    } catch (error) {
      console.log('❌ 用户登录失败:', error.response?.data || error.message);
      return;
    }
    console.log('');

    // 4. 测试故障码创建
    console.log('4. 测试故障码创建...');
    try {
      const errorCodeResponse = await axios.post(`${BASE_URL}/error-codes`, testErrorCode, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      console.log('✅ 故障码创建成功:', errorCodeResponse.data);
    } catch (error) {
      console.log('❌ 故障码创建失败:', error.response?.data || error.message);
    }
    console.log('');

    // 5. 测试故障码查询
    console.log('5. 测试故障码查询...');
    try {
      const listResponse = await axios.get(`${BASE_URL}/error-codes`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      console.log('✅ 故障码查询成功，共找到', listResponse.data.error_codes?.length || 0, '条记录');
    } catch (error) {
      console.log('❌ 故障码查询失败:', error.response?.data || error.message);
    }
    console.log('');

    // 6. 测试多语言配置
    console.log('6. 测试多语言配置...');
    try {
      const i18nResponse = await axios.get(`${BASE_URL}/i18n`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      console.log('✅ 多语言配置查询成功');
    } catch (error) {
      console.log('❌ 多语言配置查询失败:', error.response?.data || error.message);
    }
    console.log('');

    // 7. 测试用户列表
    console.log('7. 测试用户列表...');
    try {
      const usersResponse = await axios.get(`${BASE_URL}/users`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      console.log('✅ 用户列表查询成功，共找到', usersResponse.data.users?.length || 0, '个用户');
    } catch (error) {
      console.log('❌ 用户列表查询失败:', error.response?.data || error.message);
    }
    console.log('');

    console.log('🎉 API测试完成！');

  } catch (error) {
    console.log('❌ 测试过程中发生错误:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 提示：请确保后端服务器正在运行 (npm start)');
    }
  }
}

// 运行测试
testAPI(); 