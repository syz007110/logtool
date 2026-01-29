/**
 * 分页相关常量
 * 
 * 重要说明：
 * - MAX_PAGE_SIZE 指的是每页最多能返回多少条数据（limit 参数的最大值）
 * - 不是指最多有多少页，总页数 = total / limit，理论上没有上限
 * 
 * 为什么需要限制 limit 的最大值？
 * 1. 防止 DoS 攻击：恶意用户可能请求 limit=100000，即使后端分页也会对数据库造成压力
 * 2. 数据库性能：大 offset 会影响查询性能（特别是没有索引时）
 * 3. 网络传输：单次返回大量数据会影响网络传输和前端渲染性能
 * 4. 内存占用：返回的数据需要序列化、传输、反序列化，占用服务器和客户端内存
 * 
 * 即使使用 LIMIT/OFFSET 进行数据库层分页，也需要限制单次请求的最大数据量。
 */

// 默认分页大小（每页返回多少条数据）
const DEFAULT_PAGE_SIZE = 20;

// 默认页码（从 1 开始）
const DEFAULT_PAGE = 1;

// 不同场景的每页最大数据量限制（limit 参数的最大值）
// 例如：MAX_PAGE_SIZE.DEVICE_GROUP = 200 表示单次请求最多返回 200 条设备记录
const MAX_PAGE_SIZE = {
  // 设备分组列表（日志管理、手术数据）：中等限制
  DEVICE_GROUP: 200,
  
  // 普通列表（日志列表、手术列表）：标准限制
  STANDARD: 100,
  
  // 故障案例列表：标准限制
  FAULT_CASE: 100,
  
  // 设备型号列表：标准限制
  DEVICE_MODEL: 100,
  
  // Jira 搜索：较小限制（因为需要调用外部 API）
  JIRA: 50,
  
  // 反馈列表：标准限制
  FEEDBACK: 100,
  
  // 批量查询（日志条目）：较大限制（用于批量分析）
  BATCH_ENTRIES: 1000,
  
  // 统计查询：较大限制
  STATISTICS: 1000
};

/**
 * 规范化分页参数
 * @param {number|string} page - 页码（从 1 开始）
 * @param {number|string} limit - 每页返回的数据条数
 * @param {number} maxLimit - 每页最大数据量限制（默认使用 STANDARD）
 * @returns {{page: number, limit: number}} 规范化后的页码和每页数量
 * 
 * 示例：
 * - normalizePagination(1, 50, 100) => { page: 1, limit: 50 }
 * - normalizePagination(1, 200, 100) => { page: 1, limit: 100 } (被限制为最大值)
 * - normalizePagination(0, 20, 100) => { page: 1, limit: 20 } (页码最小为 1)
 */
function normalizePagination(page, limit, maxLimit = MAX_PAGE_SIZE.STANDARD) {
  const pageNum = Math.max(parseInt(page, 10) || DEFAULT_PAGE, DEFAULT_PAGE);
  const limitNum = Math.min(
    Math.max(parseInt(limit, 10) || DEFAULT_PAGE_SIZE, 1),
    maxLimit
  );
  return { page: pageNum, limit: limitNum };
}

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  normalizePagination
};

