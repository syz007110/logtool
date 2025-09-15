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

-- 5. 故障码表
CREATE TABLE IF NOT EXISTS error_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subsystem VARCHAR(100),
  code VARCHAR(50) NOT NULL,
  is_axis_error BOOLEAN DEFAULT FALSE,
  is_arm_error BOOLEAN DEFAULT FALSE,
  short_message TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  short_message_en TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  user_hint TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  user_hint_en TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  operation TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  operation_en TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
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
  stop_report TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  level VARCHAR(50),
  tech_solution TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  explanation TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  category VARCHAR(100),
  UNIQUE KEY unique_subsystem_code (subsystem, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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


-- 14. 手术统计相关表（MySQL兼容版本）
-- 注意：这些表使用MySQL兼容语法，如果需要PostgreSQL特有功能，请使用PostgreSQL脚本

-- MySQL版本的手术统计表
CREATE TABLE IF NOT EXISTS surgeries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    surgery_id VARCHAR(50) UNIQUE NOT NULL,
    device_ids TEXT,                    -- 使用TEXT存储设备ID，用逗号分隔
    start_time TIMESTAMP NULL,
    end_time TIMESTAMP NULL,
    is_remote BOOLEAN DEFAULT FALSE,
    structured_data JSON,               -- 使用MySQL的JSON类型
    last_analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 手术版本记录表
CREATE TABLE IF NOT EXISTS surgery_versions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    surgery_id INT NOT NULL,
    structured_data JSON,
    source_logs TEXT,                   -- 使用TEXT存储日志文件ID，用逗号分隔
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (surgery_id) REFERENCES surgeries(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
-- log_entries表索引
-- ========================================
-- 基础索引
CREATE INDEX idx_log_entries_timestamp ON log_entries(timestamp);
CREATE INDEX idx_log_entries_error_code ON log_entries(error_code);

-- 性能优化索引
CREATE INDEX idx_log_entries_log_timestamp ON log_entries(log_id, timestamp);
CREATE INDEX idx_log_entries_log_error ON log_entries(log_id, error_code);
CREATE INDEX idx_log_entries_params ON log_entries(log_id, param1, param2, param3, param4);
CREATE INDEX idx_log_entries_explanation ON log_entries(log_id, explanation(100));

-- 覆盖索引（高性能查询）
CREATE INDEX idx_log_entries_covering ON log_entries(log_id, timestamp, error_code, param1, param2, param3, param4, explanation(100));

-- 关键复合索引：加速批量日志查询首页（按时间排序获取前N条）
-- 典型形态：WHERE log_id IN (...) [AND timestamp BETWEEN ...] ORDER BY timestamp ASC, id ASC LIMIT N
CREATE INDEX idx_log_entries_logid_ts_id ON log_entries(log_id, timestamp, id);

-- 当未指定 log_id 过滤时，加速 ORDER BY timestamp, id LIMIT N 的首页获取
CREATE INDEX idx_log_entries_ts_id ON log_entries(timestamp, id);

-- ========================================
-- error_codes表索引
-- ========================================
-- 性能优化索引
CREATE INDEX idx_error_codes_subsystem_code ON error_codes(subsystem, code);

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
SELECT 'logs' AS table_name, COUNT(*) AS count FROM logs
UNION ALL
SELECT 'i18n_texts' AS table_name, COUNT(*) AS count FROM i18n_texts
UNION ALL
SELECT 'devices' AS table_name, COUNT(*) AS count FROM devices
UNION ALL
SELECT 'surgeries' AS table_name, COUNT(*) AS count FROM surgeries;

-- 17. 验证字符集设置
SELECT 
    TABLE_NAME,
    TABLE_COLLATION,
    TABLE_CHARSET
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = 'logtool'
ORDER BY TABLE_NAME;
