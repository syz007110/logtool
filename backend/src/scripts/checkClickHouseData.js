const { getClickHouseClient } = require('../config/clickhouse');

async function checkData() {
  const clickhouse = getClickHouseClient();
  
  try {
    console.log('🔍 检查 ClickHouse 数据...\n');
    
    // 1. 检查总记录数
    const countResult = await clickhouse.query({
      query: 'SELECT count() as total FROM log_entries',
      format: 'JSONEachRow'
    });
    const countData = await countResult.json();
    const total = countData[0]?.total || 0;
    console.log(`📊 总记录数: ${total.toLocaleString()}`);
    
    // 2. 检查按版本分组的记录数
    const versionResult = await clickhouse.query({
      query: 'SELECT version, count() as cnt FROM log_entries GROUP BY version ORDER BY version',
      format: 'JSONEachRow'
    });
    const versionData = await versionResult.json();
    console.log('\n📋 按版本分组:');
    versionData.forEach(row => {
      console.log(`   版本 ${row.version}: ${parseInt(row.cnt).toLocaleString()} 条`);
    });
    
    // 3. 检查按月份分区的数据量（查看分区情况）
    const partitionResult = await clickhouse.query({
      query: `
        SELECT 
          toYYYYMM(timestamp) as month,
          count() as cnt
        FROM log_entries 
        GROUP BY month 
        ORDER BY month DESC 
        LIMIT 12
      `,
      format: 'JSONEachRow'
    });
    const partitionData = await partitionResult.json();
    console.log('\n📅 最近12个月的数据分布:');
    partitionData.forEach(row => {
      console.log(`   ${row.month}: ${parseInt(row.cnt).toLocaleString()} 条`);
    });
    
    // 4. 检查按 log_id 分组的记录数（查看有多少个日志文件的数据）
    const logIdResult = await clickhouse.query({
      query: 'SELECT count(DISTINCT log_id) as log_count FROM log_entries',
      format: 'JSONEachRow'
    });
    const logIdData = await logIdResult.json();
    const logCount = logIdData[0]?.log_count || 0;
    console.log(`\n📁 日志文件数: ${logCount.toLocaleString()}`);
    
    // 5. 查看最新和最早的数据时间
    const timeRangeResult = await clickhouse.query({
      query: `
        SELECT 
          min(timestamp) as earliest,
          max(timestamp) as latest
        FROM log_entries
      `,
      format: 'JSONEachRow'
    });
    const timeRangeData = await timeRangeResult.json();
    console.log('\n⏰ 时间范围:');
    console.log(`   最早: ${timeRangeData[0]?.earliest || 'N/A'}`);
    console.log(`   最新: ${timeRangeData[0]?.latest || 'N/A'}`);
    
    // 6. 查看示例数据（前5条）
    const sampleResult = await clickhouse.query({
      query: 'SELECT log_id, timestamp, error_code, version, row_index FROM log_entries ORDER BY log_id, version, row_index LIMIT 5',
      format: 'JSONEachRow'
    });
    const sampleData = await sampleResult.json();
    console.log('\n📝 示例数据（前5条）:');
    sampleData.forEach((row, index) => {
      console.log(`   ${index + 1}. log_id=${row.log_id}, version=${row.version}, row_index=${row.row_index}, timestamp=${row.timestamp}, error_code=${row.error_code}`);
    });
    
    console.log('\n✅ 数据检查完成！');
    
  } catch (error) {
    console.error('❌ 检查失败:', error.message);
    console.error('详细错误:', error);
  } finally {
    await clickhouse.close();
  }
}

checkData();

