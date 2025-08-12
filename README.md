# logTool 项目概要

## 主要需求

- 支持故障码的增删改查
- 支持日志上传、解密、分析、解密后下载
- 账户管理（注册、登录、权限、注销）
- 故障码的解释需要支持翻译多国语言且可拓展，支持导出 XML
- 系统支持中英文切换

## 技术架构

- 前端：Vue.js + Element UI/Vuetify + Vuex + Vue Router + Vue I18n
- 后端：Node.js + Express.js + JWT + bcrypt + MySQL

## 数据库表结构（已设计）

- 用户表（users）：存储用户信息、密码哈希、激活状态等
- 权限表（roles）：定义不同权限/角色
- 用户-权限关联表（user_roles）：多对多关联
- 故障码表（error_codes）：详见 db_schema.sql，支持多语言字段
- 日志表（logs）：存储上传日志的元数据、解密状态等
- 多语言配置表（i18n_texts）：便于后续扩展多语言内容
- 设备表（devices）:存储设备型号、密钥等信息；

## 修改历史：
- 2025-08-12 实现基本功能v0.0

