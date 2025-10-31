# LogTool 项目指南 v0.0.1

开发进度记录
2025-09-19 完成基本功能，手术数据可视化修改中；
2025-10-12 完成了日志自动上传组件；
2025-10-14 修改故障码数据表字段，删除了其中英文相关字段，全部由多语言表管理；
            增加了日志分析等级表；
2025-10-15 为log_entries增加了生成列，一定要用cmd执行，不要用workbench;      
2025-10-17 增加了日志分析等级，功能基本正常，只是增加了批量日志查看功能中查询的时间，需要后续优化；      
2025-10-23 优化了查询事件，完善了手术数据可视化和导出功能，下一步需要仔细核对手术数据统计的逻辑准确性；
2025-10-27 完善了角色权限管理功能；
2025-10-30 日志自动上传组件可打包、移动端使用pwa方案开始实现；

## 📋 文档说明

**主要用途**: 
1. 启动项目的方法
2. 各配置文件的说明和env配置参数说明  
3. 项目进展

**项目状态**: 持续更新中  
**维护团队**: LogTool开发团队  

---

## 🚀 1. 启动项目的方法

### 一键启动（推荐）
```bash
# 双击运行统一启动脚本
start-all.bat

# 选择启动方式：
# [1] 后端开发模式
# [2] 后端集群模式  
# [3] 前端服务
# [4] 全部服务
# [5] 后端生产模式
# [6] 启动Redis
# [7] 停止Redis
```

### 手动启动
```bash
# 后端服务
cd backend
npm start              # 开发模式
npm run cluster        # 集群模式

# 前端服务
cd frontend
npm run dev

# Redis服务
cd infrastructure/Redis
redis-server.exe redis.conf
```

### 环境要求
- Node.js 16+
- MySQL 8.0+
- Redis 6.0+
- PostgreSQL 12+ (可选，用于手术分析)

### 数据库初始化（首次使用必读）

**重要**: 首次使用项目前，必须先初始化数据库！

#### 方法1：使用启动脚本（推荐）
```bash
# 1. 双击运行 start-all.bat
# 2. 选择 [1] 启动后端开发模式
# 3. 系统会自动检查数据库连接
# 4. 如果数据库未初始化，会提示错误
```

#### 方法2：手动初始化数据库
```bash
# 1. 启动MySQL服务
# 2. 创建数据库
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS logtool CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 3. 导入数据库结构
mysql -u root -p logtool < infrastructure/database/init_database.sql

# 4. 初始化角色和权限
cd backend
npm run init-roles

# 5. 启动服务
npm start
```

#### 方法3：使用数据库管理工具
1. 使用MySQL Workbench、phpMyAdmin等工具
2. 创建名为 `logtool` 的数据库
3. 设置字符集为 `utf8mb4`，排序规则为 `utf8mb4_unicode_ci`
4. 导入 `infrastructure/database/init_database.sql` 文件
5. 执行角色初始化脚本

#### 常见问题解决
- **数据库连接失败**: 检查MySQL服务是否启动，用户名密码是否正确
- **表不存在错误**: 执行数据库初始化脚本
- **字符集错误**: 确保使用utf8mb4字符集
- **权限不足**: 使用具有创建数据库权限的用户账户

---

## ⚙️ 2. 各配置文件的说明和env配置参数说明

### 核心配置文件

