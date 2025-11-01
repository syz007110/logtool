-- 数据库初始化脚本
-- 整合了数据库结构、字符集设置和索引优化
-- 执行前请确保已备份现有数据

-- 1. 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS logtool CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE logtool;

-- 2. 用户表
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 权限/角色表
CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. 用户-角色关联表
CREATE TABLE IF NOT EXISTS user_roles (
  user_id INT NOT NULL,
  role_id INT NOT NULL,
  assigned_by INT,                    -- 分配角色的用户ID（可选）
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- 分配时间
  expires_at TIMESTAMP NULL,          -- 角色过期时间（可选）
  is_active BOOLEAN DEFAULT TRUE,     -- 角色是否激活
  notes TEXT,                         -- 分配备注（可选）
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_role_id (role_id),
  INDEX idx_assigned_by (assigned_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4.1 权限点表
CREATE TABLE IF NOT EXISTS permissions (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_permissions_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4.2 角色-权限关联表
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- 4.3 初始化内置角色与权限（一步到位使用新权限名）
-- ========================================

-- 4.3.1 预置角色（若不存在则创建）
INSERT INTO roles (name, description)
SELECT * FROM (
  SELECT 'admin' AS name, '拥有所有权限，可以管理用户和角色' AS description
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE LOWER(r.name) = 'admin');

INSERT INTO roles (name, description)
SELECT * FROM (
  SELECT 'expert' AS name, '专家用户：可管理故障码、查看所有日志、数据解析、手术统计等' AS description
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE LOWER(r.name) = 'expert');

INSERT INTO roles (name, description)
SELECT * FROM (
  SELECT 'user' AS name, '普通用户：可查看故障码、上传日志、仅操作自身数据等' AS description
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM roles r WHERE LOWER(r.name) = 'user');

-- 4.3.2 同步新权限清单（幂等）
INSERT INTO permissions (name, description) VALUES
  -- 用户与角色
  ('user:read','用户查看'),
  ('user:create','用户创建'),
  ('user:update','用户修改'),
  ('user:delete','用户删除'),
  ('user:role:assign','用户权限修改'),

  ('role:create','角色创建'),
  ('role:read','角色查看'),
  ('role:update','角色修改'),
  ('role:delete','角色删除'),

  -- 故障码
  ('error_code:read','故障码查看'),
  ('error_code:create','故障码新增'),
  ('error_code:update','故障码修改'),
  ('error_code:delete','故障码删除'),
  ('error_code:export','故障码导出'),

  -- 日志（新语义）
  ('log:upload','日志上传与解析'),
  ('log:read_all','查看全部日志'),
  ('log:download','日志下载'),
  ('log:delete','日志删除(全部)'),
  ('log:delete_own','日志删除(自己)'),
  ('log:reparse','日志重新解析(管理员)'),

  -- 多语言
  ('i18n:read','多语言查看'),
  ('i18n:create','多语言新增'),
  ('i18n:update','多语言修改'),
  ('i18n:delete','多语言删除'),

  -- 数据解析（新语义）
  ('data_replay:manage','数据解析管理(上传/读取/下载)'),

  -- 手术数据（新语义）
  ('surgery:read','手术数据查看/统计/可视化'),
  ('surgery:export','手术数据导出'),
  ('surgery:delete','手术数据删除'),

  -- 历史记录
  ('history:read_own','历史记录(自己)'),
  ('history:read_all','历史记录(全部)'),
  ('history:export','历史记录导出'),

  -- 设备
  ('device:read','设备查看'),
  ('device:create','设备创建'),
  ('device:update','设备修改'),
  ('device:delete','设备删除'),

  -- 看板
  ('dashboard:read','全局看板查看'),

  -- 测试
  ('test:explain','测试(释义测试)'),

  -- 系统监控
  ('system:monitor','系统监控'),

  -- 日志分析等级
  ('loglevel:manage','日志分析等级管理')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- 管理员：授予全部权限
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT @ADMIN_ID, p.id FROM permissions p WHERE @ADMIN_ID IS NOT NULL;

-- 专家：按需求
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT @EXPERT_ID, p.id FROM permissions p
WHERE @EXPERT_ID IS NOT NULL AND p.name IN (
  'error_code:read','error_code:create','error_code:update','error_code:delete','error_code:export',
  'log:upload','log:read_all','log:download','log:delete_own',
  'i18n:read','i18n:create','i18n:update','i18n:delete',
  'device:read','device:create','device:update','device:delete',
  'data_replay:manage',
  'surgery:read','surgery:export',
  'dashboard:read',
  'history:read_own',
  'system:monitor',
  'loglevel:manage',
  'test:explain'
);

-- 普通用户：按需求
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT @USER_ID, p.id FROM permissions p
WHERE @USER_ID IS NOT NULL AND p.name IN (
  'error_code:read','error_code:export',
  'log:upload','log:download','log:delete_own',
  'i18n:read',
  'data_replay:manage',
  'surgery:read','surgery:export',
  'dashboard:read',
  'history:read_own',
  'system:monitor',
  'loglevel:manage'
);

-- 5. 故障码表
-- 注意：英文内容（short_message/user_hint/operation）已迁移至 i18n_error_codes 表
-- 主表仅保留中文字段作为默认语言
CREATE TABLE IF NOT EXISTS error_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subsystem VARCHAR(100),
  code VARCHAR(50) NOT NULL,
  is_axis_error BOOLEAN DEFAULT FALSE,
  is_arm_error BOOLEAN DEFAULT FALSE,
  short_message TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '精简提示信息（中文/默认）',
  user_hint TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '用户提示信息（中文/默认）',
  operation TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '操作信息（中文/默认）',
  detail TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  method TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  param1 VARCHAR(100),
  param2 VARCHAR(100),
  param3 VARCHAR(100),
  param4 VARCHAR(100),
  solution TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  for_expert BOOLEAN DEFAULT FALSE,
  for_novice BOOLEAN DEFAULT FALSE,
  related_log BOOLEAN DEFAULT FALSE,
  stop_report TEXT,
  level VARCHAR(50),
  tech_solution TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  explanation TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  category VARCHAR(100),
  UNIQUE KEY unique_subsystem_code (subsystem, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5.1 日志分析分类字典表
CREATE TABLE IF NOT EXISTS analysis_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_key VARCHAR(100) NOT NULL UNIQUE COMMENT '分类唯一标识，如 Devices, IO_Signals 等',
  name_zh VARCHAR(100) NOT NULL COMMENT '中文名称',
  name_en VARCHAR(100) NOT NULL COMMENT '英文名称',
  sort_order INT DEFAULT 0 COMMENT '排序顺序',
  is_active BOOLEAN DEFAULT TRUE COMMENT '是否启用',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_category_key (category_key),
  INDEX idx_sort_order (sort_order),
  INDEX idx_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='日志分析分类字典表';

-- 5.2 故障码-分析分类关联表（多对多）
CREATE TABLE IF NOT EXISTS error_code_analysis_categories (
  error_code_id INT NOT NULL COMMENT '故障码ID',
  analysis_category_id INT NOT NULL COMMENT '分析分类ID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (error_code_id, analysis_category_id),
  FOREIGN KEY (error_code_id) REFERENCES error_codes(id) ON DELETE CASCADE,
  FOREIGN KEY (analysis_category_id) REFERENCES analysis_categories(id) ON DELETE CASCADE,
  INDEX idx_error_code (error_code_id),
  INDEX idx_category (analysis_category_id),
  -- 新增复合索引：按分类查找对应故障码以加速 EXISTS 过滤
  INDEX idx_ecac_cat_code (analysis_category_id, error_code_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='故障码与分析分类的多对多关联表';

-- 5.3 故障码-分类 预计算映射表（查询加速用）
CREATE TABLE IF NOT EXISTS code_category_map (
  subsystem_char CHAR(1) NOT NULL,
  code4          CHAR(6) NOT NULL,  -- 形如 0X571E
  analysis_category_id INT NOT NULL,
  PRIMARY KEY (subsystem_char, code4, analysis_category_id),
  INDEX idx_ccm_code (subsystem_char, code4),
  INDEX idx_ccm_cat  (analysis_category_id, subsystem_char, code4)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预计算：规范码到分析分类的映射（查询加速）';

-- 6. 多语言配置表
CREATE TABLE IF NOT EXISTS i18n_texts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  key_name VARCHAR(100) NOT NULL,
  lang VARCHAR(10) NOT NULL,
  text TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  UNIQUE KEY unique_key_lang (key_name, lang)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. 设备日志文件元数据表
CREATE TABLE IF NOT EXISTS logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255),
  size INT,
  status VARCHAR(50) DEFAULT 'uploaded',
  upload_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  parse_time DATETIME,
  uploader_id INT,
  device_id VARCHAR(100),
  key_id VARCHAR(100),
  decrypted_path VARCHAR(255),
  remark TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE logs 
  ADD COLUMN source_type ENUM('auto','upload') DEFAULT 'auto' AFTER filepath_hash,
  ADD COLUMN content_hash VARCHAR(64) NULL AFTER source_type;
  
-- 8. 日志解密后内容表
CREATE TABLE IF NOT EXISTS log_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  log_id INT NOT NULL,
  timestamp DATETIME,
  error_code VARCHAR(50),
  param1 VARCHAR(100),
  param2 VARCHAR(100),
  param3 VARCHAR(100),
  param4 VARCHAR(100),
  explanation TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  FOREIGN KEY (log_id) REFERENCES logs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. 操作日志表
CREATE TABLE IF NOT EXISTS operation_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operation VARCHAR(100) NOT NULL,
  description TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  user_id INT,
  username VARCHAR(100),
  status VARCHAR(50) DEFAULT 'success',
  ip VARCHAR(45),
  user_agent TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  details JSON,
  time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_operation (operation),
  INDEX idx_time (time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. 故障码多语言表
CREATE TABLE IF NOT EXISTS i18n_error_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  error_code_id INT NOT NULL,
  lang VARCHAR(10) NOT NULL,
  short_message TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  user_hint TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  operation TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (error_code_id) REFERENCES error_codes(id) ON DELETE CASCADE,
  UNIQUE KEY unique_error_code_lang (error_code_id, lang),
  INDEX idx_error_code_id (error_code_id),
  INDEX idx_lang (lang)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. 设备管理表
CREATE TABLE IF NOT EXISTS devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(100) NOT NULL UNIQUE,   -- 设备编号（唯一，例如 4371-01 / ABC-12）
  device_model VARCHAR(100),                -- 设备型号
  device_key VARCHAR(100),                  -- 设备密钥（MAC，如 00-01-05-77-6a-09）
  hospital VARCHAR(255),                    -- 所属医院
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. 缺陷反馈主表
CREATE TABLE IF NOT EXISTS feedbacks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  title VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL,
  status ENUM('open','in_progress','resolved') NOT NULL DEFAULT 'open',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. 缺陷反馈图片表
CREATE TABLE IF NOT EXISTS feedback_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  feedback_id INT NOT NULL,
  url VARCHAR(255) NOT NULL,
  storage_key VARCHAR(255) NULL,
  width INT NULL,
  height INT NULL,
  size_bytes INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (feedback_id) REFERENCES feedbacks(id) ON DELETE CASCADE,
  INDEX idx_feedback_id (feedback_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 14. 日志备注
CREATE TABLE `log_notes` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,          -- 主键，自动递增
  `log_entry_id` INT NOT NULL,                           -- 外键，关联日志条目的 ID
  `user_id` INT NOT NULL,                                -- 外键，关联用户 ID
  `content` VARCHAR(50) NOT NULL,                        -- 备注内容，限制 50 字符
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,       -- 创建时间，默认为当前时间
  `updated_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,  -- 更新时间，修改时自动更新
  `created_by` ENUM('admin', 'expert', 'user') NOT NULL, -- 创建者角色，区分权限
  FOREIGN KEY (`log_entry_id`) REFERENCES `log_entries`(`id`) ON DELETE CASCADE,  -- 关联日志条目表
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,     -- 关联用户表
  INDEX (`log_entry_id`),                               -- 为查询日志相关的备注添加索引
  INDEX (`user_id`)                                    -- 为查询某用户的备注添加索引
);
-- 14. 手术统计相关表
-- 注意：手术统计功能使用 PostgreSQL 数据库
-- 相关表定义请参考：infrastructure/database/surgery_tables_postgresql.sql
-- 此处不创建 MySQL 版本的 surgeries 和 surgery_versions 表

-- 15. 创建所有必要的索引
-- 包含基础索引和性能优化索引
-- 注意：如果索引已存在，这些语句会失败，但不影响表结构
-- 如果需要重新创建索引，请先删除现有索引

-- ========================================
-- logs表索引
-- ========================================
-- 基础索引
CREATE INDEX idx_logs_upload_time ON logs(upload_time);
CREATE INDEX idx_logs_device_id ON logs(device_id);

-- 性能优化索引
CREATE INDEX idx_logs_uploader ON logs(uploader_id, id);
CREATE INDEX idx_logs_device ON logs(device_id, upload_time);
CREATE INDEX idx_logs_filename ON logs(original_name(20));

-- ========================================
-- log_entries表索引（已优化，删除冗余索引）
-- ========================================

-- 关键复合索引：加速批量日志查询首页（按时间排序获取前N条）
-- 典型形态：WHERE log_id IN (...) [AND timestamp BETWEEN ...] ORDER BY timestamp ASC, id ASC LIMIT N
CREATE INDEX idx_log_entries_logid_ts_id ON log_entries(log_id, timestamp, id);

-- 当未指定 log_id 过滤时，加速 ORDER BY timestamp, id LIMIT N 的首页获取
CREATE INDEX idx_log_entries_ts_id ON log_entries(timestamp, id);

-- 文本搜索优化：对 explanation 建立全文索引（支持中文分词）
FULLTEXT INDEX ftx_log_entries_explanation (explanation) WITH PARSER ngram;

-- 当存在"分析分类"过滤时，配合规范化列进行高效扫描/计数
CREATE INDEX idx_log_entries_logid_ts_norm ON log_entries(log_id, timestamp, subsystem_char, code4);
CREATE INDEX idx_log_entries_ts_norm ON log_entries(timestamp, subsystem_char, code4, id);

-- 可选索引（根据实际使用情况决定是否保留）
-- 如果查询经常按参数过滤，保留此索引；否则可以删除
-- CREATE INDEX idx_log_entries_params ON log_entries(log_id, param1, param2, param3, param4);

-- ========================================
-- error_codes表索引
-- ========================================
-- 注意：已有 UNIQUE 索引 unique_subsystem_code(subsystem, code)，无需额外索引
-- UNIQUE 索引本身已包含索引功能，创建额外索引是冗余的

-- ========================================
-- devices表索引
-- ========================================
-- 基础索引
CREATE INDEX idx_devices_device_key ON devices(device_key);

-- 16. 显示创建结果
SELECT '数据库初始化完成！' AS message;
SELECT 'users' AS table_name, COUNT(*) AS count FROM users
UNION ALL
SELECT 'roles' AS table_name, COUNT(*) AS count FROM roles
UNION ALL
SELECT 'user_roles' AS table_name, COUNT(*) AS count FROM user_roles
UNION ALL
SELECT 'permissions' AS table_name, COUNT(*) AS count FROM permissions
UNION ALL
SELECT 'role_permissions' AS table_name, COUNT(*) AS count FROM role_permissions
UNION ALL
SELECT 'error_codes' AS table_name, COUNT(*) AS count FROM error_codes
UNION ALL
SELECT 'analysis_categories' AS table_name, COUNT(*) AS count FROM analysis_categories
UNION ALL
SELECT 'logs' AS table_name, COUNT(*) AS count FROM logs
UNION ALL
SELECT 'log_entries' AS table_name, COUNT(*) AS count FROM log_entries
UNION ALL
SELECT 'i18n_texts' AS table_name, COUNT(*) AS count FROM i18n_texts
UNION ALL
SELECT 'devices' AS table_name, COUNT(*) AS count FROM devices;

-- 注意：surgeries 和 surgery_versions 表在 PostgreSQL 数据库中，不在此MySQL库

-- 17. 验证字符集设置
SELECT 
    TABLE_NAME,
    TABLE_COLLATION,
    TABLE_CHARSET
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = 'logtool'
ORDER BY TABLE_NAME;
