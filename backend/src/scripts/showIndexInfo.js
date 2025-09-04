const dotenv = require('dotenv');
const path = require('path');

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

/**
 * 数据库索引信息显示脚本
 * 所有索引现在都在SQL初始化脚本中创建
 * 此脚本用于显示和分析现有索引
 */
async function showIndexInfo() {
  console.log('========================================');
  console.log('数据库索引信息显示');
  console.log('========================================');
  console.log('注意：所有索引现在都在SQL初始化脚本中创建');
  console.log('如需创建索引，请运行 init_database.sql');
  console.log('========================================\n');
  
  try {
    // 显示 log_entries 表索引
    const logEntriesIndexes = await sequelize.query(`
      SHOW INDEX FROM log_entries
    `, { type: QueryTypes.SHOWINDEX });
    
    console.log('📋 log_entries 表索引:');
    if (logEntriesIndexes.length > 0) {
      logEntriesIndexes.forEach(index => {
        console.log(`  - ${index.Key_name}: ${index.Column_name} (基数: ${index.Cardinality})`);
      });
    } else {
      console.log('  (暂无索引)');
    }
    
    // 显示 logs 表索引
    const logsIndexes = await sequelize.query(`
      SHOW INDEX FROM logs
    `, { type: QueryTypes.SHOWINDEX });
    
    console.log('\n📋 logs 表索引:');
    if (logsIndexes.length > 0) {
      logsIndexes.forEach(index => {
        console.log(`  - ${index.Key_name}: ${index.Column_name} (基数: ${index.Cardinality})`);
      });
    } else {
      console.log('  (暂无索引)');
    }
    
    // 显示 error_codes 表索引
    const errorCodesIndexes = await sequelize.query(`
      SHOW INDEX FROM error_codes
    `, { type: QueryTypes.SHOWINDEX });
    
    console.log('\n📋 error_codes 表索引:');
    if (errorCodesIndexes.length > 0) {
      errorCodesIndexes.forEach(index => {
        console.log(`  - ${index.Key_name}: ${index.Column_name} (基数: ${index.Cardinality})`);
      });
    } else {
      console.log('  (暂无索引)');
    }
    
    // 显示 devices 表索引
    const devicesIndexes = await sequelize.query(`
      SHOW INDEX FROM devices
    `, { type: QueryTypes.SHOWINDEX });
    
    console.log('\n📋 devices 表索引:');
    if (devicesIndexes.length > 0) {
      devicesIndexes.forEach(index => {
        console.log(`  - ${index.Key_name}: ${index.Column_name} (基数: ${index.Cardinality})`);
      });
    } else {
      console.log('  (暂无索引)');
    }
    
  } catch (error) {
    console.error('❌ 获取索引信息失败:', error);
  }
}

/**
 * 分析查询性能
 */
async function analyzeQueryPerformance() {
  console.log('\n========================================');
  console.log('查询性能分析');
  console.log('========================================');
  
  try {
    // 分析表统计信息
    await sequelize.query(`
      ANALYZE TABLE log_entries, logs, error_codes, devices
    `, { type: QueryTypes.RAW });
    
    console.log('✅ 表统计信息已更新');
    
    // 显示表大小信息
    const tableSizes = await sequelize.query(`
      SELECT 
        table_name,
        ROUND(((data_length + index_length) / 1024 / 1024), 2) AS 'Size (MB)',
        table_rows,
        ROUND((index_length / 1024 / 1024), 2) AS 'Index Size (MB)'
      FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name IN ('log_entries', 'logs', 'error_codes', 'devices')
      ORDER BY table_name
    `, { type: QueryTypes.SELECT });
    
    console.log('\n📊 表大小信息:');
    tableSizes.forEach(table => {
      console.log(`  - ${table.table_name}: ${table['Size (MB)']} MB (数据: ${table['Size (MB)'] - table['Index Size (MB)']} MB, 索引: ${table['Index Size (MB)']} MB), 行数: ${table.table_rows}`);
    });
    
  } catch (error) {
    console.error('❌ 分析查询性能失败:', error);
  }
}

/**
 * 检查索引状态
 */
async function checkIndexStatus() {
  console.log('\n========================================');
  console.log('索引状态检查');
  console.log('========================================');
  
  try {
    // 检查是否有重复索引
    const duplicateIndexes = await sequelize.query(`
      SELECT 
        table_name,
        index_name,
        GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns,
        COUNT(*) as column_count
      FROM information_schema.statistics 
      WHERE table_schema = DATABASE() 
      AND table_name IN ('log_entries', 'logs', 'error_codes', 'devices')
      GROUP BY table_name, index_name
      HAVING COUNT(*) > 1
    `, { type: QueryTypes.SELECT });
    
    if (duplicateIndexes.length > 0) {
      console.log('⚠️  发现重复索引:');
      duplicateIndexes.forEach(index => {
        console.log(`  - ${index.table_name}.${index.index_name}: ${index.columns}`);
      });
    } else {
      console.log('✅ 未发现重复索引');
    }
    
    // 检查索引使用情况
    console.log('\n📈 索引使用建议:');
    console.log('  - 如果查询较慢，请检查是否缺少必要的索引');
    console.log('  - 如果索引过多，请考虑删除未使用的索引');
    console.log('  - 复合索引的顺序很重要，最常用的字段应该放在前面');
    
  } catch (error) {
    console.error('❌ 检查索引状态失败:', error);
  }
}

// 主函数
async function main() {
  try {
    await showIndexInfo();
    await analyzeQueryPerformance();
    await checkIndexStatus();
    
    console.log('\n========================================');
    console.log('索引信息显示完成！');
    console.log('========================================');
    process.exit(0);
  } catch (error) {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = {
  showIndexInfo,
  analyzeQueryPerformance,
  checkIndexStatus
};
