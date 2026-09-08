# AGENTS

This repository uses role-based agents to constrain implementation quality, change scope, and delivery risk.

## 1) 项目概况与技术栈

定位权威说明见 `docs/product-positioning.md`。实现时以该文档的变更过滤器为准：领域能力优先，控制面（用户/角色/CMS/反馈等）不作为建设重点。

### 项目概况

- `logtool` 是面向腹腔镜手术机器人的**设备工程分析能力平台**，不是大而全的后台管理系统。
- 产品能力（按优先级）：
  - **日志分析**：上传、解析/重解析、检索、批量分析、统计可视化、导出。
  - **手术分析**：手术统计、按设备/时间分析、可视化与导出；按设备系列走独立策略。
  - **故障诊断**（近期）：在故障码、设备上下文、日志证据上给出有依据的工程判断；现有故障码/案例/知识库是证据源，不是 CMS 产品。
  - **寿命预测**（未来）：独立领域模块，成熟后再进入能力目录。
- 对外结构：
  - **MCP**：领域工具的对外合同；与内部 Agent tool registry 同源，不暴露控制面 CRUD。
  - **Agent**：保留现有单一编排壳（`taskGateway` / turnLoop），不推进多 Agent 平台。路径：意图 → 规划 → 工具执行 → **将 ToolResult 写入消息后**再构建上下文并规划，直至 `reply_direct` 再持久化助手消息。
  - **入口**：企业钉钉（`dingtalk_stream` → Agent 网关，经 `sessionWebhook` 回推）是便捷对话入口；Web 是深度分析工作台；MCP 给外部 Agent/IDE/自动化。
- 支撑面（维持可用，冻结扩张）：鉴权与权限、设备/系列主数据、故障码词典、任务队列、审计；用户/角色/反馈/知识库维护/配置页只在领域能力被堵住时改。
- 执行模式：默认同步，超时自动异步化（保持现状）。

### 技术栈

- 前端：
  - `Vue 3`、`Vue Router`、`Vuex`、`Element Plus`、`Vant`、`axios`、`vue-i18n`、`ECharts`。
- 后端：
  - `Node.js`、`Express`、`Sequelize`、`Mongoose`、`Redis`、`Bull`、`ws`。
  - 钉钉接入：`dingtalk-stream` 长连接（`dingtalk_stream` 适配器），经 `sessionWebhook` 回推回复；无 HTTP Webhook 入口。
- 数据与存储：
  - MySQL 业务数据、ClickHouse 日志数据冷热分离、MongoDB 故障案例+智能查询历史记录、Redis，并包含 PostgreSQL（手术统计相关）与 Elasticsearch（故障码检索相关）能力接入。

## 2) 前端实现约束

### Token 优先策略

- 样式实现必须优先使用设计 Token，避免在页面或组件中硬编码颜色、间距、圆角、阴影。
- Token 权威文件：
  - `frontend/src/assets/styles/design-tokens.css`
  - `frontend/src/assets/styles/mobile-design-tokens.css`
  - `frontend/src/assets/styles/element-plus-theme.css`
- 设计系统参考：
  - `frontend/src/assets/styles/DESIGN-SYSTEM.md`
- 弹窗布局：由 `design-tokens.css` 中 `.el-dialog` / `--dialog-*` Token 统一约束（高度随内容，仅封顶；新弹窗优先 `BaseDialog` 或 `align-center`）

### 样式边界约束

- `frontend/src/components/base/**` 下的 Base 组件应保持轻样式，优先通过主题映射生效。
- 新页面样式应复用现有语义化 Token 组合，不新增页面私有 Token 命名。
- 移动端视觉覆盖必须遵循 `mobile-design-tokens.css` 既有平台作用域规则。

## 3) 后端实现约束

- 分层规则：默认依赖方向 `route -> controller -> service/tool -> model`，禁止跨层耦合和在 controller 堆叠复杂业务。
- 鉴权规则：所有 `/api/**` 默认必须 `auth`，并配置权限校验；例外必须在代码中注明原因。
- 队列规则：队列接口分权为 `queue:read`（状态查询）和 `queue:manage`（清理/暂停/恢复）。
- 认证规则：默认使用 `Authorization: Bearer`；`query token` 仅允许白名单资源型 GET 接口。
- 安全规则：禁止在日志输出敏感凭证（Authorization、JWT、secret、token）；外部回调必须做来源校验。
- 数据规则：MySQL/ClickHouse/MongoDB/Redis/PostgreSQL/Elasticsearch 职责分离，索引与缓存不作为唯一业务真相。
- 可靠性规则：异步任务必须有重试策略与幂等方案，失败状态可追踪。
- 可观测性规则：关键链路必须透传 `traceId/requestId`，日志可用于审计和故障定位。

## 4) 当前需要做的任务



## 5) 工作原则
- 实现前复核方案是否足够简单、边界是否清晰（领域能力 vs 控制面；入口 vs 能力契约）。
- 新能力默认先落到 Agent/MCP 工具目录，再考虑页面；只做后台 CRUD、不能被工具调用的功能视为未完成。
- 尽量避免「吞掉异常」的兜底；错误应可观测、可定位，再用明确分支处理。
- 能用系统自带或项目已有能力解决，就不要额外引入新工具，开发环境是windows系统，可以根据实际情况优先 PowerShell 或 Python。
