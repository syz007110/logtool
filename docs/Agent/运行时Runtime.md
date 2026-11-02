交付层对接的是runtime运行时，在运行时内部分为几个部分
```
Turn 交付层
  └─ 持久化 user（无 suffix）
       ↓
prepareConversationContext / buildContextEnvelope
  ├─ container / instance / history（DB 原始）
  ├─ contextEnvelope（LLM 视图：currentQuery + historyContext.messages）
  └─ policy（会话级 + Loop 级，一并输出）
       ↓
runTurnLoop（读 prepared.policy）
  ├─ 初始化 loopMessages = 首轮 assemble 完整 messages
  ├─ loop：LLM → append assistant → push orchestrator_n
  │         有 tool_calls 且未超限 → Gateway 串行 → append tool → push tool_result_{n}_{k}
  │         stop / 降级 / 达上限 → break
  ├─ 合成 MessageOutput.text
  └─ loopTrace（内存账本，Loop 结束才落库）
       ↓
Runtime Session Persist
  └─ 按 loopTrace 一行一事件 + assistant_structured
       ↓
返回 MessageOutput
```

构建历史上下文

## 会话管理 `buildContextEnvelope`
根据`turn`交付层输入的`MessageInput`确认的会话实列中涉及的历史消息来构建上下文，将会话容器、会话实例的信息先记录到`Contianer`、`instance`字段；然后根据交付层的`messageInput`提取
对应会话实列中的历史消息到`history`字段，该`history`字段相当于是原始数据；`idempotencyKey`是本次存入消息表时的等幂键；
基础信息构建完成后是构建`contextEnvelope`的内容，通过历史消息的原始数据构建历史上下文；
用户消息存入消息表这一步已经由交付层完成了，那么在会话管理这就不需要做这一步了，那么`userMessageInsert`这一步就不需要了

这一步主要是从会话实例中通过历史对话构建上下文；
构建为约定的结构化输出

```JSON
{
  "container": {
    "id": 123,
    "channel_type": "web",
    "user_id": "u_001",
    "conversation_id": "01JZ_CONV_XXX",
    "container_key": "web:u_001:01JZ_CONV_XXX",
    "metadata": {},
    "created_at": "2026-06-28T12:00:00.000Z",
    "updated_at": "2026-06-28T12:00:00.000Z"
  },
  "instance": {
    "id": 456,
    "container_id": 123,
    "instance_no": 2,
    "status": "active",
    "turn_count": 10,
    "token_count": 1800,
    "version": 7,
    "last_message_at": "2026-06-28T12:00:00.000Z",
    "archived_at": null,
    "metadata": {},
    "created_at": "2026-06-27T10:00:00.000Z",
    "updated_at": "2026-06-28T12:00:00.000Z",
    "instance.notice":"超过token上限，新建对话"
  },
  "activeResolution": {
    "instance": {
      "id": 456
    },
    "createdNewInstance": false,
    "rolloverReason": null,
    "previousInstanceNo": 2
  },
  "history": [
    {
      "message_id": "01JZ_MSG_0001",
      "role": "user",
      "message_type": "text",
      "content": "故障码141010A是什么意思",
      "payload": {},
      "attachments": [],
      "created_at": "2026-06-28T11:59:30.000Z"
    },
    {
      "message_id": "01JZ_MSG_0002:assistant_structured",
      "role": "assistant",
      "message_type": "text",
      "content": "141010A 表示……",
      "payload": {},
      "attachments": [],
      "created_at": "2026-06-28T11:59:35.000Z"
    }
  ],
  "policy": {
    "maxTurns": 20,
    "idleTimeoutMinutes": 30,
    "maxTokens": 6000,
	"maxSteps": 4,
	"maxToolCalls": 3,
	"historyTurns": 20
  },
  "contextEnvelope": {
    "currentInput": {
      "messageId": "01JZ_MSG_0003",
      "attachments": [],
      "fileIds": []
    },
    "currentQuery": "请继续解释这个故障码",
    "historySummary": {
      "summary": null // 仅当旧历史被压缩时才有值
    },
    "historyContext": {
      "messages": [
        {
          "role": "user",
          "content": "故障码141010A是什么意思"
        },
        {
          "role": "assistant",
          "content": "141010A 表示……"
        }
      ]
    },
    "contextVersion": 2
  },
  "idempotencyKey": "web:u_001:01JZ_CONV_XXX:01JZ_MSG_0003",
}
```

