# XML故障码转换工具使用说明

## 工具概述

这个Python脚本工具用于将XML格式的故障码文件转换为CSV格式，支持与多语言管理导出的XML文件格式一致。工具完全独立运行，无需数据库连接，支持跨平台使用。

## 文件说明

- `xml_to_csv_converter.py` - XML转CSV的主要转换脚本
- `csv_error_codes_comparator.py` - CSV故障码表比较脚本
- `test_xml_converter.py` - XML转换器测试脚本
- `test_csv_comparator.py` - CSV比较器测试脚本
- `convert_xml.bat` - Windows XML转换批处理脚本
- `convert_xml.sh` - Linux/Mac XML转换Shell脚本
- `compare_csv.bat` - Windows CSV比较批处理脚本
- `compare_csv.sh` - Linux/Mac CSV比较Shell脚本
- `XML故障码转换工具使用说明.md` - 本使用说明文档

## 快速开始

### Windows用户

1. **使用批处理脚本（推荐）**：
   ```cmd
   convert_xml.bat input.xml
   convert_xml.bat input.xml output.csv
   ```

2. **直接使用Python脚本**：
   ```cmd
   python xml_to_csv_converter.py input.xml
   python xml_to_csv_converter.py input.xml -o output.csv
   ```

### Linux/Mac用户

1. **使用Shell脚本**：
   ```bash
   ./convert_xml.sh input.xml
   ./convert_xml.sh input.xml output.csv
   ```

2. **直接使用Python脚本**：
   ```bash
   python3 xml_to_csv_converter.py input.xml
   python3 xml_to_csv_converter.py input.xml -o output.csv
   ```

## 测试工具

### XML转换器测试
运行测试脚本验证XML转换功能：

```bash
python test_xml_converter.py
```

### CSV比较器测试
运行测试脚本验证CSV比较功能：

```bash
python test_csv_comparator.py
```

## CSV故障码表比较工具

### 功能说明
比较两个CSV格式的故障码表，以`subsystem+code`作为唯一故障编码，比较以下字段：
- `subsystem` - 子系统
- `code` - 故障码
- `short_message` - 精简提示信息
- `user_hint` - 用户提示信息
- `operation` - 操作信息

### 使用方法

#### Windows用户
```cmd
# 基本比较
compare_csv.bat file1.csv file2.csv

# 生成差异报告
compare_csv.bat file1.csv file2.csv differences_report.csv

# 直接使用Python脚本
python csv_error_codes_comparator.py file1.csv file2.csv
python csv_error_codes_comparator.py file1.csv file2.csv -o report.csv
```

#### Linux/Mac用户
```bash
# 基本比较
./compare_csv.sh file1.csv file2.csv

# 生成差异报告
./compare_csv.sh file1.csv file2.csv differences_report.csv

# 直接使用Python脚本
python3 csv_error_codes_comparator.py file1.csv file2.csv
python3 csv_error_codes_comparator.py file1.csv file2.csv -o report.csv
```

### 比较结果说明
- ✅ **完全一致**: 所有比较字段都相同
- ❌ **存在差异**: 部分字段有差异，会显示具体差异内容
- 📄 **仅在文件1中**: 某个故障编码只在第一个文件中存在
- 📄 **仅在文件2中**: 某个故障编码只在第二个文件中存在
- 📊 **一致性百分比**: 显示两个文件的一致性程度

## 支持的XML格式

工具支持以下XML结构（与多语言管理导出的格式一致）：

```xml
<?xml version='1.0' encoding='utf-8'?>
<Medbot>
    <prefix>
        <!-- 前缀信息 -->
    </prefix>
    <instance>
        <subsystem id="1">
            <error_code id="0X010A">
                <axis>True</axis>
                <description>故障描述</description>
                <simple>精简提示</simple>
                <userInfo>用户提示</userInfo>
                <opinfo>操作信息</opinfo>
                <isArm>False</isArm>
                <detInfo>详细信息</detInfo>
                <method>检测方法</method>
                <para1>参数1</para1>
                <para2>参数2</para2>
                <para3>参数3</para3>
                <para4>参数4</para4>
                <expert>1.0</expert>
                <learner>1.0</learner>
                <log>0.0</log>
                <action>recoverable</action>
            </error_code>
        </subsystem>
    </instance>
</Medbot>
```

