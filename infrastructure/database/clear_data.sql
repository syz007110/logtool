-- 清空数据库数据的维护脚本
-- 注意：此脚本会删除所有数据，请谨慎使用！
-- 建议在执行前备份数据库

USE logtool;

-- 禁用外键检查（避免删除顺序问题）
SET FOREIGN_KEY_CHECKS = 0;

-- 清空所有表数据（按依赖关系顺序）
TRUNCATE TABLE surgery_versions;
TRUNCATE TABLE surgeries;
TRUNCATE TABLE feedback_images;
TRUNCATE TABLE feedbacks;
TRUNCATE TABLE log_entries;
TRUNCATE TABLE logs;
TRUNCATE TABLE i18n_error_codes;
TRUNCATE TABLE i18n_texts;
TRUNCATE TABLE error_codes;
TRUNCATE TABLE user_roles;
TRUNCATE TABLE users;
TRUNCATE TABLE roles;
TRUNCATE TABLE devices;

-- 重新启用外键检查
SET FOREIGN_KEY_CHECKS = 1;

-- 重置所有表的自增ID
ALTER TABLE users AUTO_INCREMENT = 1;
ALTER TABLE roles AUTO_INCREMENT = 1;
ALTER TABLE error_codes AUTO_INCREMENT = 1;
ALTER TABLE logs AUTO_INCREMENT = 1;
ALTER TABLE log_entries AUTO_INCREMENT = 1;
ALTER TABLE devices AUTO_INCREMENT = 1;
ALTER TABLE i18n_texts AUTO_INCREMENT = 1;
ALTER TABLE i18n_error_codes AUTO_INCREMENT = 1;
ALTER TABLE feedbacks AUTO_INCREMENT = 1;
ALTER TABLE feedback_images AUTO_INCREMENT = 1;
ALTER TABLE surgeries AUTO_INCREMENT = 1;
ALTER TABLE surgery_versions AUTO_INCREMENT = 1;

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
SELECT 'log_entries' AS table_name, COUNT(*) AS count FROM log_entries
UNION ALL
SELECT 'i18n_texts' AS table_name, COUNT(*) AS count FROM i18n_texts
UNION ALL
SELECT 'i18n_error_codes' AS table_name, COUNT(*) AS count FROM i18n_error_codes
UNION ALL
SELECT 'devices' AS table_name, COUNT(*) AS count FROM devices
UNION ALL
SELECT 'feedbacks' AS table_name, COUNT(*) AS count FROM feedbacks
UNION ALL
SELECT 'feedback_images' AS table_name, COUNT(*) AS count FROM feedback_images
UNION ALL
SELECT 'surgeries' AS table_name, COUNT(*) AS count FROM surgeries
UNION ALL
SELECT 'surgery_versions' AS table_name, COUNT(*) AS count FROM surgery_versions;
