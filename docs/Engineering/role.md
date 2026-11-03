---
title: 角色与权限管理（RBAC）
status: draft
created: 2026-11-03
updated: 2026-11-03
related:
  - audit.md
  - api-conventions.md
---

# 1. 需求

## 目标与范围

- 角色是用来管理功能权限的，建立的是“用户—角色—权限”这样的模型
- 系统默认初始化有两个系统角色，分别为超级管理员和普通用户，这两种角色由初始化数据库来完成，
	超级管理员，中文：超级管理员，英文：super_admin
	普通用户，中文：普通用户，英文：User
- 系统角色的要求
	系统角色无法删除，系统角色的属性无法被修改；角色属性包括角色代码、中英文显示名称、系统/超级管理员标记、角色作用范围等；权限集合不属于角色属性；
	每个用户至少有一个有效角色；
	超级管理员天生拥有所有的权限，不需要额外的管理；
	超级管理员可以创建自定义角色；
	超级管理员可以修改任意非超级管理员角色（包括普通用户角色和自定义角色）的权限，
	超级管理员可以删除自定义角色
	任何用户可以查看自己的角色，
		可以查看自己拥有什么权限，缺少什么权限，没有什么权限，但不能修改角色信息、权限；

## 非目标与后续阶段

- 目前不区分角色的作用范围，作用范围就是本系统；
- 数据作用域（`scopeType`、`scopeId`）仅保留系统角色不可修改的约束，实际数据范围授权规则不在本期实现。
- 本期不涉及登录、钉钉账户绑定、用户注册或密码策略，相关需求由账户与认证设计负责；本期不修改前端交互。

## 前端 UI 与交互

- 已经限定了只有超级管理员才能查看用户的角色，那么是不是可以区分超级管理员登入后的页面和其他用户登入后的页面；
- 角色权限目录、权限分组的管理页面



# 2. 技术方案

## 业务规则与实施范围

- 建立“用户—角色—权限”的 RBAC 模型：用户与角色为多对多，角色与权限为多对多；启用用户必须至少拥有一个有效角色，最终权限为其全部有效角色权限的并集。
- 角色初始化，通过migrate数据库版本管理控制
	1. 角色也只保留系统角色，即超级管理员和普通用户角色
	2. 部署初始化两个不可删除的系统角色：`super_admin`（超级管理员）和 `user`（普通用户）。系统角色的 `isSystem=true`；其 `code`、`isSystem`、`isSuperAdmin`、`scopeType`、`scopeId` 均不可修改，这些又是如何保证的。初始化过程由数据库 Migration 完成。
			`super_admin` 的 `isSuperAdmin=true`，后端以该标志直接判定其拥有全部现有及后续新增权限，不通过 `role_permissions` 维护且不可修改其权限。`
			`user` 的 `isSystem=true`、`isSuperAdmin=false`，角色属性不可改；其权限集合可由超级管理员维护。
	3. 初始化角色无法被删除，这个删除是由什么保证的
	4. 初始化 Migration 创建两个系统角色并为普通用户角色配置初始权限；超级管理员无需写入所有 `role_permissions` 记录。
	5. 数据库首次部署后，若不存在启用的超级管理员用户，部署期 Bootstrap 必须指定或创建首位超级管理员并绑定 `super_admin`；不得在 Migration、代码或默认配置中写入固定凭据。历史库迁移时，旧 `admin` 用户绑定 `super_admin`，其余用户绑定 `user`。
- 超级管理员可创建、查询、修改和删除自定义角色，
	超级管理员可创建自定义角色，角色名称由超级管理员设置，并以中文、英文分别维护显示文本，角色id由数据库自增
	超级管理员可以修改任意非超级管理员角色（包括普通用户和自定义角色）的权限；
	删除前必须确认没有用户仍绑定该角色。角
	超级管理员可为已存在用户分配一个或多个角色
	后续超级管理员只能由现有超级管理员向已存在用户分配 `super_admin` 角色产生。
- 任何用户可查询自身的角色与有效权限，和缺少哪些权限。
- 普通账户（自动创建、钉钉首次登录创建或由管理员创建）默认分配普通用户角色；
- 权限目录是随功能发布和数据库 Migration 维护的系统目录。角色管理仅能选择已有权限，不提供权限项的增删改查；前端以树形展示，权限分组模型也由数据库维护。
- 权限控制同时覆盖后端强制授权和前端的可见性、可用性控制；前端只改善体验，后端授权结果是唯一安全边界。无权限的功能不应展示，也不得通过直接调用接口使用。
- 系统始终必须至少存在一名“启用且拥有有效超级管理员角色”的用户。停用、删除用户，或撤销其 `super_admin` 角色将造成该条件不满足时，必须拒绝操作。

## 数据与接口设计

### 数据模型与 Migration

```sql
CREATE TABLE permission_groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  group_key VARCHAR(64) NOT NULL UNIQUE,
  name_zh VARCHAR(100) NOT NULL,
  name_en VARCHAR(100) NOT NULL,
  i18n_key VARCHAR(150) NOT NULL,
  sort_order INT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
);

