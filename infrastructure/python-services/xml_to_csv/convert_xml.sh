#!/bin/bash
# XML故障码转换工具 - Linux/Mac Shell脚本
# 使用方法: ./convert_xml.sh input.xml [output.csv]

# 检查参数
if [ $# -eq 0 ]; then
    echo "使用方法: $0 input.xml [output.csv]"
    echo ""
    echo "示例:"
    echo "  $0 FaultAnalysis_zh.xml"
    echo "  $0 FaultAnalysis_zh.xml error_codes.csv"
    echo ""
    exit 1
fi

INPUT_FILE="$1"
OUTPUT_FILE="$2"

# 检查输入文件是否存在
if [ ! -f "$INPUT_FILE" ]; then
    echo "错误: 输入文件不存在: $INPUT_FILE"
    exit 1
fi

# 如果没有指定输出文件，生成默认文件名
if [ -z "$OUTPUT_FILE" ]; then
    BASENAME=$(basename "$INPUT_FILE" .xml)
    OUTPUT_FILE="${BASENAME}_converted.csv"
fi

echo "开始转换XML文件..."
echo "输入文件: $INPUT_FILE"
echo "输出文件: $OUTPUT_FILE"
echo ""

# 执行Python转换脚本
python3 xml_to_csv_converter.py "$INPUT_FILE" -o "$OUTPUT_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 转换完成!"
    echo "📁 输出文件: $OUTPUT_FILE"
else
    echo ""
    echo "❌ 转换失败!"
    exit 1
fi
