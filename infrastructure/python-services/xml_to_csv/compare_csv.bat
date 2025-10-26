@echo off
REM CSV故障码表比较工具 - Windows批处理脚本
REM 使用方法: compare_csv.bat file1.csv file2.csv [-o report.csv]

setlocal enabledelayedexpansion

if "%~1"=="" (
    echo 使用方法: compare_csv.bat file1.csv file2.csv [-o report.csv]
    echo.
    echo 示例:
    echo   compare_csv.bat error_codes_v1.csv error_codes_v2.csv
    echo   compare_csv.bat error_codes_v1.csv error_codes_v2.csv -o differences_report.csv
    echo.
    pause
    exit /b 1
)

if "%~2"=="" (
    echo 错误: 需要指定两个CSV文件进行比较
    echo 使用方法: compare_csv.bat file1.csv file2.csv [-o report.csv]
    pause
    exit /b 1
)

set CSV1_FILE=%~1
set CSV2_FILE=%~2
set REPORT_FILE=
set OUTPUT_FLAG=

REM 检查是否有 -o 参数
if "%~3"=="-o" (
    set OUTPUT_FLAG=-o
    set REPORT_FILE=%~4
) else if not "%~3"=="" (
    REM 如果没有 -o 参数，第三个参数可能是输出文件名（向后兼容）
    set REPORT_FILE=%~3
)

REM 检查输入文件是否存在
if not exist "%CSV1_FILE%" (
    echo 错误: 第一个CSV文件不存在: %CSV1_FILE%
    pause
    exit /b 1
)

if not exist "%CSV2_FILE%" (
    echo 错误: 第二个CSV文件不存在: %CSV2_FILE%
    pause
    exit /b 1
)

echo 开始比较CSV故障码表...
echo 文件1: %CSV1_FILE%
echo 文件2: %CSV2_FILE%
if not "%REPORT_FILE%"=="" (
    echo 报告文件: %REPORT_FILE%
)
echo.

REM 执行Python比较脚本
if "%REPORT_FILE%"=="" (
    python csv_error_codes_comparator.py "%CSV1_FILE%" "%CSV2_FILE%"
) else (
    python csv_error_codes_comparator.py "%CSV1_FILE%" "%CSV2_FILE%" -o "%REPORT_FILE%"
)

if %ERRORLEVEL% equ 0 (
    echo.
    echo ✅ 比较完成!
) else (
    echo.
    echo ❌ 比较失败!
)

echo.
pause
