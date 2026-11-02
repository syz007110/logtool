承接网关：输入 `MessageInput`，输出带 `MessageOutput` 的结构化结果
会话治理：容器 → 实例 → 消息 三层持久化
```
三层架构：会话容器 #conversation_containers -> 会话实例 #conversation_instances -> 消息 #conversation_messages 
```
建任务
入队
与 Agent 编排解耦：Turn 层管「会话边界与落库」，Worker 管「Orchestrator LLM + Tool Gateway」单轮 Runtime

## 会话治理

### #conversation_container ：会话容器表
	- 会话容器表管理平台下的所有会话实例，包括了该会话容器的所有实例
	- 归属元数据通过`channel_type`/`user_id`/`conversation_id` 确定消息属于哪个会话容器拼接规即`container_key = {channel_type}:{user_id}:{conversation_id}`
	- 其中`channel_type、user_id、conversation_id`都是 #MessageInput 中存在的字段，
	- `metadata`字段暂时无需写入任何内容
```sql
-- 1) 会话容器：平台/用户/原始conversation归属
CREATE TABLE IF NOT EXISTS conversation_containers (
  id BIGSERIAL PRIMARY KEY,
  channel_type VARCHAR(32) NOT NULL,
  user_id VARCHAR(128) NOT NULL,
  conversation_id VARCHAR(128) NOT NULL,
  container_key VARCHAR(300) NOT NULL UNIQUE,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uk_conversation_container_triplet UNIQUE (channel_type, user_id, conversation_id)
)
```

### #conversation_instance ：会话实例表
通过`container_id`关联了会话容器 #conversation_container 的`id`
	`instance_no`自增，
	`status` 会话状态，每个会话容器中只能有一个激活的会话实例，依靠逻辑和数据表来保证，新建实例的逻辑判断都在用户新消息进入到会话实例时，用来表示当前会话实列是否是激活状态，每一个会话容器下只能有一个激活的会话实例；
	 - 会话实例有失效机制，
		 - 当`token_count`超过阈值时则该会话实列失效，新建会话实例；
		 - 当`turn_count`超过阈值时则该会话实列失效；
		 - 当会话实例空闲时间超过阈值，可配置默认30分钟，则失效；
		 - 用户发送 `/new` 时强制新建会话实例
	 - `turn_count` 统计当前会话实列进行了多少轮对话，每一次用户提问到LLM模型返回答案算一轮，轮次计算在用户提问题时累加，其中工具调用的轮次不记录到总轮次中；
	 - `token_count` 统计当前会话实例消耗了多少token，通过模型的返回的total_token来累计计算并更新`token_count`,`instance.token_count` 增量 = `loop` 内所有 `LLM` `usage` 之和（不含工具 `Handler` 内部 `LLM`，若有单独计），
	 `version` 每次更新会话实例中对应行的数据就会自增
```sql
-- 2) 会话实例：容器下具体会话轮次
CREATE TABLE IF NOT EXISTS conversation_instances (
  id BIGSERIAL PRIMARY KEY,
  container_id BIGINT NOT NULL REFERENCES conversation_containers(id) ON DELETE CASCADE,
  instance_no INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  turn_count INTEGER NOT NULL DEFAULT 0,
  token_count INTEGER NOT NULL DEFAULT 0,
  version BIGINT NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ NULL,
  archived_at TIMESTAMPTZ NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
)
```

对于会话实例有失效机制说明，若用户通过前端选择了一个历史会话，仍旧需要遵循失效机制，当满足失效机制时，不再提供输入框并使用对应提示信息告知用户该实例不能继续对话，建议用户新建会话；
	历史会话始终允许查看。
	历史实例是否允许继续对话，要受失效机制约束
	一旦实例已失效，前端不再展示输入框
	同时明确提示失效原因，如：
		该会话已达到轮次上限，不能继续对话，请新建会话。
		该会话已达到 token 上限，不能继续对话，请新建会话。
		该会话已失效，请新建会话继续

