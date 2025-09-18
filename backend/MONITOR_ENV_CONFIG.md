# 监控功能环境变量配置说明

## 📋 环境变量列表

### 监控服务配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `MONITOR_ENABLED` | `false` | 是否启用监控服务 |
| `MONITOR_IGNORE_INITIAL` | `true` | 是否忽略初始扫描 |
| `MONITOR_DEPTH` | `3` | 监控深度 |
| `MONITOR_STABILITY_THRESHOLD` | `2000` | 文件稳定阈值(毫秒) |
| `MONITOR_POLL_INTERVAL` | `100` | 轮询间隔(毫秒) |
| `MONITOR_LOG_LEVEL` | `info` | 日志级别 |

### 自动上传配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `AUTO_UPLOAD_ENABLED` | `true` | 是否启用自动上传 |
| `AUTO_UPLOAD_SCAN_INTERVAL` | `5000` | 扫描间隔(毫秒) |
| `AUTO_UPLOAD_MAX_RETRY` | `3` | 最大重试次数 |
| `AUTO_UPLOAD_MAX_FILE_SIZE` | `209715200` | 最大文件大小(字节) |
| `AUTO_UPLOAD_BATCH_SIZE` | `10` | 批量处理大小 |

### 监控目录配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `MONITOR_DIRECTORIES` | `["E:/microport/logtest"]` | 监控目录列表(JSON格式) |

## 🔧 配置示例

### 在 .env 文件中添加：

```bash
# 监控服务配置
MONITOR_ENABLED=true
MONITOR_IGNORE_INITIAL=false
MONITOR_DEPTH=3
MONITOR_STABILITY_THRESHOLD=2000
MONITOR_POLL_INTERVAL=100
MONITOR_LOG_LEVEL=info

# 自动上传配置
AUTO_UPLOAD_ENABLED=true
AUTO_UPLOAD_SCAN_INTERVAL=5000
AUTO_UPLOAD_MAX_RETRY=3
AUTO_UPLOAD_MAX_FILE_SIZE=209715200
AUTO_UPLOAD_BATCH_SIZE=10

# 监控目录配置
MONITOR_DIRECTORIES=["E:/microport/logtest","D:/logs"]
```

### 通过命令行设置：

```bash
# Windows
set MONITOR_ENABLED=true
set MONITOR_DIRECTORIES=["E:/microport/logtest"]
npm start

# Linux/Mac
export MONITOR_ENABLED=true
export MONITOR_DIRECTORIES='["E:/microport/logtest"]'
npm start
```

## 🎯 配置优先级

1. **环境变量** (最高优先级)
2. **配置文件默认值** (最低优先级)

## 📝 注意事项

- 所有数值类型的环境变量都会自动转换为相应的数据类型
- 布尔值使用 `true`/`false` 字符串
- 数组类型使用JSON格式字符串
- 如果环境变量不存在，将使用配置文件中的默认值