- `container`：会话容器归属（渠道+用户+会话ID），用于定位同一会话域。
- `instance`：当前激活会话实例，决定历史读取范围和串行处理边界。
	-`instance.notice` 用于表示创建新实例的提示和原因，发生时拼接在LLM返回的回答最后；前端不要单独`push`一条这样的信息；
- `activeResolution`：这次是否发生实例 rollover（新建实例、原因、上一实例号）。
	会话实例有失效机制
		 - 当`token_count`超过阈值时则该会话实列失效，新建会话实例；
		 - 当`turn_count`超过阈值时则该会话实列失效；
		 - 当会话实例空闲时间超过阈值，可配置默认30分钟，则失效；
		 - 用户发送 `/new` 时强制新建会话实例
- `history`：从当前 `instance_id` 读取的历史消息（不是全局历史）。
- `policy`：本轮上下文与会话策略参数（turn/token/idle/Loop 步数与工具次数限制）。
- `contextEnvelope`：供 Orchestrator LLM 使用的统一上下文对象（最关键）。
    - `currentInput`：当前消息原文与附件。
    - `historySummary` / `historyContext`：给 LLM 的压缩历史视图。
    - `contextVersion`：结构版本号，便于后续演进兼容。
- `idempotencyKey`：消息幂等锚点。
- `userMessageInsert`：本轮用户消息写表结果（你现在把写入前移到 Turn，同步段写入后，这里通常可为 `null` 或不依赖）。

其中 `contextEnvelope` 是给到后续 Orchestrator LLM 的关键性结构化内容
```Json
"contextEnvelope": {
    "currentInput": {
      "messageId": "01JZ_MSG_0003",
      "attachments": [],
      "fileIds": []
    },
    "currentQuery": "请继续解释这个故障码",
    "historySummary": {
      "summary": null // 仅当旧历史被压缩时才有值
    },
    "historyContext": {
      "messages": [
        {
          "role": "user",
          "content": "故障码141010A是什么意思"
        },
        {
          "role": "assistant",
          "content": "141010A 表示……"
        }
      ]
    }
```
- `currentInput`  
    当前这条用户输入的结构化描述，使用的是`MessageInput`对应的字段
    - `messageId`：当前消息 ID， `message.externalMessageId`
    - `attachments`：当前消息附件数组 `message.attachments`
    - `fileIds`：从附件提取出的文件 ID 列表， `message.fileId`

- `currentQuery`  
    当前用户输入文本，使用的是 `message.text`
    
- `historySummary`  
    仅当窗口外历史被压缩时才有内容
    - `summary`：上下文压缩后的内容
	
- `historyContext`  
    `historyContext.messages` 是从 `conversation_messages` 历史里按“轮”截取的最近窗口，时间正序排列：
    - `messages`：由`role`和`content`组成；

构建历史上下文和压缩的规则
- `history`：原始 DB 历史，按 `instance_id` 读取，最多 `SESSION_CONTEXT_HISTORY_TURNS` 轮。
- `historyContext.messages`：从 `history` 投影出来的 LLM 可读最近轮次（`role` + `content`，时间正序）。
- `historySummary.summary`：仅表示窗口外历史压缩结果。
- 当前阶段不实现压缩，所以 `historySummary.summary = null`。
- 当前阶段不根据 token 动态压缩，只用 `SESSION_CONTEXT_HISTORY_TURNS` 控制窗口。
- 未来实现压缩时，再引入独立配置，比如：
    - `SESSION_CONTEXT_TOKEN_BUDGET`
    - `SESSION_CONTEXT_SUMMARY_MODEL`
    
- `contextVersion`  
    上下文结构版本号（当前为 `2`）。  
    v2 相对 v1：移除 `confirmedSlots` / `sessionState` 等 Planner 时代字段；历史仅通过 `historyContext.messages` 供给 LLM。  
    作用：Schema 演进与兼容控制，避免字段变更引发运行时歧义。


