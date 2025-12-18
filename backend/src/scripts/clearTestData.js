const { sequelize, Sequelize } = require('../models');
const User = require('../models/user');
const UserRole = require('../models/user_role');
const Role = require('../models/role');
const ErrorCode = require('../models/error_code');
const Log = require('../models/log');
const I18nText = require('../models/i18n_text');

async function clearTestData() {
  try {
    console.log('🧹 开始清理测试数据...\n');

    // 1. 清理用户角色关联
    console.log('1. 清理用户角色关联...');
    const testUsers = await User.findAll({
      where: {
        [Sequelize.Op.or]: [
          { username: { [Sequelize.Op.like]: '%test%' } },
          { email: { [Sequelize.Op.like]: '%test%' } },
          { username: { [Sequelize.Op.like]: '%admin%' } },
          { email: { [Sequelize.Op.like]: '%admin%' } }
        ]
      }
    });
    const testUserIds = testUsers.map(u => u.id);
    await UserRole.destroy({
      where: {
        user_id: { [Sequelize.Op.in]: testUserIds }
      }
    });
    console.log('✅ 用户角色关联清理完成');

    // 2. 清理测试用户
    console.log('2. 清理测试用户...');
    const deletedUsers = await User.destroy({
      where: {
        [Sequelize.Op.or]: [
          { username: { [Sequelize.Op.like]: '%test%' } },
          { email: { [Sequelize.Op.like]: '%test%' } },
          { username: { [Sequelize.Op.like]: '%admin%' } },
          { email: { [Sequelize.Op.like]: '%admin%' } }
        ]
      }
    });
    console.log(`✅ 删除了 ${deletedUsers} 个测试用户`);

    // 3. 清理测试故障码
    console.log('3. 清理测试故障码...');
    const deletedErrorCodes = await ErrorCode.destroy({
      where: {
        [Sequelize.Op.or]: [
          { code: { [Sequelize.Op.like]: '%TEST%' } },
          { short_message: { [Sequelize.Op.like]: '%测试%' } },
          { short_message: { [Sequelize.Op.like]: '%test%' } },
          { detail: { [Sequelize.Op.like]: '%测试%' } },
          { detail: { [Sequelize.Op.like]: '%test%' } }
        ]
      }
    });
    console.log(`✅ 删除了 ${deletedErrorCodes} 个测试故障码`);

    // 4. 清理测试日志
    console.log('4. 清理测试日志...');
    const deletedLogs = await Log.destroy({
      where: {
        [Sequelize.Op.or]: [
          { filename: { [Sequelize.Op.like]: '%test%' } },
          { filename: { [Sequelize.Op.like]: '%TEST%' } }
        ]
      }
    });
    console.log(`✅ 删除了 ${deletedLogs} 个测试日志`);

    // 5. 清理测试多语言文本
    console.log('5. 清理测试多语言文本...');
    const deletedI18n = await I18nText.destroy({
      where: {
        [Sequelize.Op.or]: [
          { key_name: { [Sequelize.Op.like]: '%test%' } },
          { key_name: { [Sequelize.Op.like]: '%TEST%' } },
          { text: { [Sequelize.Op.like]: '%测试%' } },
          { text: { [Sequelize.Op.like]: '%test%' } }
        ]
      }
    });
    console.log(`✅ 删除了 ${deletedI18n} 个测试多语言文本`);

    console.log('\n🎉 测试数据清理完成！');
    console.log('💡 提示：如需重新初始化角色，请运行 npm run init-roles');

  } catch (error) {
    console.error('❌ 清理测试数据时发生错误:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// 运行清理
clearTestData(); 