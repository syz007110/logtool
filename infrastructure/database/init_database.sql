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
  dingtalk_unionid VARCHAR(100) UNIQUE,
  dingtalk_userid VARCHAR(100),
  dingtalk_mobile VARCHAR(32),
  dingtalk_nick VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  must_change_password BOOLEAN DEFAULT FALSE,
  scope_type VARCHAR(32) NOT NULL DEFAULT 'platform' COMMENT '用户归属作用域类型：platform/hospital',
  scope_id INT NOT NULL DEFAULT 0 COMMENT '用户归属作用域ID（scope_type=platform时为0）',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 权限/角色表
CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  description VARCHAR(255),
  scope_type VARCHAR(32) NOT NULL DEFAULT 'platform' COMMENT '角色作用域类型：platform/hospital',
  scope_id INT NOT NULL DEFAULT 0 COMMENT '角色作用域ID（当 scope_type != platform 时使用）',
  INDEX idx_roles_scope (scope_type, scope_id),
  UNIQUE KEY uk_roles_name_scope (name, scope_type, scope_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. 用户-角色关联表
CREATE TABLE IF NOT EXISTS user_roles (
  user_id INT NOT NULL,
  role_id INT NOT NULL,
  scope_type VARCHAR(32) NOT NULL DEFAULT 'platform' COMMENT '角色分配作用域类型：platform/hospital',
  scope_id INT NOT NULL DEFAULT 0 COMMENT '角色分配作用域ID（当 scope_type != platform 时使用）',
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
  INDEX idx_user_roles_scope (scope_type, scope_id),
  INDEX idx_assigned_by (assigned_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_users_scope ON users(scope_type, scope_id);

-- 4.0 刷新令牌表（Refresh Token 持久化）
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash VARCHAR(128) NOT NULL,
  remember_me BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  replaced_by BIGINT UNSIGNED NULL,
  device_info VARCHAR(255) NULL,
  ip_address VARCHAR(64) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_refresh_tokens_token_hash UNIQUE (token_hash),
  CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_refresh_tokens_user_id (user_id),
  INDEX idx_refresh_tokens_expires_at (expires_at),
  INDEX idx_refresh_tokens_revoked_at (revoked_at),
  INDEX idx_refresh_tokens_replaced_by (replaced_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4.1 权限分组表（数据库驱动权限树分组）
CREATE TABLE IF NOT EXISTS permission_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_key VARCHAR(64) NOT NULL COMMENT '分组键，如 user/error_code/smart_search',
  name_zh VARCHAR(100) NOT NULL COMMENT '中文名称',
  name_en VARCHAR(100) NOT NULL COMMENT '英文名称',
  i18n_key VARCHAR(150) NOT NULL COMMENT 'i18n key，如 roles.permissionGroups.user',
  sort_order INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_permission_groups_key (group_key),
  INDEX idx_permission_groups_sort (sort_order),
  INDEX idx_permission_groups_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4.1.1 预置权限分组（若不存在则创建）
INSERT INTO permission_groups (group_key, name_zh, name_en, i18n_key, sort_order, is_active)
SELECT * FROM (
  SELECT 'user' AS group_key, '用户管理' AS name_zh, 'User Management' AS name_en, 'roles.permissionGroups.user' AS i18n_key, 10 AS sort_order, 1 AS is_active
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permission_groups WHERE group_key = 'user');

INSERT INTO permission_groups (group_key, name_zh, name_en, i18n_key, sort_order, is_active)
SELECT * FROM (
  SELECT 'role' AS group_key, '角色管理' AS name_zh, 'Role Management' AS name_en, 'roles.permissionGroups.role' AS i18n_key, 20 AS sort_order, 1 AS is_active
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permission_groups WHERE group_key = 'role');

INSERT INTO permission_groups (group_key, name_zh, name_en, i18n_key, sort_order, is_active)
SELECT * FROM (
  SELECT 'smart_search' AS group_key, '智能搜索' AS name_zh, 'Smart Search' AS name_en, 'roles.permissionGroups.smart_search' AS i18n_key, 25 AS sort_order, 1 AS is_active
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permission_groups WHERE group_key = 'smart_search');

INSERT INTO permission_groups (group_key, name_zh, name_en, i18n_key, sort_order, is_active)
SELECT * FROM (
  SELECT 'error_code' AS group_key, '故障码管理' AS name_zh, 'Error Code Management' AS name_en, 'roles.permissionGroups.error_code' AS i18n_key, 30 AS sort_order, 1 AS is_active
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permission_groups WHERE group_key = 'error_code');

INSERT INTO permission_groups (group_key, name_zh, name_en, i18n_key, sort_order, is_active)
SELECT * FROM (
  SELECT 'fault_case' AS group_key, '故障案例管理' AS name_zh, 'Fault Case Management' AS name_en, 'roles.permissionGroups.fault_case' AS i18n_key, 40 AS sort_order, 1 AS is_active
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permission_groups WHERE group_key = 'fault_case');

INSERT INTO permission_groups (group_key, name_zh, name_en, i18n_key, sort_order, is_active)
SELECT * FROM (
  SELECT 'fault_case_config' AS group_key, '故障案例配置' AS name_zh, 'Fault Case Configuration' AS name_en, 'roles.permissionGroups.fault_case_config' AS i18n_key, 45 AS sort_order, 1 AS is_active
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permission_groups WHERE group_key = 'fault_case_config');

INSERT INTO permission_groups (group_key, name_zh, name_en, i18n_key, sort_order, is_active)
SELECT * FROM (
  SELECT 'log' AS group_key, '日志管理' AS name_zh, 'Log Management' AS name_en, 'roles.permissionGroups.log' AS i18n_key, 50 AS sort_order, 1 AS is_active
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permission_groups WHERE group_key = 'log');

INSERT INTO permission_groups (group_key, name_zh, name_en, i18n_key, sort_order, is_active)
SELECT * FROM (
  SELECT 'i18n' AS group_key, '多语言管理' AS name_zh, 'Localization Management' AS name_en, 'roles.permissionGroups.i18n' AS i18n_key, 60 AS sort_order, 1 AS is_active
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permission_groups WHERE group_key = 'i18n');

INSERT INTO permission_groups (group_key, name_zh, name_en, i18n_key, sort_order, is_active)
SELECT * FROM (
  SELECT 'device' AS group_key, '设备管理' AS name_zh, 'Device Management' AS name_en, 'roles.permissionGroups.device' AS i18n_key, 70 AS sort_order, 1 AS is_active
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permission_groups WHERE group_key = 'device');

INSERT INTO permission_groups (group_key, name_zh, name_en, i18n_key, sort_order, is_active)
SELECT * FROM (
  SELECT 'history' AS group_key, '历史记录' AS name_zh, 'History' AS name_en, 'roles.permissionGroups.history' AS i18n_key, 80 AS sort_order, 1 AS is_active
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permission_groups WHERE group_key = 'history');

INSERT INTO permission_groups (group_key, name_zh, name_en, i18n_key, sort_order, is_active)
SELECT * FROM (
  SELECT 'surgery' AS group_key, '手术数据' AS name_zh, 'Surgery Data' AS name_en, 'roles.permissionGroups.surgery' AS i18n_key, 90 AS sort_order, 1 AS is_active
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permission_groups WHERE group_key = 'surgery');

INSERT INTO permission_groups (group_key, name_zh, name_en, i18n_key, sort_order, is_active)
SELECT * FROM (
  SELECT 'data_replay' AS group_key, '数据回放' AS name_zh, 'Data Replay' AS name_en, 'roles.permissionGroups.data_replay' AS i18n_key, 100 AS sort_order, 1 AS is_active
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permission_groups WHERE group_key = 'data_replay');

INSERT INTO permission_groups (group_key, name_zh, name_en, i18n_key, sort_order, is_active)
SELECT * FROM (
  SELECT 'kb' AS group_key, '知识库' AS name_zh, 'Knowledge Base' AS name_en, 'roles.permissionGroups.kb' AS i18n_key, 110 AS sort_order, 1 AS is_active
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permission_groups WHERE group_key = 'kb');

INSERT INTO permission_groups (group_key, name_zh, name_en, i18n_key, sort_order, is_active)
SELECT * FROM (
  SELECT 'dashboard' AS group_key, '系统看板' AS name_zh, 'Dashboard' AS name_en, 'roles.permissionGroups.dashboard' AS i18n_key, 120 AS sort_order, 1 AS is_active
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permission_groups WHERE group_key = 'dashboard');

INSERT INTO permission_groups (group_key, name_zh, name_en, i18n_key, sort_order, is_active)
SELECT * FROM (
  SELECT 'test' AS group_key, '测试' AS name_zh, 'Test' AS name_en, 'roles.permissionGroups.test' AS i18n_key, 130 AS sort_order, 1 AS is_active
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permission_groups WHERE group_key = 'test');

INSERT INTO permission_groups (group_key, name_zh, name_en, i18n_key, sort_order, is_active)
SELECT * FROM (
  SELECT 'system' AS group_key, '系统监控' AS name_zh, 'System Monitoring' AS name_en, 'roles.permissionGroups.system' AS i18n_key, 140 AS sort_order, 1 AS is_active
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permission_groups WHERE group_key = 'system');

INSERT INTO permission_groups (group_key, name_zh, name_en, i18n_key, sort_order, is_active)
SELECT * FROM (
  SELECT 'loglevel' AS group_key, '日志分析等级' AS name_zh, 'Analysis Levels' AS name_en, 'roles.permissionGroups.loglevel' AS i18n_key, 150 AS sort_order, 1 AS is_active
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permission_groups WHERE group_key = 'loglevel');

INSERT INTO permission_groups (group_key, name_zh, name_en, i18n_key, sort_order, is_active)
SELECT * FROM (
  SELECT 'other' AS group_key, '其他权限' AS name_zh, 'Other Permissions' AS name_en, 'roles.permissionGroups.other' AS i18n_key, 999 AS sort_order, 1 AS is_active
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permission_groups WHERE group_key = 'other');

-- 4.2 权限点表
CREATE TABLE IF NOT EXISTS permissions (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  group_key VARCHAR(64) NOT NULL DEFAULT 'other' COMMENT '权限分组键',
  PRIMARY KEY (id),
  UNIQUE KEY uk_permissions_name (name),
  KEY idx_permissions_group_key (group_key),
  CONSTRAINT fk_permissions_group_key FOREIGN KEY (group_key) REFERENCES permission_groups(group_key) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4.3 角色-权限关联表
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- 4.4 初始化内置角色与权限（一步到位使用新权限名）
-- ========================================

-- 4.4.1 预置角色（若不存在则创建）
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

-- 4.4.1.1 设置角色ID变量
SET @ADMIN_ID = (SELECT id FROM roles WHERE LOWER(name) = 'admin');
SET @EXPERT_ID = (SELECT id FROM roles WHERE LOWER(name) = 'expert');
SET @USER_ID = (SELECT id FROM roles WHERE LOWER(name) = 'user');

-- 4.4.1.2 新增平台级设备注册权限（device:register）
INSERT INTO permissions (name, description, group_key)
SELECT * FROM (
  SELECT 'device:register' AS name, '注册设备（平台级）' AS description, 'device' AS group_key
) AS tmp
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.name = 'device:register');

SET @DEVICE_REGISTER_PERMISSION_ID = (SELECT id FROM permissions WHERE name = 'device:register' LIMIT 1);
INSERT INTO role_permissions (role_id, permission_id)
SELECT @ADMIN_ID, @DEVICE_REGISTER_PERMISSION_ID
FROM dual
WHERE @ADMIN_ID IS NOT NULL
  AND @DEVICE_REGISTER_PERMISSION_ID IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = @ADMIN_ID
      AND rp.permission_id = @DEVICE_REGISTER_PERMISSION_ID
  );


-- 5. 故障码表
-- 注意：short_message/user_hint/operation/detail/method/param1~4/tech_solution/explanation
-- 已迁移到 i18n_error_codes 作为业务读取来源。
-- 上述字段仍保留在主表，仅用于兼容历史数据（不再作为业务读取来源）。
CREATE TABLE IF NOT EXISTS error_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subsystem VARCHAR(100),
  code VARCHAR(50) NOT NULL,
  is_axis_error BOOLEAN DEFAULT FALSE,--
  is_arm_error BOOLEAN DEFAULT FALSE,
  short_message TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '精简提示信息（中文/默认）',
  user_hint TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '用户提示信息（中文/默认）',
  operation TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '操作信息（中文/默认）',
  detail TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  method TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  param1 VARCHAR(100),'故障日志记录的参数1'
  param2 VARCHAR(100),'故障日志记录的参数2'
  param3 VARCHAR(100),'故障日志记录的参数3'
  param4 VARCHAR(100),'故障日志记录的参数4'
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

-- 5.4 故障码技术排查方案附件表（支持图片/文件，最多5个）
CREATE TABLE IF NOT EXISTS tech_solution_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  error_code_id INT NOT NULL COMMENT '故障码ID',
  url TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '访问地址（可直链下载/预览）',
  storage ENUM('local','oss') DEFAULT 'local' COMMENT '存储类型',
  filename VARCHAR(255) COMMENT '存储文件名（本地或OSS对象名）',
  original_name VARCHAR(255) COMMENT '原始上传文件名',
  file_type VARCHAR(50) COMMENT '文件类型：image/file 等',
  object_key VARCHAR(512) COMMENT '存储Key（便于换域/CDN）',
  size_bytes INT COMMENT '文件大小（字节）',
  mime_type VARCHAR(100) COMMENT 'MIME类型',
  width INT COMMENT '宽度（仅图片可选）',
  height INT COMMENT '高度（仅图片可选）',
  sort_order INT DEFAULT 0 COMMENT '排序序号',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (error_code_id) REFERENCES error_codes(id) ON DELETE CASCADE,
  INDEX idx_error_code_id (error_code_id),
  INDEX idx_error_code_sort (error_code_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='故障码技术排查方案附件';

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
  file_time_token CHAR(12)
    GENERATED ALWAYS AS (
      CASE
        WHEN original_name REGEXP '^[0-9]{10,12}_'
          AND LOCATE('_', original_name) > 0
          THEN LPAD(LEFT(original_name, LOCATE('_', original_name) - 1), 12, '0')
        ELSE NULL
      END
    ) STORED
    COMMENT '从文件名提取的时间前缀(YYYYMMDDhh[mm])，不足 12 位时左侧补 0',
  file_year SMALLINT
    GENERATED ALWAYS AS (
      CASE
        WHEN original_name REGEXP '^[0-9]{10,12}_'
          THEN CAST(SUBSTRING(original_name, 1, 4) AS UNSIGNED)
        ELSE NULL
      END
    ) STORED
    COMMENT '文件名中的年份',
  file_month TINYINT UNSIGNED
    GENERATED ALWAYS AS (
      CASE
        WHEN original_name REGEXP '^[0-9]{10,12}_'
          THEN CAST(SUBSTRING(original_name, 5, 2) AS UNSIGNED)
        ELSE NULL
      END
    ) STORED
    COMMENT '文件名中的月份',
  file_day TINYINT UNSIGNED
    GENERATED ALWAYS AS (
      CASE
        WHEN original_name REGEXP '^[0-9]{10,12}_'
          THEN CAST(SUBSTRING(original_name, 7, 2) AS UNSIGNED)
        ELSE NULL
      END
    ) STORED
    COMMENT '文件名中的日期',
  file_hour TINYINT UNSIGNED
    GENERATED ALWAYS AS (
      CASE
        WHEN original_name REGEXP '^[0-9]{10,12}_'
          THEN CAST(SUBSTRING(original_name, 9, 2) AS UNSIGNED)
        ELSE NULL
      END
    ) STORED
    COMMENT '文件名中的小时',
  file_minute TINYINT UNSIGNED
    GENERATED ALWAYS AS (
      CASE
        WHEN original_name REGEXP '^[0-9]{12}_'
          THEN CAST(SUBSTRING(original_name, 11, 2) AS UNSIGNED)
        ELSE NULL
      END
    ) STORED
    COMMENT '文件名中的分钟(存在时)',
  size INT,
  status VARCHAR(50) DEFAULT 'uploaded',
  version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '当前日志版本号',
  upload_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  latest_upload_time DATETIME DEFAULT NULL COMMENT '最近一次上传时间',
  parse_time DATETIME,
  uploader_id INT,
  device_id VARCHAR(100),
  key_id VARCHAR(100),
  decrypted_path VARCHAR(255),
  source_type ENUM('auto','upload') DEFAULT 'auto',
  content_hash VARCHAR(64) NULL,
  remark TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7.1 运行数据（motion-data）文件元数据表
-- 说明：
-- - 同一设备允许同名文件上传，但语义为“覆盖原数据”：通过 (device_id, original_name) 唯一约束 + revision 版本号实现
-- - raw_object_key / parsed_object_key 用于 OSS 存储定位（原始 .bin 与解析后的 .jsonl.gz）
CREATE TABLE IF NOT EXISTS motion_data_files (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(100) NOT NULL COMMENT '设备编号（上传必填）',
  uploader_id INT NULL COMMENT '上传用户ID（users.id，可为空）',
  task_id VARCHAR(64) NULL COMMENT 'Bull 任务ID（用于追踪）',

  -- 文件信息
  original_name VARCHAR(255) NOT NULL COMMENT '原始文件名（YYYYMMDDhhmm.bin）',
  file_time_token CHAR(12) NULL COMMENT '从文件名解析的 YYYYMMDDhhmm（便于筛选/排序）',
  file_time DATETIME NULL COMMENT '从文件名解析的时间（本地时间，便于范围筛选）',
  size_bytes BIGINT UNSIGNED NOT NULL COMMENT '文件大小（字节）',

  -- 覆盖版本号：同名覆盖时 revision + 1；worker 回写时需校验 revision，避免旧任务覆盖新数据
  revision INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '覆盖版本号（同名覆盖时递增）',

  -- 存储信息（按需求：原始+解析后均存入 OSS）
  storage ENUM('oss','local') NOT NULL DEFAULT 'oss' COMMENT '存储介质',
  raw_object_key TEXT NULL COMMENT '原始bin的对象Key（OSS object key）',
  parsed_object_key TEXT NULL COMMENT '解析后jsonl.gz的对象Key（OSS object key）',
  sha256 CHAR(64) NULL COMMENT '文件 sha256（可选）',
  etag TEXT NULL COMMENT 'OSS etag（可选）',

  -- 解析元数据（用于时间轴/快速展示）
  entry_size_bytes INT NOT NULL DEFAULT 924 COMMENT '单帧字节数（固定 924）',
  sample_rate_hz INT NOT NULL DEFAULT 100 COMMENT '采样率（Hz，固定 100）',
  total_frames INT UNSIGNED NULL COMMENT '总帧数（size_bytes / entry_size_bytes）',
  ts_first BIGINT UNSIGNED NULL COMMENT '首帧时间戳 YYYYMMDDhhmmssxxx（17位数字）',
  ts_last BIGINT UNSIGNED NULL COMMENT '末帧时间戳 YYYYMMDDhhmmssxxx（17位数字）',

  -- 状态：上传中/解析中/解析失败/完成/文件错误/处理失败
  status ENUM('uploading','parsing','parse_failed','completed','file_error','processing_failed')
    NOT NULL DEFAULT 'uploading' COMMENT '处理状态',
  error_message TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL COMMENT '失败原因（可选）',

  upload_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  parse_time DATETIME NULL COMMENT '解析完成时间',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_motion_device_filename (device_id, original_name),
  KEY idx_motion_device_time (device_id, upload_time),
  KEY idx_motion_status_time (status, upload_time),
  KEY idx_motion_device_file_time (device_id, file_time),
  KEY idx_motion_status_file_time (status, file_time),
  KEY idx_motion_file_time_token (file_time_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='运行数据（motion-data）文件元数据表';
  
-- 8. 日志解密后内容表，移植前mysql

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
  subsystem_char CHAR(1)
    GENERATED ALWAYS AS (
      CASE
        WHEN (LEFT(error_code,1) IN ('1','2','3','4','5','6','7','8','9','A')) THEN LEFT(error_code,1)
        ELSE NULL
      END
    ) STORED
    COMMENT '故障码首字符(子系统)，用于快速联表到error_codes',
  code4 CHAR(6)
    GENERATED ALWAYS AS (
      CONCAT('0X', UPPER(RIGHT(error_code,4)))
    ) STORED
    COMMENT '规范化故障码(0X+4位)，用于快速联表到error_codes',
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
-- 业务侧多语言文本统一读取本表：
-- short_message/user_hint/operation/detail/method/param1~4/tech_solution/explanation
-- 主表 error_codes 中同名字段仅兼容保留，不再作为业务读取来源。
CREATE TABLE IF NOT EXISTS i18n_error_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  error_code_id INT NOT NULL,
  lang VARCHAR(10) NOT NULL,
  short_message TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '精简提示信息',
  user_hint TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '用户提示信息',
  operation TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '操作信息',
  detail TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '详细信息',
  method TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '方法信息',
  param1 VARCHAR(100) COMMENT '故障日志记录的参数1',
  param2 VARCHAR(100) COMMENT '故障日志记录的参数2',
  param3 VARCHAR(100) COMMENT '故障日志记录的参数3',
  param4 VARCHAR(100) COMMENT '故障日志记录的参数4',
  tech_solution TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '技术解决方案',
  explanation TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '说明信息',
  -- 注意：solution, level, category 字段不在 i18n_error_codes 表中
  -- 这些字段的值是固定的枚举值，只存储在 error_codes 表中，通过前端 i18n 翻译显示
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (error_code_id) REFERENCES error_codes(id) ON DELETE CASCADE,
  UNIQUE KEY unique_error_code_lang (error_code_id, lang),
  INDEX idx_error_code_id (error_code_id),
  INDEX idx_lang (lang)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. 一期：设备-医院-地域主数据
-- 说明：
-- - 设备绑定标准医院（devices.hospital_id）
-- - 医院绑定国家与区域字典
-- - 国家/区域字典默认由脚本导入维护
-- 11. 国家字典表（设备/医院地域主数据）
CREATE TABLE IF NOT EXISTS geo_country (
  country_code VARCHAR(16) PRIMARY KEY,
  country_name VARCHAR(100) NOT NULL,
  country_name_en VARCHAR(100),
  status BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_geo_country_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='国家字典表';

-- 11.1 区域字典表（支持国家下分级区域）
CREATE TABLE IF NOT EXISTS geo_region (
  id INT AUTO_INCREMENT PRIMARY KEY,
  country_code VARCHAR(16) NOT NULL,
  region_code VARCHAR(64) NOT NULL,
  region_name VARCHAR(100) NOT NULL,
  region_name_en VARCHAR(100) NULL,
  parent_region_code VARCHAR(64) NULL,
  level VARCHAR(32) NULL COMMENT '区域层级（如 province/city）',
  status BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_geo_region_code (region_code),
  KEY idx_geo_region_country (country_code),
  KEY idx_geo_region_parent (parent_region_code),
  KEY idx_geo_region_status (status),
  CONSTRAINT fk_geo_region_country FOREIGN KEY (country_code) REFERENCES geo_country(country_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='区域字典表';

-- 11.2 标准医院主数据表
CREATE TABLE IF NOT EXISTS hospital_master (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hospital_code VARCHAR(100) NOT NULL,
  hospital_name_std VARCHAR(255) NOT NULL,
  country_code VARCHAR(16) NOT NULL,
  region_code VARCHAR(64) NULL,
  status BOOLEAN DEFAULT TRUE,
  source_system VARCHAR(64) NULL,
  source_key VARCHAR(128) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_hospital_code (hospital_code),
  KEY idx_hospital_country (country_code),
  KEY idx_hospital_region (region_code),
  KEY idx_hospital_name (hospital_name_std(100)),
  KEY idx_hospital_status (status),
  CONSTRAINT fk_hospital_country FOREIGN KEY (country_code) REFERENCES geo_country(country_code),
  CONSTRAINT fk_hospital_region FOREIGN KEY (region_code) REFERENCES geo_region(region_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='标准医院主数据';

-- 11.2.1 医院可委派权限策略（平台授权医院可创建角色时的权限上限，ID关联）
CREATE TABLE IF NOT EXISTS hospital_permission_policies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  hospital_id INT NOT NULL COMMENT '医院ID',
  permission_id INT NOT NULL COMMENT '可委派权限ID',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  granted_by INT NULL COMMENT '平台授权人',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_hpp_hospital_permission_id (hospital_id, permission_id),
  INDEX idx_hospital_permission_enabled (hospital_id, enabled),
  INDEX idx_hpp_permission_id (permission_id),
  CONSTRAINT fk_hpp_hospital FOREIGN KEY (hospital_id) REFERENCES hospital_master(id) ON DELETE CASCADE,
  CONSTRAINT fk_hpp_permission_id FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_hpp_granted_by FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='医院可委派权限策略';

-- 11.2.2 权限模板头
CREATE TABLE IF NOT EXISTS permission_policy_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  template_code VARCHAR(64) NOT NULL COMMENT '模板编码（唯一）',
  template_name VARCHAR(100) NOT NULL COMMENT '模板名称',
  description VARCHAR(255) NULL COMMENT '模板描述',
  status ENUM('draft','active','archived') NOT NULL DEFAULT 'draft' COMMENT '状态',
  version_no INT NOT NULL DEFAULT 1 COMMENT '版本号',
  created_by INT NULL COMMENT '创建人',
  updated_by INT NULL COMMENT '更新人',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_permission_policy_template_code (template_code),
  KEY idx_permission_policy_template_status (status),
  CONSTRAINT fk_ppt_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ppt_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='权限模板';

-- 11.2.3 权限模板明细
CREATE TABLE IF NOT EXISTS permission_policy_template_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  template_id INT NOT NULL COMMENT '权限模板ID',
  permission_id INT NOT NULL COMMENT '权限ID',
  enabled BOOLEAN NOT NULL DEFAULT TRUE COMMENT '模板内默认是否启用',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_permission_template_item (template_id, permission_id),
  KEY idx_permission_template_item_permission (permission_id),
  CONSTRAINT fk_ppti_template FOREIGN KEY (template_id) REFERENCES permission_policy_templates(id) ON DELETE CASCADE,
  CONSTRAINT fk_ppti_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='权限模板明细';

-- 11.2.4 医院-权限模板绑定（每院单模板）
CREATE TABLE IF NOT EXISTS hospital_permission_template_bindings (
  hospital_id INT PRIMARY KEY COMMENT '医院ID（每院仅绑定1个权限模板）',
  template_id INT NOT NULL COMMENT '权限模板ID',
  applied_version_no INT NOT NULL COMMENT '应用时版本快照',
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '应用时间',
  applied_by INT NULL COMMENT '操作人',
  notes VARCHAR(255) NULL COMMENT '备注',
  KEY idx_hptb_template_id (template_id),
  CONSTRAINT fk_hptb_hospital FOREIGN KEY (hospital_id) REFERENCES hospital_master(id) ON DELETE CASCADE,
  CONSTRAINT fk_hptb_template FOREIGN KEY (template_id) REFERENCES permission_policy_templates(id) ON DELETE RESTRICT,
  CONSTRAINT fk_hptb_applied_by FOREIGN KEY (applied_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='医院权限模板绑定';

-- 11.2.5 角色模板头
CREATE TABLE IF NOT EXISTS role_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  template_code VARCHAR(64) NOT NULL COMMENT '模板编码（唯一）',
  template_name VARCHAR(100) NOT NULL COMMENT '模板名称',
  description VARCHAR(255) NULL COMMENT '模板描述',
  status ENUM('draft','active','archived') NOT NULL DEFAULT 'draft' COMMENT '状态',
  version_no INT NOT NULL DEFAULT 1 COMMENT '版本号',
  created_by INT NULL COMMENT '创建人',
  updated_by INT NULL COMMENT '更新人',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_role_template_code (template_code),
  KEY idx_role_template_status (status),
  CONSTRAINT fk_rt_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_rt_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色模板';

-- 11.2.6 角色模板项
CREATE TABLE IF NOT EXISTS role_template_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  role_template_id INT NOT NULL COMMENT '角色模板ID',
  role_name VARCHAR(100) NOT NULL COMMENT '模板角色名',
  role_description VARCHAR(255) NULL COMMENT '模板角色描述',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_role_template_item_name (role_template_id, role_name),
  KEY idx_role_template_item_sort (role_template_id, sort_order),
  CONSTRAINT fk_rti_role_template FOREIGN KEY (role_template_id) REFERENCES role_templates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='角色模板项';

-- 11.2.7 模板角色-权限映射
CREATE TABLE IF NOT EXISTS role_template_item_permissions (
  role_template_item_id INT NOT NULL COMMENT '角色模板项ID',
  permission_id INT NOT NULL COMMENT '权限ID',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role_template_item_id, permission_id),
  KEY idx_rtip_permission_id (permission_id),
  CONSTRAINT fk_rtip_item FOREIGN KEY (role_template_item_id) REFERENCES role_template_items(id) ON DELETE CASCADE,
  CONSTRAINT fk_rtip_permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='模板角色权限映射';

-- 11.2.8 医院-角色模板绑定（每院单模板）
CREATE TABLE IF NOT EXISTS hospital_role_template_bindings (
  hospital_id INT PRIMARY KEY COMMENT '医院ID（每院仅绑定1个角色模板）',
  role_template_id INT NOT NULL COMMENT '角色模板ID',
  applied_version_no INT NOT NULL COMMENT '应用时版本快照',
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '应用时间',
  applied_by INT NULL COMMENT '操作人',
  notes VARCHAR(255) NULL COMMENT '备注',
  KEY idx_hrtb_role_template_id (role_template_id),
  CONSTRAINT fk_hrtb_hospital FOREIGN KEY (hospital_id) REFERENCES hospital_master(id) ON DELETE CASCADE,
  CONSTRAINT fk_hrtb_role_template FOREIGN KEY (role_template_id) REFERENCES role_templates(id) ON DELETE RESTRICT,
  CONSTRAINT fk_hrtb_applied_by FOREIGN KEY (applied_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='医院角色模板绑定';

-- 11.3 设备管理表
CREATE TABLE IF NOT EXISTS devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(100) NOT NULL UNIQUE,   -- 设备编号（唯一，例如 4371-01 / ABC-12）
  alias VARCHAR(100) NULL,                  -- 设备别称（昵称）
  location VARCHAR(255) NULL,               -- 设备位置
  device_model VARCHAR(100),                -- 设备型号
  device_key VARCHAR(100),                  -- 设备密钥（MAC，如 00-01-05-77-6a-09）
  hospital_id INT NULL,                     -- 标准医院ID（推荐）
  hospital_code VARCHAR(100) NULL,          -- 医院编码（冗余）
  hospital VARCHAR(255),                    -- 所属医院
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 兼容升级：devices.hospital_id 已并入建表语句，历史库请按独立迁移脚本补齐字段

-- 兼容升级：补齐外键与索引（若已存在则可能报错，可忽略）
CREATE INDEX idx_devices_hospital_id ON devices(hospital_id);
ALTER TABLE devices
  ADD CONSTRAINT fk_devices_hospital_id FOREIGN KEY (hospital_id) REFERENCES hospital_master(id);


-- 11.1 设备型号字典表（用于故障案例 equipment_model 下拉，独立维护）
CREATE TABLE IF NOT EXISTS device_model_dict (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_model VARCHAR(100) NOT NULL UNIQUE, -- 设备型号（唯一）
  is_active TINYINT(1) NOT NULL DEFAULT 1,   -- 是否启用（1启用/0停用）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11.2 故障案例状态字典表（可配置/可扩展）
CREATE TABLE IF NOT EXISTS fault_case_statuses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  status_key VARCHAR(50) NOT NULL COMMENT '唯一key：resolved/unresolved/under_observation/requirement等',
  name_zh VARCHAR(100) NOT NULL COMMENT '中文名称',
  name_en VARCHAR(100) NOT NULL COMMENT '英文名称',
  description VARCHAR(255) NULL,
  sort_order INT DEFAULT 0 COMMENT '排序顺序',
  is_active BOOLEAN DEFAULT TRUE COMMENT '是否启用',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_fault_case_status_key (status_key),
  INDEX idx_fault_case_status_active (is_active),
  INDEX idx_fault_case_status_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='故障案例状态字典表';

-- 11.2.1 故障案例状态映射表（1对多：一个状态可对应多个外部字段值）
CREATE TABLE IF NOT EXISTS fault_case_status_mappings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  status_id INT NOT NULL COMMENT '关联 fault_case_statuses.id',
  source_field VARCHAR(100) NOT NULL DEFAULT 'default' COMMENT '外部字段名：如 jira_status / excel_status',
  source_value VARCHAR(100) NOT NULL COMMENT '外部字段取值：用于映射到本状态',
  sort_order INT DEFAULT 0 COMMENT '排序顺序',
  is_active BOOLEAN DEFAULT TRUE COMMENT '是否启用',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_fault_case_status_mappings_status
    FOREIGN KEY (status_id) REFERENCES fault_case_statuses(id) ON DELETE CASCADE,
  UNIQUE KEY uk_fcs_map (status_id, source_field, source_value),
  INDEX idx_fcs_map_status (status_id),
  INDEX idx_fcs_map_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='故障案例状态映射（1对多）';

-- 11.3 故障案例模块字典表（可配置/可扩展）
CREATE TABLE IF NOT EXISTS fault_case_modules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  module_key VARCHAR(80) NOT NULL COMMENT '唯一key：patient_platform/surgeon_console等',
  name_zh VARCHAR(100) NOT NULL COMMENT '中文名称',
  name_en VARCHAR(120) NOT NULL COMMENT '英文名称',
  description VARCHAR(255) NULL,
  sort_order INT DEFAULT 0 COMMENT '排序顺序',
  is_active BOOLEAN DEFAULT TRUE COMMENT '是否启用',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_fault_case_module_key (module_key),
  INDEX idx_fault_case_module_active (is_active),
  INDEX idx_fault_case_module_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='故障案例模块字典表';

-- 11.3.1 故障案例模块映射表（1对多：一个模块可对应多个外部字段值）
CREATE TABLE IF NOT EXISTS fault_case_module_mappings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  module_id INT NOT NULL COMMENT '关联 fault_case_modules.id',
  source_field VARCHAR(100) NOT NULL DEFAULT 'default' COMMENT '外部字段名：如 subsystem/module/component',
  source_value VARCHAR(100) NOT NULL COMMENT '外部字段取值：用于映射到本模块',
  sort_order INT DEFAULT 0 COMMENT '排序顺序',
  is_active BOOLEAN DEFAULT TRUE COMMENT '是否启用',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_fault_case_module_mappings_module
    FOREIGN KEY (module_id) REFERENCES fault_case_modules(id) ON DELETE CASCADE,
  UNIQUE KEY uk_fcm_map (module_id, source_field, source_value),
  INDEX idx_fcm_map_module (module_id),
  INDEX idx_fcm_map_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='故障案例模块映射（1对多）';

-- 11.2.x 预置：故障案例状态（幂等）
INSERT INTO fault_case_statuses (status_key, name_zh, name_en, description, sort_order, is_active) VALUES
  ('resolved', '已解决', 'Resolved', '问题已定位并闭环', 10, TRUE),
  ('unresolved', '未解决', 'Unresolved', '问题尚未解决', 20, TRUE),
  ('under_observation', '观察中', 'Under observation', '需要持续观察或等待更多信息', 30, TRUE),
  ('requirement', '需求', 'Requirement', '需求/改进项（非缺陷闭环）', 40, TRUE)
ON DUPLICATE KEY UPDATE
  name_zh = VALUES(name_zh),
  name_en = VALUES(name_en),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);

-- 11.3.x 预置：故障案例模块（幂等）
INSERT INTO fault_case_modules (module_key, name_zh, name_en, description, sort_order, is_active) VALUES
  ('patient_platform', '患者平台', 'Patient Platform', NULL, 10, TRUE),
  ('surgeon_console', '医生控制台', 'Surgeon Console', NULL, 20, TRUE),
  ('vision_platform', '图像平台', 'Vision Platform', NULL, 30, TRUE),
  ('instrument_arm', '工具臂', 'instrument arm', NULL, 40, TRUE),
  ('adjustment_arm', '调整臂', 'adjustment arm', NULL, 50, TRUE),
  ('master_arm', '主控制臂', 'master arm', NULL, 60, TRUE),
  ('instrument', '器械', 'instrument', NULL, 70, TRUE),
  ('motion_control_software', '运动控制软件', 'motion control software', NULL, 80, TRUE),
  ('visual_software', '视觉软件', 'visual software', NULL, 90, TRUE),
  ('telecommunication_platform', '远程通信平台', 'Telecommunication Platform', NULL, 100, TRUE)
ON DUPLICATE KEY UPDATE
  name_zh = VALUES(name_zh),
  name_en = VALUES(name_en),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  is_active = VALUES(is_active);

-- 11.1 设备密钥表（支持多密钥按时间范围，精确到小时）
CREATE TABLE IF NOT EXISTS device_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(100) NOT NULL COMMENT '设备编号',
  key_value VARCHAR(100) NOT NULL COMMENT '密钥值（MAC地址）',
  valid_from_date DATETIME NOT NULL COMMENT '密钥生效起始时间（包含，精确到小时）',
  valid_to_date DATETIME NULL COMMENT '密钥生效结束时间（不包含，NULL表示永久有效）',
  is_default BOOLEAN DEFAULT FALSE COMMENT '是否为默认密钥（向后兼容，可不用）',
  priority INT DEFAULT 0 COMMENT '优先级（数字越大优先级越高，用于时间重叠时选择）',
  description VARCHAR(255) COMMENT '密钥描述（如：更换硬件前/后）',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  created_by INT COMMENT '创建者ID（可选，不强制外键约束）',
  INDEX idx_device_date (device_id, valid_from_date, valid_to_date),
  INDEX idx_device_id (device_id),
  INDEX idx_valid_from_date (valid_from_date),
  INDEX idx_valid_to_date (valid_to_date),
  INDEX idx_is_default (is_default),
  INDEX idx_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='设备密钥表（支持多密钥按时间范围）';

-- 历史库升级（若列已是 DATETIME 可跳过）：
-- ALTER TABLE device_keys
--   MODIFY COLUMN valid_from_date DATETIME NOT NULL COMMENT '密钥生效起始时间（包含，精确到小时）',
--   MODIFY COLUMN valid_to_date DATETIME NULL COMMENT '密钥生效结束时间（不包含，NULL=永久）';

# 故障反馈
CREATE TABLE feedbacks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  hospital_id INT NULL,
  device_id VARCHAR(100) NULL,
  title VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL,
  issue_type VARCHAR(50) NULL,
  status ENUM('open','in_progress','resolved') NOT NULL DEFAULT 'open',
  handled_by INT NULL,
  handled_at DATETIME NULL,
  handle_note VARCHAR(500) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_feedbacks_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_feedbacks_hospital_id FOREIGN KEY (hospital_id) REFERENCES hospital_master(id),
  CONSTRAINT fk_feedbacks_handled_by FOREIGN KEY (handled_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_feedbacks_user_id (user_id),
  INDEX idx_feedbacks_hospital_id (hospital_id),
  INDEX idx_feedbacks_device_id (device_id),
  INDEX idx_feedbacks_status (status),
  INDEX idx_feedbacks_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

# 故障反馈附件
CREATE TABLE feedback_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  feedback_id INT NOT NULL,
  media_type ENUM('image','video','audio') NOT NULL DEFAULT 'image',
  storage_provider VARCHAR(20) NOT NULL DEFAULT 'oss',
  bucket_name VARCHAR(128) NULL,
  object_key VARCHAR(512) NULL,
  url VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NULL,
  original_name VARCHAR(255) NULL,
  width INT NULL,
  height INT NULL,
  size_bytes INT NULL,
  duration_seconds INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_feedback_images_feedback_id FOREIGN KEY (feedback_id) REFERENCES feedbacks(id) ON DELETE CASCADE,
  INDEX idx_feedback_images_feedback_id (feedback_id),
  INDEX idx_feedback_images_media_type (media_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. 会话管理说明
-- 会话三层表（conversation_containers / conversation_instances / conversation_messages）
-- 仅在 PostgreSQL 中维护，请执行：
-- infrastructure/database/agent_orchestrator_postgresql.sql

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
CREATE INDEX idx_logs_file_time ON logs(file_year, file_month, file_day, file_hour, file_minute);
CREATE INDEX idx_logs_file_token ON logs(file_time_token);

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
CREATE INDEX idx_le_norm ON log_entries(subsystem_char, code4);
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

-- ========================================
-- device_keys表索引
-- ========================================
-- 索引已在表定义中创建，此处无需重复创建

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
SELECT 'permission_groups' AS table_name, COUNT(*) AS count FROM permission_groups
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
SELECT 'devices' AS table_name, COUNT(*) AS count FROM devices
UNION ALL
SELECT 'device_keys' AS table_name, COUNT(*) AS count FROM device_keys
UNION ALL
SELECT 'fault_case_statuses' AS table_name, COUNT(*) AS count FROM fault_case_statuses
UNION ALL
SELECT 'fault_case_status_mappings' AS table_name, COUNT(*) AS count FROM fault_case_status_mappings
UNION ALL
SELECT 'fault_case_modules' AS table_name, COUNT(*) AS count FROM fault_case_modules
UNION ALL
SELECT 'fault_case_module_mappings' AS table_name, COUNT(*) AS count FROM fault_case_module_mappings;

-- 注意：surgeries 和 surgery_versions 表在 PostgreSQL 数据库中，不在此MySQL库

-- 17. 验证字符集设置
SELECT 
    TABLE_NAME,
    TABLE_COLLATION,
    TABLE_CHARSET
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = 'logtool'
ORDER BY TABLE_NAME;
