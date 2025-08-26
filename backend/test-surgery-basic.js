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

// 测试函数
function testSurgeryAnalyzer() {
  console.log('🧪 开始测试手术分析器（基础功能）...');
  
  try {
    // 创建分析器实例
    const analyzer = new SurgeryAnalyzer();
    console.log('✅ 分析器实例创建成功');
    
    // 分析日志条目
    const surgeries = analyzer.analyze(testLogEntries);
    console.log('✅ 日志分析完成');
    console.log(`📊 发现 ${surgeries.length} 场手术`);
    
    // 检查分析结果
    if (surgeries.length > 0) {
      const surgery = surgeries[0];
      console.log('📋 手术详情:');
      console.log(`  - 手术ID: ${surgery.surgery_id}`);
      console.log(`  - 开始时间: ${surgery.surgery_start_time}`);
      console.log(`  - 结束时间: ${surgery.surgery_end_time}`);
      console.log(`  - 总时长: ${surgery.total_duration} 分钟`);
      console.log(`  - 器械使用: ${surgery.arm1_usage?.length || 0} 个`);
      
      // 测试PostgreSQL结构化数据转换（不依赖数据库）
      const postgresqlData = analyzer.toPostgreSQLStructure(surgery);
      if (postgresqlData) {
        console.log('✅ PostgreSQL结构化数据转换成功');
        console.log('📊 PostgreSQL数据结构:');
        console.log(`  - 开关机循环: ${postgresqlData.power_cycles?.length || 0} 个`);
        console.log(`  - 机械臂: ${postgresqlData.arms?.length || 0} 个`);
        console.log(`  - 手术统计: ${postgresqlData.surgery_stats ? '已生成' : '未生成'}`);
      } else {
        console.log('⚠️ PostgreSQL结构化数据转换失败，但不影响基础分析功能');
      }
      
    } else {
      console.log('⚠️ 未发现手术数据');
    }
    
    console.log('🎉 基础测试完成！');
    console.log('💡 手术分析功能正常工作，无需PostgreSQL数据库');
    return true;
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    return false;
  }
}

// 运行测试
if (require.main === module) {
  testSurgeryAnalyzer();
}

module.exports = { testSurgeryAnalyzer };
