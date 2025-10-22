-- ========================================
-- 直接添加生成列到 log_entries 表
-- ========================================
-- 方法：ALGORITHM=COPY（会锁表重建）
-- 适用：在维护窗口执行，预计锁表时间 5-15 分钟
-- 数据量：5,316,493 条记录
-- 
-- 执行前准备：
--   1. 选择低峰期或维护窗口（建议凌晨 2-5 点）
--   2. 通知用户系统维护
--   3. 备份数据库（可选但推荐）
--   4. 停止或暂停写入 log_entries 的服务（可选）
--
-- 执行方式：
--   mysql -u username -p logtool < add_generated_columns_direct.sql
--
-- 预期时间：
--   - ALTER TABLE: 5-15 分钟（视服务器性能）
--   - CREATE INDEX: 2-5 分钟
--   - 总计：7-20 分钟
-- ========================================

USE logtool;

-- 设置超时参数（避免超时断开）
SET SESSION wait_timeout = 28800;           -- 8小时
SET SESSION interactive_timeout = 28800;    -- 8小时
SET SESSION lock_wait_timeout = 7200;       -- 2小时

-- 显示开始时间
SELECT NOW() as start_time, '开始添加生成列' as status;


-- ========================================
-- 步骤1：添加生成列（这是关键步骤，会锁表）
-- ========================================
-- 预计时间：5-15 分钟
-- 期间表会被锁定，无法读写

ALTER TABLE log_entries
  ADD COLUMN subsystem_char CHAR(1)
    GENERATED ALWAYS AS (
      CASE
        WHEN (LEFT(error_code,1) IN ('1','2','3','4','5','6','7','8','9','A')) THEN LEFT(error_code,1)
        ELSE NULL
      END
    ) STORED
    COMMENT '故障码首字符(子系统)，用于快速联表到error_codes',
  ADD COLUMN code4 CHAR(6)
    GENERATED ALWAYS AS (
      CONCAT('0X', UPPER(RIGHT(error_code,4)))
    ) STORED
    COMMENT '规范化故障码(0X+4位)，用于快速联表到error_codes',
  ALGORITHM=COPY,
  LOCK=SHARED;  -- 允许读，阻止写

-- 显示步骤1完成时间
SELECT NOW() as step1_completed, '生成列添加完成' as status;


-- ========================================
-- 步骤2：创建索引
-- ========================================
-- 预计时间：2-5 分钟
-- 索引用于加速 JOIN error_codes(subsystem, code)

CREATE INDEX idx_le_norm ON log_entries(subsystem_char, code4);

-- 显示步骤2完成时间
SELECT NOW() as step2_completed, '索引创建完成' as status;