#### 1. **环境变量配置** (`.env`)
```bash
# 数据库配置
DB_HOST=localhost          # MySQL主机地址
DB_PORT=3306              # MySQL端口
DB_NAME=logtool           # 数据库名称
DB_USER=root              # 数据库用户名
DB_PASSWORD=your_password # 数据库密码
DB_DIALECT=mysql          # 数据库类型

# Redis配置
REDIS_HOST=localhost      # Redis主机地址
REDIS_PORT=6379          # Redis端口
REDIS_PASSWORD=           # Redis密码（可选）
REDIS_DB=0               # Redis数据库编号

# PostgreSQL配置 (手术分析)
POSTGRES_USER=postgres    # PostgreSQL用户名
POSTGRES_PASSWORD=password # PostgreSQL密码
POSTGRES_DB=logtool       # 数据库名称（与MySQL使用相同名称）
POSTGRES_HOST=localhost   # 主机地址
POSTGRES_PORT=5432        # 端口
POSTGRES_SSL=false        # SSL连接

# 应用配置
PORT=3000                 # 后端服务端口
NODE_ENV=development      # 环境模式
JWT_SECRET=your_jwt_secret # JWT密钥

# 队列配置
QUEUE_CONCURRENCY=3       # 队列并发处理数
QUEUE_MAX_ATTEMPTS=3      # 任务重试次数
QUEUE_BACKOFF_DELAY=2000  # 重试延迟时间

# 速率限制配置
RATE_LIMIT_ENABLED=true   # 启用速率限制
RATE_LIMIT_WINDOW_MS=30000 # 时间窗口（毫秒）
RATE_LIMIT_MAX_REQUESTS=50 # 最大请求次数

# 缓存配置
CACHE_ENABLED=true        # 启用缓存
CACHE_TTL_SECONDS=300     # 缓存过期时间
CACHE_MAX_KEYS=1000       # 最大缓存键数量
SEARCH_CACHE_TTL_SECONDS=180 # 搜索缓存时间

# 搜索优化配置
SEARCH_MAX_CONCURRENT=5   # 最大并发搜索数
SEARCH_TIMEOUT_MS=120000  # 搜索超时时间
SEARCH_CACHE_ENABLED=true # 启用搜索缓存

# 集群配置
CLUSTER_ENABLED=true      # 启用集群模式
WORKER_PROCESSES=max      # 工作进程数（max=自动检测CPU核心数）
MAX_MEMORY_RESTART=1G     # 内存限制重启
AUTO_RESTART_ENABLED=true # 自动重启
MAX_RESTART_ATTEMPTS=5    # 最大重启次数
RESTART_DELAY=1000        # 重启延迟
HEARTBEAT_TIMEOUT=30000   # 心跳超时

# 日志配置
LOG_LEVEL=INFO            # 日志级别: ERROR, WARN, INFO, DEBUG, VERBOSE
LOG_FORMAT=structured     # 日志格式: simple, structured, json
LOG_FILE_ENABLED=false    # 是否输出到文件
LOG_FILE_PATH=logs/       # 日志文件路径
```

#### 2. **数据库脚本文件** (`infrastructure/database/`)

##### 主要脚本文件

**`init_database.sql` - 数据库初始化脚本（推荐使用）**
- **用途**: 创建完整的数据库结构和表
- **特点**: 
  - 整合了所有表结构定义
  - 使用正确的字符集（utf8mb4）和排序规则
  - 包含所有必要的索引和外键约束
  - 支持混合数据库类型：MySQL（主要表）+ PostgreSQL（手术统计表）
- **使用场景**: 
  - 首次部署数据库
  - 重新创建数据库结构
  - 开发环境初始化

**`clear_data.sql` - 数据清空脚本**
- **用途**: 清空所有表数据，保留表结构
- **特点**:
  - 按依赖关系顺序清空数据
  - 重置自增ID
  - 显示清空结果
- **使用场景**:
  - 测试环境数据清理
  - 开发环境重置
  - 维护操作

**`surgery_tables_postgresql.sql` - PostgreSQL手术统计表脚本**
- **用途**: 专门用于PostgreSQL数据库的手术统计表
- **特点**: 包含PostgreSQL特有的数据类型和索引
- **使用场景**: 当只需要创建手术统计表时使用

##### 数据库脚本使用方法

**首次部署数据库**
```bash
# 1. 创建数据库
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS logtool CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 2. 导入数据库结构
mysql -u root -p logtool < infrastructure/database/init_database.sql

# 3. 初始化角色和权限
cd backend
npm run init-roles
npm run init-permissions
```

