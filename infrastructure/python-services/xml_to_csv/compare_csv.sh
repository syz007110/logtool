#!/bin/bash
# CSV故障码表比较工具 - Linux/Mac Shell脚本
# 使用方法: ./compare_csv.sh file1.csv file2.csv [report.csv]

# 检查参数
if [ $# -lt 2 ]; then
    echo "使用方法: $0 file1.csv file2.csv [report.csv]"
    echo ""
    echo "示例:"
    echo "  $0 error_codes_v1.csv error_codes_v2.csv"
    echo "  $0 error_codes_v1.csv error_codes_v2.csv differences_report.csv"
    echo ""
    exit 1
fi

CSV1_FILE="$1"
CSV2_FILE="$2"
REPORT_FILE="$3"

# 检查输入文件是否存在
if [ ! -f "$CSV1_FILE" ]; then
    echo "错误: 第一个CSV文件不存在: $CSV1_FILE"
    exit 1
fi

if [ ! -f "$CSV2_FILE" ]; then
    echo "错误: 第二个CSV文件不存在: $CSV2_FILE"
    exit 1
fi

echo "开始比较CSV故障码表..."
echo "文件1: $CSV1_FILE"
echo "文件2: $CSV2_FILE"
if [ -n "$REPORT_FILE" ]; then
    echo "报告文件: $REPORT_FILE"
fi
echo ""

# 执行Python比较脚本
if [ -z "$REPORT_FILE" ]; then
    python3 csv_error_codes_comparator.py "$CSV1_FILE" "$CSV2_FILE"
else
    python3 csv_error_codes_comparator.py "$CSV1_FILE" "$CSV2_FILE" -o "$REPORT_FILE"
fi

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 比较完成!"
else
    echo ""
    echo "❌ 比较失败!"
    exit 1
fi
