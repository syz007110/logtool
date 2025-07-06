const { sequelize } = require('../models');
const Role = require('../models/role');
const { ROLES } = require('../config/roles');

async function initRoles() {
  try {
    // 同步数据库
    await sequelize.sync();
    console.log('数据库同步完成');

    // 创建角色
    for (const roleKey of Object.keys(ROLES)) {
      const roleConfig = ROLES[roleKey];
      
      // 检查角色是否已存在
      const existingRole = await Role.findByPk(roleConfig.id);
      
      if (existingRole) {
        console.log(`角色 "${roleConfig.name}" 已存在，跳过创建`);
      } else {
        await Role.create({
          id: roleConfig.id,
          name: roleConfig.name,
          description: roleConfig.description
        });
        console.log(`✅ 角色 "${roleConfig.name}" 创建成功`);
      }
    }

    // 显示所有角色
    const allRoles = await Role.findAll();
    console.log('\n📋 当前所有角色:');
    allRoles.forEach(role => {
      console.log(`  ID: ${role.id}, 名称: ${role.name}, 描述: ${role.description}`);
    });

    console.log('\n🎉 角色初始化完成！');
    
  } catch (error) {
    console.error('❌ 角色初始化失败:', error);
  } finally {
    await sequelize.close();
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  initRoles();
}

module.exports = initRoles; 