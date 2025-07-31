# 多语言故障码CSV导入指南

## 文件格式要求

### 1. 文件格式
- 文件类型：CSV文件
- 编码：UTF-8
- 分隔符：逗号 (,)
- 文件大小：不超过2MB

### 2. 列名要求（第一行）
```
subsystem,code,lang,short_message,user_hint,operation
```

### 3. 字段说明

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| subsystem | 文本 | 是 | 子系统号 |
| code | 文本 | 是 | 故障码 |
| lang | 文本 | 是 | 语言代码 |
| short_message | 文本 | 否 | 精简提示信息 |
| user_hint | 文本 | 否 | 用户提示信息 |
| operation | 文本 | 否 | 操作信息 |

### 4. 验证规则

#### 必填字段验证
- `subsystem`、`code`、`lang` 三个字段都是必填的
- 不能为空或只包含空格

#### 内容验证规则
必须满足以下条件之一：
1. `short_message` 和 `user_hint` 至少一个不为空
2. `short_message` 和 `operation` 至少一个不为空

#### 故障码验证
- 导入的 `subsystem` 和 `code` 组合必须在故障码管理页面中已存在
- 如果故障码不存在，需要先在故障码管理中添加

### 5. 语言代码支持

| 语言代码 | 语言名称 |
|----------|----------|
| chinese | 中文 |
| english | 英文 |
| french | 法文 |
| german | 德文 |
| japanese | 日文 |

## 示例文件

### 正确的CSV格式
```csv
subsystem,code,lang,short_message,user_hint,operation
1,0X010A,english,Hardware fault,Check hardware connection,Restart system
1,0X010A,chinese,硬件故障,检查硬件连接,重启系统
1,0X010B,english,Communication error,Check network connection,Retry operation
1,0X010B,chinese,通信错误,检查网络连接,重试操作
2,0X020A,english,Sensor failure,Check sensor status,Replace sensor
2,0X020A,chinese,传感器故障,检查传感器状态,更换传感器
```

### 常见错误示例

#### 错误1：缺少必填字段
```csv
subsystem,code,lang,short_message,user_hint,operation
1,0X010A,,Hardware fault,Check hardware connection,Restart system
```
**错误原因**：`lang` 字段为空

#### 错误2：内容验证失败
```csv
subsystem,code,lang,short_message,user_hint,operation
1,0X010A,english,,,,
```
**错误原因**：`short_message`、`user_hint`、`operation` 全部为空

#### 错误3：故障码不存在
```csv
subsystem,code,lang,short_message,user_hint,operation
99,0X9999,english,Test error,Test hint,Test operation
```
**错误原因**：故障码 `99-0X9999` 在系统中不存在

## 导入步骤

1. **准备CSV文件**
   - 确保文件格式正确
   - 检查编码为UTF-8
   - 验证所有必填字段

2. **检查故障码**
   - 确保要导入的故障码在故障码管理页面中已存在
   - 如果不存在，先添加故障码

3. **上传文件**
   - 点击"批量导入"按钮
   - 选择"CSV文件上传"标签页
   - 选择CSV文件
   - 点击"上传导入"

4. **查看结果**
   - 成功导入的记录会显示成功消息
   - 失败的记录会显示详细错误信息
   - 部分成功时会显示成功和失败的数量

## 故障排除

### 1. 400错误
- 检查CSV文件格式是否正确
- 确认第一行列名是否正确
- 验证必填字段是否都有值

### 2. 故障码不存在错误
- 先在故障码管理页面添加对应的故障码
- 确保subsystem和code组合正确

### 3. 编码问题
- 确保CSV文件是UTF-8编码
- 避免使用Excel直接保存，建议使用文本编辑器

### 4. 内容验证失败
- 确保至少有一个内容字段不为空
- 检查字段值是否只包含空格

## 注意事项

1. **文件大小限制**：CSV文件不能超过2MB
2. **行数限制**：建议单次导入不超过1000行
3. **重复处理**：如果同一故障码的同一语言已存在，会更新现有记录
4. **错误处理**：导入过程中如果部分记录失败，其他记录仍会继续导入
5. **备份建议**：导入前建议备份现有数据 