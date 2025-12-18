const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { sequelize } = require('../models');
const ErrorCode = require('../models/error_code');

async function importErrorCodesFromCSV(csvFilePath) {
  // 移除 sequelize.sync()，因为表结构应该已经通过SQL脚本创建
  // 直接检查数据库连接和表是否存在
  try {
    await sequelize.authenticate();
    console.log('✅ 数据库连接成功，开始导入数据...');
    
    // 检查表是否存在
    const tableExists = await sequelize.query(
      "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'error_codes'",
      { type: sequelize.QueryTypes.SELECT }
    );
    
    if (tableExists[0].count === 0) {
      throw new Error('error_codes 表不存在，请先运行 init_database.sql 创建数据库结构');
    }
    
    console.log('✅ error_codes 表存在，可以开始导入数据');
  } catch (error) {
    console.error('❌ 数据库检查失败:', error.message);
    throw error;
  }
  
  const errorCodes = [];

  return new Promise((resolve, reject) => {
    fs.createReadStream(csvFilePath, { encoding: 'utf8' })
      .pipe(csv())
      .on('data', (row) => {
        errorCodes.push(row);
      })
      .on('end', async () => {
        try {
          const booleanFields = [
            'is_axis_error', 'is_arm_error', 'for_expert', 'for_novice', 'related_log'
          ];

          let successCount = 0;
          for (const row of errorCodes) {
            if (!row.code) {
              console.warn('⚠️ 跳过无 code 字段的行:', row);
              continue;
            }
            // 转换布尔字段
            for (const key of booleanFields) {
              if (row[key] !== undefined) {
                if (typeof row[key] === 'string') {
                  if (row[key].toUpperCase() === 'TRUE') row[key] = 1;
                  else if (row[key].toUpperCase() === 'FALSE') row[key] = 0;
                  else if (row[key].trim() === '') row[key] = 0; // 空字符串转为0
                } else if (row[key] === null) {
                  row[key] = 0;
                }
              }
            }
            // 直接插入，不做去重
            await ErrorCode.create(row);
            successCount++;
          }
          console.log(`✅ 成功导入 ${successCount} 条故障码`);
          resolve();
        } catch (err) {
          console.error('❌ 导入失败:', err);
          reject(err);
        } finally {
          await sequelize.close();
        }
      })
      .on('error', (err) => {
        console.error('❌ 读取CSV文件失败:', err);
        reject(err);
      });
  });
}

if (require.main === module) {
  const csvFilePath = process.argv[2];
  if (!csvFilePath) {
    console.error('请提供CSV文件路径，如: node importErrorCodesFromCSV.js ./error_codes.csv');
    process.exit(1);
  }
  importErrorCodesFromCSV(path.resolve(csvFilePath));
}

module.exports = importErrorCodesFromCSV;
