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


-- ========================================
-- 步骤3：为 logs 表添加基于文件名的时间生成列
-- ========================================
-- 预计时间：与数据量相关（建议在维护窗口执行）

ALTER TABLE logs
  ADD COLUMN file_time_token CHAR(12)
    GENERATED ALWAYS AS (
      CASE
        WHEN original_name REGEXP '^[0-9]{10,12}_'
          AND LOCATE('_', original_name) > 0
          THEN
            -- 对 10 位字符串补齐到 12 位，方便后续统一处理
            LPAD(LEFT(original_name, LOCATE('_', original_name) - 1), 12, '0')
        ELSE NULL
      END
    ) STORED
    COMMENT '从文件名提取的时间前缀(YYYYMMDDhh[mm])，不足 12 位时左侧补 0',
  ADD COLUMN file_year SMALLINT
    GENERATED ALWAYS AS (
      CASE
        WHEN original_name REGEXP '^[0-9]{10,12}_'
          THEN CAST(SUBSTRING(original_name, 1, 4) AS UNSIGNED)
        ELSE NULL
      END
    ) STORED
    COMMENT '文件名中的年份',
  ADD COLUMN file_month TINYINT UNSIGNED
    GENERATED ALWAYS AS (
      CASE
        WHEN original_name REGEXP '^[0-9]{10,12}_'
          THEN CAST(SUBSTRING(original_name, 5, 2) AS UNSIGNED)
        ELSE NULL
      END
    ) STORED
    COMMENT '文件名中的月份',
  ADD COLUMN file_day TINYINT UNSIGNED
    GENERATED ALWAYS AS (
      CASE
        WHEN original_name REGEXP '^[0-9]{10,12}_'
          THEN CAST(SUBSTRING(original_name, 7, 2) AS UNSIGNED)
        ELSE NULL
      END
    ) STORED
    COMMENT '文件名中的日期',
  ADD COLUMN file_hour TINYINT UNSIGNED
    GENERATED ALWAYS AS (
      CASE
        WHEN original_name REGEXP '^[0-9]{10,12}_'
          THEN CAST(SUBSTRING(original_name, 9, 2) AS UNSIGNED)
        ELSE NULL
      END
    ) STORED
    COMMENT '文件名中的小时',
  ADD COLUMN file_minute TINYINT UNSIGNED
    GENERATED ALWAYS AS (
      CASE
        WHEN original_name REGEXP '^[0-9]{12}_'
          THEN CAST(SUBSTRING(original_name, 11, 2) AS UNSIGNED)
        ELSE NULL
      END
    ) STORED
    COMMENT '文件名中的分钟(存在时)',
  ALGORITHM=COPY,
  LOCK=SHARED;

-- 显示步骤3完成时间
SELECT NOW() as step3_completed, 'logs 表生成列添加完成' as status;


-- ========================================
-- 步骤4：为新生成列创建索引
-- ========================================
-- 预计时间：视表大小 2-5 分钟

CREATE INDEX idx_logs_file_time ON logs(file_year, file_month, file_day, file_hour, file_minute);
CREATE INDEX idx_logs_file_token ON logs(file_time_token);

-- 显示步骤4完成时间
SELECT NOW() as step4_completed, 'logs 表索引创建完成' as status;
-- PostgreSQL手术表生成列脚本
-- 用于从surgery_id字段提取年、月、日，以便进行时间筛选
-- 注意：请确保PostgreSQL中已存在surgeries表
-- surgery_id格式：设备编号-YYYYMMDDhhmm（例如：4371-51-202509231306）