在构建历史会话时，对于 role = assistant 且 message_type = orchestrator时，payload中有tool_call的情况下，构建时应还原为 Chat API 的 assistant 消息
不要再输出：[编排决策] kind=tool_call, tool=error_code_lookup
```JSON
{
	"role": "assistant",
	"content": null,
	"tool_calls": [{
		"id": "call_abc",
		"type": "function",
		"function": {
		"name": "error_code_lookup",
		"arguments": "{\"errorCode\":\"141010A\"}"
		}
	}]
}
```

对于  `role=tool` + `message_type=tool`（`tool_result_{n}_{k}`）不要再输出：[工具结果] tool=..., status=success应还原为：未来需要拓展的是根据`token`量压缩上下文
```JSON
{
	"role": "tool",
	"tool_call_id": "call_abc",
	"content": "{\"status\":\"success\",\"data\":{...},\"evidence\":[...]}"
}
```

assistant_structured是事件，是本轮对话最终的回答，所以role = assistant content = 最终的正文；历史上下文需要这个内容；
同时orchestrator 无tool这是assistant_structured的元数据，避免重发不应该构建进历史上下文；
其余的tool和其他消息需要写入

|                        |                                                                                   |
| ---------------------- | --------------------------------------------------------------------------------- |
| `assistant_structured` | 仍是 `{ role: "assistant", content: "最终正文" }`，不带 `tool_calls`                       |
| 无 tool 的 orchestrator  | 一般不 replay 进历史（避免和 `assistant_structured` 重复两条 assistant）                         |
| `buildContextEnvelope` | `historyContext.messages` 要透传 `tool_calls`、`tool_call_id`，不能只留 `role` + `content` |
|                        |                                                                                   |
### 附件部分
需要根据模型的`providers`来区分该模型是否具备多模态能力；
目前已有的deepseek和kimi，仅kimi支持多模态，需要在providers添加字段来区分是否支持多模
- 图片、`.txt`、`.medbot` 三类文件都支持以附件形式输入到对话框，并都会做持久化。其中仅图片附件会作为 `LLM` 多模态输入候选；
- 是否真正喂给 `LLM`，由当前 `provider` 的 `capabilities` 决定。当当前 `provider` 支持图片输入时，后端会将图片从存储中读取，并转换后添加到 `LLM` 请求的 `content` 中。
```
"content": [ { "type": "text", "text": "描述这张图片" }, 
{ "type": "image_url", "image_url": "data:image/png;base64,..." } ]
```
- .txt、.medbot 不喂给 LLM，只作为消息附件持久化，并供后端工具链消费。
- 当当前 provider 不支持图片输入时：仍允许上传图片附件；
	 前端需明确提示“当前模型不会解析图片”；
	 前端提供一键切换到支持图片输入的模型；从 `provider` 列表中找到第一个 `capabilities.imageInput === true && available === true `的模型
	 若用户不切换，则图片附件仅持久化，不进入` LLM content`。
- 
## Orchestrator LLM

`Orchestrator LLM`主要的职责是将 #systemprompt 系统提示词、 #toolfunction 工具列表、 #contextEnvelope 历史上下文，构建为 `LLM 对话补全 API`的接口形式，接收解析 `对话补全API的响应`，包含 `tool function`

### 短路
在进入 Orchestrator LLM 前需要判断是否满足短路判定，若满足某一个短路规则，在进入 Orchestrator LLM 之前，runtime 先执行一层短路规则判定。命中任一规则后：不发送给 LLM
直接返回固定原因给用户同时完成消息持久化，短路性规则：
分为两类 
- pre_orchestrator_short_circuit 不需要下载附件、不需要进 LLM、甚至不需要完整资产化，就能直接决定拒绝或放行
	消息类型判定
		例如钉钉 msgtype=video，直接返回“不支持分析视频”
	单条消息附件数量判定
		单条消息最多 5 个附件
	支持附件类型白名单
		日志文件：.medbot、.txt
		压缩包：.7z、.zip
		图片：.jpeg、.jpg、.png、.webp
