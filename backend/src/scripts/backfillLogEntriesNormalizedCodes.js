/**
 * backfillLogEntriesNormalizedCodes.js
 * 
 * Purpose: Batch backfill subsystem_char and code4 columns in log_entries table
 * Usage  : node backend/src/scripts/backfillLogEntriesNormalizedCodes.js [--batch-size=N]
 * 
 * This script fills the normalized columns for existing log_entries rows.
 * It processes in batches to avoid long transactions and timeouts.
 */

const { sequelize } = require('../models');

function parseArgs() {
  const args = process.argv.slice(2);
  let batchSize = 50000; // 默认每批50000条
  
  for (const arg of args) {
    if (arg.startsWith('--batch-size=')) {
      batchSize = parseInt(arg.split('=')[1], 10) || 50000;
    }
  }
  
  return { batchSize };
}

async function backfill() {
  const { batchSize } = parseArgs();
  console.log(`🚀 Starting backfill with batch size: ${batchSize}`);
  
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');
    
    // 获取需要回填的总数
    const [countResult] = await sequelize.query(`
      SELECT COUNT(*) as total 
      FROM log_entries 
      WHERE subsystem_char IS NULL
    `);
    const totalToProcess = countResult[0].total;
    console.log(`📊 Total rows to backfill: ${totalToProcess.toLocaleString()}`);
    
    if (totalToProcess === 0) {
      console.log('✅ No rows to backfill. All done!');
      await sequelize.close();
      return;
    }
    
    let totalProcessed = 0;
    let batchCount = 0;
    const startTime = Date.now();
    
    while (true) {
      const batchStartTime = Date.now();
      
      // 执行批量更新
      const [result] = await sequelize.query(`
        UPDATE log_entries
        SET 
          subsystem_char = CASE
            WHEN (LEFT(error_code,1) IN ('1','2','3','4','5','6','7','8','9','A')) THEN LEFT(error_code,1)
            ELSE NULL
          END,
          code4 = CONCAT('0X', UPPER(RIGHT(error_code,4)))
        WHERE subsystem_char IS NULL
        LIMIT :batchSize
      `, {
        replacements: { batchSize }
      });
      
      const affectedRows = result.affectedRows || 0;
      totalProcessed += affectedRows;
      batchCount++;
      
      const batchTime = ((Date.now() - batchStartTime) / 1000).toFixed(2);
      const progress = ((totalProcessed / totalToProcess) * 100).toFixed(2);
      const remaining = totalToProcess - totalProcessed;
      const avgTimePerBatch = (Date.now() - startTime) / batchCount / 1000;
      const estimatedRemaining = ((remaining / batchSize) * avgTimePerBatch / 60).toFixed(1);
      
      console.log(`✅ Batch ${batchCount}: ${affectedRows.toLocaleString()} rows updated in ${batchTime}s | Progress: ${progress}% (${totalProcessed.toLocaleString()}/${totalToProcess.toLocaleString()}) | ETA: ${estimatedRemaining} min`);
      
      if (affectedRows === 0 || affectedRows < batchSize) {
        console.log('\n🎉 Backfill completed!');
        break;
      }
      
      // 短暂休眠，减轻数据库压力
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    console.log(`\n📊 Summary:`);
    console.log(`   Total rows processed: ${totalProcessed.toLocaleString()}`);
    console.log(`   Total batches: ${batchCount}`);
    console.log(`   Total time: ${totalTime} minutes`);
    console.log(`   Average per batch: ${(totalProcessed / batchCount).toLocaleString()} rows`);
    
    // 验证回填结果
    const [verifyResult] = await sequelize.query(`
      SELECT COUNT(*) as remaining 
      FROM log_entries 
      WHERE subsystem_char IS NULL
    `);
    const remaining = verifyResult[0].remaining;
    
    if (remaining > 0) {
      console.log(`\n⚠️  Warning: ${remaining} rows still need backfill. Run script again.`);
    } else {
      console.log('\n✅ Verification passed: All rows backfilled!');
      console.log('\n📝 Next step: Create index with:');
      console.log('   CREATE INDEX idx_le_norm ON log_entries(subsystem_char, code4);');
    }
    
    await sequelize.close();
    console.log('\n✅ Done');
    
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    await sequelize.close();
    process.exit(1);
  }
}

backfill();

