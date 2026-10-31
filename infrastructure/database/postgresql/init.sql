-- PostgreSQL 初始化脚本
-- 面向空库 logtool 重建。连接该库后执行一次。
-- 包含会话与任务、手术统计、知识库表。不包含历史数据迁移。

BEGIN;

-- Agent Orchestrator PostgreSQL 初始化脚本
-- 说明：
-- 1) 本脚本负责会话层与任务治理（PG）
-- 2) 包含会话三层表 + 任务主表 + 任务事件表
-- 3) Phase 1 暂不启用 agent_run；一次用户消息对应一个 agent_task，由 agent_event 记录轻量状态流水

-- 自动更新时间触发函数
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 任务主表：任务身份、幂等、主状态
CREATE TABLE IF NOT EXISTS agent_task (
  id BIGSERIAL PRIMARY KEY,
  task_id VARCHAR(80) NOT NULL UNIQUE,
  canonical_id CHAR(64) NOT NULL UNIQUE,
  source_idempotency_key TEXT NOT NULL,

  status VARCHAR(24) NOT NULL,
  trace_id VARCHAR(120) NOT NULL,
  request_id VARCHAR(120) NOT NULL,
  channel_type VARCHAR(24) NOT NULL,
  conversation_id VARCHAR(120) NOT NULL,
  instance_id BIGINT NULL,
  queue_job_id VARCHAR(300) NULL,
  thread_id VARCHAR(120) NULL,
  user_id VARCHAR(120) NOT NULL,

  request_snapshot JSONB NULL,
  response_snapshot JSONB NULL,
  error_snapshot JSONB NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (status IN ('queued', 'running', 'waiting_user', 'retry_wait', 'completed', 'failed', 'cancelled', 'degraded'))
);

-- 任务事件表：记录任务状态流转、入队、执行开始/完成、失败原因等轻量审计事件
CREATE TABLE IF NOT EXISTS agent_event (
  id BIGSERIAL PRIMARY KEY,
  event_id VARCHAR(90) NOT NULL UNIQUE,
  task_id VARCHAR(80) NOT NULL REFERENCES agent_task(task_id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL,
  from_status VARCHAR(24) NULL,
  to_status VARCHAR(24) NULL,
  reason VARCHAR(120) NULL,
  trace_id VARCHAR(120) NULL,
  request_id VARCHAR(120) NULL,
  payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_status IS NULL OR from_status IN ('queued', 'running', 'waiting_user', 'retry_wait', 'completed', 'failed', 'cancelled', 'degraded')),
  CHECK (to_status IS NULL OR to_status IN ('queued', 'running', 'waiting_user', 'retry_wait', 'completed', 'failed', 'cancelled', 'degraded'))
);

