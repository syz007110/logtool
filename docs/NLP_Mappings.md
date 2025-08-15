### NLP 自然语言解析：模板与词典扩展指南

本指南说明当前自然语言解析的实现方式、各配置文件职责，以及如何扩展匹配模板与词典并进行验证、记录变更。

#### 1. 代码与配置概览

- 解析入口：`backend/src/utils/nlpParser.js`
  - 导出 `parseNaturalLanguageToFilters(text)`，将中文查询句解析为 `{ logic, conditions }` 结构。
  - 使用规则/正则与配置模板组合解析，内部调用分词器获取辅助特征。

- 分词器：`backend/src/utils/segmenter.js`
  - 优先通过 HanLP（见 `backend/src/utils/hanlpClient.js`）进行分词，失败时回退到 `nodejieba`，最终兜底按空白切分。
  - 会将 `nlpMappings.json` 与 `nlpConfig.json` 中的自定义词注入（若 `nodejieba` 可用），增强分词效果。

- HanLP 客户端：`backend/src/utils/hanlpClient.js`
  - 读取 `backend/src/config/nlpConfig.json` 的 `useHanLP`、`endpoint`、`timeoutMs` 等；通过常见 REST 路径尝试调用 HanLP。

- 映射/模板：`backend/src/config/nlpMappings.json`
  - 维护字段同义词、操作符同义词、逻辑词、区间连接词、时间短语、单位、字典查表（`lookups`）、模板规则（`patterns`）。

- 控制器接入点：`backend/src/controllers/logController.js`
  - `nlpToFilters` 接口调用 `parseNaturalLanguageToFilters`，并基于白名单裁剪字段与操作符，返回安全 AST。
  - `getBatchLogEntries` 将 AST 转为 Sequelize 查询条件；特殊运算符 `firstof` 在此实现“每个 (log_id, error_code) 的首次出现”逻辑。

提示：`backend/src/utils/grammar.ne` 为候选语法方案骨架，当前未接入运行流程。

#### 2. 解析流程（简述）

1) 标准化输入（标点、全角半角等）→ 2) 逻辑切分（且/并且/或）→ 3) 优先按 `patterns` 模板匹配并产出条件树 → 4) 否则走规则解析（字段识别、操作符与值、时间/区间/IN/包含等）→ 5) 生成 `{ logic, conditions }` AST → 6) 控制器裁剪白名单并执行查询。

#### 3. 如何扩展词典与模板

编辑文件：`backend/src/config/nlpMappings.json`

- 字段同义词：`fields`
  - 作用：将“错误码/故障码/… ”等中文别名映射为标准字段名（`error_code`、`explanation`、`param1..4`、`timestamp`）。
  - 示例（新增别名）：
  ```json
  {
    "fields": {
      "explanation": ["释义", "描述", "内容", "文本", "消息"]
    }
  }
  ```

- 操作符同义词：`operators`
  - 作用：将“包含/有关/关于/like”等映射到标准操作符（如 `contains`）。
  - 注意：若新增了全新操作符（例如 `startswith`/`endswith`），需要同步更新：
    - 控制器白名单：`backend/src/controllers/logController.js` 中 `allowedOps`
    - Sequelize 映射：`getBatchLogEntries` 的 `buildCondition` 分支逻辑

- 逻辑词与区间连接：`logic`、`range_joiners`
  - 作用：影响逻辑切分与区间抽取（如 到/至/~/-/与）。

- 时间短语：`time_phrases`
  - 作用：为后续时间解析留出扩展位（当前未深度使用，可作为模板/规则中的查表依据）。

- 单位：`units`
  - 作用：可在模板内配合正则或转换器使用（例如温度单位）。

- 查表：`lookups`
  - 作用：将模板匹配到的分组结果映射为参数、编码、数值等。
  - 示例：
  ```json
  {
    "lookups": {
      "state_to_p2": { "S10": 10, "S20": 20, "S30": 30 }
    }
  }
  ```

- 模板：`patterns`
  - 作用：优先级最高的规则。支持两种形态：
    - `conditions`: 数组，逐条生成叶子条件
    - `group`: 递归结构，允许生成 AND/OR 嵌套
  - 模板字段说明：
    - `regex`：JS 正则字符串（自动以 `i` 标志匹配），捕获组可用于取值
    - 叶子模板字段：`field`、`operator`、`value`
    - `value_from_group`: 使用正则捕获组编号取值（数字，从 1 开始）
    - `value_from_lookup`: `{ table, key_from_group, default }` 通过 `lookups` 查表取值
    - `transform`: 目前支持 `int`（对取到的值做整型转换）
  - 示例（新增“相机相关日志”→ explanation contains 所有关键词）：
  ```json
  {
    "name": "相机相关日志",
    "regex": "(.+?)相关的(日志|记录|释义|内容)",
    "conditions": [
      { "field": "explanation", "operator": "contains", "value_from_group": 1 }
    ]
  }
  ```
  - 示例（OR 组合）：
  ```json
  {
    "name": "2号臂：error_code第二位为4 或 释义包含2号臂",
    "regex": "(2号臂|臂2|arm2)",
    "group": {
      "logic": "OR",
      "conditions": [
        { "field": "error_code", "operator": "regex", "value": "^.[4].*" },
        { "field": "explanation", "operator": "contains", "value_from_group": 1 }
      ]
    }
  }
  ```

