# 手术分析系统重构说明

## 概述

本次重构将原本混乱的手术分析逻辑重构为清晰的模块化架构，支持PostgreSQL结构化数据输出，便于后续的可视化和查询分析。

## 重构内容

### 1. 核心分析器 - SurgeryAnalyzer

**文件位置**: `backend/src/services/surgeryAnalyzer.js`

#### 主要特性：
- **模块化设计**: 将分析逻辑分解为独立的方法
- **状态管理**: 清晰的状态变量管理
- **事件驱动**: 按事件类型分别处理
- **PostgreSQL支持**: 内置结构化数据转换

#### 核心方法：
```javascript
// 主要分析方法
analyze(logEntries) // 分析日志条目
processLogEntry(entry, index, allEntries) // 处理单个日志条目

// 事件处理方法
processNetworkEvents() // 处理网络事件
processFaultEvents() // 处理故障事件
processPowerOnEvents() // 处理开机事件
processPowerOffEvents() // 处理关机事件
processStateMachineEvents() // 处理状态机事件
processInstrumentStateEvents() // 处理器械状态
processInstrumentTypeEvents() // 处理器械类型
processSurgeryStartEvents() // 处理手术开始
processSurgeryEndEvents() // 处理手术结束
processUDIEvents() // 处理UDI码
processNoUsageEvents() // 处理无使用次数事件

// 数据转换方法
toPostgreSQLStructure(surgery) // 转换为PostgreSQL结构化数据
```

### 2. 控制器重构

**文件位置**: `backend/src/controllers/surgeryStatisticsController.js`

#### 主要改进：
- **简化逻辑**: 移除冗余代码，使用新的分析器
- **支持选项**: 添加PostgreSQL结构化数据选项
- **异步处理**: 保持任务队列功能
- **错误处理**: 改进错误处理机制

#### 新增功能：
```javascript
// 导出PostgreSQL结构化数据
exportPostgreSQLData(req, res)

// 支持PostgreSQL结构的分析
analyzeSurgeries(logEntries, { includePostgreSQLStructure: true })
```

### 3. PostgreSQL数据模型

**文件位置**: `backend/src/models/surgery.js`

#### 数据表结构：
```sql
CREATE TABLE surgeries (
    id SERIAL PRIMARY KEY,
    surgery_id VARCHAR(50) UNIQUE NOT NULL,
    device_ids INT[],
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    is_remote BOOLEAN,
    structured_data JSONB,
    last_analyzed_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 查询方法：
```javascript
// 按时间范围查询
Surgery.findByTimeRange(startTime, endTime, options)

// 获取统计信息
Surgery.getStatistics(startTime, endTime)

// 根据结构化数据查询
Surgery.findByStructuredData(query, options)
```

### 4. PostgreSQL配置

**文件位置**: `backend/src/config/postgresql.js`

#### 配置特性：
- **环境配置**: 支持开发、测试、生产环境
- **连接池**: 优化的数据库连接池
- **SSL支持**: 生产环境SSL连接
- **自动同步**: 数据库表结构自动同步

## 数据结构

### PostgreSQL结构化数据格式

```json
{
  "power_cycles": [
    {
      "on_time": "2024-01-01T08:00:00Z",
      "off_time": "2024-01-01T09:00:00Z"
    }
  ],
  "arms": [
    {
      "arm_id": 1,
      "instrument_usage": [
        {
          "tool_type": "剪刀",
          "udi": "UDI-123456",
          "start_time": "2024-01-01T08:30:00Z",
          "end_time": "2024-01-01T08:45:00Z",
          "energy_activation": []
        }
      ]
    }
  ],
  "surgery_stats": {
    "has_fault": false,
    "success": true,
    "is_remote": false,
    "network_latency_ms": [120, 80, 200],
    "faults": [],
    "state_machine": [
      {
        "time": "2024-01-01T08:00:00Z",
        "state": "INIT"
      }
    ],
    "arm_switch_count": 3,
    "left_hand_clutch": 4,
    "right_hand_clutch": 5,
    "foot_clutch": 6,
    "endoscope_pedal": 7
  }
}
```

## API接口

### 1. 基础分析接口

```javascript
// 获取手术统计数据
GET /api/surgery-statistics?logIds=1,2,3&includePostgreSQLStructure=true

// 分析已排序日志条目
POST /api/surgery-statistics/analyze-sorted-entries
{
  "logEntries": [...],
  "includePostgreSQLStructure": true
}

// 通过日志ID列表分析
POST /api/surgery-statistics/analyze-by-log-ids
{
  "logIds": [1, 2, 3],
  "includePostgreSQLStructure": true
}
```

### 2. PostgreSQL数据导出

```javascript
// 导出PostgreSQL结构化数据
GET /api/surgery-statistics/export/postgresql?logIds=1,2,3
```

### 3. 任务管理

```javascript
// 查询任务状态
GET /api/surgery-statistics/task/:taskId

// 获取用户任务列表
GET /api/surgery-statistics/tasks
```

## 使用示例

### 1. 基础分析

```javascript
const SurgeryAnalyzer = require('./services/surgeryAnalyzer');

const analyzer = new SurgeryAnalyzer();
const surgeries = analyzer.analyze(logEntries);

// 获取PostgreSQL结构化数据
surgeries.forEach(surgery => {
  const postgresqlData = analyzer.toPostgreSQLStructure(surgery);
  console.log(postgresqlData);
});
```

### 2. 数据库查询

```javascript
const Surgery = require('./models/surgery');

// 按时间范围查询
const surgeries = await Surgery.findByTimeRange(
  new Date('2024-01-01'),
  new Date('2024-01-31')
);

// 获取统计信息
const stats = await Surgery.getStatistics(
  new Date('2024-01-01'),
  new Date('2024-01-31')
);

// 查询故障手术
const faultSurgeries = await Surgery.findByStructuredData({
  hasFault: true
});
```

## 环境配置

### 环境变量

```bash
# PostgreSQL配置
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_DB=surgery_analytics
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# 环境
NODE_ENV=development
```

### 数据库初始化

```javascript
const { testConnection, syncDatabase } = require('./config/postgresql');

// 测试连接
await testConnection();

// 同步表结构
await syncDatabase();
```

## 优势

### 1. 代码质量
- **模块化**: 清晰的职责分离
- **可维护性**: 易于理解和修改
- **可测试性**: 独立的方法便于单元测试
- **可扩展性**: 易于添加新功能

### 2. 性能优化
- **内存管理**: 更好的内存使用
- **并发处理**: 支持异步任务队列
- **数据库优化**: PostgreSQL JSONB索引支持

### 3. 数据质量
- **结构化**: 标准化的数据结构
- **完整性**: 完整的数据验证
- **可查询**: 支持复杂查询需求

### 4. 可视化支持
- **标准化**: 统一的数据格式
- **灵活性**: 支持多种可视化需求
- **实时性**: 支持实时数据更新

## 后续开发

### 1. 可视化模块
- 手术时间线可视化
- 器械使用统计图表
- 故障分析仪表板
- 网络性能监控

### 2. 高级查询
- 复杂条件查询
- 统计分析查询
- 趋势分析查询
- 对比分析查询

### 3. 实时监控
- 实时手术状态监控
- 故障预警系统
- 性能指标监控
- 设备状态监控

## 注意事项

1. **数据迁移**: 需要将现有数据迁移到新结构
2. **兼容性**: 保持与现有API的兼容性
3. **性能**: 大数据量时的性能优化
4. **安全**: 数据库访问权限控制
5. **备份**: 定期数据备份策略
