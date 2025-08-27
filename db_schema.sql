create database logtool CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 权限/角色表
CREATE TABLE IF NOT EXISTS roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255)
);

-- 用户-角色关联表
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
);

-- 故障码表
CREATE TABLE IF NOT EXISTS error_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subsystem VARCHAR(100),
  code VARCHAR(50) NOT NULL,
  is_axis_error BOOLEAN DEFAULT FALSE,
  is_arm_error BOOLEAN DEFAULT FALSE,
  short_message TEXT,
  short_message_en TEXT,
  user_hint TEXT,
  user_hint_en TEXT,
  operation TEXT,
  operation_en TEXT,
  detail TEXT,
  method TEXT,
  param1 VARCHAR(100),
  param2 VARCHAR(100),
  param3 VARCHAR(100),
  param4 VARCHAR(100),
  solution TEXT,
  for_expert BOOLEAN DEFAULT FALSE,
  for_novice BOOLEAN DEFAULT FALSE,
  related_log BOOLEAN DEFAULT FALSE,
  stop_report TEXT,
  level VARCHAR(50),
  tech_solution TEXT,
  explanation TEXT,
  category VARCHAR(100)
  UNIQUE KEY unique_subsystem_code (subsystem, code)
);


-- 多语言配置表（可选，便于后续扩展）
CREATE TABLE IF NOT EXISTS i18n_texts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  key_name VARCHAR(100) NOT NULL,
  lang VARCHAR(10) NOT NULL,
  text TEXT,
  UNIQUE KEY unique_key_lang (key_name, lang)
); 

-- 设备日志文件元数据表
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
  remark TEXT
);

-- 日志解密后内容表
CREATE TABLE IF NOT EXISTS log_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  log_id INT NOT NULL,
  timestamp DATETIME,
  error_code VARCHAR(50),
  param1 VARCHAR(100),
  param2 VARCHAR(100),
  param3 VARCHAR(100),
  param4 VARCHAR(100),
  explanation TEXT,
  FOREIGN KEY (log_id) REFERENCES logs(id) ON DELETE CASCADE
);

-- 操作日志表
CREATE TABLE IF NOT EXISTS operation_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  operation VARCHAR(100) NOT NULL,
  description TEXT,
  user_id INT,
  username VARCHAR(100),
  status VARCHAR(50) DEFAULT 'success',
  ip VARCHAR(45),
  user_agent TEXT,
  details JSON,
  time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_operation (operation),
  INDEX idx_time (time)
);

-- 故障码多语言表
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

--设备管理
CREATE TABLE IF NOT EXISTS devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(100) NOT NULL UNIQUE,   -- 设备编号（唯一，例如 4371-01 / ABC-12）
  device_model VARCHAR(100),                -- 设备型号
  device_key VARCHAR(100),                  -- 设备密钥（MAC，如 00-01-05-77-6a-09）
  hospital VARCHAR(255),                    -- 所属医院
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 修复数据库字符集为UTF-8
-- 执行此脚本前请备份数据库

-- 1. 修改数据库字符集
ALTER DATABASE logtool CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. 修改多语言故障码表字符集
ALTER TABLE i18n_error_codes CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3. 修改故障码表字符集（如果需要）
ALTER TABLE error_codes CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4. 修改其他相关表的字符集
ALTER TABLE users CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE roles CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE user_roles CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE logs CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE log_entries CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE operation_logs CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE i18n_texts CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 缺陷反馈主表
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

-- 缺陷反馈图片表
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

--postgreSql
-- 创建手术统计相关表
-- surgeries 主表：用于存储手术的基本信息
CREATE TABLE surgeries (
    id SERIAL PRIMARY KEY,
    surgery_id VARCHAR(50) UNIQUE NOT NULL,
    device_ids INT[],
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    is_remote BOOLEAN,
    structured_data JSONB,       -- 当前有效的手术结构化数据
    last_analyzed_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

--用于记录手术统计版本信息
CREATE TABLE surgery_versions (
    id SERIAL PRIMARY KEY,
    surgery_id INT REFERENCES surgeries(id) ON DELETE CASCADE,
    structured_data JSONB,
    source_logs INT[],           -- 分析使用的日志文件ID集合
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

--字段存 JSONB，包含手术的详细结构化信息
--JSONB 结构模板
{
  "power_cycles": [
    {"on_time": "08:55", "off_time": "09:05"},
    {"on_time": "09:10", "off_time": "09:15"}
  ],
  "arms": [
    {
      "arm_id": 1,
      "instrument_usage": [
        {
          "tool_type": "剪刀",
          "udi": "UDI-123456",
          "start_time": "09:00",
          "end_time": "09:05",
          "energy_activation": [{"start":"09:01","end":"09:02"}]
        },
        {
          "tool_type": "缝合器",
          "udi": "UDI-654321",
          "start_time": "09:06",
          "end_time": "09:10"
        }
      ]
    },
    {
      "arm_id": 2,
      "instrument_usage": [
        {
          "tool_type": "钳子",
          "udi": "UDI-987654",
          "start_time": "09:02",
          "end_time": "09:08"
        }
      ]
    },
    {
      "arm_id": 3,
      "instrument_usage": []
    },
    {
      "arm_id": 4,
      "instrument_usage": []
    }
  ],
  "surgery_stats": {
    "has_fault": true,
    "success": false,
    "is_remote": true,
    "network_latency_ms": [120, 80, 200],
       "faults": [
      {"timestamp": "09:02", "error_code": "E101","param1":"val1","param2":"val2","param3":"","param4":"","explanation":"机械臂故障","log_id":123}
    ],
    "state_machine": [{"time":"09:00","state":"INIT"},{"time":"09:01","state":"READY"}],
    "arm_switch_count": 3,
    "left_hand_clutch": 4,
    "right_hand_clutch": 5,
    "foot_clutch": 6,
    "endoscope_pedal": 7
  }
}