- attachment_validation_policy 往往要拿到更完整的附件元数据，甚至要下载后才能严格判断

	后端按“文件后缀 + MIME 类型”双重校验附件合法性
	单个附件大小必须小于 20MB
	单条消息附件总大小必须小于 100MB
```
消息进入 runtime
-> 短路规则判定
-> 命中则直接回复并持久化，不进 LLM
-> 未命中再进入附件处理 / Orchestrator LLM
```
### 实例失效处理
对于rollover也是在这部分中做判断吗，会话实例有失效机制，
	当`token_count`超过阈值时则该会话实列失效，新建会话实例；
	当`turn_count`超过阈值时则该会话实列失效；
	当会话实例空闲时间超过阈值，可配置默认30分钟，则失效；
	用户发送 `/new` 时强制新建会话实例
相当于应用内agent和钉钉都会先返回明确的会话失效的原因
```
archived：原实例已失效，不能继续对话，已新建会话。
max_tokens：原会话已达到 token 上限（{{maxTokens}}），不能继续对话，已新建会话。
max_turns：原会话已达到轮次上限（{{maxTurns}}轮），不能继续对话，已新建会话。
idle_timeout：原会话已空闲超过{{idleTimeoutMinutes}}分钟，不能继续对话，已新建会话。
```


### 系统消息
短路、消息实例失效判定结果、`agentRuntime`运行中的异常都作为独立的系统消息处理`systemMessages`，系统回复作为独立消息输出，会写入消息表，但不进入历史上下文（不污染上下文）；
无论应用内还是钉钉，这类内容本质上都不是普通 `assistant` 正文，而是“系统事件”。
针对应用内`agent`和钉钉使用不同的方式进行渲染，这一类的系统消息应该使用 `role = system` 写入消息表

主流大模型补全对话的api接口是一个成熟的形式；

例如：deepseek 
https://api-docs.deepseek.com/zh-cn/api/create-chat-completion/
请求体
```JSON
{
  "messages": [
    {
      "content": "You are a helpful assistant",
      "role": "system"
    },
    {
      "content": "Hi",
      "role": "user"
    }
  ],
  "model": "deepseek-v4-pro",
  "thinking": {
    "type": "enabled"
  },
  "reasoning_effort": "high",
  "max_tokens": 4096,
  "response_format": {
    "type": "text"
  },
  "stop": null,
  "stream": false,
  "stream_options": null,
  "temperature": 1,
  "top_p": 1,
  "tools": [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "strict": true,
        "description": "Get weather of a location, the user should supply a location first.",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "The city and state, e.g. San Francisco, CA",
                }
            },
            "required": ["location"],
            "additionalProperties": false
        },
    }}],
  "tool_choice": "auto",
 
```
`messages` 下也是`content`、`role` 组成的数组结构，可以用来写入系统提示词和历史上下文

`model` 用来选择模型
`thinking` 控制思考模式与非思考模式的转换，
	其中`type`如果设为 enabled，则使用思考模式。如果设为 disabled，则使用非思考模式
`response_format` 用来规范规范返回内容的格式

`tools` 遵循`deepseek-tool call`的结构，在思考模式下需要显式设置 strict 属性为 true，参考`API`文档 https://api-docs.deepseek.com/zh-cn/guides/tool_calls 
`tool_choice` 控制模型调用 tool 的行为。
	`none` 意味着模型不会调用任何 tool，而是生成一条消息。
	`auto` 意味着模型可以选择生成一条消息或调用一个或多个 tool。
	`required` 意味着模型必须调用一个或多个 tool。


对于大模型来说补全对话的`api`已经是一个比较完整的结构了，最终调用的接口都类似，统一的是接口形态（补全对话 = `messages` 进、`assistant` 出）。  不统一的是能力开关和边角行为（要不要加 `thinking`、能不能用 `tools[]`、JSON 是否严格等）。
那么为了适配不同的模型，在`agent`功能中需要维护用于构建`LLM API`输入的这几部分内容， #systemprompt  系统提示词、 #toolfunction （工具 function 定义）、 #contextEnvelope （历史上下文）
因此定义一层 参考主流对话补全 API 的中间结构化对象（`messages` + `tools` + `options`），包含请求和响应，Orchestrator LLM 只认这一层；对不同模型只在 Adapter 做微调，不再拼 prompt 文本。你们现在的 `historyContext.messages` 和 `tools[]` 就是在往这个中间形态靠拢。