**清空数据（谨慎使用）**
```bash
# 备份现有数据（推荐）
mysqldump -u root -p logtool > backup_$(date +%Y%m%d_%H%M%S).sql

# 清空数据
mysql -u root -p logtool < infrastructure/database/clear_data.sql

# 重新初始化角色
cd backend
npm run init-roles
```

**备份数据库**
```bash
# 完整备份
mysqldump -u root -p logtool > backup_$(date +%Y%m%d_%H%M%S).sql

# 仅备份结构
mysqldump -u root -p --no-data logtool > schema_$(date +%Y%m%d_%H%M%S).sql

# 仅备份数据
mysqldump -u root -p --no-create-info logtool > data_$(date +%Y%m%d_%H%M%S).sql
```

**数据库维护操作**
```bash
# 检查数据库状态
mysql -u root -p -e "SHOW DATABASES;"
mysql -u root -p -e "USE logtool; SHOW TABLES;"

# 检查表结构
mysql -u root -p -e "USE logtool; DESCRIBE users;"

# 检查字符集设置
mysql -u root -p -e "USE logtool; SHOW TABLE STATUS;"
```

##### 数据库表结构说明

**核心业务表**
- **用户管理**: users（用户信息）、roles（角色定义）、user_roles（用户角色关联）
- **故障码管理**: error_codes（故障码定义）、i18n_error_codes（多语言故障码）
- **日志管理**: logs（日志元数据）、log_entries（日志内容）、operation_logs（操作记录）
- **设备管理**: devices（设备信息）
- **反馈系统**: feedbacks（反馈信息）、feedback_images（反馈图片）
- **手术统计**: surgeries（手术数据）、surgery_versions（手术版本记录）
- **多语言支持**: i18n_texts（多语言配置）

**数据库特性**
- **字符集**: utf8mb4（支持完整的Unicode字符，包括emoji）
- **排序规则**: utf8mb4_unicode_ci（不区分大小写的Unicode排序）
- **存储引擎**: InnoDB（支持事务、外键约束）
- **索引优化**: 包含查询性能优化的索引
- **混合架构**: MySQL（主要业务表）+ PostgreSQL（手术统计表）

**注意事项**
- 执行脚本前请务必备份现有数据
- 生产环境使用前请仔细测试
- 确保MySQL版本支持utf8mb4字符集（MySQL 5.5.3+）
- **重要**: 手术统计表（surgeries, surgery_versions）需要PostgreSQL数据库
- 主要业务表使用MySQL，手术统计表使用PostgreSQL
- 建议在测试环境验证后再部署到生产环境

#### 3. **Redis配置文件** (`infrastructure/Redis/redis.conf`)
- 端口配置：6379
- 内存配置：最大内存限制
- 持久化配置：RDB和AOF
- 安全配置：密码和访问控制

#### 4. **PostgreSQL配置文件** (`backend/src/config/postgresql.js`)
- 连接池配置
- SSL配置
- 数据库同步配置

### 配置文件位置说明
```
logtool/
├── .env                          # 环境变量配置
├── backend/
│   ├── .env                     # 后端环境配置
│   ├── src/config/              # 后端配置文件目录
│   │   ├── database.js          # 数据库连接配置
│   │   ├── redis.js             # Redis连接配置
│   │   ├── postgresql.js        # PostgreSQL配置
│   │   ├── rateLimit.js         # 速率限制配置
│   │   └── cache.js             # 缓存配置
│   └── package.json             # 后端依赖配置
├── frontend/
│   └── package.json             # 前端依赖配置
└── infrastructure/
    ├── Redis/                   # Redis服务目录
    │   ├── redis.conf           # Redis配置文件
    │   └── redis-server.exe     # Redis服务器
    └── database/                # 数据库脚本目录
        ├── init_database.sql    # 数据库初始化脚本（推荐）
        ├── clear_data.sql       # 数据清空脚本
        ├── surgery_tables_postgresql.sql # PostgreSQL手术统计表
        └── README.md            # 数据库脚本详细说明
```


