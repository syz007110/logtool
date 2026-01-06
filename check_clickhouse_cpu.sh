#!/bin/bash
# ClickHouse CPU 高占用原因检查脚本

echo "=========================================="
echo "ClickHouse CPU 高占用原因检查"
echo "=========================================="
echo ""

echo "1. 检查合并操作（MergeTree 合并 - 最可能的原因）"
echo "----------------------------------------"
docker exec logtool-clickhouse-1 clickhouse-client --query "
SELECT 
    database,
    table,
    partition,
    num_parts,
    formatReadableSize(bytes_to_read) as size,
    progress,
    merge_reason
FROM system.merges
ORDER BY bytes_to_read DESC
LIMIT 10
FORMAT Vertical
" 2>/dev/null || echo "✅ 当前没有正在进行的合并操作"
echo ""

echo "2. 检查分区数量和表大小"
echo "----------------------------------------"
docker exec logtool-clickhouse-1 clickhouse-client --query "
SELECT 
    database,
    table,
    count() as partition_count,
    sum(rows) as total_rows,
    formatReadableSize(sum(bytes)) as total_size,
    min(min_date) as oldest_partition,
    max(max_date) as newest_partition
FROM system.parts
WHERE active = 1
GROUP BY database, table
ORDER BY partition_count DESC
FORMAT Vertical
" 2>/dev/null
echo ""

echo "3. 检查最近的查询活动（最近1小时）"
echo "----------------------------------------"
docker exec logtool-clickhouse-1 clickhouse-client --query "
SELECT 
    event_time,
    type,
    query_duration_ms / 1000 as duration_sec,
    read_rows,
    written_rows,
    formatReadableSize(read_bytes) as read_size,
    substring(query, 1, 100) as query_preview
FROM system.query_log
WHERE event_time > now() - INTERVAL 1 HOUR
    AND type = 'QueryFinish'
ORDER BY query_duration_ms DESC
LIMIT 10
FORMAT Vertical
" 2>/dev/null
echo ""

echo "4. 检查数据写入情况（最近1小时）"
echo "----------------------------------------"
docker exec logtool-clickhouse-1 clickhouse-client --query "
SELECT 
    event_time,
    written_rows,
    formatReadableSize(written_bytes) as written_size,
    query_duration_ms / 1000 as duration_sec,
    substring(query, 1, 80) as query_preview
FROM system.query_log
WHERE event_time > now() - INTERVAL 1 HOUR
    AND written_rows > 0
ORDER BY written_rows DESC
LIMIT 10
FORMAT Vertical
" 2>/dev/null || echo "✅ 最近1小时内没有数据写入"
echo ""

echo "5. 检查系统后台任务指标"
echo "----------------------------------------"
docker exec logtool-clickhouse-1 clickhouse-client --query "
SELECT 
    metric,
    value,
    description
FROM system.metrics
WHERE metric IN (
    'Query',
    'QueryThread',
    'Merge',
    'BackgroundPoolTask',
    'BackgroundMovePoolTask',
    'BackgroundFetchesPoolTask',
    'BackgroundCommonPoolTask',
    'BackgroundMergesAndMutationsPoolTask'
)
ORDER BY value DESC
FORMAT Vertical
" 2>/dev/null
echo ""

echo "6. 检查表引擎和配置"
echo "----------------------------------------"
docker exec logtool-clickhouse-1 clickhouse-client --query "
SELECT 
    database,
    table,
    engine,
    partition_key,
    sorting_key,
    formatReadableSize(total_bytes) as table_size
FROM system.tables
WHERE database = 'logtool'
FORMAT Vertical
" 2>/dev/null
echo ""

echo "=========================================="
echo "检查完成！"
echo ""
echo "分析提示："
echo "- 如果有合并操作（system.merges 有数据）→ 这是导致高 CPU 的主要原因"
echo "- 如果分区数很多（partition_count > 50）→ 分区过多导致频繁合并"
echo "- 如果有大量写入（written_rows 很大）→ 数据写入导致高 CPU"
echo "- 如果 BackgroundMergesAndMutationsPoolTask 值很高 → 后台合并任务过多"
echo "=========================================="