Orchestrator LLM 构建的标准请求
```JSON
{
  "model": "deepseek-chat",
  "messages": [],
  "tools": null,
  "tool_choice": "auto",
  "temperature": 0,
  "top_p": 0.1,
  "max_tokens": 4096,
  "stream": false,
  "response_format": null,
  "stop": null,
  "extensions": {
    "traceId": "…",
    "registryVersion": "v1",
    "lang": "zh-CN"
  }
}
```
`messages`字段是用来写入系统提示词和历史上下文的，历史上下文直接使用`historyContext.messages`中的内容，系统提示词内容来自 `system.md`，不是拼进 user 模板，`content`使用`md`文档中的内容，`role=system`
`messages` 中 `role: "system"`内容来自 `system.md`，不是拼进 user 模板
`messages` 中其他消息使用`contextEnvelope - historyContext` + 当前 user的消息，`historyContext` 用 `historyContext.messages` 展开；当前轮 `query/fileIds` 渲染成一条 `user`消息
`tools[]`，不是 prompt 文本，是 registry 里 `enabled=true` 的工具；`description` + `parameters` 即模型可见的「工具说明」|
若存在工具那么`tool_choice`就为`auto`
由于使用的时机器人的形式，暂时不用流式输出
`response_format`是约束模型 `assistant.message.content` 文本 的格式，在已经使用`tool calls`的情况下就不需要再约束返回消息的格式了，标准的响应中若使用工具调用会在返回消息`message`字段内的`tool_calls`中返回对应的工具

Orchestrator LLM 预期接收的 标准响应
```JSON
{
  "id": "cmpl-…",
  "object": "chat.completion",
  "created": 1705651092,
  "model": "deepseek-chat",
  "choices": [
    {
      "index": 0,
	  "message": {
	  "role": "assistant",
	  "content": null,
	  "tool_calls": [{ "id": "call_abc", "type": "function", "function": { "name": "error_code_lookup", "arguments": "{...}" } }]
	},
      "finish_reason": "tool_calls"
    }
  ],
  "usage": {
    "prompt_tokens": 16,
    "completion_tokens": 10,
    "total_tokens": 26
  }
}
```
finish_reason 模型停止生成 token 的原因
- stop：模型自然停止生成，或遇到 stop 序列中列出的字符串。
- length ：输出长度达到了模型上下文长度限制，或达到了 max_tokens 的限制。
- content_filter：输出内容因触发过滤策略而被过滤。
- insufficient_system_resource：系统推理资源不足，生成被打断
- tool_calls 因发起工具调用而结束——此时 `tool_calls` 应非空

message 对于模型返回的role应该为assistant，返回的内容在content中，
```JSON
"message": {
  "role": "assistant",
  "content": "请提供需要查询的故障码…",
  "tool_calls": null
},
"finish_reason": "stop"
```
若需要做工具调用那么tool_calls中会有对应的tool function的内容；
```JSON
"message": {
  "role": "assistant",
  "content": null,
  "tool_calls": [{ "id": "call_abc", "type": "function", "function": { "name": "error_code_lookup", "arguments": "{...}" } }]
},
"finish_reason": "tool_calls"
```

需要注意的是由于异常导致的`tool_calls.id`和`role.tool`下的`tool_call_id`需要一一对应
	同一轮里，`assistant.tool_calls[]` 和后续 `role="tool" `必须按 `tool_call_id `完整闭合。
	写历史时，不能把“未闭合的` assistant tool_calls`”留在可回放上下文里。
