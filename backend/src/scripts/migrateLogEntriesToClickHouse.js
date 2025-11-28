const { sequelize } = require('../models');
const { getClickHouseClient } = require('../config/clickhouse');
const dayjs = require('dayjs');

// 从命令行参数读取配置
function parseArgs() {
  const args = process.argv.slice(2);
  let batchSize = 20000;
  let startId = 0;
  
  for (const arg of args) {
    if (arg.startsWith('--batch-size=')) {
      batchSize = parseInt(arg.split('=')[1], 10) || 20000;
    } else if (arg.startsWith('--start-id=')) {
      startId = parseInt(arg.split('=')[1], 10) || 0;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
用法: node backend/src/scripts/migrateLogEntriesToClickHouse.js [选项]

选项:
  --batch-size=N    每批处理条数 (默认: 20000)
  --start-id=N      起始 ID，用于断点续传 (默认: 0)
  --help, -h        显示帮助信息

示例:
  # 从头开始迁移，默认批次大小
  node backend/src/scripts/migrateLogEntriesToClickHouse.js

  # 从 ID 99532487 继续迁移（断点续传）
  node backend/src/scripts/migrateLogEntriesToClickHouse.js --start-id=99532487

  # 使用更大的批次大小（提升速度，但占用更多内存）
  node backend/src/scripts/migrateLogEntriesToClickHouse.js --batch-size=50000
      `);
      process.exit(0);
    }
  }
  
  return { batchSize, startId };
}

const { batchSize: BATCH_SIZE, startId: START_ID } = parseArgs();

async function migrate() {
  console.log('🚀 开始迁移 log_entries 从 MySQL 到 ClickHouse...');
  console.log(`📋 配置: 批次大小=${BATCH_SIZE}, 起始ID=${START_ID}`);
  
  const clickhouse = getClickHouseClient();
  let processedCount = 0;
  let currentId = START_ID;
  
  try {
    // 获取总数用于估算进度
    const [countResult] = await sequelize.query('SELECT COUNT(*) as total FROM log_entries WHERE id > ?', {
      replacements: [START_ID],
      type: sequelize.QueryTypes.SELECT
    });
    const total = countResult.total;
    console.log(`📊 预计迁移总数: ${total}`);

    while (true) {
      const t0 = Date.now();
      
      // 1. 从 MySQL 读取一批数据
      // 修正：移除不存在的 created_at 字段，直接读取已有的 subsystem_char 和 code4
      const rows = await sequelize.query(
        `SELECT 
           id, log_id, timestamp, error_code, 
           param1, param2, param3, param4, 
           explanation, subsystem_char, code4
         FROM log_entries 
         WHERE id > ? 
         ORDER BY id ASC 
         LIMIT ?`,
        {
          replacements: [currentId, BATCH_SIZE],
          type: sequelize.QueryTypes.SELECT
        }
      );

      if (rows.length === 0) {
        break; // 完成
      }

      // 2. 转换数据格式
      const clickhouseRows = rows.map(row => {
        // 格式化时间
        const ts = dayjs(row.timestamp).isValid() 
          ? dayjs(row.timestamp).format('YYYY-MM-DD HH:mm:ss') 
          : dayjs().format('YYYY-MM-DD HH:mm:ss');
          
        // ClickHouse 的 created_at 使用日志时间填充（用于 TTL）
        const createdAt = ts;

        return {
          log_id: row.log_id,
          timestamp: ts,
          error_code: row.error_code || '',
          param1: row.param1 || '',
          param2: row.param2 || '',
          param3: row.param3 || '',
          param4: row.param4 || '',
          explanation: row.explanation || '',
          // MySQL 中已有生成列，直接使用，兜底为空字符串
          subsystem_char: row.subsystem_char || '',
          code4: row.code4 || '',
          version: 1, // 历史数据默认版本 1
          row_index: row.id, // 使用原始主键 ID 作为行号，保持排序
          created_at: createdAt
        };
      });

      // 3. 写入 ClickHouse
      await clickhouse.insert({
        table: 'log_entries',
        values: clickhouseRows,
        format: 'JSONEachRow'
      });

      // 更新进度
      processedCount += rows.length;
      currentId = rows[rows.length - 1].id;
      const duration = (Date.now() - t0) / 1000;
      const speed = duration > 0 ? Math.round(rows.length / duration) : rows.length;
      const percent = total > 0 ? ((processedCount / total) * 100).toFixed(2) : 0;
      
      console.log(`✅ 已迁移: ${processedCount} / ${total} (${percent}%) - 当前ID: ${currentId} - 速度: ${speed}条/秒`);
    }

    console.log('🎉 迁移完成！');
    
  } catch (error) {
    console.error('❌ 迁移失败:', error);
  } finally {
    await sequelize.close();
    await clickhouse.close();
  }
}

migrate();

