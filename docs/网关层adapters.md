
## 总体
功能上是为了能收到应用内 Agent 会话、钉钉及其未来拓展的其他平台的消息，用于渠道接入，将各平台的信息都转化为结构化数据，产出标准 [[#MessageInput]]；该层级主要职责是 入站归一化、出站平台化：各平台原始消息 → `MessageInput` → 会话管理层、AgentRuntime处理 → `MessageOutput` → 各平台响应格式

第一节端仅实现两个平台的消息接入，平台接入通过不同的`Adapter`实现
- 钉钉的消息已经测试过了，钉钉的原生消息见 [[#钉钉返回的原生结构化数据]]。接入钉钉机器人时，由 `dingtalkStreamAdapter` 映射为 [[#MessageInput]]；钉钉 Stream 入站时，`traceId`、`requestId`、`conversationId`、`message.externalMessageId` 以平台传入为主（映射见 [[#dingtalkStreamAdapter（钉钉 Stream）]]），缺失时后端兜底；

- 应用内 Agent 会话（`channel.type = web`）由 LogTool 已登录用户在浏览器 Agent 对话页发起，经 `webAdapter` 映射为 [[#MessageInput]]；仅 `message.externalMessageId` 由前端生成；`traceId`、`requestId`、`conversationId` 由后端生成（详见 [[#ID 字段来源（分渠道）]]）；
```
首条消息：前端只传 externalMessageId + 消息内容 → 后端生成 traceId / requestId / conversationId
续聊：    前端传 externalMessageId + conversationId（来自上次响应）→ 后端仍新生成 traceId / requestId
重发：    同一 externalMessageId 再次请求 → 新 requestId，幂等由 message 维度保证
```
## 数据流
```
标准调用链（`adapterGatewayController`）：
	parseInbound → orchestrator.execute → renderOutbound
	
平台原始请求
  → Adapter.parseInbound()     MessageInput（入站统一）
  → Orchestrator.execute()     MessageOutput（中间统一）
  → Adapter.renderOutbound()   平台 HTTP/消息响应

校验/系统异常 → Adapter.renderError() → 平台错误响应
```
现有的两个平台Adapter
- 应用内Agent，type=web，通过`webAdapter`触发 `POST /api/agent/execute`    
- 钉钉，通过`dingtalkStreamAdapter`实现长连接订阅 `/v1.0/im/bot/messages/get``streamClient` 收到事件后调 Adapter 管线）
### 钉钉 Stream 单入口

生产环境**仅使用 Stream** 接收钉钉机器人消息，**不保留 HTTP Webhook 入站**作为兜底。

| 场景 | 行为 |
| --- | --- |
| Stream 启动成功 | 正常走 `parseInbound → orchestrator.execute → renderOutbound`；出站 POST `sessionWebhook` |
| Stream 未连接 / 断连 / 凭证缺失 | **直接失败**：记录 error 日志；不向 Webhook 降级；用户侧表现为消息无法处理或收到错误提示 |
| 单条消息处理异常 | `renderError` → POST 错误文案到 `sessionWebhook`（如「处理失败: …」） |

**与当前代码的差异**（重构前）：

- `streamClient.js` 仍旁路 Adapter，直连 `orchestrator`；`POST /api/dingtalk/bot/webhook` 路由仍存在但**目标态移除**。
- Phase 1 重构：Stream 收敛为 `dingtalk_stream` Adapter；删除 Webhook 入站路由及 `dingtalkWebhookAdapter`。

---

## MessageInput

Adapter 入站归一化后的统一结构。

> 注释约定：**必填** = 归一化后必须存在且非空；**可选** = 可省略；**条件必填** = 满足条件时必填。  
> ID 来源因渠道而异，见下表；`MessageInput` 结构统一，由 `parseInbound` 按渠道填值。

```json
{
  traceId,        // 必填，非空字符串。业务链路追踪 ID。应用内：后端生成 UUID v4[^1]（可读 header x-trace-id）；钉钉：平台/请求头，缺失时后端兜底
  requestId,      // 必填，非空字符串。一次 HTTP 请求一个 ID，与 externalMessageId 不同（消息重发）。应用内：后端生成 UUID v4[^1]；钉钉：平台/请求头，缺失时后端兜底
  user: {         // 必填，对象
    id,           // 必填，非空字符串。应用内 Agent 会话为 logtool 账户 ID（鉴权用户）；钉钉 senderStaffId 映射
    name?,        // 可选。应用内 Agent 会话为 logtool 账户名；钉钉 senderNick 映射
    platformUserId?, // 可选。应用内 Agent 会话不填；钉钉 senderId 映射
    corpId?,      // 可选。应用内 Agent 会话不填；钉钉 senderCorpId 映射
    isAdmin?      // 可选。应用内 Agent 会话根据用户角色；钉钉 isAdmin 映射
  },
  channel: {      // 必填，对象
    type,         // 必填。渠道类型：应用内 Agent 会话 web；外部 IM dingtalk|feishu|wecom；程序化 api
    conversationType, // 必填。single|group；应用内 Agent 会话默认 single；钉钉 conversationType 映射（1→single，2→group）
    conversationId,   // 必填（归一化后）。应用内：后端分配 ULID[^2]（新建入站可不传）；续聊前端传上次响应值；钉钉：conversationId 映射
    threadId?,    // 条件必填。conversationType=group 时必填；应用内 single 可不填；钉钉 openThreadId 映射
    robotCode?,   // 可选。应用内 Agent 会话不填；钉钉 robotCode 映射
    replyWebhook?,    // 可选。应用内 Agent 会话不填；钉钉 sessionWebhook 映射（会话回复 webhook，临时有效）
    replyWebhookExpiredAt? // 可选。应用内 Agent 会话不填；钉钉 sessionWebhookExpiredTime 映射（毫秒时间戳）
  },
  message: {      // 必填，对象
    externalMessageId, // 必填，非空字符串。应用内：前端 ULID[^2]；钉钉：msgId 映射
    type,         // 必填。归一化后消息类型；应用内 text / 带附件等；钉钉 msgtype 映射（含 richText）
    text?,        // 条件必填。与 attachments 不能同时为空
    contentRaw?,  // 可选。平台原生消息体（如钉钉 richText content）
    attachments: [  // 必填，数组（可为空数组）。条件必填：当 text 为空时须至少有一项
      {
        fileId?,  // 可选
        type,     // 必填。image|file|audio
        name?,    // 可选
        url?,     // 可选
        mimeType? // 可选
      }
    ],
    sentAt,       // 必填。毫秒时间戳；缺省 Date.now()
    senderPlatform? // 可选。发送端平台标识；钉钉 senderPlatform 映射
  },
  context?,       // 可选。渠道扩展上下文（如 atBot、chatbotCorpId、source）
  rawPayload?     // 可选。平台原始 payload 快照
}
```

*traceId*  
业务链路追踪 ID，必填，非空字符串，应用内agentt：后端生成 UUID v4[^1]（可读 header x-trace-id）；钉钉：平台/请求头，缺失时后端兜底
*requestId*
一次 HTTP 请求一个 ID 必填，非空字符串。一次 HTTP 请求一个 ID。应用内：后端生成 UUID v4[^1]；钉钉：平台/请求头，缺失时后端兜底



字段约束摘要：

| 字段                                  |                 | 必填  | 应用内（`web`）                                               | 钉钉（`dingtalk`）      |
| ----------------------------------- | --------------- | --- | -------------------------------------------------------- | ------------------- |
| `traceId`                           | 业务链路追踪 id       | 是   | 后端生成                                                     | 平台/请求头，缺失兜底         |
| `requestId`                         | 一次 HTTP 请求一个 id | 是   | 后端生成，一次 HTTP 请求一个 ID，与，请求可以重发但消息是同一条，相同externalMessageId | 平台/请求头，缺失兜底         |
| `message.externalMessageId`         |                 | 是   | 前端 ULID                                                  | 平台 `msgId`          |
| `channel.conversationId`            |                 | 是*  | 后端分配；新建会话时入站可不传，后续对话时会附带上后端生成的id                         | 平台 `conversationId` |
| `user` / `user.id`                  | 用户id            | 是   | 鉴权用户                                                     | `senderStaffId` 等   |
| `user.name`                         | 用户名称            | 可选  |                                                          |                     |
| user                                |                 |     |                                                          |                     |
| `channel.type` / `conversationType` |                 | 是   | 默认 `web` / `single`                                      | 平台映射                |
| `channel.threadId`                  |                 | 条件  | `group` 时必填                                              | `openThreadId`      |
| `message.text` / `attachments`      |                 | 条件  | 不能同时为空                                                   | 不能同时为空              |
| `context` / `rawPayload`            |                 | 否   | —                                                        | —                   |

\* `conversationId` 在 `parseInbound` 完成归一化后必填；应用内新建会话可在入站 HTTP body 中省略。

---

## MessageOutput

Orchestrator 返回给 Adapter 的**中间统一结构**；再由`renderOutbound` 将其转换为各平台出站格式。

```json
{
  "mode": "sync",
  "taskId": "string",
  "result": { }
}
```

| 字段       | 必填  | 说明              |
| -------- | --- | --------------- |
| `mode`   | 是   | 对话问答时为 `"sync"` |
| `taskId` | 是   | 本轮任务 ID（追踪/审计用） |
| `result` | 是   | 用户可见回复，结构见下     |

### 后续阶段：async 形态（Phase 1 不实现）

```json
{
  "mode": "async",
  "taskId": "string",
  "reason": "string（可选，如 sync_timeout_fallback_async）"
}
```

| 字段              | 说明                                          |
| --------------- | ------------------------------------------- |
| `mode: "async"` | 已受理，后台继续执行；当场无 `result`，完成后 poll 得 sync 同结构 |
| `reason`        | 说明为何未同步返回（如超时转异步）                           |

### 内层结果 `result`

```json
{
  "text": "string",
  "attachments": [
    {
      "type": "image | file | audio",
      "name": "string（可选）",
      "url": "string（可选）",
      "fileId": "string（可选）",
      "mimeType": "string（可选）"
    }
  ],
  "session": {
    "conversationId": "string"
  }
}
```

| 字段                       | 必填  | 说明                              |
| ------------------------ | --- | ------------------------------- |
| `text`                   | 条件  | 助手用户可见正文；与 `attachments` 不能同时为空 |
| de`attachments`          | 否   | 附件列表，默认 `[]`                    |
| `session`                | 条件  | 会话信息；见下表                        |
| `session.conversationId` | 条件  | 见下表                             |

**`session.conversationId` 返回规则**：

| 场景           | 是否返回                                                   |
| ------------ | ------------------------------------------------------ |
| 应用内 · 新建会话首条 | 后端分配的`conversationId`必定返回，这样下一轮会话就有固定的`conversationId` |
| 应用内 · 续聊     | 前端入站已带 `channel.conversationId`                        |
| 钉钉           | 平台入站带 `conversationId`                                 |

**Adapter 出站取用**：

| 字段                       | webAdapter          | dingtalkStreamAdapter        |
| ------------------------ | ------------------- | ---------------------------- |
| `text`                   | 放入 HTTP `response`  | POST `sessionWebhook` 用户可见正文 |
| `attachments`            |                     | markdown 链接，逐条 POST          |
| `session.conversationId` | 应用内 · 新建会话首条必定返回值中带 | 不需要                          |

> **与当前实现的差异**：代码中 `result` 仍可能携带 `history`、`intent`、`llm_raw` 等调试字段；目标态仅保留上表结构，调试信息另途返回（不在 `MessageOutput.result` 核心契约内）。

---

## Adapter 模块规范

每个渠道 Adapter 必须实现：

| 方法 | 职责 |
| --- | --- |
| `parseInbound(req)` | 平台原始请求 → `MessageInput` |
| `renderOutbound({ req, res, request, response })` | `MessageInput` + `MessageOutput` → 平台 sync 响应 |
| `renderError({ req, res, error })` | 异常 → 平台错误响应 |

### 三方法简要说明

| 方法               | 一句话           | 输入 / 输出                                 | 典型职责                                                                                                     |
| ---------------- | ------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `parseInbound`   | **读懂平台，写成标准** | HTTP/Stream 原始请求 → `MessageInput`       | 鉴权上下文合并、ID 按渠道规则生成或映射、字段校验、补默认值                                                                          |
| `renderOutbound` | **读懂结果，写回平台** | `MessageInput` + `MessageOutput` → 出站投递 | Phase 1 仅 sync：从 `result` 取 `text` / `attachments` / `session`；HTTP 写 `res`，Stream POST `sessionWebhook` |
| `renderError`    | **统一失败形态**    | 异常 → 写 `res`                            | 入站校验失败、未捕获系统异常；HTTP 状态码与 body 符合各平台约定                                                                    |

- **入站**：各平台不同 → 统一 `MessageInput`
- **出站**：统一 `MessageOutput` → 各平台不同
- **错误**：校验失败、系统异常；业务拒绝（如 `reject`）仍走 `renderOutbound`

---

## webAdapter（应用内 Agent 会话）

- **注册键**：`web`
- **路由**：`POST /api/agent/execute`（需 `auth` + `smart_search:use`）
- **实现**：`backend/src/agentization/adapters/web/webAdapter.js`

### parseInbound

**ID 规则（应用内）**：仅 `message.externalMessageId` 来自前端；`traceId`、`requestId`、`conversationId` 由后端在 `parseInbound` 中生成或补全。

| 步骤                          | 规则                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------- |
| 鉴权用户                        | 优先 `req.user`，忽略 body 中伪造的 `user`                                                       |
| `traceId`                   | **后端生成** UUID v4[^1]；若存在 header `x-trace-id` 且格式合法则优先使用；**忽略 body.traceId**             |
| `requestId`                 | **后端生成** UUID v4[^1]，每次请求一个新 ID；**忽略 body.requestId**                                   |
| `message.externalMessageId` | **前端必填**，body `message.externalMessageId`，须符合 ULID[^2]；缺省时可后端兜底生成（不推荐）                  |
| `channel.conversationId`    | **续聊**：body 传入上次 `MessageOutput.result.session.conversationId`；**新建**：可不传，后端分配 ULID[^2] |
| `channel.type`              | 应为 `web`；`conversationType` 默认 `single`                                                 |
| `context`                   | 可选，原样透传                                                                                 |

产出：`MessageInput`（归一化后四类 ID 均已齐备）。

### HTTP 契约示例（Phase 1）

以下为 `POST /api/agent/execute` 的**目标态**约定；前端、后端、联调均以此为准。Phase 1 仅 `sync`，响应恒为 HTTP 200（失败见 [[#renderError]] HTTP 400）。

**公共请求头**：

```http
POST /api/agent/execute HTTP/1.1
Authorization: Bearer <JWT>
Content-Type: application/json
x-trace-id: <可选，UUID v4；缺省由后端生成>
```

**入站 body 约定**：

| 字段 | 首条 | 续聊 | 说明 |
| --- | --- | --- | --- |
| `message.externalMessageId` | ✅ | ✅ | 前端 ULID[^2]，每条用户消息一个 |
| `message.type` / `text` / `attachments` / `sentAt` | ✅ | ✅ | 见 [[#MessageInput]] |
| `channel.type` | ✅ `web` | ✅ `web` | |
| `channel.conversationType` | ✅ 默认 `single` | ✅ | |
| `channel.conversationId` | ❌ 省略 | ✅ | 续聊传上次响应 `response.session.conversationId` |
| `traceId` / `requestId` | ❌ 不传 | ❌ 不传 | 后端生成；body 中传入**忽略** |
| `user` | ❌ 不传 | ❌ 不传 | 来自鉴权 `req.user` |
| `context` | 可选 | 可选 | 原样透传 |

#### 首条消息 — Request

新建会话，用户发送第一句话：

```json
{
  "message": {
    "externalMessageId": "01J6N8K2M3P4Q5R6S7T8V9WXY",
    "type": "text",
    "text": "你好",
    "attachments": [],
    "sentAt": 1738742400000
  },
  "channel": {
    "type": "web",
    "conversationType": "single"
  },
  "context": {
    "source": "agent_chat"
  }
}
```

#### 首条消息 — Response（HTTP 200）

```json
{
  "ok": true,
  "traceId": "a1b2c3d4-e5f6-4789-a012-3456789abcde",
  "requestId": "f6e5d4c3-b2a1-4987-6543-210fedcba098",
  "taskId": "task_01J6N8K2M3P4Q5R6S7T8V9WZ0",
  "mode": "sync",
  "response": {
    "text": "你好，有什么可以帮你？",
    "attachments": [],
    "session": {
      "conversationId": "01J6N8K2M3P4Q5R6S7T8V9WZZ"
    }
  }
}
```

前端**必须**持久化 `response.session.conversationId`，供续聊入站使用。

#### 续聊 — Request

同一会话发送第二条及之后的消息：

```json
{
  "message": {
    "externalMessageId": "01J6N8K2M3P4Q5R6S7T8W0XY",
    "type": "text",
    "text": "上一句你说了什么？",
    "attachments": [],
    "sentAt": 1738742460000
  },
  "channel": {
    "type": "web",
    "conversationType": "single",
    "conversationId": "01J6N8K2M3P4Q5R6S7T8V9WZZ"
  }
}
```

`traceId`、`requestId` 每次请求由后端重新生成，与 `externalMessageId` 无关。

#### 续聊 — Response（HTTP 200）

```json
{
  "ok": true,
  "traceId": "b2c3d4e5-f6a7-4890-b123-456789abcdef0",
  "requestId": "c3d4e5f6-a7b8-4901-c234-567890abcdef1",
  "taskId": "task_01J6N8K2M3P4Q5R6S7T8W0XZ1",
  "mode": "sync",
  "response": {
    "text": "我刚才说：你好，有什么可以帮你？",
    "attachments": []
  }
}
```

续聊响应**不包含** `session`（前端入站已带 `channel.conversationId`）。

> **与当前实现的差异**：`ExplanationTester.vue` 仍传 `message.id`、`traceId`、`requestId`、`channel.type: api` 及前端自造 `conversationId`；Phase 1 重构按本节约束对齐。

### renderOutbound

输入：`request`（原 `MessageInput`）、`response`（`MessageOutput` 信封）。Phase 1 仅处理 `mode=sync`，HTTP 200：

```json
{
  "ok": true,
  "traceId": "与 MessageInput.traceId 一致",
  "requestId": "与 MessageInput.requestId 一致",
  "taskId": "MessageOutput.taskId",
  "mode": "sync",
  "response": "MessageOutput.result（结构见上文 MessageOutput · result）"
}
```

### renderError

HTTP 400：

```json
{
  "ok": false,
  "message": "错误描述"
}
```

---

## dingtalkStreamAdapter（钉钉 Stream）

- **注册键**：`dingtalk_stream`
- **传输层**：`streamClient.js`（长连接生命周期、重连、平台 ack）；业务逻辑在本 Adapter
- **实现**：`backend/src/agentization/adapters/dingtalk/dingtalkStreamAdapter.js`（目标态；当前逻辑分散在 `streamClient.js`）
- **入站映射**：`buildAgentRequestFromDingtalk.js`（Stream 事件 payload 与 Webhook body 结构一致）

`streamClient` 收到 Stream 事件后，构造伪 inbound 上下文，调用 Adapter 管线（等价于 `parseInbound → execute → renderOutbound / renderError`），**不经 HTTP 路由**。

### parseInbound

**ID 规则（钉钉）**：`traceId`、`requestId`、`conversationId`、`message.externalMessageId` **以平台传入为主**；Adapter 做字段映射，仅在缺失时后端兜底。

将 Stream 事件 payload（及 headers）映射为 `MessageInput`：

| 来源 | MessageInput 字段 | 说明 |
| --- | --- | --- |
| `msgId` / headers `messageId` | `message.externalMessageId` | 平台消息 ID |
| headers `messageId` 等 | `traceId` | 缺失时后端 UUID v4[^1] |
| headers `messageId` 等 | `requestId` | 缺失时后端 UUID v4[^1] |
| `conversationId`（或 stream 侧合成） | `channel.conversationId` | 平台会话 ID |
| `msgtype` / `content` | `message.type`、`message.text`、`message.contentRaw`、`message.attachments` | — |
| `senderStaffId`（fallback `senderId`） | `user.id` | — |
| `senderId` | `user.platformUserId` | — |
| `senderNick` | `user.name` | — |
| `senderCorpId` | `user.corpId` | — |
| `isAdmin` | `user.isAdmin` | — |
| `conversationType` | `channel.conversationType` | `1`→`single`，`2`→`group` |
| `openThreadId` | `channel.threadId` | — |
| `robotCode` | `channel.robotCode` | — |
| `sessionWebhook` | `channel.replyWebhook` | 出站回复地址（非 HTTP Webhook 入站） |
| `sessionWebhookExpiredTime` | `channel.replyWebhookExpiredAt` | — |
| `createAt` | `message.sentAt` | — |
| `senderPlatform` | `message.senderPlatform` | — |
| 整包 payload | `rawPayload` | — |

`channel.type` 固定为 `dingtalk`。

### renderOutbound

使用 `MessageOutput.result` 中的 `text`、`attachments`；通过 `channel.replyWebhook`（即 `sessionWebhook`）POST 钉钉消息体，并对平台做 `socketCallBackResponse` ack。

无附件时 POST：

```json
{
  "msgtype": "text",
  "text": { "content": "用户可见正文" }
}
```

有附件且含 URL 时 POST markdown（附件可逐条追加 POST）。

### renderError

向 `sessionWebhook` POST 错误文案（**不降级 Webhook 入站**）：

```json
{
  "msgtype": "text",
  "text": {
    "content": "处理失败: 错误描述"
  }
}
```

若 `sessionWebhook` 缺失或 POST 失败：记录 error 日志；无法触达用户时仅可观测，不重试其他入站通道。

---

## 钉钉返回的原生结构化数据

```json
{
  "senderPlatform": "Win",
  "conversationId": "cid***9w=",
  "chatbotCorpId": "din***884",
  "chatbotUserId": "$:LWCP_v1:$...",
  "openThreadId": "cidfmZaPcjXJ3V8L+NH4DPYhUBvgXWm9UbXlJRYGdnkM9w=",
  "msgId": "msgO4eFugHeaKO988wBOP2UGg==",
  "senderNick": "宋一舟",
  "isAdmin": true,
  "senderStaffId": "153***354",
  "sessionWebhookExpiredTime": 1776513800606,
  "createAt": 1776508400451,
  "content": { "richText": [] },
  "senderCorpId": "ding45550ac620c8f320ffe93478753d9884",
  "conversationType": "1",
  "senderId": "$:L***g==",
  "sessionWebhook": "https://oapi.dingtalk.com/robot/sendBySession",
  "robotCode": "din***ycr",
  "msgtype": "richText"
}
```

归一化示例（`MessageInput` 摘要）：

```json
{
  "traceId": "21468a48_2091_19d8657adc5_10149a9",
  "user": { "id": "153508185023173354", "name": "宋一舟" },
  "channel": {
    "type": "dingtalk",
    "conversationId": "cidfmZaPcjXJ3V8L+NH4DPYhUBvgXWm9UbXlJRYGdnkM9w=",
    "robotCode": "dingavvtotqspnsbpycr"
  },
  "message": {
    "externalMessageId": "msgO4eFugHeaKO988wBOP2UGg=="
  }
}
```

---
**目标**：多轮对话稳定走通，验证 L1 网关层契约与 L2/L3 链路。

| 项             | Phase 1                     | 后续阶段               |
| ------------- | --------------------------- | ------------------ |
| 工具调用          | 不接入                         | 接入 Tools Gateway   |
| 任务模式          | **仅 `sync`**                | `async`、超时转异步、任务轮询 |
| 多轮对话          | 应用内 + 钉钉 Stream             | —                  |
| 会话 ID         | 应用内首条由后端分配 `conversationId` | —                  |
| 异步 push       | ❌                           | 任务完成后主动推送          |
| 钉钉 Webhook 入站 | ❌ 移除                        | —                  |

**Phase 1 约束对 L1 的影响**：

- Orchestrator **始终返回** `mode: "sync"` + `result`；Adapter **只实现 sync 出站**。
- 不出现 HTTP 202、「已受理」、`GET /api/agent/tasks/:taskId` 轮询等 async 路径。
- 处理超时或失败 → `renderError`，不降级 async。

---


## 与下游层关系

- `MessageInput` 交由 Orchestrator / MessageService 处理，映射为 `ConversationMessageInput` 写入 `conversation_messages`（L2 职责，不在 Adapter 内完成）。
- 本层只做消息的接收、归一化与回复渲染。

[^1]: UUID v4：128 位随机标识，形态 `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`。

[^2]: ULID：前 10 位为毫秒时间戳，后 16 位为随机部分，共 26 字符。
