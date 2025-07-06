const { sequelize } = require('./backend/src/models');
const User = require('./backend/src/models/user');
const UserRole = require('./backend/src/models/user_role');
const Role = require('./backend/src/models/role');

async function checkUserRoles() {
  try {
    console.log('🔍 检查用户角色分配情况...\n');

    // 1. 查找 admin_roles 用户
    const adminUser = await User.findOne({
      where: { username: 'admin_roles' }
    });

    if (!adminUser) {
      console.log('❌ 找不到 admin_roles 用户');
      return;
    }

    console.log(`✅ 找到用户: ${adminUser.username} (ID: ${adminUser.id})`);

    // 2. 查找该用户的角色分配
    const userRoles = await UserRole.findAll({
      where: { user_id: adminUser.id },
      include: [{
        model: Role,
        attributes: ['id', 'name']
      }]
    });

    console.log(`\n📋 用户角色分配情况:`);
    console.log(`总共有 ${userRoles.length} 个角色分配`);

    if (userRoles.length === 0) {
      console.log('❌ 用户没有任何角色分配！');
    } else {
      userRoles.forEach((ur, index) => {
        console.log(`${index + 1}. UserRole ID: ${ur.id}`);
        console.log(`   - user_id: ${ur.user_id}`);
        console.log(`   - role_id: ${ur.role_id}`);
        console.log(`   - Role: ${ur.Role ? `${ur.Role.name} (ID: ${ur.Role.id})` : 'NULL'}`);
        console.log('');
      });
    }

    // 3. 检查所有角色
    console.log('📋 所有可用角色:');
    const allRoles = await Role.findAll();
    allRoles.forEach(role => {
      console.log(`- ${role.name} (ID: ${role.id})`);
    });

  } catch (error) {
    console.error('❌ 检查过程中发生错误:', error.message);
  } finally {
    await sequelize.close();
  }
}

checkUserRoles(); 