### #conversation_message ：会话消息表，
用来管理会话实例下的会话消息
	 通过`instance_id`关联会话实例`conversation_instances`表中的`id`
	 `message_id` - 
		 用户消息`（role=user）：message_id = externalMessageId（无后缀）`
		 内部事件：`message_id = {externalMessageId}:{event_suffix}`
	 `request_id` #MessageInput 中的`requestId` 字段
	 `trace_id` #MessageInput 中的`traceId` 字段
	 `task_id`  与异步任务有关，暂时并不填写
	`role`用来记录消息的来源仅允许填写user,assistant,system,tool
		- `user` 用户的消息
		- `assistant` LLM 返回的内容，包括编排决策（orchestrator）、最终 `text` 回复
		- `tool`工具返回的结果
		- `system` 系统提示，返回的异常
	`message_type` 与#MessageInput 中的`message:type` 不是一个概念，记录的不仅仅包含了用户的消息，还有agent内部运行时产生的消息，分为以下几个类型
		`text`|纯文本（用户提问 / 助手最终回复）|`user`, `assistant`|
		`attachment`|带附件（可有或无文本）|`user`, `assistant`|
		`orchestrator`|Orchestrator LLM 结构化输出（`turnResult`：kind / toolCalls / content）|`assistant`|
		`tool`|工具执行结果|`tool`|
		`error`|系统/流水线异常|`system`|
	`content` 用户/助手可见的自然语言；内部事件可为空，详情见 `payload`，存的是用户的文本消息、LLM返回中用户可读的内容
	`payload` 结构化业务数据（JSONB），按消息类型存不同内容
	`raw_payload` 渠道原始报文，仅用户消息会写：来自 `AgentRequest.rawPayload`（如钉钉 webhook 原始 payload），其他类型目前为空对象 `{}`
	`attachments` 附件列表（JSONB 数组）
		  - **`assetId`** — 资产主键，使用标准 UUID
		  - `type`: image | file | audio 附件的类型
		  - **`storage`** — `oss | local` 区分存储的是oss还是本地存储
		  - **`objectKey`** — OSS key 或本地相对路径，OSS 时：对象 key，local 时：相对存储路径
		  - **`bucket`** — OSS bucket
		  - `originalName` 上传的原始文件名称
		  - `storedName` 实际存储的文件名，系统生成
		  - **`mimeType`** — 具体文件实际识别出来的 MIME 类型。
		  - `sizeBytes` 文件大小
		  - `sha256`  文件hash
		  - `uploaderId` 上传人，应用内agent就是用应用内id，其他平台钉钉 `senderStaffId` 映射
		  - `source` 用来区分是从哪个平台上传的文件 web|dingtalk
		  - `previewUrl` 预览用 URL，给前端 <img> 或图片查看器用。但注意：它不一定是永久真相很可能是根据 object_key 动态生成的代理地址或签名 URL
		  - `url`  url 是访问地址，但不是“实际存储真相”
		  - `width` 图片的像素宽，图片附件可填实际值，非图片为null
		  - `height` 图片的像素高，图片附件可填实际值，非图片为null
		  - `status` 图片上传状态：`available、deleted、expired、failed`
	`idempotency_key` 锚点 = `MessageInput.message.externalMessageId`
	用户`MessageInput`消息的幂等键`idempotency_key ={channel_type}:{user_id}:{conversation_id}:{externalMessageId}`
	agent内部消息的幂等键 `idempotency_key ={channel_type}:{user_id}:{conversation_id}:{externalMessageId}:{事件后缀}`

``` sql
-- 3) 会话消息事件：实例内消息流（附件预留）
CREATE TABLE IF NOT EXISTS conversation_messages (
  id BIGSERIAL PRIMARY KEY,
  instance_id BIGINT NOT NULL REFERENCES conversation_instances(id) ON DELETE CASCADE,
  message_id VARCHAR(128) NOT NULL,
  request_id VARCHAR(128) NULL,
  trace_id VARCHAR(128) NULL,
  task_id VARCHAR(128) NULL,
  role VARCHAR(16) NOT NULL,
  message_type VARCHAR(32) NOT NULL DEFAULT 'text',
  content TEXT NULL,
  payload JSONB NULL,
  raw_payload JSONB NULL,
  attachments JSONB NULL,
  idempotency_key VARCHAR(300) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_conversation_messages_role CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  CONSTRAINT uk_conversation_message UNIQUE (instance_id, message_id)
);
```

