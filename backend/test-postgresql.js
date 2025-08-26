const { postgresqlSequelize, testConnection, syncDatabase } = require('./src/config/postgresql');
const Surgery = require('./src/models/surgery');
const SurgeryAnalyzer = require('./src/services/surgeryAnalyzer');

// 测试数据
const testLogEntries = [
  {
    timestamp: '2024-01-01T08:00:00Z',
    error_code: 'A01E',
    param1: '0',
    param2: '1',
    param3: '0',
    param4: '0',
    explanation: '开机事件',
    log_id: 1
  },
  {
    timestamp: '2024-01-01T08:30:00Z',
    error_code: '310e',
    param1: '0',
    param2: '20',
    param3: '0',
    param4: '0',
    explanation: '状态机变化',
    log_id: 1
  },
  {
    timestamp: '2024-01-01T08:35:00Z',
    error_code: '501e',
    param1: '0',
    param2: '0',
    param3: '5',
    param4: '0',
    explanation: '器械类型变化',
    log_id: 1
  },
  {
    timestamp: '2024-01-01T09:00:00Z',
    error_code: '500e',
    param1: '1',
    param2: '1',
    param3: '0',
    param4: '0',
    explanation: '手术结束',
    log_id: 1
  },
  {
    timestamp: '2024-01-01T09:05:00Z',
    error_code: 'A02e',
    param1: '0',
    param2: '0',
    param3: '0',
    param4: '0',
    explanation: '关机事件',
    log_id: 1
  }
];

async function testPostgreSQL() {
  console.log('🧪 开始测试PostgreSQL功能...');
  
  try {
    // 1. 测试连接
    await testConnection();
    console.log('✅ PostgreSQL连接成功');
    
    // 2. 同步数据库表
    await syncDatabase(false);
    console.log('✅ 数据库表同步完成');
    
    // 3. 分析手术数据
    const analyzer = new SurgeryAnalyzer();
    const surgeries = analyzer.analyze(testLogEntries);
    console.log(`✅ 分析出 ${surgeries.length} 场手术`);
    
    if (surgeries.length > 0) {
      const surgery = surgeries[0];
      console.log('📋 手术详情:', {
        surgery_id: surgery.surgery_id,
        start_time: surgery.surgery_start_time,
        end_time: surgery.surgery_end_time,
        duration: surgery.total_duration
      });
      
      // 4. 转换为PostgreSQL结构化数据
      const postgresqlStructure = analyzer.toPostgreSQLStructure(surgery);
      console.log('✅ PostgreSQL结构化数据转换成功');
      
      // 5. 存储到PostgreSQL数据库
      const postgresqlData = {
        surgery_id: surgery.surgery_id,
        device_ids: [surgery.log_id],
        start_time: surgery.surgery_start_time,
        end_time: surgery.surgery_end_time,
        is_remote: surgery.is_remote_surgery || false,
        structured_data: postgresqlStructure,
        last_analyzed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      const savedSurgery = await Surgery.create(postgresqlData);
      console.log('✅ 手术数据已存储到PostgreSQL，ID:', savedSurgery.id);
      
      // 6. 查询存储的数据
      const retrievedSurgery = await Surgery.findByPk(savedSurgery.id);
      console.log('✅ 成功查询到存储的手术数据:', {
        id: retrievedSurgery.id,
        surgery_id: retrievedSurgery.surgery_id,
        created_at: retrievedSurgery.created_at
      });
      
      // 7. 查询所有数据
      const allSurgeries = await Surgery.findAll();
      console.log(`✅ 数据库中总共有 ${allSurgeries.length} 条手术数据`);
      
    } else {
      console.log('⚠️ 未分析出手术数据');
    }
    
    console.log('🎉 PostgreSQL功能测试完成！');
    
  } catch (error) {
    console.error('❌ PostgreSQL测试失败:', error.message);
    console.error(error.stack);
  } finally {
    // 关闭连接
    await postgresqlSequelize.close();
    console.log('🔌 PostgreSQL连接已关闭');
  }
}

// 运行测试
if (require.main === module) {
  testPostgreSQL();
}

module.exports = { testPostgreSQL };
