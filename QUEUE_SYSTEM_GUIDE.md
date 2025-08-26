# 日志处理队列系统使用指南

## 概述

本系统实现了基于 Redis + Bull 的异步队列处理系统，将日志上传和解析分离，提高系统的并发处理能力和稳定性。

## 系统架构

### 组件说明

1. **队列配置** (`backend/src/config/queue.js`)
   - Redis连接配置
   - Bull队列实例创建
   - 队列事件监听

2. **工作进程** (`backend/src/workers/logProcessor.js`)
   - 日志文件解密和解析逻辑
   - 数据库操作
   - 文件保存

3. **队列处理器** (`backend/src/workers/queueProcessor.js`)
   - 队列任务处理
   - 并发控制
   - 错误处理

4. **控制器修改** (`backend/src/controllers/logController.js`)
   - 上传接口改为异步队列处理
   - 队列状态查询接口

## 安装和配置

### 1. 安装依赖

```bash
cd backend
npm install bull redis
```

### 2. 安装Redis

#### Windows
```bash
# 下载并安装Redis for Windows
# 或使用WSL安装Redis
```

#### Linux/Mac
```bash
# Ubuntu/Debian
sudo apt-get install redis-server

# CentOS/RHEL
sudo yum install redis

# macOS
brew install redis
```

### 3. 配置环境变量

创建 `.env` 文件：

```env
# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# 队列配置
QUEUE_CONCURRENCY=3

# 其他配置...
```

## 启动系统

### 1. 启动Redis服务

```bash
# Windows
redis-server

# Linux/Mac
sudo systemctl start redis
# 或
redis-server
```

### 2. 启动主应用

```bash
cd backend
npm start
```

### 3. 启动队列工作进程

```bash
# 方法1: 使用批处理文件
start-queue-worker.bat

# 方法2: 直接运行
cd backend
node start-queue-worker.js
```

## 使用方式

### 1. 上传日志

上传流程保持不变，但现在：
- 文件上传后立即返回响应
- 处理任务加入队列异步执行
- 用户可以通过状态查询了解处理进度

### 2. 查看队列状态

```bash
# API接口
GET /api/logs/queue/status

# 返回格式
{
  "waiting": 5,
  "active": 2,
  "completed": 100,
  "failed": 3,
  "total": 110
}
```

### 3. 监控处理状态

- 通过日志列表查看文件处理状态
- 状态变化：`uploading` → `decrypting` → `parsing` → `parsed`
- 失败状态：`failed`

## 配置选项

### 并发控制

```javascript
// 在 .env 中设置
QUEUE_CONCURRENCY=3  // 同时处理3个文件
```

### 重试机制

```javascript
// 在队列配置中设置
defaultJobOptions: {
  attempts: 3,        // 重试3次
  backoff: {
    type: 'exponential',
    delay: 2000       // 初始延迟2秒
  }
}
```

### 任务优先级

```javascript
// 在添加任务时设置
await logProcessingQueue.add('process-log', data, {
  priority: 1,        // 高优先级
  delay: 0,           // 立即处理
  attempts: 3         // 重试3次
});
```

## 性能优化

### 1. 并发数调优

- **小文件**：可以设置较高的并发数（5-10）
- **大文件**：建议较低的并发数（2-3）
- **混合场景**：根据服务器配置调整

### 2. 内存管理

- 队列会自动清理完成的任务
- 保留最近100个完成的任务
- 保留最近50个失败的任务

### 3. 错误处理

- 自动重试机制
- 指数退避策略
- 详细的错误日志

## 监控和维护

### 1. 队列监控

```javascript
// 监听队列事件
logProcessingQueue.on('completed', (job, result) => {
  console.log(`任务 ${job.id} 完成`);
});

logProcessingQueue.on('failed', (job, err) => {
  console.error(`任务 ${job.id} 失败:`, err.message);
});
```

### 2. 性能监控

- 监控队列长度
- 监控处理时间
- 监控失败率

### 3. 故障恢复

- Redis重启后队列会自动恢复
- 失败的任务会自动重试
- 支持手动清理失败任务

## 故障排除

### 1. Redis连接失败

```bash
# 检查Redis服务状态
redis-cli ping

# 检查连接配置
redis-cli -h localhost -p 6379 ping
```

### 2. 队列任务卡住

```javascript
// 检查停滞的任务
const stalled = await logProcessingQueue.getStalled();
console.log('停滞任务:', stalled.length);
```

### 3. 内存不足

- 减少并发数
- 增加服务器内存
- 优化文件处理逻辑

## 优势

1. **高并发**：支持多用户同时上传
2. **稳定性**：失败自动重试
3. **可扩展**：可以启动多个工作进程
4. **监控**：详细的队列状态监控
5. **用户体验**：上传后立即响应

## 注意事项

1. **Redis依赖**：需要确保Redis服务正常运行
2. **资源消耗**：队列处理会消耗CPU和内存
3. **文件存储**：临时文件需要足够的磁盘空间
4. **网络延迟**：Redis网络延迟会影响队列性能
