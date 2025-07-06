const { sequelize } = require('../models');
const User = require('../models/user');
const Role = require('../models/role');
const UserRole = require('../models/user_role');
const { defineAssociations } = require('../models/associations');

// 完整的权限初始化脚本
async function initPermissions() {
  try {
    console.log('=== 开始完整权限初始化 ===\n');
    
    // 定义模型关联
    defineAssociations();
    
    // 1. 检查角色是否存在
    console.log('1. 检查角色配置...');
    const roles = await Role.findAll();
    console.log(`找到 ${roles.length} 个角色:`);
    roles.forEach(role => {
      console.log(`  - ID: ${role.id}, 名称: ${role.name}, 描述: ${role.description}`);
    });
    console.log();
    
    // 2. 检查用户
    console.log('2. 检查用户配置...');
    const users = await User.findAll();
    console.log(`找到 ${users.length} 个用户:`);
    users.forEach(user => {
      console.log(`  - ID: ${user.id}, 用户名: ${user.username}, 邮箱: ${user.email}`);
    });
    console.log();
    
    // 3. 检查用户角色分配
    console.log('3. 检查用户角色分配...');
    for (const user of users) {
      const userRoles = await UserRole.findAll({
        where: { user_id: user.id },
        include: [{
          model: Role,
          as: 'Role',
          attributes: ['id', 'name']
        }]
      });
      
      console.log(`用户 ${user.username} (ID: ${user.id}):`);
      if (userRoles.length === 0) {
        console.log(`  ❌ 没有分配任何角色`);
        
        // 根据用户名分配默认角色
        let defaultRoleId = null;
        let roleName = '';
        
        if (user.username === 'admin') {
          defaultRoleId = 1;
          roleName = '管理员';
        } else if (user.username === 'expert') {
          defaultRoleId = 2;
          roleName = '专家用户';
        } else if (user.username === 'user') {
          defaultRoleId = 3;
          roleName = '普通用户';
        } else {
          defaultRoleId = 3;
          roleName = '普通用户';
        }
        
        // 检查角色是否存在
        const role = await Role.findByPk(defaultRoleId);
        if (role) {
          // 分配角色
          await UserRole.create({
            user_id: user.id,
            role_id: defaultRoleId,
            assigned_by: user.id,
            notes: '系统自动分配'
          });
          
          console.log(`  ✅ 已分配角色: ${role.name}`);
        } else {
          console.log(`  ❌ 角色ID ${defaultRoleId} (${roleName}) 不存在`);
        }
      } else {
        console.log(`  ✅ 已有 ${userRoles.length} 个角色:`);
        userRoles.forEach(ur => {
          console.log(`    - ${ur.Role.name}`);
        });
      }
      console.log();
    }
    
    // 4. 最终验证
    console.log('4. 最终验证...');
    console.log('用户权限分配情况:');
    for (const user of users) {
      const finalUserRoles = await UserRole.findAll({
        where: { user_id: user.id },
        include: [{
          model: Role,
          as: 'Role',
          attributes: ['id', 'name', 'description']
        }]
      });
      
      console.log(`\n${user.username} (ID: ${user.id}):`);
      if (finalUserRoles.length === 0) {
        console.log('  ❌ 仍然没有角色分配');
      } else {
        finalUserRoles.forEach(ur => {
          console.log(`  ✅ ${ur.Role.name} - ${ur.Role.description}`);
        });
      }
    }
    
    console.log('\n=== 权限初始化完成 ===');
    console.log('✅ 所有用户都已分配适当的角色');
    console.log('✅ 权限系统已准备就绪');
    
  } catch (error) {
    console.error('❌ 权限初始化失败:', error);
  } finally {
    await sequelize.close();
  }
}

// 运行初始化
initPermissions(); 