触发了 #MessageInput 请求后，确定该消息的会话实列，`messageInput` 消息带有平台类型`type`，`user.id`，会话`id conversation_id`,通过这三个字段可以确定唯一的会话容器，唯一的会话容器可以匹配当当前激活状态的会话实列；

对于消息的处理，幂等与并发：
	消息的幂等键：锚点 = `MessageInput.message.externalMessageId`
	用户`MessageInput`消息的幂等键`idempotency_key ={channel_type}:{user_id}:{conversation_id}:{externalMessageId}`
	agent内部消息的幂等键 `idempotency_key ={channel_type}:{user_id}:{conversation_id}:{externalMessageId}:{事件后缀}`
    队列按 conversation_instances.id 分区串行消费（实例内串行，实例间并行）
    队列是使用redis，专用的会话队队

## 建任务
一个用户消息就会产生一个任务，内部的事件会产生消息但不会生产任务，只要本轮产生了可交付 MessageOutput，那么任务就认为是完成了，任务完成不代表业务完成，这是两个概念

``` SQL
CREATE TABLE IF NOT EXISTS agent_task (
  id BIGSERIAL PRIMARY KEY,
  task_id VARCHAR(80) NOT NULL UNIQUE,
  canonical_id CHAR(64) NOT NULL UNIQUE,
  source_idempotency_key TEXT NOT NULL,

  status VARCHAR(24) NOT NULL,
  trace_id VARCHAR(120) NOT NULL,
  request_id VARCHAR(120) NOT NULL,
  channel_type VARCHAR(24) NOT NULL,
  conversation_id VARCHAR(120) NOT NULL,
  instance_id BIGINT NULL,
  queue_job_id VARCHAR(300) NULL,
  thread_id VARCHAR(120) NULL,
  user_id VARCHAR(120) NOT NULL,

  request_snapshot JSONB NULL,
  response_snapshot JSONB NULL,
  error_snapshot JSONB NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CHECK (status IN ('queued', 'running', 'waiting_user', 'retry_wait', 'completed', 'failed', 'cancelled', 'degraded'))
);
```
`task_id`：用户/系统查询任务用的 ID，task_{canonical_id 前 16位}
`canonical_id`：由幂等键 hash 得到，用来保证同一请求不重复建任务，`sha256(source_idempotency_key)`
`source_idempotency_key`原始幂等键，就是用户消息幂等键 （内部事件不会产生任务）
`status` 任务状态，状态定义为` 'queued', 'running', 'waiting_user', 'retry_wait', 'completed', 'failed', 'cancelled', 'degraded'`只要本轮产生了可交付 MessageOutput，就标记 completed
`queue_job_id` 是 Redis/Bull 队列里的 Job ID，为了实现实例内串行规定，`queue_job_id = {instance_id}:{task_id}`在turn创建任务时确定，入队时给到redis
追踪`MessageInput`的`trace_id`、`request_id`
归属`MessageInput`的`channel_type`、`conversation_id`、`user_id`
会话实例的id：`instance_id`
快照：`request_snapshot`、`response_snapshot`、`error_snapshot`
`request_snapshot` 记录任务创建时的快照，这次任务是由什么请求触发的，通常时`MessageInput`
```JSON
{
  "traceId": "trace-xxx",
  "requestId": "req-xxx",
  "channel": {
    "type": "web",
    "conversationId": "conv-1"
  },
  "user": {
    "id": "u1"
  },
  "message": {
    "externalMessageId": "msg-1",
    "type": "text",
    "sentAt": 1710000000000
  }
}
```
`response_snapshot` 记录任务完成时的快照，这次任务完成时返回的结果，通常时`Messageoutput`
```JSON
{
  "text": "故障码 0X010A 表示……",
  "attachments": [],
  "mode": "sync"
}
```
`error_snapshot` 记录任务失败时的错误摘要
```JSON
{
  "message": "orchestrator LLM failed: timeout",
  "code": "ORCHESTRATOR_LLM_FAILED",
  "stage": "orchestrator",
  "at": "2026-06-22T09:00:00.000Z"
}
```