CREATE TABLE roles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  name_zh VARCHAR(100) NOT NULL,
  name_en VARCHAR(100) NOT NULL,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  is_super_admin TINYINT(1) NOT NULL DEFAULT 0,
  scope_type VARCHAR(32) NOT NULL DEFAULT 'platform',
  scope_id INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT uk_roles_code UNIQUE (code)
);

CREATE TABLE permissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100) NOT NULL,
  name_zh VARCHAR(100) NOT NULL,
  name_en VARCHAR(100) NOT NULL,
  description VARCHAR(255) NULL,
  group_key VARCHAR(64) NOT NULL,
  sort_order INT NOT NULL DEFAULT 100,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  CONSTRAINT uk_permissions_code UNIQUE (code)
);

CREATE TABLE user_roles (
  user_id INT NOT NULL,
  role_id INT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (user_id, role_id),
  KEY idx_user_roles_role_id (role_id),
  CONSTRAINT fk_user_roles_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_roles_role
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT
);

CREATE TABLE role_permissions (
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_role_permissions_role
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permissions_permission
    FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE rbac_invariant_lock (
  id TINYINT PRIMARY KEY,
  CHECK (id = 1)
) ENGINE=InnoDB;

INSERT INTO rbac_invariant_lock (id) VALUES (1);

INSERT INTO roles
  (code, name_zh, name_en, is_system, is_super_admin, scope_type, scope_id, created_at, updated_at)
VALUES
  ('super_admin', '超级管理员', 'Super Administrator', 1, 1, 'platform', 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
  ('user', '普通用户', 'User', 1, 0, 'platform', 0, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3));
```

- `roles` 中以稳定的程序代码保存角色标识，初始记录为 `super_admin` 和 `user`。展示名不得作为授权判断依据。
- `permissions.code` 采用稳定、面向功能的权限码（例如 `role:read`、`role:manage`、`user:role:assign`），由后端代码和 Migration 共同维护；新增功能需同步增加权限目录记录、后端校验和前端可见性规则。
- “启用用户至少一个有效角色”及“至少一个有效超级管理员”是跨表业务不变量。服务层必须在同一数据库事务内锁定并校验受影响的用户/角色关联后再写入；数据库唯一约束负责避免重复关联，但不能替代这些业务校验。
- 删除角色使用前，必须在事务内检查 `user_roles` 是否存在绑定；存在关联时返回冲突，不得级联删除用户角色，不采用软删除。

### 后端 Service 契约

控制器只负责请求校验、调用 Service 和映射 HTTP 响应；RBAC 业务规则、事务边界与审计写入集中在以下 Service 中，不允许控制器或 Repository 绕过这些约束直接修改关联表。

| Service | 核心职责 | 事务与审计要求 |
| --- | --- | --- |
| `RoleService` | 查询角色、创建自定义角色、修改角色展示信息、删除未分配的自定义角色，以及更新普通用户/自定义角色的权限。 | 创建、更新、删除及权限更新在同一事务内完成，并写入对应 RBAC 审计事件。删除前锁定并检查角色关联用户数。 |
| `UserRoleService` | 查询用户角色，为用户完整替换角色集合；负责普通用户默认角色分配。 | 锁定目标用户及受影响的角色关联，校验“至少一个有效角色”和“至少一名有效超级管理员”，成功变更与审计记录原子提交。 |
| `AuthorizationService` | 计算当前用户的有效角色、是否超级管理员和有效权限；提供 `hasPermission` / `requirePermission` 给授权中间件与业务层使用。 | 只读；角色、用户状态或角色权限提交变更后必须使其缓存（如有）失效。 |
| `RoleBootstrapService`（可选） | 封装初始角色、初始权限目录和普通用户默认角色的幂等写入逻辑。 | 由数据库 Migration 调用或承载其等价逻辑；不得提供普通 HTTP 管理入口。 |

- `RoleService.create(command, auditContext)`、`RoleService.update(roleId, command, auditContext)`、`RoleService.delete(roleId, auditContext)`、`RoleService.updatePermissions(roleId, permissionCodes, auditContext)` 是内部 Service 契约，不直接暴露为 HTTP API。
- `UserRoleService.replaceUserRoles(userId, roleIds, auditContext)` 以完整角色集合替换现有分配；自动创建用户的默认普通用户分配使用 `UserRoleService.assignDefaultRole(userId, auditContext)`，避免在账户流程中直接写 `user_roles`。
- `AuthorizationService.getAuthorization(userId)` 返回角色代码、`isSuperAdmin` 和去重后的权限码；授权中间件以它为唯一授权数据来源。
- Service 接收请求上下文中的事务与审计上下文；高风险成功操作必须在同一事务中调用 `AuditService.record(...)`。Repository 仅负责数据访问、行锁和持久化，不承担权限判断或审计事件定义。

### 授权决策

```text
请求
  ├─ 无 Bearer Token、Token 无效或过期                         → 401 UNAUTHORIZED
  ├─ Token → userId → 用户不存在或 is_active = false            → 403 FORBIDDEN
  └─ 有效启用用户
       ├─ 任一有效角色 is_super_admin = true                    → ALLOW
       ├─ 所有角色的 permissionCodes 去重并集包含 requiredCode → ALLOW
       └─ 其他情况                                               → 403 FORBIDDEN
```

- `requiredCode` 由后端路由声明；前端菜单和按钮只能读取授权结果，不能作出安全决策。
- 每次请求从数据库重新计算授权结果；角色、角色权限、用户角色或用户状态变更后，下一次请求立即生效。

### HTTP API 契约

接口使用 `/api` 前缀、Bearer Token 鉴权，并在 OpenAPI 以 `security` 和 `x-required-permission` 声明权限。建议资源与权限边界如下：

| 接口                              | 所需权限               | 用途                                 |
| ------------------------------- | ------------------ | ---------------------------------- |
| `GET /api/me/authorization`     | 已认证                | 返回当前用户的角色、是否超级管理员及有效权限。            |
| `GET /api/roles`                | `role:read`        | 分页查询角色，默认按创建时间倒序。                  |
| `POST /api/roles`               | `role:manage`      | 创建自定义角色，并一次性设置权限。                  |
| `GET /api/roles/{roleId}`       | `role:read`        | 查询角色详情及已授予权限。                      |
| `PATCH /api/roles/{roleId}`     | `role:manage`      | 修改自定义角色展示信息和普通用户/自定义角色权限；受保护字段不可变。 |
| `DELETE /api/roles/{roleId}`    | `role:manage`      | 删除未被分配的自定义角色。                      |
| `PUT /api/users/{userId}/roles` | `user:role:assign` | 以完整目标角色集合重新分配用户角色。                 |
| `GET /api/permissions`          | `role:read`        | 返回只读系统权限目录，供角色编辑器使用。               |

- `POST /api/roles` 的请求包含 `code`、`nameZh`、`nameEn`、`permissionCodes`；`code` 已存在时返回 `409 ROLE_CODE_EXISTS`。创建系统角色的请求必须被拒绝。
- `PATCH /api/roles/{roleId}` 可选 `nameZh`、`nameEn`、`permissionCodes`；对超级管理员角色的权限修改返回 `422 SUPER_ADMIN_PERMISSIONS_IMMUTABLE`；试图改动任一系统角色受保护属性返回 `422 SYSTEM_ROLE_FIELDS_IMMUTABLE`。
- `DELETE /api/roles/{roleId}` 对系统角色返回 `422 SYSTEM_ROLE_DELETE_FORBIDDEN`；存在用户关联时返回 `409 ROLE_ASSIGNED_TO_USERS`。
- `PUT /api/users/{userId}/roles` 的 `roleIds` 是完整替换集合，不能为空；目标中不存在、已删除或不可分配的角色时返回 `422 INVALID_ROLE_ASSIGNMENT`。导致目标用户没有有效角色时返回 `422 USER_REQUIRES_ROLE`；导致系统失去最后一名有效超级管理员时返回 `422 LAST_SUPER_ADMIN_REQUIRED`。
- 用户停用、删除等其他模块中的操作也必须复用同一“最后一名有效超级管理员”校验，并返回一致的 `LAST_SUPER_ADMIN_REQUIRED` 错误码。
- 所有新增接口必须在 `backend/openapi/openapi.yaml` 及相应 `paths`、`schemas` 文件中定义请求、响应、权限与错误响应；响应不得暴露内部敏感数据。

## 权限与安全

### 本功能涉及的权限

```text
# 角色与权限目录
role:read          # 查询角色、角色详情、权限目录
role:manage        # 创建、修改、删除自定义角色；修改普通用户角色权限

# 用户角色分配
user:role:assign   # 完整替换指定用户的角色集合

# 用户生命周期（影响“至少一名有效超级管理员”不变量）
user:read          # 查询用户及指定用户的角色
user:create        # 创建用户；服务端自动分配 user 角色
user:update        # 修改或停用用户
user:delete        # 删除用户

# 审计记录查询
audit:read         # 查询 RBAC 审计记录
audit:export       # 导出 RBAC 审计记录
```

- 只有超级管理员具备 `role:manage` 和 `user:role:assign`；权限初始化须确保超级管理员始终通过 `is_super_admin` 获得这两项能力。普通用户或自定义角色可获得 `role:read`，但不得借此修改角色或分配角色。
- 服务端不接受客户端传入的 `isSystem`、`isSuperAdmin`、`scopeType`、`scopeId` 作为可写业务字段；系统角色创建、系统标记变更和超级管理员标记变更均由受控初始化或既定分配流程处理。
- 分配超级管理员角色、撤销超级管理员角色、停用/删除超级管理员用户和删除角色属于高风险操作，必须在一个事务内完成业务校验、状态变更及成功审计记录写入。
- 角色代码、权限代码和数据库主键均由服务端严格校验；不以角色名称、前端传入的权限摘要或客户端缓存作为授权依据。
- 自定义角色被删除前始终检查关联关系；不允许通过批量更新、管理员接口或并发请求绕过用户最少角色和最后超级管理员约束。

## 审计与运行日志

- 本文档通过下表维护必须审计的业务动作、事件码、触发时机和审计目标。事件码采用稳定的 `RBAC.*` 命名；“重新分配”包含首次分配和后续角色集合变更。

| 业务动作            | 事件码                                | 何时记录                 | 审计目标  |
| --------------- | ---------------------------------- | -------------------- | ----- |
| 创建自定义角色         | `RBAC.ROLE_CREATED`                | 创建成功                 | 角色    |
| 修改角色展示信息        | `RBAC.ROLE_UPDATED`                | 修改成功                 | 角色    |
| 删除自定义角色         | `RBAC.ROLE_DELETED`                | 删除成功                 | 角色    |
| 修改普通用户或自定义角色的权限 | `RBAC.ROLE_PERMISSIONS_UPDATED`    | 权限变更成功               | 角色    |
| 分配或重新分配用户角色     | `RBAC.USER_ROLE_REASSIGNED`        | 角色集合变更成功             | 用户    |
| 分配或重新分配超级管理员角色  | `RBAC.SUPER_ADMIN_ROLE_REASSIGNED` | 角色集合变更成功             | 用户    |
| 保护最后一名有效超级管理员   | `RBAC.LAST_SUPER_ADMIN_PROTECTED`  | 撤销、停用或删除操作被拒绝        | 用户    |
| 其他受保护操作被拒绝      | `RBAC.OPERATION_DENIED`            | 因系统角色、角色绑定或权限保护规则被拒绝 | 用户或角色 |

- 各事件的 `details` 应包含必要的变更前后角色代码或权限代码；`AuditService` 统一补充操作者、时间、IP 与请求标识，并按全局规则脱敏。不得记录密码、Token、验证码或钉钉授权信息。
- 成功的角色、角色权限和用户角色变更与审计记录在同一数据库事务中提交；因业务保护规则被拒绝时记录 `DENIED` 及明确原因码（如 `LAST_SUPER_ADMIN_REQUIRED`、`ROLE_ASSIGNED_TO_USERS`）。
- 授权拒绝应使用安全的业务错误码对外响应，同时写入可检索的运行日志及必要的 `RBAC.OPERATION_DENIED` 审计事件；日志不得泄露令牌、完整权限快照等敏感内容。

# 3. 验收标准与测试

- Migration 能在空测试数据库创建 RBAC 表、约束、初始角色和权限目录；重复执行不会产生重复的系统角色或关联。
- 单元测试覆盖：多角色权限取并集、超级管理员绕过角色权限表获得任意权限、已删除角色不参与授权、普通用户角色权限可更新、超级管理员角色权限不可更新。
- 单元测试覆盖角色创建、唯一角色代码校验、系统角色受保护字段校验、删除已分配角色拒绝，以及权限码/角色 ID 的输入校验。
- 集成测试覆盖：超级管理员创建自定义角色并同时配置权限；用户拥有多个角色后的接口授权；无权限用户访问受保护 API 返回 `403`，且前端权限数据不包含对应功能。
- 集成测试覆盖用户角色完整替换、空角色集合拒绝、最后一名有效超级管理员的角色撤销/停用/删除均被拒绝，以及并发或相邻请求下该不变量仍成立。
- 集成测试验证普通账户创建与钉钉首次登录创建路径默认分配普通用户角色；只有既有超级管理员向已存在用户分配后才产生新的超级管理员。
- 接口测试验证每个新增/变更 API 的状态码、错误码、响应结构、分页与权限声明均符合 OpenAPI；OpenAPI、实现及测试在同一变更中更新。
- 审计集成测试验证成功变更与审计记录原子提交，拒绝操作写入带原因码的审计记录，且审计包含前后值、操作者、目标和请求关联信息而不包含敏感凭据。


