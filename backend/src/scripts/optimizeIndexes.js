const dotenv = require('dotenv');
const path = require('path');

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { sequelize } = require('../models/index');
const { QueryTypes } = require('sequelize');

async function optimizeIndexes() {
  try {
    console.log('开始优化数据库索引...');
    
    // 为 log_entries 表添加复合索引
    const indexes = [
      // 主要查询索引：log_id + timestamp（用于分页和排序）
      {
        name: 'idx_log_entries_log_id_timestamp',
        sql: 'CREATE INDEX idx_log_entries_log_id_timestamp ON log_entries (log_id, timestamp)'
      },
      // 时间范围查询索引
      {
        name: 'idx_log_entries_timestamp',
        sql: 'CREATE INDEX idx_log_entries_timestamp ON log_entries (timestamp)'
      },
      // 故障码查询索引
      {
        name: 'idx_log_entries_error_code',
        sql: 'CREATE INDEX idx_log_entries_error_code ON log_entries (error_code)'
      },
      // 释义搜索索引（用于LIKE查询）
      {
        name: 'idx_log_entries_explanation',
        sql: 'CREATE INDEX idx_log_entries_explanation ON log_entries (explanation(255))'
      },
      // 参数查询索引
      {
        name: 'idx_log_entries_params',
        sql: 'CREATE INDEX idx_log_entries_params ON log_entries (param1, param2, param3, param4)'
      },
      // 复合查询索引：log_id + error_code（用于firstof查询）
      {
        name: 'idx_log_entries_log_id_error_code',
        sql: 'CREATE INDEX idx_log_entries_log_id_error_code ON log_entries (log_id, error_code)'
      }
    ];
    
    for (const index of indexes) {
      try {
        // 检查索引是否已存在
        const checkResult = await sequelize.query(
          `SHOW INDEX FROM log_entries WHERE Key_name = '${index.name}'`,
          { type: QueryTypes.SELECT }
        );
        
        if (checkResult.length === 0) {
          console.log(`创建索引: ${index.name}`);
          await sequelize.query(index.sql, { type: QueryTypes.RAW });
          console.log(`✓ 索引 ${index.name} 创建成功`);
        } else {
          console.log(`✓ 索引 ${index.name} 已存在，跳过`);
        }
      } catch (error) {
        console.error(`创建索引 ${index.name} 失败:`, error.message);
      }
    }
    
    // 为 logs 表添加索引
    const logIndexes = [
      {
        name: 'idx_logs_uploader_id',
        sql: 'CREATE INDEX idx_logs_uploader_id ON logs (uploader_id)'
      },
      {
        name: 'idx_logs_device_id',
        sql: 'CREATE INDEX idx_logs_device_id ON logs (device_id)'
      },
      {
        name: 'idx_logs_upload_time',
        sql: 'CREATE INDEX idx_logs_upload_time ON logs (upload_time)'
      }
    ];
    
    for (const index of logIndexes) {
      try {
        const checkResult = await sequelize.query(
          `SHOW INDEX FROM logs WHERE Key_name = '${index.name}'`,
          { type: QueryTypes.SELECT }
        );
        
        if (checkResult.length === 0) {
          console.log(`创建索引: ${index.name}`);
          await sequelize.query(index.sql, { type: QueryTypes.RAW });
          console.log(`✓ 索引 ${index.name} 创建成功`);
        } else {
          console.log(`✓ 索引 ${index.name} 已存在，跳过`);
        }
      } catch (error) {
        console.error(`创建索引 ${index.name} 失败:`, error.message);
      }
    }
    
    console.log('数据库索引优化完成！');
    
    // 显示当前索引状态
    console.log('\n当前 log_entries 表索引:');
    const logEntriesIndexes = await sequelize.query(
      'SHOW INDEX FROM log_entries',
      { type: QueryTypes.SELECT }
    );
    logEntriesIndexes.forEach(idx => {
      console.log(`  - ${idx.Key_name}: ${idx.Column_name}`);
    });
    
    console.log('\n当前 logs 表索引:');
    const logsIndexes = await sequelize.query(
      'SHOW INDEX FROM logs',
      { type: QueryTypes.SELECT }
    );
    logsIndexes.forEach(idx => {
      console.log(`  - ${idx.Key_name}: ${idx.Column_name}`);
    });
    
  } catch (error) {
    console.error('优化索引失败:', error);
  } finally {
    await sequelize.close();
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  optimizeIndexes();
}

module.exports = { optimizeIndexes };
