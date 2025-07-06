-- 清空测试数据的SQL脚本
-- 注意：此脚本会删除所有数据，请谨慎使用！

USE logtool;

-- 禁用外键检查（避免删除顺序问题）
SET FOREIGN_KEY_CHECKS = 0;

-- 清空用户角色关联表
TRUNCATE TABLE user_roles;

-- 清空用户表
TRUNCATE TABLE users;

-- 清空角色表
TRUNCATE TABLE roles;

-- 清空故障码表
TRUNCATE TABLE error_codes;

-- 清空日志表
TRUNCATE TABLE logs;

-- 清空多语言配置表
TRUNCATE TABLE i18n_texts;

-- 重新启用外键检查
SET FOREIGN_KEY_CHECKS = 1;

-- 重置自增ID
ALTER TABLE users AUTO_INCREMENT = 1;
ALTER TABLE roles AUTO_INCREMENT = 1;
ALTER TABLE error_codes AUTO_INCREMENT = 1;
ALTER TABLE logs AUTO_INCREMENT = 1;
ALTER TABLE i18n_texts AUTO_INCREMENT = 1;

-- 显示清空结果
SELECT '数据清空完成！' AS message;
SELECT 'users' AS table_name, COUNT(*) AS count FROM users
UNION ALL
SELECT 'roles' AS table_name, COUNT(*) AS count FROM roles
UNION ALL
SELECT 'user_roles' AS table_name, COUNT(*) AS count FROM user_roles
UNION ALL
SELECT 'error_codes' AS table_name, COUNT(*) AS count FROM error_codes
UNION ALL
SELECT 'logs' AS table_name, COUNT(*) AS count FROM logs
UNION ALL
SELECT 'i18n_texts' AS table_name, COUNT(*) AS count FROM i18n_texts; 