---
title: 未命名 1
status: draft
created: 2026-11-02
updated: 2026-11-02
related: []
---

# 1. 需求
## 目标与范围
- 系统需要有审计功能，能够记录用户的操作信息，为了可以记录用户的行为，为后续统计、复盘、问题排查、分析用户行为建立数据基础，记录的信息至少包含时间戳、业务事件码、操作人、做了什么事情、结果是什么、事情的概述；
- 审计记录支持查询、导出；
	需要有独立的权限：审计记录的查询，审计记录的导出；
	有独立的审计查询、检索页面、导出页面；
		默认按照时间排序展示审计信息
		支持 时间、事件码、操作人作为关键词的检索；
- 审计基础模块不依赖具体业务模块；业务模块通过稳定的 AuditService 契约显式写入审计事件，不得直接操作审计表。
## 非目标与后续阶段
- 审计日志自动清理、独立维护账号及 `AUDIT.LOGS_PURGED` 事件为后续阶段能力；
- 首期导出为受最大记录数限制的同步 CSV 导出；超出限制后的异步导出任务后续设计。
- 不用一次性完成所有的业务调用，只是先把审计功能模型先完成，后续逐个功能替换改审计模块
## 前端 UI 与交互

# 2. 技术方案
- 审计是独立的公共基础模块，不依赖具体业务表或业务流程实现；但每个业务功能必须显式定义并调用 AuditService，写入其业务语义事件
- 整个系统统一的审计格式，所有功能写入同一格式，所有事件使用相同的公共字段结构，固定公共字段 + 事件专属 details的 JSON 格式，字段定义基于下表

| 字段              | 对于数据表                                         | 含义                                                                                                                                             |
| :-------------- | :-------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| 固定公共字段          |                                               |                                                                                                                                                |
| `schemaVersion` | schema_version                                | 审计格式版本，未来格式演进时使用                                                                                                                               |
| `eventId`       | event_id                                      | 审计事件唯一标识，使用 ULID                                                                                                                               |
| `occurredAt`    | occurred_at                                   | 时间戳，服务端产生时间，统一 UTC                                                                                                                             |
| `eventCode`     | event_code                                    | 发生的业务事件，如 `AUTH.LOCAL_LOGIN_FAILED`，必须来自预先定义的事件字典                                                                                              |
| 事件专属details     |                                               |                                                                                                                                                |
| `category`      | category                                      | 根据业务事件获得对应分类，必须来自预先定义的枚举，如 `auth`、`rbac`、`user`、`config`、`data`，                                                                               |
| `outcome`       | outcome                                       | 事件的结果，必须来自预先定义的枚举`SUCCESS`、`DENIED`、`FAILURE`                                                                                                  |
| `reasonCode`    | reason_code                                   | reasonCode 必须符合对应 eventCode 的允许范围拒绝或失败原因码；<br>成功事件的 reasonCode 必须为 null；<br>DENIED 或 FAILURE 事件必须提供符合事件定义的 reasonCode                          |
| `actor`         | actor_type<br>actor_user_id<br>actor_username | 操作者；匿名登录失败时可为空，定时任务使用 `SYSTEM`                                                                                                                 |
| `target`        | target_type<br>target_id                      | 被操作的对象，如用户、角色、配置或业务记录                                                                                                                          |
| `request`       | request_id<br>ip<br>user_agent                | 请求关联信息，用于排查与追踪                                                                                                                                 |
| `details`       | details                                       | details 必须是符合该事件定义的 JSON 对象；仅当事件定义明确允许空对象时，才可写入 `{}`。<br>details 出现事件白名单之外的字段时，AuditService 拒绝该审计事件；<br>\|命中全局敏感字段黑名单时，AuditService 脱敏该字段，并写入不含敏感内容的运行告警。 |

- AuditService 统一生成 eventId、occurredAt，并从请求上下文补充 
	actor(type、userId、username)、request（requestId、IP、User-Agent)。业务模块传入：eventCode、outcome、reasonCode、target、details，category 不由业务模块传入，AuditService 自动完成根据 eventCode 获取 category、允许的 outcome、reasonCode、target_type 和 details 白名单；生成 eventId、occurredAt、schemaVersion；补充 actor、request；校验、脱敏并写入 audit_logs（数据库）。
