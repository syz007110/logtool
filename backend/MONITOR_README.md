# 日志自动抓取上传功能使用指南

## 📋 功能概述

日志自动抓取上传功能可以自动监控指定目录，检测新增的`.medbot`文件，并根据设备编号自动获取解密密钥进行上传处理。

## 🚀 快速开始

### 1. 安装依赖

```bash
# 安装监控功能依赖
node install-monitor-deps.js

# 或者手动安装
npm install chokidar@^3.5.3
```

### 2. 配置监控目录

通过API配置监控目录：

```bash
# 添加监控目录
curl -X POST http://localhost:3000/api/monitor/directory/add \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"directory": "/path/to/your/logs"}'
```

### 3. 启动监控服务

```bash
# 启动监控服务
curl -X POST http://localhost:3000/api/monitor/start \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 📁 支持的设备编号格式

系统支持以下设备编号格式（与现有系统完全一致）：

- `4371-01` (数字-数字)
- `ABC-12` (字母-数字)
- `123-XY` (数字-字母)
- `ABC-DEF` (字母-字母)
- `1234-56` (多位数字-数字)
- `A1-B2` (混合格式)
- `XYZ-999` (字母-多位数字)

## 🔧 配置说明

### 环境变量配置

```bash
# 监控服务配置
MONITOR_ENABLED=true                    # 启用监控服务
MONITOR_IGNORE_INITIAL=false           # 是否忽略初始扫描
MONITOR_DEPTH=3                        # 监控深度
MONITOR_STABILITY_THRESHOLD=2000       # 文件稳定阈值(毫秒)
MONITOR_POLL_INTERVAL=100              # 轮询间隔(毫秒)
MONITOR_LOG_LEVEL=info                 # 日志级别

# 自动上传配置
AUTO_UPLOAD_ENABLED=true               # 启用自动上传
AUTO_UPLOAD_SCAN_INTERVAL=5000         # 扫描间隔(毫秒)
AUTO_UPLOAD_MAX_RETRY=3                # 最大重试次数
AUTO_UPLOAD_MAX_FILE_SIZE=209715200    # 最大文件大小(字节)
AUTO_UPLOAD_BATCH_SIZE=10              # 批量处理大小

# 监控目录配置（JSON数组格式）
MONITOR_DIRECTORIES=["E:/microport/logtest","D:/logs"]
```

详细配置说明请参考：[MONITOR_ENV_CONFIG.md](./MONITOR_ENV_CONFIG.md)

### 配置文件

监控配置存储在 `backend/src/config/monitorConfig.js` 中，支持以下配置：

```javascript
{
  // 监控目录列表
  monitorDirectories: [
    "/path/to/logs/directory1",
    "/path/to/logs/directory2"
  ],
  
  // 自动上传配置
  autoUploadConfig: {
    enabled: true,
    scanInterval: 5000, // 5秒扫描间隔
    maxRetryAttempts: 3,
    supportedFileExtensions: ['.medbot'],
    maxFileSize: 200 * 1024 * 1024 // 200MB
  },
  
  // 监控服务配置
  monitorService: {
    enabled: false, // 默认关闭，需要手动启动
    watchOptions: {
      ignored: /(^|[\/\\])\../, // 忽略隐藏文件
      persistent: true,
      ignoreInitial: true,
      depth: 3
    }
  }
}
```

## 🔑 密钥获取策略

系统按以下优先级获取解密密钥：

1. **数据库查找**：根据设备编号在数据库中查找对应的`device_key`
2. **SystemInfo文件**：在同层级或上层级目录中查找`systeminfo.txt`文件，提取MAC地址
3. **跳过处理**：如果无法获取密钥，则跳过该文件的自动处理

## 📡 API接口

### 配置管理

```bash
# 获取监控配置
GET /api/monitor/config

# 更新监控配置
PUT /api/monitor/config

# 重置监控配置
POST /api/monitor/config/reset
```

### 服务控制

```bash
# 获取监控状态
GET /api/monitor/status

# 启动监控服务
POST /api/monitor/start

# 停止监控服务
POST /api/monitor/stop
```

### 目录管理

```bash
# 添加监控目录
POST /api/monitor/directory/add
Body: {"directory": "/path/to/directory"}

# 移除监控目录
POST /api/monitor/directory/remove
Body: {"directory": "/path/to/directory"}
```

### 文件管理

```bash
# 清理已处理的文件记录
POST /api/monitor/files/clear

# 重试失败的文件
POST /api/monitor/files/retry

# 获取支持的设备编号格式
GET /api/monitor/formats
```

## 🔍 监控流程

1. **目录监控**：使用chokidar监控配置的目录变化
2. **文件检测**：检测新增的文件夹和`.medbot`文件
3. **设备编号提取**：从文件夹路径中提取设备编号
4. **密钥获取**：按策略获取解密密钥
5. **自动上传**：调用现有的日志处理流程
6. **队列处理**：使用现有的Bull队列系统

## 📊 状态监控

### 监控状态信息

```json
{
  "config": {
    "monitorDirectories": ["/path/to/logs"],
    "autoUploadEnabled": true,
    "monitorEnabled": true,
    "scanInterval": 5000
  },
  "monitor": {
    "isRunning": true,
    "monitoredDirectories": ["/path/to/logs"],
    "processedFilesCount": 5
  },
  "processor": {
    "totalFiles": 10,
    "processing": 1,
    "completed": 8,
    "failed": 1
  }
}
```

## 🛠️ 故障排除

### 常见问题

1. **监控服务无法启动**
   - 检查监控目录是否存在
   - 确认有足够的文件系统权限
   - 查看日志中的错误信息

2. **设备编号无法识别**
   - 确认文件夹名符合设备编号格式
   - 检查正则表达式配置
   - 查看设备编号提取日志

3. **密钥获取失败**
   - 检查数据库中是否有设备记录
   - 确认systeminfo.txt文件存在且格式正确
   - 查看密钥提取日志

4. **文件处理失败**
   - 检查文件是否完整
   - 确认解密密钥正确
   - 查看队列处理日志

### 日志查看

```bash
# 查看监控服务日志
tail -f logs/operation-$(date +%Y-%m-%d).log

# 查看应用日志
npm run dev
```

## 🔒 权限要求

监控功能权限说明：

- **认证要求**：需要用户登录认证
- **权限要求**：无需特殊权限（后台自动运行功能）
- **系统权限**：文件系统读取权限、数据库访问权限

## 📈 性能优化

- 使用chokidar的高性能文件监控
- 批量处理文件变化
- 防抖机制避免重复处理
- 异步处理避免阻塞

## 🔄 与现有系统的集成

- 完全兼容现有的设备编号验证规则
- 复用现有的日志处理流程
- 使用现有的队列处理系统
- 保持相同的解密和解析逻辑

## 📝 注意事项

1. 监控服务默认关闭，需要手动启动
2. 建议在生产环境中谨慎使用
3. 定期清理已处理的文件记录
4. 监控大量文件时注意系统资源使用
5. 确保监控目录有足够的磁盘空间