## 输出CSV字段

转换后的CSV文件包含23个字段，与故障码表字段完全一致：

| 序号 | 字段名 | 说明 | 来源 |
|------|--------|------|------|
| 1 | id | 故障码ID | 导入时为空 |
| 2 | subsystem | 子系统 | XML subsystem id转换 |
| 3 | code | 故障码 | XML error_code id |
| 4 | is_axis_error | 是否轴错误 | XML axis字段 |
| 5 | is_arm_error | 是否臂错误 | XML isArm字段 |
| 6 | short_message | 精简提示信息 | XML simple字段 |
| 7 | user_hint | 用户提示信息 | XML userInfo字段 |
| 8 | operation | 操作信息 | XML opinfo字段 |
| 9 | detail | 详细信息 | XML description字段 |
| 10 | method | 检测方法 | XML method字段 |
| 11 | param1 | 参数1 | XML para1字段 |
| 12 | param2 | 参数2 | XML para2字段 |
| 13 | param3 | 参数3 | XML para3字段 |
| 14 | param4 | 参数4 | XML para4字段 |
| 15 | solution | 处理措施 | XML action字段转换 |
| 16 | for_expert | 专家模式 | XML expert字段 |
| 17 | for_novice | 初学者模式 | XML learner字段 |
| 18 | related_log | 相关日志 | XML log字段 |
| 19 | stop_report | 停止报告 | 置空 |
| 20 | level | 故障等级 | 根据故障码自动分析 |
| 21 | tech_solution | 技术排查方案 | 置空 |
| 22 | explanation | 解释 | 置空 |
| 23 | category | 故障分类 | 根据故障码自动分析 |

## 子系统映射规则

XML中的subsystem id会自动映射到数据库值：

| XML ID | 数据库值 | 子系统名称 |
|--------|----------|------------|
| 1 | 1 | 01：运动控制软件 |
| 2 | 2 | 02：人机交互软件 |
| 3 | 3 | 03：医生控制台软件 |
| 4 | 4 | 04：手术台车软件 |
| 5 | 5 | 05：驱动器软件 |
| 6 | 6 | 06：图像软件 |
| 7 | 7 | 07：工具工厂软件 |
| 8 | 8 | 08：远程运动控制软件 |
| 9 | 9 | 09：远程医生控制台软件 |
| 10 | A | 0A：远程驱动器软件 |

## 故障等级自动分析

脚本会根据故障码末尾字母自动分析故障等级：

- **A** → 高级
- **B** → 中级  
- **C** → 低级
- **D/E** → 无

## 处理措施转换

XML中的action字段会转换为标准处理措施：

- `recoverable` → `recoverable`
- `ignorable` → `ignorable`
- `log` → `log`
- 其他 → `tips`

## 文件路径支持

**XML文件不需要放在同目录下！** 工具支持多种路径方式：

### 支持的路径类型

1. **绝对路径**：
   ```bash
   python xml_to_csv_converter.py "D:\data\FaultAnalysis_zh.xml"
   python xml_to_csv_converter.py "C:\Users\Documents\error_codes.xml"
   ```

2. **相对路径**：
   ```bash
   # 上级目录
   python xml_to_csv_converter.py "../data/FaultAnalysis_zh.xml"
   
   # 子目录
   python xml_to_csv_converter.py "data/FaultAnalysis_zh.xml"
   
   # 其他目录
   python xml_to_csv_converter.py "../../xml_files/error_codes.xml"
   ```

3. **当前目录**：
   ```bash
   # 如果XML文件在脚本同目录
   python xml_to_csv_converter.py "FaultAnalysis_zh.xml"
   ```

### 路径处理特性

