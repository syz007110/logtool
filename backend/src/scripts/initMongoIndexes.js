/**
 * MongoDB 索引初始化脚本
 * 用于手动创建故障案例相关的索引（生产环境推荐）
 * 
 * 使用方法：
 *   cd backend
 *   npm run init-mongo-indexes
 * 
 * 或者在 package.json 中添加脚本：
 *   "init-mongo-indexes": "node src/scripts/initMongoIndexes.js"
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { connectMongo } = require('../config/mongodb');
const FaultCase = require('../mongoModels/FaultCase');
const FaultCaseI18n = require('../mongoModels/FaultCaseI18n');

async function initMongoIndexes() {
  console.log('========================================');
  console.log('MongoDB 索引初始化');
  console.log('========================================\n');

  try {
    // 连接 MongoDB
    const conn = await connectMongo();
    if (!conn) {
      console.error('❌ MongoDB 连接失败，请检查配置');
      process.exit(1);
    }
    console.log('✅ MongoDB 连接成功\n');

    // 使用 Mongoose 的 createIndexes() 方法创建所有索引
    // 这会根据 Schema 定义创建所有索引
    console.log('📋 创建 fault_cases 集合索引...');
    await FaultCase.createIndexes();
    console.log('✅ fault_cases 索引创建完成\n');

    console.log('📋 创建 fault_case_i18n 集合索引...');
    await FaultCaseI18n.createIndexes();
    console.log('✅ fault_case_i18n 索引创建完成\n');

    // 显示创建的索引
    console.log('📊 索引列表：');
    console.log('\n[fault_cases]');
    const faultCaseIndexes = await FaultCase.collection.getIndexes();
    Object.keys(faultCaseIndexes).forEach(name => {
      console.log(`  - ${name}`);
    });

    console.log('\n[fault_case_i18n]');
    const i18nIndexes = await FaultCaseI18n.collection.getIndexes();
    Object.keys(i18nIndexes).forEach(name => {
      console.log(`  - ${name}`);
    });

    console.log('\n========================================');
    console.log('✅ MongoDB 索引初始化完成！');
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ 索引创建失败:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// 运行脚本
if (require.main === module) {
  initMongoIndexes();
}

module.exports = { initMongoIndexes };

