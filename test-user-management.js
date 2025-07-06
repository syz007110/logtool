const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
let authToken = '';
let testUserId = null;

// 测试数据
const testUsers = [
  {
    username: 'testuser1',
    email: 'test1@example.com',
    password: 'password123'
  },
  {
    username: 'testuser2',
    email: 'test2@example.com',
    password: 'password456'
  }
];

// 测试函数
async function testUserManagement() {
  console.log('🔐 开始用户管理功能测试...\n');

  try {
    // 1. 测试用户注册
    console.log('1. 测试用户注册...');
    for (const user of testUsers) {
      try {
        const response = await axios.post(`${BASE_URL}/auth/register`, user);
        console.log(`✅ 用户 ${user.username} 注册成功:`, response.data.message);
      } catch (error) {
        if (error.response?.status === 409) {
          console.log(`⚠️  用户 ${user.username} 已存在`);
        } else {
          console.log(`❌ 用户 ${user.username} 注册失败:`, error.response?.data?.message);
        }
      }
    }
    console.log('');

    // 2. 测试用户登录
    console.log('2. 测试用户登录...');
    try {
      const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
        username: testUsers[0].username,
        password: testUsers[0].password
      });
      authToken = loginResponse.data.token;
      console.log('✅ 用户登录成功，获取到JWT token');
    } catch (error) {
      console.log('❌ 用户登录失败:', error.response?.data?.message);
      return;
    }
    console.log('');

    // 3. 测试获取用户列表
    console.log('3. 测试获取用户列表...');
    try {
      const usersResponse = await axios.get(`${BASE_URL}/users`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      console.log(`✅ 获取用户列表成功，共 ${usersResponse.data.users?.length || 0} 个用户`);
      if (usersResponse.data.users?.length > 0) {
        testUserId = usersResponse.data.users[0].id;
      }
    } catch (error) {
      console.log('❌ 获取用户列表失败:', error.response?.data?.message);
    }
    console.log('');

    // 4. 测试创建新用户（管理员功能）
    console.log('4. 测试创建新用户...');
    try {
      const newUser = {
        username: 'admin_created_user',
        password: 'adminpass123',
        email: 'admin_created@example.com',
        roles: [1] // 假设角色ID 1存在
      };
      const createResponse = await axios.post(`${BASE_URL}/users`, newUser, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      console.log('✅ 创建新用户成功:', createResponse.data.message);
    } catch (error) {
      console.log('❌ 创建新用户失败:', error.response?.data?.message);
    }
    console.log('');

    // 5. 测试更新用户信息
    if (testUserId) {
      console.log('5. 测试更新用户信息...');
      try {
        const updateData = {
          email: 'updated_email@example.com',
          is_active: false,
          roles: [1, 2] // 重新分配角色
        };
        const updateResponse = await axios.put(`${BASE_URL}/users/${testUserId}`, updateData, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        console.log('✅ 更新用户信息成功:', updateResponse.data.message);
      } catch (error) {
        console.log('❌ 更新用户信息失败:', error.response?.data?.message);
      }
      console.log('');
    }

    // 6. 测试查询用户角色
    if (testUserId) {
      console.log('6. 测试查询用户角色...');
      try {
        const rolesResponse = await axios.get(`${BASE_URL}/users/${testUserId}/roles`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        console.log(`✅ 查询用户角色成功，用户有 ${rolesResponse.data.roles?.length || 0} 个角色`);
      } catch (error) {
        console.log('❌ 查询用户角色失败:', error.response?.data?.message);
      }
      console.log('');
    }

    // 7. 测试错误情况
    console.log('7. 测试错误情况...');
    
    // 7.1 测试重复用户名注册
    try {
      await axios.post(`${BASE_URL}/auth/register`, testUsers[0]);
      console.log('❌ 重复用户名注册应该失败');
    } catch (error) {
      if (error.response?.status === 409) {
        console.log('✅ 重复用户名注册正确被拒绝');
      }
    }

    // 7.2 测试错误密码登录
    try {
      await axios.post(`${BASE_URL}/auth/login`, {
        username: testUsers[0].username,
        password: 'wrongpassword'
      });
      console.log('❌ 错误密码登录应该失败');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ 错误密码登录正确被拒绝');
      }
    }

    // 7.3 测试无认证访问
    try {
      await axios.get(`${BASE_URL}/users`);
      console.log('❌ 无认证访问应该失败');
    } catch (error) {
      if (error.response?.status === 401) {
        console.log('✅ 无认证访问正确被拒绝');
      }
    }

    console.log('\n🎉 用户管理功能测试完成！');

  } catch (error) {
    console.log('❌ 测试过程中发生错误:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 提示：请确保后端服务器正在运行 (npm start)');
    }
  }
}

// 运行测试
testUserManagement(); 