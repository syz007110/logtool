# LogTool Agent 总要求
- API：路由/控制器负责鉴权、输入校验、响应映射、错误码；新增或修改时同步更新 OpenAPI 和接口测试。
- Service：负责业务规则、事务、权限的业务层校验、审计调用与持久化编排；不依赖 HTTP req/res。
- 外部系统交互：统一经 Adapter/Client；Webhook、队列、RPC 虽非 REST，也要维护明确的契约、鉴权、幂等与审计
- 禁止：Route 直接操作 Model；多个 API 分别复制同一业务规则；业务模块绕过 AuditService 写审计表。 这两个要求具体是什么
- 数据模型的要求：所有表、约束、索引、初始角色和权限目录数据均通过数据库 Migration 创建或演进，不依赖手工数据库变更。建议模型如下（数据库字段使用 snake_case，对外 API 使用 camelCase）：
- 新增或修改业务规则：补充相应单元测试
- 跨模块、事务、鉴权或数据持久化的关键场景：补充集成测试，集成测试使用测试数据库和测试环境，

# 审计功能要求
- 所有 审计通过 `AuditService` 写入，不得由业务模块直接操作 `audit_logs`；审计字段和脱敏规则遵循 `audit.md`。
- `backend/src/audit/eventDefinitions.js` 是事件定义的唯一实现来源，负责维护事件的分类、摘要、目标类型与策略、允许的结果和原因码，以及 `details` 的 JSON Schema 白名单；