用来记录任务流转状态的数据表

```SQL
CREATE TABLE IF NOT EXISTS agent_event (
  id BIGSERIAL PRIMARY KEY,
  event_id VARCHAR(90) NOT NULL UNIQUE,
  task_id VARCHAR(80) NOT NULL REFERENCES agent_task(task_id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL,
  from_status VARCHAR(24) NULL,
  to_status VARCHAR(24) NULL,
  reason VARCHAR(120) NULL,
  trace_id VARCHAR(120) NULL,
  request_id VARCHAR(120) NULL,
  payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_status IS NULL OR from_status IN ('queued', 'running', 'waiting_user', 'retry_wait', 'completed', 'failed', 'cancelled', 'degraded')),
  CHECK (to_status IS NULL OR to_status IN ('queued', 'running', 'waiting_user', 'retry_wait', 'completed', 'failed', 'cancelled', 'degraded'))
);
```

`event_id` event_id = `event_id = evt_{timestamp}_{random}`，每条事件插入时生成，唯一流水 ID
`task_id` 关联 `agent_task.task_id`
`event_type` `event_type`分为以下这些，定义发送了什么
	|`TASK_ACCEPTED`|Turn 建任务成功|
	|`TASK_ENQUEUED`|Redis 入队成功|
	|`TASK_STARTED`|Worker 开始执行|
	|`TASK_COMPLETED`|Worker 产生 MessageOutput|
	|`TASK_FAILED`|Worker 执行异常|
`from_status` 任务状态，跳转前的任务状态
`to_status` 任务状态，跳转到某任务状态
`reason` 定义以下这些，定义了状态切换的触发场景
	|`task_created`|Turn 建 `agent_task` 成功|
	|`queue_enqueued`|Redis 入队成功|
	|`worker_started`|Worker 开始执行|
	|`worker_completed`|Worker 成功产出 MessageOutput|
	|`worker_failed`|Worker 执行失败|
	|`sync_timeout`|同步等待超时，转 async 继续跑|
`trace_id` 追踪`MessageInput`的`trace_id`
`request_id` 追踪`MessageInput`的`request_id`
`payload`



```
网关层
  ↓ MessageInput
Turn 交付层（同步）
  1) ensureContainer + resolveActiveInstance
  2) createTask（agent_task / agent_event）
  3) 写用户消息 conversation_messages（含幂等、turn_count）
  4) enqueue Redis
  5) 返回 completed 或 accepted（含 taskId/mode）
     ↓
Worker（异步）
  - prepare：loadHistory + buildContextEnvelope
  - Runtime：Orchestrator LLM（Chat Completions + tool_calls）→ Tool Gateway（可选）
  - persist：orchestrator / tool / assistant
     ↓
MessageOutput
网关层回推
```


## 治理机制
和其他功能中的零时文件使用一样的清理机制
历史会话查询也需要有时间范围的限制，通过配置参数设置近15天
- 历史会话查询时间范围限制
	用于前端“历史查看”接口，只返回近 N 天的数据
	例如：配置参数设置 AGENT_HISTORY_VISIBLE_DAYS=15
- 会话实例物理保留期
	用于后台清理任务，超过 N 天的实例做删除。
	例如：AGENT_CONVERSATION_RETENTION_DAYS=15
	conversation_instances
	该实例下的 conversation_messages
	消息关联的附件资产

- 清理任务
	与临时附件使用一套清理机制
	先找过期实例，再删消息，再回收未被引用的附件，最后删实例
	运行互斥，避免多实例并发重复删
	分批删除，避免长事务：
	记录审计日志和清理统计
	支持 dry-run 或至少输出清理数量
	