- ✅ **自动路径解析**：脚本会自动处理绝对路径和相对路径
- ✅ **路径验证**：会检查文件是否存在，给出清晰的错误提示
- ✅ **输出目录创建**：如果输出目录不存在，会自动创建
- ✅ **跨平台支持**：Windows和Linux/Mac路径都支持

## 使用示例

### 基本转换
```bash
# 转换XML文件，自动生成CSV文件名
python xml_to_csv_converter.py FaultAnalysis_zh.xml

# 指定输出文件名
python xml_to_csv_converter.py FaultAnalysis_zh.xml -o error_codes_import.csv
```

### 显示详细信息
```bash
python xml_to_csv_converter.py FaultAnalysis_zh.xml -v -o error_codes_import.csv
```

### 批处理转换
```bash
# Windows
convert_xml.bat FaultAnalysis_zh.xml error_codes.csv

# Linux/Mac
./convert_xml.sh FaultAnalysis_zh.xml error_codes.csv
```

### 跨目录转换示例
```bash
# 转换不同位置的XML文件
python xml_to_csv_converter.py "D:\data\FaultAnalysis_zh.xml"
python xml_to_csv_converter.py "../data/error_codes.xml"
python xml_to_csv_converter.py "C:\Users\Documents\fault_data.xml" -o "output.csv"

# 使用批处理脚本（Windows）
convert_xml.bat "D:\data\FaultAnalysis_zh.xml"
convert_xml.bat "D:\data\FaultAnalysis_zh.xml" "D:\output\result.csv"
```

## 安装依赖

工具使用Python标准库，无需安装额外依赖：

```bash
# 不需要安装任何第三方库
# xml.etree.ElementTree, csv, sys, os, argparse, datetime 都是标准库
```

## 注意事项

1. **文件编码**：确保XML文件使用UTF-8编码
2. **文件格式**：XML文件必须符合Medbot标准格式
3. **输出编码**：CSV文件使用UTF-8编码，带BOM，兼容Excel
4. **空字段处理**：XML中缺失的字段在CSV中显示为空字符串
5. **布尔值转换**：XML中的布尔值会正确转换为True/False
6. **ID字段**：转换后的ID字段为空，需要数据库自动生成
7. **独立运行**：工具完全独立，无需数据库连接

## 错误处理

工具包含完善的错误处理机制：

- ✅ XML格式错误会显示具体错误信息
- ✅ 文件不存在会提示正确的文件路径
- ✅ 转换失败会显示详细的错误信息
- ✅ 成功转换会显示处理的记录数量
- ✅ 路径错误会给出清晰的提示信息

## 技术特性

### 完全独立
- 使用Python标准库，无需额外依赖
- 不连接任何数据库
- 不依赖网络连接
- 纯文件转换工具

### 智能转换
- 自动子系统映射
- 智能故障等级分析
- 处理措施自动转换
- 布尔值智能识别

### 跨平台支持
- Windows: 批处理脚本 + Python
- Linux/Mac: Shell脚本 + Python
- 路径自动处理
- 编码兼容性

## 技术支持

如果遇到问题，请检查：

1. Python环境是否正确安装
2. XML文件格式是否符合要求
3. 文件路径是否正确
4. 文件权限是否足够
5. 文件编码是否为UTF-8

## 最佳实践

1. **XML文件可以放在任何位置**：
   - 桌面：`C:\Users\用户名\Desktop\FaultAnalysis_zh.xml`
   - 文档：`C:\Users\用户名\Documents\error_codes.xml`
   - 项目目录：`D:\code\Log\v0.1.1\logtool\data\fault_data.xml`

2. **输出文件也可以指定任何位置**：
   ```bash
   python xml_to_csv_converter.py "input.xml" -o "D:\output\result.csv"
   ```

3. **使用引号处理空格路径**：
   ```bash
   python xml_to_csv_converter.py "C:\My Documents\Fault Analysis.xml"
   ```

4. **批量转换建议**：
   - 使用批处理脚本提高效率
   - 为输出文件添加时间戳
   - 定期备份转换结果
