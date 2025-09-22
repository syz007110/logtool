# 队列与进程分配机制分析

## 问题分析

你遇到的问题是：**进行批量删除时，监控页面每个进程都显示0**。这是因为当前的监控逻辑存在以下问题：

## 1. 队列分配机制

### 当前系统有四个主要队列：

1. **logProcessingQueue** (通用队列)
   - 处理：批量删除、批量重新解析、单个删除
   - 并发数：3个进程
   - 优先级：默认

2. **realtimeProcessingQueue** (实时处理队列)
   - 处理：用户手动上传的日志
   - 并发数：2个进程
   - 优先级：高 (priority: 10)

3. **historicalProcessingQueue** (历史处理队列)
   - 处理：自动上传的历史日志
   - 并发数：1个进程
   - 优先级：低 (priority: 1)

4. **surgeryAnalysisQueue** (手术分析队列)
   - 处理：手术数据统计分析
   - 并发数：3个进程
   - 优先级：默认
   - 超时时间：10分钟 (600000ms)

### 批量删除使用的队列：

```javascript
// 在 logController.js 中
const job = await logProcessingQueue.add('batch-delete', {
  logIds: numericLogIds,
  userId: req.user ? req.user.id : null
});
```

**批量删除使用的是 `logProcessingQueue`，并发数为3个进程。**

## 2. 监控显示问题的根本原因

### 问题1：任务分配算法过于简化

在 `monitoringController.js` 中：

```javascript
// 当前的问题代码
process.tasks.active = Math.floor(activeJobs / workerCount);
process.tasks.waiting = Math.floor(waitingJobs / workerCount);
```

**问题**：
- 这是简单的平均分配，没有考虑实际的队列分配
- 没有区分不同队列的任务
- 没有考虑进程的实际角色和职责

### 问题2：进程角色分配不准确

当前系统使用智能调度器，进程有不同的角色：

1. **monitor** - 负责目录监控，也参与各队列任务
2. **userRequest** - 用户进程，不参与历史处理队列任务，其他队列任务都参与
3. **通用进程** (role=null) - 参与所有队列任务

但是监控显示时没有正确反映这些角色。

## 3. 实际的队列-进程分配逻辑

### 智能调度器分配策略：

```javascript
// 高峰时段 (08:00-01:59)
peak: {
  monitorWorkers: 1,         // 1个进程负责监控
  historyLogWorkers: 1,      // 1个进程处理历史日志
  userRequestWorkers: null   // 其余处理用户请求
}

// 非高峰时段 (02:00-07:00)
offPeak: {
  monitorWorkers: 1,         // 1个进程负责监控
  historyLogWorkers: 0.5,    // 50%进程处理历史日志
  userRequestWorkers: 0.5    // 50%进程处理用户请求
}
```

### 队列处理器配置：

```javascript
// logProcessingQueue - 3个并发进程
logProcessingQueue.process('batch-delete', 1, async (job) => {
  // 批量删除处理
});

// realtimeProcessingQueue - 2个并发进程
realtimeProcessingQueue.process('process-log', REALTIME_CONCURRENCY, async (job) => {
  // 实时处理
});

// historicalProcessingQueue - 1个并发进程
historicalProcessingQueue.process('process-log', HISTORICAL_CONCURRENCY, async (job) => {
  // 历史处理
});
```

## 4. 为什么批量删除时显示0

### 原因分析：

1. **任务正在处理中**：批量删除任务被添加到 `logProcessingQueue`，但可能正在处理中，不在等待队列里
2. **任务已完成**：批量删除是短时间任务，可能已经完成，被移除了
3. **监控逻辑错误**：当前监控逻辑没有正确获取实际的任务分配情况

### 实际的任务流程：

```
用户发起批量删除 → logProcessingQueue.add('batch-delete') → 
logProcessingQueue.process('batch-delete', 1, ...) → 
batchDeleteLogs(job) → 任务完成
```

## 5. 建议的解决方案

### 方案1：改进监控逻辑

修改 `monitoringController.js` 中的 `getProcessTaskStats` 方法：

```javascript
// 获取每个队列的实际任务分配
const logActiveJobs = await logProcessingQueue.getActive();
const logWaitingJobs = await logProcessingQueue.getWaiting();

// 根据进程角色分配任务
processStats.forEach(process => {
  if (process.role === 'monitor') {
    // 监控进程：也参与各队列任务
    process.tasks.active = logActiveJobs.length + realtimeActiveJobs.length + historicalActiveJobs.length + surgeryActiveJobs.length;
    process.tasks.waiting = logWaitingJobs.length + realtimeWaitingJobs.length + historicalWaitingJobs.length + surgeryWaitingJobs.length;
  } else if (process.role === 'userRequest') {
    // 用户进程：不参与历史处理队列任务，其他队列任务都参与
    process.tasks.active = logActiveJobs.length + realtimeActiveJobs.length + surgeryActiveJobs.length;
    process.tasks.waiting = logWaitingJobs.length + realtimeWaitingJobs.length + surgeryWaitingJobs.length;
  } else {
    // 通用进程：参与所有队列任务
    process.tasks.active = logActiveJobs.length + realtimeActiveJobs.length + historicalActiveJobs.length + surgeryActiveJobs.length;
    process.tasks.waiting = logWaitingJobs.length + realtimeWaitingJobs.length + historicalWaitingJobs.length + surgeryWaitingJobs.length;
  }
});
```

### 方案2：添加任务状态追踪

在批量删除处理过程中添加状态更新：

```javascript
async function batchDeleteLogs(job) {
  // 更新任务状态
  await job.updateProgress(0);
  
  // 处理过程中更新进度
  for (let i = 0; i < logIds.length; i++) {
    await job.updateProgress(Math.floor((i / logIds.length) * 100));
    // ... 删除逻辑
  }
  
  // 完成后更新状态
  await job.updateProgress(100);
}
```

## 6. 总结

**批量删除显示0的原因**：
1. 批量删除使用 `logProcessingQueue`，有3个并发进程
2. 任务可能正在处理中或已完成，不在等待队列
3. 当前监控逻辑过于简化，没有正确反映实际的任务分配

**解决方案**：
1. 改进监控逻辑，根据进程角色正确分配任务统计
2. 添加任务状态追踪，实时显示处理进度
3. 区分不同队列的任务，提供更准确的监控信息