#### 3.1 增加“同义词标准化”与“字段定向映射”的操作步骤

- 增加同义词（把不同说法归一）：
  1) 编辑 `backend/src/config/nlpMappings.json`
  2) 在 `fields` 中为目标字段添加更多中文/英文别名；在 `operators` 中为操作符添加同义词
  3) 可选：把新增词加入 `backend/src/config/nlpConfig.json` 的 `custom_words`，提升分词效果
  4) 重启后端使缓存生效

  示例：
  ```json
  {
    "fields": {
      "explanation": ["释义", "描述", "内容", "文本", "消息", "explanation"]
    },
    "operators": {
      "contains": ["包含", "包括", "有关", "关于", "like"]
    }
  }
  ```

- 字段定向映射（标准词 → 字段/操作符/默认值）：
  1) 优先使用 `patterns` 模板，用正则命中业务关键词/句式
  2) 对应产出标准条件（叶子条件或 AND/OR 组合）
  3) 如需将捕获到的词归一为标准值，使用 `lookups`

  示例 A：设备开机（同义词归一）
  ```json
  {
    "lookups": {
      "kw2canon": {
        "开机": "开机",
        "power on": "开机",
        "系统启动": "开机"
      }
    },
    "patterns": [
      {
        "name": "设备开机（同义归一到开机）",
        "regex": "(开机|power on|系统启动)",
        "conditions": [
          { "field": "explanation", "operator": "contains", "value_from_lookup": { "table": "kw2canon", "key_from_group": 1 } }
        ]
      }
    ]
  }
  ```

  示例 B：相机相关（字段定向映射到 explanation）
  ```json
  {
    "patterns": [
      {
        "name": "相机相关（字段定向到 explanation）",
        "regex": "(相机|镜头|camera)",
        "conditions": [
          { "field": "explanation", "operator": "contains", "value": "相机" }
        ]
      }
    ]
  }
  ```

  示例 C：工具臂编号（OR 组合示例）
  ```json
  {
    "patterns": [
      {
        "name": "1号臂优先规则：error_code第二位为3 或 释义包含1号臂",
        "regex": "(1号臂|臂1|arm1)",
        "group": { "logic": "OR", "conditions": [
          { "field": "error_code", "operator": "regex", "value": "^.[3].*" },
          { "field": "explanation", "operator": "contains", "value_from_group": 1 }
        ] }
      }
    ]
  }
  ```

  示例 D：时间区间（字段定向到 `timestamp between`）
  ```json
  {
    "patterns": [
      {
        "name": "时间区间",
        "regex": "时间在\\s*([\\d\\-/ :]+)\\s*(?:到|至|-)\\s*([\\d\\-/ :]+)",
        "conditions": [
          { "field": "timestamp", "operator": "between", "value_from_group": 1 },
          { "field": "timestamp", "operator": "between", "value_from_group": 2 }
        ]
      }
    ]
  }
  ```

提示：如果新增了全新操作符（如 `startswith`/`endswith`），请同步修改：
- 控制器白名单：`backend/src/controllers/logController.js` 中 `allowedOps`
- Sequelize 映射：同文件中 `getBatchLogEntries` → `buildCondition`

#### 4. 扩展自定义词（提升分词效果）

编辑：`backend/src/config/nlpConfig.json`

- `custom_words`: 增加领域词，分词器会尽量按词切分，提高模板/规则命中率。
```json
{
  "custom_words": ["状态机", "能量脚踏", "手离合", "工具臂"]
}
```

提示：`segmenter.js` 还会将 `nlpMappings.json` 中的字段/操作符/单位/时间短语作为自定义词注入（若 `nodejieba` 可用）。

#### 5. 热更新与重启

- `nlpParser.js` 内部对 `nlpMappings.json` 有内存缓存（`MAPPINGS_CACHE`）。更新映射文件后，建议重启后端服务以生效。
- HanLP 连接、调试开关等在 `nlpConfig.json`；修改后也建议重启。

#### 6. 验证与测试

- 方式 A：直接在 Node 中调用函数
```bash
node -e "const {parseNaturalLanguageToFilters}=require('./backend/src/utils/nlpParser');console.log(JSON.stringify(parseNaturalLanguageToFilters('1号臂相关的日志且时间在2024-01-01到2024-02-01之间'),null,2));" | cat
```

- 方式 B：通过控制器接口（`nlpToFilters`）
  - 向已挂载该控制器的路由发起 POST，Body: `{ "text": "..." }`，响应含 `filters` 字段（已做白名单裁剪）。
  - 可使用“高级搜索 → 3. 输入自然语言”在前端操作，点击“解析并应用”，预览条件后再“应用”。

- 方式 C：前端批量分析页（若已接入），输入自然语言后查看后端返回的过滤 AST 与查询结果。

检查点：
- 是否命中模板（`patterns`）并按预期生成 AND/OR 组合
- 字段、操作符是否在控制器白名单内
- `firstof` 语义是否生效（仅首次出现的 (log_id, error_code)）

#### 7. 变更记录（建议）

在本文件底部维护简短 Changelog：

- 2025-08-14
  - 新增文档与流程说明，补充臂2 OR 模板示例、相机相关日志模板示例
  - 提示控制器白名单与 Sequelize 映射同步修改



