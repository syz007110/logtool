-- PostgreSQL手术统计表脚本
-- 专门用于PostgreSQL数据库，包含PostgreSQL特有的数据类型和功能

-- 连接到logtool数据库
-- 注意：请确保PostgreSQL中已创建logtool数据库

-- 1. 手术统计主表
CREATE TABLE IF NOT EXISTS surgeries (
    id SERIAL PRIMARY KEY,
    surgery_id VARCHAR(50) UNIQUE NOT NULL,
    device_ids INTEGER[],               -- 使用PostgreSQL数组类型存储设备ID
    start_time TIMESTAMP NULL,
    end_time TIMESTAMP NULL,
    is_remote BOOLEAN DEFAULT FALSE,
    structured_data JSONB,              -- 使用JSONB类型存储手术结构化数据
    last_analyzed_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. 手术版本记录表
CREATE TABLE IF NOT EXISTS surgery_versions (
    id SERIAL PRIMARY KEY,
    surgery_id INTEGER NOT NULL,
    structured_data JSONB,
    source_logs INTEGER[],              -- 使用PostgreSQL数组类型存储日志文件ID
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    FOREIGN KEY (surgery_id) REFERENCES surgeries(id) ON DELETE CASCADE
);

-- 3. 创建索引
CREATE INDEX IF NOT EXISTS idx_surgeries_start_time ON surgeries(start_time);
CREATE INDEX IF NOT EXISTS idx_surgeries_end_time ON surgeries(end_time);
CREATE INDEX IF NOT EXISTS idx_surgeries_surgery_id ON surgeries(surgery_id);
CREATE INDEX IF NOT EXISTS idx_surgery_versions_surgery_id ON surgery_versions(surgery_id);

-- 4. 显示创建结果
SELECT 'PostgreSQL手术统计表创建完成！' AS message;
SELECT 'surgeries' AS table_name, COUNT(*) AS count FROM surgeries
UNION ALL
SELECT 'surgery_versions' AS table_name, COUNT(*) AS count FROM surgery_versions;

-- 5. 验证表结构
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name IN ('surgeries', 'surgery_versions')
ORDER BY table_name, ordinal_position;