### 系统提示词
对于系统提示词来说可以分为几个板块，形成一个完整的md文档，构建`LLM API`接口时提取内容存入 `role = system`的`context`中
#systemprompt
``` markdown
# Role
你是腹腔镜手术机器人设备工程师，负责设备故障、日志、故障码、知识库、手术统计相关的工程分析。
熟悉腹腔镜手术机器人系统，包括但不限于：
- 医生控制台
- 手术台车
- 主控制臂
- 工具臂
- 调整臂
- 图像系统
- 驱动器系统
- 远程控制系统
- EtherCAT / 网络通信
- 状态机
- 器械识别与使用记录
- 设备日志与故障码体系
但你不是临床医生，不提供诊断、治疗、用药、手术决策和其他临床相关的建议。
  
# Mission
你的任务是帮助用户：
- 查询和解释故障码
- 分析设备日志
- 理解报警原因和参数含义
- 检索知识库中的排查资料
- 总结手术过程中的设备运行状态
- 分析手术统计数据
- 生成设备问题排查建议
- 形成可追溯的分析报告
- 排查设备故障
- 回答与设备相关的问题
超出上述设备技术支持范围、或缺乏上下文证据的请求，应追问或拒绝，不得编造结论。
必要时调用工具查询内部故障码库、日志库、知识库和手术统计数据。 

# Boundary
- 禁止编造上下文中不存在的信息。
- 禁止编造内部数据库内容
- 禁止直接生成 SQL 操作数据库
- 禁止直接访问文件系统
- 禁止绕过权限
- 禁止提供临床诊疗建议
- 禁止替代授权工程师做最终维修决策
```

### 历史上下文

历史上下文直接使用`historyContext.messages`中的内容，将message中的内容直接映射到LLM API接口中的

### 工具提示词

使用`tool calls` 的结构，项目内以工具注册表`Canonical tools`描述可以使用的工具，通过一层转换映射为模型中工具调用的`API`接口`tools[]`的形式，这里的映射基本做成一一映射的关系，减少没有必要的转换，`deepseek`和`kimi`是相同的`tool[]` 格式
`Canonical tools`相比模型的`API`接口多出执行配置 + 权限 + 注册表元数据，

因此 `Canonical tools`的结构是
```JSON
{
  "toolName": "error_code_lookup",
  "displayName": "故障码查询",
  "enabled": true,
  "description": "查询故障码含义…（可写故障码格式、适用场景）",
  "parameters": { /* JSON Schema → tools[].function.parameters + Gateway 入参校验 */ },
  "runtime": {
    "defaults": { "language": "zh-CN" },
    "contextFillable": [],
    "execution": {
      "mode": "sync",
      "handler": "errorCodeLookupHandler.execute",
      "timeoutMs": 5000,
      "retryable": false
    }
  },
  "security": {
    "riskLevel": "low",
    "requiredPermissions": ["error_code:read"],
    "audit": true
  }
}
```
`tool name` 模型侧 `function.name`，需满足 provider 命名规则（DeepSeek / Kimi 略有不同）
`description` 进 `tools[]`，是模型选工具、理解用途的主要依据；故障码格式、多结果时如何追问等，写在这里是合适的（不必再单独写 tool prompt）
`parameters` -双重作用：LLM `tool_calls` 的输入规范 + 工具网关 `validateToolArguments`。
- 字段参考 DeepSeek / OpenAI function calling 的 JSON Schema 子集（`type`、`properties`、`required`、`enum`、`pattern`、`anyOf` 等）。
- 可以参考 https://api-docs.deepseek.com/zh-cn/guides/tool_calls 中可使用的字段和逻辑符号
runtime 是用来描述工具调用的方式；
	`mode`  `sync` → 本地 Handler；`http` → 远程接口，相当于用区分是项目内部的工具还是调用了外部的；
	`handler`指定用哪个 Handler
	`timeoutMs` 执行侧使用的超时时间
	`retryable` 用描述是否重试的标志位，当该重试标志位为true时， 
	`retryAttempts` 和 `retryBackoffMs` 才有效，分别是重试次数和间隔时间
security 是用来在执行层限制权限的；

## Turn Loop 

