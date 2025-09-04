# 数据库脚本说明

本目录包含了数据库的初始化、维护和修复脚本。

## 文件说明

### 1. `init_database.sql` - 数据库初始化脚本（推荐使用）
- **用途**: 创建完整的数据库结构和表
- **特点**: 
  - 整合了所有表结构定义
  - 使用正确的字符集（utf8mb4）和排序规则
  - 包含所有必要的索引和外键约束（基础索引 + 性能优化索引）
  - 支持混合数据库类型：MySQL（主要表）+ PostgreSQL（手术统计表）
  - **统一索引管理**：所有索引都在一个地方定义，避免冲突
- **使用场景**: 
  - 首次部署数据库
  - 重新创建数据库结构
  - 开发环境初始化
  - 索引管理和优化

### 2. `clear_data.sql` - 数据清空脚本
- **用途**: 清空所有表数据，保留表结构
- **特点**:
  - 按依赖关系顺序清空数据
  - 重置自增ID
  - 显示清空结果
- **使用场景**:
  - 测试环境数据清理
  - 开发环境重置
  - 维护操作

### 3. `surgery_tables_postgresql.sql` - PostgreSQL手术统计表脚本
- **用途**: 专门用于PostgreSQL数据库的手术统计表
- **特点**: 包含PostgreSQL特有的数据类型和索引
- **使用场景**: 当只需要创建手术统计表时使用

## 使用建议

### 首次部署
```bash
mysql -u root -p < init_database.sql
```

### 清空数据（谨慎使用）
```bash
mysql -u root -p < clear_data.sql
```

### 索引管理
```bash
# 查看索引信息（Node.js脚本）
cd backend
npm run show-indexes

# 或者直接运行
node src/scripts/showIndexInfo.js
```

### 备份数据库
```bash
mysqldump -u root -p logtool > backup_$(date +%Y%m%d_%H%M%S).sql
```

## 数据库特性

### MySQL表（主要业务表）
- **字符集**: utf8mb4（支持完整的Unicode字符，包括emoji）
- **排序规则**: utf8mb4_unicode_ci（不区分大小写的Unicode排序）
- **存储引擎**: InnoDB（支持事务、外键约束）
- **索引优化**: 包含查询性能优化的索引

## 索引管理说明

### 索引策略
- **基础索引**: 为常用查询字段创建的单列索引
- **性能索引**: 为复杂查询优化的复合索引和覆盖索引
- **统一管理**: 所有索引都在 `init_database.sql` 中定义，避免重复创建

### 主要索引类型

#### logs表索引
- `idx_logs_upload_time`: 上传时间索引（基础查询）
- `idx_logs_device_id`: 设备ID索引（基础查询）
- `idx_logs_uploader`: 上传者复合索引（性能优化）
- `idx_logs_device`: 设备+时间复合索引（性能优化）
- `idx_logs_filename`: 文件名前缀索引（模糊查询优化）

#### log_entries表索引
- `idx_log_entries_timestamp`: 时间戳索引（基础查询）
- `idx_log_entries_error_code`: 错误码索引（基础查询）
- `idx_log_entries_log_timestamp`: 日志ID+时间复合索引（性能优化）
- `idx_log_entries_log_error`: 日志ID+错误码复合索引（性能优化）
- `idx_log_entries_params`: 参数复合索引（参数查询优化）
- `idx_log_entries_explanation`: 说明字段索引（文本搜索优化）
- `idx_log_entries_covering`: 覆盖索引（高性能查询）

#### error_codes表索引
- `idx_error_codes_subsystem_code`: 子系统+错误码复合索引（性能优化）

#### devices表索引
- `idx_devices_device_key`: 设备密钥索引（基础查询）

### PostgreSQL表（手术统计表）
- **数据类型**: 使用PostgreSQL特有的数据类型
- **数组支持**: INTEGER[] 用于存储设备ID和日志文件ID数组
- **JSONB**: 高性能的JSON数据类型，支持索引和查询优化
- **自增ID**: SERIAL类型用于自动递增主键

## 表结构概览

1. **用户管理**: users, roles, user_roles
2. **故障码管理**: error_codes, i18n_error_codes
3. **日志管理**: logs, log_entries, operation_logs
4. **设备管理**: devices
5. **反馈系统**: feedbacks, feedback_images
6. **手术统计**: surgeries, surgery_versions
7. **多语言支持**: i18n_texts

## 注意事项

- 执行脚本前请务必备份现有数据
- 生产环境使用前请仔细测试
- 确保MySQL版本支持utf8mb4字符集（MySQL 5.5.3+）
- **重要**: 手术统计表（surgeries, surgery_versions）需要PostgreSQL数据库
- 主要业务表使用MySQL，手术统计表使用PostgreSQL
- 建议在测试环境验证后再部署到生产环境
- 如果只使用MySQL，需要将手术统计表改为MySQL兼容语法

## 文件清理说明

已删除的废弃文件：
- `db_schema.sql` - 原始数据库结构（已整合到 `init_database.sql`）
- `clear_test_data.sql` - 原始清空脚本（已整合到 `clear_data.sql`）
- `fix-database-charset.sql` - 字符集修复脚本（已整合到 `init_database.sql`）

这些文件的功能已经完全整合到新的脚本中，不再需要单独维护。
