
## 总体
功能上是为了能收到应用内 Agent 会话、钉钉及其未来拓展的其他平台的消息，用于渠道接入，将各平台的信息都转化为结构化数据，产出标准 [[#MessageInput]]，保证入站归一化、出站平台化；
数据流为：外部的消息通过网关层转化为统一的结构化数据，通过会话管理和Agent运行时处理后得到结构化输出 [[#MessageOutput]]，最后将结构化输出转为各平台可以响应的格式，并拥有异常处理的能力；可以总结为==各平台原始消息 → `MessageInput` → `AgentRuntime`处理 → `MessageOutput` → 各平台响应格式==
```
数据流
标准调用链（`adapterGatewayController`）：
	parseInbound → orchestrator.execute → renderOutbound
	
平台原始请求
  → Adapter.parseInbound()     MessageInput（入站统一）
  → AgentRuntime.execute()     MessageOutput（中间统一）
  → Adapter.renderOutbound()   平台 HTTP/消息响应

校验/系统异常 → Adapter.renderError() → 平台错误响应
```

首先定义两个重要的结构化数据
## MessageInput

Adapter 入站归一化后的统一结构。

> 注释约定：**必填** = 归一化后必须存在且非空；**可选** = 可省略；**条件必填** = 满足条件时必填。  
> ID 来源因渠道而异，见下表；`MessageInput` 结构统一，由 `parseInbound` 按渠道填值。

```JSON
{
  traceId,
  requestId,
  user: {
    id,
    name?,
    platformUserId?,
    corpId?,
    isAdmin?
  },
  channel: {
    type,
    conversationType,
    conversationId,
    threadId?,
    robotCode?,
    replyWebhook?,
    replyWebhookExpiredAt?
  },
  message: {
    externalMessageId,
    type,
    text?,
    contentRaw?,
    attachments: [
      {
        fileId?,
        type,
        name?,
        url?,
        mimeType?
      }
    ],
    sentAt,
    senderPlatform?
  },
  context?,
  rawPayload?
}
```

**顶层字段**
- **`traceId`** — 必填，非空字符串。业务链路追踪 `ID`。应用内 `Agent`：可选传 `x-trace-id` 请求头，格式合法则优先使用，否则后端生成 `UUID v4`[^1]；钉钉：Stream headers 映射，缺失时后端兜底
- **`requestId`** — 必填，非空字符串。一次 `HTTP` 请求一个 `ID`，与 `externalMessageId` 不同（消息重发可共用同一 `externalMessageId`）。应用内 `Agent`：后端生成 `UUID v4`[^1]，忽略任何入站传入值；钉钉：Stream headers 映射，缺失时后端兜底

**`user` 对象** — 必填
- **`user.id`** — 必填，非空字符串。应用内 Agent 会话为 logtool 账户 ID（鉴权用户）；钉钉 `senderStaffId` 映射
- **`user.name`** — 可选。应用内 `Agent` 会话为 `logtool` 账户名；钉钉 `senderNick` 映射
- **`user.platformUserId`** — 可选。应用内`Agent` 会话不填；钉钉 `senderId` 映射
- **`user.corpId`** — 可选。应用内 `Agent` 会话不填；钉钉 `senderCorpId` 映射
- **`user.isAdmin`** — 可选。应用内 `Agent` 会话根据用户角色；钉钉 `isAdmin` 映射

**`channel` 对象** — 必填
- **`channel.type`** — 必填。渠道类型：应用内 `Agent` 会话 为`web`；钉钉为`dingtalk`
- **`channel.conversationType`** — 必填。`single|group`；应用内 `Agent` 会话默认 `single`；钉钉 `conversationType` 映射（1→single，2→group）
- **`channel.conversationId`** — 必填。应用内：后端分配 `ULID`[^2]（每一个用户在应用内agent会被分配一个conversation_id）；钉钉：`conversationId` 映射
- **`channel.threadId`** — 条件必填。`conversationType=group` 时必填；应用内 `single` 可不填；钉钉 `openThreadId` 映射
- **`channel.robotCode`** — 可选。应用内 `Agent` 会话不填；钉钉 `robotCode` 映射
- **`channel.replyWebhook`** — 可选。应用内 `Agent` 会话不填；钉钉 `sessionWebhook` 映射（会话回复 webhook，临时有效）
- **`channel.replyWebhookExpiredAt`** — 可选。应用内 `Agent` 会话不填；钉钉 `sessionWebhookExpiredTime` 映射（毫秒时间戳）

**`message` 对象** — 必填
- **`message.externalMessageId`** — 必填，非空字符串。应用内：前端 `ULID`[^2]生成；钉钉：`msgId` 映射
- **`message.type`** — 必填。归一化后消息类型；应用内只区分是否带有附件 `text /text+attachment` 带附件等；钉钉 `msgtype` 映射（含 richText）
- **`message.text`** — 条件必填。与 `attachments` 不能同时为空
- **`message.contentRaw`** — 可选。平台原生消息体，应用内`text`，钉钉 `richText content`映射
- **`message.attachments`** — 必填，数组（可为空数组）。条件必填：当 `text` 为空时须至少有一项
		- **`assetId`** — 资产主键，使用标准 UUID
		- `type`: image | file | audio 附件的类型
		- **`storage`** — `oss | local` 区分存储的是oss还是本地存储
		- **`objectKey`** — `OSS key `或本地相对路径，OSS 时：对象 key，local 时：相对存储路径
		- **`bucket`** — `OSS bucket`
		- `originalName` 上传的原始文件名称
		- `storedName` 实际存储的文件名，系统生成
		- **`mimeType`** — 具体文件实际识别出来的 MIME 类型。
		- `sizeBytes` 文件大小
		- `sha256`  文件hash
		- `uploaderId` 上传人，应用内agent就是用应用内id，其他平台钉钉 `senderStaffId` 映射
		- `source` 用来区分是从哪个平台上传的文件` web|dingtalk`
		- `previewUrl` 预览用 URL，给前端 <img> 或图片查看器用。但注意：它不一定是永久真相很可能是根据 objectKey 动态生成的代理地址或签名 URL
		- `url`  url 是访问地址，但不是“实际存储真相”
		- `width` 图片的像素宽，图片附件可填实际值，非图片为null
		- `height` 图片的像素高，图片附件可填实际值，非图片为null
	    - `status` 附件状态：`available|deleted|expired|failed`
- **`message.sentAt`** — 必填。毫秒时间戳；缺省 `Date.now()`
- **`message.senderPlatform`** — 可选。发送端平台标识用户使用的设备例如`windows-win`；钉钉 `senderPlatform` 映射

**其他字段**
- **`context`** — 先留空
- **`rawPayload`** — 可选。平台原始 `payload` 快照

### **消息中带有附件的情况**
- 附件存储
	上传是多文件上传接口
	返回结构建议统一为 `attachments[]`
	落盘根据按 `STORAGE` 切 `oss/local`
	上传成功返回 `available`，失败不进入 `messageInput.attachments`，由前端保留失败态并支持重试，不要把失败的附件写入`attachments`
- 文件格式和限制
	支持附件类型：日志文件：.medbot、.txt
	压缩包：.7z、.zip
	图片：.jpeg、.jpg、.png、.webp
	后端按“文件后缀 + MIME 类型”双重校验附件合法性。
	单条消息最多上传 10 个附件。
	单个附件大小必须小于 20MB。
	单条消息附件总大小必须小于 200MB。
	对于文件夹，将文件夹解析为文件列表上传，文件列表依旧遵循按照原有的文件上传约束；
	展开后的每个文件按普通附件处理，并保留 relativePath，消息里传给后端的仍然是“附件数组”，不传抽象的 folder 对象，后端 attachment_scan 继续只处理文件附件，不需要理解“文件夹”概念，文件夹展开后的“文件数”是否计入附件上限，超出上限的文件不进入上传的附件，也不会进入草稿附件，文件夹展开最多保留 3 层
	
- 数据流
	附件采用“先上传、后发消息”的模式。
	文件上传成功后，服务端返回附件元数据，前端写入当前草稿消息的 `messageInput.attachments`。
	用户发送消息时，仅提交“已上传成功且未被移除”的附件引用。
	若附件上传失败、被取消或被用户移除，则该附件不得进入交付层。
	对于应用内的`agent`交互需要做附件优先上传临时目录，用户消息发送时才做持久化
		本地草稿附件：用户刚选中文件，尚未上传成功。
	已上传附件：已拿到 `assetId/objectKey`，可写入 `messageInput.attachments`
	已移除附件：不再属于当前消息，不进入交付层
	前端将每一个附件已卡片形式展示在输入对话框中，上传进度显示在卡片上（卡片透明`loading`中）、上传异常显示感叹号、上传完成后可以通过鼠标悬浮后的删除按钮删除
- 发送约束
	存在上传中的附件时，发送按钮不可点击
	消息文本与附件不能同时为空。

### 渠道侧消息聚合
以首个消息到达时间为起点，创建一个时间窗口，默认3s，通过配置参数设置
窗口内连续到达的消息先不立刻进入 agent，而是暂存到聚合缓冲区
窗口结束后，把这一批内容组装成一次新的内部 messageInput 再统一进入 agent；
文本消息被聚合为一个消息整体，多条消息之间换行处理；
附件整合为附件组，但还需要校验附件类型、附件数量、大小等约束；

消息的聚合键要严格- 至少按 channelType + conversationId + senderStaffId聚合。
- 避免把不同人的消息合进同一个任务
首条消息启动最大窗口；中间只要持续有消息，就等到静默一小段时间再提前 flush；超过最大窗口强制 flush，其中最大强制flush的阈值为maxWindowMs = 3000，静默阈值 silenceMs = 800
flush 条件要明确- 到达 maxWindowMs
- 达到静默阈值
- 附件数量/大小到达消息短路阈值
消息去重- 缓冲区内应按原始渠道消息 ID 去重，避免渠道重试导致重复拼接。
顺序保证- 文本和附件都按实际到达顺序记录和合并，不能只按 flush 时的数组顺序依赖内存状态。
聚合批次元数据- 聚合后生成新的 batch message id。
- 同时保留原始消息列表，例如 rawMessages[]，用于审计、排障和重放
## MessageOutput

`Agentruntime` 返回给`Adapter`的**中间统一结构**；再由`renderOutbound` 将其转换为各平台出站格式。

```json
{
  "text": "string",
  "attachments": [
    {
      "type": "image | file | audio",
      "name": "string",
      "url": "string",
      "fileId": "string",
      "mimeType": "string"
    }
  ],
  "session": {
    "conversationId": "string",
    "instanceId": "string"
  }
}
```

`text` 条件必填，与 `attachments` 不能同时为空
`attachments` 必填数组，默认 `[]`；无附件时为空数组
  - type: image | file | audio
  - **`asset_id`** — 资产主键，使用标准 UUID
  - **`storage`** — `oss | local` 区分存储的是oss还是本地存储
  - **`object_key`** — OSS key 或本地相对路径，OSS 时：对象 key，local 时：相对存储路径
  - **`bucket`** — OSS bucket
  - `original_name` 上传的原始文件名称
  - `stored_name` 实际存储的文件名，系统生成
  - **`mimeType`** — 具体文件实际识别出来的 MIME 类型。
  - `size_bytes` 文件大小
  - `sha256`  文件hash
  - `uploader_id` agent 或任务执行者
  - `source` agent / system / tool 
  - `preview_url` 预览用 URL，给前端 <img> 或图片查看器用。但注意：它不一定是永久真相很可能是根据 object_key 动态生成的代理地址或签名 URL
  - `url`  url 是访问地址，但不是“实际存储真相”
  - `width` 图片的像素宽
  - `height` 图片的像素高
  - `status` 图片上传状态：`available、deleted、expired、failed
`session.conversationId` 会话容器id
`session.instanceId` 必填，返回当前会话实例id

### 消息与会话容器
首先会话容器的归属元数据通过`channel_type`/`user_id`/`conversation_id` 确定消息属于哪个会话容器拼接规即`container_key = {channel_type}:{user_id}:{conversation_id}`
应用内的`agent`也遵循和其他平台的会话容器-实例-消息的三层数据结构，每一个用户在应用内`agent`会被分配一个`conversation_id`，创建容器时使用 `ULID`那么就可以唯一确定一个会话容器；
用户首次点击进入`agent`页面就会被分配一个`conversation_id`，因为应用内现在只有一个agent暂时不需要区分，后续通过`{channel_type}:{user_id}`可以确认唯一的会话容器，用户使用该容器会话实例都在这一个会话容器中
	新建会话需要强制新建会话实例
	删除会话删除的是会话实例
	用户查看到的历史会话，也是应用内会话容器下的所有实例
	整个agent页面显示的就是该用户应用内会话容器下的所有实例

这部分还需要码？？？？？？？？？？？？？
**`session.conversationId` 返回规则**

- **应用内 · 新建会话首条** — 后端分配的 `conversationId` 必定返回，下一轮会话沿用
- **应用内 · 续聊** — 不返回，前端入站已带 `channel.conversationId`
- **钉钉** — 不返回，平台入站已带 `conversationId`


先只实现两个平台的消息接入，平台接入通过不同的`Adapter`实现
- 钉钉的消息已经测试过了，钉钉的原生消息见 [[#钉钉返回的原生结构化数据]]。接入钉钉机器人时，由钉钉适配器`dingtalkStreamAdapter`实现由原生结构化数据映射为 [[#MessageInput]]；钉钉 Stream 入站时，`traceId`、`requestId`、`conversationId`、`message.externalMessageId` 以平台传入为主（映射见 [[#dingtalkStreamAdapter（钉钉 Stream）]]），缺失时后端兜底；

- 应用内 Agent 会话（`channel.type = web`）由 LogTool 已登录用户在浏览器 Agent 对话页发起，经 `webAdapter` 映射为 [[#MessageInput]]；仅 `message.externalMessageId` 由前端生成；`traceId`、`requestId`、`conversationId` 由后端生成（详见 [[#ID 字段来源（分渠道）]]）；
```
首条消息：前端只传 externalMessageId + 消息内容 → 后端生成 traceId / requestId / conversationId
续聊：    前端传 externalMessageId + conversationId（来自上次响应）→ 后端仍新生成 traceId / requestId
重发：    同一 externalMessageId 再次请求 → 新 requestId，幂等由 message 维度保证
```
### 三方法简要说明

| 方法               | 一句话           | 输入 / 输出                                 | 典型职责                                                                                                     |
| ---------------- | ------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `parseInbound`   | **读懂平台，写成标准** | HTTP/Stream 原始请求 → `MessageInput`       | 鉴权上下文合并、ID 按渠道规则生成或映射、字段校验、补默认值                                                                          |
| `renderOutbound` | **读懂结果，写回平台** | `MessageInput` + `MessageOutput` → 出站投递 | Phase 1 仅 sync：从 `result` 取 `text` / `attachments` / `session`；HTTP 写 `res`，Stream POST `sessionWebhook` |
| `renderError`    | **统一失败形态**    | 异常 → 写 `res`                            | 入站校验失败、未捕获系统异常；HTTP 状态码与 body 符合各平台约定                                                                    |

- **入站**：各平台不同 → 统一 `MessageInput`
- **出站**：统一 `MessageOutput` → 各平台不同
- **错误**：校验失败、系统异常；业务拒绝（如 `reject`）仍走 `renderOutbound`


## 数据流

现有的两个平台Adapter
- 应用内Agent，type=web，通过`webAdapter`触发 `POST /api/agent/execute`    
- 钉钉，通过`dingtalkStreamAdapter`实现长连接订阅 `/v1.0/im/bot/messages/get``streamClient` 收到事件后调 Adapter 管线）
### 钉钉 Stream 单入口

生产环境**仅使用 Stream** 接收钉钉机器人消息，**不保留 HTTP Webhook 入站**作为兜底。
数据流，钉钉平台把用户消息推送给agent，处理完成后通过POST返回给用户，请求的地址是`sessionWebhook`
``` 
钉钉平台 ──Stream 推送──→ Agent（订阅监听）
              ↓
         MessageInput
              ↓
         队列 + Runtime（与 Web 相同）
              ↓
    POST sessionWebhook ──→ 钉钉 ──→ 用户看到机器人回复
              ↓
    socketCallBackResponse（对 Stream 事件 ack）
```

| 场景 | 行为 |
| --- | --- |
| Stream 启动成功 | 正常走 `parseInbound → orchestrator.execute → renderOutbound`；出站 POST `sessionWebhook` |
| Stream 未连接 / 断连 / 凭证缺失 | **直接失败**：记录 error 日志；不向 Webhook 降级；用户侧表现为消息无法处理或收到错误提示 |
| 单条消息处理异常 | `renderError` → POST 错误文案到 `sessionWebhook`（如「处理失败: …」） |

## Adapter 模块规范

每个渠道 Adapter 必须实现：

| 方法                                                | 职责                                            |
| ------------------------------------------------- | --------------------------------------------- |
| `parseInbound(req)`                               | 平台原始请求 → `MessageInput`                       |
| `renderOutbound({ req, res, request, response })` | `MessageInput` + `MessageOutput` → 平台 sync 响应 |
| `renderError({ req, res, error })`                | 异常 → 平台错误响应                                   |
**Adapter 出站取用**：

| 字段                       | webAdapter          | dingtalkStreamAdapter        |
| ------------------------ | ------------------- | ---------------------------- |
| `text`                   | 放入 HTTP `response`  | POST `sessionWebhook` 用户可见正文 |
| `attachments`            |                     | markdown 链接，逐条 POST          |
| `session.conversationId` | 应用内 · 新建会话首条必定返回值中带 | 不需要                          |

## 钉钉返回的原生结构化数据

```json
{
  "senderPlatform": "Mac",
  "conversationId": "cid6EUxxxxsg==",
  "atUsers": [
    {
      "dingtalkId": "xxx",
      "staffId":"xxx",
      "unionId":"edxxx34"
    }
  ],
  "chatbotCorpId": "ding9733d095*******6cb783455b",
  "chatbotUserId": "$:LWCP_xxxxr5",
  "msgId": "msgrK2xxxxU+riw==",
  "senderNick": "小钉",
  "isAdmin": true,
  "senderStaffId": "0147xxxx8602",
  "sessionWebhookExpiredTime": 1708332604316,
  "createAt": 1708327204136,
  "senderCorpId": "ding9733d095*******6cb783455b",
  "conversationType": "2",
  "senderId": "$:LWCP_v1xxxxBv1MhAv9",
  "conversationTitle": "测试群",
  "isInAtList": true,
  "sessionWebhook": "https://oapi.dingtalk.com/robot/sendBySession?session=66d7c695a9xxxxdeb885",
  "text": {
    "content": " text"
  },
  "robotCode": "dingoxxxxdm3k",
  "msgtype": "text"
}
```
参考 机器人接收消息 的API文档
https://open.dingtalk.com/document/development/robot-message-type
### 钉钉附件消息
接收到钉钉消息类型使用`msgtype`字段表示
`msgtype`，`String`消息类型：
`text`：文本消息
```JSON
{ 
	"msgtype": "text", 
	"text": { "content": "你好" } 
}
```

`richText`：富文本消息，文本消息通过textt提取，如果附件是图片那么通过downloadCode下载
```JSON
{ 
	"msgtype": "richText", 
	"content": { 
		"richText": [ 
			{ "text": "你好" }, 
			{ "downloadCode": "mIofN681YE3f*************JkVBG2vhj4Q9、d2tn/t6XxjaB6UxxxxOVnYYbn1aMT/n3JFgb4i64X3TFxxxxGWxJPR/egKS8syvGzxxxxOO/FYLor2Q==",              "type": "picture" 
			} 
		] 
	} 
}
```

`picture`：图片消息，图片附件通过downloadCode下载
```JSON
{ 
	"msgtype": "picture", 
	"content": { 
		"downloadCode": "mIofN681YE3f/+m+**********8rs4RGdQAwyVs3B75N7boKf8ep0FBB122u9YY/novFAM9BQrirm4/+avZaCV+6nnZ0Zk=" 
	} 
}
```

`audio`：语音消息，语音附件将recognition内容映射到成MessageInput.text，就当成普通的文本消息处理，不需要下载附件
```JSON
{ 
	"msgtype": "audio", 
	"content": { 
		"duration": 4000, 
		"downloadCode": "mIofN681YE3f/+m+Nn***********geqPd7xpJF/9NbOAORDnadz0WbSwWTiYvByBeYDjbg2ecUdno/RGtZ/sqzdvoh00EWw1U6xNqLC3Bk51U+i", 
		"recognition": "钉钉，让进步发生" 
	} 
}
```

`video`：视频消息，若收到附件的视频，那么返回“不支持分析视频”；
```JSON
{ 
	"msgtype": "video", 
	"content": { 
		"duration": 4000, 
		"downloadCode": "mIofN681YE3f/****************OAORDnadz0WbSwWTiYvByBeYDjbg2ecUdno/RGtZxxxxLC3Bk51U+i", 
		"videoType": "mp4" 
	} 
}
```

`file`：文件消息，文件消息通过downloadCode下载
```JSON
{ 
	"msgtype": "file", 
	"content": { 
		"downloadCode": "mIofN681YE3f*************pJF/9NbOAORDnadxxxxg2ecUdno/RGtZ/sqzdxxxxC3Bk51U+i", 
		"fileName": "钉钉让进步发生.pdf" 
	} 
}
```

不同的消息类型有对应的字段，需要支持文本消息、富文本消息、图片消息、语音消息、文件消息、视频消息；按文档字段读取
根据`msgtype`的类型确定需要解析字段
	对于富文本、图片、文件、视频，都是会钉钉平台一侧会提供下载码，需要做的是通过提供的下载码把附件下载到后端，然后再从后端做持久化（本地|OSS），与应用内agent的持久化方式类似；
	对于语音消息，只需要提取 语音识别后的文本 作为文本消息，不需要下载语音源文件；
	对于视频消息，需要明确告知用户，不支持视频，有什么方式吗，还是说如果
```
钉钉消息事件 -> 按 msgtype 解析 -> 提取 downloadCode/附件信息 -> 后端下载 -> 统一资产化持久化 -> 组装 MessageInput
```

消息类型的具体格式参看下方消息类型。

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

## 与下游层关系

- `MessageInput` 交由 `AgentRuntime` 处理，。
- 本层只做消息的接收、归一化与回复渲染。

[^1]: UUID v4：128 位随机标识，形态 `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`。

[^2]: ULID：前 10 位为毫秒时间戳，后 16 位为随机部分，共 26 字符。
