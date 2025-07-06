const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
let adminToken = '';
let testUserId = null;

// 测试数据
const testUser = {
  username: 'test_user_roles',
  email: 'test_roles@example.com',
  password: 'password123'
};

// 测试函数
async function testUserRoles() {
  console.log('🔗 开始用户角色管理测试...\n');

  try {
    // 1. 创建管理员用户并登录
    console.log('1. 创建管理员用户并登录...');
    try {
      await axios.post(`${BASE_URL}/auth/register`, {
        username: 'admin_roles',
        email: 'admin_roles@example.com',
        password: 'admin123',
        roles: [1] // 管理员角色
      });
      console.log('✅ 管理员用户注册成功');
    } catch (error) {
      if (error.response?.status === 409) {
        console.log('⚠️  管理员用户已存在');
      }
    }

    // 登录获取token
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      username: 'admin_roles',
      password: 'admin123'
    });
    adminToken = loginResponse.data.token;
    console.log('✅ 管理员登录成功');
    console.log('');

    // 2. 创建测试用户
    console.log('2. 创建测试用户...');
    try {
      const userResponse = await axios.post(`${BASE_URL}/users`, testUser, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      testUserId = userResponse.data.user.id;
      console.log('✅ 测试用户创建成功，ID:', testUserId);
    } catch (error) {
      console.log('❌ 测试用户创建失败:', error.response?.data?.message);
      return;
    }
    console.log('');

    // 3. 测试角色分配
    console.log('3. 测试角色分配...');
    try {
      const assignResponse = await axios.post(`${BASE_URL}/user-roles/assign`, {
        user_id: testUserId,
        role_id: 2, // 专家用户角色
        notes: '测试角色分配'
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      console.log('✅ 角色分配成功:', assignResponse.data.message);
    } catch (error) {
      console.log('❌ 角色分配失败:', error.response?.data?.message);
    }
    console.log('');

    // 4. 测试获取用户角色
    console.log('4. 测试获取用户角色...');
    try {
      const rolesResponse = await axios.get(`${BASE_URL}/user-roles/user/${testUserId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      console.log('✅ 获取用户角色成功');
      console.log('用户角色:', rolesResponse.data.roles?.map(r => r.role_name).join(', ') || '无角色');
    } catch (error) {
      console.log('❌ 获取用户角色失败:', error.response?.data?.message);
    }
    console.log('');

    console.log('🎉 用户角色管理测试完成！');

  } catch (error) {
    console.log('❌ 测试过程中发生错误:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 提示：请确保后端服务器正在运行 (npm start)');
    }
  }
}

// 运行测试
testUserRoles(); 