turn loop的循环是如下图所示
```
构建会话（读 DB 历史 + 当前 user → 初始 messages[]）
        ↓
    ┌─── loop（直到 stop 或达上限）──────────────────┐
    │  LLM API                                      │
    │    ├─ 有 tool_calls                           │
    │    │     → 执行工具                           │
    │    │     → append 到 messages：               │
    │    │         assistant（含 tool_calls）       │
    │    │         tool（含 tool_call_id + 结果）   │
    │    │     → continue loop（再调 LLM）          │
    │    │                                          │
    │    └─ 无 tool_calls（content / stop）         │
    │          → 本轮最终助手回复 = content         │
    │          → break loop                         │
    └───────────────────────────────────────────────┘
        ↓
持久化（orchestrator / tool / assistant 等）
        ↓
返回 MessageOutput 给用户
```
#### `Turn loop`规则
`Turn Loop` 上限来自 会话管理 `buildContextEnvelope`的`prepared.policy`：
- `maxSteps`：单轮用户消息内最多 `LLM` 调用次数（默认 4，`RUNTIME_MAX_STEPS`）
- `maxToolCalls`：单轮内最多工具执行次数，跨所有 `loop` 轮累计（默认 3，`RUNTIME_MAX_TOOL_CALLS`）
`runTurnLoop` 只读 `policy`，不硬编码。
#### `Turn loop`token计算
`instance.token_count` 增量 = loop 内所有 LLM `usage` 之和

#### `Turn loop`消息缓存及处理
首轮 `assembleChatCompletionRequest` → 得到 `loopMessages`；
后续轮：`loopMessages` 整体作为 `messages` 传入 `Adapter`（不再重复 assemble 历史段）：
```
system（system.md）
+ [history_summary]（若有）
+ historyContext.messages（DB 投影，含 user/assistant/tool）
+ 当前 user（currentQuery + fileIds）
+ [memory]（若有）
```
Loop 内只 append 本轮产生的 `assistant` / `tool`，不再重复拼 system / 当前 user。
后续 LLM 调用：`messages = loopMessages`（可经 Adapter 微调），不再走完整 `assembleChatCompletionRequest` 重拼历史——或等价地调用 `assembleChatCompletionRequest` 时传入 `extraMessages` = loop 增量段（现有 `orchestratorLlmService` 已支持 `extraMessages`）。
那么在`loop`中产生的消息都会被`append`进`loopMessages`，同时记的是 `loopTrace`（本轮增量账本，只 push，Loop 结束才落库）。
```JSON
// stop
{ "role": "assistant", "content": "请提供故障码…" }
// tool_calls（必须保留 tool_calls 字段）
{
"role": "assistant",
"content": null,
"tool_calls": [{ "id": "call_abc", "type": "function", "function": { ... } }]
}
```
- `Loop` 里每一次 LLM 响应 → 至少 1 条 `orchestrator`。
- `Loop` 里每一次工具执行 → 1 条 `tool`（成功失败都写）。
- `Loop break` 时 → 1 条 `assistant` `text`（交付层 `MessageOutput.text` 来源）。

`loop`循环内需要分为两种情况，`turn loop`内接收到的是标准响应；
首先都会先将`LLM`的响应append到`loopMessages`，例如这样的形式
此时`role`应该为`assistant`,若无返回`tool_calls`
```JSON
"message": {
  "role": "assistant",
  "content": "请提供需要查询的故障码…",
  "tool_calls": null
},
"finish_reason": "stop"
```
若返回`tool_calls`
```JSON
"message": {
  "role": "assistant",
  "content": null,
  "tool_calls": [{ "id": "call_abc", "type": "function", "function": { "name": "error_code_lookup", "arguments": "{...}" } }]
},
"finish_reason": "tool_calls"

```
由于部分模型会同时回复`tool_calls`和`content`，因此`tool_calls.length > 0` 且未达 `maxToolCalls` → 走工具来判断是否执行工具调用；`content` 可记入 `orchestrator payload`，但不作为最终回复
	根据`tool_calls`内返回的输入参数使用工具注册表中`execution.handler`来执行对应的工具
	工具执行时由工具网关做输入参数校验，规则还是由工具注册表的`parameters.properties`规则约束的
	工具执行成功那么把工具执行的结果返回的内容`append`到`loopMessages`同时`push`到`loopTrace`
	如果工具执行异常了，比如无权限或其他问题，返回的错误信息也要`append`到`loopMessages`中，同时push到`loopTrace`；
	无论哪种情况都是 `role = tool`，特别是失败时`content` 带 `status:failed` + `error.code/message`，
	当存在多个工具调用时，串行执行，调用完成后逐个`append`,