-- 索引：调度、检索、追踪
CREATE INDEX IF NOT EXISTS idx_agent_task_status ON agent_task(status);
CREATE INDEX IF NOT EXISTS idx_agent_task_created_at ON agent_task(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_task_updated_at ON agent_task(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_task_trace_id ON agent_task(trace_id);
CREATE INDEX IF NOT EXISTS idx_agent_task_request_id ON agent_task(request_id);
CREATE INDEX IF NOT EXISTS idx_agent_task_channel_conv ON agent_task(channel_type, conversation_id);
CREATE INDEX IF NOT EXISTS idx_agent_task_user_id ON agent_task(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_task_instance_id ON agent_task(instance_id);
CREATE INDEX IF NOT EXISTS idx_agent_task_queue_job_id ON agent_task(queue_job_id);

CREATE INDEX IF NOT EXISTS idx_agent_event_task_id ON agent_event(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_event_type ON agent_event(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_event_trace_id ON agent_event(trace_id);
CREATE INDEX IF NOT EXISTS idx_agent_event_request_id ON agent_event(request_id);

-- 触发器：自动维护 updated_at
DROP TRIGGER IF EXISTS trg_agent_task_updated_at ON agent_task;
CREATE TRIGGER trg_agent_task_updated_at
BEFORE UPDATE ON agent_task
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- ========================================
-- 会话管理（三层模型，PostgreSQL版）
-- ========================================

-- 1) 会话容器：平台/用户/原始conversation归属
CREATE TABLE IF NOT EXISTS conversation_containers (
  id BIGSERIAL PRIMARY KEY,
  channel_type VARCHAR(32) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  conversation_id VARCHAR(128) NOT NULL,
  container_key VARCHAR(300) NOT NULL UNIQUE,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uk_conversation_container_triplet UNIQUE (channel_type, user_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_container_user ON conversation_containers(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_container_updated_at ON conversation_containers(updated_at DESC);

DROP TRIGGER IF EXISTS trg_conversation_containers_updated_at ON conversation_containers;
CREATE TRIGGER trg_conversation_containers_updated_at
BEFORE UPDATE ON conversation_containers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- 2) 会话实例：容器下具体会话轮次
CREATE TABLE IF NOT EXISTS conversation_instances (
  id BIGSERIAL PRIMARY KEY,
  container_id BIGINT NOT NULL REFERENCES conversation_containers(id) ON DELETE CASCADE,
  instance_no INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  turn_count INTEGER NOT NULL DEFAULT 0,
  token_count INTEGER NOT NULL DEFAULT 0,
  version BIGINT NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ NULL,
  archived_at TIMESTAMPTZ NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_conversation_instances_status CHECK (status IN ('active', 'archived')),
  CONSTRAINT uk_conversation_instance_no UNIQUE (container_id, instance_no)
);

-- 同一容器同一时刻仅允许一个 active 实例
CREATE UNIQUE INDEX IF NOT EXISTS uk_conversation_instance_one_active
  ON conversation_instances(container_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_conversation_instance_status ON conversation_instances(container_id, status);
CREATE INDEX IF NOT EXISTS idx_conversation_instance_last_message_at ON conversation_instances(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_instance_version ON conversation_instances(container_id, version);

DROP TRIGGER IF EXISTS trg_conversation_instances_updated_at ON conversation_instances;
CREATE TRIGGER trg_conversation_instances_updated_at
BEFORE UPDATE ON conversation_instances
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

-- agent_task 在脚本前部创建；会话实例表创建后再补外键，保持建表顺序清晰
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'fk_agent_task_instance'
  ) THEN
    ALTER TABLE agent_task
      ADD CONSTRAINT fk_agent_task_instance
      FOREIGN KEY (instance_id)
      REFERENCES conversation_instances(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

-- 3) 会话消息事件：实例内消息流（附件预留）
CREATE TABLE IF NOT EXISTS conversation_messages (
  id BIGSERIAL PRIMARY KEY,
  instance_id BIGINT NOT NULL REFERENCES conversation_instances(id) ON DELETE CASCADE,
  message_id VARCHAR(128) NOT NULL,
  request_id VARCHAR(128) NULL,
  trace_id VARCHAR(128) NULL,
  task_id VARCHAR(128) NULL,
  role VARCHAR(16) NOT NULL,
  message_type VARCHAR(32) NOT NULL DEFAULT 'text',
  content TEXT NULL,
  payload JSONB NULL,
  raw_payload JSONB NULL,
  attachments JSONB NULL,
  idempotency_key VARCHAR(300) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_conversation_messages_role CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  CONSTRAINT uk_conversation_message UNIQUE (instance_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_message_time ON conversation_messages(instance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversation_message_trace ON conversation_messages(trace_id);
CREATE INDEX IF NOT EXISTS idx_conversation_message_request ON conversation_messages(request_id);
CREATE INDEX IF NOT EXISTS idx_conversation_message_created_at ON conversation_messages(created_at DESC);

-- ========================================
-- raw_payload 保留策略（仅清理原始快照，不删除消息主记录）
-- ========================================
-- 说明：
-- 1) 默认保留 30 天
-- 2) 到期后将 raw_payload 置空，保留 content/payload 等主字段用于审计与追溯
CREATE OR REPLACE FUNCTION purge_conversation_raw_payload(retention_days INTEGER DEFAULT 30)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  affected_rows BIGINT;
BEGIN
  UPDATE conversation_messages
     SET raw_payload = NULL
   WHERE raw_payload IS NOT NULL
     AND created_at < NOW() - make_interval(days => retention_days);

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;
$$;

-- 可选：启用 pg_cron 后每日定时执行（DBA按需开启）
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule(
--   'purge_conversation_raw_payload_daily',
--   '0 2 * * *',
--   $$SELECT purge_conversation_raw_payload(30);$$
-- );

-- 手术统计、知识库
-- PostgreSQL手术统计表脚本
-- 专门用于PostgreSQL数据库，包含PostgreSQL特有的数据类型和功能

-- 1. 手术统计主表
CREATE TABLE IF NOT EXISTS surgeries (
    id SERIAL PRIMARY KEY,
    surgery_id VARCHAR(50) UNIQUE NOT NULL,
    source_log_ids INT[],            -- 溯源的日志文件
    device_id TEXT,                  -- 设备编号（单设备）
    log_entry_start_id INT,          -- 起始日志条目
    log_entry_end_id INT,            -- 结束日志条目
    log_entry_start_log_id INT,      -- 起始日志条目所属log_id
    log_entry_end_log_id INT,        -- 结束日志条目所属log_id
    start_time TIMESTAMP,  -- 手术开始时间（原始时间，无时区概念）
    end_time TIMESTAMP,    -- 手术结束时间（原始时间，无时区概念）
    has_fault BOOLEAN,
    is_remote BOOLEAN NOT NULL DEFAULT false,  -- 是否远程手术
    success BOOLEAN,
    structured_data JSONB,           -- 当前有效的手术结构化数据
    last_analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- 生成列：从surgery_id提取年、月、日，用于时间筛选
    -- surgery_id格式：设备编号-YYYYMMDDhhmm（例如：4371-51-202509231306）
    start_year INTEGER GENERATED ALWAYS AS (
        CASE 
            WHEN surgery_id IS NOT NULL AND LENGTH(surgery_id) >= 12 THEN
                (SUBSTRING(RIGHT(surgery_id, 12) FROM 1 FOR 4))::INTEGER
            ELSE NULL
        END
    ) STORED,
    start_month INTEGER GENERATED ALWAYS AS (
        CASE 
            WHEN surgery_id IS NOT NULL AND LENGTH(surgery_id) >= 12 THEN
                (SUBSTRING(RIGHT(surgery_id, 12) FROM 5 FOR 2))::INTEGER
            ELSE NULL
        END
    ) STORED,
    start_day INTEGER GENERATED ALWAYS AS (
        CASE 
            WHEN surgery_id IS NOT NULL AND LENGTH(surgery_id) >= 12 THEN
                (SUBSTRING(RIGHT(surgery_id, 12) FROM 7 FOR 2))::INTEGER
            ELSE NULL
        END
    ) STORED
);


-- 3. 手术版本记录表，暂未使用
CREATE TABLE IF NOT EXISTS surgery_versions (
    id SERIAL PRIMARY KEY,
    surgery_id INTEGER NOT NULL,
    structured_data JSONB,
    source_logs INTEGER[],              -- 使用PostgreSQL数组类型存储日志文件ID
    created_by VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (surgery_id) REFERENCES surgeries(id) ON DELETE CASCADE
);
-- 手术导出冲突待确认表（同一 surgery_id 仅保留最新待办）
CREATE TABLE IF NOT EXISTS surgery_export_pending (
    id SERIAL PRIMARY KEY,
    surgery_id VARCHAR(50) NOT NULL UNIQUE,
    existing_postgresql_id INTEGER NOT NULL,
    new_data JSONB NOT NULL,
    created_by INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_surgery_export_pending_existing
      FOREIGN KEY (existing_postgresql_id) REFERENCES surgeries(id) ON DELETE CASCADE
);

-- 手术分析任务元数据（每个连续日志分组对应一个独立任务）
CREATE TABLE IF NOT EXISTS surgery_analysis_task_meta (
    id BIGSERIAL PRIMARY KEY,
    queue_job_id VARCHAR(100) NOT NULL UNIQUE,
    request_id VARCHAR(100),
    device_id TEXT NOT NULL,
    source_log_ids INTEGER[] NOT NULL DEFAULT '{}',
    display_surgery_id VARCHAR(80),
    status VARCHAR(32) NOT NULL DEFAULT 'queued',
    error_message TEXT,
    created_by INTEGER,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- 术式记录，暂未使用
CREATE TABLE IF NOT EXISTS procedures (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    name_cn VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    description TEXT
);
-- 手术与术式记录的关联表，暂未使用
CREATE TABLE IF NOT EXISTS surgery_procedures (
    surgery_id INT REFERENCES surgeries(id) ON DELETE CASCADE,
    procedure_id INT REFERENCES procedures(id) ON DELETE CASCADE,
    PRIMARY KEY (surgery_id, procedure_id)
);

-- 4. 创建索引
CREATE INDEX IF NOT EXISTS idx_surgeries_start_time ON surgeries(start_time);
CREATE INDEX IF NOT EXISTS idx_surgeries_end_time ON surgeries(end_time);
CREATE INDEX IF NOT EXISTS idx_surgeries_surgery_id ON surgeries(surgery_id);
CREATE INDEX IF NOT EXISTS idx_surgeries_device_id ON surgeries(device_id);
CREATE INDEX IF NOT EXISTS idx_surgeries_device_id_start_time ON surgeries(device_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_surgeries_device_id_ymd ON surgeries(device_id, start_year, start_month, start_day) WHERE start_year IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_surgery_versions_surgery_id ON surgery_versions(surgery_id);
CREATE INDEX IF NOT EXISTS idx_surgery_export_pending_existing_id ON surgery_export_pending(existing_postgresql_id);
CREATE INDEX IF NOT EXISTS idx_surgery_export_pending_updated_at ON surgery_export_pending(updated_at);
CREATE INDEX IF NOT EXISTS idx_surgery_analysis_task_meta_device_status ON surgery_analysis_task_meta(device_id, status);
CREATE INDEX IF NOT EXISTS idx_surgery_analysis_task_meta_request_id ON surgery_analysis_task_meta(request_id);
CREATE INDEX IF NOT EXISTS idx_surgery_analysis_task_meta_updated_at ON surgery_analysis_task_meta(updated_at DESC);
-- 生成列的索引（用于优化时间筛选查询）
CREATE INDEX IF NOT EXISTS idx_surgeries_start_year ON surgeries(start_year) WHERE start_year IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_surgeries_start_year_month ON surgeries(start_year, start_month) WHERE start_year IS NOT NULL AND start_month IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_surgeries_start_year_month_day ON surgeries(start_year, start_month, start_day) WHERE start_year IS NOT NULL AND start_month IS NOT NULL AND start_day IS NOT NULL;

-- ============================================
-- 知识库相关表
-- ============================================

-- 知识库文档元数据表
CREATE TABLE IF NOT EXISTS kb_documents (
  id SERIAL PRIMARY KEY,
  
  -- 上传源文件信息
  original_name TEXT NOT NULL,
  filename TEXT,
  ext VARCHAR(16),
  mime_type TEXT,
  size_bytes BIGINT,
  
  -- 存储信息
  storage VARCHAR(16) NOT NULL DEFAULT 'local' CHECK (storage IN ('local', 'oss')),
  oss_key TEXT,
  object_key TEXT,
  etag TEXT,
  sha256 VARCHAR(64),
  
  -- 业务字段
  uploader_id INTEGER,
  upload_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(32) NOT NULL DEFAULT 'uploading',
  chunk_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  lang VARCHAR(8) NOT NULL DEFAULT 'zh',
  
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 知识库文档表索引
CREATE INDEX IF NOT EXISTS idx_kb_documents_status ON kb_documents(status);
CREATE INDEX IF NOT EXISTS idx_kb_documents_uploader_id ON kb_documents(uploader_id);
CREATE INDEX IF NOT EXISTS idx_kb_documents_upload_time ON kb_documents(upload_time);
CREATE INDEX IF NOT EXISTS idx_kb_documents_sha256 ON kb_documents(sha256);

-- 知识库分块表
CREATE TABLE IF NOT EXISTS kb_chunks (
  id SERIAL PRIMARY KEY,
  doc_id INTEGER NOT NULL,
  chunk_no INTEGER NOT NULL,
  heading_path TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  -- 唯一约束：同一文档的 chunk_no 不能重复
  CONSTRAINT uk_kb_chunks_doc_chunk UNIQUE (doc_id, chunk_no)
);

-- 知识库分块表索引
CREATE INDEX IF NOT EXISTS idx_kb_chunks_doc_id ON kb_chunks(doc_id);

-- ============================================
-- 知识库文件类型（支持一文件多标签）
-- ============================================

-- 知识库文件类型配置表
-- 字段说明：
-- - code: 类型标识（XX标识），唯一
-- - name_zh: 中文名称
-- - name_en: 英文名称
-- - sort_order: 排序顺序
-- - enabled: 是否启用
CREATE TABLE IF NOT EXISTS kb_file_types (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL UNIQUE,
  name_zh VARCHAR(128) NOT NULL,
  name_en VARCHAR(128) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_kb_file_types_enabled ON kb_file_types(enabled);
CREATE INDEX IF NOT EXISTS idx_kb_file_types_sort_order ON kb_file_types(sort_order);

-- 文档-文件类型关联表（多对多）
CREATE TABLE IF NOT EXISTS kb_document_file_types (
  doc_id INTEGER NOT NULL,
  file_type_id INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (doc_id, file_type_id)
);

CREATE INDEX IF NOT EXISTS idx_kb_document_file_types_doc_id ON kb_document_file_types(doc_id);
CREATE INDEX IF NOT EXISTS idx_kb_document_file_types_file_type_id ON kb_document_file_types(file_type_id);

-- 外键约束（可选，如果不需要级联删除可以不加）
-- ALTER TABLE kb_chunks ADD CONSTRAINT fk_kb_chunks_doc_id 
--   FOREIGN KEY (doc_id) REFERENCES kb_documents(id) ON DELETE CASCADE;

-- 添加表和字段注释
COMMENT ON TABLE kb_documents IS '知识库文档元数据表';
COMMENT ON COLUMN kb_documents.original_name IS '原始文件名';
COMMENT ON COLUMN kb_documents.filename IS '服务端生成的文件名（可为空）';
COMMENT ON COLUMN kb_documents.ext IS '扩展名（docx/md/txt）';
COMMENT ON COLUMN kb_documents.mime_type IS 'MIME';
COMMENT ON COLUMN kb_documents.size_bytes IS '字节大小';
COMMENT ON COLUMN kb_documents.storage IS '存储介质';
COMMENT ON COLUMN kb_documents.oss_key IS 'OSS object key';
COMMENT ON COLUMN kb_documents.object_key IS '本地存储时的相对路径/文件名';
COMMENT ON COLUMN kb_documents.etag IS 'OSS etag';
COMMENT ON COLUMN kb_documents.sha256 IS '文件 sha256';
COMMENT ON COLUMN kb_documents.uploader_id IS '上传用户ID（MySQL users.id）';
COMMENT ON COLUMN kb_documents.upload_time IS '上传时间';
COMMENT ON COLUMN kb_documents.status IS '状态：uploading/queued/decrypting/decrypt_failed/parsing/parse_failed/parsed/file_error/processing_failed';
COMMENT ON COLUMN kb_documents.chunk_count IS '分块数量';
COMMENT ON COLUMN kb_documents.error_message IS '失败原因';
COMMENT ON COLUMN kb_documents.lang IS '语言(zh/en)';

COMMENT ON TABLE kb_chunks IS '知识库分块表';
COMMENT ON COLUMN kb_chunks.doc_id IS 'kb_documents.id';
COMMENT ON COLUMN kb_chunks.chunk_no IS '分块序号（从1开始）';
COMMENT ON COLUMN kb_chunks.heading_path IS '标题路径（A / B / C）';
COMMENT ON COLUMN kb_chunks.content IS '分块内容';

COMMENT ON TABLE kb_file_types IS '知识库文件类型配置表';
COMMENT ON COLUMN kb_file_types.code IS '类型标识（XX标识），唯一';
COMMENT ON COLUMN kb_file_types.name_zh IS '中文名称';
COMMENT ON COLUMN kb_file_types.name_en IS '英文名称';
COMMENT ON COLUMN kb_file_types.sort_order IS '排序顺序';
COMMENT ON COLUMN kb_file_types.enabled IS '是否启用';

COMMENT ON TABLE kb_document_file_types IS '文档-文件类型关联表（多对多）';
COMMENT ON COLUMN kb_document_file_types.doc_id IS 'kb_documents.id';
COMMENT ON COLUMN kb_document_file_types.file_type_id IS 'kb_file_types.id';
COMMIT;
