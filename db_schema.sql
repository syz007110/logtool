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
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

-- 故障码表
CREATE TABLE IF NOT EXISTS error_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subsystem VARCHAR(100),
  code VARCHAR(50) NOT NULL UNIQUE,
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
);

-- 日志表
CREATE TABLE IF NOT EXISTS logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  original_path VARCHAR(255),
  uploader_id INT,
  upload_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  size BIGINT,
  status VARCHAR(50) DEFAULT 'uploaded',
  decrypted_path VARCHAR(255),
  FOREIGN KEY (uploader_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 多语言配置表（可选，便于后续扩展）
CREATE TABLE IF NOT EXISTS i18n_texts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  key_name VARCHAR(100) NOT NULL,
  lang VARCHAR(10) NOT NULL,
  text TEXT,
  UNIQUE KEY unique_key_lang (key_name, lang)
); 