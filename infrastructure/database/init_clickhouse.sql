-- ========================================
-- ClickHouse log_entries 表初始化脚本
-- ========================================
-- 执行方式：
--   clickhouse-client < init_clickhouse.sql
--   或
--   clickhouse-client --multiquery < init_clickhouse.sql
-- ========================================

-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS logtool;

-- 切换到 logtool 数据库
USE logtool;

-- ========================================
-- 创建 log_entries 表
-- ========================================
-- 表结构说明：
--   - log_id: 关联 MySQL logs.id
--   - timestamp: 日志时间（用于分区）
--   - error_code: 故障码（低基数优化）
--   - param1-4: 参数字段
--   - explanation: 释义内容（启用压缩）
--   - subsystem_char: 子系统标识（在 Node.js 中计算）
--   - code4: 规范化故障码（在 Node.js 中计算）
--   - version: 日志版本号（用于多版本管理）
--   - row_index: 原始行号（用于稳定排序和定位）
--   - created_at: 创建时间（用于 TTL 清理）
-- ========================================
CREATE TABLE IF NOT EXISTS log_entries
(
    log_id UInt32 COMMENT '关联 MySQL logs.id',
    timestamp DateTime COMMENT '日志时间',

    error_code LowCardinality(String) COMMENT '故障码',
    param1 String,
    param2 String,
    param3 String,
    param4 String,

    explanation String CODEC(ZSTD(3)) ,

    subsystem_char LowCardinality(FixedString(1)) COMMENT '子系统标识(1-9,A-F)',
    code4 FixedString(6) COMMENT '规范化故障码(0Xxxxx)',

    version UInt32 COMMENT '日志版本号',
        row_index UInt32 COMMENT '原始行号',

    created_at DateTime DEFAULT now()
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (log_id, version, timestamp, row_index)
TTL created_at + INTERVAL 6 MONTH DELETE
SETTINGS index_granularity = 8192;
-- ========================================
-- 创建索引（优化查询性能）
-- ========================================

-- 索引：加速按规范化码查询（用于 JOIN error_codes）
CREATE INDEX IF NOT EXISTS idx_le_norm ON log_entries(subsystem_char, code4) TYPE minmax GRANULARITY 4;

-- ========================================
-- 验证表创建
-- ========================================

-- 显示表结构
SHOW CREATE TABLE log_entries;

-- 显示表信息
SELECT 
    name,
    type,
    comment
FROM system.columns 
WHERE database = 'logtool' AND table = 'log_entries'
ORDER BY position;

-- 显示完成信息
SELECT 'ClickHouse log_entries 表创建完成！' AS message;

