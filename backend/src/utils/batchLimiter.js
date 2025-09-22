/**
 * 后台任务批处理限流器
 * 实现每批最多处理指定数量的文件夹或压缩包
 */

class BatchLimiter {
  constructor(config = {}) {
    this.maxBatchSize = config.maxBatchSize || parseInt(process.env.BACKGROUND_BATCH_SIZE) || 5;
    this.batchTimeout = config.batchTimeout || parseInt(process.env.BACKGROUND_BATCH_TIMEOUT) || 300000;
    this.checkInterval = config.checkInterval || parseInt(process.env.BACKGROUND_BATCH_CHECK_INTERVAL) || 10000;
    
    // 批处理状态
    this.currentBatch = [];
    this.pendingTasks = [];
    this.isProcessing = false;
    this.batchStartTime = null;
    this.batchId = 0;
    
    // 统计信息
    this.stats = {
      totalBatches: 0,
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageBatchTime: 0
    };
    
    console.log(`🔄 批处理限流器初始化: 每批最多${this.maxBatchSize}个任务, 超时${this.batchTimeout}ms`);
  }
  
  /**
   * 添加任务到批处理队列
   * @param {Object} task - 任务对象
   * @param {Function} processor - 任务处理函数
   */
  async addTask(task, processor) {
    const taskInfo = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      task: task,
      processor: processor,
      status: 'pending',
      addedAt: Date.now()
    };
    
    this.pendingTasks.push(taskInfo);
    this.stats.totalTasks++;
    
    console.log(`📝 添加任务到批处理队列: ${taskInfo.id}, 待处理: ${this.pendingTasks.length}`);
    
    // 如果当前批次未满且未在处理，开始处理
    if (this.currentBatch.length < this.maxBatchSize && !this.isProcessing) {
      await this.processNextBatch();
    }
  }
  
  /**
   * 处理下一批任务
   */
  async processNextBatch() {
    if (this.isProcessing) {
      console.log(`⏳ 当前批次正在处理中，跳过`);
      return;
    }
    
    if (this.pendingTasks.length === 0) {
      console.log(`✅ 没有待处理任务`);
      return;
    }
    
    this.isProcessing = true;
    this.batchId++;
    this.batchStartTime = Date.now();
    
    // 从待处理队列中取出最多maxBatchSize个任务
    this.currentBatch = this.pendingTasks.splice(0, this.maxBatchSize);
    
    console.log(`🚀 开始处理批次 ${this.batchId}: ${this.currentBatch.length}个任务`);
    console.log(`📊 批次统计: 总批次数=${this.stats.totalBatches + 1}, 待处理=${this.pendingTasks.length}`);
    
    try {
      // 并发处理当前批次的所有任务
      const results = await Promise.allSettled(
        this.currentBatch.map(taskInfo => this.processTask(taskInfo))
      );
      
      // 统计结果
      let completed = 0;
      let failed = 0;
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          completed++;
          this.stats.completedTasks++;
        } else {
          failed++;
          this.stats.failedTasks++;
          console.error(`❌ 批次任务失败: ${this.currentBatch[index].id}`, result.reason);
        }
      });
      
      const batchTime = Date.now() - this.batchStartTime;
      this.stats.totalBatches++;
      this.stats.averageBatchTime = (this.stats.averageBatchTime * (this.stats.totalBatches - 1) + batchTime) / this.stats.totalBatches;
      
      console.log(`✅ 批次 ${this.batchId} 完成: 成功=${completed}, 失败=${failed}, 耗时=${batchTime}ms`);
      console.log(`📈 总体统计: 总任务=${this.stats.totalTasks}, 完成=${this.stats.completedTasks}, 失败=${this.stats.failedTasks}, 平均批次时间=${Math.round(this.stats.averageBatchTime)}ms`);
      
    } catch (error) {
      console.error(`❌ 批次 ${this.batchId} 处理失败:`, error);
    } finally {
      this.isProcessing = false;
      this.currentBatch = [];
      this.batchStartTime = null;
      
      // 批次完成，处理下一批
      if (this.pendingTasks.length > 0) {
        console.log(`🔄 批次完成，开始处理下一批: ${this.pendingTasks.length}个待处理任务`);
        setTimeout(() => this.processNextBatch(), 1000); // 延迟1秒开始下一批
      }
    }
  }
  
  /**
   * 处理单个任务
   * @param {Object} taskInfo - 任务信息
   */
  async processTask(taskInfo) {
    try {
      taskInfo.status = 'processing';
      taskInfo.startedAt = Date.now();
      
      console.log(`🔄 处理任务: ${taskInfo.id}`);
      
      const result = await taskInfo.processor(taskInfo.task);
      
      taskInfo.status = 'completed';
      taskInfo.completedAt = Date.now();
      taskInfo.processingTime = taskInfo.completedAt - taskInfo.startedAt;
      
      console.log(`✅ 任务完成: ${taskInfo.id}, 耗时=${taskInfo.processingTime}ms`);
      
      return result;
      
    } catch (error) {
      taskInfo.status = 'failed';
      taskInfo.failedAt = Date.now();
      taskInfo.error = error.message;
      
      console.error(`❌ 任务失败: ${taskInfo.id}`, error.message);
      
      throw error;
    }
  }
  
  /**
   * 获取批处理状态
   */
  getStatus() {
    return {
      isProcessing: this.isProcessing,
      currentBatchSize: this.currentBatch.length,
      pendingTasks: this.pendingTasks.length,
      batchId: this.batchId,
      batchStartTime: this.batchStartTime,
      stats: { ...this.stats }
    };
  }
  
  /**
   * 强制处理下一批（用于超时处理）
   */
  async forceProcessNextBatch() {
    if (this.isProcessing && this.batchStartTime) {
      const elapsed = Date.now() - this.batchStartTime;
      if (elapsed > this.batchTimeout) {
        console.warn(`⏰ 批次 ${this.batchId} 超时 (${elapsed}ms > ${this.batchTimeout}ms)，强制结束`);
        this.isProcessing = false;
        this.currentBatch = [];
        this.batchStartTime = null;
        
        // 处理下一批
        if (this.pendingTasks.length > 0) {
          await this.processNextBatch();
        }
      }
    }
  }
  
  /**
   * 启动超时检查
   */
  startTimeoutCheck() {
    setInterval(() => {
      this.forceProcessNextBatch();
    }, this.checkInterval);
  }
  
  /**
   * 清理资源
   */
  cleanup() {
    this.currentBatch = [];
    this.pendingTasks = [];
    this.isProcessing = false;
    this.batchStartTime = null;
    console.log(`🧹 批处理限流器已清理`);
  }
}

module.exports = BatchLimiter;
