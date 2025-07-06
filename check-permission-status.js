const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

// 测试用户数据
const testUsers = {
  admin: { username: 'admin', password: 'admin123' },
  expert: { username: 'expert', password: 'expert123' },
  user: { username: 'user', password: 'user123' }
};

// 获取访问令牌
async function getToken(username, password) {
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      username,
      password
    });
    return response.data.token;
  } catch (error) {
    return null;
  }
}

// 检查权限系统状态
async function checkPermissionStatus() {
  console.log('🔐 权限系统状态检查\n');
  
  const status = {
    authentication: false,
    adminPermissions: false,
    expertPermissions: false,
    userPermissions: false,
    roleAssignment: false
  };
  
  // 1. 检查认证系统
  console.log('1. 检查认证系统...');
  const adminToken = await getToken(testUsers.admin.username, testUsers.admin.password);
  if (adminToken) {
    console.log('   ✅ 管理员登录成功');
    status.authentication = true;
  } else {
    console.log('   ❌ 管理员登录失败');
    return status;
  }
  
  // 2. 检查管理员权限
  console.log('\n2. 检查管理员权限...');
  try {
    const response = await axios.get(`${BASE_URL}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log(`   ✅ 用户管理权限正常 (${response.data.users.length} 个用户)`);
    status.adminPermissions = true;
  } catch (error) {
    console.log('   ❌ 用户管理权限异常');
  }
  
  // 3. 检查专家用户权限
  console.log('\n3. 检查专家用户权限...');
  const expertToken = await getToken(testUsers.expert.username, testUsers.expert.password);
  if (expertToken) {
    try {
      // 测试故障码查询权限
      const response = await axios.get(`${BASE_URL}/error-codes`, {
        headers: { Authorization: `Bearer ${expertToken}` }
      });
      console.log('   ✅ 故障码查询权限正常');
      
      // 测试用户管理权限（应该被拒绝）
      try {
        await axios.get(`${BASE_URL}/users`, {
          headers: { Authorization: `Bearer ${expertToken}` }
        });
        console.log('   ❌ 用户管理权限控制失效');
      } catch (error) {
        if (error.response?.status === 403) {
          console.log('   ✅ 用户管理权限控制正常');
          status.expertPermissions = true;
        }
      }
    } catch (error) {
      console.log('   ❌ 专家用户权限异常');
    }
  } else {
    console.log('   ❌ 专家用户登录失败');
  }
  
  // 4. 检查普通用户权限
  console.log('\n4. 检查普通用户权限...');
  const userToken = await getToken(testUsers.user.username, testUsers.user.password);
  if (userToken) {
    try {
      // 测试故障码查询权限
      const response = await axios.get(`${BASE_URL}/error-codes`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      console.log('   ✅ 故障码查询权限正常');
      
      // 测试用户管理权限（应该被拒绝）
      try {
        await axios.get(`${BASE_URL}/users`, {
          headers: { Authorization: `Bearer ${userToken}` }
        });
        console.log('   ❌ 用户管理权限控制失效');
      } catch (error) {
        if (error.response?.status === 403) {
          console.log('   ✅ 用户管理权限控制正常');
          status.userPermissions = true;
        }
      }
    } catch (error) {
      console.log('   ❌ 普通用户权限异常');
    }
  } else {
    console.log('   ❌ 普通用户登录失败');
  }
  
  // 5. 检查角色分配
  console.log('\n5. 检查角色分配...');
  try {
    const response = await axios.get(`${BASE_URL}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    
    let allUsersHaveRoles = true;
    for (const user of response.data.users) {
      try {
        const rolesResponse = await axios.get(`${BASE_URL}/users/${user.id}/roles`, {
          headers: { Authorization: `Bearer ${adminToken}` }
        });
        
        if (rolesResponse.data.roles.length === 0) {
          console.log(`   ❌ 用户 ${user.username} 没有分配角色`);
          allUsersHaveRoles = false;
        }
      } catch (error) {
        console.log(`   ❌ 查询用户 ${user.username} 角色失败`);
        allUsersHaveRoles = false;
      }
    }
    
    if (allUsersHaveRoles) {
      console.log('   ✅ 所有用户都已分配角色');
      status.roleAssignment = true;
    }
  } catch (error) {
    console.log('   ❌ 角色分配检查失败');
  }
  
  return status;
}

// 生成状态报告
function generateStatusReport(status) {
  console.log('\n📊 权限系统状态报告');
  console.log('='.repeat(40));
  
  const checks = [
    { name: '认证系统', status: status.authentication },
    { name: '管理员权限', status: status.adminPermissions },
    { name: '专家用户权限', status: status.expertPermissions },
    { name: '普通用户权限', status: status.userPermissions },
    { name: '角色分配', status: status.roleAssignment }
  ];
  
  let passedChecks = 0;
  checks.forEach(check => {
    const icon = check.status ? '✅' : '❌';
    console.log(`${icon} ${check.name}: ${check.status ? '正常' : '异常'}`);
    if (check.status) passedChecks++;
  });
  
  console.log('\n' + '='.repeat(40));
  console.log(`总体状态: ${passedChecks}/${checks.length} 项检查通过`);
  
  if (passedChecks === checks.length) {
    console.log('🎉 权限系统完全正常！');
  } else {
    console.log('⚠️ 权限系统需要检查');
  }
}

// 主函数
async function main() {
  try {
    const status = await checkPermissionStatus();
    generateStatusReport(status);
  } catch (error) {
    console.error('检查过程中发生错误:', error.message);
  }
}

// 运行检查
main(); 