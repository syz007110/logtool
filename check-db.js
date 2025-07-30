const { sequelize } = require('./backend/src/models');
const User = require('./backend/src/models/user');
const Role = require('./backend/src/models/role');
const UserRole = require('./backend/src/models/user_role');

async function checkDatabase() {
  try {
    console.log('检查数据库连接...');
    await sequelize.authenticate();
    console.log('✅ 数据库连接成功\n');
    
    // 检查角色表
    console.log('1. 检查角色表...');
    const roles = await Role.findAll();
    console.log(`   角色数量: ${roles.length}`);
    roles.forEach(role => {
      console.log(`   - ID: ${role.id}, 名称: ${role.name}`);
    });
    
    // 检查用户表
    console.log('\n2. 检查用户表...');
    const users = await User.findAll();
    console.log(`   用户数量: ${users.length}`);
    users.forEach(user => {
      console.log(`   - ID: ${user.id}, 用户名: ${user.username}, 邮箱: ${user.email}`);
    });
    
    // 检查用户角色关联表
    console.log('\n3. 检查用户角色关联表...');
    const userRoles = await UserRole.findAll({
      include: [
        { model: User, as: 'User' },
        { model: Role, as: 'Role' }
      ]
    });
    console.log(`   用户角色关联数量: ${userRoles.length}`);
    userRoles.forEach(ur => {
      console.log(`   - 用户: ${ur.User?.username} (ID: ${ur.user_id}), 角色: ${ur.Role?.name} (ID: ${ur.role_id})`);
    });
    
    // 检查是否有admin用户
    console.log('\n4. 检查admin用户...');
    const adminUser = await User.findOne({ where: { username: 'admin' } });
    if (adminUser) {
      console.log('   ✅ 找到admin用户');
      const adminUserRole = await UserRole.findOne({
        where: { user_id: adminUser.id },
        include: [{ model: Role, as: 'Role' }]
      });
      if (adminUserRole) {
        console.log(`   - 角色: ${adminUserRole.Role?.name} (ID: ${adminUserRole.Role?.id})`);
      } else {
        console.log('   ❌ admin用户没有分配角色');
      }
    } else {
      console.log('   ❌ 未找到admin用户');
    }
    
  } catch (error) {
    console.error('❌ 数据库检查失败:', error.message);
  } finally {
    await sequelize.close();
  }
}

checkDatabase(); 