`finish_reason = stop` 那么就是模型自然停止生成，或遇到 stop 序列中列出的字符串，这种情况下本次用户输入的loop就结束了，此时需要做持久化处理，这部分是由`Runtime Session Persist` 写 `looptrace` 内事件 + 最终 `assistant`，将本次`loop`中的`loopTrace`内容写入消息数据表按 「`Loop` 步进记录 + 最终用户可见回复」 写，一行一条事件，不是按 `role` 只写一行。

| 事件     | role        | message_type   | message_id 后缀          | content         | payload                           |
| ------ | ----------- | -------------- | ---------------------- | --------------- | --------------------------------- |
| LLM 决策 | `assistant` | `orchestrator` | `orchestrator_1`       | 可读摘要或 `null`    | 完整<br>`turnResult` / `tool_calls` |
| 工具结果   | `tool`      | `tool`         | 参考工具结果事件后缀             | 工具的返回结果         | `ToolResult` 矩阵                   |
| …      | …           | …              | `orchestrator_2` …     | …               | …                                 |
| 最终回复   | `assistant` | `text`         | `assistant_structured` | `LLM返回的content` | 可选 `meta`                         |
|        |             |                |                        |                 |                                   |
工具结果事件后缀：
同一 `orchestrator` 轮次 n 内：
- 仅 1 个 `tool_call → tool_result_{n}_1`
- 多个 `tool_call → tool_result_{n}_1、tool_result_{n}_2 …`


#### 持久化
`loop`完成后的持久化写入的幂等是遵循`agent`内部消息的幂等键 `idempotency_key ={channel_type}:{user_id}:{conversation_id}:{externalMessageId}:{suffix}` 这个形式，可以是 `orchestrator_{n}、tool_result_{n}_{k}`这样的形式；
对于` length、content_filter、insufficient_system_resource`这几种情况，除了返回 标准响应中llm的返回内容外增加对应的解释，解释和响应中的content会合并到一起给到交付层 `MessageOutput.text`
- `length` ：输出长度达到了模型上下文长度限制。
- `content_filter`：输出内容因触发过滤策略而被过滤。
- `insufficient_system_resource`：系统推理资源不足，生成被打断
最后一轮 `stop` 时，同一段 `content` 会出现两次：
- `orchestrator_n.payload`：完整 `turnResult`
- `assistant_structured.content`：交付正文（含降级前缀）

| 条件                                                                   | Loop 行为       | MessageOutput.text                                                       | Persist                                                    |
| -------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `stop + content`                                                     | break         | content                                                                  | `loopTrace` 全量 + `assistant_structured`                    |
| `tool_calls` <br>工具执行未超限                                             | 执行工具continue  | —                                                                        | —                                                          |
| `finish_reason = tool_calls` <br>但 `tool_calls` 为空                   | break         | 无法调用工具 +若有 `content` 则拼接                                                 | `orchestrator_n + assistant_structured`                    |
| `tool_calls` <br>但到达 `maxToolCalls`                                  | break<br>不执行  | 固定说明（调用工具次数已达上限）<br>+若有 `content` 则拼接                                    | `loopTrace` 全量 + `assistant_structured`                    |
| `n >= maxSteps` 仍有 `tool_calls`                                      | break         | 说明「已达最大推理步数」                                                             | 同上                                                         |
| <br>`length` <br>`content_filter` <br>`insufficient_system_resource` | break         | 降级说明(<br>上下文长度限制<br>因触发过滤策略而被过滤)<br>推理资源不足<br>+ `content`（`content` 可为空） | `orchestrator_n` 仍写；`assistant_structured.content `写合并后文本； |
| `kind === empty`                                                     | break 或 throw | 说明Agent内部异常                                                              | 写 `error_runtime`（`message_type=error`）                    |


### 附件部分
需要注意的`MessageInput.rawPayload`、`buildContextEnvelope`会话构建过程中`payload`、`agent loop`一轮完成后的`orchestrator_n.payload` 都不要把`base64`的展开结果写入，只保留 `attachment `元数据和` objectKey/url`