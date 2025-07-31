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

-- 5. 验证字符集设置
SELECT 
    TABLE_NAME,
    TABLE_COLLATION,
    TABLE_CHARSET
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = 'logtool';

-- 6. 验证列字符集设置
SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    CHARACTER_SET_NAME,
    COLLATION_NAME
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = 'logtool' 
AND TABLE_NAME = 'i18n_error_codes'; 