- eventCode、category、outcome、reasonCode 必须来自预先定义的事件字典和枚举；审计事件字典和 details 白名单由后端代码维护，不能通过管理页面动态修改。target_type、actor_type、category、outcome 均为后端维护的有限枚举；
	reasonCode 必须符合对应 eventCode 的允许范围。
	成功事件的 reasonCode 必须为 null；
	DENIED 或 FAILURE 事件必须提供符合事件定义的 reasonCode。
	details 必须是符合该事件定义的 JSON 对象；仅当事件定义明确允许空对象时，才可写入 `{}`；
	details 出现事件白名单之外的字段时，AuditService 拒绝该审计事件；命中全局敏感字段黑名单时，AuditService 删除或脱敏该字段，并写入不含敏感内容的运行告警。
- **后续阶段设计，尚未实现：**审计日志自动删除，审计日志默认保留 30 天，保留期限可由受控系统配置（后端 env 配置）修改。到期日志由独立的审计清理任务按批次自动删除，应用运行账户仅拥有 `audit_logs` 的 `SELECT`、`INSERT` 权限；审计清理任务使用独立的运维/维护数据库账户，仅在 `audit_logs` 上额外拥有受控的 `DELETE` 权限。清理任务每次执行后，写入 `AUDIT.LOGS_PURGED` 审计事件，记录保留期限、清理时间范围、删除数量与执行结果。
- 审计记录不可由普通业务接口修改或删除；不记录密码、Token、验证码、钉钉授权码、完整身份敏感信息；审计记录是追加式数据，业务接口不提供修改或删除能力；应用运行账户：audit_logs 的 SELECT、INSERT，审计清理任务账户：audit_logs 的 SELECT、INSERT、DELETE高风险状态变更应与成功审计记录在同一数据库事务中提交。
- 审计内容最终写入数据库
## 数据与接口设计
### 数据表
```SQL
CREATE TABLE audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

  -- 审计事件标识与格式版本
  event_id CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  schema_version TINYINT UNSIGNED NOT NULL DEFAULT 1,
  occurred_at DATETIME(3) NOT NULL COMMENT 'AuditService 以 UTC 写入',

  -- 事件定义
  event_code VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  category VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  outcome VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reason_code VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NULL,

  -- 操作者快照：不设 users 外键，保留历史事实
  actor_type VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  actor_user_id INT NULL COMMENT '事件发生时的内部用户 ID',
  actor_username VARCHAR(100) NULL COMMENT '事件发生时的用户名快照',

  -- 目标对象：不设业务表外键，保证目标删除后仍可追溯
  target_type VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
  target_id VARCHAR(128) NULL,

  -- 请求信息：系统任务或异步任务可为空
  request_id VARCHAR(64) NULL,
  ip VARCHAR(45) NULL,
  user_agent TEXT NULL,

  -- 经事件白名单校验和敏感字段过滤后的内容
  details JSON NOT NULL,

  CONSTRAINT uq_audit_logs_event_id UNIQUE (event_id),

  INDEX idx_audit_occurred_at (occurred_at),
  INDEX idx_audit_event_time (event_code, occurred_at),
  INDEX idx_audit_actor_time (actor_user_id, occurred_at),
  INDEX idx_audit_target_time (target_type, target_id, occurred_at),
  INDEX idx_audit_request_id (request_id),
  INDEX idx_audit_category_outcome_time (category, outcome, occurred_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
```

- 审计模块产生的固定格式
```JSON
{
  "schemaVersion": 1,
  "eventId": "01K8ABCDEF...",
  "occurredAt": "2026-10-23T09:30:00.000Z",
  "eventCode": "RBAC.USER_ROLE_REASSIGNED",
  "category": "rbac",
  "outcome": "SUCCESS",
  "reasonCode": null,
  "actor": {
    "type": "USER",
    "userId": 1,
    "username": "dd_01K7..."
  },
  "target": {
    "type": "USER",
    "id": "101"
  },
  "request": {
    "requestId": "req_01K...",
    "ip": "203.0.113.10",
    "userAgent": "Mozilla/5.0"
  },
  "details": {
    "before": {
      "roleCodes": ["user"]
    },
    "after": {
      "roleCodes": ["reviewer"]
    }
  }
}
```
### 接口
#### 后端内部调用接口
  - `AuditService.record(auditContext, command, { transaction })` 是后端内部 Service 契约，不暴露为 HTTP API。
  - 业务模块只能调用 `AuditService`，不得直接写入 `audit_logs`。
  - 对于高风险成功操作，业务状态变更与 `AuditService.record()` 必须传入同一数据库事务。