-- 1. 添加生成列：start_year (从surgery_id提取年份)
-- 从surgery_id的最后12位数字中提取前4位作为年份
-- 使用RIGHT和SUBSTRING函数提取，这些函数都是不可变的
-- 注意：surgery_id格式必须是 设备编号-YYYYMMDDhhmm
-- 使用CASE WHEN确保surgery_id长度足够，避免提取失败
ALTER TABLE surgeries
  ADD COLUMN IF NOT EXISTS start_year INTEGER
    GENERATED ALWAYS AS (
      CASE 
        WHEN surgery_id IS NOT NULL AND LENGTH(surgery_id) >= 12 THEN
          (SUBSTRING(RIGHT(surgery_id, 12) FROM 1 FOR 4))::INTEGER
        ELSE NULL
      END
    ) STORED;

-- 2. 添加生成列：start_month (从surgery_id提取月份)
-- 从surgery_id的最后12位数字中提取第5-6位作为月份
ALTER TABLE surgeries
  ADD COLUMN IF NOT EXISTS start_month INTEGER
    GENERATED ALWAYS AS (
      CASE 
        WHEN surgery_id IS NOT NULL AND LENGTH(surgery_id) >= 12 THEN
          (SUBSTRING(RIGHT(surgery_id, 12) FROM 5 FOR 2))::INTEGER
        ELSE NULL
      END
    ) STORED;

-- 3. 添加生成列：start_day (从surgery_id提取日期)
-- 从surgery_id的最后12位数字中提取第7-8位作为日期
ALTER TABLE surgeries
  ADD COLUMN IF NOT EXISTS start_day INTEGER
    GENERATED ALWAYS AS (
      CASE 
        WHEN surgery_id IS NOT NULL AND LENGTH(surgery_id) >= 12 THEN
          (SUBSTRING(RIGHT(surgery_id, 12) FROM 7 FOR 2))::INTEGER
        ELSE NULL
      END
    ) STORED;

-- 4. 创建索引以优化查询性能
CREATE INDEX IF NOT EXISTS idx_surgeries_start_year ON surgeries(start_year) WHERE start_year IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_surgeries_start_year_month ON surgeries(start_year, start_month) WHERE start_year IS NOT NULL AND start_month IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_surgeries_start_year_month_day ON surgeries(start_year, start_month, start_day) WHERE start_year IS NOT NULL AND start_month IS NOT NULL AND start_day IS NOT NULL;

-- 5. 显示创建结果
SELECT 'PostgreSQL手术表生成列创建完成！' AS message;

-- 6. 验证生成列
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'surgeries'
  AND column_name IN ('start_year', 'start_month', 'start_day')
ORDER BY ordinal_position;

-- 7. 测试生成列（可选）
-- SELECT 
--   surgery_id,
--   start_year,
--   start_month,
--   start_day
-- FROM surgeries
-- WHERE surgery_id IS NOT NULL
-- LIMIT 10;

-- ========================================
-- 8. 多密钥管理数据迁移：将现有 devices.device_key 迁移到 device_keys 表
-- ========================================
-- 为每个已有密钥的设备创建一条默认密钥记录
-- 注意：此迁移脚本可以安全地多次执行（使用 NOT EXISTS 避免重复迁移）

INSERT INTO device_keys (device_id, key_value, valid_from_date, valid_to_date, is_default, priority, description, created_at, updated_at)
SELECT 
  device_id,
  device_key,
  '1970-01-01' AS valid_from_date,  -- 从最早日期开始生效
  NULL AS valid_to_date,              -- 永久有效
  TRUE AS is_default,                 -- 标记为默认密钥
  0 AS priority,                      -- 默认优先级
  '从devices表迁移的默认密钥' AS description,
  created_at,
  updated_at
FROM devices
WHERE device_key IS NOT NULL 
  AND device_key != ''
  AND NOT EXISTS (
    -- 避免重复迁移
    SELECT 1 FROM device_keys dk 
    WHERE dk.device_id = devices.device_id 
      AND dk.key_value = devices.device_key
  );

-- 显示迁移统计
SELECT 
  'device_keys迁移统计' AS info,
  (SELECT COUNT(*) FROM devices WHERE device_key IS NOT NULL AND device_key != '') AS devices_with_key,
  (SELECT COUNT(*) FROM device_keys) AS migrated_keys;