#### HTTP API 契约

OpenAPI 3.1 契约位于：

- [`backend/openapi/openapi.yaml`](../../backend/openapi/openapi.yaml)
- [`backend/openapi/paths/audit.yaml`](../../backend/openapi/paths/audit.yaml)
- [`backend/openapi/schemas/audit.yaml`](../../backend/openapi/schemas/audit.yaml)

| 接口                                 | 权限             | 用途                                         |
| ---------------------------------- | -------------- | ------------------------------------------ |
| `GET /api/audit-logs`              | `audit:read`   | 分页查询审计记录；默认 `occurredAt DESC`。             |
| `POST /api/audit-logs/export`      | `audit:export` | 按筛选条件同步导出 CSV；成功后写入 `AUDIT.LOGS_EXPORTED`。 |
| `GET /api/audit-event-definitions` | `audit:read`   | 返回查询页面使用的业务事件码、分类和概述。                      |

- `eventCode` 为业务事件码精确匹配；`actorUsername` 为不区分大小写的包含匹配。
- 列表接口使用 `page`、`limit` 分页，并返回 `{ items, total, page, limit }`。
- 导出超过服务端最大记录数时返回 `AUDIT_EXPORT_LIMIT_EXCEEDED`，不得静默截断。
- 最大导出量由后端环境变量 `AUDIT_EXPORT_MAX_ROWS` 配置；未配置或配置无效时默认 `10000` 条。
- 事件定义接口只读；事件字典、结果枚举、原因码和 details 白名单只由后端代码维护。
## 权限与安全
- 审计查询 audit:read 、导出 audit:export 使用独立权限 
- 导出行为本身应写审计日志。
## 审计与运行日志
- 本期仅记录 `AUDIT.LOGS_EXPORTED`：分类为 `audit`，概述为“导出审计记录”，target 必须为 `null`。
- 请求格式或筛选参数校验失败时，API 直接返回 `400 AUDIT_QUERY_INVALID`；该请求未进入导出业务，不写入 `AUDIT.LOGS_EXPORTED` 审计事件。
- 导出成功时写入 `SUCCESS`；超过导出上限或生成失败时写入 `FAILURE`。成功审计记录必须在 HTTP 响应提交前写入。
- 事件码、结果、原因码、target 规则及 `details` 白名单以 [`eventDefinitions.js`](../../backend/src/audit/eventDefinitions.js) 为唯一约束来源；不得记录 CSV 内容、Token、密码、验证码、授权码、异常堆栈等敏感内容。
- 首期导出 UTF-8 CSV，包含审计记录的公共字段和 `details`；使用当前筛选条件，超出上限不生成部分文件。
- 审计查询不额外写审计记录；自动清理及 `AUDIT.LOGS_PURGED` 留待后续阶段。
# 3. 验收标准与测试
- 无 `audit:read` 权限的调用方访问查询或事件定义接口时返回 403。
- 无 `audit:export` 权限的调用方访问导出接口时返回 403。
- 请求格式或筛选参数无效时返回 `400 AUDIT_QUERY_INVALID`，且不写入导出业务审计事件。
- 查询结果默认按 `occurredAt DESC` 排序，并正确支持时间、事件码和操作人筛选。
- 审计记录 API 返回的字段符合 OpenAPI 契约，且不暴露敏感字段。
- 成功导出生成 UTF-8 CSV；超过最大记录数时不产生部分文件并返回 `AUDIT_EXPORT_LIMIT_EXCEEDED`。
- 成功导出后、HTTP 响应提交前写入符合本文件 `details` 白名单的 `AUDIT.LOGS_EXPORTED` 审计记录。
- 导出失败时写入 `FAILURE` 记录，且 `reasonCode`、`exportedRowCount` 符合事件定义。
- `AUDIT.LOGS_EXPORTED` 的 target 为 `null`；不得使用虚构目标对象代替。

